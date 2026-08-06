"""Channel registry — static list of available channels."""
from __future__ import annotations

from typing import List

from catodo.channel import Channel
from catodo.channels.spotify import SpotifyChannel
from catodo.channels.youtube import YouTubeChannel
from catodo.channels.anime import AnimeChannel
from catodo.channels.tv import TvChannel


def build_default_registry() -> List[Channel]:
    return [SpotifyChannel(), YouTubeChannel(), AnimeChannel(), TvChannel()]
