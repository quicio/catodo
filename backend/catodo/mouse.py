"""Remote mouse/keyboard routes — delegates to the InputInjectorPort wired at startup.

The platform-specific implementation (ydotool/xdotool on Linux; cliclick/
osascript on macOS) lives in `catodo.infrastructure.{linux,macos}.input_injector`.
This module keeps the original FastAPI route signatures and FastAPI's `request`
injection, then forwards each call to the input injector stored on
`request.app.state.input_injector`. That keeps call sites in `api.py` (which
includes this router) and the frontend contract untouched.

When no native tool is available, returns HTTP 503 with a clear message so the
remote UI can disable the trackpad/keyboard gracefully.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("catodo.mouse")

router = APIRouter(prefix="/mouse", tags=["mouse"])

# Media keys that the Electron shell re-injects into the active webview (the OS
# media keys do not reach the webview on most platforms).
_MEDIA_EVENTS = frozenset({
    "playpause", "prev", "next", "stop", "rewind", "forward", "back", "homepage",
})


def _injector(request: Request):
    inj = getattr(request.app.state, "input_injector", None)
    if inj is None:
        raise HTTPException(
            status_code=503,
            detail="input injector not available on this platform",
        )
    if not inj.is_available():
        raise HTTPException(
            status_code=503,
            detail="input injector not available — install ydotool/click or osascript",
        )
    return inj


@router.post("/move")
async def move(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    dx = int(body.get("dx", 0))
    dy = int(body.get("dy", 0))
    await _injector(request).move(dx, dy)
    return {"dx": dx, "dy": dy}


@router.post("/click")
async def click(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    button = int(body.get("button", 1))
    await _injector(request).click(button)
    return {"button": button}


@router.post("/scroll")
async def scroll(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    dy = int(body.get("dy", 0))
    if not dy:
        return {"dy": 0}
    await _injector(request).scroll(dy)
    return {"dy": dy}


@router.post("/key")
async def key(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    name = str(body.get("key", "")).lower()
    shift = bool(body.get("shift", False))
    try:
        await _injector(request).key(name, shift=shift)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if name in _MEDIA_EVENTS:
        broker = getattr(getattr(request.app, "state", None), "broker", None)
        if broker is not None:
            try:
                await broker.publish({"event": "media_key", "key": name})
            except Exception as e:
                log.warning("media_key publish failed: %s", e)
    return {"key": name, "shift": shift}


@router.post("/type")
async def type_text(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    text = str(body.get("text", ""))
    if not text:
        return {"text": ""}
    await _injector(request).type_text(text)
    return {"text": text}