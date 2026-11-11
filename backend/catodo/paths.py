"""Resolución de paths de assets para dev y bundles (PyInstaller).

Los overrides permiten que un bundle o un test apunten a un directorio distinto
sin depender de la posición de `__file__`.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def static_dir() -> Path:
    """Directorio de estáticos servido por FastAPI."""
    override = os.getenv("CATODO_STATIC_DIR")
    if override:
        return Path(override).expanduser()
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass) / "static"
    return Path(__file__).resolve().parent.parent / "static"


def plugins_repo() -> Path:
    """Repo bundled de plugins declarativos."""
    override = os.getenv("CATODO_PLUGINS_REPO")
    if override:
        return Path(override).expanduser()
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass) / "plugins-repo"
    return Path(__file__).resolve().parents[2] / "plugins-repo"
