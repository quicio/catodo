"""Spotify channel — wraps a SpotifyClientPort with channel-level concerns.

Channel-level concerns: state history (capped at 20), monotonic position
estimator, watcher loop that publishes events, lifecycle (open/close/command).

Linux uses the DBus/MPRIS port (`catodo.infrastructure.linux.spotify_client
.DbusSpotifyClient`); macOS uses AppleScript against Spotify.app (`catodo
.infrastructure.macos.spotify_client.ApplescriptSpotifyClient`). This file
only consumes the port.
"""
from __future__ import annotations

import asyncio
import logging
import time

from catodo.channel import Channel
from catodo.domain.ports import SpotifyClientPort

log = logging.getLogger("catodo.spotify")


class SpotifyChannel(Channel):
    id = "spotify"
    name = "Spotify"
    icon = "music"
    type = "media"
    order = 0
    capabilities = frozenset(["history"])

    def __init__(self, client: SpotifyClientPort) -> None:
        from collections import deque

        self._client = client
        self._lock = asyncio.Lock()
        self._last_status: str = "Stopped"
        self._last_meta: dict = {}
        self._track_id: str | None = None
        self._position_at_resume: float = 0.0
        self._resume_monotonic: float | None = None
        self._history: deque = deque(maxlen=20)
        self._broker = None
        self._watcher_task: asyncio.Task | None = None
        self._load_history()

    def _load_history(self) -> None:
        from catodo import store

        entries = store.load("spotify_history", {"version": 1, "items": []}).get("items", [])
        last_id = None
        for entry in entries[:20]:
            track_id = entry.get("track_id")
            if track_id and track_id == last_id:
                continue
            if track_id:
                last_id = track_id
            self._history.append(entry)

    async def _publish_position(self, snap: dict) -> None:
        if self._broker is None:
            return
        pos = snap.get("position", 0)
        if abs(pos - getattr(self, "_last_published_position", -1.0)) >= 0.5:
            self._last_published_position = pos
            await self._broker.publish({
                "event": "playback_progress",
                "channel_id": self.id,
                "position": pos,
                "status": snap.get("status"),
            })

    async def _save_history(self) -> None:
        from catodo import store

        await store.save("spotify_history", {"version": 1, "items": list(self._history)})

    def attach_broker(self, broker) -> None:
        self._broker = broker
        self._watcher_task = asyncio.create_task(self._watcher())

    async def _watcher(self) -> None:
        while self._watcher_task is not None:
            try:
                snap = await self._read_state()
                if self._broker and snap.get("available"):
                    if snap.get("status") != self._last_status:
                        await self._broker.publish({
                            "event": "playback_status_changed",
                            "channel_id": self.id,
                            "status": snap.get("status"),
                            "position": snap.get("position", 0),
                        })
                    new_track = self._track_id
                    if new_track and snap.get("title"):
                        prev_meta = getattr(self, "_watcher_last_meta", {})
                        if (snap.get("title"), snap.get("artist")) != (prev_meta.get("title"), prev_meta.get("artist")):  # noqa: E501
                            self._watcher_last_meta = snap
                            await self._broker.publish({
                                "event": "track_changed",
                                "channel_id": self.id,
                                "title": snap.get("title"),
                                "artist": snap.get("artist"),
                                "album": snap.get("album", ""),
                                "art_url": snap.get("art_url", ""),
                                "status": snap.get("status"),
                            })
                    if snap.get("status") == "Playing":
                        await self._publish_position(snap)
            except Exception:
                pass
            await asyncio.sleep(1)

    async def _read_state(self) -> dict:
        if not self._client.is_available():
            return {"available": False}
        snap = await self._client.get_state()
        if not snap.get("available"):
            return snap
        status = snap.get("status")
        if status is not None:
            new_status = str(status)
            if new_status != self._last_status:
                self._on_status_change(new_status)
            self._last_status = new_status
        new_track_id = snap.get("track_id")
        if new_track_id and new_track_id != self._track_id:
            # Al reanudar (ej. reinicio del backend) no re-agregar la pista que
            # ya quedó como la última del historial.
            if self._history and self._history[0].get("track_id") == new_track_id:
                self._track_id = new_track_id
            else:
                self._on_track_change(new_track_id, snap)
        self._last_meta = {k: v for k, v in snap.items() if k != "track_id"}
        snap["position"] = await self._read_position(snap.get("position"))
        return snap

    async def _read_position(self, real: float | None = None) -> float:
        """Posición de la pista (segundos).

        Durante la reproducción avanza con un estimador por monotonic para
        que el progreso fluya en el frontend sin depender del polling de MPRIS.
        Cuando la posición real de MPRIS (`Position`, en µs) difiere mucho del
        estimador —seek manual o backend arrancado a mitad de tema— se
        resincroniza el estimador para que coincida.
        """
        if self._last_status != "Playing":
            return self._position_at_resume
        if real is not None:
            est = self._compute_position()
            if abs(real - est) > 1.5:
                self._position_at_resume = real
                self._resume_monotonic = time.monotonic()
        return self._compute_position()

    def _on_track_change(self, track_id: str, meta) -> None:
        self._track_id = track_id
        self._position_at_resume = 0.0
        self._last_published_position = -1.0
        self._resume_monotonic = time.monotonic() if self._last_status == "Playing" else None
        spotify_uri = None
        if isinstance(meta, dict):
            tid = meta.get("track_id") or ""
            if tid.startswith("/com/spotify/track/"):
                spotify_uri = "spotify:track:" + tid.split("/")[-1]
        entry = {
            "track_id": track_id,
            "spotify_uri": spotify_uri,
            "title": str(meta.get("title", "")) if isinstance(meta, dict) else "",
            "artist": (
                " · ".join(str(a) for a in meta.get("artist", []))
                if isinstance(meta.get("artist"), list)
                else str(meta.get("artist", "") if isinstance(meta, dict) else "")
            ),
            "album": str(meta.get("album", "")) if isinstance(meta, dict) else "",
            "art_url": str(meta.get("art_url", "")) if isinstance(meta, dict) else "",
            "played_at": time.time(),
        }
        if entry["title"] and not any(
            h.get("track_id") == track_id and (entry["played_at"] - h.get("played_at", 0)) < 2
            for h in self._history
        ):
            self._history.appendleft(entry)
            asyncio.ensure_future(self._save_history())

    def history(self) -> list:
        return list(self._history)

    async def state(self) -> dict:
        snap = await self._read_state()
        return {"id": self.id, **snap}

    async def history_state(self) -> dict:
        return {"id": self.id, "items": self.history()}

    def _on_status_change(self, new_status: str) -> None:
        if new_status == "Playing":
            self._resume_monotonic = time.monotonic()
        elif new_status == "Paused":
            if self._resume_monotonic is not None:
                self._position_at_resume += time.monotonic() - self._resume_monotonic
                self._resume_monotonic = None

    def _compute_position(self) -> float:
        if self._last_status == "Playing" and self._resume_monotonic is not None:
            return self._position_at_resume + (time.monotonic() - self._resume_monotonic)
        return self._position_at_resume

    def _last_resume_uri(self) -> str | None:
        """URI a reanudar al abrir el canal: última pista (o contexto) escuchada."""
        for entry in self._history:
            uri = entry.get("context_uri") or entry.get("spotify_uri")
            if uri:
                return str(uri)
        return None

    async def open(self) -> None:
        snap = await self._read_state()
        if not snap.get("available"):
            # Spotify no está corriendo: abrirlo apuntando a la última pista
            # para que arranque reproduciendo lo que se estaba escuchando, y
            # minimizar su ventana para no robarle el foco al kiosk.
            await self._launch_minimized(self._last_resume_uri() or "spotify:")
            return
        if snap.get("status") != "Stopped" and snap.get("title"):
            # Ya hay una pista cargada (pausada o sonando): reanudar normal.
            await self._client.play()
        else:
            # Nada cargado o cola terminada: retomar la última pista del historial
            # en lugar de dejar el canal en blanco.
            uri = self._last_resume_uri()
            if uri:
                await self._client.open_uri(uri)
            else:
                await self._client.play()
        # Spotify ya corría: igual asegurarse de que su ventana quede en el
        # scratchpad (puede haber quedado visible de una sesión anterior).
        self._hide_task = asyncio.ensure_future(self._hide_hyprland())

    async def close(self) -> None:
        await self._client.pause()

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "play":
            await self._client.play()
        elif cmd == "pause":
            await self._client.pause()
        elif cmd == "next":
            await self._client.next()
        elif cmd == "prev":
            await self._client.previous()
        elif cmd == "toggle":
            if self._last_status == "Playing":
                await self._client.pause()
            else:
                await self._client.play()
        elif cmd == "volume":
            level = float(kwargs.get("level", 1.0))
            level = max(0.0, min(1.0, level))
            await self._client.set_volume(level)
        elif cmd == "open_uri":
            uri = kwargs.get("uri", "")
            if uri:
                await self._client.open_uri(uri)
        else:
            log.warning("unknown spotify command: %s", cmd)

    async def _launch_minimized(self, uri: str) -> None:
        """Lanza Spotify (si no estaba corriendo) y lo manda al fondo para que
        el kiosk no pierda el foco:
        - macOS: AppleScript set miniaturized (oculta la ventana).
        - Hyprland: mueve la ventana al special workspace (scratchpad) vía IPC.
        - X11: la minimiza con xdotool.
        Best-effort: si nada aplica, Spotify queda visible y nada más."""
        from catodo import platform as _platform

        await self._client.open_uri(uri)
        from catodo import runtime_config

        if runtime_config.get("spotify_minimize_on_launch") is False:
            return
        if _platform.IS_MACOS:
            await self._hide_macos()
            return
        if await self._hide_hyprland():
            return
        await self._minimize_xdotool()

    async def _hide_macos(self) -> bool:
        """macOS: minimiza la ventana de Spotify vía AppleScript.

        Requiere permiso TCC Automation para 'Spotify' (System Settings →
        Privacy & Security → Automation). Si no está granted, el osascript
        falla silenciosamente y la ventana queda visible — el kiosk sigue
        funcionando.

        Espera hasta ~5s para que la ventana aparezca tras el launch de
        Spotify.app (AppleScript dispara el open location antes de que la
        ventana exista).
        """
        import shutil

        osascript = shutil.which("osascript")
        if not osascript:
            return False
        for attempt in range(10):
            if attempt:
                await asyncio.sleep(0.5)
            try:
                proc = await asyncio.create_subprocess_exec(
                    osascript, "-e",
                    'tell application "System Events" to '
                    'set miniaturized of window 1 of process "Spotify" to true',
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await asyncio.wait_for(proc.wait(), timeout=3)
                if proc.returncode == 0:
                    log.info("spotify window minimized on macOS")
                    return True
            except Exception:
                continue
        return False

    async def _hide_hyprland(self) -> bool:
        """Hyprland: mueve la ventana de Spotify al special workspace (scratchpad)
        vía hyprctl IPC. Devuelve True si aplicó.

        No confía en la HYPRLAND_INSTANCE_SIGNATURE del entorno: tras un relogeo
        suele quedar stale apuntando a una instancia muerta. se enumeran los
        sockets en $XDG_RUNTIME_DIR/hypr y se usa la primera instancia viva."""
        import glob
        import os
        import shutil

        hyprctl = shutil.which("hyprctl")
        if not hyprctl:
            return False
        base = os.environ.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
        candidates = sorted(
            (
                os.path.basename(d)
                for d in glob.glob(os.path.join(base, "hypr", "*"))
                if os.path.isdir(d)
            ),
            reverse=True,
        )
        for sig in candidates:
            env = {**os.environ, "HYPRLAND_INSTANCE_SIGNATURE": sig}
            try:
                proc = await asyncio.create_subprocess_exec(
                    hyprctl, "-j", "clients", env=env,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                )
                out, _ = await proc.communicate()
                if proc.returncode != 0:
                    continue
            except Exception:
                continue
            # Instancia viva. La ventana de Spotify puede tardar en aparecer
            # tras el launch: se chequea ya y luego cada ~1s hasta ~10s.
            for attempt in range(10):
                if attempt:
                    await asyncio.sleep(1)
                try:
                    proc = await asyncio.create_subprocess_exec(
                        hyprctl, "-j", "clients", env=env,
                        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                    )
                    out, _ = await proc.communicate()
                    if proc.returncode != 0 or (b'"Spotify"' not in out and b'"spotify"' not in out):
                        continue
                    await asyncio.create_subprocess_exec(
                        hyprctl, "dispatch", "movetoworkspacesilent",
                        "special:spotify,class:Spotify", env=env,
                        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
                    )
                    log.info("spotify moved to hyprland special workspace (%s)", sig)
                    return True
                except Exception:
                    return False
            return False
        return False

    async def _minimize_xdotool(self) -> None:
        """X11: minimiza la ventana de Spotify con xdotool (fallback)."""
        import shutil

        xdotool = shutil.which("xdotool")
        if not xdotool:
            return
        # La ventana tarda en aparecer tras el launch; se busca por class y
        # por nombre (fallback) hasta ~10s.
        patterns = [
            ["--class", "spotify"],
            ["--class", "Spotify"],
            ["--name", "Spotify"],
        ]
        for _ in range(10):
            await asyncio.sleep(1)
            for pat in patterns:
                try:
                    proc = await asyncio.create_subprocess_exec(
                        xdotool, "search", *pat,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    out, _ = await proc.communicate()
                    windows = out.decode().strip().splitlines()
                    if not windows:
                        continue
                    await asyncio.create_subprocess_exec(
                        xdotool, "windowminimize", windows[0],
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    log.info("spotify window minimized (%s)", windows[0])
                    return
                except Exception:
                    return

    async def _open_uri(self, uri: str) -> None:
        """Compat: delega al port. Mantenido por si callers externos lo usan."""
        await self._client.open_uri(uri)