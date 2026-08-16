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
