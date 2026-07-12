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

import hashlib
import json
from typing import Optional

from . import auth, db, send, transform
from .config import get_db_config
from .extract import apply_extract_rules


def transform_only(step_pk: int, source: dict) -> dict:
    """DB-backed transform for a single step_pk, no HTTP call. Kept for direct
    step-level debugging; callers driven by CRM/Salesforce should use
    transform_pipeline() instead since they know pipeline_id, not step_pk."""
    cfg = get_db_config()
    with db.get_connection(cfg) as conn:
        mappings = db.get_field_mappings(conn, step_pk)
        if not mappings:
            raise ValueError(f"no field_mapping rows found for step_pk={step_pk}")
        return transform.transform_payload(source, mappings)


def transform_pipeline(pipeline_id: str, source: dict) -> dict:
    """
    Resolves a pipeline_id (the identifier callers like a CRM actually know,
    per pipeline-routing-config-db-requirements.md §2-3) to its ordered
    pipeline_step attachments, and runs the transform stage for every
    attached step in seq order.

    Returns:
        {
          "pipeline_id": ...,
          "pattern_id": ...,
          "steps": [
            {"seq": 1, "step_name": "lookup-project", "target_name": ..., "method": "GET", "transformed_body": {...}},
            {"seq": 2, "step_name": "create-contract", "target_name": ..., "method": "POST", "transformed_body": {...}},
            ...
          ]
        }

    A later step's field_mapping rows may reference an earlier step's output
    via source_path "steps.<step_name>.<field>" (same template convention as
    the SQL engine / pipeline JSON config) -- each step's transformed_body is
    exposed under result["steps"][i]["transformed_body"] and also folded into
    a running `steps` scope so later transforms can resolve it.
    """
    cfg = get_db_config()
    with db.get_connection(cfg) as conn:
        pipeline = db.get_pipeline(conn, pipeline_id)
        pipeline_steps = db.get_pipeline_steps(conn, pipeline_id)
        mappings_by_step = {
            ps.step.step_pk: db.get_field_mappings(conn, ps.step.step_pk)
            for ps in pipeline_steps
        }
        targets_by_id = {
            ps.step.target_id: db.get_target(conn, ps.step.target_id)
            for ps in pipeline_steps
        }

    steps_scope: dict = {}
    step_results = []

    for ps in pipeline_steps:
        step = ps.step
        target = targets_by_id[step.target_id]
        mappings = mappings_by_step[step.step_pk]

        # Same source shape the SQL engine and pipeline JSON config use:
        # {{source.x}} / {{steps.stepName.y}}. transform_payload() only reads
        # dot-paths off whatever dict it's given, so nesting the running
        # steps scope under a top-level "steps" key lets source_path values
        # like "steps.lookup-project.ProjectId" resolve unchanged.
        scoped_source = dict(source)
        scoped_source["steps"] = steps_scope

        transformed_body = transform.transform_payload(scoped_source, mappings) if mappings else {}
        steps_scope[step.step_name] = transformed_body

        step_results.append({
            "seq": ps.seq,
            "step_name": step.step_name,
            "target_name": target.target_name,
            "method": step.method,
            "transformed_body": transformed_body,
        })

    return {
        "pipeline_id": pipeline.pipeline_id,
        "pattern_id": pipeline.pattern_id,
        "steps": step_results,
    }


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


def run_pipeline(pipeline_id: str, source: dict) -> dict:
    """
    Full send-for-real pipeline run: creates raw_payload + pipeline_run
    tracking rows, then executes every attached step in seq order via real
    HTTP calls (unlike transform_pipeline(), which never sends). Each
    step's `extract` rules (if any) are applied to its response and
    accumulated into a run-scoped dict available to later steps as
    {{var_name}} in path/query_params/headers, and to oauth2 targets as
    their bearer credential (see auth.get_credential).

    idempotency_key is a cheap hash of (pipeline_id, source) -- this is not
    real webhook ingestion (no request-header-derived key, no replay
    policy), just enough to satisfy raw_payload's uniqueness constraint for
    repeated local/test invocations of the same input.
    """
    idempotency_key = hashlib.sha256(
        (pipeline_id + json.dumps(source, sort_keys=True)).encode()
    ).hexdigest()

    cfg_conn_kwargs = {}
    with db.get_connection(**cfg_conn_kwargs) as conn:
        raw_payload_id = db.create_raw_payload(conn, pipeline_id, idempotency_key, source)
        run = db.create_pipeline_run(conn, raw_payload_id, pipeline_id)
        pipeline_steps = db.get_pipeline_steps(conn, pipeline_id)
        targets_by_id = {
            ps.step.target_id: db.get_target(conn, ps.step.target_id)
            for ps in pipeline_steps
        }
        mappings_by_step = {
            ps.step.step_pk: db.get_field_mappings(conn, ps.step.step_pk)
            for ps in pipeline_steps
        }

    steps_scope: dict = {}
    extracted_scope: dict = {}
    step_results = []

    try:
        with db.get_connection() as conn:
            for ps in pipeline_steps:
                step = ps.step
                target = targets_by_id[step.target_id]
                mappings = mappings_by_step[step.step_pk]

                scoped_source = dict(source)
                scoped_source["steps"] = steps_scope
                transformed_body = (
                    transform.transform_payload(scoped_source, mappings) if mappings else {}
                )

                credential = auth.get_credential(target, extracted=extracted_scope)
                step_result = send.execute_step(
                    step=step,
                    target=target,
                    credential=credential,
                    body=transformed_body,
                    source=source,
                    previous_steps=steps_scope,
                    extracted=extracted_scope,
                )

                steps_scope[step.step_name] = transformed_body
                step_results.append({
                    "seq": ps.seq,
                    "step_name": step.step_name,
                    "status_code": step_result.status_code,
                    "response_body": step_result.response_body,
                })

                if step.extract:
                    new_values = apply_extract_rules(step_result.response_body, step.extract)
                    extracted_scope.update(new_values)
                    db.insert_pipeline_run_extract(conn, run.run_id, step.step_pk, new_values)

        with db.get_connection() as conn:
            db.update_pipeline_run_status(conn, run.run_id, "completed")

        return {
            "pipeline_id": pipeline_id,
            "run_id": run.run_id,
            "status": "completed",
            "steps": step_results,
        }
    except Exception:
        with db.get_connection() as conn:
            db.update_pipeline_run_status(conn, run.run_id, "failed")
        return {
            "pipeline_id": pipeline_id,
            "run_id": run.run_id,
            "status": "failed",
            "steps": step_results,
        }
