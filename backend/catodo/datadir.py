"""Runtime data directory — holds user customizations that are NOT committed to
git (downloaded wallpapers, future settings). Defaults to
~/.local/share/catodo, overridable with CATODO_DATA_DIR."""
from __future__ import annotations

import os

from catodo.config import settings

DATA_DIR = settings.data_dir
WALLPAPER_DIR = os.path.join(DATA_DIR, "wallpapers")


def ensure_dirs() -> None:
    for d in (DATA_DIR, WALLPAPER_DIR):
        os.makedirs(d, exist_ok=True)
