"""macOS OsascriptMixer — subprocess interaction tests."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from catodo.infrastructure.macos.mixer import OsascriptMixer


@pytest.mark.asyncio
async def test_set_volume_invokes_osascript():
    mixer = OsascriptMixer()
    fake_proc = AsyncMock()
    fake_proc.wait = AsyncMock(return_value=0)
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        ok = await mixer.set_volume(70)
    assert ok is True
    args = mock_exec.call_args.args
    assert args[0].endswith("osascript")
    assert args[1] == "-e"
    assert args[2] == "set volume output volume 70"


@pytest.mark.asyncio
async def test_get_volume_parses_int():
    mixer = OsascriptMixer()
    fake_proc = AsyncMock()
    fake_proc.communicate = AsyncMock(return_value=(b"42\n", b""))
    fake_proc.returncode = 0
    with patch("asyncio.create_subprocess_exec", return_value=fake_proc):
        result = await mixer.get_volume()
    assert result == 42


@pytest.mark.asyncio
async def test_set_volume_clamps():
    mixer = OsascriptMixer()
    fake_proc = AsyncMock()
    fake_proc.wait = AsyncMock(return_value=0)
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await mixer.set_volume(150)
    args = mock_exec.call_args.args
    assert args[2] == "set volume output volume 100"


@pytest.mark.asyncio
async def test_set_default_sink_is_noop():
    mixer = OsascriptMixer()
    assert await mixer.set_default_sink("anything") is False