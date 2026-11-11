"""Asset path resolution for dev and bundled backends.

Spec: release-engineering / Backend macOS autocontenido.
"""
from __future__ import annotations

import sys

from catodo import paths


def test_static_dir_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("CATODO_STATIC_DIR", str(tmp_path / "static"))
    assert paths.static_dir() == tmp_path / "static"


def test_plugins_repo_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("CATODO_PLUGINS_REPO", str(tmp_path / "plugins"))
    assert paths.plugins_repo() == tmp_path / "plugins"


def test_static_dir_uses_meipass(monkeypatch, tmp_path):
    monkeypatch.delenv("CATODO_STATIC_DIR", raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert paths.static_dir() == tmp_path / "static"


def test_plugins_repo_uses_meipass(monkeypatch, tmp_path):
    monkeypatch.delenv("CATODO_PLUGINS_REPO", raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert paths.plugins_repo() == tmp_path / "plugins-repo"


def test_dev_fallbacks(monkeypatch):
    monkeypatch.delenv("CATODO_STATIC_DIR", raising=False)
    monkeypatch.delenv("CATODO_PLUGINS_REPO", raising=False)
    monkeypatch.delattr(sys, "_MEIPASS", raising=False)
    assert paths.static_dir().name == "static"
    assert paths.plugins_repo().name == "plugins-repo"
