"""Version contract tests.

Spec: backend-api / Version endpoint; release-engineering / Fuente única de versión.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from catodo import __version__
from catodo.main import app

ROOT = Path(__file__).resolve().parents[2]


def _repo_version() -> str:
    return (ROOT / "VERSION").read_text(encoding="utf-8").strip()


def test_version_endpoint_matches_version_file(tmp_data_dir):
    """Spec: backend-api / Version endpoint — Version matches release."""
    with TestClient(app) as client:
        r = client.get("/api/version")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    assert r.json() == {"version": _repo_version()}


def test_package_version_matches_version_file():
    """Spec: release-engineering / Fuente única de versión."""
    assert __version__ == _repo_version()


def test_cli_version_flag(tmp_data_dir):
    """Spec: release-engineering / Fuente única de versión — catodo --version."""
    proc = subprocess.run(
        [sys.executable, "-m", "catodo", "--version"],
        cwd=ROOT / "backend",
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, proc.stderr
    assert _repo_version() in proc.stdout
