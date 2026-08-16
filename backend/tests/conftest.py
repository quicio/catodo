"""Shared fixtures for Cátodo tests."""
import os
import tempfile
from pathlib import Path

import pytest

# Aislar TODOS los tests del data dir real (~/.local/share/catodo): el data dir
# se calcula al importar `catodo`, así que se define ANTES de que cualquier
# módulo del paquete se importe en la sesión de tests.
_TEST_DATA_DIR = tempfile.mkdtemp(prefix="catodo-test-data-")
os.environ["CATODO_DATA_DIR"] = _TEST_DATA_DIR


@pytest.fixture(autouse=True)
def _isolate_token():
    """Reset CATODO_TOKEN between tests so the token middleware doesn't leak."""
    had = "CATODO_TOKEN" in os.environ
    old = os.environ.pop("CATODO_TOKEN", None)
    yield
    if old is not None:
        os.environ["CATODO_TOKEN"] = old
    elif had:
        os.environ.pop("CATODO_TOKEN", None)


@pytest.fixture(autouse=True)
def _isolate_config():
    """Reset the runtime_config cache AND wipe any persisted config.json so
    each test starts from a clean slate.

    Without this, a test that sets `tunnel_enabled=true` (or any other key)
    would persist its state to the shared module-level data dir and leak
    into the next test (e.g. the next test would unexpectedly require a
    token).

    Tests that need real persistence use the `tmp_data_dir` fixture, which
    overrides CATODO_DATA_DIR for the duration of that test only.
    """
    from catodo import runtime_config
    runtime_config._config = None
    # Wipe any config.json left by a previous test in the global data dir.
    if os.path.isfile(runtime_config.CONFIG_FILE):
        try:
            os.remove(runtime_config.CONFIG_FILE)
        except OSError:
            pass
    yield
    runtime_config._config = None


@pytest.fixture
def tmp_data_dir():
    """Temporary data dir that does not touch the real ~/.local/share/catodo."""
    with tempfile.TemporaryDirectory() as td:
        orig = os.environ.get("CATODO_DATA_DIR")
        os.environ["CATODO_DATA_DIR"] = td
        try:
            yield td
        finally:
            if orig:
                os.environ["CATODO_DATA_DIR"] = orig
            else:
                del os.environ["CATODO_DATA_DIR"]


@pytest.fixture
def tmp_anime_dir():
    """Temporary anime directory with a few test files."""
    with tempfile.TemporaryDirectory() as td:
        base = Path(td)
        (base / "TestSeries").mkdir()
        (base / "TestSeries" / "sub.mkv").write_bytes(b"fakevideo")
        (base / "TestSeries" / "ep2.mp4").write_bytes(b"fakevideo2")
        (base / "Other Series" / "S2").mkdir(parents=True)
        (base / "Other Series" / "S2" / "ep1.webm").write_bytes(b"fakevideo3")
        yield base
