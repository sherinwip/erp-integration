"""End-to-end config flow: client -> target -> step -> pipeline -> pipeline_step -> field_mapping,
mirroring the §4.5b/§4.6 sample rows in pipeline-routing-config-db-requirements.md.
"""


def _seed_client_target(client, client_id="AV"):
    client.post("/api/v1/clients", json={"client_id": client_id, "client_name": "Avanade"})
    client.post(
        "/api/v1/targets",
        json={
            "target_id": f"{client_id}-oracle-fusion",
            "client_id": client_id,
            "target_name": "OracleFusion",
            "base_url": "https://oracle-instance.oraclecloud.com",
            "auth_type": "oauth2",
            "credential_ref": "oracle-prod-creds",
        },
    )


def test_full_pipeline_wiring(client):
    _seed_client_target(client)

    step_resp = client.post(
        "/api/v1/steps",
        json={
            "client_id": "AV",
            "target_id": "AV-oracle-fusion",
            "step_name": "create-contract",
            "method": "POST",
            "path": "/fscmRestApi/resources/11.13.18.05/contracts",
        },
    )
    assert step_resp.status_code == 201
    step_pk = step_resp.json()["step_pk"]

    pipeline_resp = client.post(
        "/api/v1/pipelines",
        json={
            "pipeline_id": "award-to-oracle-contract-v1",
            "client_id": "AV",
            "source_system": "salesforce",
            "object_type": "ContractAward",
            "event_type": "create",
            "pattern_id": "PAT-03",
        },
    )
    assert pipeline_resp.status_code == 201

    attach_resp = client.post(
        "/api/v1/pipeline-steps",
        json={"pipeline_id": "award-to-oracle-contract-v1", "step_pk": step_pk, "seq": 1},
    )
    assert attach_resp.status_code == 201

    mapping_resp = client.post(
        "/api/v1/field-mappings",
        json={
            "step_pk": step_pk,
            "source_path": "contract.name",
            "target_path": "ContractName",
            "is_required": True,
            "sort_order": 1,
        },
    )
    assert mapping_resp.status_code == 201

    steps_resp = client.get("/api/v1/pipelines/award-to-oracle-contract-v1/steps")
    assert steps_resp.status_code == 200
    assert len(steps_resp.json()) == 1
    assert steps_resp.json()[0]["seq"] == 1

    mappings_resp = client.get(f"/api/v1/field-mappings?step_pk={step_pk}")
    assert len(mappings_resp.json()) == 1


def test_unsupported_pattern_rejected(client):
    _seed_client_target(client)
    resp = client.post(
        "/api/v1/pipelines",
        json={
            "pipeline_id": "bad-pattern-pipeline",
            "client_id": "AV",
            "source_system": "salesforce",
            "object_type": "ContractAward",
            "pattern_id": "PAT-04",
        },
    )
    assert resp.status_code == 422
    assert "PatternNotSupported" in resp.json()["detail"]


def test_step_target_must_belong_to_same_client(client):
    _seed_client_target(client, client_id="AV")
    client.post("/api/v1/clients", json={"client_id": "AKIMA", "client_name": "Akima"})

    resp = client.post(
        "/api/v1/steps",
        json={
            "client_id": "AKIMA",
            "target_id": "AV-oracle-fusion",
            "step_name": "create-contract",
            "method": "POST",
            "path": "/x",
        },
    )
    assert resp.status_code == 422


def test_pipeline_step_cross_client_attachment_rejected(client):
    _seed_client_target(client, client_id="AV")
    client.post("/api/v1/clients", json={"client_id": "AKIMA", "client_name": "Akima"})
    client.post(
        "/api/v1/targets",
        json={
            "target_id": "AKIMA-sap",
            "client_id": "AKIMA",
            "target_name": "SAP",
            "base_url": "https://sap.example.com",
            "auth_type": "basic",
            "credential_ref": "sap-creds",
        },
    )

    step_resp = client.post(
        "/api/v1/steps",
        json={
            "client_id": "AKIMA",
            "target_id": "AKIMA-sap",
            "step_name": "create-account",
            "method": "POST",
            "path": "/x",
        },
    )
    step_pk = step_resp.json()["step_pk"]

    client.post(
        "/api/v1/pipelines",
        json={
            "pipeline_id": "av-pipeline",
            "client_id": "AV",
            "source_system": "salesforce",
            "object_type": "ContractAward",
            "pattern_id": "PAT-01",
        },
    )

    resp = client.post(
        "/api/v1/pipeline-steps",
        json={"pipeline_id": "av-pipeline", "step_pk": step_pk, "seq": 1},
    )
    assert resp.status_code == 422
