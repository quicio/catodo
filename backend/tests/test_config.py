"""Test runtime config and store."""
import os

import pytest

from catodo import runtime_config, store


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
