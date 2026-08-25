"""Per-channel volume — switch, persistencia y routing de sink."""
import pytest
from fastapi.testclient import TestClient

from catodo import manager as mgr_mod
from catodo.main import app


class _AlwaysAvailableSpotify:
    """SpotifyClientPort stub — available, no DBus calls, no pygobject needed."""

    def is_available(self) -> bool:
        return True

    async def play(self): return None
    async def pause(self): return None
    async def next(self): return None
    async def previous(self): return None
    async def set_volume(self, level: float): return None
    async def open_uri(self, uri: str): return None
    async def get_state(self): return {"available": True, "status": "Stopped"}


def _make_stub_spotify_client():
    return _AlwaysAvailableSpotify()


@pytest.fixture
def client(monkeypatch):
    # Force the spotify channel to register so the per-channel volume flow has
    # both a `media` channel (spotify) and the fallback youtube webview. Patch
    # the symbol imported into `catodo.main` (main does `from factory import`).
    import catodo.main as main_mod

    monkeypatch.setattr(main_mod, "build_spotify_client", _make_stub_spotify_client)
    with TestClient(app) as c:
        yield c


def _cfg(monkeypatch, **kw):
    base = {
        "per_channel_volume_enabled": True,
        "per_channel_volume_default": 50,
        "channel_audio_sinks": {},
    }
    base.update(kw)
    from catodo import runtime_config

    monkeypatch.setattr(runtime_config, "get", lambda k: base.get(k))


def test_volume_switches_per_channel(client, monkeypatch):
    _cfg(monkeypatch)
    applied = []

    async def fake_set(level):
        applied.append(level)
        return True

    monkeypatch.setattr(mgr_mod.mixer, "set_volume", fake_set)

    client.post("/api/channels/spotify/open")
    client.post("/api/volume?level=70")
    client.post("/api/channels/youtube/open")   # sin volumen guardado → default 50
    client.post("/api/channels/spotify/open")   # restaura 70
    assert applied[-3:] == [70, 50, 70]


def test_disabled_keeps_global(client, monkeypatch):
    _cfg(monkeypatch, per_channel_volume_enabled=False)
    applied = []

    async def fake_set(level):
        applied.append(level)
        return True

    monkeypatch.setattr(mgr_mod.mixer, "set_volume", fake_set)

    client.post("/api/channels/spotify/open")
    client.post("/api/volume?level=70")
    client.post("/api/channels/youtube/open")
    assert applied == [70]


def test_sink_routing(client, monkeypatch):
    _cfg(monkeypatch, channel_audio_sinks={"spotify": "bluez_sink"})
    calls = []

    async def fake_sink(name):
        calls.append(name)
        return True

    monkeypatch.setattr(mgr_mod.mixer, "set_default_sink", fake_sink)
    client.post("/api/channels/spotify/open")
    assert calls == ["bluez_sink"]
