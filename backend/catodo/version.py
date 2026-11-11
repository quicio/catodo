"""Resolución de la versión del producto.

Orden:
1. metadata del paquete instalado (dev con `uv sync`, wheel);
2. `VERSION` junto al bundle (PyInstaller) o en la raíz del repo;
3. `0.0.0-dev` como último recurso.

`VERSION` en la raíz es la fuente de verdad; este módulo no la duplica.
"""
from __future__ import annotations

import importlib.metadata
import os
import sys
from pathlib import Path

_FALLBACK = "0.0.0-dev"


def _read_version_file(path: Path) -> str | None:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return value or None


def _candidate_files() -> list[Path]:
    here = Path(__file__).resolve()
    candidates = [
        Path(getattr(sys, "_MEIPASS", "")) / "VERSION",
        Path(sys.executable).resolve().parent / "VERSION",
        here.parents[2] / "VERSION",
        here.parents[1] / "VERSION",
    ]
    return [p for p in candidates if str(p)]


def get_version() -> str:
    """Devuelve la versión canónica del producto."""
    override = os.getenv("CATODO_VERSION_OVERRIDE")
    if override:
        return override.strip()
    try:
        return importlib.metadata.version("catodo")
    except importlib.metadata.PackageNotFoundError:
        pass
    for path in _candidate_files():
        value = _read_version_file(path)
        if value:
            return value
    return _FALLBACK


__all__ = ["get_version"]
