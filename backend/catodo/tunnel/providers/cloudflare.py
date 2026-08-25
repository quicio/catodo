"""Cloudflare Tunnel provider — wraps `cloudflared`.

Requires:
- `cloudflared` on PATH (the install.sh downloads it on first run).
- A token file created via `cloudflared tunnel token <id>`.
- `public_domain` set in runtime config (the host the user pointed at the tunnel).
"""
from __future__ import annotations

import logging
import os
import shutil
import signal
import subprocess
import time
import urllib.error
import urllib.request

from catodo import runtime_config
from catodo.tunnel import register
from catodo.tunnel.provider import TunnelHandle

log = logging.getLogger("catodo.tunnel.cloudflare")

HEALTH_TIMEOUT_S = 3.0
HEALTH_URL_PATH = "/api/health"


@register
class CloudflareTunnelProvider:
    name = "cloudflare"

    # ----- introspection ----------------------------------------------------

    def _binary(self) -> str | None:
        """Locate the cloudflared binary. Prefers the per-user install path
        (`~/.local/share/catodo/bin`) over `shutil.which` so systemd-managed
        installs work even when PATH does not include that dir."""
        from catodo.config import settings

        candidates = [
            os.path.join(settings.data_dir, "bin", "cloudflared"),
            shutil.which("cloudflared") or "",
        ]
        for c in candidates:
            if c and os.path.isfile(c) and os.access(c, os.X_OK):
                return c
        return None

    def _token_path(self) -> str:
        return runtime_config.get("tunnel_token_path") or ""

    def _public_domain(self) -> str:
        return runtime_config.get("public_domain") or ""

    # ----- provider contract ------------------------------------------------

    def validate_config(self) -> list[str]:
        errors: list[str] = []
        if not self._binary():
            errors.append("cloudflared binary not found in PATH")
        token = self._token_path()
        if not token:
            errors.append("tunnel_token_path is empty")
        elif not os.path.isfile(token):
            errors.append(f"token file not readable: {token}")
        if not self._public_domain():
            errors.append("public_domain is empty")
        return errors

    def start(self) -> TunnelHandle:
        binary = self._binary()
        if not binary:
            raise RuntimeError("cloudflared binary not found")
        token = self._token_path()
        if not token or not os.path.isfile(token):
            raise RuntimeError(f"token file not readable: {token}")

        cmd = [
            binary,
            "tunnel",
            "--no-autoupdate",
            "run",
            "--token-file",
            token,
        ]
        log.info("starting cloudflared (token-file=%s)", token)
        # start_new_session=True so we can SIGTERM the whole process group
        # (cloudflared spawns a connector child); required for clean shutdown.
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        return TunnelHandle(pid=proc.pid, started_at=time.time())

    def stop(self, handle: TunnelHandle, timeout: float = 5.0) -> None:
        try:
            os.killpg(handle.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                os.kill(handle.pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.1)
        try:
            os.killpg(handle.pid, signal.SIGKILL)
        except ProcessLookupError:
            return

    def is_running(self, handle: TunnelHandle | None) -> bool:
        if handle is None:
            return False
        try:
            os.kill(handle.pid, 0)
            return True
        except ProcessLookupError:
            return False

    def health(self) -> dict:
        domain = self._public_domain()
        if not domain:
            return {"reachable": False, "last_error": "public_domain is empty"}
        url = f"https://{domain}{HEALTH_URL_PATH}"
        start = time.monotonic()
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=HEALTH_TIMEOUT_S) as resp:
                ok = 200 <= resp.status < 300
                if not ok:
                    return {"reachable": False, "last_error": f"HTTP {resp.status}"}
                latency_ms = int((time.monotonic() - start) * 1000)
                return {"reachable": True, "latency_ms": latency_ms}
        except urllib.error.URLError as e:
            return {"reachable": False, "last_error": str(e.reason)}
        except Exception as e:  # noqa: BLE001
            return {"reachable": False, "last_error": str(e)}
