"""Idle/screensaver — transiciones de estado y endpoint de actividad."""
import time

import pytest
from fastapi.testclient import TestClient

from catodo.idle import IdleManager
from catodo.main import app


class FakeBroker:
    def __init__(self):
        self.events = []

    async def publish(self, event):
        self.events.append(event)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _config_map(monkeypatch, screensaver=240, sleep=0):
    from catodo import runtime_config

    monkeypatch.setattr(
        runtime_config,
        "get",
        lambda k: {
            "idle_screensaver_seconds": screensaver,
            "idle_sleep_seconds": sleep,
        }.get(k),
    )


@pytest.mark.asyncio
async def test_transitions(monkeypatch):
    """Spec: idle-screensaver / Transiciones active→screensaver→sleep→active."""
    _config_map(monkeypatch, screensaver=5, sleep=3)
    broker = FakeBroker()
    idle = IdleManager(broker=broker)

    idle._last_activity = time.monotonic() - 6
    await idle._evaluate()
    assert idle.state == "screensaver"
    assert broker.events[-1]["event"] == "idle_screensaver_on"

    idle._last_activity = time.monotonic() - 9
    await idle._evaluate()
    assert idle.state == "sleep"
    assert broker.events[-1]["event"] == "idle_sleep_on"

    idle.touch()
    await idle._evaluate()
    assert idle.state == "active"
    assert broker.events[-1]["event"] == "idle_off"


@pytest.mark.asyncio
async def test_sleep_disabled(monkeypatch):
    """Spec: idle-screensaver / Sleep desactivado nunca entra en sleep."""
    _config_map(monkeypatch, screensaver=5, sleep=0)
    broker = FakeBroker()
    idle = IdleManager(broker=broker)

    idle._last_activity = time.monotonic() - 60
    await idle._evaluate()
    assert idle.state == "screensaver"
    assert all(e["event"] != "idle_sleep_on" for e in broker.events)


@pytest.mark.asyncio
async def test_no_event_spam(monkeypatch):
    """Spec: idle-screensaver / Solo publica en transición de estado."""
    _config_map(monkeypatch, screensaver=5, sleep=0)
    broker = FakeBroker()
    idle = IdleManager(broker=broker)

    idle._last_activity = time.monotonic() - 6
    await idle._evaluate()
    await idle._evaluate()  # mismo estado → sin evento extra
    assert len(broker.events) == 1


def test_activity_endpoint(client):
    """Spec: idle-screensaver / POST /api/activity responde ok."""
    r = client.post("/api/activity")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_middleware_touches_idle(client):
    """Spec: idle-screensaver / Una llamada API reinicia el contador."""
    idle = client.app.state.idle
    before = idle._last_activity
    client.get("/api/channels")
    assert idle._last_activity >= before
