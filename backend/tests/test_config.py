"""Test runtime config and store."""
import json
import os

import pytest

from catodo import runtime_config, store


@pytest.fixture
def fresh_config():
    """Resetea el cache de runtime_config y arranca sin config.json."""
    runtime_config._config = None
    if os.path.isfile(runtime_config.CONFIG_FILE):
        os.remove(runtime_config.CONFIG_FILE)
    yield
    runtime_config._config = None
    if os.path.isfile(runtime_config.CONFIG_FILE):
        os.remove(runtime_config.CONFIG_FILE)


@pytest.mark.asyncio
async def test_config_round_trip(tmp_data_dir):
    """Write and read a key through runtime config."""
    await runtime_config.set("tv_url", "https://example.com")
    assert runtime_config.get("tv_url") == "https://example.com"


@pytest.mark.asyncio
async def test_config_unknown_key_passes_through():
    """Getting an unknown key returns None."""
    val = runtime_config.get("bogus_nonexistent_key")
    assert val is None


@pytest.mark.asyncio
async def test_store_atomic_save(tmp_data_dir):
    """Store save and load round trip."""
    data = {"version": 1, "items": {"a": 1, "b": 2}}
    await store.save("test_store", data)
    loaded = store.load("test_store")
    assert loaded == data


def test_store_load_missing(tmp_data_dir):
    """Load returns default when file does not exist."""
    loaded = store.load("nonexistent_store", {"default": True})
    assert loaded == {"default": True}


def test_store_corrupt_recovery(tmp_data_dir):
    """Corrupt JSON is backed aside and defaults returned."""
    store_path = store.path("test_corrupt")
    with open(store_path, "w") as f:
        f.write("not json {{{")
    loaded = store.load("test_corrupt", {"ok": True})
    assert loaded == {"ok": True}
    assert os.path.exists(store_path + ".bak") or not os.path.exists(store_path)


# --- theme_overrides (apariencia) ---


def test_overrides_default_empty(fresh_config):
    assert runtime_config.get("theme_overrides") == {}


@pytest.mark.asyncio
async def test_overrides_persist_and_sanitize(fresh_config):
    await runtime_config.set("theme_overrides", {"font": "inter", "bogus": 1, "radius": "huge"})
    runtime_config._config = None  # simular reinicio del backend
    assert runtime_config.get("theme_overrides") == {"font": "inter"}


def test_legacy_crt_migration(fresh_config):
    """Un config viejo con theme_crt_enabled se pliega en theme_overrides.crt."""
    with open(runtime_config.CONFIG_FILE, "w") as f:
        json.dump({"theme_crt_enabled": False}, f)
    runtime_config._config = None
    assert runtime_config.get("theme_overrides") == {"crt": False}
    with open(runtime_config.CONFIG_FILE) as f:
        assert "theme_crt_enabled" not in json.load(f)


@pytest.mark.asyncio
async def test_crt_alias_write(fresh_config):
    """fold_crt_alias (alias de escritura legacy) actualiza los overrides."""
    merged = await runtime_config.fold_crt_alias(False)
    assert merged == {"crt": False}
    assert runtime_config.get("theme_crt_enabled") is False
    merged = await runtime_config.fold_crt_alias(True)
    assert merged == {"crt": True}


def test_effective_crt_follows_theme_default(fresh_config):
    """Sin override, el CRT efectivo es el default del theme activo."""
    runtime_config.load()
    runtime_config._config["theme"] = "minimal-light"  # crt: off por default
    assert runtime_config.get("theme_crt_enabled") is False
    runtime_config._config["theme"] = "retro-crt"  # crt: on por default
    assert runtime_config.get("theme_crt_enabled") is True
