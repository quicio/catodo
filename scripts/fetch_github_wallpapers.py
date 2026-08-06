#!/usr/bin/env python3
"""Descarga wallpapers generales del repo Wall-E-Desk (JoshuaThadi) al data dir.
Uso: python3 scripts/fetch_github_wallpapers.py [n] [carpeta...]
"""
import json
import os
import random
import sys
import urllib.request

from catodo.datadir import WALLPAPER_DIR, ensure_dirs

REPO = "JoshuaThadi/Wall-E-Desk"
FOLDERS = ["Sci-Fi", "landscape-nature", "Anime", "landscape-anime", "Pixel-Art"]
COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 20
if len(sys.argv) > 2:
    FOLDERS = sys.argv[2:]

UA = {"User-Agent": "Mozilla/5.0"}


def list_files(folder: str) -> list[str]:
    url = f"https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(folder)}"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        items = json.load(r)
    return [x["name"] for x in items if x["type"] == "file"]


def raw_url(folder: str, name: str) -> str:
    return f"https://raw.githubusercontent.com/{REPO}/main/{urllib.parse.quote(folder)}/{urllib.parse.quote(name)}"


def main():
    ensure_dirs()
    existing = {f for f in os.listdir(WALLPAPER_DIR)}
    # recopilar candidatos
    candidates: list[tuple[str, str]] = []  # (carpeta, archivo)
    for folder in FOLDERS:
        try:
            files = list_files(folder)
            for f in files:
                if f not in existing:
                    candidates.append((folder, f))
        except Exception as e:
            print(f"carpeta {folder}: error {e}")
    random.shuffle(candidates)

    got = 0
    for folder, name in candidates:
        if got >= COUNT:
            break
        try:
            req = urllib.request.Request(raw_url(folder, name), headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            dest = os.path.join(WALLPAPER_DIR, f"wall-e_{folder}_{name}")
            with open(dest, "wb") as f:
                f.write(data)
            got += 1
            print(f"descargado: {folder}/{name} ({len(data)} bytes)")
        except Exception as e:
            print(f"{folder}/{name}: error {e}")

    print(f"listo: {got} nuevos")


if __name__ == "__main__":
    import urllib.parse
    main()
