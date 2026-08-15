"""Tests del sistema de themes v2 (modelo, herencia, validación)."""
from catodo.themes import (
    BUILTIN_THEMES,
    COLOR_KEYS,
    DEFAULT_THEME_ID,
    FONTS,
    ICON_PACKS,
    available_themes,
    sanitize_overrides,
)


def _v1_theme(**over):
    t = {
        "id": "legacy-one",
        "name": "Legacy",
        "colorScheme": "dark",
        "crt": False,
        "tokens": {k: "#112233" for k in COLOR_KEYS},
    }
    t.update(over)
    return t


def test_ten_builtins_fully_resolved():
    themes = available_themes()
    assert len(themes) == 10
    for t in themes:
        assert set(t["colors"]) == set(COLOR_KEYS)
        assert set(t["typography"]) == {"display", "mono"}
        assert t["typography"]["display"] in FONTS
        assert t["typography"]["mono"] in FONTS
        assert t["shape"] in ("square", "rounded", "pill")
        assert t["density"] in ("compact", "comfortable", "spacious")
        assert set(t["effects"]) == {"crt", "glow"}
        assert t["icons"] in ICON_PACKS


def test_v1_theme_accepted():
    themes = available_themes([_v1_theme()])
    t = next(x for x in themes if x["id"] == "legacy-one")
    assert t["colors"]["accent"] == "#112233"
    assert t["effects"]["crt"] is False  # alias "crt" raíz de v1
    default = next(x for x in themes if x["id"] == DEFAULT_THEME_ID)
    assert t["typography"] == default["typography"]
    assert t["shape"] == default["shape"]
    assert t["density"] == default["density"]
    assert t["icons"] == default["icons"]


def test_partial_theme_with_base_resolves():
    custom = [{"id": "mine", "base": "retro-crt", "colors": {"accent": "#123456"}}]
    themes = available_themes(custom)
    t = next(x for x in themes if x["id"] == "mine")
    base = next(x for x in themes if x["id"] == "retro-crt")
    assert t["colors"]["accent"] == "#123456"
    assert t["colors"]["bg"] == base["colors"]["bg"]
    assert t["typography"] == base["typography"]
    assert t["shape"] == base["shape"]
    assert t["density"] == base["density"]
    assert t["effects"] == base["effects"]
    assert t["icons"] == base["icons"]


def test_custom_overriding_builtin_inherits_from_it():
    custom = [{"id": "retro-crt", "colors": {"accent": "#abcdef"}}]
    t = next(x for x in available_themes(custom) if x["id"] == "retro-crt")
    assert t["colors"]["accent"] == "#abcdef"
    assert t["icons"] == "game-icons"  # heredado del built-in


def test_custom_chained_base():
    chain = [
        {"id": "c1", "base": "retro-crt", "colors": {"accent": "#111111"}},
        {"id": "c2", "base": "c1", "colors": {"bg": "#222222"}},
    ]
    themes = available_themes(chain)
    c2 = next(t for t in themes if t["id"] == "c2")
    assert c2["colors"]["accent"] == "#111111"  # heredado de c1
    assert c2["colors"]["bg"] == "#222222"


def test_invalid_color_rejected():
    bad = _v1_theme(id="bad-color")
    bad["tokens"]["accent"] = "not-a-color"
    ids = {t["id"] for t in available_themes([bad])}
    assert "bad-color" not in ids


def test_invalid_preset_rejected():
    bad_shape = {"id": "bad-shape", "shape": "roundish"}
    bad_density = {"id": "bad-density", "density": "roomy"}
    ids = {t["id"] for t in available_themes([bad_shape, bad_density])}
    assert "bad-shape" not in ids
    assert "bad-density" not in ids


def test_invalid_icon_pack_rejected():
    bad = {"id": "bad-icons", "icons": "emojis"}
    ids = {t["id"] for t in available_themes([bad])}
    assert "bad-icons" not in ids


def test_unknown_base_rejected():
    bad = {"id": "orphan", "base": "no-existe"}
    ids = {t["id"] for t in available_themes([bad])}
    assert "orphan" not in ids


def test_cyclic_base_rejected():
    cyc = [{"id": "a", "base": "b"}, {"id": "b", "base": "a"}]
    ids = {t["id"] for t in available_themes(cyc)}
    assert "a" not in ids
    assert "b" not in ids


def test_sanitize_overrides():
    assert sanitize_overrides(None) == {}
    assert sanitize_overrides("nope") == {}
    assert sanitize_overrides(
        {"font": "inter", "bogus": 1, "crt": True, "radius": "huge", "iconPack": "tabler"}
    ) == {"font": "inter", "crt": True, "iconPack": "tabler"}


def test_builtin_palettes_valid():
    for t in BUILTIN_THEMES:
        for k, v in t["colors"].items():
            assert isinstance(v, str) and v, f"{t['id']}.{k} vacío"
