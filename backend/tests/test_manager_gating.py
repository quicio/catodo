"""Manager gating: SpotifyChannel only registers when SpotifyClientPort.is_available() is True."""
from __future__ import annotations

import logging

from fastapi.testclient import TestClient

from catodo.channels import build_default_registry
from catodo.infrastructure.macos.spotify_client import ApplescriptSpotifyClient
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


class _UnavailableAppleScript(ApplescriptSpotifyClient):
    """Adapter que simula Spotify.app ausente (is_available retorna False)."""

    def __init__(self) -> None:
        # Skip parent's __init__ que podría loggear
        pass

    def is_available(self) -> bool:
        return False


def test_registry_includes_spotify_when_available():
    channels = build_default_registry(_AvailableStub())
    ids = [c.id for c in channels]
    assert "spotify" in ids


def test_registry_omits_spotify_when_unavailable(caplog):
    caplog.set_level(logging.INFO, logger="catodo.channels")
    channels = build_default_registry(_UnavailableAppleScript())
    ids = [c.id for c in channels]
    assert "spotify" not in ids
    assert any("Spotify channel disabled" in r.getMessage() for r in caplog.records)


def test_get_api_channels_omits_spotify_on_macOS_without_spotify_app(monkeypatch):
    import catodo.main as main_mod

    # Spotify.app ausente → is_available() False → canal omitido del registry
    monkeypatch.setattr(main_mod, "build_spotify_client", _UnavailableAppleScript)
    with TestClient(app) as c:
        r = c.get("/api/channels")
    assert r.status_code == 200
    assert "spotify" not in [c["id"] for c in r.json()]


def test_get_api_channels_includes_spotify_when_spotify_app_installed(monkeypatch, tmp_path):
    import catodo.main as main_mod

    # Spotify.app presente + osascript disponible → canal registrado
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._spotify_installed",
        lambda: True,
    )
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._osascript_bin",
        lambda: "/usr/bin/osascript",
    )
    monkeypatch.setattr(main_mod, "build_spotify_client", ApplescriptSpotifyClient)
    with TestClient(app) as c:
        r = c.get("/api/channels")
    assert r.status_code == 200
    assert "spotify" in [c["id"] for c in r.json()]