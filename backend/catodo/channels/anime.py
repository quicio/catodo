"""Anime channel — streams local video files from ~/Anime as a TV channel."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from catodo.channel import Channel
from catodo.config import settings

log = logging.getLogger("catodo.anime")

VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".webm", ".mov"}


def _scan(base: Path) -> list[dict]:
    """Scan the Anime dir for episodes grouped by series."""
    if not base.exists():
        return []
    items = []
    for root, dirs, files in os.walk(base):
        dirs.sort()
        for f in sorted(files):
            ext = Path(f).suffix.lower()
            if ext not in VIDEO_EXTS:
                continue
            full = Path(root) / f
            rel = full.relative_to(base)
            parts = rel.parts
            series = parts[0] if len(parts) > 1 else "Sin serie"
            season = parts[1] if len(parts) > 2 else ""
            items.append(
                {
                    "path": str(full),
                    "name": Path(f).stem,
                    "series": series,
                    "season": season,
                    "rel": str(rel),
                }
            )
    return items


class AnimeChannel(Channel):
    id = "anime"
    name = "Anime"
    icon = "tv"
    type = "app"

    def __init__(self) -> None:
        self._base = Path(settings.anime_dir)
        self._current: Optional[dict] = None
        self._episodes: list[dict] = []
        self._playing = False

    async def refresh(self) -> None:
        self._episodes = _scan(self._base)
        if self._current is None and self._episodes:
            self._current = self._episodes[0]

    async def open(self) -> None:
        self._playing = True
        await self.refresh()

    async def close(self) -> None:
        self._playing = False

    def episodes(self) -> list[dict]:
        return self._episodes

    def set_episode(self, rel: str) -> bool:
        for ep in self._episodes:
            if ep["rel"] == rel or ep["path"] == rel:
                self._current = ep
                return True
        return False

    def next_episode(self) -> Optional[dict]:
        if not self._episodes or self._current is None:
            if self._episodes:
                self._current = self._episodes[0]
            return self._current
        idx = self._episodes.index(self._current) if self._current in self._episodes else -1
        nxt = self._episodes[(idx + 1) % len(self._episodes)]
        self._current = nxt
        return nxt

    def previous_episode(self) -> Optional[dict]:
        if not self._episodes or self._current is None:
            if self._episodes:
                self._current = self._episodes[0]
            return self._current
        idx = self._episodes.index(self._current) if self._current in self._episodes else -1
        prev = self._episodes[(idx - 1) % len(self._episodes)]
        self._current = prev
        return prev

    def current(self) -> Optional[dict]:
        return self._current

    async def state(self) -> dict:
        await self.refresh()
        return {
            "id": self.id,
            "base": str(self._base),
            "count": len(self._episodes),
            "series": self._grouped(),
            "current": self._current,
            "playing": self._playing,
        }

    def _grouped(self) -> dict:
        out: dict[str, dict] = {}
        for ep in self._episodes:
            series = ep["series"]
            if series not in out:
                out[series] = {"name": series, "episodes": []}
            out[series]["episodes"].append(ep)
        return out

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "play":
            self._playing = True
        elif cmd == "pause":
            self._playing = False
        elif cmd == "set_episode":
            rel = kwargs.get("episode", "")
            self.set_episode(rel)
            self._playing = True
        elif cmd == "next":
            self.next_episode()
            self._playing = True
        elif cmd == "prev":
            self.previous_episode()
            self._playing = True
        else:
            log.info("anime command passthrough: %s %s", cmd, kwargs)
