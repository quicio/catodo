"""Test media library scan grouping logic."""
from pathlib import Path

from catodo.media import _scan


def test_scan_groups_episodes(tmp_anime_dir):
    """Series dirs group episodes by series and season."""
    items = _scan(tmp_anime_dir, "series")
    assert len(items) == 3
    series_names = {it["series"] for it in items}
    assert "TestSeries" in series_names
    assert "Other Series" in series_names


def test_scan_movies_flat(tmp_path):
    """Movies kind: each file is an item, flat (no season)."""
    (tmp_path / "Carpeta").mkdir()
    (tmp_path / "Carpeta" / "pelicula.mp4").write_bytes(b"x")
    (tmp_path / "otra.mkv").write_bytes(b"y")
    items = _scan(tmp_path, "movies")
    assert len(items) == 2
    assert all(it["season"] == "" for it in items)
    assert {it["series"] for it in items} == {"Carpeta", "Películas"}


def test_scan_empty_dir(tmp_data_dir):
    """Empty or missing dir returns empty list."""
    items = _scan(Path(tmp_data_dir) / "nonexistent", "series")
    assert items == []
