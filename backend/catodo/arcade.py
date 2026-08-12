"""Arcade channel — launcher de juegos locales con emulador externo.

Cada subdirectorio de `arcade_dir/<Sistema>/<Juego>/` es un juego: contiene una
ROM y opcionalmente una carátula (`boxart.png|jpg|jpeg`). Al lanzarlo se abre un
emulador externo configurado (RetroArch/MAME) a pantalla completa; al cerrarse,
el canal vuelve al launcher.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import shlex
import subprocess
import time
from pathlib import Path

from catodo.boxart import fetch_boxart
from catodo.channel import Channel

log = logging.getLogger("catodo.arcade")

ROM_EXTS = {
    ".zip", ".nes", ".smc", ".sfc", ".gb", ".gba", ".md", ".n64", ".rom", ".bin",
    ".iso", ".cue", ".chd", ".pbp",
}
BOXART_NAMES = ("boxart.png", "boxart.jpg", "boxart.jpeg")
SCAN_TTL = 60
BOXART_RETRY_AFTER = 600
BOXART_DELAY = 0.3


def _find_sidecar_art(rom: Path) -> Path | None:
    """Carátula al lado de la ROM con el mismo nombre (SuperMario.smc → SuperMario.png)."""
    for ext in ("png", "jpg", "jpeg"):
        candidate = rom.with_suffix(f".{ext}")
        if candidate.is_file():
            return candidate
    return None


def _cued_bins(directory: Path) -> set[str]:
    """Nombres de archivos `.bin` referenciados por los `.cue` del directorio."""
    referenced: set[str] = set()
    for cue in directory.glob("*.cue"):
        try:
            text = cue.read_text(errors="replace")
        except OSError:
            continue
        for m in re.finditer(r'FILE\s+"([^"]+)"', text):
            referenced.add(Path(m.group(1)).name)
    return referenced


def _flat_games(directory: Path, system: str) -> list[dict]:
    """Juegos sueltos de un directorio, respetando conjuntos cue/bin.

    En un set `.cue`/`.bin` el juego es el `.cue`: sus tracks `.bin` se omiten
    para no listar "Mortal Kombat (Track 01)", "(Track 02)"… como juegos aparte.
    """
    def entry(name: str, rom: Path, boxart: Path | None, system: str) -> dict:
        return {
            "name": name,
            "rom": str(rom),
            "boxart": str(boxart) if boxart else None,
            "rel": f"{system}/{name}",
            "system": system,
        }

    roms = sorted(
        f for f in directory.iterdir()
        if f.is_file() and f.suffix.lower() in ROM_EXTS
    )
    cued_bins = _cued_bins(directory)
    games = []
    for f in roms:
        if f.suffix.lower() == ".bin" and f.name in cued_bins:
            continue
        games.append(entry(f.stem, f, _find_sidecar_art(f), system))
    return games


def _arcade_dir() -> str:
    from catodo import runtime_config
    from catodo.config import settings

    return runtime_config.get("arcade_dir") or settings.arcade_dir


def _emulators_config() -> dict:
    from catodo import runtime_config

    raw = runtime_config.get("arcade_emulators") or {}
    return raw if isinstance(raw, dict) else {}


def _default_emulator() -> str:
    from catodo import runtime_config

    return str(runtime_config.get("arcade_default_emulator") or "")


def _scan(base: Path) -> list[dict]:
    """Escanea `base/<Sistema>/<Juego>/` y agrupa los juegos por sistema.

    Soporta dos layouts:
    - `base/<Sistema>/<Juego>/rom + boxart` (una carpeta por juego).
    - `base/<Sistema>/rom.smc` (ROMs sueltas directas en la carpeta del sistema).
    - ROMs sueltas en `base/` → un sistema con el nombre del directorio base.
    """
    if not base.is_dir():
        return []

    systems = []

    # ROMs sueltas en la raíz → un solo sistema con el nombre de la carpeta base.
    base_games = _flat_games(base, base.name)
    if base_games:
        systems.append({"name": base.name, "games": base_games})

    for system_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        games = []
        # ROMs sueltas directas en la carpeta del sistema (con carátula sidecar).
        games.extend(_flat_games(system_dir, system_dir.name))
        # Subcarpetas de juego con ROM (y boxart opcional).
        for game_dir in sorted(p for p in system_dir.iterdir() if p.is_dir()):
            rom = next(
                (f for f in game_dir.iterdir() if f.is_file() and f.suffix.lower() in ROM_EXTS),
                None,
            )
            if rom is None:
                continue
            boxart = next(
                (game_dir / name for name in BOXART_NAMES if (game_dir / name).is_file()),
                None,
            )
            games.append(
                {
                    "name": game_dir.name,
                    "rom": str(rom),
                    "boxart": str(boxart) if boxart else None,
                    "rel": f"{system_dir.name}/{game_dir.name}",
                    "system": system_dir.name,
                }
            )
        if games:
            systems.append({"name": system_dir.name, "games": games})
    return systems


def _build_launch_command(template: str, rom: str) -> list[str]:
    """Convierte una plantilla de emulador en argv (sin shell)."""
    expanded = template.replace("{rom}", rom)
    argv = shlex.split(expanded)
    if not argv:
        raise ValueError("plantilla de emulador vacía")
    return argv


class ArcadeChannel(Channel):
    id = "arcade"
    name = "Arcade"
    icon = "gamepad"
    type = "launcher"
    order = 3

    def __init__(self) -> None:
        self._scanned_at = 0.0
        self._systems: list[dict] = []
        self._proc: subprocess.Popen | None = None
        self._current: dict | None = None
        self._playing = False
        self._broker = None
        self._watcher_task: asyncio.Task | None = None
        self._scan_lock = asyncio.Lock()
        self._boxart_failed: dict[str, float] = {}
        self._boxart_queued: set[str] = set()
        self._boxart_queue: asyncio.Queue = asyncio.Queue()
        self._boxart_worker: asyncio.Task | None = None

    def attach_broker(self, broker) -> None:
        self._broker = broker

    @staticmethod
    def _boxart_enabled() -> bool:
        from catodo import runtime_config

        return bool(runtime_config.get("arcade_boxart_enabled"))

    async def refresh(self) -> None:
        now = time.monotonic()
        if now - self._scanned_at < SCAN_TTL:
            return
        async with self._scan_lock:
            if now - self._scanned_at < SCAN_TTL:
                return
            base = Path(os.path.expanduser(_arcade_dir()))
            self._systems = await asyncio.to_thread(_scan, base)
            self._scanned_at = time.monotonic()
        self._maybe_sync_boxarts()

    async def open(self) -> None:
        await self.refresh()

    async def close(self) -> None:
        # No matar un emulador en curso al cambiar de canal (comportamiento tipo TV).
        pass

    async def state(self) -> dict:
        await self.refresh()
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "systems": self._systems,
            "current": self._current,
            "playing": self._playing,
        }

    def boxart(self, rel: str) -> str | None:
        for system in self._systems:
            for game in system["games"]:
                if game["rel"] == rel:
                    return game["boxart"]
        return None

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "launch":
            await self._launch(str(kwargs.get("game", "")))
        elif cmd == "refresh":
            self._scanned_at = 0.0
            await self.refresh()
        elif cmd == "fetch_boxart":
            await self._fetch_boxart_cmd(str(kwargs.get("game", "")))
        elif cmd == "fetch_boxarts":
            self._boxart_failed.clear()
            self._maybe_sync_boxarts(force=True)
        else:
            log.info("arcade passthrough: %s %s", cmd, kwargs)

    async def _resolve_game(self, rel: str) -> dict | None:
        await self.refresh()
        for system in self._systems:
            for game in system["games"]:
                if game["rel"] == rel:
                    return game
        return None

    async def _launch(self, rel: str) -> None:
        game = await self._resolve_game(rel)
        if game is None:
            await self._fail(f"juego no encontrado: {rel}")
            return
        template = _emulators_config().get(game["system"]) or _default_emulator()
        if not template:
            await self._fail(f"no hay emulador configurado para {game['system']}")
            return
        try:
            argv = await asyncio.to_thread(_build_launch_command, template, game["rom"])
        except ValueError as e:
            await self._fail(str(e))
            return
        self._proc = subprocess.Popen(
            argv,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        self._current = game
        self._playing = True
        log.info("arcade launching %s via %r", rel, argv)
        if self._broker:
            await self._broker.publish({"event": "game_launched", "channel_id": self.id, "game": game})
            await self._broker.publish({"event": "playing_changed", "playing": True})
        self._ensure_watcher()

    async def _fail(self, error: str) -> None:
        log.warning("arcade launch failed: %s", error)
        if self._broker:
            await self._broker.publish(
                {"event": "game_launch_failed", "channel_id": self.id, "error": error}
            )

    def _ensure_watcher(self) -> None:
        if self._watcher_task is not None and not self._watcher_task.done():
            return
        self._watcher_task = asyncio.create_task(self._watch_proc())

    async def _watch_proc(self) -> None:
        proc = self._proc
        if proc is None:
            return
        await asyncio.to_thread(proc.wait)
        self._proc = None
        self._current = None
        self._playing = False
        log.info("arcade emulator exited")
        if self._broker:
            await self._broker.publish({"event": "game_exited", "channel_id": self.id})
            await self._broker.publish({"event": "playing_changed", "playing": False})

    # --- Descarga de carátulas (best-effort, serializada) ---

    def _is_recent_failure(self, rel: str) -> bool:
        t = self._boxart_failed.get(rel)
        return bool(t) and (time.monotonic() - t) < BOXART_RETRY_AFTER

    def _enqueue_boxart(self, rel: str) -> None:
        if rel in self._boxart_queued:
            return
        self._boxart_queued.add(rel)
        self._boxart_queue.put_nowait(rel)

    def _ensure_boxart_worker(self) -> None:
        if self._boxart_worker is None or self._boxart_worker.done():
            self._boxart_worker = asyncio.create_task(self._boxart_worker_run())

    def _maybe_sync_boxarts(self, force: bool = False) -> None:
        """Encola las carátulas faltantes (ignorando la cache de fallos si `force`)."""
        if not ArcadeChannel._boxart_enabled():
            return
        self._ensure_boxart_worker()
        for system in self._systems:
            for game in system["games"]:
                if game.get("boxart"):
                    continue
                if not force and self._is_recent_failure(game["rel"]):
                    continue
                self._enqueue_boxart(game["rel"])

    async def _boxart_worker_run(self) -> None:
        while True:
            rel = await self._boxart_queue.get()
            try:
                await self._fetch_one(rel, report_failure=False)
            finally:
                self._boxart_queued.discard(rel)
                await asyncio.sleep(BOXART_DELAY)
            if self._boxart_queue.empty() and not self._boxart_queued:
                if self._broker:
                    await self._broker.publish(
                        {"event": "boxarts_synced", "channel_id": self.id}
                    )

    async def _fetch_boxart_cmd(self, rel: str) -> None:
        game = await self._resolve_game(rel)
        if game is None:
            if self._broker:
                await self._broker.publish(
                    {
                        "event": "boxart_failed",
                        "channel_id": self.id,
                        "game": rel,
                        "error": "juego no encontrado",
                    }
                )
            return
        self._boxart_failed.pop(rel, None)
        self._enqueue_boxart(rel)
        self._ensure_boxart_worker()

    async def _fetch_one(self, rel: str, report_failure: bool) -> None:
        game = await self._resolve_game(rel)
        if game is None or game.get("boxart"):
            return
        path = await asyncio.to_thread(fetch_boxart, game["system"], game["name"], game["rom"])
        if path:
            game["boxart"] = str(path)
            self._boxart_failed.pop(rel, None)
            if self._broker:
                await self._broker.publish(
                    {
                        "event": "boxart_fetched",
                        "channel_id": self.id,
                        "game": game,
                        "boxart": str(path),
                    }
                )
            log.info("boxart fetched: %s", rel)
        else:
            self._boxart_failed[rel] = time.monotonic()
            if report_failure and self._broker:
                await self._broker.publish(
                    {"event": "boxart_failed", "channel_id": self.id, "game": rel, "error": "no disponible"}
                )
            log.info("boxart no disponible: %s", rel)
