"""ChannelManager — owns the registry and current selection."""
from __future__ import annotations

import asyncio
import builtins
import logging
from collections import deque

from catodo import mixer
from catodo.channel import Channel
from catodo.config import settings
from catodo.events import EventBroker

log = logging.getLogger("catodo.manager")


class ChannelManager:
    def __init__(self, broker: EventBroker) -> None:
        self._channels: dict[str, Channel] = {}
        self._order: list[str] = []
        self._current: str | None = None
        self._history: deque[str] = deque(maxlen=settings.history_size)
        self._broker = broker
        self._volume: int = 50
        self._playing: bool = False
        self._last_channel_id: str | None = None
        self._per_channel: dict[str, int] = self._load_per_channel()

    @staticmethod
    def _pc_enabled() -> bool:
        from catodo import runtime_config

        return bool(runtime_config.get("per_channel_volume_enabled"))

    @staticmethod
    def _pc_default() -> int:
        from catodo import runtime_config

        try:
            return max(0, min(100, int(runtime_config.get("per_channel_volume_default") or 50)))
        except (TypeError, ValueError):
            return 50

    def _load_per_channel(self) -> dict[str, int]:
        from catodo import store

        data = store.load("per_channel_volume", {"version": 1, "items": {}}).get("items", {})
        return {str(k): int(v) for k, v in data.items() if isinstance(v, (int, float))}

    async def _save_per_channel(self) -> None:
        from catodo import store

        await store.save("per_channel_volume", {"version": 1, "items": dict(self._per_channel)})

    async def _mixer_init(self) -> None:
        real = await mixer.get_volume()
        if real is not None:
            self._volume = real
            log.info("mixer init: volume=%d", real)
        self._load_last_channel()

    def register(self, channel: Channel) -> None:
        cid = channel.id
        if cid in self._channels:
            raise ValueError(f"channel already registered: {cid}")
        self._channels[cid] = channel
        self._order.append(cid)
        if hasattr(channel, "attach_broker") and callable(channel.attach_broker):
            channel.attach_broker(self._broker)

    def list(self) -> builtins.list[dict]:
        return [self._channels[c].to_dict() for c in self._order]

    @property
    def current(self) -> str | None:
        return self._current

    async def open(self, channel_id: str) -> None:
        if channel_id not in self._channels:
            raise KeyError(channel_id)
        if self._current and self._current != channel_id:
            self._remember_volume(self._current)
            try:
                await self._channels[self._current].close()
            except Exception:
                pass
        self._current = channel_id
        self._history.append(channel_id)
        await self._channels[channel_id].open()
        await self._apply_channel_volume(channel_id)
        await self._apply_channel_sink(channel_id)
        await self._broker.publish({"event": "channel_changed", "channel_id": channel_id})
        asyncio.ensure_future(self._save_last_channel(channel_id))

    def _remember_volume(self, channel_id: str) -> None:
        if not self._pc_enabled():
            return
        self._per_channel[channel_id] = self._volume
        asyncio.ensure_future(self._save_per_channel())

    async def _apply_channel_volume(self, channel_id: str) -> None:
        if not self._pc_enabled():
            return
        target = self._per_channel.get(channel_id, self._pc_default())
        if target != self._volume:
            self._volume = max(0, min(100, target))
            await mixer.set_volume(self._volume)
            await self._broker.publish({"event": "volume_changed", "volume": self._volume})

    async def _apply_channel_sink(self, channel_id: str) -> None:
        from catodo import runtime_config

        sinks = runtime_config.get("channel_audio_sinks") or {}
        sink = sinks.get(channel_id) if isinstance(sinks, dict) else None
        if not sink:
            return
        try:
            await mixer.set_default_sink(str(sink))
        except Exception:
            log.debug("sink routing failed for %s", channel_id)

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
        if cmd in ("play", "pause", "toggle", "next", "prev"):
            try:
                st = await self._channels[channel_id].state()
            except Exception:
                return
            new_playing = None
            if isinstance(st.get("playing"), bool):
                new_playing = st["playing"]
            elif st.get("status") == "Playing":
                new_playing = True
            elif st.get("status") in ("Paused", "Stopped"):
                new_playing = False
            if new_playing is not None and new_playing != self._playing:
                self._playing = new_playing
                await self._broker.publish(
                    {"event": "playing_changed", "playing": self._playing}
                )

    def get(self, channel_id: str) -> Channel:
        if channel_id not in self._channels:
            raise KeyError(channel_id)
        return self._channels[channel_id]

    def unregister(self, channel_id: str) -> None:
        """Quita un canal del registro (usado por plugins al deshabilitarse)."""
        if channel_id in self._channels:
            del self._channels[channel_id]
        if channel_id in self._order:
            self._order.remove(channel_id)
        if self._current == channel_id:
            self._current = None

    def reorder(self) -> None:
        """Ordena el registro por (order, nombre) manteniendo los built-ins y plugins coherentes."""
        self._order.sort(
            key=lambda cid: (
                self._channels[cid].order is None,
                self._channels[cid].order if self._channels[cid].order is not None else 10**9,
                self._channels[cid].name.lower(),
            )
        )

    def state(self) -> dict:
        return {
            "current_channel_id": self._current,
            "playing": self._playing,
            "volume": self._volume,
            "available_channels": self.list(),
            "history": list(self._history),
            "last_channel_id": self._last_channel_id,
        }

    async def set_volume(self, level: int) -> int:
        level = max(0, min(100, level))
        applied = await mixer.set_volume(level)
        if not applied and self._current:
            try:
                await self._channels[self._current].command(
                    "volume", level=level / 100.0
                )
            except Exception:
                pass
        self._volume = level
        if self._current and self._pc_enabled():
            self._per_channel[self._current] = level
            asyncio.ensure_future(self._save_per_channel())
        await self._broker.publish({"event": "volume_changed", "volume": level})
        return level

    async def adjust_volume(self, delta: int) -> int:
        return await self.set_volume(self._volume + delta)

    @property
    def volume(self) -> int:
        return self._volume

    def _load_last_channel(self) -> None:
        from catodo import store
        data = store.load("last_state", {"channel": None})
        self._last_channel_id = data.get("channel")

    async def _save_last_channel(self, channel_id: str) -> None:
        from catodo import store
        self._last_channel_id = channel_id
        await store.save("last_state", {"channel": channel_id})
