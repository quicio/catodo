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
}

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
    return _config


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
    if key in cfg:
        return cfg[key]
    default = KEYS.get(key)
    return default() if default else None


async def set(key: str, value) -> None:
    async with _lock:
        cfg = load()
        cfg[key] = value
        _save_inner(cfg)


def all() -> dict:
    return {k: get(k) for k in KEYS}
