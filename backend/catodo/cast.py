"""Screen casting — receiver WebRTC (pantalla inalámbrica).

El backend solo hace de relay de señalización (offer/answer/ICE) entre el
dispositivo fuente (página /cast) y el receiver (Electron). El media va P2P.
"""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from catodo.channel import Channel

log = logging.getLogger("catodo.cast")

router = APIRouter(prefix="/cast", tags=["cast"])

READY_MSG = "__catodo_ready"
STOP_MSG = "__catodo_stop"
RECEIVER_READY_MSG = "__catodo_receiver_ready"


async def _send(ws: WebSocket | None, msg: str) -> None:
    if ws is None:
        return
    try:
        await ws.send_text(msg)
    except Exception:
        pass


class CastManager:
    """Sesión única de proyección. Estados: idle | signaling | active."""

    def __init__(self, broker) -> None:
        self._broker = broker
        self._state = "idle"
        self._source: WebSocket | None = None
        self._receiver: WebSocket | None = None
        self._source_label: str | None = None
        self._token: str | None = None
        self._started_at: float | None = None

    @property
    def state(self) -> str:
        return self._state

    @property
    def source_ws(self) -> WebSocket | None:
        return self._source

    @property
    def receiver_ws(self) -> WebSocket | None:
        return self._receiver

    def info(self) -> dict:
        return {
            "state": self._state,
            "token": self._token,
            "source": self._source_label,
            "started_at": self._started_at,
        }

    def set_peer(self, role: str, ws: WebSocket) -> None:
        if role == "source":
            self._source = ws
        else:
            self._receiver = ws

    def clear_peer(self, role: str, ws: WebSocket) -> None:
        if role == "source" and self._source is ws:
            self._source = None
        elif role != "source" and self._receiver is ws:
            self._receiver = None

    async def start(self, label: str) -> None:
        self._token = uuid.uuid4().hex[:8]
        self._source_label = label
        self._started_at = time.time()
        await self._set_state("signaling")

    async def activate(self) -> None:
        await self._set_state("active")

    async def end(self) -> None:
        await self._set_state("idle")
        self._token = None
        self._source_label = None
        self._started_at = None

    async def _set_state(self, state: str) -> None:
        if state == self._state:
            return
        self._state = state
        if state == "active":
            await self._broker.publish(
                {"event": "cast_session_started", "source": self._source_label, "token": self._token}
            )
        elif state == "idle":
            await self._broker.publish({"event": "cast_session_ended"})

    async def handle_control(self, msg: str, sender: WebSocket) -> None:
        if msg == READY_MSG:
            await self.activate()
        elif msg == STOP_MSG:
            other = self._receiver if self._source is sender else self._source
            await _send(other, STOP_MSG)
            await self.end()


@router.get("")
async def cast_state(request: Request) -> dict:
    return request.app.state.cast.info()


@router.post("/stop")
async def cast_stop(request: Request) -> dict:
    await request.app.state.cast.end()
    await _send(request.app.state.cast.source_ws, STOP_MSG)
    return {"ok": True}


@router.websocket("/ws")
async def cast_ws(websocket: WebSocket) -> None:
    role = websocket.query_params.get("role", "source")
    label = websocket.query_params.get("label", "") or "Dispositivo"
    manager: CastManager = websocket.app.state.cast
    is_source = role != "receiver"
    await websocket.accept()
    try:
        if is_source:
            if manager.state != "idle":
                await manager.end()
            manager.set_peer("source", websocket)
            await manager.start(label)
        else:
            manager.set_peer("receiver", websocket)
            await _send(manager.source_ws, RECEIVER_READY_MSG)

        while True:
            msg = await websocket.receive_text()
            if msg.startswith("__catodo_"):
                await manager.handle_control(msg, websocket)
                continue
            other = manager.receiver_ws if is_source else manager.source_ws
            if other is not None:
                await _send(other, msg)
    except WebSocketDisconnect:
        pass
    finally:
        manager.clear_peer("source" if is_source else "receiver", websocket)
        await manager.end()


class CastChannel(Channel):
    """Canal que muestra la proyección entrante."""

    id = "screen-cast"
    name = "Pantalla"
    icon = "cast"
    type = "cast"
    order = 100

    def __init__(self, cast_manager: CastManager) -> None:
        self._cast = cast_manager

    async def open(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def state(self) -> dict:
        return {"id": self.id, **self._cast.info()}

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "stop":
            await self._cast.end()
        else:
            log.info("cast command passthrough: %s %s", cmd, kwargs)
