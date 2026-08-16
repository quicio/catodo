"""Pluggable public tunnel.

Exposes a small interface (`TunnelProvider`) that any concrete provider
implements (Cloudflare, Tailscale, ngrok, …). The rest of the system only
talks to `TunnelManager`, which delegates to the active provider — never to
a concrete class.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from catodo.tunnel.provider import TunnelProvider

log = logging.getLogger("catodo.tunnel")

_REGISTRY: dict[str, type["TunnelProvider"]] = {}


def register(cls: type["TunnelProvider"]) -> type["TunnelProvider"]:
    """Class decorator that adds a provider to the registry by `cls.name`."""
    name = getattr(cls, "name", None)
    if not name:
        raise ValueError(f"{cls.__name__} must define a non-empty `name`")
    _REGISTRY[name] = cls
    log.debug("tunnel provider registered: %s", name)
    return cls


def get_provider(name: str) -> "TunnelProvider | None":
    """Return an instance of the provider registered under `name`, or None."""
    cls = _REGISTRY.get(name)
    return cls() if cls else None


def available() -> list[str]:
    """Names of all registered providers."""
    return sorted(_REGISTRY.keys())


# Trigger provider self-registration on package import.
from catodo.tunnel.providers import cloudflare as _cf  # noqa: F401,E402


__all__ = ["register", "get_provider", "available"]
