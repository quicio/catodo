"""Runtime configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("CATODO_HOST", "127.0.0.1")
    port: int = int(os.getenv("CATODO_PORT", "8765"))
    history_size: int = 16
    youtube_url: str = os.getenv("CATODO_YOUTUBE_URL", "https://www.youtube.com/tv")
    tv_url: str = os.getenv("CATODO_TV_URL", "https://www.movistartv.cl")
    spotify_embed_url: str = os.getenv(
        "CATODO_SPOTIFY_EMBED_URL",
        "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
    )
    chromium_bin: str = os.getenv("CATODO_CHROMIUM_BIN", "chromium")
    anime_dir: str = os.getenv("CATODO_ANIME_DIR", os.path.expanduser("~/Anime"))
    channels: List[str] = field(
        default_factory=lambda: os.getenv("CATODO_CHANNELS", "spotify,youtube,anime,tv").split(",")
    )


settings = Settings()
