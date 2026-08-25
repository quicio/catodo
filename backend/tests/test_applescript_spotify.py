"""ApplescriptSpotifyClient — AppleScript control of desktop Spotify.app on macOS."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from catodo.infrastructure.macos.spotify_client import ApplescriptSpotifyClient


def test_is_available_true_when_spotify_installed(monkeypatch, tmp_path):
    """is_available devuelve True si /Applications/Spotify.app existe."""
    fake_app = tmp_path / "Spotify.app"
    fake_app.mkdir()
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._spotify_installed",
        lambda: True,
    )
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._osascript_bin",
        lambda: "/usr/bin/osascript",
    )
    assert ApplescriptSpotifyClient().is_available() is True


def test_is_available_false_when_spotify_missing(monkeypatch):
    """Sin Spotify.app, el adapter no está disponible."""
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._spotify_installed",
        lambda: False,
    )
    assert ApplescriptSpotifyClient().is_available() is False


def test_is_available_false_when_no_osascript(monkeypatch):
    """Sin osascript, el adapter no está disponible (no puede lanzar comandos)."""
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._spotify_installed",
        lambda: True,
    )
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._osascript_bin",
        lambda: None,
    )
    assert ApplescriptSpotifyClient().is_available() is False


@pytest.mark.asyncio
async def test_play_invokes_osascript():
    client = ApplescriptSpotifyClient()
    fake_proc = AsyncMock()
    fake_proc.wait = AsyncMock(return_value=0)
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await client.play()
    args = mock_exec.call_args.args
    assert args[0].endswith("osascript")
    assert args[1] == "-e"
    assert 'tell application "Spotify" to play' in args[2]


@pytest.mark.asyncio
async def test_pause_next_previous():
    client = ApplescriptSpotifyClient()
    for method, expected in [
        (client.pause, 'tell application "Spotify" to pause'),
        (client.next, 'tell application "Spotify" to next track'),
        (client.previous, 'tell application "Spotify" to previous track'),
    ]:
        fake_proc = AsyncMock()
        fake_proc.wait = AsyncMock(return_value=0)
        fake_proc.returncode = 0
        with patch(
            "asyncio.create_subprocess_exec", return_value=fake_proc
        ) as mock_exec:
            await method()
        assert expected in mock_exec.call_args.args[2]


@pytest.mark.asyncio
async def test_set_volume_clamps_and_scales():
    client = ApplescriptSpotifyClient()
    fake_proc = AsyncMock()
    fake_proc.wait = AsyncMock(return_value=0)
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await client.set_volume(0.7)
    args = mock_exec.call_args.args
    assert "70" in args[2]  # 0.7 * 100 = 70


@pytest.mark.asyncio
async def test_set_volume_clamps_to_range():
    client = ApplescriptSpotifyClient()
    fake_proc = AsyncMock()
    fake_proc.wait = AsyncMock(return_value=0)
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await client.set_volume(2.0)  # over 1.0
    assert "100" in mock_exec.call_args.args[2]
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await client.set_volume(-0.5)  # under 0.0
    assert "0" in mock_exec.call_args.args[2]


@pytest.mark.asyncio
async def test_open_uri_uses_open_location():
    client = ApplescriptSpotifyClient()
    fake_proc = AsyncMock()
    fake_proc.wait = AsyncMock(return_value=0)
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await client.open_uri("spotify:track:abc123")
    args = mock_exec.call_args.args
    assert 'tell application "Spotify" to open location "spotify:track:abc123"' in args[2]


@pytest.mark.asyncio
async def test_get_state_parses_apple_script_record():
    """Un único osascript devuelve todo el state; parser maneja quoting/commas."""
    client = ApplescriptSpotifyClient()
    # Simula output típico de AppleScript: tab/comma separated con quoting
    raw = (
        'playing, "Song Name", "The Artist", "Album Title", '
        '"spotify:track:xyz", 123.456, "https://example.com/art.jpg"'
    )
    fake_proc = AsyncMock()
    fake_proc.communicate = AsyncMock(return_value=(raw.encode(), b""))
    fake_proc.returncode = 0
    with patch("asyncio.create_subprocess_exec", return_value=fake_proc):
        state = await client.get_state()
    assert state["available"] is True
    assert state["status"] == "playing"
    assert state["title"] == "Song Name"
    assert state["artist"] == "The Artist"
    assert state["album"] == "Album Title"
    assert state["track_id"] == "spotify:track:xyz"
    assert state["position"] == 123.456
    assert state["art_url"] == "https://example.com/art.jpg"


@pytest.mark.asyncio
async def test_get_state_returns_unavailable_on_failure():
    """Si osascript falla, devolvemos {available: False} en vez de raise."""
    client = ApplescriptSpotifyClient()
    fake_proc = AsyncMock()
    fake_proc.communicate = AsyncMock(return_value=(b"", b""))
    fake_proc.returncode = 1  # error
    with patch("asyncio.create_subprocess_exec", return_value=fake_proc):
        state = await client.get_state()
    assert state == {"available": False}


@pytest.mark.asyncio
async def test_get_state_unavailable_when_no_osascript(monkeypatch):
    monkeypatch.setattr(
        "catodo.infrastructure.macos.spotify_client._osascript_bin",
        lambda: None,
    )
    client = ApplescriptSpotifyClient()
    state = await client.get_state()
    assert state == {"available": False}