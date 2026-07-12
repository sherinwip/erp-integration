"""Applies a step's `extract` config (a dict of var_name -> JSONPath
expression) to that step's HTTP response body. Every rule must resolve to
exactly one value -- an unmatched path is treated as a hard failure since
later steps in the pipeline are assumed to depend on the extracted value
(e.g. no access_token means the next call's auth will fail anyway), so
failing here beats a confusing downstream error."""
from __future__ import annotations

from typing import Any

from jsonpath_ng.ext import parse as parse_jsonpath


class ExtractionError(RuntimeError):
    pass


def apply_extract_rules(response_body: Any, rules: dict[str, str]) -> dict[str, Any]:
    if not rules:
        return {}

    if not isinstance(response_body, dict):
        raise ExtractionError(
            f"cannot apply extract rules {list(rules)!r}: response body is "
            f"not a JSON object (got {type(response_body).__name__})"
        )

    result: dict[str, Any] = {}
    for var_name, jsonpath_expr in rules.items():
        matches = parse_jsonpath(jsonpath_expr).find(response_body)
        if not matches:
            raise ExtractionError(
                f"extract rule {var_name!r} ({jsonpath_expr!r}) matched "
                f"nothing in the response body"
            )
        result[var_name] = matches[0].value
    return result
