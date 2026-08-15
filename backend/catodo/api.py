"""HTTP + WebSocket API."""
from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import os
import time

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse

log = logging.getLogger("catodo.api")

router = APIRouter(prefix="/api")


def _manager(request: Request):
    return request.app.state.manager


def _broker(request: Request):
    return request.app.state.broker


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/activity")
async def activity(request: Request) -> dict:
    """Ping de actividad local del kiosk (el middleware ya toca el reloj)."""
    return {"ok": True}


@router.post("/voice")
async def voice(request: Request) -> dict:
    """Comando por voz: interpreta texto transcrito y ejecuta la acción."""
    from catodo.voice import match

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="missing 'text'")
    mgr = _manager(request)
    intent = match(text, mgr.list())
    if intent["recognized"]:
        action = intent["action"]
        try:
            if action == "open":
                await mgr.open(intent["channel"])
            elif action == "next":
                await mgr.next()
            elif action == "prev":
                await mgr.previous()
            elif action == "volume_up":
                await mgr.adjust_volume(5)
            elif action == "volume_down":
                await mgr.adjust_volume(-5)
            elif action == "play":
                if mgr.current:
                    await mgr.command(mgr.current, "play")
            elif action == "pause":
                if mgr.current:
                    await mgr.command(mgr.current, "pause")
            elif action == "screen":
                await mgr.open("screen-cast")
        except KeyError:
            intent["recognized"] = False
            intent["action"] = None
    await _broker(request).publish({"event": "voice_command", **intent, "text": text})
    return {"ok": True, **intent}


@router.post("/type")
async def type_text(request: Request) -> dict:
    """Inyecta texto en el webview activo del kiosk (evento WS `type_text`)."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    text = str(payload.get("text", ""))
    if not text:
        raise HTTPException(status_code=400, detail="missing 'text'")
    await _broker(request).publish({"event": "type_text", "text": text})
    return {"ok": True}


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
    from catodo.channel import SupportsEpisodes
    try:
        ch = _manager(request).get(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    if isinstance(ch, SupportsEpisodes):
        return {"id": channel_id, "episodes": ch.episodes()}
    return {"id": channel_id, "episodes": []}


@router.get("/channels/{channel_id}/boxart")
async def channel_boxart(channel_id: str, request: Request) -> FileResponse:
    from catodo.channel import SupportsBoxart

    try:
        ch = _manager(request).get(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    if not isinstance(ch, SupportsBoxart):
        raise HTTPException(status_code=404, detail="channel has no boxart")
    rel = request.query_params.get("path", "")
    if not rel:
        raise HTTPException(status_code=404, detail="missing 'path'")
    path = ch.boxart(rel)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="boxart not found")
    return FileResponse(path)


@router.get("/channels/{channel_id}/stream")
async def channel_stream(channel_id: str, request: Request) -> StreamingResponse:
    from catodo.channel import SupportsStream
    try:
        ch = _manager(request).get(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    if not isinstance(ch, SupportsStream):
        raise HTTPException(status_code=404, detail="channel has no stream")
    cur = ch.current()
    if cur is None:
        raise HTTPException(status_code=404, detail="no episode selected")
    path = cur.get("path", "")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="file not found")
    file_size = os.path.getsize(path)
    media_type = mimetypes.guess_type(path)[0] or "video/mp4"

    range_header = request.headers.get("range", "")
    if range_header:
        return _range_response(path, file_size, range_header, media_type)
    return _full_response(path, file_size, media_type)


def _full_response(path: str, file_size: int, media_type: str) -> StreamingResponse:
    resp = StreamingResponse(
        _file_reader(path, 0, file_size),
        status_code=200,
        media_type=media_type,
        headers={
            "accept-ranges": "bytes",
            "content-length": str(file_size),
        },
    )
    return resp


def _range_response(path: str, file_size: int, range_header: str, media_type: str) -> StreamingResponse:
    unit, _, spec = range_header.strip().partition("=")
    if unit != "bytes" or not spec:
        raise HTTPException(status_code=416, headers={"content-range": f"bytes */{file_size}"})
    try:
        start_str, sep, end_str = spec.partition("-")
        if not start_str:
            length = int(end_str) if end_str else file_size
            start = max(0, file_size - length)
            end = file_size - 1
        else:
            start = int(start_str)
            end = int(end_str) if sep and end_str else file_size - 1
    except (ValueError, TypeError):
        raise HTTPException(status_code=416, headers={"content-range": f"bytes */{file_size}"})
    if start >= file_size or end >= file_size or start > end:
        raise HTTPException(status_code=416, headers={"content-range": f"bytes */{file_size}"})

    chunk_size = end - start + 1
    return StreamingResponse(
        _file_reader(path, start, chunk_size),
        status_code=206,
        media_type=media_type,
        headers={
            "content-range": f"bytes {start}-{end}/{file_size}",
            "content-length": str(chunk_size),
            "accept-ranges": "bytes",
        },
    )


async def _file_reader(path: str, offset: int, length: int):
    with open(path, "rb") as f:
        f.seek(offset)
        remaining = length
        while remaining > 0:
            chunk_size = min(65536, remaining)
            chunk = await asyncio.to_thread(f.read, chunk_size)
            if not chunk:
                break
            yield chunk
            remaining -= len(chunk)


@router.get("/channels/{channel_id}/history")
async def channel_history(channel_id: str, request: Request) -> dict:
    from catodo.channel import SupportsHistory
    try:
        ch = _manager(request).get(channel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel_id}")
    if isinstance(ch, SupportsHistory):
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


def _parse_volume(level: str) -> int | None:
    """Return a target absolute level, or None to mean relative direction."""
    s = level.strip()
    if s in ("+", "-"):
        return None
    try:
        return int(s)
    except ValueError:
        raise HTTPException(status_code=400, detail="level must be int or +/-")


def _raw_query_value(request: Request, key: str) -> str | None:
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


@router.get("/config")
async def get_config() -> dict:
    from catodo import runtime_config

    return runtime_config.all()


@router.post("/config")
async def set_config(request: Request) -> dict:
    from catodo import runtime_config

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    for k, v in payload.items():
        if k == "theme_crt_enabled":
            # Alias legacy → theme_overrides.crt (evento canónico)
            merged = await runtime_config.fold_crt_alias(v)
            await _broker(request).publish({"event": "config_changed", "key": "theme_overrides", "value": merged})
            continue
        if k in runtime_config.KEYS:
            await runtime_config.set(k, v)
            await _broker(request).publish({"event": "config_changed", "key": k, "value": v})
    return runtime_config.all()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    broker = websocket.app.state.broker
    manager = websocket.app.state.manager
    try:
        snapshot = manager.state()
        channels_state = {}
        for c in manager.list():
            cid = c["id"]
            try:
                channels_state[cid] = await manager.get(cid).state()
            except Exception:
                pass
        snapshot["channels"] = channels_state
        await websocket.send_text(json.dumps({"event": "state_snapshot", **snapshot}))
    except Exception as e:
        log.warning("ws snapshot failed: %s", e)
    try:
        async for event in broker.subscribe():
            await websocket.send_text(json.dumps(event))
    except WebSocketDisconnect:
        return
    except Exception as e:
        log.warning("ws error: %s", e)
