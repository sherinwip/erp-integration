"""
Auth stage: resolves a bearer token (or other credential) for a target,
based on its auth_type. Generic dispatch by auth_type string so adding a new
auth mechanism later is one new branch/function, not a rewrite.

Secrets are never read from field_mapping/target config directly --
credential_ref is a lookup key into a secrets provider (env vars locally,
AWS Secrets Manager/SSM in production). This module never logs a resolved
secret value.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import requests

from .config import get_http_timeout_seconds
from .db import Target


class AuthError(RuntimeError):
    pass


@dataclass(frozen=True)
class Credential:
    """Resolved credential material for a target. header_name/header_value
    are the exact header to attach to the outbound request, e.g.
    ("Authorization", "Bearer <token>") or ("X-API-Key", "<key>")."""
    header_name: str
    header_value: str


def _get_secret(credential_ref: str) -> dict:
    """
    Resolves a credential_ref to its secret material.

    Local/dev: reads a JSON blob from an environment variable named
    f"CRED_{credential_ref}" (uppercased, non-alnum -> underscore), e.g.
    credential_ref "oracle-ewnj-test-creds" -> env var CRED_ORACLE_EWNJ_TEST_CREDS.

    Production: swap this function body for a boto3 Secrets Manager /
    SSM Parameter Store lookup keyed the same way -- callers (get_credential
    below) don't change.
    """
    env_key = "CRED_" + "".join(c.upper() if c.isalnum() else "_" for c in credential_ref)
    raw = os.environ.get(env_key)
    if raw is None:
        raise AuthError(
            f"no secret configured for credential_ref={credential_ref!r} "
            f"(expected env var {env_key})"
        )
    import json
    return json.loads(raw)


def _oauth2_client_credentials(target: Target) -> Credential:
    secret = _get_secret(target.credential_ref)
    token_url = secret["tokenUrl"]
    client_id = secret["clientId"]
    client_secret = secret["clientSecret"]
    scope = secret.get("scope")

    data = {"grant_type": "client_credentials"}
    if scope:
        data["scope"] = scope

    resp = requests.post(
        token_url,
        data=data,
        auth=(client_id, client_secret),
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
        timeout=get_http_timeout_seconds(),
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]
    return Credential(header_name="Authorization", header_value=f"Bearer {token}")


def _basic_auth(target: Target) -> Credential:
    secret = _get_secret(target.credential_ref)
    import base64
    token = base64.b64encode(
        f"{secret['username']}:{secret['password']}".encode()
    ).decode()
    return Credential(header_name="Authorization", header_value=f"Basic {token}")


def _api_key(target: Target) -> Credential:
    secret = _get_secret(target.credential_ref)
    header_name = secret.get("headerName", "X-API-Key")
    return Credential(header_name=header_name, header_value=secret["apiKey"])


_DISPATCH = {
    "oauth2": _oauth2_client_credentials,
    "basic": _basic_auth,
    "apikey": _api_key,
}


def get_credential(target: Target) -> Credential:
    handler = _DISPATCH.get(target.auth_type)
    if handler is None:
        raise AuthError(f"unsupported auth_type {target.auth_type!r} for target {target.target_id!r}")
    return handler(target)
