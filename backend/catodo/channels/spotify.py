"""Spotify channel — controls the desktop Spotify client via MPRIS."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

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

    def __init__(self) -> None:
        from collections import deque

        self._con = None
        self._lock = asyncio.Lock()
        self._last_status: str = "Stopped"
        self._last_meta: dict = {}
        self._track_id: Optional[str] = None
        self._position_at_resume: float = 0.0
        self._resume_monotonic: Optional[float] = None
        self._history: deque = deque(maxlen=20)

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
                self._on_track_change(new_track_id, meta)
        if d:
            self._last_meta = d
        d["available"] = True
        d["position"] = self._compute_position()
        return d

    def _on_track_change(self, track_id: str, meta: Any) -> None:
        from time import time
        self._track_id = track_id
        self._position_at_resume = 0.0
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
            "played_at": time(),
        }
        if entry["title"] and not any(
            h.get("track_id") == track_id and (entry["played_at"] - h.get("played_at", 0)) < 2
            for h in self._history
        ):
            self._history.appendleft(entry)

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

    async def state(self) -> dict:
        snap = await self._read_state()
        return {"id": self.id, **snap}

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
