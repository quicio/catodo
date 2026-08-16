"""Tailscale Funnel provider — exposes the backend via `tailscale funnel`.

Tailscale Funnel is a quick way to get HTTPS from any network without
owning a domain: once `tailscale` is installed and authenticated on the
host, `tailscale funnel <port>` serves the local port at
`https://<node-name>.<tailnet>.ts.net` with a valid Let's Encrypt cert
managed by Tailscale.

Differences from Cloudflare:
- No "token file" — the auth state lives in tailscaled's local state dir.
- The public URL is NOT configurable: Tailscale picks it from the node
  name + tailnet. We surface it via `public_url()` for pairing.
- `tailscale funnel --bg <port>` is the command we run; `--bg` detaches
  so it survives our subprocess lifetime (we kill the wrapper, Tailscale
  keeps the funnel up).
"""
from __future__ import annotations

import json
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

log = logging.getLogger("catodo.tunnel.tailscale")

HEALTH_TIMEOUT_S = 3.0


@register
class TailscaleFunnelProvider:
    name = "tailscale-funnel"

    # ----- introspection ----------------------------------------------------

    def _binary(self) -> str | None:
        return shutil.which("tailscale")

    def _port(self) -> int:
        """Port the backend listens on (the funnel target)."""
        from catodo.config import settings
        return int(settings.port)

    def _node_fqdn(self) -> str | None:
        """Best-effort: `tailscale status --json` → `Self.DNSName` (with trailing dot stripped)."""
        binary = self._binary()
        if not binary:
            return None
        try:
            out = subprocess.check_output(
                [binary, "status", "--json"],
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            data = json.loads(out.decode())
            dns = (data.get("Self") or {}).get("DNSName") or ""
            return dns.rstrip(".") or None
        except Exception:  # noqa: BLE001
            return None

    def _status_json(self) -> dict | None:
        """Best-effort: `tailscale status --json` parsed. None si falla."""
        binary = self._binary()
        if not binary:
            return None
        try:
            out = subprocess.check_output(
                [binary, "status", "--json"],
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            return json.loads(out.decode())
        except Exception:  # noqa: BLE001
            return None

    def _has_funnel_cap(self) -> bool:
        """True iff the node carries the Funnel capability (admin-enabled
        on the tailnet). Sin esto, `tailscale funnel --bg <port>` cuelga
        indefinido en vez de fallar — no queremos que el backend quede
        pegado en un timeout."""
        data = self._status_json()
        if not data:
            return False
        caps = (data.get("Self") or {}).get("Capabilities") or []
        return "https://tailscale.com/cap/funnel" in caps

    def _funnel_enable_url(self) -> str | None:
        """URL del admin console para activar Funnel en este nodo, si está
        disponible. None si no la pudimos armar."""
        data = self._status_json()
        if not data:
            return None
        node_id = (data.get("Self") or {}).get("NodeID") or ""
        if not node_id:
            return None
        return f"https://login.tailscale.com/f/funnel?node={node_id}"

    # ----- provider contract ------------------------------------------------

    def validate_config(self) -> list[str]:
        errors: list[str] = []
        binary = self._binary()
        if not binary:
            errors.append("tailscale binary not found in PATH")
            return errors
        # If we can't get status, we're not authenticated.
        if self._node_fqdn() is None:
            errors.append("tailscale not authenticated (run `tailscale up`)")
            return errors
        # Funnel debe estar habilitado en el tailnet (admin setting). Si
        # no, `tailscale funnel --bg <port>` cuelga para siempre esperando
        # confirmación — mejor cortar acá con un mensaje accionable.
        if not self._has_funnel_cap():
            url = self._funnel_enable_url() or "https://login.tailscale.com/f/funnel"
            errors.append(
                "Tailnet sin Funnel habilitado. Activá Funnel en este nodo "
                f"desde la consola del admin: {url}"
            )
        return errors

    def public_url(self) -> str | None:
        """Return the public URL Tailscale assigned, or None."""
        domain = self._node_fqdn()
        if not domain:
            return None
        return f"https://{domain}/"

    def start(self) -> TunnelHandle:
        binary = self._binary()
        if not binary:
            raise RuntimeError("tailscale binary not found")
        port = self._port()
        # `--bg` puts the funnel in the background so the child exits quickly
        # and the listener persists in tailscaled. The PID we keep is
        # tailscaled's so we can check it's still alive.
        cmd = [binary, "funnel", "--bg", str(port)]
        log.info("starting tailscale funnel on :%d", port)
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                start_new_session=True,
            )
            stdout, stderr = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            raise RuntimeError("tailscale funnel start timed out")
        if proc.returncode != 0:
            msg = (stderr or b"").decode().strip() or f"exit {proc.returncode}"
            raise RuntimeError(f"tailscale funnel failed: {msg}")
        # The "wrapper" subprocess already exited; we still want a handle for
        # the API to track. Use tailscaled's PID (best-effort) so is_running
        # reflects daemon liveness, not the wrapper.
        ts_pid = self._tailscaled_pid()
        return TunnelHandle(pid=ts_pid or proc.pid, started_at=time.time())

    def stop(self, handle: TunnelHandle, timeout: float = 5.0) -> None:
        binary = self._binary()
        if not binary:
            return
        port = self._port()
        # `--bg=false` / `off` disables the funnel for the given port.
        try:
            subprocess.run(
                [binary, "funnel", str(port), "off"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired:
            log.warning("tailscale funnel off timed out")

    def is_running(self, handle: TunnelHandle | None) -> bool:
        if handle is None:
            return False
        # Check tailscaled (the persistent daemon) first.
        try:
            os.kill(handle.pid, 0)
        except ProcessLookupError:
            return False
        # Then verify the funnel is actually enabled for our port.
        binary = self._binary()
        if not binary:
            return False
        try:
            out = subprocess.check_output(
                [binary, "funnel", "status"],
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            return f":{self._port()}" in out.decode()
        except Exception:  # noqa: BLE001
            return False

    def health(self) -> dict:
        url = self.public_url()
        if not url:
            return {"reachable": False, "last_error": "tailscale not authenticated"}
        target = url.rstrip("/") + "/api/health"
        start = time.monotonic()
        try:
            req = urllib.request.Request(target, method="GET")
            with urllib.request.urlopen(req, timeout=HEALTH_TIMEOUT_S) as resp:
                if not (200 <= resp.status < 300):
                    return {"reachable": False, "last_error": f"HTTP {resp.status}"}
                return {
                    "reachable": True,
                    "latency_ms": int((time.monotonic() - start) * 1000),
                }
        except urllib.error.URLError as e:
            return {"reachable": False, "last_error": str(e.reason)}
        except Exception as e:  # noqa: BLE001
            return {"reachable": False, "last_error": str(e)}

    # ----- helpers ----------------------------------------------------------

    @staticmethod
    def _tailscaled_pid() -> int | None:
        """Return tailscaled's PID (best-effort)."""
        try:
            out = subprocess.check_output(
                ["pgrep", "-f", "tailscaled"],
                stderr=subprocess.DEVNULL,
                timeout=2,
            )
            for line in out.decode().splitlines():
                line = line.strip()
                if line.isdigit():
                    return int(line)
        except Exception:  # noqa: BLE001
            return None
        return None
