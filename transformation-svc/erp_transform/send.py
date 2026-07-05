"""
Send stage: executes one step's HTTP call against its target, using the
transformed body and a resolved credential. Generic across GET/POST/PUT/PATCH/
DELETE (FR-ORC-001..004) -- the method comes from step config, not branching
per-target code.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import requests

from .auth import Credential
from .config import get_http_timeout_seconds
from .db import Step, Target


@dataclass(frozen=True)
class StepResult:
    status_code: int
    response_body: Any
    request_url: str
    request_body: Optional[dict]


def _render_template(value: str, source: dict, previous_steps: dict) -> str:
    """Very small {{source.x}} / {{steps.stepName.x}} renderer for URL paths
    and query params -- mirrors the template syntax in pipeline-routing-config-db-requirements.md §3.2."""
    if "{{" not in value:
        return value

    import re

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
        return match.group(0)

    return re.sub(r"\{\{\s*([^}]+)\s*\}\}", replace, value)


def execute_step(
    step: Step,
    target: Target,
    credential: Credential,
    body: Optional[dict],
    source: Optional[dict] = None,
    previous_steps: Optional[dict] = None,
) -> StepResult:
    source = source or {}
    previous_steps = previous_steps or {}

    path = _render_template(step.path, source, previous_steps)
    url = target.base_url.rstrip("/") + "/" + path.lstrip("/")

    query_params = {}
    if step.query_params:
        for key, value in step.query_params.items():
            query_params[key] = _render_template(str(value), source, previous_steps)

    headers = dict(target.default_headers or {})
    if step.headers:
        headers.update(step.headers)
    headers[credential.header_name] = credential.header_value

    resp = requests.request(
        method=step.method,
        url=url,
        params=query_params or None,
        json=body if step.method in ("POST", "PUT", "PATCH") else None,
        headers=headers,
        timeout=get_http_timeout_seconds(),
    )

    try:
        response_body = resp.json()
    except ValueError:
        response_body = resp.text

    return StepResult(
        status_code=resp.status_code,
        response_body=response_body,
        request_url=resp.request.url or url,
        request_body=body,
    )
