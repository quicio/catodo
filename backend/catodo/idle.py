"""Idle / screensaver — reloj de inactividad para comportamiento de TV.

El backend rastrea la última actividad (llamadas API + pings del frontend) y
publica eventos cuando el sistema pasa a screensaver o a sleep.
"""
from __future__ import annotations

import asyncio
import logging
import time

log = logging.getLogger("catodo.idle")

_EVENT_MAP = {
    "screensaver": "idle_screensaver_on",
    "sleep": "idle_sleep_on",
    "active": "idle_off",
}


def _seconds(key: str, default: int) -> int:
    from catodo import runtime_config

    try:
        return max(0, int(runtime_config.get(key) or default))
    except (TypeError, ValueError):
        return default


class IdleManager:
    """Reloj de inactividad con estados active | screensaver | sleep."""

    def __init__(self, broker) -> None:
        self._broker = broker
        self._last_activity = time.monotonic()
        self._state = "active"
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def touch(self) -> None:
        self._last_activity = time.monotonic()

    @property
    def state(self) -> str:
        return self._state

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(1)
            await self._evaluate()

    async def _evaluate(self) -> None:
        screensaver_s = _seconds("idle_screensaver_seconds", 240)
        sleep_s = _seconds("idle_sleep_seconds", 0)
        elapsed = time.monotonic() - self._last_activity
        if elapsed < screensaver_s:
            target = "active"
        elif sleep_s > 0 and elapsed >= screensaver_s + sleep_s:
            target = "sleep"
        else:
            target = "screensaver"
        if target != self._state:
            async with self._lock:
                if target == self._state:
                    return
                self._state = target
            await self._broker.publish({"event": _EVENT_MAP[target]})

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
