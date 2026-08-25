"""macOS SpotifyClientPort adapter: Null (DBus not available by default).

The channel that wraps this client reports itself as unavailable; the
composition root omits the Spotify channel from the registry on macOS.
Kept as a real adapter for symmetry with the other ports and to leave a
clear extension point for a future AppleScript-based Spotify client.
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("catodo.infrastructure.macos.spotify_client")


class DbusslessSpotifyClient:
    """Null adapter: Spotify control is not implemented on macOS in this MVP."""

    _warned: bool = False

    def __init__(self) -> None:
        if not DbusslessSpotifyClient._warned:
            log.info(
                "Spotify channel disabled: DBus not available on this platform "
                "(use the browser-based Spotify embed channel as a workaround)"
            )
            DbusslessSpotifyClient._warned = True

    def is_available(self) -> bool:
        return False

    async def play(self) -> None:
        return None

    async def pause(self) -> None:
        return None

    async def next(self) -> None:
        return None

    async def previous(self) -> None:
        return None

    async def set_volume(self, level: float) -> None:
        return None

    async def open_uri(self, uri: str) -> None:
        return None

    async def get_state(self) -> dict[str, Any]:
        return {"available": False}