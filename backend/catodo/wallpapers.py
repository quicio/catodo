"""Wallpaper provisioning — downloads wallpapers from Wallhaven into the user's
data directory (~/.local/share/catodo/wallpapers) and serves them at runtime."""
from __future__ import annotations

import json
import logging
import os
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from catodo.datadir import WALLPAPER_DIR, ensure_dirs

log = logging.getLogger("catodo.wallpapers")

router = APIRouter(prefix="/wallpapers", tags=["wallpapers"])

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) catodo/0.1"}
QUERIES = ["dark+neon", "minimalist+dark", "cyberpunk", "dark+technology", "space+dark"]
REDDIT_SUBS = ["wallpaper", "wallpapers", "MinimalWallpaper", "Amoledbackgrounds"]


def _lastfm_image_urls(artist: str, limit: int = 8) -> list[str]:
    """Fetch band photos from Last.fm artist images page.

    Solo las imágenes PROPIAS del artista: se detectan por el enlace
    `/music/<artista>/+images/<hash>` (el sidebar de "bandas similares"
    usa otros enlaces y no debe mezclarse). Se pide el original (ar0)."""
    import re

    url = f"https://www.last.fm/music/{urllib.parse.quote(artist.strip())}/+images/"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read().decode("utf-8", "ignore")
    except Exception as e:
        log.warning("lastfm fetch failed: %s", e)
        return []
    found: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(r'href="/music/[^"]*/\+images/([0-9a-f]+)"', html):
        h = m.group(1)
        if h in seen:
            continue
        seen.add(h)
        found.append(f"https://lastfm-img.freetls.fastly.net/i/u/ar0/{h}")
        if len(found) >= limit:
            break
    return found


def _reddit_image_urls(query: str, limit: int = 8) -> list[str]:
    """Search Reddit wallpaper subs for image posts matching the query."""
    import urllib.parse

    q = urllib.parse.quote(query)
    urls: list[str] = []
    for sub in REDDIT_SUBS:
        if len(urls) >= limit:
            break
        try:
            url = f"https://www.reddit.com/r/{sub}/search.json?q={q}&restrict_sr=1&sort=top&t=year&limit={limit}"
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.load(r)
            for child in data.get("data", {}).get("children", []):
                post = child.get("data", {})
                u = post.get("url", "")
                # solo imágenes directas (no galleries/albums)
                if u.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    urls.append(u)
                elif post.get("post_hint") == "image":
                    prev = post.get("preview", {}).get("images", [])
                    if prev and prev[0].get("source", {}).get("url"):
                        src = prev[0]["source"]["url"].replace("&amp;", "&")
                        urls.append(src)
                if len(urls) >= limit:
                    break
        except Exception as e:
            log.warning("reddit query failed (%s): %s", sub, e)
    return urls


def _existing_ids() -> set[str]:
    if not os.path.isdir(WALLPAPER_DIR):
        return set()
    # excluir archivos específicos de artista (_artist_, _reddit_, _lastfm_, _)
    return {
        f.split(".")[0] for f in os.listdir(WALLPAPER_DIR)
        if os.path.isfile(os.path.join(WALLPAPER_DIR, f)) and not f.startswith("_")
    }


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
    # solo wallpapers generales (excluir los específicos de artista que empiezan con _)
    files = sorted(
        f for f in os.listdir(WALLPAPER_DIR)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) and not f.startswith("_")
    )
    return {"wallpapers": [f"/api/wallpapers/files/{f}" for f in files]}


@router.get("/files/{filename}")
async def get_wallpaper(filename: str) -> FileResponse:
    safe = os.path.basename(filename)
    p = os.path.join(WALLPAPER_DIR, safe)
    if not os.path.isfile(p):
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(p)


@router.get("/cover")
async def cover(artist: str = "", track: str = "") -> dict:
    """Busca la portada del álbum en alta resolución vía iTunes Search API."""
    from urllib.parse import quote

    if not artist and not track:
        raise HTTPException(status_code=400, detail="artist or track required")
    term = quote(f"{artist} {track}".strip())
    try:
        req = urllib.request.Request(
            f"https://itunes.apple.com/search?term={term}&media=music&limit=6",
            headers=UA,
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
    except Exception as e:
        log.warning("itunes search failed: %s", e)
        raise HTTPException(status_code=502, detail="itunes unavailable")

    results = data.get("results", [])
    if not results:
        raise HTTPException(status_code=404, detail="no cover found")

    # el resultado más relevante (album/collection) con artwork
    candidates = [r for r in results if r.get("artworkUrl100")]
    if not candidates:
        raise HTTPException(status_code=404, detail="no artwork found")
    best = candidates[0]
    art = best["artworkUrl100"]
    # subir resolución: 100x100 → 1000x1000
    hi = art.replace("100x100bb", "1000x1000bb").replace("100x100", "1000x1000")
    return {"url": hi, "title": best.get("trackName") or best.get("collectionName"), "artist": artist}


@router.get("/artist")
async def artist_wallpaper(name: str, n: int = 6) -> dict:
    """Search Wallhaven for wallpapers related to the given artist/theme.
    Downloads up to `n` matches into the data dir (cached per query) and
    returns their URLs."""
    from urllib.parse import quote

    ensure_dirs()
    query = quote(name.strip())
    if not query:
        raise HTTPException(status_code=400, detail="name required")
    slug = name.strip().lower().replace(" ", "_").replace("/", "_")
    cached_files = sorted(
        f for f in os.listdir(WALLPAPER_DIR)
        if (f.startswith(f"_artist_{slug}_") or f.startswith(f"_reddit_{slug}_") or f.startswith(f"_lastfm_{slug}_"))
        and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    if cached_files:
        return {
            "wallpapers": [f"/api/wallpapers/files/{f}" for f in cached_files],
            "artist": name,
        }

    # Wallhaven es una web de fondos genéricos: con el nombre de un artista
    # devuelve resultados irrelevantes. Para el artista solo usamos fuentes que
    # garanticen correspondencia: Last.fm (fotos reales de la banda) y Reddit.
    reddit_urls = _reddit_image_urls(name.strip())
    lastfm_urls = _lastfm_image_urls(name.strip())

    if not reddit_urls and not lastfm_urls:
        raise HTTPException(status_code=404, detail="no wallpaper found")

    # Mezclar: alternar reddit y lastfm
    sources = [
        (reddit_urls, "_reddit_", "reddit"),
        (lastfm_urls, "_lastfm_", "lastfm"),
    ]
    urls = []
    existing = _existing_ids()
    got = 0
    idx = [0, 0]
    while got < n and any(idx[k] < len(sources[k][0]) for k in range(2)):
        for k in range(2):
            src, prefix, label = sources[k]
            if idx[k] >= len(src):
                continue
            item = src[idx[k]]
            idx[k] += 1
            base = os.path.basename(urllib.parse.urlparse(item).path)
            rid = base.split(".")[0]
            if rid in existing:
                continue
            ext = base.split(".")[-1] if "." in base else "jpg"
            if ext not in ("jpg", "jpeg", "png", "webp"):
                ext = "jpg"
            dest = os.path.join(WALLPAPER_DIR, f"{prefix}{slug}_{rid}.{ext}")
            url = item
            if _download(url, dest):
                existing.add(os.path.basename(dest).split(".")[0])
                urls.append(f"/api/wallpapers/files/{os.path.basename(dest)}")
                got += 1
                if got >= n:
                    break
    if not urls:
        raise HTTPException(status_code=502, detail="download failed")
    return {"wallpapers": urls, "artist": name}


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
