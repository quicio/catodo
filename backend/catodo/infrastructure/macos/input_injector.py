"""macOS InputInjectorPort adapters: cliclick (preferred) or osascript fallback.

cliclick gives relative mouse/key primitives like xdotool; osascript needs
absolute coordinates + keystroke names via System Events.
"""
from __future__ import annotations

import asyncio
import logging
import shutil

log = logging.getLogger("catodo.infrastructure.macos.input_injector")

_CLICLICK_KEYS: dict[str, str] = {
    "esc": "kp:esc",
    "enter": "kp:return",
    "backspace": "kp:delete",
    "tab": "kp:tab",
    "space": "kp:space",
    "up": "kp:arrow-up",
    "down": "kp:arrow-down",
    "left": "kp:arrow-left",
    "right": "kp:arrow-right",
    "del": "kp:forward-delete",
    "home": "kp:home",
    "end": "kp:end",
    "playpause": "kp:play",
    "prev": "kp:prev",
    "next": "kp:next",
    "volup": "kp:sound-up",
    "voldown": "kp:sound-down",
    "mute": "kp:mute",
}

_OSASCRIPT_KEYS: dict[str, str] = {
    "esc": "Escape",
    "enter": "Return",
    "backspace": "Delete",
    "tab": "Tab",
    "space": "Space",
    "up": "Up",
    "down": "Down",
    "left": "Left",
    "right": "Right",
    "del": "Forward Delete",
    "home": "Home",
    "end": "End",
    "playpause": "XF86AudioPlay",
    "prev": "XF86AudioPrev",
    "next": "XF86AudioNext",
}


class _CliclickInjector:
    bin: str

    def __init__(self) -> None:
        self.bin = shutil.which("cliclick") or ""

    def is_available(self) -> bool:
        return bool(self.bin)

    async def _run(self, *args: str) -> None:
        log.debug("cliclick: %s", " ".join(args))
        proc = await asyncio.create_subprocess_exec(
            self.bin, *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=3)
        if proc.returncode != 0:
            log.warning("cliclick failed (rc=%d): %s", proc.returncode, stderr.decode()[:200])

    async def move(self, dx: int, dy: int) -> None:
        await self._run(f"m:{dx},{dy}")

    async def click(self, button: int) -> None:
        # cliclick needs absolute coords for click; without them we can't
        # translate button-relative clicks. The remote uses absolute mode on
        # macOS for now (see `mouse.py` facade). For pure relative mode,
        # `cliclick m:` moves and `cliclick c:` clicks at the new location.
        if button == 1:
            await self._run("c:,")
        else:
            await self._run("rc:,")

    async def scroll(self, dy: int) -> None:
        if not dy:
            return
        steps = max(-10, min(10, dy))
        await self._run(f"scroll:{0},{0},{steps}")

    async def key(self, name: str, shift: bool = False) -> None:
        key = _CLICLICK_KEYS.get(name)
        if not key:
            raise ValueError(f"unknown key: {name}")
        if shift:
            await self._run("shift+down")
        await self._run(key)
        if shift:
            await self._run("shift+up")

    async def type_text(self, text: str) -> None:
        if not text:
            return
        await self._run("type", text)


class _OsascriptInjector:
    bin: str

    def __init__(self) -> None:
        self.bin = shutil.which("osascript") or ""

    def is_available(self) -> bool:
        return bool(self.bin)

    async def _run(self, script: str) -> None:
        log.debug("osascript: %s", script[:80])
        proc = await asyncio.create_subprocess_exec(
            self.bin, "-e", script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
        if proc.returncode != 0:
            log.warning("osascript failed (rc=%d): %s", proc.returncode, stderr.decode()[:200])

    async def move(self, dx: int, dy: int) -> None:
        # System Events "move" uses absolute coords; the user's screen origin is
        # not exposed here, so we delegate to a fallback (cliclick-only feature).
        # Without absolute coords this is best-effort: notify user.
        log.warning("osascript injector: relative move not supported (need cliclick)")

    async def click(self, button: int) -> None:
        btn = "button 1" if button == 1 else "button 2"
        await self._run(f'tell application "System Events" to click {btn}')

    async def scroll(self, dy: int) -> None:
        if not dy:
            return
        direction = "1" if dy > 0 else "-1"
        await self._run(f'tell application "System Events" to scroll {direction}')

    async def key(self, name: str, shift: bool = False) -> None:
        k = _OSASCRIPT_KEYS.get(name)
        if not k:
            raise ValueError(f"unknown key: {name}")
        if shift:
            await self._run(
                f'keystroke "{k}" using shift down'
            )
        else:
            await self._run(f'keystroke "{k}"')

    async def type_text(self, text: str) -> None:
        if not text:
            return
        # AppleScript escaping: escape backslashes and double quotes.
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        await self._run(f'keystroke "{escaped}"')


def build_macos_injector() -> _CliclickInjector | _OsascriptInjector:
    """Factory helper: prefer cliclick, fall back to osascript."""
    if shutil.which("cliclick"):
        log.info("input_injector: using cliclick (macOS)")
        return _CliclickInjector()
    if shutil.which("osascript"):
        log.info("input_injector: using osascript fallback (macOS)")
        return _OsascriptInjector()
    log.warning("input_injector: install cliclick via brew for full support")
    return _OsascriptInjector()