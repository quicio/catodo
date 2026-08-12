"""Channel abstract base class."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Literal, Protocol, runtime_checkable

ChannelType = Literal["media", "web", "app", "dashboard", "launcher"]


@runtime_checkable
class SupportsEpisodes(Protocol):
    def episodes(self) -> list[dict]: ...


@runtime_checkable
class SupportsStream(Protocol):
    def current(self) -> dict | None: ...


@runtime_checkable
class SupportsBoxart(Protocol):
    def boxart(self, rel: str) -> str | None: ...


@runtime_checkable
class SupportsHistory(Protocol):
    async def history_state(self) -> dict: ...


class Channel(ABC):
    id: str
    name: str
    icon: str = ""
    type: ChannelType = "web"
    capabilities: frozenset[str] = frozenset()
    order: int | None = None

    @abstractmethod
    async def open(self) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...

    @abstractmethod
    async def state(self) -> dict: ...

    @abstractmethod
    async def command(self, cmd: str, **kwargs) -> None: ...

    def attach_broker(self, broker) -> None:
        pass

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "icon": self.icon,
            "type": self.type,
            "capabilities": sorted(self.capabilities),
        }
