"""Remote keyboard — endpoint POST /api/type."""
import pytest
from fastapi.testclient import TestClient

from catodo.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_type_endpoint_ok(client):
    r = client.post("/api/type", json={"text": "hola {ENTER}"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_type_endpoint_requires_text(client):
    r = client.post("/api/type", json={})
    assert r.status_code == 400
    r = client.post("/api/type", json={"text": ""})
    assert r.status_code == 400
    r = client.post("/api/type", data="no json")
    assert r.status_code == 400
