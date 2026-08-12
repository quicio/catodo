"""Arcade boxart — mapeo de sistemas, candidatos, descarga y sync automático."""
import asyncio
from pathlib import Path

import pytest

from catodo import arcade as arcade_mod
from catodo.boxart import candidate_names, fetch_boxart, resolve_system


class FakeBroker:
    def __init__(self):
        self.events = []

    async def publish(self, event):
        self.events.append(event)


# --- Mapeo y candidatos ---

def test_resolve_system_known_and_fallback():
    assert resolve_system("snes") == "Nintendo - Super Nintendo Entertainment System"
    assert resolve_system("GBA") == "Nintendo - Game Boy Advance"
    assert resolve_system("genesis") == "Sega - Mega Drive - Genesis"
    assert resolve_system("MiSistema") == "MiSistema"


def test_candidate_names_variants():
    names = candidate_names("Super Mario World")
    assert names[0] == "Super Mario World"
    assert "Super Mario World (USA)" in names
    assert "Super Mario World (Europe)" in names


def test_candidate_names_strips_region():
    names = candidate_names("Zelda (USA) (Rev 1)")
    assert names[0] == "Zelda (USA) (Rev 1)"
    assert "Zelda" in names
    assert "Zelda (USA)" in names


# --- fetch (mockeado) ---

def test_fetch_boxart_saves_sidecar(tmp_path, monkeypatch):
    rom = tmp_path / "Super Mario World.smc"
    rom.write_bytes(b"rom")

    def fake_get(url):
        assert "thumbnails.libretro.com" in url
        return b"imgdata"

    monkeypatch.setattr("catodo.boxart._http_get", fake_get)
    out = fetch_boxart("snes", "Super Mario World", str(rom))
    assert out == rom.with_suffix(".png")
    assert out.read_bytes() == b"imgdata"


def test_fetch_boxart_not_found(tmp_path, monkeypatch):
    rom = tmp_path / "Raro.smc"
    rom.write_bytes(b"rom")
    monkeypatch.setattr("catodo.boxart._http_get", lambda url: None)
    assert fetch_boxart("snes", "Raro", str(rom)) is None
    assert not rom.with_suffix(".png").exists()


# --- Sync automático en ArcadeChannel ---

async def _wait_empty(ch, broker=None):
    for _ in range(300):
        done = ch._boxart_queue.empty() and not ch._boxart_queued
        if done and (
            broker is None or any(e["event"] == "boxarts_synced" for e in broker.events)
        ):
            return
        await asyncio.sleep(0.03)


@pytest.mark.asyncio
async def test_auto_sync_downloads_missing(tmp_path, monkeypatch):
    base = Path(tmp_path)
    (base / "snes").mkdir(parents=True)
    (base / "snes" / "Super Mario World.smc").write_bytes(b"rom")
    monkeypatch.setattr(arcade_mod, "_arcade_dir", lambda: str(base))

    def fake_fetch(system, name, rom_path):
        target = Path(rom_path).with_suffix(".png")
        target.write_bytes(b"img")
        return target

    monkeypatch.setattr(arcade_mod, "fetch_boxart", fake_fetch)
    broker = FakeBroker()
    ch = arcade_mod.ArcadeChannel()
    ch.attach_broker(broker)

    await ch.refresh()
    await _wait_empty(ch, broker)

    game = ch._systems[0]["games"][0]
    assert game["boxart"] is not None and game["boxart"].endswith(".png")
    events = [e["event"] for e in broker.events]
    assert "boxart_fetched" in events
    assert "boxarts_synced" in events


@pytest.mark.asyncio
async def test_auto_sync_failure_is_cached(tmp_path, monkeypatch):
    base = Path(tmp_path)
    (base / "snes").mkdir(parents=True)
    (base / "snes" / "SinCaratula.smc").write_bytes(b"rom")
    monkeypatch.setattr(arcade_mod, "_arcade_dir", lambda: str(base))
    monkeypatch.setattr(arcade_mod, "fetch_boxart", lambda *a, **k: None)
    broker = FakeBroker()
    ch = arcade_mod.ArcadeChannel()
    ch.attach_broker(broker)

    await ch.refresh()
    await _wait_empty(ch, broker)

    game = ch._systems[0]["games"][0]
    assert game["boxart"] is None
    assert ch._is_recent_failure(game["rel"]) is True
    # un segundo refresh no re-encola (cache de fallos)
    await ch.refresh()
    assert ch._boxart_queue.empty()


@pytest.mark.asyncio
async def test_fetch_boxart_command_retries(tmp_path, monkeypatch):
    base = Path(tmp_path)
    (base / "snes").mkdir(parents=True)
    (base / "snes" / "Pacman.smc").write_bytes(b"rom")
    monkeypatch.setattr(arcade_mod, "_arcade_dir", lambda: str(base))
    calls = {"n": 0}

    def fake_fetch(system, name, rom_path):
        calls["n"] += 1
        if calls["n"] == 1:
            return None  # falla la auto-sync
        target = Path(rom_path).with_suffix(".png")
        target.write_bytes(b"img")
        return target

    monkeypatch.setattr(arcade_mod, "fetch_boxart", fake_fetch)
    broker = FakeBroker()
    ch = arcade_mod.ArcadeChannel()
    ch.attach_broker(broker)

    await ch.refresh()
    await _wait_empty(ch, broker)
    game = ch._systems[0]["games"][0]
    assert game["boxart"] is None

    # retry manual: limpia cache y fuerza
    await ch.command("fetch_boxart", game=game["rel"])
    await _wait_empty(ch, broker)
    assert game["boxart"] is not None
    assert ch._is_recent_failure(game["rel"]) is False


@pytest.mark.asyncio
async def test_fetch_boxarts_command_forces_batch(tmp_path, monkeypatch):
    base = Path(tmp_path)
    (base / "nes").mkdir(parents=True)
    (base / "nes" / "A.nes").write_bytes(b"r1")
    (base / "nes" / "B.nes").write_bytes(b"r2")
    monkeypatch.setattr(arcade_mod, "_arcade_dir", lambda: str(base))
    monkeypatch.setattr(arcade_mod, "fetch_boxart", lambda *a, **k: None)
    broker = FakeBroker()
    ch = arcade_mod.ArcadeChannel()
    ch.attach_broker(broker)

    await ch.refresh()
    await _wait_empty(ch, broker)
    assert all(g["boxart"] is None for g in ch._systems[0]["games"])

    await ch.command("fetch_boxarts")
    await _wait_empty(ch, broker)
    assert "boxarts_synced" in [e["event"] for e in broker.events]
