"""Spotify channel — controls the desktop Spotify client via MPRIS."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from catodo.channel import Channel

log = logging.getLogger("catodo.spotify")

BUS_NAME = "org.mpris.MediaPlayer2.spotify"
OBJECT_PATH = "/org/mpris/MediaPlayer2"
PLAYER_IFACE = "org.mpris.MediaPlayer2.Player"
PROPS_IFACE = "org.freedesktop.DBus.Properties"


def _to_variant(v: Any):
    from gi.repository import GLib  # type: ignore

    if isinstance(v, str):
        return GLib.Variant.new_string(v)
    if isinstance(v, bool):
        return GLib.Variant.new_boolean(v)
    if isinstance(v, int):
        return GLib.Variant.new_int64(v)
    if isinstance(v, float):
        return GLib.Variant.new_double(v)
    if isinstance(v, tuple):
        return GLib.Variant.new_tuple(*[_to_variant(x) for x in v])
    return GLib.Variant.new_string(str(v))


def _variant_unpack(v: Any) -> Any:
    try:
        if hasattr(v, "unpack"):
            return v.unpack()
    except Exception:
        pass
    return v


class SpotifyChannel(Channel):
    id = "spotify"
    name = "Spotify"
    icon = "music"
    type = "media"
    order = 0
    capabilities = frozenset(["history"])

    def __init__(self) -> None:
        from collections import deque

        self._con = None
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

    async def _ensure(self):
        async with self._lock:
            if self._con is not None:
                return self._con
            try:
                from gi.repository import Gio  # type: ignore
            except Exception as e:
                log.warning("pygobject unavailable: %s", e)
                return None
            try:
                self._con = Gio.bus_get_sync(Gio.BusType.SESSION, None)
            except Exception as e:
                log.warning("DBus session bus unavailable: %s", e)
                return None
            return self._con

    async def _get(self, prop: str):
        from gi.repository import Gio, GLib  # type: ignore

        con = await self._ensure()
        if con is None:
            return None
        try:
            args = GLib.Variant.new_tuple(
                GLib.Variant.new_string(PLAYER_IFACE),
                GLib.Variant.new_string(prop),
            )
            result = con.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                PROPS_IFACE,
                "Get",
                args,
                GLib.VariantType.new("(v)"),
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
            v = result.unpack()[0]
            return _variant_unpack(v)
        except Exception as e:
            log.debug("mpris Get %s failed: %s", prop, e)
            return None

    async def _set(self, prop: str, value) -> None:
        from gi.repository import Gio, GLib  # type: ignore

        con = await self._ensure()
        if con is None:
            return
        try:
            inner = GLib.Variant.new_variant(_to_variant(value))
            args = GLib.Variant.new_tuple(
                GLib.Variant.new_string(PLAYER_IFACE),
                GLib.Variant.new_string(prop),
                inner,
            )
            con.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                PROPS_IFACE,
                "Set",
                args,
                None,
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
        except Exception as e:
            log.debug("mpris Set %s failed: %s", prop, e)

    async def _call_method(self, method: str) -> None:
        from gi.repository import Gio  # type: ignore

        con = await self._ensure()
        if con is None:
            return
        try:
            con.call_sync(
                BUS_NAME,
                OBJECT_PATH,
                PLAYER_IFACE,
                method,
                None,
                None,
                Gio.DBusCallFlags.NONE,
                2000,
                None,
            )
        except Exception as e:
            log.debug("mpris %s failed: %s", method, e)

    @staticmethod
    def _meta_to_dict(meta) -> dict:
        if not isinstance(meta, dict):
            return {}
        try:
            return {
                "title": str(meta.get("xesam:title", "") or ""),
                "artist": " · ".join(
                    str(a) for a in (meta.get("xesam:artist") or [])
                ),
                "album": str(meta.get("xesam:album", "") or ""),
                "art_url": str(meta.get("mpris:artUrl", "") or ""),
            }
        except Exception:
            return {}

    async def _read_state(self) -> dict:
        status = await self._get("PlaybackStatus")
        meta = await self._get("Metadata")
        if status is None and meta is None:
            return {"available": False}
        d = self._meta_to_dict(meta) if meta else dict(self._last_meta)
        if status is not None:
            new_status = str(status)
            if new_status != self._last_status:
                self._on_status_change(new_status)
            self._last_status = new_status
            d["status"] = new_status
        else:
            d["status"] = self._last_status
        if meta:
            new_track_id = meta.get("mpris:trackid") if isinstance(meta, dict) else None
            if new_track_id and new_track_id != self._track_id:
                # Al reanudar (ej. reinicio del backend) no re-agregar la pista que
                # ya quedó como la última del historial.
                if self._history and self._history[0].get("track_id") == new_track_id:
                    self._track_id = new_track_id
                else:
                    self._on_track_change(new_track_id, meta)
        if d:
            self._last_meta = d
        d["available"] = True
        d["position"] = await self._read_position()
        return d

    async def _read_position(self) -> float:
        """Posición de la pista (segundos).

        Durante la reproducción avanza con un estimador por monotonic para
        que el progreso fluya en el frontend sin depender del polling de MPRIS.
        Cuando la posición real de MPRIS (`Position`, en µs) difiere mucho del
        estimador —seek manual o backend arrancado a mitad de tema— se
        resincroniza el estimador para que coincida.
        """
        if self._last_status != "Playing":
            return self._position_at_resume
        real = await self._get("Position")
        if real is not None:
            try:
                real = float(real) / 1_000_000.0
            except (TypeError, ValueError):
                real = None
            if real is not None:
                est = self._compute_position()
                if abs(real - est) > 1.5:
                    self._position_at_resume = real
                    self._resume_monotonic = time.monotonic()
        return self._compute_position()

    def _on_track_change(self, track_id: str, meta: Any) -> None:
        self._track_id = track_id
        self._position_at_resume = 0.0
        self._last_published_position = -1.0
        self._resume_monotonic = time.monotonic() if self._last_status == "Playing" else None
        spotify_uri = None
        if isinstance(meta, dict):
            tid = meta.get("mpris:trackid") or ""
            if tid.startswith("/com/spotify/track/"):
                spotify_uri = "spotify:track:" + tid.split("/")[-1]
        entry = {
            "track_id": track_id,
            "spotify_uri": spotify_uri,
            "title": str(meta.get("xesam:title", "") if isinstance(meta, dict) else ""),
            "artist": " · ".join(
                str(a) for a in (meta.get("xesam:artist", []) if isinstance(meta, dict) else [])
            ),
            "album": str(meta.get("xesam:album", "") if isinstance(meta, dict) else ""),
            "art_url": str(meta.get("mpris:artUrl", "") if isinstance(meta, dict) else ""),
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
        await self._call_method("Play")

    async def close(self) -> None:
        await self._call_method("Pause")

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "play":
            await self._call_method("Play")
        elif cmd == "pause":
            await self._call_method("Pause")
        elif cmd == "next":
            await self._call_method("Next")
        elif cmd == "prev":
            await self._call_method("Previous")
        elif cmd == "toggle":
            if self._last_status == "Playing":
                await self._call_method("Pause")
            else:
                await self._call_method("Play")
        elif cmd == "volume":
            level = float(kwargs.get("level", 1.0))
            level = max(0.0, min(1.0, level))
            await self._set("Volume", level)
        elif cmd == "open_uri":
            uri = kwargs.get("uri", "")
            if uri:
                await self._open_uri(uri)
        else:
            log.warning("unknown spotify command: %s", cmd)

    async def _open_uri(self, uri: str) -> None:
        import shutil
        import subprocess

        bin_ = shutil.which("xdg-open") or shutil.which("gio")
        if bin_:
            try:
                subprocess.Popen(
                    [bin_, uri],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                log.info("opened spotify uri via %s: %s", bin_, uri)
                return
            except Exception as e:
                log.warning("open_uri failed with %s: %s", bin_, e)
        try:
            import webbrowser

            webbrowser.open(uri)
        except Exception as e:
            log.warning("webbrowser.open failed for uri: %s", e)
