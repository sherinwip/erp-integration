"""Tests for erp_transform.extract — applying a step's JSONPath extraction
rules to its HTTP response body."""
import pytest

from erp_transform.extract import ExtractionError, apply_extract_rules


def test_single_top_level_match():
    body = {"access_token": "abc123", "token_type": "Bearer"}
    rules = {"access_token": "$.access_token"}
    assert apply_extract_rules(body, rules) == {"access_token": "abc123"}


def test_multiple_rules_in_one_call():
    body = {"access_token": "abc123", "expires_in": 3600}
    rules = {"access_token": "$.access_token", "expires_in": "$.expires_in"}
    assert apply_extract_rules(body, rules) == {
        "access_token": "abc123",
        "expires_in": 3600,
    }


def test_nested_path_match():
    body = {"data": {"token": {"value": "nested-token"}}}
    rules = {"token": "$.data.token.value"}
    assert apply_extract_rules(body, rules) == {"token": "nested-token"}


def test_array_index_match():
    body = {"items": [{"id": "first"}, {"id": "second"}]}
    rules = {"first_id": "$.items[0].id"}
    assert apply_extract_rules(body, rules) == {"first_id": "first"}


def test_no_match_raises_extraction_error():
    body = {"token_type": "Bearer"}
    rules = {"access_token": "$.access_token"}
    with pytest.raises(ExtractionError, match="access_token"):
        apply_extract_rules(body, rules)


def test_non_dict_response_body_raises_extraction_error():
    body = "plain text response, not JSON"
    rules = {"access_token": "$.access_token"}
    with pytest.raises(ExtractionError, match="not a JSON object"):
        apply_extract_rules(body, rules)


def test_empty_rules_returns_empty_dict():
    body = {"access_token": "abc123"}
    assert apply_extract_rules(body, {}) == {}
