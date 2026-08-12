"""Shared JSON store for persisted state in the data dir.

Atomic writes (temp + rename), corrupt-file recovery (.bak), serialised
access via a module-level lock."""

from __future__ import annotations

import asyncio
import json
import logging
import os

from catodo.datadir import DATA_DIR, ensure_dirs

log = logging.getLogger("catodo.store")

_lock = asyncio.Lock()


def path(name: str) -> str:
    return os.path.join(DATA_DIR, f"{name}.json")


def load(name: str, default: dict | None = None) -> dict:
    file = path(name)
    if not os.path.isfile(file):
        return default or {}
    try:
        with open(file) as f:
            return json.load(f)
    except Exception as e:
        bak = file + ".bak"
        log.warning("store: corrupt %s, backing aside to %s: %s", file, bak, e)
        try:
            os.rename(file, bak)
        except OSError:
            pass
        return default or {}


async def save(name: str, data: dict) -> None:
    ensure_dirs()
    file = path(name)
    tmp = file + ".tmp"
    async with _lock:
        with open(tmp, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, file)
