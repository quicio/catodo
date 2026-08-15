"""Runtime config — editable JSON at ~/.local/share/catodo/config.json.
Overrides built-in defaults (paths, URLs) without touching the repo."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil

from catodo.config import settings
from catodo.datadir import DATA_DIR, ensure_dirs
from catodo.themes import (
    DEFAULT_THEME_ID,
    available_themes,
    effective_crt,
    sanitize_overrides,
)

log = logging.getLogger("catodo.config")

CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
TMP_FILE = CONFIG_FILE + ".tmp"

# Keys the runtime config can override, mapped to defaults from settings
KEYS = {
    "anime_dir": lambda: settings.anime_dir,
    "arcade_dir": lambda: settings.arcade_dir,
    "arcade_emulators": lambda: {},
    "arcade_default_emulator": lambda: "",
    "arcade_boxart_enabled": lambda: True,
    "resume_last_channel": lambda: True,
    "per_channel_volume_enabled": lambda: True,
    "per_channel_volume_default": lambda: 50,
    "channel_audio_sinks": lambda: {},
    "mqtt_host": lambda: "",
    "mqtt_port": lambda: 1883,
    "mqtt_user": lambda: "",
    "mqtt_pass": lambda: "",
    "mqtt_topic_prefix": lambda: "catodo",
    "tv_url": lambda: settings.tv_url,
    "youtube_url": lambda: settings.youtube_url,
    "crunchyroll_url": lambda: settings.crunchyroll_url,
    "spotify_embed_url": lambda: settings.spotify_embed_url,
    "host": lambda: settings.host,
    "port": lambda: settings.port,
    "plugin_repo": lambda: "",
    "libraries": lambda: [],
    "idle_screensaver_seconds": lambda: 240,
    "idle_sleep_seconds": lambda: 0,
    "theme": lambda: DEFAULT_THEME_ID,
    "themes": lambda: [],
    "theme_crt_enabled": lambda: True,
    "theme_overrides": lambda: {},
    "home_layout_id": lambda: "default",
}

# Claves cuya lectura devuelve un valor derivado (no el raw del archivo).
_DERIVED = ("themes", "theme_overrides", "theme_crt_enabled")


def _effective(key: str, cfg: dict):
    """Valor efectivo de una clave: raw del config o default, con derivadas."""
    if key == "themes":
        custom = cfg.get("themes") or []
        return available_themes(custom if isinstance(custom, list) else [])
    if key == "theme":
        chosen = cfg.get("theme") or DEFAULT_THEME_ID
        themes = _effective("themes", cfg)
        ids = {t["id"] for t in themes}
        return chosen if chosen in ids else DEFAULT_THEME_ID
    if key == "theme_overrides":
        return sanitize_overrides(cfg.get("theme_overrides"))
    if key == "theme_crt_enabled":
        # Derivado: override del usuario si existe, si no el default del tema.
        themes = _effective("themes", cfg)
        chosen = _effective("theme", cfg)
        overrides = _effective("theme_overrides", cfg)
        return effective_crt(themes, chosen, overrides)
    if key == "home_layout_id":
        # Sanitización: debe ser string no vacío; cualquier otra cosa → "default".
        v = cfg.get("home_layout_id")
        return v if isinstance(v, str) and v else "default"
    return cfg.get(key)

_config: dict | None = None
_lock = asyncio.Lock()


def _raw_load() -> dict:
    if not os.path.isfile(CONFIG_FILE):
        return {}
    with open(CONFIG_FILE) as f:
        return json.load(f)


def load() -> dict:
    global _config
    if _config is not None:
        return _config
    ensure_dirs()
    if os.path.isfile(CONFIG_FILE):
        try:
            _config = _raw_load()
        except Exception as e:
            bak = CONFIG_FILE + ".bak"
            log.warning("couldn't read %s, backing aside to %s: %s", CONFIG_FILE, bak, e)
            try:
                shutil.move(CONFIG_FILE, bak)
            except Exception:
                pass
            _config = {}
    else:
        _config = {}
        _save_inner(_config)
    _migrate_crt_alias(_config)
    return _config


def _migrate_crt_alias(cfg: dict) -> None:
    """Pliega la clave legacy `theme_crt_enabled` en `theme_overrides.crt`
    (una sola vez, al cargar) y la elimina del archivo."""
    if "theme_crt_enabled" not in cfg:
        return
    legacy = cfg.pop("theme_crt_enabled")
    if isinstance(legacy, bool):
        ov = cfg.get("theme_overrides")
        if not isinstance(ov, dict):
            ov = {}
        ov.setdefault("crt", legacy)
        cfg["theme_overrides"] = ov
    _save_inner(cfg)


def _save_inner(cfg: dict) -> None:
    ensure_dirs()
    with open(TMP_FILE, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    os.replace(TMP_FILE, CONFIG_FILE)


async def save(cfg: dict) -> None:
    async with _lock:
        _save_inner(cfg)


def get(key: str):
    cfg = load()
    if key in _DERIVED or key in cfg:
        return _effective(key, cfg)
    default = KEYS.get(key)
    return default() if default else None


async def set(key: str, value) -> None:
    async with _lock:
        cfg = load()
        cfg[key] = value
        _save_inner(cfg)


async def fold_crt_alias(value) -> dict:
    """Alias legacy: escribir `theme_crt_enabled` pliega el valor en
    `theme_overrides.crt`. Devuelve los overrides efectivos."""
    async with _lock:
        cfg = load()
        ov = cfg.get("theme_overrides")
        ov = dict(ov) if isinstance(ov, dict) else {}
        ov["crt"] = bool(value)
        cfg["theme_overrides"] = ov
        cfg.pop("theme_crt_enabled", None)
        _save_inner(cfg)
    return get("theme_overrides")


def all() -> dict:
    return {k: get(k) for k in KEYS}