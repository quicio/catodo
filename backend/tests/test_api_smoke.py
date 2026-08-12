"""API smoke tests against FastAPI TestClient.

Each test names the spec scenario it covers.
"""
import pytest
from fastapi.testclient import TestClient

from catodo.main import app


@pytest.fixture
def client(tmp_data_dir):
    with TestClient(app) as c:
        yield c


def test_health_ok(client):
    """Spec: backend-api / Health endpoint."""
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_list_channels_shape(client):
    """Spec: backend-api / Channel listing endpoint."""
    r = client.get("/api/channels")
    assert r.status_code == 200
    ch = r.json()
    assert isinstance(ch, list)
    assert len(ch) >= 1
    assert "id" in ch[0]
    assert "name" in ch[0]
    assert "type" in ch[0]
    assert "capabilities" in ch[0]


def test_open_unknown_channel(client):
    """Spec: backend-api / Channel focus endpoint — Invalid channel."""
    r = client.post("/api/channels/nonexistent/open")
    assert r.status_code == 404


def test_volume_set(client):
    """Spec: backend-api / Volume — set."""
    r = client.post("/api/volume?level=42")
    assert r.status_code == 200
    data = r.json()
    assert data["volume"] == 42


def test_volume_invalid(client):
    """Spec: backend-api / Volume — missing level."""
    r = client.post("/api/volume")
    assert r.status_code == 400


def test_config_round_trip(client):
    """Spec: runtime-config / Config API — Round trip."""
    r = client.post("/api/config", json={"tv_url": "http://test.example"})
    assert r.status_code == 200
    r2 = client.get("/api/config")
    assert r2.json()["tv_url"] == "http://test.example"


def test_config_unknown_key_ignored(client):
    """Spec: runtime-config / Config API — Unknown key ignored."""
    r = client.post("/api/config", json={"bogus": 1})
    assert r.status_code == 200
    assert "bogus" not in r.json()
