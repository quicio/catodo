"""Runtime platform detection.

Lightweight module that the rest of the backend can import without side effects.
The factory consults these flags to pick the right adapter; tests can monkeypatch
`IS_MACOS`/`IS_LINUX` to simulate platforms.

`has_dbus()` probes the session bus via pygobject if available; returns False
when pygobject is missing (macOS by default) or the bus is unreachable.
"""
from __future__ import annotations

import logging
import sys

log = logging.getLogger("catodo.platform")

_IS_LINUX = sys.platform.startswith("linux")
_IS_MACOS = sys.platform == "darwin" or sys.platform.startswith("darwin")


def os_name() -> str:
    if _IS_MACOS:
        return "macos"
    if _IS_LINUX:
        return "linux"
    return sys.platform or "unknown"


# Read-only flags at runtime; tests monkeypatch the module attrs directly.
IS_LINUX = _IS_LINUX
IS_MACOS = _IS_MACOS


def has_dbus() -> bool:
    """True iff pygobject is importable AND the session bus is reachable.

    Used as a guard before registering channels/components that require DBus
    (Spotify/MPRIS). macOS does not provide DBus by default, so this returns
    False there unless the user installed it via brew (out of contract).
    """
    try:
        from gi.repository import Gio  # type: ignore  # noqa: PLC0415
    except Exception as e:
        log.debug("has_dbus: pygobject unavailable: %s", e)
        return False
    try:
        Gio.bus_get_sync(Gio.BusType.SESSION, None)
        return True
    except Exception as e:
        log.debug("has_dbus: session bus unavailable: %s", e)
        return False