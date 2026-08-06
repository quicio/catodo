"""Runtime config — editable JSON at ~/.local/share/catodo/config.json.
Overrides built-in defaults (paths, URLs) without touching the repo."""
from __future__ import annotations

import json
import logging
import os

from catodo.datadir import DATA_DIR, ensure_dirs
from catodo.config import settings

log = logging.getLogger("catodo.config")

CONFIG_FILE = os.path.join(DATA_DIR, "config.json")

# Keys the runtime config can override, mapped to defaults from settings
KEYS = {
    "anime_dir": lambda: settings.anime_dir,
    "tv_url": lambda: settings.tv_url,
    "youtube_url": lambda: settings.youtube_url,
    "spotify_embed_url": lambda: settings.spotify_embed_url,
    "host": lambda: settings.host,
    "port": lambda: settings.port,
}

_config: dict | None = None


def load() -> dict:
    global _config
    if _config is not None:
        return _config
    ensure_dirs()
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                _config = json.load(f)
        except Exception as e:
            log.warning("couldn't read %s: %s", CONFIG_FILE, e)
            _config = {}
    else:
        _config = {}
        save(_config)
    return _config


def save(cfg: dict) -> None:
    ensure_dirs()
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def get(key: str):
    cfg = load()
    if key in cfg:
        return cfg[key]
    default = KEYS.get(key)
    return default() if default else None


def set(key: str, value) -> None:
    cfg = load()
    cfg[key] = value
    save(cfg)


def all() -> dict:
    return {k: get(k) for k in KEYS}
