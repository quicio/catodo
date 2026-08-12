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
