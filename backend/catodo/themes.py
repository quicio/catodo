"""Appearance system — themes multidimensionales (v2).

Un theme v2 tiene seis dimensiones:
    {
        "id": str,
        "name": str,
        "colorScheme": "dark" | "light",
        "colors":    { bg, surface, text, textDim, textFaint, accent,
                       accentSoft, border, danger, success, chSpotify,
                       chYoutube, chTv, chAnime, chCrunchyroll, chArcade },
        "typography": { "display": <font-id>, "mono": <font-id> },
        "shape":      "square" | "rounded" | "pill",
        "density":    "compact" | "comfortable" | "spacious",
        "effects":    { "crt": bool, "glow": bool },
        "icons":      <icon-pack-id>,
    }

Compatibilidad v1: se aceptan themes con "tokens" (→ colors) y "crt" a nivel
raíz (→ effects.crt). Los custom themes pueden declarar "base": <theme-id> y
definir solo lo que cambian; todo lo ausente hereda del base. Los themes se
sirven siempre RESUELTOS (herencia aplicada, seis dimensiones completas).
"""
from __future__ import annotations

import logging
import re

log = logging.getLogger("catodo.themes")

DEFAULT_THEME_ID = "spotify-dark"

COLOR_KEYS = (
    "bg", "surface", "text", "textDim", "textFaint",
    "accent", "accentSoft", "border", "danger", "success",
    "chSpotify", "chYoutube", "chTv", "chAnime", "chCrunchyroll", "chArcade",
)

# Registro de fuentes bundleadas en el frontend (fontsource).
FONTS = (
    "space-grotesk", "jetbrains-mono", "inter", "nunito",
    "oswald", "orbitron", "vt323", "ibm-plex-mono",
)

# Packs de iconos bundleados en el frontend (react-icons + morphicons).
ICON_PACKS = (
    "lucide", "game-icons", "feather", "phosphor", "material",
    "ionicons", "bootstrap", "codicons", "tabler", "radix",
)

SHAPES = ("square", "rounded", "pill")
DENSITIES = ("compact", "comfortable", "spacious")

_COLOR_RE = re.compile(
    r"^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*){2,3}\)"
    r"|hsla?\(\s*[\d.]+(deg)?\s*(?:,\s*[\d.]+%\s*){2}(?:,\s*[\d.]+%?\s*)?\))$"
)


def _valid_color(v) -> bool:
    return isinstance(v, str) and bool(_COLOR_RE.match(v.strip()))


# ---------------------------------------------------------------------------
# Built-in themes (10) — tabla de design.md
# ---------------------------------------------------------------------------

def _ch(spotify="#1db954", youtube="#ff0033", tv="#4d7cff",
        anime="#ffd166", crunchyroll="#f47521", arcade="#b66dff") -> dict:
    return {
        "chSpotify": spotify, "chYoutube": youtube, "chTv": tv,
        "chAnime": anime, "chCrunchyroll": crunchyroll, "chArcade": arcade,
    }


BUILTIN_THEMES: list[dict] = [
    {
        "id": "spotify-dark",
        "name": "Spotify Dark",
        "colorScheme": "dark",
        "colors": {
            "bg": "#0a0a0a", "surface": "#181818", "text": "#f5f5f5",
            "textDim": "rgba(255,255,255,0.6)", "textFaint": "rgba(255,255,255,0.35)",
            "accent": "#1db954", "accentSoft": "#4dffb1",
            "border": "rgba(255,255,255,0.15)", "danger": "#ff6b6b", "success": "#1db954",
            **_ch(),
        },
        "typography": {"display": "space-grotesk", "mono": "jetbrains-mono"},
        "shape": "rounded",
        "density": "comfortable",
        "effects": {"crt": True, "glow": False},
        "icons": "lucide",
    },
    {
        "id": "retro-crt",
        "name": "Retro CRT",
        "colorScheme": "dark",
        "colors": {
            "bg": "#050505", "surface": "#141414", "text": "#e6ffd6",
            "textDim": "rgba(230,255,214,0.6)", "textFaint": "rgba(230,255,214,0.35)",
            "accent": "#00ff9c", "accentSoft": "#7dffd0",
            "border": "rgba(0,255,156,0.35)", "danger": "#ff5f56", "success": "#00ff9c",
            **_ch(spotify="#00ff9c", youtube="#ff5f56"),
        },
        "typography": {"display": "vt323", "mono": "vt323"},
        "shape": "square",
        "density": "comfortable",
        "effects": {"crt": True, "glow": True},
        "icons": "game-icons",
    },
    {
        "id": "minimal-light",
        "name": "Minimal Light",
        "colorScheme": "light",
        "colors": {
            "bg": "#f2f2f2", "surface": "#ffffff", "text": "#111111",
            "textDim": "rgba(0,0,0,0.6)", "textFaint": "rgba(0,0,0,0.35)",
            "accent": "#0a7c3f", "accentSoft": "#2fae62",
            "border": "rgba(0,0,0,0.15)", "danger": "#d64545", "success": "#0a7c3f",
            **_ch(spotify="#0a7c3f", youtube="#cc0000", tv="#2b4dcc",
                  anime="#b8860b", crunchyroll="#e05a1f", arcade="#6a3fc4"),
        },
        "typography": {"display": "inter", "mono": "jetbrains-mono"},
        "shape": "rounded",
        "density": "comfortable",
        "effects": {"crt": False, "glow": False},
        "icons": "feather",
    },
    {
        "id": "orbital-blue",
        "name": "Orbital Blue",
        "colorScheme": "dark",
        "colors": {
            "bg": "#04060f", "surface": "#0d1526", "text": "#e8f0ff",
            "textDim": "rgba(232,240,255,0.6)", "textFaint": "rgba(232,240,255,0.35)",
            "accent": "#4d7cff", "accentSoft": "#8ab4ff",
            "border": "rgba(77,124,255,0.35)", "danger": "#ff5f6e", "success": "#3ddc97",
            **_ch(youtube="#ff3d5a"),
        },
        "typography": {"display": "orbitron", "mono": "jetbrains-mono"},
        "shape": "pill",
        "density": "spacious",
        "effects": {"crt": False, "glow": True},
        "icons": "phosphor",
    },
    {
        "id": "estuary",
        "name": "Estuary",
        "colorScheme": "dark",
        "colors": {
            "bg": "#0e151a", "surface": "#1a232a", "text": "#f2f6f8",
            "textDim": "rgba(242,246,248,0.6)", "textFaint": "rgba(242,246,248,0.35)",
            "accent": "#12b2e7", "accentSoft": "#6fd3f2",
            "border": "rgba(255,255,255,0.12)", "danger": "#e05252", "success": "#4cc38a",
            **_ch(),
        },
        "typography": {"display": "oswald", "mono": "jetbrains-mono"},
        "shape": "square",
        "density": "compact",
        "effects": {"crt": False, "glow": False},
        "icons": "material",
    },
    {
        "id": "smart-tv-coral",
        "name": "Smart TV Coral",
        "colorScheme": "dark",
        "colors": {
            "bg": "#101014", "surface": "#1c1c22", "text": "#f5f5f7",
            "textDim": "rgba(245,245,247,0.6)", "textFaint": "rgba(245,245,247,0.35)",
            "accent": "#ff5a5f", "accentSoft": "#ff9a9e",
            "border": "rgba(255,255,255,0.12)", "danger": "#ff3b30", "success": "#34c759",
            **_ch(),
        },
        "typography": {"display": "nunito", "mono": "jetbrains-mono"},
        "shape": "pill",
        "density": "spacious",
        "effects": {"crt": False, "glow": False},
        "icons": "ionicons",
    },
    {
        "id": "cone-orange",
        "name": "Cone Orange",
        "colorScheme": "dark",
        "colors": {
            "bg": "#0c0c0c", "surface": "#1a1a1a", "text": "#fafafa",
            "textDim": "rgba(250,250,250,0.6)", "textFaint": "rgba(250,250,250,0.35)",
            "accent": "#ff7f00", "accentSoft": "#ffab4d",
            "border": "rgba(255,255,255,0.14)", "danger": "#e5484d", "success": "#46a758",
            **_ch(),
        },
        "typography": {"display": "inter", "mono": "jetbrains-mono"},
        "shape": "rounded",
        "density": "compact",
        "effects": {"crt": False, "glow": False},
        "icons": "bootstrap",
    },
    {
        "id": "amber-vintage",
        "name": "Amber Vintage",
        "colorScheme": "dark",
        "colors": {
            "bg": "#0a0800", "surface": "#1a1405", "text": "#ffb000",
            "textDim": "rgba(255,176,0,0.65)", "textFaint": "rgba(255,176,0,0.35)",
            "accent": "#ffb000", "accentSoft": "#ffcf6b",
            "border": "rgba(255,176,0,0.35)", "danger": "#ff5f56", "success": "#ffb000",
            **_ch(spotify="#ffb000", youtube="#ff5f56", tv="#ffd166",
                  anime="#ffe08a", crunchyroll="#ff9e3d", arcade="#d89000"),
        },
        "typography": {"display": "ibm-plex-mono", "mono": "ibm-plex-mono"},
        "shape": "square",
        "density": "comfortable",
        "effects": {"crt": True, "glow": True},
        "icons": "codicons",
    },
    {
        "id": "cyber-neon",
        "name": "Cyber Neon",
        "colorScheme": "dark",
        "colors": {
            "bg": "#05060f", "surface": "#10121f", "text": "#eaf6ff",
            "textDim": "rgba(234,246,255,0.6)", "textFaint": "rgba(234,246,255,0.35)",
            "accent": "#00e5ff", "accentSoft": "#ff4dd8",
            "border": "rgba(0,229,255,0.3)", "danger": "#ff3366", "success": "#00ffa3",
            **_ch(spotify="#00ffa3", youtube="#ff3366", tv="#00b3ff",
                  anime="#ffe74d", crunchyroll="#ff7b4d", arcade="#c04dff"),
        },
        "typography": {"display": "orbitron", "mono": "jetbrains-mono"},
        "shape": "rounded",
        "density": "compact",
        "effects": {"crt": False, "glow": True},
        "icons": "tabler",
    },
    {
        "id": "paper-mono",
        "name": "Paper Mono",
        "colorScheme": "light",
        "colors": {
            "bg": "#f4f2ee", "surface": "#ffffff", "text": "#1a1a1a",
            "textDim": "rgba(26,26,26,0.6)", "textFaint": "rgba(26,26,26,0.35)",
            "accent": "#222226", "accentSoft": "#55555a",
            "border": "rgba(26,26,26,0.16)", "danger": "#b3261e", "success": "#2e6b34",
            **_ch(spotify="#1e7d46", youtube="#b3271e", tv="#2b4dcc",
                  anime="#8a6d1a", crunchyroll="#c2521a", arcade="#5b3aa8"),
        },
        "typography": {"display": "inter", "mono": "jetbrains-mono"},
        "shape": "square",
        "density": "comfortable",
        "effects": {"crt": False, "glow": False},
        "icons": "radix",
    },
]

_BUILTIN_IDS = {t["id"] for t in BUILTIN_THEMES}
_DEFAULT = BUILTIN_THEMES[0]


# ---------------------------------------------------------------------------
# Resolución / validación
# ---------------------------------------------------------------------------

def _reject(theme_id, reason: str) -> None:
    log.warning("theme %r rechazado: %s", theme_id, reason)


def _resolve(t: dict, base: dict) -> dict | None:
    """Resuelve un theme custom sobre su base. None si es inválido."""
    tid = t.get("id")
    if not isinstance(tid, str) or not tid:
        _reject(tid, "id ausente o inválido")
        return None
    name = t.get("name")
    if name is not None and not isinstance(name, str):
        _reject(tid, "name inválido")
        return None
    scheme = t.get("colorScheme", base["colorScheme"])
    if scheme not in ("dark", "light"):
        _reject(tid, "colorScheme inválido")
        return None

    # colors (alias v1: "tokens")
    raw_colors = t.get("colors") if isinstance(t.get("colors"), dict) else t.get("tokens")
    colors = dict(base["colors"])
    if raw_colors is not None:
        if not isinstance(raw_colors, dict):
            _reject(tid, "colors/tokens no es un objeto")
            return None
        for k, v in raw_colors.items():
            if k not in COLOR_KEYS:
                continue  # tokens desconocidos se ignoran
            if not _valid_color(v):
                _reject(tid, f"color inválido en {k!r}: {v!r}")
                return None
            colors[k] = v

    # typography
    typo = dict(base["typography"])
    raw_typo = t.get("typography")
    if raw_typo is not None:
        if not isinstance(raw_typo, dict):
            _reject(tid, "typography no es un objeto")
            return None
        for k in ("display", "mono"):
            if k in raw_typo:
                if raw_typo[k] not in FONTS:
                    _reject(tid, f"fuente desconocida: {raw_typo[k]!r}")
                    return None
                typo[k] = raw_typo[k]

    # shape / density
    shape = t.get("shape", base["shape"])
    if shape not in SHAPES:
        _reject(tid, f"shape desconocido: {shape!r}")
        return None
    density = t.get("density", base["density"])
    if density not in DENSITIES:
        _reject(tid, f"density desconocida: {density!r}")
        return None

    # effects (alias v1: "crt" a nivel raíz)
    effects = dict(base["effects"])
    raw_fx = t.get("effects")
    if raw_fx is not None:
        if not isinstance(raw_fx, dict):
            _reject(tid, "effects no es un objeto")
            return None
        for k in ("crt", "glow"):
            if k in raw_fx:
                effects[k] = bool(raw_fx[k])
    elif "crt" in t:
        effects["crt"] = bool(t["crt"])

    # icons
    icons = t.get("icons", base["icons"])
    if icons not in ICON_PACKS:
        _reject(tid, f"icon pack desconocido: {icons!r}")
        return None

    return {
        "id": tid,
        "name": name or tid,
        "colorScheme": scheme,
        "colors": colors,
        "typography": typo,
        "shape": shape,
        "density": density,
        "effects": effects,
        "icons": icons,
    }


def available_themes(custom: list | None = None) -> list[dict]:
    """Themes efectivos, totalmente resueltos: built-in + custom válidos.

    Un custom con "base" hereda de ese theme; sin base hereda del built-in con
    el mismo id (si existe) o del theme por defecto. Bases desconocidas o
    cíclicas → el theme se rechaza con un warning.
    """
    resolved: dict[str, dict] = {t["id"]: t for t in BUILTIN_THEMES}
    pending = [t for t in (custom or []) if isinstance(t, dict)]
    while pending:
        progressed = False
        for t in list(pending):
            tid = t.get("id")
            base_id = t.get("base")
            if base_id is None:
                base_id = tid if tid in _BUILTIN_IDS else DEFAULT_THEME_ID
            if base_id not in resolved:
                if any(p.get("id") == base_id for p in pending):
                    continue  # base custom aún pendiente: reintentar después
                _reject(tid, f"base desconocida: {base_id!r}")
                pending.remove(t)
                progressed = True
                continue
            out = _resolve(t, resolved[base_id])
            pending.remove(t)
            progressed = True
            if out is not None:
                resolved[out["id"]] = out
        if not progressed:
            for t in pending:
                _reject(t.get("id"), "base cíclica o irresoluble")
            break
    return list(resolved.values())


# Campos permitidos en theme_overrides y su validador.
_OVERRIDE_VALIDATORS = {
    "font": lambda v: v in FONTS,
    "radius": lambda v: v in SHAPES,
    "density": lambda v: v in DENSITIES,
    "iconPack": lambda v: v in ICON_PACKS,
    "crt": lambda v: isinstance(v, bool),
    "glow": lambda v: isinstance(v, bool),
}


def sanitize_overrides(raw) -> dict:
    """Filtra theme_overrides: solo campos conocidos con valores válidos."""
    if not isinstance(raw, dict):
        return {}
    out = {}
    for k, ok in _OVERRIDE_VALIDATORS.items():
        if k in raw and ok(raw[k]):
            out[k] = raw[k]
    return out


def effective_crt(themes: list[dict], theme_id: str, overrides: dict) -> bool:
    """CRT efectivo: override del usuario si existe, si no el default del theme."""
    if "crt" in overrides:
        return bool(overrides["crt"])
    for t in themes:
        if t["id"] == theme_id:
            return bool(t["effects"]["crt"])
    return True
