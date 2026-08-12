"""Pairing — info y QR para conectar el remote."""
import pytest
from fastapi.testclient import TestClient

from catodo.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_pair_info_shape(client):
    r = client.get("/api/pair/info")
    assert r.status_code == 200
    d = r.json()
    assert "url" in d and "code" in d and "host" in d


def test_pair_qr_svg(client):
    r = client.get("/api/pair/qr")
    assert r.status_code == 200
    assert "image/svg+xml" in r.headers["content-type"]
    assert "<svg" in r.text
