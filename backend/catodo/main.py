"""FastAPI application entry point."""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from catodo.api import router as api_router
from catodo.cast import CastChannel, CastManager
from catodo.cast import router as cast_router
from catodo.channels import build_default_registry
from catodo.config import ensure_ssl, settings
from catodo.events import EventBroker
from catodo.idle import IdleManager
from catodo.libraries_api import router as libraries_router
from catodo.lyrics import router as lyrics_router
from catodo.manager import ChannelManager
from catodo.mouse import router as mouse_router
from catodo.mqtt_bridge import MqttBridge
from catodo.pair import router as pair_router
from catodo.plugin_system import PluginManager, sort_channels
from catodo.plugins_api import router as plugins_router
from catodo.wallpapers import router as wallpapers_router

logger = logging.getLogger("catodo")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

_token = os.getenv("CATODO_TOKEN", "")


def _is_loopback(host: str) -> bool:
    return host in ("127.0.0.1", "localhost", "::1")


@asynccontextmanager
async def lifespan(app):
    # Con doble server (HTTP + HTTPS en el mismo proceso), el lifespan se entra
    # una vez por server; solo el primero inicializa y cierra.
    if getattr(app.state, "_catodo_lifespan", False):
        yield
        return
    app.state._catodo_lifespan = True

    broker = EventBroker()
    manager = ChannelManager(broker=broker)
    plugins = PluginManager()
    plugins._seed_bundled()

    channels = sort_channels(build_default_registry() + plugins.scan())
    for ch in channels:
        manager.register(ch)
    plugins.ensure_all_dependencies()

    cast = CastManager(broker=broker)
    manager.register(CastChannel(cast))
    manager.reorder()

    await manager._mixer_init()

    idle = IdleManager(broker=broker)
    idle.start()

    mqtt = MqttBridge(manager=manager, broker=broker)
    await mqtt.start()

    app.state.broker = broker
    app.state.manager = manager
    app.state.plugins = plugins
    app.state.cast = cast
    app.state.idle = idle
    app.state.mqtt = mqtt
    app.state.started_at = __import__("time").time()
    app.state.bg_tasks: set = set()

    logger.info("Cátodo backend started with %d channels", len(manager.list()))
    try:
        yield
    finally:
        await idle.stop()
        await mqtt.stop()
        for t in app.state.bg_tasks:
            t.cancel()
        await manager.close_all()
        await broker.close()
        app.state._catodo_lifespan = False


def create_app() -> FastAPI:
    app = FastAPI(title="Cátodo", version="0.1.0", lifespan=lifespan)

    if not _is_loopback(settings.host):
        logger.warning("binding to %s — API is network-exposed", settings.host)
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[f"http://{settings.host}:{settings.port}"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    if _token:
        @app.middleware("http")
        async def token_middleware(request: Request, call_next):
            if request.url.path.startswith("/api/"):
                provided = request.headers.get("X-Catodo-Token") or request.query_params.get("token") or ""
                if provided != _token:
                    return JSONResponse(status_code=401, content={"detail": "unauthorized"})
            return await call_next(request)

    @app.middleware("http")
    async def idle_middleware(request: Request, call_next):
        idle = getattr(request.app.state, "idle", None)
        if idle is not None:
            path = request.url.path
            if path.startswith("/api/") and path != "/api/health":
                idle.touch()
        return await call_next(request)

    app.include_router(api_router)
    app.include_router(lyrics_router, prefix="/api")
    app.include_router(wallpapers_router, prefix="/api")
    app.include_router(mouse_router, prefix="/api")
    app.include_router(plugins_router, prefix="/api")
    app.include_router(libraries_router, prefix="/api")
    app.include_router(pair_router, prefix="/api")
    app.include_router(cast_router, prefix="/api")
    if STATIC_DIR.exists():
        app.mount(
            "/",
            StaticFiles(directory=str(STATIC_DIR), html=True),
            name="static",
        )

        @app.middleware("http")
        async def no_cache(request, call_next):
            resp = await call_next(request)
            if request.url.path.startswith("/assets") or request.url.path == "/" or request.url.path.endswith(".html"):  # noqa: E501
                resp.headers["Cache-Control"] = "no-store, must-revalidate"
            return resp
    return app


app = create_app()


async def _serve(app_obj: FastAPI, host: str, port: int, ssl: tuple[str, str] | None = None) -> None:
    from uvicorn import Config, Server

    config = Config(
        app_obj,
        host=host,
        port=port,
        ssl_certfile=ssl[0] if ssl else None,
        ssl_keyfile=ssl[1] if ssl else None,
        log_level="info",
    )
    await Server(config).serve()


async def _run_all(app_obj: FastAPI, host: str, port: int, ssl: tuple[str, str] | None) -> None:
    servers = [_serve(app_obj, host, port)]
    if ssl:
        ssl_port = int(os.getenv("CATODO_SSL_PORT", port + 1))
        logger.info("HTTPS habilitado en :%d (para /cast y compartir pantalla)", ssl_port)
        servers.append(_serve(app_obj, host, ssl_port, ssl))
    await asyncio.gather(*servers)


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(_run_all(create_app(), settings.host, settings.port, ensure_ssl()))


if __name__ == "__main__":
    run()
