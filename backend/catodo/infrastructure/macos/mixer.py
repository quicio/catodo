"""macOS MixerPort adapter: osascript (AppleScript) for system volume."""
from __future__ import annotations

import asyncio
import logging
import shutil

log = logging.getLogger("catodo.infrastructure.macos.mixer")

_osascript: str | None = None


def _osascript_bin() -> str | None:
    global _osascript
    if _osascript is None:
        _osascript = shutil.which("osascript")
    return _osascript


class OsascriptMixer:
    """macOS mixer via AppleScript (`osascript`)."""

    def is_available(self) -> bool:
        return _osascript_bin() is not None

    async def get_volume(self) -> int | None:
        bin_ = _osascript_bin()
        if not bin_:
            return None
        try:
            proc = await asyncio.create_subprocess_exec(
                bin_, "-e", "output volume of (get volume settings)",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
            if proc.returncode == 0:
                text = stdout.decode("utf-8", "ignore").strip()
                for part in text.split():
                    try:
                        return int(part)
                    except ValueError:
                        continue
        except Exception as e:
            log.debug("osascript get-volume failed: %s", e)
        return None

    async def set_volume(self, level: int) -> bool:
        bin_ = _osascript_bin()
        if not bin_:
            return False
        level = max(0, min(100, level))
        try:
            proc = await asyncio.create_subprocess_exec(
                bin_, "-e", f"set volume output volume {level}",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=3)
            return proc.returncode == 0
        except Exception as e:
            log.debug("osascript set-volume failed: %s", e)
            return False

    async def set_default_sink(self, sink: str) -> bool:
        """No-op: macOS does not expose a per-app default sink via AppleScript."""
        log.info("set_default_sink(%s): no-op on macOS", sink)
        return False