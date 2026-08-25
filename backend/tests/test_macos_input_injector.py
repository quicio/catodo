"""macOS input injector — cliclick primary, osascript fallback."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from catodo.infrastructure.macos.input_injector import (
    _CliclickInjector,
    _OsascriptInjector,
    build_macos_injector,
)


@pytest.mark.asyncio
async def test_cliclick_move_relative():
    inj = _CliclickInjector()
    inj.bin = "/usr/local/bin/cliclick"
    fake_proc = AsyncMock()
    fake_proc.communicate = AsyncMock(return_value=(b"", b""))
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await inj.move(100, -50)
    args = mock_exec.call_args.args
    assert args[0] == "/usr/local/bin/cliclick"
    assert args[1] == "m:100,-50"


@pytest.mark.asyncio
async def test_cliclick_key_return():
    inj = _CliclickInjector()
    inj.bin = "/usr/local/bin/cliclick"
    fake_proc = AsyncMock()
    fake_proc.communicate = AsyncMock(return_value=(b"", b""))
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await inj.key("enter")
    args = mock_exec.call_args.args
    assert args[0] == "/usr/local/bin/cliclick"
    assert args[1] == "kp:return"


@pytest.mark.asyncio
async def test_cliclick_key_unknown_raises():
    inj = _CliclickInjector()
    with pytest.raises(ValueError):
        await inj.key("notarealkey")


@pytest.mark.asyncio
async def test_osascript_click_uses_system_events():
    impl = _OsascriptInjector()
    impl.bin = "/usr/bin/osascript"
    fake_proc = AsyncMock()
    fake_proc.communicate = AsyncMock(return_value=(b"", b""))
    fake_proc.returncode = 0
    with patch(
        "asyncio.create_subprocess_exec", return_value=fake_proc
    ) as mock_exec:
        await impl.click(1)
    args = mock_exec.call_args.args
    assert "System Events" in args[2]


def test_factory_prefers_cliclick(monkeypatch):
    monkeypatch.setattr("shutil.which", lambda b: "/usr/local/bin/cliclick" if b == "cliclick" else None)
    inj = build_macos_injector()
    assert isinstance(inj, _CliclickInjector)


def test_factory_falls_back_to_osascript(monkeypatch):
    def fake_which(b):
        return "/usr/bin/osascript" if b == "osascript" else None
    monkeypatch.setattr("shutil.which", fake_which)
    inj = build_macos_injector()
    assert isinstance(inj, _OsascriptInjector)