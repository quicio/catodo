"""DbusslessSpotifyClient — Null adapter for macOS."""
from __future__ import annotations

import pytest

from catodo.infrastructure.macos.spotify_client import DbusslessSpotifyClient


def test_is_available_is_false():
    assert DbusslessSpotifyClient().is_available() is False


@pytest.mark.asyncio
async def test_all_methods_are_noop():
    c = DbusslessSpotifyClient()
    await c.play()
    await c.pause()
    await c.next()
    await c.previous()
    await c.set_volume(0.5)
    await c.open_uri("spotify:track:xyz")
    state = await c.get_state()
    assert state == {"available": False}


def test_warn_logged_once_per_process(caplog):
    import logging

    caplog.set_level(logging.INFO, logger="catodo.infrastructure.macos.spotify_client")
    DbusslessSpotifyClient._warned = False
    DbusslessSpotifyClient()
    DbusslessSpotifyClient()
    warnings = [
        r
        for r in caplog.records
        if "Spotify channel disabled" in r.getMessage()
    ]
    assert len(warnings) == 1