"""HTTP + WebSocket API."""
from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

log = logging.getLogger("catodo.api")

router = APIRouter(prefix="/api")


def _manager(request: Request):
    return request.app.state.manager


def _broker(request: Request):
    return request.app.state.broker


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/channels")
async def list_channels(request: Request) -> list:
    return _manager(request).list()


@router.get("/state")
async def state(request: Request) -> dict:
    mgr = _manager(request)
    started: float = getattr(request.app.state, "started_at", time.time())
    s = mgr.state()
    s["uptime_seconds"] = int(time.time() - started)
    return s


@router.post("/channels/{channel_id}/open")
async def open_channel(channel_id: str, request: Request) -> dict:
    try:
        await _manager(request).open(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    return {"ok": True, "current": channel_id}


@router.post("/channels/{channel_id}/close")
async def close_channel(channel_id: str, request: Request) -> dict:
    try:
        await _manager(request).close(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    return {"ok": True}


@router.post("/channels/next")
async def next_channel(request: Request) -> dict:
    target = await _manager(request).next()
    return {"ok": True, "current": target}


@router.post("/channels/previous")
async def previous_channel(request: Request) -> dict:
    target = await _manager(request).previous()
    return {"ok": True, "current": target}


@router.get("/channels/{channel_id}/state")
async def channel_state(channel_id: str, request: Request) -> dict:
    try:
        return await _manager(request).get(channel_id).state()
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")


@router.get("/channels/{channel_id}/episodes")
async def channel_episodes(channel_id: str, request: Request) -> dict:
    try:
        ch = _manager(request).get(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    if hasattr(ch, "episodes"):
        return {"id": channel_id, "episodes": ch.episodes()}
    return {"id": channel_id, "episodes": []}


@router.get("/channels/{channel_id}/stream")
async def channel_stream(channel_id: str, request: Request, rel: str = "") -> FileResponse:
    try:
        ch = _manager(request).get(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    if not hasattr(ch, "current"):
        raise HTTPException(status_code=404, detail="channel has no stream")
    if rel:
        ch.set_episode(rel)
    cur = ch.current()
    if cur is None:
        raise HTTPException(status_code=404, detail="no episode selected")
    path = cur.get("path", "")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="file not found")
    media_type = mimetypes.guess_type(path)[0] or "video/mp4"
    return FileResponse(path, media_type=media_type, filename=os.path.basename(path))


@router.get("/channels/{channel_id}/history")
async def channel_history(channel_id: str, request: Request) -> dict:
    try:
        ch = _manager(request).get(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    if hasattr(ch, "history_state"):
        return await ch.history_state()
    return {"id": channel_id, "items": []}


@router.post("/channels/{channel_id}/command")
async def channel_command(channel_id: str, request: Request) -> dict:
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    cmd = payload.get("command")
    if not cmd:
        raise HTTPException(status_code=400, detail="missing 'command'")
    kwargs = {k: v for k, v in payload.items() if k != "command"}
    try:
        await _manager(request).command(channel_id, cmd, **kwargs)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    return {"ok": True}


def _parse_volume(level: str) -> Optional[int]:
    """Return a target absolute level, or None to mean relative direction."""
    s = level.strip()
    if s in ("+", "-"):
        return None
    try:
        return int(s)
    except ValueError:
        raise HTTPException(status_code=400, detail="level must be int or +/-")


def _raw_query_value(request: Request, key: str) -> Optional[str]:
    """Read a query-string value from the raw bytes so `+` survives decoding."""
    from urllib.parse import unquote

    raw: bytes = request.scope.get("query_string", b"")
    if not raw:
        return None
    text = raw.decode("latin-1")
    for pair in text.split("&"):
        if not pair:
            continue
        if "=" in pair:
            k, v = pair.split("=", 1)
        else:
            k, v = pair, ""
        if k == key:
            return unquote(v.replace("+", "%2B"))
    return None


@router.post("/volume")
async def volume(request: Request) -> dict:
    mgr = _manager(request)
    level = _raw_query_value(request, "level")
    if level is None:
        raise HTTPException(status_code=400, detail="missing 'level'")
    target = _parse_volume(level)
    if target is None:
        delta = 5 if level.strip() == "+" else -5
        new = await mgr.adjust_volume(delta)
    else:
        new = await mgr.set_volume(target)
    return {"ok": True, "volume": new}


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    broker = websocket.app.state.broker
    try:
        async for event in broker.subscribe():
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        return
    except Exception as e:
        log.warning("ws error: %s", e)
