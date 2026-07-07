"""
Read-only data access for pipeline config: step, target, field_mapping.
Plain psycopg2, no ORM -- keeps this portable to a Lambda execution
environment where heavier dependencies cost cold-start time.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Optional

import psycopg2
import psycopg2.extras

from .config import DBConfig, get_db_config


@dataclass(frozen=True)
class Target:
    target_id: str
    client_id: str
    target_name: str
    base_url: str
    auth_type: str
    credential_ref: str
    default_headers: dict


@dataclass(frozen=True)
class Step:
    step_pk: int
    client_id: str
    target_id: str
    step_name: str
    method: str
    path: str
    query_params: Optional[dict]
    headers: Optional[dict]
    extract: Optional[dict]
    on_not_found: str
    on_multiple_results: str
    rollback_method: Optional[str]
    rollback_path: Optional[str]


@dataclass(frozen=True)
class Pipeline:
    pipeline_id: str
    client_id: str
    source_system: str
    object_type: str
    event_type: str
    pattern_id: str
    status: str


@dataclass(frozen=True)
class PipelineStep:
    """One (seq, step) attachment from the pipeline_step junction, joined
    with the step row itself -- the ordered execution list for a pipeline."""
    seq: int
    step: Step


@dataclass(frozen=True)
class FieldMapping:
    mapping_pk: int
    step_pk: int
    source_path: str
    target_path: str
    transform_type: str
    transform_params: Optional[str]
    default_value: Optional[str]
    is_required: bool
    sort_order: int
    array_source_path: str
    array_target_path: str
    is_singleton_array: bool
    is_object_target: bool


@contextmanager
def get_connection(cfg: Optional[DBConfig] = None):
    cfg = cfg or get_db_config()
    conn = psycopg2.connect(cfg.dsn)
    try:
        yield conn
    finally:
        conn.close()


def get_step(conn, step_pk: int) -> Step:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT step_pk, client_id, target_id, step_name, method, path,
                   query_params, headers, extract, on_not_found,
                   on_multiple_results, rollback_method, rollback_path
            FROM step
            WHERE step_pk = %s
            """,
            (step_pk,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"step_pk {step_pk} not found")
        return Step(**row)


def get_pipeline(conn, pipeline_id: str) -> Pipeline:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT pipeline_id, client_id, source_system, object_type,
                   event_type, pattern_id, status
            FROM pipeline
            WHERE pipeline_id = %s
            """,
            (pipeline_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"pipeline_id {pipeline_id!r} not found")
        return Pipeline(**row)


def get_pipeline_steps(conn, pipeline_id: str) -> "list[PipelineStep]":
    """Ordered (by seq) list of steps attached to a pipeline via pipeline_step.
    Mirrors the runtime query in pipeline-routing-config-db-requirements.md §4.8."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT ps.seq, s.step_pk, s.client_id, s.target_id, s.step_name,
                   s.method, s.path, s.query_params, s.headers, s.extract,
                   s.on_not_found, s.on_multiple_results, s.rollback_method,
                   s.rollback_path
            FROM pipeline_step ps
            JOIN step s ON s.step_pk = ps.step_pk
            WHERE ps.pipeline_id = %s
            ORDER BY ps.seq
            """,
            (pipeline_id,),
        )
        rows = cur.fetchall()
        if not rows:
            raise ValueError(f"pipeline_id {pipeline_id!r} has no attached steps")
        result = []
        for row in rows:
            seq = row.pop("seq")
            result.append(PipelineStep(seq=seq, step=Step(**row)))
        return result


def get_target(conn, target_id: str) -> Target:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT target_id, client_id, target_name, base_url, auth_type,
                   credential_ref, default_headers
            FROM target
            WHERE target_id = %s
            """,
            (target_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"target_id {target_id!r} not found")
        return Target(**row)


def get_field_mappings(conn, step_pk: int) -> list[FieldMapping]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT mapping_pk, step_pk, source_path, target_path, transform_type,
                   transform_params, default_value, is_required, sort_order,
                   array_source_path, array_target_path, is_singleton_array,
                   is_object_target
            FROM field_mapping
            WHERE step_pk = %s
            ORDER BY sort_order
            """,
            (step_pk,),
        )
        return [FieldMapping(**row) for row in cur.fetchall()]
