"""Runtime configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("CATODO_HOST", "127.0.0.1")
    port: int = int(os.getenv("CATODO_PORT", "8765"))
    history_size: int = 16
    youtube_url: str = os.getenv("CATODO_YOUTUBE_URL", "https://www.youtube.com/tv")
    tv_url: str = os.getenv("CATODO_TV_URL", "https://www.movistartv.cl")
    crunchyroll_url: str = os.getenv("CATODO_CRUNCHYROLL_URL", "https://www.crunchyroll.com")
    spotify_embed_url: str = os.getenv(
        "CATODO_SPOTIFY_EMBED_URL",
        "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
    )
    anime_dir: str = os.getenv("CATODO_ANIME_DIR", os.path.expanduser("~/Anime"))
    arcade_dir: str = os.getenv("CATODO_ARCADE_DIR", os.path.expanduser("~/Arcade"))
    data_dir: str = os.getenv(
        "CATODO_DATA_DIR",
        os.path.join(os.path.expanduser("~"), ".local", "share", "catodo"),
    )
    ssl_certfile: str = os.getenv("CATODO_SSL_CERT", "")
    ssl_keyfile: str = os.getenv("CATODO_SSL_KEY", "")


settings = Settings()


def ssl_files() -> tuple[str, str] | None:
    """Devuelve (cert, key) si hay certificado SSL disponible (en data_dir/ssl por defecto)."""
    cert = settings.ssl_certfile or os.path.join(settings.data_dir, "ssl", "cert.pem")
    key = settings.ssl_keyfile or os.path.join(settings.data_dir, "ssl", "key.pem")
    if os.path.isfile(cert) and os.path.isfile(key):
        return cert, key
    return None


def _lan_ip() -> str:
    try:
        import socket

        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return ""


def ensure_ssl() -> tuple[str, str] | None:
    """Si CATODO_SSL=1, garantiza un certificado self-signed y devuelve (cert, key)."""
    if os.getenv("CATODO_SSL") != "1":
        return ssl_files()
    cert = settings.ssl_certfile or os.path.join(settings.data_dir, "ssl", "cert.pem")
    key = settings.ssl_keyfile or os.path.join(settings.data_dir, "ssl", "key.pem")
    if os.path.isfile(cert) and os.path.isfile(key):
        return cert, key
    import subprocess

    os.makedirs(os.path.dirname(cert), exist_ok=True)
    ip = _lan_ip()
    san = f"DNS:localhost,IP:127.0.0.1{',IP:' + ip if ip else ''}"
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-days", "3650", "-keyout", key, "-out", cert,
            "-subj", "/CN=catodo", "-addext", f"subjectAltName={san}",
        ],
        check=True,
        capture_output=True,
    )
    return cert, key
