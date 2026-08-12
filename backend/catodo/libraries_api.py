"""API de bibliotecas de medios locales (multicanal configurable)."""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException, Request

from catodo.media import KINDS, MediaLibraryChannel, _default_libraries, _libraries_config

log = logging.getLogger("catodo.libraries.api")

router = APIRouter(prefix="/libraries", tags=["libraries"])


def _manager(request: Request):
    return request.app.state.manager


def _broker(request: Request):
    return request.app.state.broker


def _validate(body: dict) -> str:
    lib_id = str(body.get("id", ""))
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", lib_id):
        raise HTTPException(status_code=400, detail="id inválido (kebab-case)")
    if not body.get("path"):
        raise HTTPException(status_code=400, detail="path requerido")
    if str(body.get("kind", "series")) not in KINDS:
        raise HTTPException(status_code=400, detail=f"kind debe ser uno de {KINDS}")
    return lib_id


@router.get("")
async def list_libraries() -> list:
    return _default_libraries()


@router.post("")
async def add_library(request: Request) -> dict:
    from catodo import runtime_config

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON body")
    lib_id = _validate(body)
    existing = {c["id"] for c in _manager(request).list()}
    if lib_id in existing:
        raise HTTPException(status_code=409, detail=f"ya existe un canal con id {lib_id}")
    for lib in _libraries_config():
        if lib.get("id") == lib_id:
            raise HTTPException(status_code=409, detail=f"biblioteca ya configurada: {lib_id}")

    entry = {
        "id": lib_id,
        "name": str(body.get("name") or lib_id),
        "path": str(body["path"]),
        "kind": str(body.get("kind", "series")),
    }
    config = list(_libraries_config())
    config.append(entry)
    await runtime_config.set("libraries", config)

    ch = MediaLibraryChannel({**entry, "order": 6 + len(config) - 1})
    mgr = _manager(request)
    mgr.register(ch)
    mgr.reorder()
    await _broker(request).publish({"event": "libraries_changed"})
    log.info("library added: %s -> %s", lib_id, entry["path"])
    return {"ok": True, "id": lib_id}


@router.delete("/{library_id}")
async def remove_library(library_id: str, request: Request) -> dict:
    from catodo import runtime_config

    if library_id == "anime":
        raise HTTPException(status_code=400, detail="la biblioteca Anime no se puede quitar")
    config = [lib for lib in _libraries_config() if lib.get("id") != library_id]
    if len(config) == len(_libraries_config()):
        raise HTTPException(status_code=404, detail=f"unknown library: {library_id}")
    await runtime_config.set("libraries", config)
    _manager(request).unregister(library_id)
    await _broker(request).publish({"event": "libraries_changed"})
    log.info("library removed: %s", library_id)
    return {"ok": True, "id": library_id}
