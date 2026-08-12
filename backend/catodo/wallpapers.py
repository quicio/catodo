"""Wallpaper provisioning — downloads wallpapers from Wallhaven into the user's
data directory (~/.local/share/catodo/wallpapers) and serves them at runtime."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import urllib.parse

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from catodo.datadir import WALLPAPER_DIR, ensure_dirs

log = logging.getLogger("catodo.wallpapers")

router = APIRouter(prefix="/wallpapers", tags=["wallpapers"])

UA = "Mozilla/5.0 (X11; Linux x86_64) catodo/0.1"
QUERIES = ["dark+neon", "minimalist+dark", "cyberpunk", "dark+technology", "space+dark"]
REDDIT_SUBS = ["wallpaper", "wallpapers", "MinimalWallpaper", "Amoledbackgrounds"]

_in_flight: set[str] = set()
_download_sem = asyncio.Semaphore(4)
_hashes: dict[str, str] | None = None
_HASHES_FILE = os.path.join(WALLPAPER_DIR, ".hashes.json")


def _load_hashes() -> dict[str, str]:
    global _hashes
    if _hashes is not None:
        return _hashes
    if os.path.isfile(_HASHES_FILE):
        try:
            with open(_HASHES_FILE) as f:
                _hashes = json.load(f)
        except Exception:
            _hashes = {}
    else:
        _hashes = {}
    return _hashes


def _save_hashes(hsh: dict[str, str]) -> None:
    ensure_dirs()
    with open(_HASHES_FILE, "w") as f:
        json.dump(hsh, f, indent=2)


async def _lastfm_image_urls(client: httpx.AsyncClient, artist: str, limit: int = 8) -> list[str]:
    url = f"https://www.last.fm/music/{urllib.parse.quote(artist.strip())}/+images/"
    try:
        r = await client.get(url, timeout=20)
        html = r.text
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


async def _reddit_image_urls(client: httpx.AsyncClient, query: str, limit: int = 8) -> list[str]:
    q = urllib.parse.quote(query)
    urls: list[str] = []
    for sub in REDDIT_SUBS:
        if len(urls) >= limit:
            break
        try:
            url = f"https://www.reddit.com/r/{sub}/search.json?q={q}&restrict_sr=1&sort=top&t=year&limit={limit}"
            r = await client.get(url, timeout=20)
            data = r.json()
            for child in data.get("data", {}).get("children", []):
                post = child.get("data", {})
                u = post.get("url", "")
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
    return {
        f.split(".")[0] for f in os.listdir(WALLPAPER_DIR)
        if os.path.isfile(os.path.join(WALLPAPER_DIR, f)) and not f.startswith("_")
    }


async def _download_one(client: httpx.AsyncClient, url: str, dest: str) -> str | None:
    """Download to dest, return hex digest or None on failure. Dedupe by hash."""
    hsh = _load_hashes()
    async with _download_sem:
        try:
            async with client.stream("GET", url, timeout=40) as resp:
                hasher = hashlib.sha256()
                with open(dest, "wb") as f:
                    async for chunk in resp.aiter_bytes(65536):
                        hasher.update(chunk)
                        f.write(chunk)
            digest = hasher.hexdigest()
        except Exception as e:
            log.warning("wallpaper download failed %s: %s", url, e)
            return None
    if digest in hsh:
        try:
            os.remove(dest)
        except OSError:
            pass
        return None
    hsh[digest] = os.path.basename(dest)
    _save_hashes(hsh)
    return digest


async def _download_artist_wallpapers(name: str, n: int) -> list[str]:
    slug = name.strip().lower().replace(" ", "_").replace("/", "_")
    cached_files = sorted(
        f for f in os.listdir(WALLPAPER_DIR)
        if (f.startswith(f"_artist_{slug}_") or f.startswith(f"_reddit_{slug}_") or f.startswith(f"_lastfm_{slug}_"))  # noqa: E501
        and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    if cached_files:
        return [f"/api/wallpapers/files/{f}" for f in cached_files]

    async with httpx.AsyncClient(headers={"User-Agent": UA}) as client:
        reddit_urls = await _reddit_image_urls(client, name.strip())
        lastfm_urls = await _lastfm_image_urls(client, name.strip())

    if not reddit_urls and not lastfm_urls:
        return []

    sources = [
        (reddit_urls, "_reddit_"),
        (lastfm_urls, "_lastfm_"),
    ]
    existing = _existing_ids()
    urls: list[str] = []
    got = 0
    idx = [0, 0]
    while got < n and any(idx[k] < len(sources[k][0]) for k in range(2)):
        for k in range(2):
            src, prefix = sources[k]
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
            async with httpx.AsyncClient(headers={"User-Agent": UA}) as client:
                digest = await _download_one(client, item, dest)
            if digest:
                existing.add(os.path.basename(dest).split(".")[0])
                urls.append(f"/api/wallpapers/files/{os.path.basename(dest)}")
                got += 1
                if got >= n:
                    break
    return urls


@router.get("/count")
async def count() -> dict:
    return {"total": len(_existing_ids())}


@router.get("/list")
async def list_wallpapers() -> dict:
    ensure_dirs()
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
    if not artist and not track:
        raise HTTPException(status_code=400, detail="artist or track required")
    term = urllib.parse.quote(f"{artist} {track}".strip())
    headers = {"User-Agent": UA}
    try:
        async with httpx.AsyncClient(headers=headers) as client:
            r = await client.get(
                f"https://itunes.apple.com/search?term={term}&media=music&limit=6",
                timeout=20,
            )
            data = r.json()
    except Exception as e:
        log.warning("itunes search failed: %s", e)
        raise HTTPException(status_code=502, detail="itunes unavailable")

    results = data.get("results", [])
    if not results:
        raise HTTPException(status_code=404, detail="no cover found")
    candidates = [r for r in results if r.get("artworkUrl100")]
    if not candidates:
        raise HTTPException(status_code=404, detail="no artwork found")
    best = candidates[0]
    art = best["artworkUrl100"]
    hi = art.replace("100x100bb", "1000x1000bb").replace("100x100", "1000x1000")
    return {"url": hi, "title": best.get("trackName") or best.get("collectionName"), "artist": artist}


@router.get("/artist")
async def artist_wallpaper(request: Request, name: str, n: int = 6) -> dict:
    ensure_dirs()
    query = urllib.parse.quote(name.strip())
    if not query:
        raise HTTPException(status_code=400, detail="name required")
    slug = name.strip().lower().replace(" ", "_").replace("/", "_")

    cached_files = sorted(
        f for f in os.listdir(WALLPAPER_DIR)
        if (f.startswith(f"_artist_{slug}_") or f.startswith(f"_reddit_{slug}_") or f.startswith(f"_lastfm_{slug}_"))  # noqa: E501
        and f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    if cached_files:
        return {
            "wallpapers": [f"/api/wallpapers/files/{f}" for f in cached_files],
            "artist": name,
        }

    key = f"artist:{slug}"
    if key in _in_flight:
        return {"in_progress": True, "wallpapers": [], "artist": name}

    _in_flight.add(key)
    task = asyncio.create_task(_download_artist_wallpapers(name.strip(), n))
    tasks = getattr(request.app.state, "bg_tasks", set())
    tasks.add(task)

    async def _finish() -> None:
        try:
            urls = await task
            if urls:
                broker = request.app.state.broker
                await broker.publish({"event": "wallpapers_changed", "total": len(_existing_ids())})
        finally:
            _in_flight.discard(key)
            tasks.discard(task)

    asyncio.create_task(_finish())
    return {"in_progress": True, "wallpapers": [], "artist": name}


@router.post("/fetch")
async def fetch(request: Request, n: int = 4) -> dict:
    ensure_dirs()
    key = "fetch"
    if key in _in_flight:
        return {"accepted": True, "in_progress": True}

    _in_flight.add(key)

    async def _do_fetch() -> dict:
        existing = _existing_ids()
        got = 0
        headers = {"User-Agent": UA}
        async with httpx.AsyncClient(headers=headers) as client:
            for q in QUERIES:
                if got >= n:
                    break
                try:
                    r = await client.get(
                        f"https://wallhaven.cc/api/v1/search?q={q}&categories=010&purity=100&atleast=1920x1080&sorting=random",
                        timeout=30,
                    )
                    items = r.json().get("data", [])
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
                    digest = await _download_one(client, w["path"], dest)
                    if digest:
                        existing.add(wid)
                        got += 1
        return {"downloaded": got, "total": len(existing)}

    task = asyncio.create_task(_do_fetch())
    tasks = getattr(request.app.state, "bg_tasks", set())
    tasks.add(task)

    async def _cleanup() -> None:
        try:
            result = await task
            broker = request.app.state.broker
            await broker.publish({"event": "wallpapers_changed", "total": result["total"]})
        finally:
            _in_flight.discard(key)
            tasks.discard(task)

    asyncio.create_task(_cleanup())
    return {"accepted": True, "in_progress": True}


@router.get("/ratings")
async def get_ratings() -> dict:
    from catodo import store
    data = store.load("wallpaper_ratings", {"version": 1, "items": {}})
    return {"ratings": data.get("items", {})}


@router.post("/ratings")
async def set_rating(request: Request) -> dict:
    from catodo import store
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    wp_id = payload.get("id", "")
    rating = payload.get("rating")
    if not wp_id or rating not in ("up", "down", "none"):
        raise HTTPException(status_code=400, detail="id and rating (up|down|none) required")
    data = store.load("wallpaper_ratings", {"version": 1, "items": {}})
    items = data.get("items", {})
    if rating == "none":
        items.pop(wp_id, None)
    else:
        items[wp_id] = rating
    await store.save("wallpaper_ratings", {"version": 1, "items": items})
    return {"id": wp_id, "rating": rating}
