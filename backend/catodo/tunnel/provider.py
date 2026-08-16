"""Tunnel provider interface.

Every concrete provider (Cloudflare, Tailscale, ngrok, …) implements this
Protocol. Consumers (manager, HTTP API, event broker) only depend on this
shape, so adding a new provider is a drop-in.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol


class TunnelState(str, Enum):
    stopped = "stopped"
    starting = "starting"
    running = "running"
    failed = "failed"
    degraded = "degraded"


@dataclass
class TunnelHandle:
    """Opaque handle to a running tunnel process.

    The manager only sees `pid` and `started_at`; the concrete
    `subprocess.Popen` lives inside the provider so each provider can use
    its own shutdown semantics (TERM→KILL, HTTP API call, …).
    """

    pid: int
    started_at: float


class TunnelProvider(Protocol):
    """Minimal contract every tunnel provider implements."""

    name: str

    def validate_config(self) -> list[str]:
        """Return a list of human-readable errors. Empty list = ready."""
        ...

    def start(self) -> TunnelHandle:
        """Spawn the tunnel and return its handle."""
        ...

    def stop(self, handle: TunnelHandle, timeout: float = 5.0) -> None:
        """Gracefully stop the tunnel; escalate if it does not exit in time."""
        ...

    def is_running(self, handle: TunnelHandle | None) -> bool:
        """Whether the tunnel is currently up."""
        ...

    def health(self) -> dict:
        """Return {reachable: bool, latency_ms?: int, last_error?: str}.

        Used by the manager to publish state transitions to the broker.
        """
        ...
