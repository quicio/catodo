"""YouTube channel — launcher card. Opens YouTube in the system browser on
demand. Playback stays external so the Cátodo window keeps focus."""
from __future__ import annotations

import asyncio
import logging
import shutil

from catodo.channel import Channel
from catodo.config import settings

log = logging.getLogger("catodo.youtube")


def _extract_video_id(url: str) -> str | None:
    """Pull the `v` ID out of common YouTube URL shapes."""
    import re

    m = re.search(r"(?:embed/|v=|youtu\.be/)([A-Za-z0-9_-]{6,})", url)
    return m.group(1) if m else None


class YouTubeChannel(Channel):
    id = "youtube"
    name = "YouTube"
    icon = "play"
    type = "web"

    def __init__(self) -> None:
        self._open = False

    @property
    def _url(self) -> str:
        from catodo import runtime_config

        return runtime_config.get("youtube_url") or settings.youtube_url

    @staticmethod
    def _launch(url: str) -> None:
        bin_ = shutil.which("xdg-open") or shutil.which("gio")
        if bin_:
            try:
                import subprocess

                subprocess.Popen(
                    [bin_, url],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                return
            except Exception as e:
                log.warning("external launcher failed: %s", e)
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception as e:
            log.warning("webbrowser.open failed: %s", e)

    async def open(self) -> None:
        self._open = True

    async def close(self) -> None:
        self._open = False

    async def state(self) -> dict:
        return {
            "id": self.id,
            "open": self._open,
            "url": self._url,
            "video_id": _extract_video_id(self._url),
            "thumbnail": self._thumbnail(),
        }

    def _thumbnail(self) -> str | None:
        vid = _extract_video_id(self._url)
        return f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg" if vid else None

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "set_url":
            from catodo import runtime_config

            runtime_config.set("youtube_url", kwargs.get("url", self._url))
        elif cmd == "launch":
            await asyncio.to_thread(self._launch, self._url)
        else:
            log.info("youtube command passthrough: %s %s", cmd, kwargs)
