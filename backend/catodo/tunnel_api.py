"""HTTP API for the tunnel manager.

Endpoints:
- POST /api/tunnel/start
- POST /api/tunnel/stop
- GET  /api/tunnel/status
- GET  /api/tunnel/health
- GET  /api/tunnel/providers
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("catodo.tunnel.api")

router = APIRouter(prefix="/api/tunnel", tags=["tunnel"])


def _mgr(request: Request):
    return request.app.state.tunnel


@router.get("/providers")
async def providers(request: Request) -> list:
    return _mgr(request).providers()


@router.get("/status")
async def status(request: Request) -> dict:
    return _mgr(request).status()


@router.get("/health")
async def health(request: Request) -> dict:
    return _mgr(request).health()


@router.post("/start")
async def start(request: Request) -> dict:
    try:
        return await _mgr(request).start()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        msg = str(e)
        if msg.startswith("already running"):
            raise HTTPException(status_code=409, detail=msg)
        if msg.startswith("unknown provider"):
            raise HTTPException(status_code=400, detail=msg)
        raise HTTPException(status_code=409, detail=msg)


@router.post("/stop")
async def stop(request: Request) -> dict:
    return await _mgr(request).stop()
