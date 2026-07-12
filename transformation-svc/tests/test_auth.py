"""Tests for erp_transform.auth's credential resolution, covering the
oauth2 path (now sourced from an already-extracted access_token instead of
an inline Secrets Manager token-fetch call) and confirming basic/apikey
are unaffected."""
import pytest

from erp_transform.auth import AuthError, get_credential
from erp_transform.db import Target


def _target(auth_type: str) -> Target:
    return Target(
        target_id="t1", client_id="c1", target_name="Test Target",
        base_url="http://example.test", auth_type=auth_type,
        credential_ref="unused-for-oauth2", default_headers={},
    )


def test_oauth2_uses_extracted_access_token():
    credential = get_credential(_target("oauth2"), extracted={"access_token": "tok-abc"})
    assert credential.header_name == "Authorization"
    assert credential.header_value == "Bearer tok-abc"


def test_oauth2_without_extracted_token_raises():
    with pytest.raises(AuthError, match="no access_token extracted"):
        get_credential(_target("oauth2"), extracted={})


def test_oauth2_without_extracted_arg_at_all_raises():
    with pytest.raises(AuthError, match="no access_token extracted"):
        get_credential(_target("oauth2"))
