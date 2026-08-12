"""Mouse control via ydotool (Wayland) or xdotool (X11) — remote trackpad."""
from __future__ import annotations

import asyncio
import logging
import shutil

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("catodo.mouse")

router = APIRouter(prefix="/mouse", tags=["mouse"])

_TOOL: str | None = None
_TOOL_BIN: str | None = None
_MOVE_CMD: tuple[str, ...] = ()
_CLICK_LEFT: tuple[str, ...] = ()
_CLICK_RIGHT: tuple[str, ...] = ()

_KEYS_YDOTOOL: dict[str, tuple[str, ...]] = {
    "esc": ("1:1", "1:0"),
    "enter": ("28:1", "28:0"),
    "backspace": ("14:1", "14:0"),
    "tab": ("15:1", "15:0"),
    "space": ("57:1", "57:0"),
    "up": ("103:1", "103:0"),
    "down": ("108:1", "108:0"),
    "left": ("105:1", "105:0"),
    "right": ("106:1", "106:0"),
    "del": ("111:1", "111:0"),
    "home": ("102:1", "102:0"),
    "end": ("107:1", "107:0"),
    "ntilde": ("39:1", "39:0"),
    "playpause": ("164:1", "164:0"),
    "prev": ("165:1", "165:0"),
    "next": ("163:1", "163:0"),
    "stop": ("166:1", "166:0"),
    "rewind": ("168:1", "168:0"),
    "forward": ("208:1", "208:0"),
    "volup": ("115:1", "115:0"),
    "voldown": ("114:1", "114:0"),
    "mute": ("113:1", "113:0"),
    "homepage": ("172:1", "172:0"),
    "power": ("116:1", "116:0"),
    "back": ("158:1", "158:0"),
}

_KEYS_XDOTOOL: dict[str, tuple[str, ...]] = {
    "esc": ("Escape",),
    "enter": ("Return",),
    "backspace": ("BackSpace",),
    "tab": ("Tab",),
    "space": ("space",),
    "up": ("Up",),
    "down": ("Down",),
    "left": ("Left",),
    "right": ("Right",),
    "del": ("Delete",),
    "home": ("Home",),
    "end": ("End",),
    "ntilde": ("ntilde",),
    "playpause": ("XF86AudioPlay",),
    "prev": ("XF86AudioPrev",),
    "next": ("XF86AudioNext",),
    "stop": ("XF86AudioStop",),
    "rewind": ("XF86AudioRewind",),
    "forward": ("XF86AudioForward",),
    "volup": ("XF86AudioRaiseVolume",),
    "voldown": ("XF86AudioLowerVolume",),
    "mute": ("XF86AudioMute",),
    "homepage": ("XF86HomePage",),
    "power": ("XF86PowerOff",),
    "back": ("XF86Back",),
}


def _detect() -> str | None:
    global _TOOL, _TOOL_BIN, _MOVE_CMD, _CLICK_LEFT, _CLICK_RIGHT
    if _TOOL is not None:
        return _TOOL
    ydotool = shutil.which("ydotool")
    if ydotool:
        _TOOL = "ydotool"
        _TOOL_BIN = ydotool
        _MOVE_CMD = ("mousemove", "-x", "{dx}", "-y", "{dy}")
        _CLICK_LEFT = ("click", "0xC0")
        _CLICK_RIGHT = ("click", "0xC1")
        log.info("mouse: using ydotool (Wayland)")
        return _TOOL
    xdotool = shutil.which("xdotool")
    if xdotool:
        _TOOL = "xdotool"
        _TOOL_BIN = xdotool
        _MOVE_CMD = ("mousemove_relative", "--", "{dx}", "{dy}")
        _CLICK_LEFT = ("click", "1")
        _CLICK_RIGHT = ("click", "3")
        log.info("mouse: using xdotool (X11)")
        return _TOOL
    log.warning("mouse: install ydotool (Wayland) or xdotool (X11)")
    return None


async def _run(*args: str) -> None:
    tool = _detect()
    if not tool:
        raise HTTPException(status_code=503, detail="mouse tool not available — install ydotool")
    log.debug("mouse %s: %s", tool, " ".join(args))
    proc = await asyncio.create_subprocess_exec(
        _TOOL_BIN, *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=3)
    if proc.returncode != 0:
        log.warning("mouse %s failed (rc=%d): %s", tool, proc.returncode, stderr.decode()[:200])


@router.post("/move")
async def move(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    dx = int(body.get("dx", 0))
    dy = int(body.get("dy", 0))
    args = tuple(
        str(dx) if p == "{dx}" else str(dy) if p == "{dy}" else p
        for p in _MOVE_CMD
    )
    await _run(*args)
    return {"dx": dx, "dy": dy}


@router.post("/click")
async def click(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    button = int(body.get("button", 1))
    args = _CLICK_RIGHT if button == 3 else _CLICK_LEFT
    await _run(*args)
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
    tool = _detect()
    if not tool:
        raise HTTPException(status_code=503, detail="mouse tool not available — install ydotool")
    if tool == "ydotool":
        await _run("mousemove", "--wheel", "-y", str(dy))
    else:
        button = "4" if dy > 0 else "5"
        for _ in range(min(abs(dy), 10)):
            await _run("click", button)
    return {"dy": dy}


# Teclas que además se reenvían por WS para que el frontend pueda inyectarlas
# en el webview activo (YouTube/TV), ya que las teclas media del OS no llegan ahí.
_MEDIA_EVENTS = frozenset({
    "playpause", "prev", "next", "stop", "rewind", "forward", "back", "homepage",
})


@router.post("/key")
async def key(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    name = str(body.get("key", "")).lower()
    shift = bool(body.get("shift", False))
    tool = _detect()
    if not tool:
        raise HTTPException(status_code=503, detail="mouse tool not available — install ydotool")
    seq = (_KEYS_YDOTOOL if tool == "ydotool" else _KEYS_XDOTOOL).get(name)
    if not seq:
        raise HTTPException(status_code=400, detail=f"unknown key: {name}")
    if shift:
        if tool == "ydotool":
            seq = ("42:1",) + seq + ("42:0",)
        else:
            seq = tuple("shift+" + k for k in seq)
    await _run(*seq)
    if name in _MEDIA_EVENTS:
        app_state = getattr(request, "app", None)
        broker = getattr(getattr(app_state, "state", None), "broker", None) if app_state else None
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
    await _run("type", text)
    return {"text": text}
