"""
Unit tests for the pure transform module -- no DB, no HTTP. FieldMapping
rows are constructed in-memory to mirror what's actually seeded in
database/changelog/changes/009-seed-oracle-contract-pipeline.xml, so these
tests catch regressions in the Python port independent of DB state.
"""
import pytest

from erp_transform.db import FieldMapping
from erp_transform.transform import apply_field_transform, transform_payload


def _fm(**overrides):
    defaults = dict(
        mapping_pk=0,
        step_pk=0,
        source_path="",
        target_path="",
        transform_type="none",
        transform_params=None,
        default_value=None,
        is_required=False,
        sort_order=0,
        array_source_path="",
        array_target_path="",
        is_singleton_array=False,
    )
    defaults.update(overrides)
    return FieldMapping(**defaults)


class TestApplyFieldTransform:
    def test_none_passthrough(self):
        assert apply_field_transform("x", "none", None) == "x"

    def test_uppercase(self):
        assert apply_field_transform("abc", "uppercase", None) == "ABC"

    def test_lowercase(self):
        assert apply_field_transform("ABC", "lowercase", None) == "abc"

    def test_date_format(self):
        params = '{"inputFormat":"yyyy-MM-dd","outputFormat":"MM-dd-yyyy"}'
        assert apply_field_transform("2026-03-20", "date_format", params) == "03-20-2026"

    def test_date_format_default_is_identity(self):
        assert apply_field_transform("2026-03-20", "date_format", None) == "2026-03-20"

    def test_date_format_bad_input_falls_through(self):
        params = '{"inputFormat":"yyyy-MM-dd","outputFormat":"MM-dd-yyyy"}'
        assert apply_field_transform("not-a-date", "date_format", params) == "not-a-date"

    def test_null_value_passthrough(self):
        assert apply_field_transform(None, "uppercase", None) is None

    def test_unimplemented_transform_falls_through(self):
        assert apply_field_transform("x", "lookup", None) == "x"

    def test_unknown_transform_type_raises(self):
        with pytest.raises(ValueError, match="Unsupported transform_type"):
            apply_field_transform("x", "SPLIT", None)

    def test_titlecase(self):
        assert apply_field_transform("us army", "titlecase", None) == "Us Army"

    def test_trim(self):
        assert apply_field_transform("  x  ", "trim", None) == "x"

    def test_round(self):
        params = '{"decimals":2}'
        assert apply_field_transform(3.14159, "round", params) == 3.14

    def test_round_default_zero_decimals(self):
        assert apply_field_transform(3.7, "round", None) == 4

    def test_type_cast_int(self):
        params = '{"targetType":"int"}'
        assert apply_field_transform("42", "type_cast", params) == 42

    def test_type_cast_bool(self):
        params = '{"targetType":"bool"}'
        assert apply_field_transform("true", "type_cast", params) is True

    def test_type_cast_unknown_target_raises(self):
        params = '{"targetType":"date"}'
        with pytest.raises(ValueError, match="Unsupported type_cast targetType"):
            apply_field_transform("x", "type_cast", params)

    def test_replace_literal(self):
        params = '{"find":"-","replace":"/"}'
        assert apply_field_transform("2026-03-20", "replace", params) == "2026/03/20"

    def test_replace_regex(self):
        params = '{"find":"[0-9]+","replace":"#","regex":true}'
        assert apply_field_transform("ITEM-123", "replace", params) == "ITEM-#"

    def test_split_pick(self):
        params = '{"delimiter":"-","index":1}'
        assert apply_field_transform("ITEM-123-A", "split_pick", params) == "123"

    def test_split_pick_out_of_range_returns_none(self):
        params = '{"delimiter":"-","index":5}'
        assert apply_field_transform("ITEM-123", "split_pick", params) is None

    def test_date_add_days(self):
        params = '{"unit":"days","amount":5,"inputFormat":"yyyy-MM-dd","outputFormat":"yyyy-MM-dd"}'
        assert apply_field_transform("2026-03-20", "date_add", params) == "2026-03-25"

    def test_date_add_months(self):
        params = '{"unit":"months","amount":1,"inputFormat":"yyyy-MM-dd","outputFormat":"yyyy-MM-dd"}'
        assert apply_field_transform("2026-01-31", "date_add", params) == "2026-02-28"

    def test_date_add_years(self):
        params = '{"unit":"years","amount":1,"inputFormat":"yyyy-MM-dd","outputFormat":"yyyy-MM-dd"}'
        assert apply_field_transform("2026-03-20", "date_add", params) == "2027-03-20"


class TestTransformPayloadFlat:
    def test_flat_scalar_mapping(self):
        mappings = [_fm(source_path="name", target_path="ContractName", sort_order=1)]
        result = transform_payload({"name": "Acme"}, mappings)
        assert result == {"ContractName": "Acme"}

    def test_missing_source_uses_default(self):
        mappings = [_fm(source_path="missing", target_path="X", default_value="fallback")]
        result = transform_payload({}, mappings)
        assert result == {"X": "fallback"}

    def test_missing_source_no_default_is_none(self):
        mappings = [_fm(source_path="missing", target_path="X")]
        result = transform_payload({}, mappings)
        assert result == {"X": None}

    def test_literal_value(self):
        mappings = [_fm(source_path="__literal.Fixed", target_path="Flag")]
        result = transform_payload({}, mappings)
        assert result == {"Flag": "Fixed"}

    def test_transform_applied(self):
        mappings = [
            _fm(
                source_path="startDate",
                target_path="StartDate",
                transform_type="date_format",
                transform_params='{"inputFormat":"yyyy-MM-dd","outputFormat":"MM-dd-yyyy"}',
            )
        ]
        result = transform_payload({"startDate": "2026-03-20"}, mappings)
        assert result == {"StartDate": "03-20-2026"}


class TestTransformPayloadSingletonArray:
    def test_singleton_object_wrapped_in_array(self):
        mappings = [
            _fm(
                array_source_path="headerAttributes",
                array_target_path="ContractHeaderFlexfieldVA",
                is_singleton_array=True,
                source_path="sfQuoteNumber",
                target_path="sfQuoteNumber",
                sort_order=1,
            )
        ]
        source = {"headerAttributes": {"sfQuoteNumber": "Q-1"}}
        result = transform_payload(source, mappings)
        assert result == {"ContractHeaderFlexfieldVA": [{"sfQuoteNumber": "Q-1"}]}


class TestTransformPayloadRepeatingArray:
    def test_repeating_array_one_element_per_source_item(self):
        mappings = [
            _fm(
                array_source_path="parties",
                array_target_path="ContractParty",
                source_path="partyName",
                target_path="PartyName",
                sort_order=1,
            )
        ]
        source = {"parties": [{"partyName": "A"}, {"partyName": "B"}]}
        result = transform_payload(source, mappings)
        assert result == {"ContractParty": [{"PartyName": "A"}, {"PartyName": "B"}]}

    def test_empty_source_array_yields_empty_target_array(self):
        mappings = [
            _fm(
                array_source_path="parties",
                array_target_path="ContractParty",
                source_path="partyName",
                target_path="PartyName",
            )
        ]
        result = transform_payload({"parties": []}, mappings)
        assert result == {"ContractParty": []}

    def test_nested_singleton_within_repeating_item(self):
        mappings = [
            _fm(
                array_source_path="lines",
                array_target_path="ContractLine",
                source_path="itemName",
                target_path="ItemName",
                sort_order=1,
            ),
            _fm(
                array_source_path="lines[].lineAttributes",
                array_target_path="ContractLine.ContractAllLineDesFlexVA",
                is_singleton_array=True,
                source_path="fob",
                target_path="fob",
                sort_order=1,
            ),
        ]
        source = {
            "lines": [
                {"itemName": "ITEM-1", "lineAttributes": {"fob": "FOB ORIGIN"}},
            ]
        }
        result = transform_payload(source, mappings)
        assert result == {
            "ContractLine": [
                {
                    "ItemName": "ITEM-1",
                    "ContractAllLineDesFlexVA": [{"fob": "FOB ORIGIN"}],
                }
            ]
        }


class TestTransformPayloadFullOracleShape:
    def test_matches_reference_output_shape(self):
        """Same grouping as the seeded Oracle contract pipeline (step_pk=3),
        trimmed to a couple of fields per group to keep the test focused."""
        mappings = [
            _fm(source_path="orgId", target_path="OrgId", sort_order=1),
            _fm(
                array_source_path="headerAttributes",
                array_target_path="ContractHeaderFlexfieldVA",
                is_singleton_array=True,
                source_path="__literal.Sell Type Contract",
                target_path="__FLEX_Context",
                sort_order=1,
            ),
            _fm(
                array_source_path="parties",
                array_target_path="ContractParty",
                source_path="partyName",
                target_path="PartyName",
                sort_order=1,
            ),
            _fm(
                array_source_path="lines",
                array_target_path="ContractLine",
                source_path="itemName",
                target_path="ItemName",
                sort_order=1,
            ),
            _fm(
                array_source_path="lines[].lineAttributes",
                array_target_path="ContractLine.ContractAllLineDesFlexVA",
                is_singleton_array=True,
                source_path="fob",
                target_path="fob",
                sort_order=1,
            ),
        ]
        source = {
            "orgId": 123,
            "headerAttributes": {},
            "parties": [{"partyName": "US ARMY"}],
            "lines": [{"itemName": "ITEM-1", "lineAttributes": {"fob": "FOB ORIGIN"}}],
        }
        result = transform_payload(source, mappings)
        assert result["OrgId"] == 123
        assert result["ContractHeaderFlexfieldVA"] == [{"__FLEX_Context": "Sell Type Contract"}]
        assert result["ContractParty"] == [{"PartyName": "US ARMY"}]
        assert result["ContractLine"] == [
            {"ItemName": "ITEM-1", "ContractAllLineDesFlexVA": [{"fob": "FOB ORIGIN"}]}
        ]
