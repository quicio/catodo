"""URI opener facade — delegates to the UriOpenerPort wired at startup.

The platform-specific implementation (`xdg-open` on Linux, `open` on macOS)
lives in `catodo.infrastructure.{linux,macos}.uri_opener`. This facade lets
any backend code (`spotify_client.open_uri`, deep-link handlers) open a URI
without caring about the platform.

`set_port(port)` is called once from the composition root in `main.py:44
lifespan()`. Before that (e.g. in unit tests), `open()` is a no-op.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from catodo.domain.ports import UriOpenerPort

_port: UriOpenerPort | None = None


def set_port(port: UriOpenerPort | None) -> None:
    global _port
    _port = port


def open(uri: str) -> bool:
    if _port is None:
        return False
    return _port.open(uri)