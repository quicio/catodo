"""TunnelManager — orchestrates the active provider.

Owns:
- the persistent runtime state (PID, started_at, last_error) at
  `<data_dir>/tunnel_state.json` — written atomically like
  `runtime_config._save_inner`;
- a watcher task that reaps the child and updates state on non-zero exit;
- a periodic health probe that publishes `tunnel_state` transitions
  through the existing `EventBroker`;
- the singleton accessor + lifespan integration (`app.state.tunnel`).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING

from catodo import runtime_config
from catodo.datadir import DATA_DIR, ensure_dirs
from catodo.tunnel import available as _available_providers
from catodo.tunnel import get_provider
from catodo.tunnel.provider import TunnelHandle, TunnelProvider, TunnelState

if TYPE_CHECKING:
    from catodo.events import EventBroker

log = logging.getLogger("catodo.tunnel.manager")

STATE_FILE = os.path.join(DATA_DIR, "tunnel_state.json")
TMP_FILE = STATE_FILE + ".tmp"

HEALTH_INTERVAL_S = 15.0
WATCHER_POLL_S = 2.0


@dataclass
class TunnelStatus:
    state: str = TunnelState.stopped.value
    provider: str = ""
    pid: int | None = None
    started_at: float | None = None
    last_error: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


class TunnelManager:
    def __init__(self, broker: "EventBroker | None" = None) -> None:
        self._broker = broker
        self._status = self._load()
        self._handle: TunnelHandle | None = None
        self._provider: TunnelProvider | None = None
        self._provider_name: str = ""
        self._watcher: asyncio.Task | None = None
        self._health_task: asyncio.Task | None = None
        self._last_health: dict | None = None
        self._last_ok_at: float | None = None
        self._lock = asyncio.Lock()

    # ----- persistence ------------------------------------------------------

    @staticmethod
    def _load() -> TunnelStatus:
        ensure_dirs()
        if not os.path.isfile(STATE_FILE):
            return TunnelStatus()
        try:
            with open(STATE_FILE) as f:
                raw = json.load(f)
            return TunnelStatus(**{k: raw.get(k) for k in TunnelStatus.__annotations__})
        except Exception as e:  # noqa: BLE001
            log.warning("couldn't read %s, resetting state: %s", STATE_FILE, e)
            return TunnelStatus()

    @staticmethod
    def _save_inner(status: TunnelStatus) -> None:
        ensure_dirs()
        with open(TMP_FILE, "w") as f:
            json.dump(status.to_dict(), f, indent=2)
        os.replace(TMP_FILE, STATE_FILE)

    def _persist(self) -> None:
        self._save_inner(self._status)

    # ----- provider resolution ---------------------------------------------

    def _resolve_provider(self) -> TunnelProvider | None:
        name = runtime_config.get("tunnel_provider") or ""
        if not name:
            return None
        return get_provider(name)

    def _provider_name(self) -> str:
        return runtime_config.get("tunnel_provider") or ""

    # ----- public API -------------------------------------------------------

    async def start(self) -> dict:
        async with self._lock:
            provider = self._resolve_provider()
            if provider is None:
                raise ValueError(f"unknown provider: {self._provider_name() or '(none)'}")
            errors = provider.validate_config()
            if errors:
                raise RuntimeError("; ".join(errors))
            if self._handle is not None and provider.is_running(self._handle):
                raise RuntimeError(f"already running: pid={self._handle.pid}")
            # stop previous provider before starting new one
            await self._stop_locked()
            try:
                handle = await asyncio.to_thread(provider.start)
            except Exception as e:  # noqa: BLE001
                self._status = TunnelStatus(
                    state=TunnelState.failed.value,
                    provider=provider.name,
                    last_error=str(e),
                )
                self._persist()
                await self._publish("failed", str(e))
                raise
            self._handle = handle
            self._provider = provider
            self._provider_name = provider.name
            self._status = TunnelStatus(
                state=TunnelState.starting.value,
                provider=provider.name,
                pid=handle.pid,
                started_at=handle.started_at,
            )
            self._persist()
            self._spawn_watcher()
            await self._publish("starting", "Tunnel starting")
            return {"state": self._status.state, "provider": provider.name}

    async def stop(self) -> dict:
        async with self._lock:
            await self._stop_locked()
        return {"state": self._status.state}

    async def _stop_locked(self) -> None:
        if self._handle is None or self._provider is None:
            return
        try:
            await asyncio.to_thread(self._provider.stop, self._handle)
        except Exception as e:  # noqa: BLE001
            log.warning("provider stop raised: %s", e)
        self._handle = None
        self._provider = None
        self._status = TunnelStatus(state=TunnelState.stopped.value)
        self._persist()
        await self._publish("stopped", "Tunnel stopped")

    def status(self) -> dict:
        return self._status.to_dict()

    async def reconcile(self) -> None:
        """Reconcilia el estado persistido con la realidad.

        Caso típico: el backend se reinicia y el estado en disco dice
        "failed" (porque algún attempt anterior falló), pero el túnel
        está realmente corriendo — quizás porque lo levantaste a mano
        desde la shell, o porque el operador cambió después del fallo.

        Sin esta verificación, el UI muestra "failed" eternamente aunque
        `tailscale funnel status` diga que está arriba. Llamamos a
        `is_running()` del provider configurado (si lo hay) y resyncamos.
        """
        provider = self._resolve_provider()
        if provider is None:
            return
        running = False
        try:
            running = await asyncio.to_thread(provider.is_running, self._handle)
        except Exception as e:  # noqa: BLE001
            log.debug("reconcile: is_running probe failed: %s", e)
            return
        if running:
            log.info("reconcile: tunnel is actually running, syncing state")
            self._status.state = TunnelState.running.value
            self._status.last_error = None
            # Si no tenemos handle (caso "levantado a mano"), creamos uno
            # mínimo para que el watcher pueda engancharse. Usamos
            # tailscaled's PID cuando esté disponible.
            if self._handle is None:
                self._provider = provider
                self._provider_name = provider.name
                pid = self._tailscaled_pid_best_effort(provider)
                self._handle = TunnelHandle(
                    pid=pid or os.getpid(),
                    started_at=time.time(),
                )
                self._status.pid = self._handle.pid
                self._status.started_at = self._handle.started_at
                self._status.provider = provider.name
            self._persist()
            # Re-enganchar el watcher para detectar si se cae después.
            if self._watcher is None or self._watcher.done():
                self._spawn_watcher()
        elif self._status.state in (TunnelState.failed.value, TunnelState.starting.value):
            # No hay nada arriba y el estado sugiere que intentamos
            # arrancarlo: limpiamos a "stopped" para no mentir.
            log.info("reconcile: tunnel is not running, resetting stale %s → stopped",
                     self._status.state)
            self._status.state = TunnelState.stopped.value
            self._status.last_error = None
            self._persist()

    @staticmethod
    def _tailscaled_pid_best_effort(provider) -> int | None:
        """Best-effort PID del daemon (provider-specific)."""
        try:
            if hasattr(provider, "_tailscaled_pid"):
                return provider._tailscaled_pid()
        except Exception:  # noqa: BLE001
            return None
        return None

    def health(self) -> dict:
        if self._status.state != TunnelState.running.value:
            return {"reachable": False, "reason": "stopped"}
        base = self._last_health if self._last_health else {"reachable": False, "last_error": "no probe yet"}
        base = dict(base)
        base["last_ok"] = (
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self._last_ok_at))
            if self._last_ok_at
            else None
        )
        return base

    def providers(self) -> list[dict]:
        names = _available_providers()
        out: list[dict] = []
        for n in names:
            p = get_provider(n)
            if p is None:
                continue
            errs = p.validate_config()
            item: dict = {"name": n, "configured": not errs}
            if errs:
                item["reason"] = errs[0]
            out.append(item)
        return out

    # ----- background tasks -------------------------------------------------

    def _spawn_watcher(self) -> None:
        if self._watcher is not None and not self._watcher.done():
            self._watcher.cancel()
        self._watcher = asyncio.create_task(self._watch())
        if self._health_task is None or self._health_task.done():
            self._health_task = asyncio.create_task(self._health_loop())

    async def _watch(self) -> None:
        provider = self._provider
        handle = self._handle
        if provider is None or handle is None:
            return
        last_state = self._status.state
        while True:
            await asyncio.sleep(WATCHER_POLL_S)
            running = provider.is_running(handle)
            if running:
                if last_state != TunnelState.running.value:
                    self._status.state = TunnelState.running.value
                    self._persist()
                    await self._publish("running", "Tunnel up")
                    last_state = TunnelState.running.value
            else:
                # died
                self._status.state = TunnelState.failed.value
                self._status.last_error = "process exited"
                self._persist()
                await self._publish("failed", "process exited")
                self._handle = None
                self._provider = None
                return

    async def _health_loop(self) -> None:
        while True:
            await asyncio.sleep(HEALTH_INTERVAL_S)
            provider = self._provider
            handle = self._handle
            if provider is None or handle is None or not provider.is_running(handle):
                continue
            try:
                result = await asyncio.to_thread(provider.health)
            except Exception as e:  # noqa: BLE001
                result = {"reachable": False, "last_error": str(e)}
            self._last_health = result
            if result.get("reachable"):
                self._last_ok_at = time.time()
                if self._status.state == TunnelState.degraded.value:
                    self._status.state = TunnelState.running.value
                    self._persist()
                    await self._publish("running", "Tunnel recovered")
            else:
                if self._status.state == TunnelState.running.value:
                    self._status.state = TunnelState.degraded.value
                    self._persist()
                    await self._publish("degraded", result.get("last_error", "unreachable"))

    async def _publish(self, state: str, message: str) -> None:
        if self._broker is None:
            return
        try:
            await self._broker.publish(
                {
                    "event": "tunnel_state",
                    "state": state,
                    "provider": self._status.provider,
                    "message": message,
                }
            )
        except Exception as e:  # noqa: BLE001
            log.debug("tunnel_state publish failed: %s", e)

    # ----- lifecycle --------------------------------------------------------

    async def shutdown(self) -> None:
        async with self._lock:
            for t in (self._watcher, self._health_task):
                if t is not None and not t.done():
                    t.cancel()
            await self._stop_locked()


_singleton: TunnelManager | None = None


def get_manager() -> TunnelManager:
    global _singleton
    if _singleton is None:
        _singleton = TunnelManager()
    return _singleton


def set_manager(m: TunnelManager | None) -> None:
    global _singleton
    _singleton = m
