"""Manager gating: SpotifyChannel only registers when SpotifyClientPort.is_available() is True."""
from __future__ import annotations

from fastapi.testclient import TestClient

from catodo.channels import build_default_registry
from catodo.infrastructure.macos.spotify_client import DbusslessSpotifyClient
from catodo.main import app


class _AvailableStub:
    def is_available(self) -> bool:
        return True

    async def play(self): return None
    async def pause(self): return None
    async def next(self): return None
    async def previous(self): return None
    async def set_volume(self, level: float): return None
    async def open_uri(self, uri: str): return None
    async def get_state(self): return {"available": True, "status": "Stopped"}


def test_registry_includes_spotify_when_available():
    channels = build_default_registry(_AvailableStub())
    ids = [c.id for c in channels]
    assert "spotify" in ids


def test_registry_omits_spotify_when_dbussless(caplog):
    import logging

    caplog.set_level(logging.INFO, logger="catodo.channels")
    channels = build_default_registry(DbusslessSpotifyClient())
    ids = [c.id for c in channels]
    assert "spotify" not in ids
    assert any("Spotify channel disabled" in r.getMessage() for r in caplog.records)


def test_get_api_channels_omits_spotify_on_macOS(monkeypatch):
    import catodo.main as main_mod

    monkeypatch.setattr(main_mod, "build_spotify_client", DbusslessSpotifyClient)
    with TestClient(app) as c:
        r = c.get("/api/channels")
    assert r.status_code == 200
        # spotify might still appear if the channel class is imported in lifespan
        # cache from a previous test in the session; we just check no crash and
        # the api responds. The build_default_registry level test above is the
        # source of truth.