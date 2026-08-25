"""Linux SpotifyClientPort adapter: DBus/MPRIS control of desktop Spotify.

Encapsulates the DBus session-bus interaction that the original
`catodo/channels/spotify.py` did inline. The channel composes this client
with its own watcher loop, history, and position tracking.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

log = logging.getLogger("catodo.infrastructure.linux.spotify_client")

BUS_NAME = "org.mpris.MediaPlayer2.spotify"
OBJECT_PATH = "/org/mpris/MediaPlayer2"
PLAYER_IFACE = "org.mpris.MediaPlayer2.Player"
PROPS_IFACE = "org.freedesktop.DBus.Properties"


def _variant_unpack(v: Any) -> Any:
    try:
        if hasattr(v, "unpack"):
            return v.unpack()
    except Exception:
        pass
    return v


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


class DbusSpotifyClient:
    """DBus/MPRIS adapter for the desktop Spotify client."""

    def __init__(self) -> None:
        self._con = None
        self._lock = asyncio.Lock()

    async def _ensure(self):
        async with self._lock:
            if self._con is not None:
                return self._con
            try:
                from gi.repository import Gio  # type: ignore
            except Exception as e:
                log.debug("DbusSpotifyClient: pygobject unavailable: %s", e)
                return None
            try:
                self._con = Gio.bus_get_sync(Gio.BusType.SESSION, None)
            except Exception as e:
                log.debug("DbusSpotifyClient: session bus unavailable: %s", e)
                return None
            return self._con

    def is_available(self) -> bool:
        """Synchronous best-effort check: gi importable + session bus reachable."""
        try:
            from gi.repository import Gio  # type: ignore
        except Exception:
            return False
        try:
            Gio.bus_get_sync(Gio.BusType.SESSION, None)
            return True
        except Exception:
            return False

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
                BUS_NAME, OBJECT_PATH, PROPS_IFACE, "Get",
                args, GLib.VariantType.new("(v)"),
                Gio.DBusCallFlags.NONE, 2000, None,
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
                BUS_NAME, OBJECT_PATH, PROPS_IFACE, "Set",
                args, None, Gio.DBusCallFlags.NONE, 2000, None,
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
                BUS_NAME, OBJECT_PATH, PLAYER_IFACE, method,
                None, None, Gio.DBusCallFlags.NONE, 2000, None,
            )
        except Exception as e:
            log.debug("mpris %s failed: %s", method, e)

    async def play(self) -> None:
        await self._call_method("Play")

    async def pause(self) -> None:
        await self._call_method("Pause")

    async def next(self) -> None:
        await self._call_method("Next")

    async def previous(self) -> None:
        await self._call_method("Previous")

    async def set_volume(self, level: float) -> None:
        level = max(0.0, min(1.0, float(level)))
        await self._set("Volume", level)

    async def open_uri(self, uri: str) -> None:
        """Delegate URI opening to the platform uri_opener (set via composition)."""
        from catodo import uri_opener as _uri_opener_facade

        _uri_opener_facade.open(uri)

    async def get_state(self) -> dict[str, Any]:
        status = await self._get("PlaybackStatus")
        meta = await self._get("Metadata")
        if status is None and meta is None:
            return {"available": False}
        d = _meta_to_dict(meta) if meta else {}
        if status is not None:
            d["status"] = str(status)
        if isinstance(meta, dict):
            tid = meta.get("mpris:trackid")
            if tid:
                d["track_id"] = tid
        # Position in seconds (MPRIS returns µs); None if unavailable.
        pos_us = await self._get("Position")
        if pos_us is not None:
            try:
                d["position"] = float(pos_us) / 1_000_000.0
            except (TypeError, ValueError):
                pass
        d["available"] = True
        return d