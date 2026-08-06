"""TV channel — loads Movistar TV in the Cátodo webview (Widevine vía Electron castLabs)."""
from __future__ import annotations

import logging

from catodo.channel import Channel
from catodo.config import settings

log = logging.getLogger("catodo.tv")


class TvChannel(Channel):
    id = "tv"
    name = "TV"
    icon = "tv"
    type = "web"

    def __init__(self) -> None:
        self._open = False

    @property
    def _url(self) -> str:
        from catodo import runtime_config

        return runtime_config.get("tv_url") or settings.tv_url

    async def open(self) -> None:
        self._open = True

    async def close(self) -> None:
        self._open = False

    async def state(self) -> dict:
        return {"id": self.id, "open": self._open, "url": self._url}

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "set_url":
            from catodo import runtime_config

            runtime_config.set("tv_url", kwargs.get("url", self._url))
            log.info("tv url set to: %s", self._url)
        else:
            log.info("tv command passthrough: %s %s", cmd, kwargs)
