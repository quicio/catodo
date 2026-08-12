"""Channel registry — built-in (código) + bibliotecas locales + plugins (manifests).

Los canales `web` (YouTube, TV, Crunchyroll, HBO Max) se cargan desde el plugin
system; las bibliotecas locales (Anime, Series, Películas…) desde `catodo.media`.
"""
from __future__ import annotations

from catodo.arcade import ArcadeChannel
from catodo.channel import Channel
from catodo.channels.spotify import SpotifyChannel
from catodo.media import build_media_library_channels


def build_default_registry() -> list[Channel]:
    return [SpotifyChannel(), *build_media_library_channels(), ArcadeChannel()]
