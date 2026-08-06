"""TV channel — opens Movistar TV in the system browser (Widevine DRM)."""
from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import webbrowser

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
        self._url: str = settings.tv_url

    @staticmethod
    def _launch(url: str) -> None:
        bin_ = shutil.which("xdg-open") or shutil.which("gio")
        if bin_:
            try:
                subprocess.Popen(
                    [bin_, url],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                return
            except Exception as e:
                log.warning("launcher failed: %s", e)
        try:
            webbrowser.open(url)
        except Exception as e:
            log.warning("webbrowser.open failed: %s", e)

    async def open(self) -> None:
        self._open = True
        await asyncio.to_thread(self._launch, self._url)

    async def close(self) -> None:
        self._open = False

    async def state(self) -> dict:
        return {"id": self.id, "open": self._open, "url": self._url}

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "set_url":
            self._url = kwargs.get("url", self._url)
            log.info("tv url set to: %s", self._url)
        elif cmd == "launch":
            await asyncio.to_thread(self._launch, self._url)
        else:
            log.info("tv command passthrough: %s %s", cmd, kwargs)
