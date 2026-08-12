"""Comandos de voz — traduce texto transcrito a intenciones/acciones de Cátodo.

El reconocimiento de voz (STT) queda fuera de alcance: este módulo recibe el
texto ya transcrito y lo interpreta (canal por nombre/número, verbos).
"""
from __future__ import annotations

import re
import unicodedata


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


_INTRO = re.compile(
    r"^(pon|pone|abri|abre|enciende|prende|mira|pasa|pas|ponle|dale)\b\s+",
    re.IGNORECASE,
)
_NUM_RE = re.compile(
    r"(?:canal|channel|el|al|a)\s+(\d+|uno|dos|tres|cuatro|cinco|seis)",
    re.IGNORECASE,
)
_NUMBERS = {
    "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6,
    "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
}

_UP_WORDS = ("sub", "aument", "arriba", "más volumen", "mas volumen", "alto")
_DOWN_WORDS = ("baj", "disminu", "abajo", "menos", "bajo")


def match_verb(text: str) -> str | None:
    """Devuelve una acción de verbo o None."""
    t = normalize(text)
    if "volumen" in t:
        if any(w in t for w in _UP_WORDS):
            return "volume_up"
        if any(w in t for w in _DOWN_WORDS):
            return "volume_down"
    if "siguiente" in t or "adelante" in t or "otro canal" in t:
        return "next"
    if "anterior" in t or "atras" in t or "volver" in t:
        return "prev"
    if "pausa" in t or "pause" in t:
        return "pause"
    if "play" in t or "reproduc" in t or "segui" in t:
        return "play"
    if "inicio" in t or "principal" in t or "home" in t:
        return "home"
    if "pantalla" in t or "proyect" in t:
        return "screen"
    return None


def _channel_by_number(text: str, channels: list[dict]) -> dict | None:
    m = _NUM_RE.search(normalize(text))
    if not m:
        return None
    token = m.group(1)
    idx = _NUMBERS.get(token, int(token) if token.isdigit() else None)
    if not idx or idx < 1:
        return None
    idx -= 1
    return channels[idx] if idx < len(channels) else None


def _channel_by_name(text: str, channels: list[dict]) -> dict | None:
    stripped = _INTRO.sub("", normalize(text)).strip()
    if not stripped:
        return None
    best, best_len = None, 0
    for ch in channels:
        name = normalize(ch.get("name", ""))
        if name and name in stripped and len(name) > best_len:
            best, best_len = ch, len(name)
    return best


def match(text: str, channels: list[dict]) -> dict:
    """Interpreta texto → intención: {recognized, action, channel}."""
    verb = match_verb(text)
    if verb:
        return {"recognized": True, "action": verb, "channel": None}
    ch = _channel_by_number(text, channels)
    if ch:
        return {"recognized": True, "action": "open", "channel": ch["id"]}
    ch = _channel_by_name(text, channels)
    if ch:
        return {"recognized": True, "action": "open", "channel": ch["id"]}
    return {"recognized": False, "action": None, "channel": None}
