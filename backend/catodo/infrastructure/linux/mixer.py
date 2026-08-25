"""Linux MixerPort adapter: wpctl (PipeWire) or pactl (PulseAudio)."""
from __future__ import annotations

import asyncio
import logging
import re
import shutil

log = logging.getLogger("catodo.infrastructure.linux.mixer")

_wpctl: str | None = None
_pactl: str | None = None
_detected = False


def _detect() -> tuple[str | None, str | None]:
    global _wpctl, _pactl, _detected
    if _detected:
        return _wpctl, _pactl
    _wpctl = shutil.which("wpctl")
    _pactl = shutil.which("pactl")
    _detected = True
    if _wpctl or _pactl:
        log.info("linux mixer: wpctl=%s pactl=%s", _wpctl, _pactl)
    else:
        log.warning("linux mixer: no wpctl or pactl found — volume is cosmetical")
    return _wpctl, _pactl


class WpctlPactlMixer:
    """Linux mixer adapter. Tries wpctl first, falls back to pactl."""

    def is_available(self) -> bool:
        wpctl, pactl = _detect()
        return wpctl is not None or pactl is not None

    async def get_volume(self) -> int | None:
        wpctl, pactl = _detect()
        if wpctl:
            try:
                proc = await asyncio.create_subprocess_exec(
                    wpctl, "get-volume", "@DEFAULT_AUDIO_SINK@",
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
                if proc.returncode == 0:
                    text = stdout.decode("utf-8", "ignore").strip()
                    for part in text.split():
                        if part.endswith("%"):
                            break
                        try:
                            return int(float(part) * 100)
                        except ValueError:
                            continue
            except Exception as e:
                log.debug("wpctl get-volume failed: %s", e)
        if pactl:
            try:
                proc = await asyncio.create_subprocess_exec(
                    pactl, "get-sink-volume", "@DEFAULT_SINK@",
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
                if proc.returncode == 0:
                    text = stdout.decode("utf-8", "ignore")
                    m = re.search(r"(\d+)%", text)
                    if m:
                        return int(m.group(1))
            except Exception as e:
                log.debug("pactl get-sink-volume failed: %s", e)
        return None

    async def set_volume(self, level: int) -> bool:
        level = max(0, min(100, level))
        wpctl, pactl = _detect()
        if wpctl:
            try:
                proc = await asyncio.create_subprocess_exec(
                    wpctl, "set-volume", "@DEFAULT_AUDIO_SINK@", f"{level}%",
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(proc.wait(), timeout=3)
                if proc.returncode == 0:
                    return True
            except Exception as e:
                log.debug("wpctl set-volume failed: %s", e)
        if pactl:
            try:
                proc = await asyncio.create_subprocess_exec(
                    pactl, "set-sink-volume", "@DEFAULT_SINK@", f"{level}%",
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(proc.wait(), timeout=3)
                if proc.returncode == 0:
                    return True
            except Exception as e:
                log.debug("pactl set-volume failed: %s", e)
        return False

    async def set_default_sink(self, sink: str) -> bool:
        """Mueve el sink por defecto del sistema a `sink` (PulseAudio)."""
        _, pactl = _detect()
        if not pactl:
            return False
        try:
            proc = await asyncio.create_subprocess_exec(
                pactl, "set-default-sink", sink,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=3)
            return proc.returncode == 0
        except Exception as e:
            log.debug("pactl set-default-sink %s failed: %s", sink, e)
            return False