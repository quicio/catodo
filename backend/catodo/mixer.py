"""Mixer facade — thin module-level wrapper over the MixerPort wired at startup.

Keeps the original `get_volume` / `set_volume` / `adjust_volume` /
`set_default_sink` / `has_mixer` signatures so call sites in `manager.py`,
`api.py`, etc. are unchanged. The actual implementation lives in the platform
adapter chosen by `infrastructure.factory.build_mixer()`; this module just
delegates.

`set_port(port)` is called once from the composition root in `main.py:44
lifespan()`. Tests can call it directly or use the default no-op behavior
(port is None → functions return None/False like the original Linux code did
when no mixer was installed).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from catodo.domain.ports import MixerPort

log = logging.getLogger("catodo.mixer")

_port: MixerPort | None = None


def set_port(port: MixerPort | None) -> None:
    """Called once at startup by the composition root."""
    global _port
    _port = port


async def get_volume() -> int | None:
    if _port is None:
        return None
    return await _port.get_volume()


async def set_volume(level: int) -> bool:
    if _port is None:
        return False
    return await _port.set_volume(level)


async def adjust_volume(delta: int) -> int | None:
    current = await get_volume()
    if current is not None:
        new = max(0, min(100, current + delta))
        await set_volume(new)
        return new
    return None


async def set_default_sink(sink: str) -> bool:
    if _port is None:
        return False
    return await _port.set_default_sink(sink)


def has_mixer() -> bool:
    if _port is None:
        return False
    return _port.is_available()