# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the self-contained macOS backend bundle."""
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

root = Path(SPECPATH).resolve().parents[1]
backend = root / "backend"
static = backend / "static"
plugins = root / "plugins-repo"
version_file = root / "VERSION"

hiddenimports = []
for module in ("uvicorn", "websockets", "asyncio_mqtt", "paho"):
    hiddenimports += collect_submodules(module)
hiddenimports += collect_submodules("qrcode", filter=lambda name: ".tests" not in name)
hiddenimports += [
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]

a = Analysis(
    [str(root / "packaging/macos/entrypoint.py")],
    pathex=[str(backend)],
    binaries=[],
    datas=[
        (str(static), "static"),
        (str(plugins), "plugins-repo"),
        (str(version_file), "."),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["gi", "tkinter", "pytest", "ruff"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="catodo-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="catodo-backend",
)
