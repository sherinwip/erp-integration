"""
Tests for pipeline_id-based orchestration (transform_pipeline), which is
what a CRM/Salesforce caller actually invokes -- it knows pipeline_id, not
step_pk. Requires the local Docker Postgres; skips automatically if
unreachable.
"""
import pytest

from erp_transform.db import get_connection
from erp_transform.orchestrator import transform_pipeline

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
def test_single_step_pipeline_full_oracle_contract():
    source = {
        "orgId": 300000019976011,
        "contractNumber": "TEST-1",
        "legalEntityName": "Test Corp",
        "startDate": "2026-03-20",
        "headerAttributes": {},
        "parties": [{"partyRoleCode": "CUSTOMER", "role": "Customer", "partyName": "Test Buyer"}],
        "lines": [{"itemName": "ITEM-1", "lineAttributes": {}}],
    }
    result = transform_pipeline("award-to-oracle-contract-full-v1", source)

    assert result["pipeline_id"] == "award-to-oracle-contract-full-v1"
    assert result["pattern_id"] == "PAT-01"
    assert len(result["steps"]) == 1
    assert result["steps"][0]["step_name"] == "create-oracle-contract-full"
    assert result["steps"][0]["transformed_body"]["ContractNumber"] == "TEST-1"


@skip_if_no_db
def test_multi_step_pipeline_runs_in_seq_order():
    source = {
        "contract": {"name": "Government Infrastructure Project"},
        "amount": 500000,
        "currency": "USD",
        "projectNumber": "P-2024-100",
    }
    result = transform_pipeline("award-to-oracle-contract-v1", source)

    assert result["pattern_id"] == "PAT-03"
    assert [s["seq"] for s in result["steps"]] == [1, 2]
    assert [s["step_name"] for s in result["steps"]] == ["lookup-project", "create-contract"]

    create_contract = result["steps"][1]["transformed_body"]
    assert create_contract["ContractName"] == "Government Infrastructure Project"
    assert create_contract["ContractAmount"] == 500000
    assert create_contract["CurrencyCode"] == "USD"
    # lookup-project has no field_mapping rows (it's a GET/extract step, not a
    # body-building step) -- without actually sending the GET, its output is
    # empty and downstream steps.lookup-project.ProjectId resolves to None.
    assert create_contract["ProjectId"] is None


@skip_if_no_db
def test_unknown_pipeline_id_raises():
    with pytest.raises(ValueError, match="not found"):
        transform_pipeline("does-not-exist", {})


import hashlib
import json

from erp_transform.db import get_connection
from erp_transform.orchestrator import run_pipeline


@skip_if_no_db
def test_run_pipeline_happy_path_extracts_token_and_uses_it():
    source = {
        "orgId": 300000019976011,
        "contractNumber": f"TEST-{hashlib.sha1(str(id(object())).encode()).hexdigest()[:8]}",
        "legalEntityName": "Test Corp",
        "startDate": "2026-03-20",
        "headerAttributes": {},
        "parties": [{"partyRoleCode": "CUSTOMER", "role": "Customer", "partyName": "Test Buyer"}],
        "lines": [{"itemName": "ITEM-1", "lineAttributes": {}}],
    }
    result = run_pipeline("vaibhav-award-to-oracle-contract-demo-v1", source)

    assert result["pipeline_id"] == "vaibhav-award-to-oracle-contract-demo-v1"
    assert result["status"] == "completed"
    assert [s["step_name"] for s in result["steps"]] == ["fetchToken", "create-oracle-contract-demo"]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM pipeline_run WHERE run_id = %s", (result["run_id"],)
            )
            assert cur.fetchone()[0] == "completed"
            cur.execute(
                "SELECT var_name, value FROM pipeline_run_extract WHERE run_id = %s",
                (result["run_id"],),
            )
            extracted_rows = dict(cur.fetchall())
            assert "access_token" in extracted_rows


@skip_if_no_db
def test_run_pipeline_marks_failed_when_extract_rule_does_not_match():
    """Points fetchToken's extract rule at a JSONPath the mock oauth server's
    response never contains, so extraction should fail and abort the run
    before the business step ever executes."""
    import erp_transform.db as db_module

    original_get_pipeline_steps = db_module.get_pipeline_steps

    def _broken_get_pipeline_steps(conn, pipeline_id):
        steps = original_get_pipeline_steps(conn, pipeline_id)
        patched = []
        for ps in steps:
            if ps.step.step_name == "fetchToken":
                broken_extract = {"access_token": "$.this_field_does_not_exist"}
                broken_step = ps.step.__class__(
                    **{**ps.step.__dict__, "extract": broken_extract}
                )
                patched.append(ps.__class__(seq=ps.seq, step=broken_step))
            else:
                patched.append(ps)
        return patched

    db_module.get_pipeline_steps = _broken_get_pipeline_steps
    try:
        result = run_pipeline("vaibhav-award-to-oracle-contract-demo-v1", {})
        assert result["status"] == "failed"
        assert [s["step_name"] for s in result["steps"]] == ["fetchToken"]
    finally:
        db_module.get_pipeline_steps = original_get_pipeline_steps
