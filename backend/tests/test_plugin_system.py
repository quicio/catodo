"""Plugin system — manifests, loader, CLI de gestión y API."""
import io
import json
import os
import tempfile
import zipfile

import pytest
from fastapi.testclient import TestClient

from catodo.main import app
from catodo.plugin_system import (
    DeclarativeWebChannel,
    PluginManager,
    sort_channels,
    validate_manifest,
)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _write_repo(base, plugin_id, manifest, bundled=True, checksum=None):
    repo = os.path.join(base, "repo")
    os.makedirs(os.path.join(repo, plugin_id), exist_ok=True)
    with open(os.path.join(repo, plugin_id, "manifest.json"), "w") as f:
        json.dump(manifest, f)
    entry = {
        "id": plugin_id,
        "name": manifest["name"],
        "version": manifest["version"],
        "bundled": bundled,
        "origin": "bundled" if bundled else "repo",
        "path": plugin_id,
        "requires_catodo": {"min": "0.1.0"},
    }
    if checksum is not None:
        entry["checksum"] = checksum
    with open(os.path.join(repo, "index.json"), "w") as f:
        json.dump({"plugins": [entry]}, f)
    return repo


def _manager(base, repo):
    return PluginManager(
        plugins_dir=os.path.join(base, "plugins"),
        state_file=os.path.join(base, "plugins.json"),
        venv_dir=os.path.join(base, "venv"),
        repo=repo,
    )


WEB_MANIFEST = {
    "id": "foo",
    "name": "Foo",
    "version": "1.0.0",
    "type": "web",
    "icon": "play",
    "color": "#123456",
    "url": "https://foo.tv",
    "user_agent": "android-tv",
    "partition": "persist:foo",
    "order": 5,
}


def test_validate_manifest():
    """Spec: plugin-system / Manifest inválido se rechaza."""
    assert validate_manifest({"id": "x"})[0] is False
    assert validate_manifest({"id": "Foo", "name": "x", "version": "1.0.0", "type": "web"})[0] is False
    assert validate_manifest({"id": "foo", "name": "x", "version": "1.0.0", "type": "media"})[0] is False
    assert validate_manifest({"id": "foo", "name": "x", "version": "1.0.0", "type": "web"})[0] is False
    ok, _ = validate_manifest(WEB_MANIFEST)
    assert ok


def test_seed_bundled_scan_enable_disable_remove(tmp_path):
    """Spec: plugin-system / Ciclo de vida de un plugin."""
    repo = _write_repo(str(tmp_path), "foo", WEB_MANIFEST)
    pm = _manager(str(tmp_path), repo)
    pm._seed_bundled()
    chans = pm.scan()
    assert [c.id for c in chans] == ["foo"]
    assert pm.list_plugins()[0]["enabled"] is True

    pm.set_enabled("foo", False)
    assert pm.scan() == []
    pm.set_enabled("foo", True)
    assert len(pm.scan()) == 1

    pm.remove("foo")
    assert pm.get_plugin("foo") is None


def test_install_checksum_mismatch_aborts(tmp_path):
    """Spec: plugin-system / Checksum que no coincide aborta la instalación."""
    # repo con un entry que apunta a un zip local con sha256 incorrecto
    repo = os.path.join(str(tmp_path), "repo")
    os.makedirs(repo, exist_ok=True)
    zip_bytes = io.BytesIO()
    with zipfile.ZipFile(zip_bytes, "w") as z:
        z.writestr("manifest.json", json.dumps(WEB_MANIFEST))
    bad = "0" * 64
    with open(os.path.join(repo, "index.json"), "w") as f:
        json.dump({
            "plugins": [{
                "id": "foo", "name": "Foo", "version": "1.0.0",
                "url": f"file://{os.path.join(repo, 'foo.zip')}",
                "sha256": bad, "requires_catodo": {"min": "0.1.0"},
            }]
        }, f)
    with open(os.path.join(repo, "foo.zip"), "wb") as f:
        f.write(zip_bytes.getvalue())

    pm = _manager(str(tmp_path), repo)
    try:
        pm.install("foo")
        assert False, "should have raised on checksum mismatch"
    except RuntimeError as e:
        assert "checksum" in str(e)


def test_sort_channels_uses_order():
    """Spec: channel-system / Orden estable por (order, nombre)."""
    a = DeclarativeWebChannel({**WEB_MANIFEST, "id": "a", "name": "A", "order": 3})
    b = DeclarativeWebChannel({**WEB_MANIFEST, "id": "b", "name": "B", "order": 1})
    c = DeclarativeWebChannel({**WEB_MANIFEST, "id": "c", "name": "C"})
    assert [x.id for x in sort_channels([a, b, c])] == ["b", "a", "c"]


def test_web_channel_state_and_dict():
    """Spec: plugin-system / Canal web declarativo expone url/partition/UA."""
    ch = DeclarativeWebChannel(WEB_MANIFEST)
    d = ch.to_dict()
    assert d["id"] == "foo" and d["type"] == "web"
    assert d["color"] == "#123456"
    assert d["partition"] == "persist:foo"
    assert d["user_agent"] == "android-tv"


def test_plugins_api(client):
    """Spec: plugin-system / API list + enable/disable de un plugin."""
    with tempfile.TemporaryDirectory() as td:
        repo = _write_repo(td, "bar", {**WEB_MANIFEST, "id": "bar", "name": "Bar", "order": 9})
        pm = _manager(td, repo)
        pm._seed_bundled()
        client.app.state.plugins = pm

        r = client.get("/api/plugins")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert "bar" in ids

        r = client.post("/api/plugins/bar/disable")
        assert r.status_code == 200
        assert client.get("/api/plugins").json()[0]["enabled"] is False

        r = client.post("/api/plugins/bar/enable")
        assert r.status_code == 200
        assert client.get("/api/plugins").json()[0]["enabled"] is True

        r = client.post("/api/plugins/nonexistent/disable")
        assert r.status_code == 404
