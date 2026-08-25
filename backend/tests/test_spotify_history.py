"""Spotify history — deduplicación de pistas repetidas (ej. tras reinicios)."""
import asyncio
from typing import Any

from catodo import store
from catodo.channels.spotify import SpotifyChannel
from catodo.domain.ports import SpotifyClientPort


class _StubSpotifyClient(SpotifyClientPort):
    """Minimal port impl for tests — available, no DBus calls."""

    def __init__(self) -> None:
        self.is_available_return = True

    def is_available(self) -> bool:
        return self.is_available_return

    async def play(self): return None

    async def pause(self): return None

    async def next(self): return None

    async def previous(self): return None

    async def set_volume(self, level: float): return None

    async def open_uri(self, uri: str): return None

    async def get_state(self) -> dict[str, Any]:
        return {"available": True, "status": "Stopped"}


def _entry(track_id, title, played_at):
    return {
        "track_id": track_id,
        "spotify_uri": "spotify:track:" + track_id.rsplit("/", 1)[-1],
        "title": title,
        "artist": "Artist",
        "album": "Album",
        "art_url": "",
        "played_at": played_at,
    }


def _noop_store(monkeypatch):
    async def fake_save(*_a, **_k):
        pass

    monkeypatch.setattr(store, "save", fake_save)
    monkeypatch.setattr(store, "load", lambda *_a, **_k: {"version": 1, "items": []})


def test_load_history_collapses_consecutive_duplicates(monkeypatch):
    """Spec: spotify-history / Duplicados consecutivos se colapsan al cargar."""
    _noop_store(monkeypatch)
    entries = [
        _entry("/com/spotify/track/A", "Kabalah", 1000),
        _entry("/com/spotify/track/A", "Kabalah", 1005),
        _entry("/com/spotify/track/A", "Kabalah", 1010),
        _entry("/com/spotify/track/B", "Otra", 2000),
        _entry("/com/spotify/track/A", "Kabalah", 3000),
    ]
    monkeypatch.setattr(store, "load", lambda *_a, **_k: {"version": 1, "items": entries})

    ch = SpotifyChannel(_StubSpotifyClient())
    assert [h["title"] for h in ch.history()] == ["Kabalah", "Otra", "Kabalah"]


async def test_track_change_no_consecutive_duplicate(monkeypatch):
    """Spec: spotify-history / La misma pista detectada dos veces no se duplica."""
    _noop_store(monkeypatch)
    ch = SpotifyChannel(_StubSpotifyClient())
    ch._last_status = "Playing"
    meta = {"track_id": "/com/spotify/track/X", "title": "X"}
    ch._on_track_change("/com/spotify/track/X", meta)
    ch._on_track_change("/com/spotify/track/X", meta)
    await asyncio.sleep(0)  # dejar terminar el save en background
    assert len(ch.history()) == 1


def test_resume_same_track_not_readded(monkeypatch):
    """Spec: spotify-history / Al reanudar con la última pista no se re-agrega."""
    _noop_store(monkeypatch)
    entries = [_entry("/com/spotify/track/A", "Kabalah", 1000)]
    monkeypatch.setattr(store, "load", lambda *_a, **_k: {"version": 1, "items": entries})

    client = _StubSpotifyClient()

    async def fake_get_state() -> dict[str, Any]:
        return {
            "available": True,
            "status": "Playing",
            "track_id": "/com/spotify/track/A",
            "title": "Kabalah",
            "artist": "Artist",
            "album": "Album",
            "art_url": "",
            "position": 0.0,
        }

    client.get_state = fake_get_state  # type: ignore[assignment]
    ch = SpotifyChannel(client)
    asyncio.run(ch._read_state())
    assert len(ch.history()) == 1
