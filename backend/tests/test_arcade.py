"""Arcade channel — escaneo, lanzamiento de emulador y endpoint de carátulas."""
import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from catodo.arcade import ArcadeChannel, _build_launch_command, _scan
from catodo.main import app


class FakeBroker:
    def __init__(self):
        self.events = []

    async def publish(self, event):
        self.events.append(event)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def arcade_dir(tmp_path):
    base = tmp_path
    (base / "NES" / "Pacman").mkdir(parents=True)
    (base / "NES" / "Pacman" / "pacman.nes").write_bytes(b"rom1")
    (base / "NES" / "Pacman" / "boxart.png").write_bytes(b"img1")
    (base / "NES" / "Donkey Kong").mkdir(parents=True)
    (base / "NES" / "Donkey Kong" / "dk.zip").write_bytes(b"rom2")
    (base / "MAME" / "Galaga").mkdir(parents=True)
    (base / "MAME" / "Galaga" / "galaga.zip").write_bytes(b"rom3")
    (base / "MAME" / "Galaga" / "boxart.jpg").write_bytes(b"img3")
    (base / "SinJuego").mkdir()
    return base


def _make_channel(base: Path, monkeypatch) -> ArcadeChannel:
    from catodo import arcade as m

    monkeypatch.setattr(m, "_arcade_dir", lambda: str(base))
    ch = ArcadeChannel()
    ch.attach_broker(FakeBroker())
    return ch


# --- Escaneo ---

def test_scan_groups_by_system(arcade_dir):
    systems = _scan(arcade_dir)
    names = [s["name"] for s in systems]
    assert names == ["MAME", "NES"]
    nes = next(s for s in systems if s["name"] == "NES")
    assert [g["name"] for g in nes["games"]] == ["Donkey Kong", "Pacman"]


def test_scan_detects_boxart(arcade_dir):
    systems = _scan(arcade_dir)
    nes = next(s for s in systems if s["name"] == "NES")
    pacman = next(g for g in nes["games"] if g["name"] == "Pacman")
    assert pacman["boxart"] and pacman["boxart"].endswith("boxart.png")
    dk = next(g for g in nes["games"] if g["name"] == "Donkey Kong")
    assert dk["boxart"] is None


def test_scan_empty_or_missing_dir(tmp_path):
    assert _scan(tmp_path / "nonexistent") == []
    empty = tmp_path / "empty"
    empty.mkdir()
    assert _scan(empty) == []


def test_scan_flat_roms_in_system_dir(tmp_path):
    """ROMs sueltas directas en la carpeta del sistema se listan sin subcarpetas."""
    snes = tmp_path / "snes"
    snes.mkdir()
    (snes / "SuperMarioWorld.smc").write_bytes(b"r1")
    (snes / "SuperMarioWorld.png").write_bytes(b"img")
    (snes / "Zelda.sfc").write_bytes(b"r2")
    (snes / "nota.txt").write_text("ignore")
    systems = _scan(tmp_path)
    assert [s["name"] for s in systems] == ["snes"]
    games = systems[0]["games"]
    assert [g["name"] for g in games] == ["SuperMarioWorld", "Zelda"]
    by_name = {g["name"]: g for g in games}
    assert by_name["SuperMarioWorld"]["boxart"] is not None
    assert by_name["Zelda"]["boxart"] is None
    assert {g["system"] for g in games} == {"snes"}


def test_scan_flat_roms_in_base(tmp_path):
    """ROMs sueltas en la raíz del arcade_dir → un sistema con el nombre base."""
    (tmp_path / "DK.smc").write_bytes(b"r1")
    (tmp_path / "sf2.zip").write_bytes(b"r2")
    systems = _scan(tmp_path)
    assert [s["name"] for s in systems] == [tmp_path.name]
    assert len(systems[0]["games"]) == 2


def test_scan_mixed_layout(tmp_path):
    """Conviven ROMs sueltas y subcarpetas de juego en el mismo sistema."""
    nes = tmp_path / "NES"
    nes.mkdir()
    (nes / "Pacman.nes").write_bytes(b"flat")
    (nes / "Donkey Kong").mkdir()
    (nes / "Donkey Kong" / "dk.nes").write_bytes(b"nested")
    (nes / "Donkey Kong" / "boxart.png").write_bytes(b"img")
    systems = _scan(tmp_path)
    nes_system = next(s for s in systems if s["name"] == "NES")
    names = {g["name"]: g for g in nes_system["games"]}
    assert set(names) == {"Pacman", "Donkey Kong"}
    assert names["Pacman"]["boxart"] is None
    assert names["Donkey Kong"]["boxart"] is not None


def test_scan_cue_bin_groups_tracks(tmp_path):
    """Un set cue/bin lista UN juego (el .cue) y omite sus tracks .bin."""
    psx = tmp_path / "psx"
    psx.mkdir()
    (psx / "Mortal Kombat Trilogy (USA) (v1.1).cue").write_text(
        'FILE "Mortal Kombat Trilogy (USA) (v1.1) (Track 01).bin" BINARY\n'
        'FILE "Mortal Kombat Trilogy (USA) (v1.1) (Track 02).bin" BINARY\n'
    )
    (psx / "Mortal Kombat Trilogy (USA) (v1.1) (Track 01).bin").write_bytes(b"t1")
    (psx / "Mortal Kombat Trilogy (USA) (v1.1) (Track 02).bin").write_bytes(b"t2")
    # un bin sin cue sigue siendo un juego aparte
    (psx / "homebrew.bin").write_bytes(b"h")
    systems = _scan(tmp_path)
    psx_system = next(s for s in systems if s["name"] == "psx")
    names = [g["name"] for g in psx_system["games"]]
    assert "Mortal Kombat Trilogy (USA) (v1.1)" in names
    assert not any("Track 0" in n for n in names)
    assert "homebrew" in names


# --- Plantilla de lanzamiento ---

def test_launch_command_replaces_rom():
    argv = _build_launch_command("retroarch -L core.so {rom}", "/tmp/juego.nes")
    assert argv == ["retroarch", "-L", "core.so", "/tmp/juego.nes"]


def test_launch_command_empty_template():
    with pytest.raises(ValueError):
        _build_launch_command("", "/tmp/juego.nes")


# --- Comando launch ---

@pytest.mark.asyncio
async def test_launch_ok_publishes_events(tmp_path, monkeypatch):
    base = Path(tmp_path)
    (base / "NES" / "Pacman").mkdir(parents=True)
    (base / "NES" / "Pacman" / "pacman.nes").write_bytes(b"rom")

    from catodo import arcade as m

    monkeypatch.setattr(m, "_arcade_dir", lambda: str(base))
    monkeypatch.setattr(m, "_emulators_config", lambda: {"NES": "/bin/true {rom}"})
    broker = FakeBroker()
    ch = ArcadeChannel()
    ch.attach_broker(broker)

    await ch.command("launch", game="NES/Pacman")
    assert ch._playing is True
    assert ch._current is not None

    # Esperar a que el emulador (true) termine y el watcher publique game_exited.
    for _ in range(100):
        if not ch._playing and ch._current is None:
            break
        await asyncio.sleep(0.05)
    assert ch._playing is False
    assert ch._current is None
    events = [e["event"] for e in broker.events]
    assert "game_launched" in events
    assert "game_exited" in events
    assert events.count("playing_changed") == 2


@pytest.mark.asyncio
async def test_launch_default_emulator(tmp_path, monkeypatch):
    base = Path(tmp_path)
    (base / "MAME" / "Galaga").mkdir(parents=True)
    (base / "MAME" / "Galaga" / "galaga.zip").write_bytes(b"rom")

    from catodo import arcade as m

    monkeypatch.setattr(m, "_arcade_dir", lambda: str(base))
    monkeypatch.setattr(m, "_emulators_config", lambda: {})
    monkeypatch.setattr(m, "_default_emulator", lambda: "/bin/true {rom}")
    broker = FakeBroker()
    ch = ArcadeChannel()
    ch.attach_broker(broker)

    await ch.command("launch", game="MAME/Galaga")
    assert ch._playing is True
    for _ in range(100):
        if not ch._playing:
            break
        await asyncio.sleep(0.05)
    assert "game_launched" in [e["event"] for e in broker.events]


@pytest.mark.asyncio
async def test_launch_without_emulator_publishes_error(tmp_path, monkeypatch):
    base = Path(tmp_path)
    (base / "NES" / "Pacman").mkdir(parents=True)
    (base / "NES" / "Pacman" / "pacman.nes").write_bytes(b"rom")

    from catodo import arcade as m

    monkeypatch.setattr(m, "_arcade_dir", lambda: str(base))
    monkeypatch.setattr(m, "_emulators_config", lambda: {})
    monkeypatch.setattr(m, "_default_emulator", lambda: "")
    broker = FakeBroker()
    ch = ArcadeChannel()
    ch.attach_broker(broker)

    await ch.command("launch", game="NES/Pacman")
    assert ch._playing is False
    events = [e["event"] for e in broker.events]
    assert "game_launch_failed" in events
    assert "emulador" in broker.events[-1]["error"]


# --- Endpoint /boxart ---

def test_boxart_endpoint(client, tmp_path):
    arcade = client.app.state.manager.get("arcade")
    boxart = tmp_path / "boxart.png"
    boxart.write_bytes(b"pngdata")
    arcade._systems = [
        {
            "name": "NES",
            "games": [
                {
                    "name": "Pacman",
                    "rom": str(tmp_path / "pacman.nes"),
                    "boxart": str(boxart),
                    "rel": "NES/Pacman",
                    "system": "NES",
                }
            ],
        }
    ]
    r = client.get("/api/channels/arcade/boxart?path=NES/Pacman")
    assert r.status_code == 200
    assert r.content == b"pngdata"
    r = client.get("/api/channels/arcade/boxart?path=NES/Missing")
    assert r.status_code == 404
    r = client.get("/api/channels/arcade/boxart")
    assert r.status_code == 404
