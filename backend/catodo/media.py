"""Media libraries — canales locales configurables (Anime, Series, Películas…).

Generaliza el antiguo canal Anime: cada biblioteca configurada es un canal propio
que escanea un directorio local y lo presenta según su `kind` (series | movies).
La biblioteca "anime" (desde anime_dir) se mantiene por backward compat.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

from catodo.channel import Channel
from catodo.config import settings

log = logging.getLogger("catodo.media")

VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".webm", ".mov"}
SCAN_TTL = 60
KINDS = ("series", "movies")


def _libraries_config() -> list[dict]:
    from catodo import runtime_config

    raw = runtime_config.get("libraries") or []
    return raw if isinstance(raw, list) else []


def _default_libraries() -> list[dict]:
    """Bibliotecas activas: el anime legacy (anime_dir) + las configuradas."""
    libs = [
        {
            "id": "anime",
            "name": "Anime",
            "path": os.path.expanduser(runtime_config_anime_dir()),
            "kind": "series",
            "builtin": True,
            "order": 2,
        }
    ]
    for i, lib in enumerate(_libraries_config()):
        if not isinstance(lib, dict) or not lib.get("id"):
            continue
        libs.append(
            {
                "id": str(lib["id"]),
                "name": str(lib.get("name") or lib["id"]),
                "path": os.path.expanduser(str(lib.get("path", ""))),
                "kind": str(lib.get("kind") or "series"),
                "builtin": False,
                "order": 6 + i,
            }
        )
    return libs


def runtime_config_anime_dir() -> str:
    from catodo import runtime_config

    return runtime_config.get("anime_dir") or settings.anime_dir


def _scan(base: Path, kind: str) -> list[dict]:
    """Escanea un directorio de biblioteca y devuelve items de video."""
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
            name = Path(f).stem
            if kind == "movies":
                series = parts[0] if len(parts) > 1 else "Películas"
                season = ""
            else:
                series = parts[0] if len(parts) > 1 else "Sin serie"
                season = parts[1] if len(parts) > 2 else ""
            items.append(
                {
                    "path": str(full),
                    "name": name,
                    "series": series,
                    "season": season,
                    "rel": str(rel),
                }
            )
    return items


def _progress_key(library_id: str) -> str:
    return "anime_progress" if library_id == "anime" else f"media_progress_{library_id}"


class MediaLibraryChannel(Channel):
    type = "app"
    capabilities = frozenset(["stream", "episodes"])

    def __init__(self, library: dict) -> None:
        self._lib = library
        self.id = str(library["id"])
        self.name = str(library["name"])
        self.icon = str(library.get("icon", "tv"))
        self.order = library.get("order")
        self._kind = library["kind"] if library["kind"] in KINDS else "series"
        self._base = Path(library["path"])
        self._progress_key = _progress_key(self.id)
        self._current: dict | None = None
        self._episodes: list[dict] = []
        self._playing = False
        self._scanned_at: float = 0.0
        self._scan_lock = asyncio.Lock()
        self._broker = None
        self._progress: dict[str, dict] = {}
        self._load_progress()

    def attach_broker(self, broker) -> None:
        self._broker = broker

    def _load_progress(self) -> None:
        from catodo import store
        self._progress = store.load(self._progress_key, {"version": 1, "items": {}}).get("items", {})

    async def _save_progress(self) -> None:
        from catodo import store
        await store.save(self._progress_key, {"version": 1, "items": self._progress})

    def _merge_progress(self, episodes: list[dict]) -> list[dict]:
        for ep in episodes:
            rel = ep.get("rel", "")
            p = self._progress.get(rel)
            ep["position_seconds"] = p.get("position", 0) if p else 0
            ep["watched"] = p.get("watched", False) if p else False
        return episodes

    async def refresh(self) -> None:
        now = time.monotonic()
        if now - self._scanned_at < SCAN_TTL:
            return
        async with self._scan_lock:
            if now - self._scanned_at < SCAN_TTL:
                return
            self._episodes = await asyncio.to_thread(_scan, self._base, self._kind)
            self._scanned_at = time.monotonic()
            self._merge_progress(self._episodes)
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

    def next_episode(self) -> dict | None:
        if not self._episodes or self._current is None:
            if self._episodes:
                self._current = self._episodes[0]
            return self._current
        idx = self._episodes.index(self._current) if self._current in self._episodes else -1
        nxt = self._episodes[(idx + 1) % len(self._episodes)]
        self._current = nxt
        return nxt

    def previous_episode(self) -> dict | None:
        if not self._episodes or self._current is None:
            if self._episodes:
                self._current = self._episodes[0]
            return self._current
        idx = self._episodes.index(self._current) if self._current in self._episodes else -1
        prev = self._episodes[(idx - 1) % len(self._episodes)]
        self._current = prev
        return prev

    def current(self) -> dict | None:
        return self._current

    async def state(self) -> dict:
        await self.refresh()
        return {
            "id": self.id,
            "name": self.name,
            "kind": self._kind,
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
            if self.set_episode(rel):
                self._playing = True
                if self._broker and self._current:
                    await self._broker.publish({
                        "event": "episode_changed", "channel_id": self.id, "episode": self._current,
                    })
        elif cmd == "next":
            ep = self.next_episode()
            self._playing = True
            if self._broker and ep:
                await self._broker.publish({"event": "episode_changed", "channel_id": self.id, "episode": ep})
        elif cmd == "prev":
            ep = self.previous_episode()
            self._playing = True
            if self._broker and ep:
                await self._broker.publish({"event": "episode_changed", "channel_id": self.id, "episode": ep})
        elif cmd == "seek":
            if self._current:
                pos = float(kwargs.get("position", 0))
                rel = self._current["rel"]
                dur = kwargs.get("duration", 0)
                self._progress[rel] = {
                    "position": pos,
                    "watched": dur > 0 and pos / dur >= 0.95,
                }
                await self._save_progress()
        elif cmd == "end":
            if self._current:
                rel = self._current["rel"]
                self._progress[rel] = {"position": 0, "watched": True}
                await self._save_progress()
        elif cmd == "refresh":
            self._scanned_at = 0.0
            await self.refresh()
        else:
            log.info("media channel %s passthrough: %s %s", self.id, cmd, kwargs)


def build_media_library_channels() -> list[MediaLibraryChannel]:
    return [MediaLibraryChannel(lib) for lib in _default_libraries()]
