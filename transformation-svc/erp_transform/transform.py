"""
Transform stage: applies a step's field_mapping rows to a source JSON payload,
producing the target (ERP) JSON body. Pure function -- no DB, no HTTP -- so it
can run identically in a local script, a unit test, or a Step Functions task.

Ported from the Postgres transform_payload()/apply_field_transform() functions
(database/changelog/changes/010 and 011) so the same mapping rows drive both;
this module is the one meant to keep evolving (more transform_type values,
literal/lookup support) since editing SQL is slower to iterate on than Python.

Row shapes (see FieldMapping.array_source_path/array_target_path):
  1. Flat scalar: array_target_path == "" -> field written on the result root.
  2. Singleton array: is_singleton_array=True, is_object_target=False -> one
     source object wrapped into a 1-element target array (e.g. headerAttributes
     -> ContractHeaderFlexfieldVA[0]).
  2b. Singleton object: is_singleton_array=True, is_object_target=True -> same
     grouping/build as #2, but written unwrapped as a plain nested object
     instead of a 1-element array (e.g. headerAttributes -> DemoContactInfo,
     not DemoContactInfo[0]).
  3. Repeating array: source is a real array -> one target array element per
     source item (e.g. parties[] -> ContractParty[], lines[] -> ContractLine[]).
  Nested singleton-within-repeating (line-level flexfield) is handled inside
  the repeating-array branch, keyed on array_target_path containing a dot
  (e.g. "ContractLine.ContractAllLineDesFlexVA").
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any, Optional

from .db import FieldMapping

_LITERAL_PREFIX = "__literal."

# Closed set of supported transform_type values -- keep in sync with
# erp-config-api/app/schemas/field_mapping.py's TransformType Literal.
SUPPORTED_TRANSFORM_TYPES = {
    "none", "type_cast", "date_format", "date_add", "split_pick", "replace",
    "trim", "round", "uppercase", "lowercase", "titlecase", "lookup", "calculate",
}


def _get_path(source: Optional[dict], path: str) -> Any:
    """Dot-notation lookup, e.g. 'a.b.c'. Returns None if any segment is missing."""
    if source is None:
        return None
    node: Any = source
    for segment in path.split("."):
        if not isinstance(node, dict) or segment not in node:
            return None
        node = node[segment]
    return node


# Java-style date tokens (as used in the existing field_mapping.transform_params
# rows, e.g. "yyyy-MM-dd") mapped to Python strptime/strftime directives.
_DATE_TOKEN_MAP = [
    ("yyyy", "%Y"),
    ("MM", "%m"),
    ("dd", "%d"),
]


def _java_date_format_to_strftime(fmt: str) -> str:
    result = fmt
    for token, directive in _DATE_TOKEN_MAP:
        result = result.replace(token, directive)
    return result


_TYPE_CAST_CONVERTERS = {
    "int": int,
    "float": float,
    "bool": lambda v: str(v).strip().lower() in ("true", "1", "yes"),
    "string": str,
}


def apply_field_transform(value: Any, transform_type: str, transform_params: Optional[str]) -> Any:
    """Mirrors apply_field_transform() in changeset 011, extended in Python
    where iterating is cheaper than editing PL/pgSQL.

    Raises ValueError for a transform_type outside SUPPORTED_TRANSFORM_TYPES --
    a bad value should fail the pipeline run loudly rather than silently ship
    an untransformed field."""
    if transform_type not in SUPPORTED_TRANSFORM_TYPES:
        raise ValueError(f"Unsupported transform_type: {transform_type!r}")

    if value is None:
        return value
    if transform_type == "none":
        return value

    params = json.loads(transform_params) if transform_params else {}

    if transform_type == "uppercase":
        return str(value).upper()

    if transform_type == "lowercase":
        return str(value).lower()

    if transform_type == "titlecase":
        return str(value).title()

    if transform_type == "trim":
        return str(value).strip()

    if transform_type == "round":
        decimals = params.get("decimals", 0)
        return round(float(value), decimals)

    if transform_type == "type_cast":
        target_type = params.get("targetType", "string")
        converter = _TYPE_CAST_CONVERTERS.get(target_type)
        if converter is None:
            raise ValueError(f"Unsupported type_cast targetType: {target_type!r}")
        return converter(value)

    if transform_type == "replace":
        find, repl = params.get("find", ""), params.get("replace", "")
        if params.get("regex"):
            return re.sub(find, repl, str(value))
        return str(value).replace(find, repl)

    if transform_type == "split_pick":
        delimiter = params.get("delimiter", ",")
        index = params.get("index", 0)
        parts = str(value).split(delimiter)
        try:
            return parts[index]
        except IndexError:
            return None

    if transform_type == "date_format":
        if not isinstance(value, str) or not value:
            return value
        input_format = _java_date_format_to_strftime(params.get("inputFormat", "yyyy-MM-dd"))
        output_format = _java_date_format_to_strftime(params.get("outputFormat", "yyyy-MM-dd"))
        try:
            parsed = datetime.strptime(value, input_format)
        except ValueError:
            return value
        return parsed.strftime(output_format)

    if transform_type == "date_add":
        if not isinstance(value, str) or not value:
            return value
        input_format = _java_date_format_to_strftime(params.get("inputFormat", "yyyy-MM-dd"))
        output_format = _java_date_format_to_strftime(params.get("outputFormat", params.get("inputFormat", "yyyy-MM-dd")))
        unit = params.get("unit", "days")
        amount = params.get("amount", 0)
        try:
            parsed = datetime.strptime(value, input_format)
        except ValueError:
            return value
        if unit == "days":
            parsed = parsed + timedelta(days=amount)
        elif unit == "months":
            month_index = parsed.month - 1 + amount
            year = parsed.year + month_index // 12
            month = month_index % 12 + 1
            day = min(parsed.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                                    31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
            parsed = parsed.replace(year=year, month=month, day=day)
        elif unit == "years":
            try:
                parsed = parsed.replace(year=parsed.year + amount)
            except ValueError:
                parsed = parsed.replace(year=parsed.year + amount, day=28)
        else:
            raise ValueError(f"Unsupported date_add unit: {unit!r}")
        return parsed.strftime(output_format)

    # 'lookup' and 'calculate' are supported transform_types but not yet
    # implemented (no lookup-table storage, no expression evaluator) --
    # fall through to the raw value rather than erroring.
    return value


def _resolve_value(
    scope: Optional[dict],
    mapping: FieldMapping,
) -> Any:
    if mapping.source_path.startswith(_LITERAL_PREFIX):
        return mapping.source_path[len(_LITERAL_PREFIX):]

    raw = _get_path(scope, mapping.source_path)
    if raw is None:
        return mapping.default_value
    return apply_field_transform(raw, mapping.transform_type, mapping.transform_params)


def _set_path(target: dict, path: str, value: Any) -> None:
    """Single-segment set (target_path values used here are always a single
    key relative to their scope, per the current field_mapping convention)."""
    target[path] = value


def _child_array_key(array_source_path: str) -> str:
    """'lines[].lineAttributes' -> 'lineAttributes' (the key on one source item)."""
    match = re.match(r"^.*\[\]\.(.*)$", array_source_path)
    if not match:
        raise ValueError(f"expected a '[].' marker in array_source_path: {array_source_path!r}")
    return match.group(1)


def _target_array_leaf(array_target_path: str) -> str:
    """'ContractLine.ContractAllLineDesFlexVA' -> 'ContractAllLineDesFlexVA'."""
    return array_target_path.rsplit(".", 1)[-1]


def transform_payload(source: dict, mappings: list[FieldMapping]) -> dict:
    result: dict = {}

    flat = [m for m in mappings if m.array_target_path == ""]
    array_groups = [m for m in mappings if m.array_target_path != ""]

    # Pass 1: flat scalar fields.
    for m in sorted(flat, key=lambda x: x.sort_order):
        _set_path(result, m.target_path, _resolve_value(source, m))

    # Group remaining rows by their (array_source_path, array_target_path),
    # preserving first-seen order.
    top_level_groups: dict[tuple[str, str], list[FieldMapping]] = {}
    for m in array_groups:
        # Nested groups (dotted array_target_path, e.g. "ContractLine.ContractAllLineDesFlexVA")
        # are only processed inside their parent's repeating-array loop below.
        if "." in m.array_target_path:
            continue
        key = (m.array_source_path, m.array_target_path)
        top_level_groups.setdefault(key, []).append(m)

    for (array_source_path, array_target_path), group_mappings in top_level_groups.items():
        group_mappings = sorted(group_mappings, key=lambda x: x.sort_order)
        is_singleton = group_mappings[0].is_singleton_array

        if is_singleton:
            scope = _get_path(source, array_source_path)
            built = {}
            for m in group_mappings:
                _set_path(built, m.target_path, _resolve_value(scope, m))
            is_object_target = group_mappings[0].is_object_target
            result[array_target_path] = built if is_object_target else [built]
            continue

        # Repeating array.
        items = _get_path(source, array_source_path)
        built_items = []
        if isinstance(items, list):
            nested_key_prefix = array_target_path + "."
            nested_groups = [
                m for m in array_groups if m.array_target_path.startswith(nested_key_prefix)
            ]
            nested_by_target: dict[str, list[FieldMapping]] = {}
            for m in nested_groups:
                nested_by_target.setdefault(m.array_target_path, []).append(m)

            for item in items:
                built_item: dict = {}
                for m in group_mappings:
                    _set_path(built_item, m.target_path, _resolve_value(item, m))

                for nested_target_path, nested_mappings in nested_by_target.items():
                    nested_mappings = sorted(nested_mappings, key=lambda x: x.sort_order)
                    child_key = _child_array_key(nested_mappings[0].array_source_path)
                    child_scope = _get_path(item, child_key) if isinstance(item, dict) else None
                    built_nested = {}
                    for nm in nested_mappings:
                        _set_path(built_nested, nm.target_path, _resolve_value(child_scope, nm))
                    built_item[_target_array_leaf(nested_target_path)] = [built_nested]

                built_items.append(built_item)

        result[array_target_path] = built_items

    return result
