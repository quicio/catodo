"""Spotify channel — wraps a SpotifyClientPort with channel-level concerns.

Channel-level concerns: state history (capped at 20), monotonic position
estimator, watcher loop that publishes events, lifecycle (open/close/command).

All DBus/MPRIS interaction lives in `catodo.infrastructure.linux.spotify_client
.DbusSpotifyClient`; the macOS null adapter lives in
`catodo.infrastructure.macos.spotify_client.DbusslessSpotifyClient`. This file
only consumes the port.
"""
from __future__ import annotations

import asyncio
import logging
import time

from catodo.channel import Channel
from catodo.domain.ports import SpotifyClientPort

log = logging.getLogger("catodo.spotify")


class SpotifyChannel(Channel):
    id = "spotify"
    name = "Spotify"
    icon = "music"
    type = "media"
    order = 0
    capabilities = frozenset(["history"])

    def __init__(self, client: SpotifyClientPort) -> None:
        from collections import deque

        self._client = client
        self._lock = asyncio.Lock()
        self._last_status: str = "Stopped"
        self._last_meta: dict = {}
        self._track_id: str | None = None
        self._position_at_resume: float = 0.0
        self._resume_monotonic: float | None = None
        self._history: deque = deque(maxlen=20)
        self._broker = None
        self._watcher_task: asyncio.Task | None = None
        self._load_history()

    def _load_history(self) -> None:
        from catodo import store

        entries = store.load("spotify_history", {"version": 1, "items": []}).get("items", [])
        last_id = None
        for entry in entries[:20]:
            track_id = entry.get("track_id")
            if track_id and track_id == last_id:
                continue
            if track_id:
                last_id = track_id
            self._history.append(entry)

    async def _publish_position(self, snap: dict) -> None:
        if self._broker is None:
            return
        pos = snap.get("position", 0)
        if abs(pos - getattr(self, "_last_published_position", -1.0)) >= 0.5:
            self._last_published_position = pos
            await self._broker.publish({
                "event": "playback_progress",
                "channel_id": self.id,
                "position": pos,
                "status": snap.get("status"),
            })

    async def _save_history(self) -> None:
        from catodo import store

        await store.save("spotify_history", {"version": 1, "items": list(self._history)})

    def attach_broker(self, broker) -> None:
        self._broker = broker
        self._watcher_task = asyncio.create_task(self._watcher())

    async def _watcher(self) -> None:
        while self._watcher_task is not None:
            try:
                snap = await self._read_state()
                if self._broker and snap.get("available"):
                    if snap.get("status") != self._last_status:
                        await self._broker.publish({
                            "event": "playback_status_changed",
                            "channel_id": self.id,
                            "status": snap.get("status"),
                            "position": snap.get("position", 0),
                        })
                    new_track = self._track_id
                    if new_track and snap.get("title"):
                        prev_meta = getattr(self, "_watcher_last_meta", {})
                        if (snap.get("title"), snap.get("artist")) != (prev_meta.get("title"), prev_meta.get("artist")):  # noqa: E501
                            self._watcher_last_meta = snap
                            await self._broker.publish({
                                "event": "track_changed",
                                "channel_id": self.id,
                                "title": snap.get("title"),
                                "artist": snap.get("artist"),
                                "album": snap.get("album", ""),
                                "art_url": snap.get("art_url", ""),
                                "status": snap.get("status"),
                            })
                    if snap.get("status") == "Playing":
                        await self._publish_position(snap)
            except Exception:
                pass
            await asyncio.sleep(1)

    async def _read_state(self) -> dict:
        if not self._client.is_available():
            return {"available": False}
        snap = await self._client.get_state()
        if not snap.get("available"):
            return snap
        status = snap.get("status")
        if status is not None:
            new_status = str(status)
            if new_status != self._last_status:
                self._on_status_change(new_status)
            self._last_status = new_status
        new_track_id = snap.get("track_id")
        if new_track_id and new_track_id != self._track_id:
            # Al reanudar (ej. reinicio del backend) no re-agregar la pista que
            # ya quedó como la última del historial.
            if self._history and self._history[0].get("track_id") == new_track_id:
                self._track_id = new_track_id
            else:
                self._on_track_change(new_track_id, snap)
        self._last_meta = {k: v for k, v in snap.items() if k != "track_id"}
        snap["position"] = await self._read_position(snap.get("position"))
        return snap

    async def _read_position(self, real: float | None = None) -> float:
        """Posición de la pista (segundos).

        Durante la reproducción avanza con un estimador por monotonic para
        que el progreso fluya en el frontend sin depender del polling de MPRIS.
        Cuando la posición real de MPRIS (`Position`, en µs) difiere mucho del
        estimador —seek manual o backend arrancado a mitad de tema— se
        resincroniza el estimador para que coincida.
        """
        if self._last_status != "Playing":
            return self._position_at_resume
        if real is not None:
            est = self._compute_position()
            if abs(real - est) > 1.5:
                self._position_at_resume = real
                self._resume_monotonic = time.monotonic()
        return self._compute_position()

    def _on_track_change(self, track_id: str, meta) -> None:
        self._track_id = track_id
        self._position_at_resume = 0.0
        self._last_published_position = -1.0
        self._resume_monotonic = time.monotonic() if self._last_status == "Playing" else None
        spotify_uri = None
        if isinstance(meta, dict):
            tid = meta.get("track_id") or ""
            if tid.startswith("/com/spotify/track/"):
                spotify_uri = "spotify:track:" + tid.split("/")[-1]
        entry = {
            "track_id": track_id,
            "spotify_uri": spotify_uri,
            "title": str(meta.get("title", "")) if isinstance(meta, dict) else "",
            "artist": (
                " · ".join(str(a) for a in meta.get("artist", []))
                if isinstance(meta.get("artist"), list)
                else str(meta.get("artist", "") if isinstance(meta, dict) else "")
            ),
            "album": str(meta.get("album", "")) if isinstance(meta, dict) else "",
            "art_url": str(meta.get("art_url", "")) if isinstance(meta, dict) else "",
            "played_at": time.time(),
        }
        if entry["title"] and not any(
            h.get("track_id") == track_id and (entry["played_at"] - h.get("played_at", 0)) < 2
            for h in self._history
        ):
            self._history.appendleft(entry)
            asyncio.ensure_future(self._save_history())

    def history(self) -> list:
        return list(self._history)

    async def state(self) -> dict:
        snap = await self._read_state()
        return {"id": self.id, **snap}

    async def history_state(self) -> dict:
        return {"id": self.id, "items": self.history()}

    def _on_status_change(self, new_status: str) -> None:
        if new_status == "Playing":
            self._resume_monotonic = time.monotonic()
        elif new_status == "Paused":
            if self._resume_monotonic is not None:
                self._position_at_resume += time.monotonic() - self._resume_monotonic
                self._resume_monotonic = None

    def _compute_position(self) -> float:
        if self._last_status == "Playing" and self._resume_monotonic is not None:
            return self._position_at_resume + (time.monotonic() - self._resume_monotonic)
        return self._position_at_resume

    async def open(self) -> None:
        await self._client.play()

    async def close(self) -> None:
        await self._client.pause()

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "play":
            await self._client.play()
        elif cmd == "pause":
            await self._client.pause()
        elif cmd == "next":
            await self._client.next()
        elif cmd == "prev":
            await self._client.previous()
        elif cmd == "toggle":
            if self._last_status == "Playing":
                await self._client.pause()
            else:
                await self._client.play()
        elif cmd == "volume":
            level = float(kwargs.get("level", 1.0))
            level = max(0.0, min(1.0, level))
            await self._client.set_volume(level)
        elif cmd == "open_uri":
            uri = kwargs.get("uri", "")
            if uri:
                await self._open_uri(uri)
        else:
            log.warning("unknown spotify command: %s", cmd)

    async def _open_uri(self, uri: str) -> None:
        await self._client.open_uri(uri)