"""Plugin system — canales declarativos instalables (inspirado en Kodi addons).

Un plugin es un directorio `plugins/<id>/` con un `manifest.json` que describe
un canal web (url, user_agent, partition, color, order). Fase 1: solo canales
`web` declarativos; no se ejecuta código del plugin.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import zipfile
from urllib.request import urlopen

from catodo.channel import Channel
from catodo.datadir import DATA_DIR, ensure_dirs

log = logging.getLogger("catodo.plugins")

CATODO_VERSION = "0.1.0"
SUPPORTED_TYPES = ("web",)
UA_ALIASES = {"default": None, "chrome": "chrome", "android-tv": "android-tv"}

PLUGINS_DIR = os.path.join(DATA_DIR, "plugins")
STATE_FILE = os.path.join(DATA_DIR, "plugins.json")
VENV_DIR = os.path.join(DATA_DIR, "plugin-venv")
REPO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "plugins-repo")

_REQUIRED = ("id", "name", "version", "type")


def _default_partition(plugin_id: str) -> str:
    return f"persist:{plugin_id}"


def validate_manifest(m: dict) -> tuple[bool, str]:
    """Valida un manifest. Devuelve (ok, detalle de error)."""
    for field in _REQUIRED:
        if not m.get(field):
            return False, f"missing required field: {field}"
    if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", str(m["id"])):
        return False, f"invalid id: {m['id']} (use kebab-case)"
    if m["type"] not in SUPPORTED_TYPES:
        return False, f"unsupported type: {m['type']} (supported: {', '.join(SUPPORTED_TYPES)})"
    if m["type"] == "web" and not m.get("url"):
        return False, "web channel requires 'url'"
    if not re.match(r"^\d+\.\d+\.\d+", str(m["version"])):
        return False, f"invalid version: {m['version']} (semver required)"
    return True, ""


def _semver_tuple(v: str) -> tuple[int, int, int]:
    parts = re.split(r"[^\d]+", v)[:3]
    while len(parts) < 3:
        parts.append("0")
    return tuple(int(x or 0) for x in parts)


def _requires_ok(requires: dict, current: str) -> bool:
    if not isinstance(requires, dict):
        return True
    cur = _semver_tuple(current)
    lo = requires.get("min")
    hi = requires.get("max")
    if lo and _semver_tuple(str(lo)) > cur:
        return False
    if hi and _semver_tuple(str(hi)) < cur:
        return False
    return True


class DeclarativeWebChannel(Channel):
    """Canal web construido a partir de un manifest de plugin."""

    type = "web"

    def __init__(self, manifest: dict) -> None:
        self._manifest = manifest
        self.id = str(manifest["id"])
        self.name = str(manifest["name"])
        self.icon = str(manifest.get("icon", "web"))
        self.color = str(manifest.get("color", "#ffffff"))
        self.order = manifest.get("order")
        self._open = False
        self._current_url: str | None = None

    @property
    def _url(self) -> str:
        from catodo import runtime_config

        override = runtime_config.get(f"channel_{self.id}_url")
        if override:
            return override
        legacy = self._manifest.get("config_key")
        if legacy:
            return runtime_config.get(legacy) or self._manifest.get("url", "")
        return self._manifest.get("url", "")

    @property
    def partition(self) -> str:
        return str(self._manifest.get("partition") or _default_partition(self.id))

    @property
    def user_agent(self) -> str:
        ua = self._manifest.get("user_agent", "default")
        return ua if ua in UA_ALIASES else "default"

    @property
    def media_keys(self) -> dict:
        """Mapeo de acciones media → tecla a inyectar en el webview (por manifest)."""
        return dict(self._manifest.get("media_keys") or {})

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["color"] = self.color
        d["partition"] = self.partition
        d["user_agent"] = self.user_agent
        d["media_keys"] = self.media_keys
        if self.order is not None:
            d["order"] = self.order
        return d

    async def open(self) -> None:
        self._open = True

    async def close(self) -> None:
        self._open = False

    async def state(self) -> dict:
        return {
            "id": self.id,
            "open": self._open,
            "url": self._current_url or self._url,
            "configured_url": self._url,
            "partition": self.partition,
            "user_agent": self.user_agent,
        }

    def _same_host(self, url: str) -> bool:
        from urllib.parse import urlparse

        try:
            return urlparse(url).netloc == urlparse(self._manifest.get("url", "")).netloc
        except Exception:
            return False

    async def command(self, cmd: str, **kwargs) -> None:
        if cmd == "set_url":
            from catodo import runtime_config

            await runtime_config.set(f"channel_{self.id}_url", kwargs.get("url", self._url))
        elif cmd == "navigate":
            url = kwargs.get("url", "")
            # Evitar polución cruzada: solo aceptar navegaciones al host del canal
            if self._same_host(url):
                self._current_url = url
            else:
                log.warning("plugin %s ignora navegación a host ajeno: %s", self.id, url)
        else:
            log.info("plugin channel %s passthrough: %s %s", self.id, cmd, kwargs)


def sort_channels(channels: list[Channel]) -> list[Channel]:
    """Orden estable: primero los que tienen `order`, luego por nombre."""
    def key(c: Channel) -> tuple:
        return (c.order is None, c.order if c.order is not None else 10**9, c.name.lower())

    return sorted(channels, key=key)


class PluginManager:
    """Gestiona instalación, estado y carga de plugins en el data dir."""

    def __init__(self, plugins_dir: str = PLUGINS_DIR, state_file: str = STATE_FILE,
                 venv_dir: str = VENV_DIR, repo: str | None = None) -> None:
        self.plugins_dir = plugins_dir
        self.state_file = state_file
        self.venv_dir = venv_dir
        self.repo = repo or self._default_repo()
        self._state: dict | None = None

    @staticmethod
    def _default_repo() -> str:
        from catodo import runtime_config

        return (
            runtime_config.get("plugin_repo")
            or os.getenv("CATODO_PLUGIN_REPO")
            or REPO_DIR
        )

    # ---- estado ----

    def _load_state(self) -> dict:
        if self._state is not None:
            return self._state
        if os.path.isfile(self.state_file):
            try:
                with open(self.state_file) as f:
                    self._state = json.load(f)
            except Exception as e:
                log.warning("plugins state corrupt, starting fresh: %s", e)
                self._state = {}
        else:
            self._state = {}
        return self._state

    def _save_state(self) -> None:
        ensure_dirs()
        tmp = self.state_file + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self._load_state(), f, indent=2, ensure_ascii=False)
        os.replace(tmp, self.state_file)

    def _manifest_path(self, plugin_id: str) -> str:
        return os.path.join(self.plugins_dir, plugin_id, "manifest.json")

    def _read_manifest(self, plugin_id: str) -> dict | None:
        path = self._manifest_path(plugin_id)
        if not os.path.isfile(path):
            return None
        try:
            with open(path) as f:
                return json.load(f)
        except Exception as e:
            log.warning("plugin %s manifest unreadable: %s", plugin_id, e)
            return None

    # ---- inspección ----

    def list_plugins(self) -> list[dict]:
        """Lista de plugins instalados con su estado."""
        ensure_dirs()
        result = []
        if not os.path.isdir(self.plugins_dir):
            return result
        for entry in sorted(os.listdir(self.plugins_dir)):
            path = os.path.join(self.plugins_dir, entry)
            if not os.path.isdir(path) or not os.path.isfile(os.path.join(path, "manifest.json")):
                continue
            m = self._read_manifest(entry)
            state = self._load_state().get(entry, {})
            result.append({
                "id": entry,
                "name": m.get("name", entry) if m else entry,
                "version": m.get("version", "?") if m else "?",
                "type": m.get("type", "?") if m else "?",
                "enabled": bool(state.get("enabled", True)),
                "origin": state.get("origin", "local"),
                "valid": bool(m),
            })
        return result

    def get_plugin(self, plugin_id: str) -> dict | None:
        for p in self.list_plugins():
            if p["id"] == plugin_id:
                return p
        return None

    # ---- carga ----

    def scan(self) -> list[DeclarativeWebChannel]:
        """Devuelve los canales de plugins habilitados y válidos."""
        channels: list[DeclarativeWebChannel] = []
        for entry in self.list_plugins():
            if not entry["valid"] or not entry["enabled"]:
                continue
            m = self._read_manifest(entry["id"])
            if m and validate_manifest(m)[0]:
                channels.append(DeclarativeWebChannel(m))
        return channels

    def _seed_bundled(self) -> None:
        """Instala los plugins bundled del repo por defecto que falten."""
        try:
            index = self._repo_index()
        except Exception as e:
            log.warning("could not read bundled repo: %s", e)
            return
        for entry in index.get("plugins", []):
            if entry.get("bundled") and entry.get("id") not in self._load_state():
                self.install(str(entry["id"]))

    # ---- repo ----

    def _repo_index(self) -> dict:
        base = self.repo.rstrip("/")
        url = base if base.startswith("http") else f"file://{base}"
        try:
            with urlopen(f"{url}/index.json", timeout=10) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            raise RuntimeError(f"could not read plugin repo at {self.repo}: {e}") from e

    def _find_repo_entry(self, plugin_id: str) -> dict:
        index = self._repo_index()
        for entry in index.get("plugins", []):
            if entry.get("id") == plugin_id:
                return entry
        raise KeyError(f"plugin not found in repo: {plugin_id}")

    def install(self, plugin_id: str) -> dict:
        """Instala un plugin desde el repo configurado."""
        entry = self._find_repo_entry(plugin_id)
        if not _requires_ok(entry.get("requires_catodo", {}), CATODO_VERSION):
            raise RuntimeError(f"plugin {plugin_id} requires incompatible Cátodo version")
        target = os.path.join(self.plugins_dir, plugin_id)
        ensure_dirs()
        if os.path.isdir(target):
            shutil.rmtree(target)

        if entry.get("path"):
            src = entry["path"]
            if not os.path.isabs(src):
                src = os.path.join(self.repo, src)
            if not os.path.isdir(src):
                raise RuntimeError(f"bundled plugin path missing: {src}")
            shutil.copytree(src, target)
        elif entry.get("url"):
            data = self._download(entry["url"])
            if entry.get("sha256"):
                digest = hashlib.sha256(data).hexdigest()
                if digest != entry["sha256"].lower():
                    raise RuntimeError(f"checksum mismatch for {plugin_id}")
            if os.path.isdir(target):
                shutil.rmtree(target)
            with zipfile.ZipFile(__import__("io").BytesIO(data)) as z:
                z.extractall(target)
        else:
            raise RuntimeError(f"repo entry for {plugin_id} has no url or path")

        m = self._read_manifest(plugin_id)
        if not m or not validate_manifest(m)[0]:
            shutil.rmtree(target, ignore_errors=True)
            raise RuntimeError(f"installed plugin {plugin_id} has an invalid manifest")

        state = self._load_state()
        state[plugin_id] = {
            "enabled": True,
            "installed_version": m["version"],
            "origin": entry.get("origin", "repo"),
            "deps_ready": False,
        }
        self._save_state()
        self.ensure_dependencies(m)
        log.info("installed plugin %s v%s", plugin_id, m["version"])
        return self.get_plugin(plugin_id) or {"id": plugin_id}

    @staticmethod
    def _download(url: str) -> bytes:
        with urlopen(url, timeout=30) as r:
            return r.read()

    # ---- gestion ----

    def remove(self, plugin_id: str) -> None:
        state = self._load_state()
        if plugin_id in state:
            del state[plugin_id]
            self._save_state()
        target = os.path.join(self.plugins_dir, plugin_id)
        if os.path.isdir(target):
            shutil.rmtree(target, ignore_errors=True)

    def set_enabled(self, plugin_id: str, enabled: bool) -> None:
        m = self._read_manifest(plugin_id)
        if m is None:
            raise KeyError(plugin_id)
        state = self._load_state()
        entry = state.setdefault(plugin_id, {})
        entry["enabled"] = enabled
        entry["installed_version"] = m.get("version", entry.get("installed_version", "?"))
        self._save_state()
        if enabled:
            self.ensure_dependencies(m)

    # ---- dependencias (provisioning) ----

    def ensure_dependencies(self, manifest: dict) -> bool:
        """Instala las deps declaradas en el venv de plugins. Devuelve True si están listas."""
        plugin_id = str(manifest["id"])
        deps = manifest.get("dependencies") or []
        state = self._load_state()
        entry = state.setdefault(plugin_id, {})
        if not deps:
            entry["deps_ready"] = True
            self._save_state()
            return True
        if entry.get("deps_ready"):
            return True
        try:
            python = os.path.join(self.venv_dir, "bin", "python")
            if not os.path.isfile(python):
                self._run(["uv", "venv", self.venv_dir])
            self._run(["uv", "pip", "install", "--python", python, *deps])
            entry["deps_ready"] = True
            self._save_state()
            log.info("plugin %s deps installed: %s", plugin_id, ", ".join(deps))
            return True
        except Exception as e:
            log.warning("plugin %s deps failed (%s); reinstall or set deps_ready", plugin_id, e)
            return False

    @staticmethod
    def _run(cmd: list[str]) -> None:
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"{' '.join(cmd)} failed: {proc.stderr[-300:]}")

    def ensure_all_dependencies(self) -> None:
        if os.getenv("CATODO_PLUGIN_AUTOINSTALL", "1") == "0":
            for p in self.list_plugins():
                if p["enabled"]:
                    m = self._read_manifest(p["id"])
                    if m and m.get("dependencies"):
                        log.info("plugin %s deps missing (autoinstall off)", p["id"])
            return
        for p in self.list_plugins():
            if not p["enabled"]:
                continue
            m = self._read_manifest(p["id"])
            if m and m.get("dependencies"):
                self.ensure_dependencies(m)


def get_plugin_manager() -> PluginManager:
    return PluginManager()


def load_plugin_channels() -> list[DeclarativeWebChannel]:
    pm = get_plugin_manager()
    pm._seed_bundled()
    return pm.scan()


def run_cli(args) -> None:
    pm = get_plugin_manager()
    action = args.action
    if action == "list":
        plugins = pm.list_plugins()
        if not plugins:
            print("No hay plugins instalados.")
            return
        print(f"{'ID':<16}{'NOMBRE':<24}{'VERS':<10}{'ESTADO':<10}{'ORIGEN'}")
        for p in plugins:
            estado = "on" if p["enabled"] else "off"
            print(f"{p['id']:<16}{p['name']:<24}{p['version']:<10}{estado:<10}{p['origin']}")
    elif action == "install":
        try:
            pm.install(args.id)
            print(f"Instalado: {args.id}")
        except Exception as e:
            print(f"Error: {e}")
            raise SystemExit(1) from e
    elif action == "remove":
        pm.remove(args.id)
        print(f"Removido: {args.id}")
    elif action == "enable":
        pm.set_enabled(args.id, True)
        print(f"Habilitado: {args.id}")
    elif action == "disable":
        pm.set_enabled(args.id, False)
        print(f"Deshabilitado: {args.id}")
    else:
        raise SystemExit("usage: catodo plugin [list|install|remove|enable|disable]")
