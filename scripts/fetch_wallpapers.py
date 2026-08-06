#!/usr/bin/env python3
"""Descarga wallpapers de Wallhaven a frontend/src/wallpapers/ (evita duplicados).
Se llama desde build.sh o manualmente: python3 scripts/fetch_wallpapers.py [n]"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "..", "frontend", "src", "wallpapers")
COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 4

os.makedirs(DEST, exist_ok=True)
existing = {f.split(".")[0] for f in os.listdir(DEST) if os.path.isfile(os.path.join(DEST, f))}

UA = {"User-Agent": "Mozilla/5.0"}
QUERIES = [
    "dark+neon",
    "minimalist+dark",
    "cyberpunk",
    "dark+technology",
    "space+dark",
]

def api(query):
    url = f"https://wallhaven.cc/api/v1/search?q={query}&categories=010&purity=100&atleast=1920x1080&sorting=random"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("data", [])

downloaded = 0
for q in QUERIES:
    if downloaded >= COUNT:
        break
    try:
        items = api(q)
    except Exception as e:
        print(f"query {q}: error {e}")
        continue
    for w in items:
        if downloaded >= COUNT:
            break
        wid = w["id"]
        if wid in existing:
            continue
        try:
            req = urllib.request.Request(w["path"], headers=UA)
            data = urllib.request.urlopen(req, timeout=40).read()
            ext = w["path"].split(".")[-1]
            with open(os.path.join(DEST, f"{wid}.{ext}"), "wb") as f:
                f.write(data)
            existing.add(wid)
            downloaded += 1
            print(f"descargado {wid}.{ext} ({len(data)} bytes)")
        except Exception as e:
            print(f"{wid}: error {e}")

print(f"listo: {downloaded} nuevos")
