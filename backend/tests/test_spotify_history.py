"""Spotify history — deduplicación de pistas repetidas (ej. tras reinicios)."""
import asyncio

from catodo import store
from catodo.channels.spotify import SpotifyChannel


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

    ch = SpotifyChannel()
    assert [h["title"] for h in ch.history()] == ["Kabalah", "Otra", "Kabalah"]


async def test_track_change_no_consecutive_duplicate(monkeypatch):
    """Spec: spotify-history / La misma pista detectada dos veces no se duplica."""
    _noop_store(monkeypatch)
    ch = SpotifyChannel()
    ch._last_status = "Playing"
    meta = {"mpris:trackid": "/com/spotify/track/X", "xesam:title": "X"}
    ch._on_track_change("/com/spotify/track/X", meta)
    ch._on_track_change("/com/spotify/track/X", meta)
    await asyncio.sleep(0)  # dejar terminar el save en background
    assert len(ch.history()) == 1


def test_resume_same_track_not_readded(monkeypatch):
    """Spec: spotify-history / Al reanudar con la última pista no se re-agrega."""
    _noop_store(monkeypatch)
    entries = [_entry("/com/spotify/track/A", "Kabalah", 1000)]
    monkeypatch.setattr(store, "load", lambda *_a, **_k: {"version": 1, "items": entries})
    ch = SpotifyChannel()

    async def fake_get(prop):
        if prop == "PlaybackStatus":
            return "Playing"
        if prop == "Metadata":
            return {"mpris:trackid": "/com/spotify/track/A", "xesam:title": "Kabalah"}
        return None

    monkeypatch.setattr(ch, "_get", fake_get)
    asyncio.run(ch._read_state())
    assert len(ch.history()) == 1
