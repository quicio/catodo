"""Pairing — QR + código para conectar el remote (celular) a Cátodo.

El QR codifica la URL del remote (con el token si está configurado) para que
el teléfono lo escanee y quede conectado sin tipear la IP.
"""
from __future__ import annotations

import logging
import socket

from fastapi import APIRouter
from fastapi.responses import Response

from catodo.config import settings

log = logging.getLogger("catodo.pair")

router = APIRouter(prefix="/pair", tags=["pair"])

_token = __import__("os").getenv("CATODO_TOKEN", "")


def lan_ip() -> str:
    """IP LAN de esta máquina (la que vería el celular)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def pair_url() -> str:
    # El remote funciona por HTTP; el casting usa el puerto HTTPS (ver /cast).
    token_part = f"?code={_token}" if _token else ""
    return f"http://{lan_ip()}:{settings.port}/remote/{token_part}"


@router.get("/info")
async def pair_info() -> dict:
    return {"url": pair_url(), "code": _token or "", "host": lan_ip(), "port": settings.port}


@router.get("/qr")
async def pair_qr() -> Response:
    import io

    import qrcode
    from qrcode.image.svg import SvgPathImage

    buf = io.BytesIO()
    qr = qrcode.QRCode(border=2, box_size=10)
    qr.add_data(pair_url())
    qr.make(fit=True)
    img = qr.make_image(image_factory=SvgPathImage)
    img.save(buf)
    return Response(content=buf.getvalue(), media_type="image/svg+xml")
