def test_create_and_get_client(client):
    resp = client.post("/api/v1/clients", json={"client_id": "AV", "client_name": "Avanade"})
    assert resp.status_code == 201
    assert resp.json()["client_id"] == "AV"

    resp = client.get("/api/v1/clients/AV")
    assert resp.status_code == 200
    assert resp.json()["client_name"] == "Avanade"


def test_create_duplicate_client_returns_409(client):
    client.post("/api/v1/clients", json={"client_id": "AV", "client_name": "Avanade"})
    resp = client.post("/api/v1/clients", json={"client_id": "AV", "client_name": "Dup"})
    assert resp.status_code == 409
    assert resp.json()["error"] == "Conflict"


def test_get_missing_client_returns_404(client):
    resp = client.get("/api/v1/clients/NOPE")
    assert resp.status_code == 404
    assert resp.json()["error"] == "NotFound"


def test_update_client(client):
    client.post("/api/v1/clients", json={"client_id": "AV", "client_name": "Avanade"})
    resp = client.patch("/api/v1/clients/AV", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


def test_delete_client(client):
    client.post("/api/v1/clients", json={"client_id": "AV", "client_name": "Avanade"})
    resp = client.delete("/api/v1/clients/AV")
    assert resp.status_code == 204
    assert client.get("/api/v1/clients/AV").status_code == 404
