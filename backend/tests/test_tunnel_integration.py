"""Tunnel + token enforcement + pair rewrite — integration via TestClient."""
import pytest
from fastapi.testclient import TestClient

from catodo.main import app


@pytest.fixture
def client(tmp_data_dir):
    # Reset runtime_config cache so the test data dir takes effect.
    from catodo import runtime_config
    runtime_config._config = None
    with TestClient(app) as c:
        yield c


def test_pair_info_contains_lan_only_by_default(client):
    r = client.get("/api/pair/info")
    assert r.status_code == 200
    d = r.json()
    assert "lan" in d and d["lan"].startswith("http://")
    # tunnel is disabled by default → no public URL
    assert d["public"] is None
    assert d["primary"] == "lan"


def test_pair_qr_encodes_lan_by_default(client):
    r = client.get("/api/pair/qr")
    assert r.status_code == 200
    assert "image/svg+xml" in r.headers["content-type"]


def test_pair_qr_lan_query_param(client):
    r = client.get("/api/pair/qr?which=lan")
    assert r.status_code == 200


def test_pair_qr_public_query_param_without_domain(client):
    """Asking for public without a configured domain falls back to LAN."""
    r = client.get("/api/pair/qr?which=public")
    assert r.status_code == 200


def test_tunnel_providers_endpoint(client):
    r = client.get("/api/tunnel/providers")
    assert r.status_code == 200
    data = r.json()
    names = [p["name"] for p in data]
    assert "cloudflare" in names


def test_tunnel_status_endpoint(client):
    r = client.get("/api/tunnel/status")
    assert r.status_code == 200
    s = r.json()
    assert s["state"] == "stopped"


def test_tunnel_health_endpoint(client):
    r = client.get("/api/tunnel/health")
    assert r.status_code == 200
    h = r.json()
    assert h["reachable"] is False
    assert h.get("reason") == "stopped"


def test_tunnel_start_rejects_unknown_provider(client):
    r = client.post(
        "/api/tunnel/start",
        json={},
    )
    # provider is "cloudflare" by default but it has no valid config in tests
    # (no binary on PATH, no token file) → expect 409 with the validate_config message
    assert r.status_code in (400, 409), r.text


def test_config_post_rejects_invalid_public_domain(client):
    r = client.post("/api/config", json={"public_domain": "http://spaces in domain.com"})
    assert r.status_code == 400
    assert "public_domain" in r.text


def test_config_post_rejects_unknown_provider(client):
    r = client.post("/api/config", json={"tunnel_provider": "not-a-real-provider"})
    assert r.status_code == 400
    assert "provider" in r.text


def test_config_post_accepts_valid_keys(client):
    r = client.post(
        "/api/config",
        json={
            "public_domain": "catodo.example.com",
            "tunnel_provider": "cloudflare",
            "tunnel_token_path": "/tmp/nonexistent.json",
            "tunnel_require_token": True,
            "tunnel_enabled": False,
        },
    )
    assert r.status_code == 200, r.text


def test_config_post_persists_tunnel_keys(client):
    client.post(
        "/api/config",
        json={
            "public_domain": "catodo.example.com",
            "tunnel_provider": "cloudflare",
            "tunnel_token_path": "/tmp/nonexistent.json",
        },
    )
    cfg = client.get("/api/config").json()
    assert cfg["public_domain"] == "catodo.example.com"
    assert cfg["tunnel_provider"] == "cloudflare"


def test_config_post_accepts_empty_public_domain(client):
    """Empty public_domain is the legitimate default — Tailscale lo calcula solo,
    o todavía no se configuró. No debe romper el POST."""
    r = client.post(
        "/api/config",
        json={
            "public_domain": "",
            "tunnel_provider": "tailscale-funnel",
        },
    )
    assert r.status_code == 200, r.text
    cfg = client.get("/api/config").json()
    assert cfg["public_domain"] == ""
    assert cfg["tunnel_provider"] == "tailscale-funnel"


def test_token_not_required_when_tunnel_disabled(client):
    """With CATODO_TOKEN unset and tunnel_enabled=false, /api/state is reachable."""
    # Make sure no env token
    import os
    old = os.environ.pop("CATODO_TOKEN", None)
    try:
        # tunnel_enabled defaults to False → no token required
        r = client.get("/api/state")
        assert r.status_code == 200
    finally:
        if old is not None:
            os.environ["CATODO_TOKEN"] = old


def test_token_required_when_tunnel_enabled(client, monkeypatch):
    """With tunnel_enabled=true, /api/state returns 401 without a token."""
    import os
    monkeypatch.delenv("CATODO_TOKEN", raising=False)
    r = client.post(
        "/api/config",
        json={
            "public_domain": "catodo.example.com",
            "tunnel_provider": "cloudflare",
            "tunnel_token_path": "/tmp/nonexistent.json",
            "tunnel_enabled": True,
            "tunnel_require_token": True,
        },
    )
    assert r.status_code == 200, r.text
    # /api/health is exempt
    assert client.get("/api/health").status_code == 200
    # /api/pair/info is exempt
    assert client.get("/api/pair/info").status_code == 200
    # /api/tunnel/status is exempt
    assert client.get("/api/tunnel/status").status_code == 200
    # /api/tunnel/providers is exempt
    assert client.get("/api/tunnel/providers").status_code == 200
    # everything else requires a token
    r = client.get("/api/state")
    assert r.status_code == 401, r.text


def test_token_bypassed_for_loopback_clients(client, monkeypatch):
    """Configurar el túnel desde el kiosk (loopback) no debe quedar bloqueado
    por el middleware que acabamos de activar. El túnel es para acceso
    externo; los clientes loopback ya están en la LAN."""
    from catodo.main import _is_loopback, _is_token_required
    assert _is_loopback("127.0.0.1")
    assert _is_loopback("localhost")
    assert _is_loopback("::1")
    assert not _is_loopback("203.0.113.5")
    assert _is_token_required("/api/state", "203.0.113.5") is False  # tunnel disabled
    # tunnel_enabled=true simulado vía config: _is_token_required lo lee
    # desde runtime_config en el middleware real; acá probamos solo la
    # lógica pura (loopback siempre False).
    assert _is_token_required("/api/state", "127.0.0.1") is False
    monkeypatch.delenv("CATODO_TOKEN", raising=False)
    # Habilitar el túnel por config
    client.post(
        "/api/config",
        json={
            "public_domain": "catodo.example.com",
            "tunnel_provider": "cloudflare",
            "tunnel_token_path": "/tmp/nonexistent.json",
            "tunnel_enabled": True,
            "tunnel_require_token": True,
        },
    )
    # Loopback se saltea el token incluso con túnel activo
    assert _is_token_required("/api/config", "127.0.0.1") is False
    assert _is_token_required("/api/config", "localhost") is False
    # Remoto sí lo requiere
    assert _is_token_required("/api/config", "203.0.113.5") is True


def test_token_accepted_when_tunnel_enabled(client, monkeypatch):
    """With tunnel_enabled=true and correct token, /api/state returns 200."""
    monkeypatch.setenv("CATODO_TOKEN", "secret-123")
    r = client.post(
        "/api/config",
        json={
            "public_domain": "catodo.example.com",
            "tunnel_provider": "cloudflare",
            "tunnel_token_path": "/tmp/nonexistent.json",
            "tunnel_enabled": True,
            "tunnel_require_token": True,
        },
    )
    assert r.status_code == 200, r.text
    r = client.get("/api/state", headers={"X-Catodo-Token": "secret-123"})
    assert r.status_code == 200
