"""ChannelManager — owns the registry and current selection."""
from __future__ import annotations

from collections import deque
from typing import Deque, Dict, List, Optional

from catodo.channel import Channel
from catodo.events import EventBroker
from catodo.config import settings


class ChannelManager:
    def __init__(self, broker: EventBroker) -> None:
        self._channels: Dict[str, Channel] = {}
        self._order: List[str] = []
        self._current: Optional[str] = None
        self._history: Deque[str] = deque(maxlen=settings.history_size)
        self._broker = broker
        self._volume: int = 50
        self._playing: bool = False

    def register(self, channel: Channel) -> None:
        cid = channel.id
        if cid in self._channels:
            raise ValueError(f"channel already registered: {cid}")
        self._channels[cid] = channel
        self._order.append(cid)

    def list(self) -> List[dict]:
        return [self._channels[c].to_dict() for c in self._order]

    @property
    def current(self) -> Optional[str]:
        return self._current

    async def open(self, channel_id: str) -> None:
        if channel_id not in self._channels:
            raise KeyError(channel_id)
        if self._current and self._current != channel_id:
            try:
                await self._channels[self._current].close()
            except Exception:
                pass
        self._current = channel_id
        self._history.append(channel_id)
        await self._channels[channel_id].open()
        await self._broker.publish({"event": "channel_changed", "channel_id": channel_id})

    async def close(self, channel_id: str) -> None:
        if channel_id not in self._channels:
            raise KeyError(channel_id)
        await self._channels[channel_id].close()
        if self._current == channel_id:
            self._current = None
        await self._broker.publish({"event": "channel_closed", "channel_id": channel_id})

    async def close_all(self) -> None:
        for cid in list(self._order):
            try:
                await self._channels[cid].close()
            except Exception:
                pass
        self._current = None

    async def next(self) -> str:
        if not self._order:
            raise RuntimeError("no channels registered")
        if self._current is None:
            target = self._order[0]
        else:
            idx = self._order.index(self._current)
            target = self._order[(idx + 1) % len(self._order)]
        await self.open(target)
        return target

    async def previous(self) -> str:
        if not self._order:
            raise RuntimeError("no channels registered")
        if self._current is None:
            target = self._order[-1]
        else:
            idx = self._order.index(self._current)
            target = self._order[(idx - 1) % len(self._order)]
        await self.open(target)
        return target

    async def command(self, channel_id: str, cmd: str, **kwargs) -> None:
        if channel_id not in self._channels:
            raise KeyError(channel_id)
        await self._channels[channel_id].command(cmd, **kwargs)
        if cmd in ("play", "pause", "toggle"):
            self._playing = cmd in ("play", "toggle") or (cmd == "play")
            await self._broker.publish(
                {"event": "playing_changed", "playing": self._playing}
            )

    def get(self, channel_id: str) -> Channel:
        if channel_id not in self._channels:
            raise KeyError(channel_id)
        return self._channels[channel_id]

    def state(self) -> dict:
        return {
            "current_channel_id": self._current,
            "playing": self._playing,
            "volume": self._volume,
            "available_channels": self.list(),
            "history": list(self._history),
        }

    async def set_volume(self, level: int) -> int:
        level = max(0, min(100, level))
        self._volume = level
        await self._broker.publish({"event": "volume_changed", "volume": level})
        return level

    async def adjust_volume(self, delta: int) -> int:
        return await self.set_volume(self._volume + delta)

    @property
    def volume(self) -> int:
        return self._volume
