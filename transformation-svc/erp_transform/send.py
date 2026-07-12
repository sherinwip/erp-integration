"""
Send stage: executes one step's HTTP call against its target, using the
transformed body and a resolved credential. Generic across GET/POST/PUT/PATCH/
DELETE (FR-ORC-001..004) -- the method comes from step config, not branching
per-target code.
"""
from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any, Optional

import requests

from .auth import Credential
from .config import get_http_timeout_seconds
from .db import Step, Target

logger = logging.getLogger("transformation_svc.send")

_SENSITIVE_HEADERS = {
    "authorization",
    "x-api-key",
    "api-key",
    "cookie",
    "set-cookie",
    "x-auth-token",
}


def _mask_headers(headers: dict[str, Any]) -> dict[str, Any]:
    masked: dict[str, Any] = {}
    for key, value in headers.items():
        if key.lower() in _SENSITIVE_HEADERS:
            masked[key] = "***REDACTED***"
        else:
            masked[key] = value
    return masked


def _render_map(
    values: Optional[dict],
    source: dict,
    previous_steps: dict,
    extracted: dict,
) -> dict:
    rendered: dict = {}
    for key, value in (values or {}).items():
        rendered[key] = _render_template(str(value), source, previous_steps, extracted)
    return rendered


def _parse_response_body(resp: requests.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _json_body_for_method(method: str, body: Optional[dict]) -> Optional[dict]:
    return body if method in ("POST", "PUT", "PATCH") else None


@dataclass(frozen=True)
class StepResult:
    status_code: int
    response_body: Any
    request_url: str
    request_body: Optional[dict]


def _render_template(
    value: str,
    source: dict,
    previous_steps: dict,
    extracted: dict | None = None,
) -> str:
    """{{source.x}} / {{steps.stepName.x}} / {{var_name}} renderer for URL
    paths, query params, and headers. {{source.*}} and {{steps.*}} mirror
    the template syntax in pipeline-routing-config-db-requirements.md §3.2.
    Bare {{var_name}} (no dot) is a distinct namespace: values produced by
    an earlier step's `extract` rules for this pipeline run (see
    erp_transform.extract), e.g. {{access_token}}."""
    if "{{" not in value:
        return value

    import re

    extracted = extracted or {}

    def replace(match: "re.Match") -> str:
        expr = match.group(1).strip()
        parts = expr.split(".")
        if parts[0] == "source":
            node: Any = source
            for p in parts[1:]:
                node = node.get(p) if isinstance(node, dict) else None
            return str(node) if node is not None else ""
        if parts[0] == "steps":
            step_name, *rest = parts[1:]
            node = previous_steps.get(step_name, {})
            for p in rest:
                node = node.get(p) if isinstance(node, dict) else None
            return str(node) if node is not None else ""
        if len(parts) == 1:
            node = extracted.get(parts[0])
            return str(node) if node is not None else ""
        return match.group(0)

    return re.sub(r"\{\{\s*([^}]+)\s*\}\}", replace, value)


def execute_step(
    step: Step,
    target: Target,
    credential: Credential,
    body: Optional[dict],
    source: Optional[dict] = None,
    previous_steps: Optional[dict] = None,
    extracted: Optional[dict] = None,
) -> StepResult:
    source = source or {}
    previous_steps = previous_steps or {}
    extracted = extracted or {}

    path = _render_template(step.path, source, previous_steps, extracted)
    url = target.base_url.rstrip("/") + "/" + path.lstrip("/")

    query_params = _render_map(step.query_params, source, previous_steps, extracted)

    headers = dict(target.default_headers or {})
    headers.update(_render_map(step.headers, source, previous_steps, extracted))
    headers[credential.header_name] = credential.header_value

    safe_headers = _mask_headers(headers)
    logger.info(
        "step.request.before_send step_name=%s method=%s url=%s query=%s headers=%s body=%s",
        step.step_name,
        step.method,
        url,
        query_params or {},
        safe_headers,
        body,
    )

    resp = requests.request(
        method=step.method,
        url=url,
        params=query_params or None,
        json=_json_body_for_method(step.method, body),
        headers=headers,
        timeout=get_http_timeout_seconds(),
    )

    response_body = _parse_response_body(resp)

    logger.info(
        "step.response.after_receive step_name=%s method=%s url=%s status_code=%s headers=%s body=%s",
        step.step_name,
        step.method,
        resp.request.url or url,
        resp.status_code,
        _mask_headers(dict(resp.headers)),
        response_body,
    )

    return StepResult(
        status_code=resp.status_code,
        response_body=response_body,
        request_url=resp.request.url or url,
        request_body=body,
    )
