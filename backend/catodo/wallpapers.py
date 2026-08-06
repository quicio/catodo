"""Wallpaper provisioning — downloads wallpapers from Wallhaven into the user's
data directory (~/.local/share/catodo/wallpapers) and serves them at runtime."""
from __future__ import annotations

import json
import logging
import os
import urllib.request

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from catodo.datadir import WALLPAPER_DIR, ensure_dirs

log = logging.getLogger("catodo.wallpapers")

router = APIRouter(prefix="/wallpapers", tags=["wallpapers"])

UA = {"User-Agent": "Mozilla/5.0"}
QUERIES = ["dark+neon", "minimalist+dark", "cyberpunk", "dark+technology", "space+dark"]


def _existing_ids() -> set[str]:
    if not os.path.isdir(WALLPAPER_DIR):
        return set()
    return {f.split(".")[0] for f in os.listdir(WALLPAPER_DIR) if os.path.isfile(os.path.join(WALLPAPER_DIR, f))}


def _download(url: str, dest: str) -> bool:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read()
        with open(dest, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        log.warning("wallpaper download failed %s: %s", url, e)
        return False


@router.get("/count")
async def count() -> dict:
    return {"total": len(_existing_ids())}


@router.get("/list")
async def list_wallpapers() -> dict:
    ensure_dirs()
    files = sorted(
        f for f in os.listdir(WALLPAPER_DIR)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    return {"wallpapers": [f"/api/wallpapers/files/{f}" for f in files]}


@router.get("/files/{filename}")
async def get_wallpaper(filename: str) -> FileResponse:
    safe = os.path.basename(filename)
    p = os.path.join(WALLPAPER_DIR, safe)
    if not os.path.isfile(p):
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(p)


@router.post("/fetch")
async def fetch(n: int = 4) -> dict:
    """Download up to `n` new wallpapers into the data dir, avoiding duplicates."""
    ensure_dirs()
    existing = _existing_ids()
    got = 0
    for q in QUERIES:
        if got >= n:
            break
        try:
            req = urllib.request.Request(
                f"https://wallhaven.cc/api/v1/search?q={q}&categories=010&purity=100&atleast=1920x1080&sorting=random",
                headers=UA,
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                items = json.load(r).get("data", [])
        except Exception as e:
            log.warning("wallhaven query failed: %s", e)
            continue
        for w in items:
            if got >= n:
                break
            wid = w["id"]
            if wid in existing:
                continue
            ext = w["path"].split(".")[-1]
            dest = os.path.join(WALLPAPER_DIR, f"{wid}.{ext}")
            if _download(w["path"], dest):
                existing.add(wid)
                got += 1
    return {"downloaded": got, "total": len(existing)}
