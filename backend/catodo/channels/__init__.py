"""Channel registry — built-in (código) + bibliotecas locales + plugins (manifests).

Los canales `web` (YouTube, TV, Crunchyroll, HBO Max) se cargan desde el plugin
system; las bibliotecas locales (Anime, Series, Películas…) desde `catodo.media`.

`build_default_registry(spotify_client)` omite `SpotifyChannel` cuando el port
reporta `is_available() == False` (macOS por defecto, o Linux sin DBus). Esto
es el único punto donde se decide si el canal existe en el registry.
"""
from __future__ import annotations

import logging

from catodo.arcade import ArcadeChannel
from catodo.channel import Channel
from catodo.channels.spotify import SpotifyChannel
from catodo.domain.ports import SpotifyClientPort
from catodo.media import build_media_library_channels

log = logging.getLogger("catodo.channels")


def build_default_registry(
    spotify_client: SpotifyClientPort | None = None,
) -> list[Channel]:
    channels: list[Channel] = [*build_media_library_channels(), ArcadeChannel()]
    if spotify_client is not None and spotify_client.is_available():
        channels.insert(0, SpotifyChannel(spotify_client))
    else:
        if spotify_client is not None:
            log.info("Spotify channel disabled: SpotifyClientPort reports not available")
        # else: composition root didn't wire a port; legacy/standalone call site
    return channels