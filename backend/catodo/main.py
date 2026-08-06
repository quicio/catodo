"""FastAPI application entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from catodo.api import router as api_router
from catodo.lyrics import router as lyrics_router
from catodo.config import settings
from catodo.events import EventBroker
from catodo.manager import ChannelManager
from catodo.channels import build_default_registry

logger = logging.getLogger("catodo")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app):
    broker = EventBroker()
    manager = ChannelManager(broker=broker)
    for ch in build_default_registry():
        manager.register(ch)

    app.state.broker = broker
    app.state.manager = manager
    app.state.started_at = __import__("time").time()

    logger.info("Cátodo backend started with %d channels", len(manager.list()))
    try:
        yield
    finally:
        await manager.close_all()
        await broker.close()


def create_app() -> "FastAPI":
    from fastapi import FastAPI

    app = FastAPI(title="Cátodo", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    app.include_router(lyrics_router, prefix="/api")
    if STATIC_DIR.exists():
        app.mount(
            "/",
            StaticFiles(directory=str(STATIC_DIR), html=True),
            name="static",
        )

        @app.middleware("http")
        async def no_cache(request, call_next):
            resp = await call_next(request)
            if request.url.path.startswith("/assets") or request.url.path == "/" or request.url.path.endswith(".html"):
                resp.headers["Cache-Control"] = "no-store, must-revalidate"
            return resp
    return app


app = create_app()


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    uvicorn.run(
        "catodo.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    run()
