"""Descarga de carátulas para el canal Arcade desde Libretro Thumbnails.

Best-effort: Libretro usa la convención no-intro (con región), así que se prueban
varios nombres candidatos. El resultado se guarda como sidecar `<ROM>.png` al lado
de la ROM para que el scanner del canal lo vuelva a detectar.
"""
from __future__ import annotations

import logging
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

log = logging.getLogger("catodo.boxart")

THUMBNAILS_BASE = "https://thumbnails.libretro.com"
THUMBNAIL_TYPE = "Named_Boxarts"
TIMEOUT = 10
USER_AGENT = "catodo/0.1"

# Mapeo de nombres de carpeta → nombre oficial de sistema en RetroArch.
SYSTEM_NAMES = {
    "nes": "Nintendo - Nintendo Entertainment System",
    "nintendo": "Nintendo - Nintendo Entertainment System",
    "nintendo entertainment system": "Nintendo - Nintendo Entertainment System",
    "snes": "Nintendo - Super Nintendo Entertainment System",
    "super nintendo": "Nintendo - Super Nintendo Entertainment System",
    "super nintendo entertainment system": "Nintendo - Super Nintendo Entertainment System",
    "gb": "Nintendo - Game Boy",
    "game boy": "Nintendo - Game Boy",
    "gbc": "Nintendo - Game Boy Color",
    "game boy color": "Nintendo - Game Boy Color",
    "gba": "Nintendo - Game Boy Advance",
    "game boy advance": "Nintendo - Game Boy Advance",
    "n64": "Nintendo - Nintendo 64",
    "nintendo 64": "Nintendo - Nintendo 64",
    "md": "Sega - Mega Drive - Genesis",
    "megadrive": "Sega - Mega Drive - Genesis",
    "mega drive": "Sega - Mega Drive - Genesis",
    "genesis": "Sega - Mega Drive - Genesis",
    "sms": "Sega - Master System",
    "mastersystem": "Sega - Master System",
    "sega master system": "Sega - Master System",
    "gamegear": "Sega - Game Gear",
    "game gear": "Sega - Game Gear",
    "sega cd": "Sega - Sega CD",
    "segacd": "Sega - Sega CD",
    "saturn": "Sega - Saturn",
    "sega saturn": "Sega - Saturn",
    "psx": "Sony - PlayStation",
    "ps1": "Sony - PlayStation",
    "playstation": "Sony - PlayStation",
    "ps2": "Sony - PlayStation 2",
    "playstation 2": "Sony - PlayStation 2",
    "psp": "Sony - PSP",
    "playstation portable": "Sony - PSP",
    "mame": "MAME",
    "arcade": "MAME",
}


def resolve_system(folder: str) -> str:
    """Nombre oficial de RetroArch para una carpeta de sistema (o la carpeta tal cual)."""
    key = folder.strip().lower()
    return SYSTEM_NAMES.get(key, folder.strip())


def candidate_names(stem: str) -> list[str]:
    """Nombres probables de la carátula en la base de Libretro, en orden."""
    base = re.sub(r"(?:\s*[\(\[]([^)\]]*)[\)\]])+$", "", stem.strip()).strip()
    names = [stem.strip()]
    if base and base != stem.strip():
        names.append(base)
    if base:
        for region in ("USA", "Europe", "Japan", "World"):
            names.append(f"{base} ({region})")
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _http_get(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "image" not in content_type:
                return None
            return resp.read()
    except urllib.error.HTTPError as e:
        log.debug("boxart http %s -> %s", e.code, url)
        return None
    except Exception as e:
        log.debug("boxart fetch error %s -> %s", url, e)
        return None


def _save_atomic(target: Path, data: bytes) -> None:
    tmp = target.with_name(target.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, target)


def fetch_boxart(system: str, game_name: str, rom_path: str) -> Path | None:
    """Descarga la carátula y la guarda como sidecar. Devuelve la ruta o None."""
    rom = Path(rom_path)
    target = rom.with_suffix(".png")
    retro_system = resolve_system(system)
    for name in candidate_names(game_name):
        url = (
            f"{THUMBNAILS_BASE}/{quote(retro_system)}/"
            f"{THUMBNAIL_TYPE}/{quote(name)}.png"
        )
        data = _http_get(url)
        if data is None:
            continue
        try:
            _save_atomic(target, data)
        except OSError as e:
            log.warning("no se pudo guardar carátula %s: %s", target, e)
            return None
        log.info("boxart descargada: %s (%s)", target, system)
        return target
    return None
