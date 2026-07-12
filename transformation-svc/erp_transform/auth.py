"""
Auth stage: resolves a bearer token (or other credential) for a target,
based on its auth_type. Generic dispatch by auth_type string so adding a new
auth mechanism later is one new branch/function, not a rewrite.

Secrets are never read from field_mapping/target config directly --
credential_ref is a lookup key into AWS Secrets Manager (LocalStack locally,
real AWS in production -- same boto3 call, only AWS_ENDPOINT_URL differs).
This module never logs a resolved secret value.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import boto3

from .config import get_http_timeout_seconds, get_secrets_manager_endpoint_url
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


@lru_cache(maxsize=1)
def _secrets_client():
    return boto3.client(
        "secretsmanager",
        endpoint_url=get_secrets_manager_endpoint_url(),
    )


def _get_secret(credential_ref: str) -> dict:
    """
    Resolves a credential_ref to its secret material via AWS Secrets Manager.
    credential_ref is used directly as the secret name/id.
    """
    try:
        resp = _secrets_client().get_secret_value(SecretId=credential_ref)
    except Exception as exc:
        raise AuthError(
            f"no secret configured for credential_ref={credential_ref!r} "
            f"(Secrets Manager lookup failed: {exc})"
        ) from exc
    return json.loads(resp["SecretString"])


def _oauth2_from_extracted(target: Target, extracted: dict) -> Credential:
    """oauth2 credentials are no longer fetched inline here -- they come from
    a pipeline step (e.g. `fetchToken`) that ran earlier in the same
    pipeline_run and had `access_token` as one of its extract rules. See
    erp_transform.extract and orchestrator.run_pipeline."""
    token = extracted.get("access_token")
    if token is None:
        raise AuthError(
            f"no access_token extracted before target {target.target_id!r} "
            f"needed oauth2 credentials -- add an earlier pipeline step "
            f"whose `extract` config produces `access_token`"
        )
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
    "oauth2": _oauth2_from_extracted,
    "basic": _basic_auth,
    "apikey": _api_key,
}


def get_credential(target: Target, extracted: Optional[dict] = None) -> Credential:
    extracted = extracted or {}
    handler = _DISPATCH.get(target.auth_type)
    if handler is None:
        raise AuthError(f"unsupported auth_type {target.auth_type!r} for target {target.target_id!r}")
    if target.auth_type == "oauth2":
        return handler(target, extracted)
    return handler(target)
