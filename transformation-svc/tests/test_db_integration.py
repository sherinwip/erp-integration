"""
Integration test against the live local Docker Postgres (seeded via
database/changelog). Skips automatically if the DB isn't reachable, so
`pytest` still runs clean in an environment without Docker up.
"""
import pytest

from erp_transform.db import get_connection, get_field_mappings
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
