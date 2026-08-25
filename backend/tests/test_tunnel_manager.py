"""TunnelManager — orchestration, persistence, status transitions."""
import asyncio
import json
import os

import pytest

from catodo import runtime_config
from catodo.tunnel.manager import STATE_FILE, TunnelManager, TunnelStatus
from catodo.tunnel.provider import TunnelState


@pytest.fixture
def mgr(tmp_data_dir):
    runtime_config._config = None
    return TunnelManager()


def test_load_state_when_no_file(mgr):
    s = mgr.status()
    assert s["state"] == TunnelState.stopped.value
    assert s["provider"] == ""
    assert s["pid"] is None


def test_persistence_round_trip(tmp_data_dir):
    mgr = TunnelManager()
    status = TunnelStatus(
        state=TunnelState.running.value,
        provider="cloudflare",
        pid=12345,
        started_at=1.0,
    )
    mgr._save_inner(status)
    assert os.path.isfile(STATE_FILE)
    loaded = TunnelManager()._load()
    assert loaded.state == "running"
    assert loaded.provider == "cloudflare"
    assert loaded.pid == 12345


def test_corrupt_state_recovers(tmp_data_dir):
    with open(STATE_FILE, "w") as f:
        f.write("not json {{{")
    mgr = TunnelManager()
    s = mgr.status()
    assert s["state"] == TunnelState.stopped.value


def test_providers_lists_registered(mgr):
    out = mgr.providers()
    names = [p["name"] for p in out]
    assert "cloudflare" in names
    for p in out:
        assert "configured" in p


def test_health_when_stopped(mgr):
    h = mgr.health()
    assert h["reachable"] is False
    assert h.get("reason") == "stopped"


def test_shutdown_is_idempotent(mgr):
    asyncio.run(mgr.shutdown())
    asyncio.run(mgr.shutdown())  # no exception


def test_reconcile_syncs_running_when_provider_up(monkeypatch, tmp_data_dir):
    """Si el estado en disco dice 'failed' pero el provider está realmente
    corriendo (ej. lo levantaste a mano), reconcile() tiene que resyncar a
    'running' y arrancar el watcher."""
    runtime_config._config = None
    # Estado stale: dice failed, sin handle
    with open(STATE_FILE, "w") as f:
        json.dump({
            "state": TunnelState.failed.value,
            "provider": "tailscale-funnel",
            "pid": None,
            "started_at": None,
            "last_error": "old error",
        }, f)
    mgr = TunnelManager()

    # Provider mockeado: está realmente corriendo
    fake_provider = type("P", (), {
        "name": "tailscale-funnel",
        "is_running": lambda self, h: True,
    })()
    monkeypatch.setattr("catodo.tunnel.manager.get_provider", lambda _n: fake_provider)

    asyncio.run(mgr.reconcile())
    s = mgr.status()
    assert s["state"] == TunnelState.running.value
    assert s["last_error"] is None
    # El watcher se spawneó
    assert mgr._watcher is not None
    mgr._watcher.cancel()


def test_reconcile_resets_failed_to_stopped_when_nothing_up(monkeypatch, tmp_data_dir):
    """Si el estado dice 'failed' y realmente no hay nada arriba, hay que
    limpiar a 'stopped' para no mentir en el UI."""
    runtime_config._config = None
    with open(STATE_FILE, "w") as f:
        json.dump({
            "state": TunnelState.failed.value,
            "provider": "tailscale-funnel",
            "pid": None,
            "started_at": None,
            "last_error": "old error",
        }, f)
    mgr = TunnelManager()

    fake_provider = type("P", (), {
        "name": "tailscale-funnel",
        "is_running": lambda self, h: False,
    })()
    monkeypatch.setattr("catodo.tunnel.manager.get_provider", lambda _n: fake_provider)

    asyncio.run(mgr.reconcile())
    s = mgr.status()
    assert s["state"] == TunnelState.stopped.value
    assert s["last_error"] is None
