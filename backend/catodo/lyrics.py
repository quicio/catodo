"""Lyrics lookup via LRCLib (no auth required)."""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from fastapi import APIRouter, HTTPException, Query

log = logging.getLogger("catodo.lyrics")

router = APIRouter(prefix="/lyrics", tags=["lyrics"])

LRCLIB_GET = "https://lrclib.net/api/get"
LRCLIB_SEARCH = "https://lrclib.net/api/search"
HEADERS = {"User-Agent": "catodo/0.1 (https://github.com/local/catodo)"}


@router.get("")
async def lyrics(
    artist: str = Query(..., min_length=1),
    track: str = Query(..., min_length=1),
    duration: Optional[int] = Query(None, description="Track duration in seconds"),
) -> dict:
    artist_clean = artist.strip()
    track_clean = track.strip()
    if not artist_clean or not track_clean:
        raise HTTPException(status_code=400, detail="artist and track are required")

    timeout = httpx.Timeout(5.0, connect=3.0)
    async with httpx.AsyncClient(timeout=timeout, headers=HEADERS) as client:
        try:
            params = {
                "artist_name": artist_clean,
                "track_name": track_clean,
            }
            if duration is not None:
                params["duration"] = duration
            r = await client.get(LRCLIB_GET, params=params)
            if r.status_code == 200:
                data = r.json()
                return _format(data)
        except Exception as e:
            log.debug("lrclib get failed: %s", e)

        try:
            r = await client.get(
                LRCLIB_SEARCH,
                params={
                    "artist_name": artist_clean,
                    "track_name": track_clean,
                },
            )
            if r.status_code == 200:
                results = r.json()
                if results:
                    best = _pick_best(results, duration)
                    if best:
                        return _format(best)
        except Exception as e:
            log.debug("lrclib search failed: %s", e)

    raise HTTPException(status_code=404, detail="lyrics not found")


def _format(data: dict) -> dict:
    plain = data.get("plainLyrics") or ""
    synced = data.get("syncedLyrics") or ""
    lines: list[dict] = []
    if synced:
        for line in synced.splitlines():
            if not line.strip():
                continue
            ts_end = line.find("]")
            if ts_end < 0:
                continue
            ts = line[1:ts_end].strip()
            text = line[ts_end + 1:].strip()
            try:
                m, s = ts.split(":")
                seconds = int(m) * 60 + float(s)
                lines.append({"t": seconds, "text": text})
            except Exception:
                continue
    return {
        "track": data.get("trackName"),
        "artist": data.get("artistName"),
        "album": data.get("albumName"),
        "duration": data.get("duration"),
        "synced": bool(lines),
        "lines": lines,
        "plain": plain,
        "source": "lrclib",
        "id": data.get("id"),
    }


def _pick_best(results: list[dict], duration: Optional[int]) -> Optional[dict]:
    if not results:
        return None
    if duration is None:
        return results[0]
    best = None
    best_delta = None
    for item in results:
        d = item.get("duration")
        if d is None:
            continue
        delta = abs(float(d) - duration)
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best = item
    return best or results[0]
