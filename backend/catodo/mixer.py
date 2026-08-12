"""System mixer — drives PipeWire/PulseAudio volume."""
from __future__ import annotations

import asyncio
import logging
import shutil

log = logging.getLogger("catodo.mixer")

_WPCTL: str | None = None
_PACTL: str | None = None


def _detect() -> tuple[str | None, str | None]:
    global _WPCTL, _PACTL
    if _WPCTL is None and _PACTL is None:
        _WPCTL = shutil.which("wpctl")
        _PACTL = shutil.which("pactl")
        if _WPCTL or _PACTL:
            log.info("mixer: wpctl=%s pactl=%s", _WPCTL, _PACTL)
        else:
            log.warning("mixer: no wpctl or pactl found — volume is cosmetical")
    return _WPCTL, _PACTL


async def get_volume() -> int | None:
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
                import re
                m = re.search(r"(\d+)%", text)
                if m:
                    return int(m.group(1))
        except Exception as e:
            log.debug("pactl get-sink-volume failed: %s", e)
    return None


async def set_volume(level: int) -> bool:
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
            log.debug("pactl set-sink-volume failed: %s", e)
    return False


async def adjust_volume(delta: int) -> int | None:
    current = await get_volume()
    if current is not None:
        new = max(0, min(100, current + delta))
        await set_volume(new)
        return new
    return None


async def set_default_sink(sink: str) -> bool:
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


def has_mixer() -> bool:
    wpctl, pactl = _detect()
    return wpctl is not None or pactl is not None
