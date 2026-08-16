"""PWA manifest + service worker availability."""
import pytest
from fastapi.testclient import TestClient

from catodo.main import app


@pytest.fixture
def client_with_static(tmp_path):
    """Force the static dir to exist (the app only mounts it when present)
    and create the PWA files inside it."""
    from pathlib import Path

    static_dir = Path(__file__).resolve().parent.parent / "static"
    assert static_dir.exists(), f"static dir missing: {static_dir}"
    with TestClient(app) as c:
        yield c


def test_pwa_manifest_reachable(client_with_static):
    r = client_with_static.get("/remote/manifest.webmanifest")
    assert r.status_code == 200, r.text
    assert "application/manifest+json" in r.headers["content-type"]
    data = r.json()
    assert data["display"] == "standalone"
    assert data["start_url"].startswith("/remote")
    sizes = [i["sizes"] for i in data["icons"]]
    assert "192x192" in sizes
    assert "512x512" in sizes
    assert any(i.get("purpose") == "maskable" for i in data["icons"])


def test_pwa_icons_resolve(client_with_static):
    for path in ("/remote/icons/icon-192.png",
                 "/remote/icons/icon-512.png",
                 "/remote/icons/icon-maskable.png"):
        r = client_with_static.get(path)
        assert r.status_code == 200, path
        assert r.headers["content-type"].startswith("image/png"), path


def test_sw_reachable(client_with_static):
    r = client_with_static.get("/remote/sw.js")
    assert r.status_code == 200
    assert "javascript" in r.headers["content-type"]
    body = r.content.decode()
    assert "addEventListener" in body
