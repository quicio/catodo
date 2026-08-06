"""Channel abstract base class."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Literal

ChannelType = Literal["media", "web", "app", "dashboard"]


class Channel(ABC):
    id: str
    name: str
    icon: str = ""
    type: ChannelType = "web"

    @abstractmethod
    async def open(self) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...

    @abstractmethod
    async def state(self) -> dict: ...

    @abstractmethod
    async def command(self, cmd: str, **kwargs) -> None: ...

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "icon": self.icon, "type": self.type}
