"""
Local orchestrator chaining auth -> transform -> send for one step. This is
the equivalent of what a Step Functions state machine would sequence as
separate Lambda invocations later; here it's one process for local testing.

`transform_only()` is the safe default for local dev against a real client
target -- it never makes an HTTP call. `run_step()` performs the full round
trip including the live HTTP request and requires the caller to explicitly
opt in (send=True) so nobody fires a request at a real ERP by accident.
"""
from __future__ import annotations

from typing import Optional

from . import auth, db, send, transform
from .config import get_db_config


def transform_only(step_pk: int, source: dict) -> dict:
    """DB-backed transform, no HTTP call. Safe to run against any environment."""
    cfg = get_db_config()
    with db.get_connection(cfg) as conn:
        mappings = db.get_field_mappings(conn, step_pk)
        if not mappings:
            raise ValueError(f"no field_mapping rows found for step_pk={step_pk}")
        return transform.transform_payload(source, mappings)


def run_step(step_pk: int, source: dict, send_request: bool = False) -> dict:
    """
    Full pipeline for one step: fetch config, transform, resolve auth, and
    (only if send_request=True) perform the live HTTP call.

    Returns a dict describing what happened, always including the
    transformed body so the caller can inspect it even when send_request
    is False.
    """
    cfg = get_db_config()
    with db.get_connection(cfg) as conn:
        step = db.get_step(conn, step_pk)
        target = db.get_target(conn, step.target_id)
        mappings = db.get_field_mappings(conn, step_pk)

    transformed_body = transform.transform_payload(source, mappings) if mappings else None

    result = {
        "step_name": step.step_name,
        "target_name": target.target_name,
        "method": step.method,
        "transformed_body": transformed_body,
        "sent": False,
        "response": None,
    }

    if send_request:
        credential = auth.get_credential(target)
        step_result = send.execute_step(
            step=step,
            target=target,
            credential=credential,
            body=transformed_body,
            source=source,
        )
        result["sent"] = True
        result["response"] = {
            "status_code": step_result.status_code,
            "body": step_result.response_body,
            "url": step_result.request_url,
        }

    return result
