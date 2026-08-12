"""MQTT bridge — arranque condicional y traducción de comandos."""
import pytest

from catodo.mqtt_bridge import MqttBridge


class FakeBroker:
    def __init__(self):
        self.events = []

    async def publish(self, event):
        self.events.append(event)

    async def subscribe(self):
        for e in self.events:
            yield e
        yield await _never()


async def _never():
    import asyncio

    return await asyncio.sleep(3600)


class FakeManager:
    def __init__(self):
        self.current = None
        self.calls = []

    def list(self):
        return [
            {"id": "spotify", "name": "Spotify"},
            {"id": "youtube", "name": "YouTube"},
        ]

    async def open(self, cid):
        self.current = cid
        self.calls.append(("open", cid))

    async def next(self):
        self.calls.append(("next",))

    async def previous(self):
        self.calls.append(("prev",))

    async def command(self, cid, cmd, **kw):
        self.calls.append(("command", cid, cmd))

    async def adjust_volume(self, d):
        self.calls.append(("volume", d))

    async def set_volume(self, lvl):
        self.calls.append(("set_volume", lvl))

    def state(self):
        return {"current_channel_id": self.current, "volume": 50, "playing": False}


def _no_host(monkeypatch):
    from catodo import runtime_config

    monkeypatch.setattr(
        runtime_config,
        "get",
        lambda k: {
            "mqtt_host": "",
            "mqtt_port": 1883,
            "mqtt_user": None,
            "mqtt_pass": None,
            "mqtt_topic_prefix": "catodo",
        }.get(k),
    )


def _with_host(monkeypatch):
    from catodo import runtime_config

    monkeypatch.setattr(
        runtime_config,
        "get",
        lambda k: {
            "mqtt_host": "localhost",
            "mqtt_port": 1883,
            "mqtt_user": None,
            "mqtt_pass": None,
            "mqtt_topic_prefix": "catodo",
        }.get(k),
    )


def test_no_host_does_not_start(monkeypatch):
    _no_host(monkeypatch)
    mgr, broker = FakeManager(), FakeBroker()
    bridge = MqttBridge(mgr, broker)
    assert bridge._config()["host"] == ""


@pytest.mark.asyncio
async def test_open_by_id(monkeypatch):
    _with_host(monkeypatch)
    mgr, broker = FakeManager(), FakeBroker()
    bridge = MqttBridge(mgr, broker)
    await bridge._handle("catodo/cmd/channel", "youtube", "catodo")
    assert mgr.current == "youtube"


@pytest.mark.asyncio
async def test_open_by_name(monkeypatch):
    _with_host(monkeypatch)
    mgr, broker = FakeManager(), FakeBroker()
    bridge = MqttBridge(mgr, broker)
    await bridge._handle("catodo/cmd/channel", "poné spotify", "catodo")
    assert mgr.current == "spotify"


@pytest.mark.asyncio
async def test_navigation_and_volume(monkeypatch):
    _with_host(monkeypatch)
    mgr, broker = FakeManager(), FakeBroker()
    bridge = MqttBridge(mgr, broker)
    await bridge._handle("catodo/cmd/next", "", "catodo")
    await bridge._handle("catodo/cmd/prev", "", "catodo")
    await bridge._handle("catodo/cmd/volume", "+", "catodo")
    await bridge._handle("catodo/cmd/volume", "40", "catodo")
    assert mgr.calls == [("next",), ("prev",), ("volume", 5), ("set_volume", 40)]


@pytest.mark.asyncio
async def test_unknown_command_ignored(monkeypatch):
    _with_host(monkeypatch)
    mgr, broker = FakeManager(), FakeBroker()
    bridge = MqttBridge(mgr, broker)
    await bridge._handle("catodo/cmd/bogus", "x", "catodo")
    assert mgr.calls == []


@pytest.mark.asyncio
async def test_home_publishes_channel_changed(monkeypatch):
    _with_host(monkeypatch)
    mgr, broker = FakeManager(), FakeBroker()
    bridge = MqttBridge(mgr, broker)
    await bridge._handle("catodo/cmd/home", "", "catodo")
    assert broker.events == [{"event": "channel_changed", "channel_id": None}]
