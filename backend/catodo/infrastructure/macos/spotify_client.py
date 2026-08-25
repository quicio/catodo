"""macOS SpotifyClientPort adapter: AppleScript control of desktop Spotify.app.

Spotify.app exposes a documented AppleScript dictionary with all the
operations the `SpotifyClientPort` interface needs (play/pause/next/previous,
set_volume, open_uri, get_state). One osascript invocation per call; `get_state
uses a single batched call that returns an AppleScript record with all props.

Trade-off vs DBus on Linux:
- Each subprocess costs ~30-50ms (osascript spawn + Apple event dispatch),
  vs DBus IPC ~5ms. We mitigate by batching `get_state` into one call.
- macOS Automation permissions (TCC) are needed: the shell that runs the
  backend must be granted Automation access to "Spotify" the first time
  (System Settings → Privacy & Security → Automation). Documented in README.
- If Spotify.app is not installed, `is_available()` returns False and the
  channel is omitted from the registry — same gating behavior as before.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
from typing import Any

log = logging.getLogger("catodo.infrastructure.macos.spotify_client")

SPOTIFY_APP_PATH = "/Applications/Spotify.app"

_osascript: str | None = None
_warned: bool = False


def _osascript_bin() -> str | None:
    global _osascript
    if _osascript is None:
        _osascript = shutil.which("osascript")
    return _osascript


def _spotify_installed() -> bool:
    """Chequea si Spotify.app existe en /Applications sin abrirlo."""
    return os.path.isdir(SPOTIFY_APP_PATH)


# Script único para get_state: una sola llamada a osascript devuelve todas las
# props en un AppleScript record. parse_state() lo convierte a dict Python.
_GET_STATE_SCRIPT = """
tell application "Spotify"
    try
        set pstate to (player state) as string
    on error
        set pstate to "stopped"
    end try
    try
        set tname to name of current track
    on error
        set tname to ""
    end try
    try
        set tartist to artist of current track
    on error
        set tartist to ""
    end try
    try
        set talbum to album of current track
    on error
        set talbum to ""
    end try
    try
        set tid to id of current track
    on error
        set tid to ""
    end try
    try
        set tpos to (position of current track) as string
    on error
        set tpos to "0"
    end try
    try
        set tarturl to artwork url of current track
    on error
        set tarturl to ""
    end try
    return {pstate, tname, tartist, talbum, tid, tpos, tarturl}
end tell
"""


def _parse_state(raw: str) -> dict[str, Any]:
    """Parsea el AppleScript record devuelto por _GET_STATE_SCRIPT.

    AppleScript devuelve una sola línea con campos delimitados por tabs y
    strings entre comillas dobles escapadas. Para mantener el parsing
    simple, usamos `,` como separador respetando comillas.
    """
    s = raw.strip()
    if not s or s == "missing value":
        return {"available": False}
    fields: list[str] = []
    cur: list[str] = []
    in_quote = False
    for ch in s:
        if ch == '"':
            in_quote = not in_quote
            continue
        if ch == "," and not in_quote:
            fields.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur:
        fields.append("".join(cur).strip())
    while len(fields) < 7:
        fields.append("")
    pstate, tname, tartist, talbum, tid, tpos, tarturl = fields[:7]
    try:
        position = float(tpos) if tpos else None
    except ValueError:
        position = None
    return {
        "available": pstate != "stopped" or bool(tname),
        "status": pstate,
        "title": tname,
        "artist": tartist,
        "album": talbum,
        "track_id": tid,
        "position": position,
        "art_url": tarturl,
    }


class ApplescriptSpotifyClient:
    """SpotifyClientPort implementation via AppleScript on macOS."""

    def __init__(self) -> None:
        global _warned
        if not _spotify_installed() and not _warned:
            log.info(
                "Spotify.app not found at %s — Spotify channel disabled "
                "(install Spotify from spotify.com to enable Ch1)",
                SPOTIFY_APP_PATH,
            )
            _warned = True
        elif _osascript_bin() is None and not _warned:
            log.warning(
                "osascript not found in PATH — Spotify channel disabled"
            )
            _warned = True

    def is_available(self) -> bool:
        """True iff Spotify.app is installed AND osascript is available.

        No lanzamos Spotify aquí: queremos que el gating decida basado en
        instalación, no en proceso. Una vez instalado, `tell application
        "Spotify" to ...` arranca la app automáticamente si no está corriendo.
        """
        return _spotify_installed() and _osascript_bin() is not None

    async def _run(self, *args: str, timeout: float = 5.0) -> subprocess.Popen | None:
        bin_ = _osascript_bin()
        if not bin_:
            return None
        try:
            proc = await asyncio.create_subprocess_exec(
                bin_, *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=timeout)
            return proc
        except Exception as e:
            log.debug("osascript failed (%s): %s", " ".join(args[:2]), e)
            return None

    async def play(self) -> None:
        await self._run("-e", 'tell application "Spotify" to play')

    async def pause(self) -> None:
        await self._run("-e", 'tell application "Spotify" to pause')

    async def next(self) -> None:
        await self._run("-e", 'tell application "Spotify" to next track')

    async def previous(self) -> None:
        await self._run("-e", 'tell application "Spotify" to previous track')

    async def set_volume(self, level: float) -> None:
        level = max(0.0, min(1.0, float(level)))
        pct = int(round(level * 100))
        await self._run(
            "-e", f'tell application "Spotify" to set sound volume to {pct}'
        )

    async def open_uri(self, uri: str) -> None:
        if not uri:
            return
        await self._run(
            "-e", f'tell application "Spotify" to open location "{uri}"'
        )

    async def get_state(self) -> dict[str, Any]:
        bin_ = _osascript_bin()
        if not bin_:
            return {"available": False}
        try:
            proc = await asyncio.create_subprocess_exec(
                bin_, "-e", _GET_STATE_SCRIPT,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            if proc.returncode != 0:
                return {"available": False}
            return _parse_state(stdout.decode("utf-8", "ignore"))
        except Exception as e:
            log.debug("get_state failed: %s", e)
            return {"available": False}