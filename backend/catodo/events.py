"""Lightweight async event broker for WebSocket fan-out."""
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Set


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: Set[asyncio.Queue] = set()
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
                yield evt
        finally:
            self._subscribers.discard(q)

    async def close(self) -> None:
        self._closed = True
        for q in list(self._subscribers):
            try:
                q.put_nowait({"event": "_closed"})
            except asyncio.QueueFull:
                pass
        self._subscribers.clear()
