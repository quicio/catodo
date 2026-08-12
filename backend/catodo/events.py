"""Lightweight async event broker for WebSocket fan-out."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

_CLOSED = object()


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self._closed = False

    async def publish(self, event: dict) -> None:
        if self._closed:
            return
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def subscribe(self) -> AsyncIterator[dict]:
        q: asyncio.Queue = asyncio.Queue(maxsize=128)
        self._subscribers.add(q)
        try:
            while not self._closed:
                evt = await q.get()
                if evt is _CLOSED or self._closed:
                    return
                yield evt
        finally:
            self._subscribers.discard(q)

    async def close(self) -> None:
        self._closed = True
        for q in list(self._subscribers):
            self._drain_for_sentinel(q)
        self._subscribers.clear()

    @staticmethod
    def _drain_for_sentinel(q: asyncio.Queue) -> None:
        while q.full():
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                break
        try:
            q.put_nowait(_CLOSED)
        except asyncio.QueueFull:
            pass
