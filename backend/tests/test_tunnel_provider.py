"""Tunnel provider abstraction — interface contract."""
import json
import subprocess
from unittest.mock import MagicMock

from catodo.tunnel import available, get_provider
from catodo.tunnel.provider import TunnelHandle, TunnelProvider, TunnelState


def test_cloudflare_registered():
    """Cloudflare is the default provider shipped with Cátodo."""
    assert "cloudflare" in available()
    p = get_provider("cloudflare")
    assert p is not None
    assert p.name == "cloudflare"


def test_tailscale_registered():
    """Tailscale Funnel is the second provider for users without a domain."""
    assert "tailscale-funnel" in available()
    p = get_provider("tailscale-funnel")
    assert p is not None
    assert p.name == "tailscale-funnel"


def test_unknown_provider_returns_none():
    assert get_provider("this-provider-does-not-exist") is None


def test_validate_config_reports_missing_binary(monkeypatch):
    """When cloudflared is not on PATH, validate_config returns errors."""
    from catodo.tunnel.providers.cloudflare import CloudflareTunnelProvider

    monkeypatch.setattr("shutil.which", lambda _name: None)
    monkeypatch.setattr(
        "catodo.runtime_config.get",
        lambda k, default=None: {
            "tunnel_token_path": "/nonexistent/token.json",
            "public_domain": "catodo.example.com",
        }.get(k, default),
    )
    errs = CloudflareTunnelProvider().validate_config()
    assert any("cloudflared" in e for e in errs), errs


def test_validate_config_reports_missing_token(monkeypatch, tmp_path):
    from catodo.tunnel.providers.cloudflare import CloudflareTunnelProvider

    monkeypatch.setattr("shutil.which", lambda _name: "/usr/bin/cloudflared")
    monkeypatch.setattr(
        "catodo.runtime_config.get",
        lambda k, default=None: {
            "tunnel_token_path": "/nonexistent/token.json",
            "public_domain": "catodo.example.com",
        }.get(k, default),
    )
    errs = CloudflareTunnelProvider().validate_config()
    assert any("token" in e for e in errs), errs


def test_protocol_shape():
    """TunnelProvider is duck-typed: any class with the right methods is accepted."""
    class FakeProvider:
        name = "fake"

        def validate_config(self):
            return []

        def start(self):
            return TunnelHandle(pid=123, started_at=0.0)

        def stop(self, handle, timeout=5.0):
            pass

        def is_running(self, handle):
            return True

        def health(self):
            return {"reachable": True, "latency_ms": 42}

    f = FakeProvider()
    # The Protocol is structural — just verify the contract is present.
    assert hasattr(f, "name") and callable(getattr(f, "validate_config", None))
    assert f.name == "fake"
    assert f.health() == {"reachable": True, "latency_ms": 42}


def test_tunnel_state_enum_values():
    assert TunnelState.stopped.value == "stopped"
    assert TunnelState.running.value == "running"
    assert TunnelState.failed.value == "failed"
    assert TunnelState.degraded.value == "degraded"


# --- Tailscale provider ---


def test_tailscale_validate_missing_binary(monkeypatch):
    """When tailscale is not on PATH, validate_config returns an error."""
    from catodo.tunnel.providers.tailscale import TailscaleFunnelProvider

    monkeypatch.setattr("shutil.which", lambda name: None if name == "tailscale" else "/usr/bin/" + name)
    errs = TailscaleFunnelProvider().validate_config()
    assert any("tailscale" in e for e in errs), errs


def test_tailscale_validate_reports_unauthenticated(monkeypatch):
    """When tailscale is on PATH but not authenticated, validate_config says so."""
    from catodo.tunnel.providers.tailscale import TailscaleFunnelProvider

    monkeypatch.setattr(
        "shutil.which",
        lambda name: "/usr/bin/tailscale" if name == "tailscale" else "/usr/bin/" + name,
    )

    def fake_check_output(cmd, *a, **kw):
        raise subprocess.CalledProcessError(1, cmd)

    import subprocess
    monkeypatch.setattr(subprocess, "check_output", fake_check_output)
    errs = TailscaleFunnelProvider().validate_config()
    assert any("authenticated" in e or "tailscale" in e for e in errs), errs


def test_tailscale_public_url_reads_dns_name(monkeypatch):
    """public_url() reads Self.DNSName from `tailscale status --json`."""
    from catodo.tunnel.providers.tailscale import TailscaleFunnelProvider

    monkeypatch.setattr(
        "shutil.which",
        lambda name: "/usr/bin/tailscale" if name == "tailscale" else "/usr/bin/" + name,
    )

    fake_json = json.dumps({"Self": {"DNSName": "catodo.tail-net.ts.net."}}).encode()

    def fake_check_output(cmd, *a, **kw):
        if "--json" in cmd:
            return fake_json
        return b""

    import subprocess
    monkeypatch.setattr(subprocess, "check_output", fake_check_output)
    url = TailscaleFunnelProvider().public_url()
    assert url == "https://catodo.tail-net.ts.net/"


def test_tailscale_validate_reports_funnel_disabled(monkeypatch):
    """Cuando 'tailscale up' corre pero el admin no habilitó Funnel en el
    tailnet, `tailscale funnel --bg <port>` CUELGA para siempre. validate_config
    debe detectarlo vía `Capabilities` y dar la URL para activarlo."""
    from catodo.tunnel.providers.tailscale import TailscaleFunnelProvider

    monkeypatch.setattr(
        "shutil.which",
        lambda name: "/usr/bin/tailscale" if name == "tailscale" else "/usr/bin/" + name,
    )

    # status --json con DNSName pero SIN cap funnel
    fake_json = json.dumps({
        "Self": {
            "DNSName": "catodo.tail-net.ts.net.",
            "NodeID": "nABCDEF",
            "Capabilities": ["https://tailscale.com/cap/ssh", "default-auto-update"],
        }
    }).encode()

    def fake_check_output(cmd, *a, **kw):
        if "--json" in cmd:
            return fake_json
        return b""

    import subprocess
    monkeypatch.setattr(subprocess, "check_output", fake_check_output)
    errs = TailscaleFunnelProvider().validate_config()
    assert any("Funnel" in e and "login.tailscale.com" in e for e in errs), errs
    # La URL debe tener el node ID correcto
    assert any("nABCDEF" in e for e in errs), errs


def test_tailscale_validate_passes_when_funnel_cap_present(monkeypatch):
    """Happy path: tailscale autenticado, Funnel cap presente → no errors."""
    from catodo.tunnel.providers.tailscale import TailscaleFunnelProvider

    monkeypatch.setattr(
        "shutil.which",
        lambda name: "/usr/bin/tailscale" if name == "tailscale" else "/usr/bin/" + name,
    )

    fake_json = json.dumps({
        "Self": {
            "DNSName": "catodo.tail-net.ts.net.",
            "NodeID": "nXYZ",
            "Capabilities": [
                "https://tailscale.com/cap/funnel",
                "https://tailscale.com/cap/ssh",
            ],
        }
    }).encode()

    def fake_check_output(cmd, *a, **kw):
        if "--json" in cmd:
            return fake_json
        return b""

    import subprocess
    monkeypatch.setattr(subprocess, "check_output", fake_check_output)
    errs = TailscaleFunnelProvider().validate_config()
    assert errs == [], errs
