"""
Integration test against the live local Docker Postgres (seeded via
database/changelog). Skips automatically if the DB isn't reachable, so
`pytest` still runs clean in an environment without Docker up.
"""
import json

import pytest

from erp_transform.db import (
    create_pipeline_run,
    create_raw_payload,
    get_connection,
    get_field_mappings,
    insert_pipeline_run_extract,
    update_pipeline_run_status,
)
from erp_transform.orchestrator import transform_only

pytestmark = pytest.mark.integration


def _db_available() -> bool:
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return True
    except Exception:
        return False


skip_if_no_db = pytest.mark.skipif(not _db_available(), reason="local Docker Postgres not reachable")


@skip_if_no_db
def test_seeded_oracle_contract_pipeline_has_67_mappings():
    with get_connection() as conn:
        mappings = get_field_mappings(conn, step_pk=3)
    assert len(mappings) == 67


@skip_if_no_db
def test_transform_only_matches_reference_output():
    import json
    from pathlib import Path

    fixtures = Path(__file__).parent.parent.parent / "documentation" / "sample-payloads"
    source = json.loads((fixtures / "salesforce-contract-award-input.json").read_text())

    result = transform_only(step_pk=3, source=source)

    assert result["OrgId"] == 300000019976011
    assert result["ContractNumber"] == "W58RGZ26F0238_X1"
    assert result["ContractParty"][0]["PartyName"] == "US ARMY CONTRACTING COMMAND"
    assert result["ContractLine"][0]["ItemName"] == "140000-001"
    assert result["ContractLine"][0]["ContractAllLineDesFlexVA"][0]["fob"] == "FOB ORIGIN"


@skip_if_no_db
def test_create_raw_payload_and_pipeline_run_roundtrip():
    with get_connection() as conn:
        raw_payload_id = create_raw_payload(
            conn,
            pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key=f"test-key-{json.dumps({'x': 1})}",
            payload={"x": 1},
        )
        run = create_pipeline_run(
            conn, raw_payload_id=raw_payload_id, pipeline_id="award-to-oracle-contract-full-v1"
        )
        assert run.raw_payload_id == raw_payload_id
        assert run.status == "in_progress"

        update_pipeline_run_status(conn, run.run_id, "completed")

        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, completed_at FROM pipeline_run WHERE run_id = %s",
                (run.run_id,),
            )
            status, completed_at = cur.fetchone()
            assert status == "completed"
            assert completed_at is not None
        conn.commit()


@skip_if_no_db
def test_create_raw_payload_is_idempotent():
    with get_connection() as conn:
        key = "duplicate-key-test"
        first_id = create_raw_payload(
            conn, pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key=key, payload={"a": 1},
        )
        second_id = create_raw_payload(
            conn, pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key=key, payload={"a": 1},
        )
        assert first_id == second_id
        conn.commit()


@skip_if_no_db
def test_insert_pipeline_run_extract_roundtrip():
    with get_connection() as conn:
        raw_payload_id = create_raw_payload(
            conn, pipeline_id="award-to-oracle-contract-full-v1",
            idempotency_key="extract-test-key", payload={},
        )
        run = create_pipeline_run(
            conn, raw_payload_id=raw_payload_id, pipeline_id="award-to-oracle-contract-full-v1"
        )
        insert_pipeline_run_extract(conn, run.run_id, step_pk=6, values={"access_token": "abc123"})

        with conn.cursor() as cur:
            cur.execute(
                "SELECT var_name, value FROM pipeline_run_extract WHERE run_id = %s",
                (run.run_id,),
            )
            rows = dict(cur.fetchall())
            assert rows["access_token"] == "abc123"
        conn.commit()
