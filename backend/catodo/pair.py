"""Pairing — URLs (LAN + pública) + QR para conectar el remote (celular).

Cuando hay un túnel público configurado y corriendo, `pair_urls()` expone
la URL pública (que funciona desde cualquier red, vía HTTPS válido del
proveedor) además de la LAN tradicional. El QR codifica la primaria
(public si existe, si no LAN); se puede forzar LAN con `?which=lan`.
"""
from __future__ import annotations

import logging
import socket

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from catodo.config import settings
from catodo.runtime_config import get as _cfg_get

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


def _code_suffix() -> str:
    return f"?code={_token}" if _token else ""


def pair_urls(tunnel_manager=None) -> dict[str, str | None]:
    """Return {lan, public, primary, code}.

    - `lan` is always set (LAN access never disappears).
    - `public` is set when the tunnel is *running* AND the active provider
      can produce a public URL. For most providers (Cloudflare) the URL
      comes from `public_domain` in runtime config. For Tailscale Funnel
      it comes from `tailscale status --json` since Tailscale picks the
      hostname itself.
    - `primary` is "public" when `public` is available, else "lan".
    - `code` mirrors CATODO_TOKEN (empty string when unset).

    `tunnel_manager` is the live TunnelManager (passed from the API layer).
    Falls back to the config flag when None — that's only for unit tests
    that don't spin up the manager.
    """
    code = _code_suffix()
    lan = f"http://{lan_ip()}:{settings.port}/remote/{code}"
    public: str | None = None

    # El QR debe apuntar a la URL REAL que funciona. Si el túnel está
    # configurado pero no corriendo, public queda None y el QR cae a LAN.
    if _tunnel_is_running(tunnel_manager):
        provider_name = _cfg_get("tunnel_provider") or ""
        if provider_name == "tailscale-funnel":
            from catodo.tunnel import get_provider

            provider = get_provider(provider_name)
            if provider is not None and hasattr(provider, "public_url"):
                pub = provider.public_url()  # type: ignore[attr-defined]
                if pub:
                    public = pub.rstrip("/") + f"/remote{code}"
        else:
            domain = _cfg_get("public_domain")
            if domain:
                public = f"https://{domain}/remote{code}"

    return {
        "lan": lan,
        "public": public,
        "primary": "public" if public else "lan",
        "code": _token or "",
    }


def _tunnel_is_running(manager) -> bool:
    """El túnel debe estar realmente UP (no sólo configurado) para que la
    URL pública funcione. Si el manager no está disponible, caemos al flag
    de config (útil para tests que no inicializan el manager)."""
    if manager is None:
        return bool(_cfg_get("tunnel_enabled"))
    try:
        st = manager.status()
        return (st or {}).get("state") == "running"
    except Exception:
        return False


def _pick_url(urls: dict[str, str | None], which: str | None) -> str | None:
    if which == "lan":
        return urls["lan"]
    if which == "public":
        return urls["public"] or urls["lan"]
    return urls["public"] or urls["lan"]


@router.get("/info")
async def pair_info(request: Request) -> dict:
    urls = pair_urls(tunnel_manager=getattr(request.app.state, "tunnel", None))
    return {
        "url": urls["lan"],            # backwards compat
        "lan": urls["lan"],
        "public": urls["public"],
        "primary": urls["primary"],
        "code": urls["code"],
        "host": lan_ip(),
        "port": settings.port,
    }


@router.get("/qr")
async def pair_qr(request: Request, which: str | None = None) -> Response:
    urls = pair_urls(tunnel_manager=getattr(request.app.state, "tunnel", None))
    target = _pick_url(urls, which)
    if not target:
        raise HTTPException(status_code=503, detail="no URL available")

    import io

    import qrcode
    from qrcode.image.svg import SvgPathImage

    buf = io.BytesIO()
    qr = qrcode.QRCode(border=2, box_size=10)
    qr.add_data(target)
    qr.make(fit=True)
    img = qr.make_image(image_factory=SvgPathImage)
    img.save(buf)
    return Response(content=buf.getvalue(), media_type="image/svg+xml")
