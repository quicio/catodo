"""API de gestión de plugins (list/install/enable/disable)."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("catodo.plugins.api")

router = APIRouter(prefix="/plugins", tags=["plugins"])


def _pm(request: Request):
    return request.app.state.plugins


def _manager(request: Request):
    return request.app.state.manager


def _broker(request: Request):
    return request.app.state.broker


def _register_plugin_channel(request: Request, plugin_id: str) -> None:
    mgr = _manager(request)
    for ch in _pm(request).scan():
        if ch.id == plugin_id and plugin_id not in {c["id"] for c in mgr.list()}:
            mgr.register(ch)
    mgr.reorder()


@router.get("")
async def list_plugins(request: Request) -> list:
    return _pm(request).list_plugins()


@router.get("/{plugin_id}")
async def get_plugin(plugin_id: str, request: Request) -> dict:
    p = _pm(request).get_plugin(plugin_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"unknown plugin: {plugin_id}")
    return p


@router.post("/install")
async def install_plugin(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        body = {}
    plugin_id = str(body.get("id", ""))
    if not plugin_id:
        raise HTTPException(status_code=400, detail="missing 'id'")
    try:
        await asyncio.to_thread(_pm(request).install, plugin_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    _register_plugin_channel(request, plugin_id)
    await _broker(request).publish({"event": "plugins_changed"})
    return _pm(request).get_plugin(plugin_id) or {"id": plugin_id}


@router.post("/{plugin_id}/enable")
async def enable_plugin(plugin_id: str, request: Request) -> dict:
    try:
        await asyncio.to_thread(_pm(request).set_enabled, plugin_id, True)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown plugin: {plugin_id}")
    _register_plugin_channel(request, plugin_id)
    await _broker(request).publish({"event": "plugins_changed"})
    return {"ok": True, "id": plugin_id}


@router.post("/{plugin_id}/disable")
async def disable_plugin(plugin_id: str, request: Request) -> dict:
    try:
        await asyncio.to_thread(_pm(request).set_enabled, plugin_id, False)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown plugin: {plugin_id}")
    _manager(request).unregister(plugin_id)
    await _broker(request).publish({"event": "plugins_changed"})
    return {"ok": True, "id": plugin_id}
