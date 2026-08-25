"""Linux InputInjectorPort adapters: ydotool (Wayland) or xdotool (X11)."""
from __future__ import annotations

import asyncio
import logging
import shutil

log = logging.getLogger("catodo.infrastructure.linux.input_injector")

_KEYS_YDOTOOL: dict[str, tuple[str, ...]] = {
    "esc": ("1:1", "1:0"),
    "enter": ("28:1", "28:0"),
    "backspace": ("14:1", "14:0"),
    "tab": ("15:1", "15:0"),
    "space": ("57:1", "57:0"),
    "up": ("103:1", "103:0"),
    "down": ("108:1", "108:0"),
    "left": ("105:1", "105:0"),
    "right": ("106:1", "106:0"),
    "del": ("111:1", "111:0"),
    "home": ("102:1", "102:0"),
    "end": ("107:1", "107:0"),
    "ntilde": ("39:1", "39:0"),
    "playpause": ("164:1", "164:0"),
    "prev": ("165:1", "165:0"),
    "next": ("163:1", "163:0"),
    "stop": ("166:1", "166:0"),
    "rewind": ("168:1", "168:0"),
    "forward": ("208:1", "208:0"),
    "volup": ("115:1", "115:0"),
    "voldown": ("114:1", "114:0"),
    "mute": ("113:1", "113:0"),
    "homepage": ("172:1", "172:0"),
    "power": ("116:1", "116:0"),
    "back": ("158:1", "158:0"),
}

_KEYS_XDOTOOL: dict[str, tuple[str, ...]] = {
    "esc": ("Escape",),
    "enter": ("Return",),
    "backspace": ("BackSpace",),
    "tab": ("Tab",),
    "space": ("space",),
    "up": ("Up",),
    "down": ("Down",),
    "left": ("Left",),
    "right": ("Right",),
    "del": ("Delete",),
    "home": ("Home",),
    "end": ("End",),
    "ntilde": ("ntilde",),
    "playpause": ("XF86AudioPlay",),
    "prev": ("XF86AudioPrev",),
    "next": ("XF86AudioNext",),
    "stop": ("XF86AudioStop",),
    "rewind": ("XF86AudioRewind",),
    "forward": ("XF86AudioForward",),
    "volup": ("XF86AudioRaiseVolume",),
    "voldown": ("XF86AudioLowerVolume",),
    "mute": ("XF86AudioMute",),
    "homepage": ("XF86HomePage",),
    "power": ("XF86PowerOff",),
    "back": ("XF86Back",),
}


class _XdotoolInjector:
    bin: str
    move_cmd: tuple[str, ...]
    click_left: tuple[str, ...]
    click_right: tuple[str, ...]

    def __init__(self) -> None:
        self.bin = shutil.which("xdotool") or ""
        self.move_cmd = ("mousemove_relative", "--", "{dx}", "{dy}")
        self.click_left = ("click", "1")
        self.click_right = ("click", "3")

    def is_available(self) -> bool:
        return bool(self.bin)

    async def _run(self, *args: str) -> None:
        log.debug("xdotool: %s", " ".join(args))
        proc = await asyncio.create_subprocess_exec(
            self.bin, *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=3)
        if proc.returncode != 0:
            log.warning("xdotool failed (rc=%d): %s", proc.returncode, stderr.decode()[:200])

    async def move(self, dx: int, dy: int) -> None:
        args = tuple(
            str(dx) if p == "{dx}" else str(dy) if p == "{dy}" else p
            for p in self.move_cmd
        )
        await self._run(*args)

    async def click(self, button: int) -> None:
        args = self.click_right if button == 3 else self.click_left
        await self._run(*args)

    async def scroll(self, dy: int) -> None:
        if not dy:
            return
        button = "4" if dy > 0 else "5"
        for _ in range(min(abs(dy), 10)):
            await self._run("click", button)

    async def key(self, name: str, shift: bool = False) -> None:
        seq = _KEYS_XDOTOOL.get(name)
        if not seq:
            raise ValueError(f"unknown key: {name}")
        if shift:
            seq = tuple("shift+" + k for k in seq)
        await self._run(*seq)

    async def type_text(self, text: str) -> None:
        if not text:
            return
        await self._run("type", text)


class _YdotoolInjector(_XdotoolInjector):
    def __init__(self) -> None:
        self.bin = shutil.which("ydotool") or ""
        self.move_cmd = ("mousemove", "-x", "{dx}", "-y", "{dy}")
        self.click_left = ("click", "0xC0")
        self.click_right = ("click", "0xC1")

    async def scroll(self, dy: int) -> None:
        if not dy:
            return
        await self._run("mousemove", "--wheel", "-y", str(dy))

    async def key(self, name: str, shift: bool = False) -> None:
        seq = _KEYS_YDOTOOL.get(name)
        if not seq:
            raise ValueError(f"unknown key: {name}")
        if shift:
            seq = ("42:1",) + seq + ("42:0",)
        await self._run(*seq)


def build_linux_injector() -> _XdotoolInjector | _YdotoolInjector:
    """Factory helper: prefer ydotool (Wayland), fallback xdotool (X11)."""
    if shutil.which("ydotool"):
        log.info("input_injector: using ydotool (Wayland)")
        return _YdotoolInjector()
    if shutil.which("xdotool"):
        log.info("input_injector: using xdotool (X11)")
        return _XdotoolInjector()
    log.warning("input_injector: install ydotool (Wayland) or xdotool (X11)")
    return _XdotoolInjector()  # not available, but stays an instance with is_available()=False