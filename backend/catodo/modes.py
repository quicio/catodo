"""Mode presets — user-defined bundles of runtime_config keys (theme, layout,
ui_scale, favorite_channels) that can be applied atomically. Persisted in the
shared JSON store under the name `modes` (so they live at
`~/.local/share/catodo/modes.json`)."""
from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass, field

from catodo import runtime_config, store

log = logging.getLogger("catodo.modes")

STORE_NAME = "modes"

# Keys allowed inside a preset's payload. Any other key is rejected with 400.
ALLOWED_KEYS: frozenset[str] = frozenset(
    {"theme", "home_layout_id", "ui_scale", "favorite_channels"}
)


@dataclass
class Preset:
    id: str
    name: str
    payload: dict = field(default_factory=dict)


def _load_raw() -> dict:
    """Read raw persisted state — always returns a dict with a `presets` list."""
    data = store.load(STORE_NAME, {"version": 1, "presets": []})
    if not isinstance(data, dict):
        return {"version": 1, "presets": []}
    presets = data.get("presets")
    if not isinstance(presets, list):
        return {"version": 1, "presets": []}
    return {"version": 1, "presets": presets}


def list_presets() -> list[Preset]:
    raw = _load_raw()
    out: list[Preset] = []
    for entry in raw["presets"]:
        if not isinstance(entry, dict):
            continue
        pid = str(entry.get("id") or "")
        name = str(entry.get("name") or "")
        payload = entry.get("payload") if isinstance(entry.get("payload"), dict) else {}
        if not pid or not name:
            continue
        out.append(Preset(id=pid, name=name, payload=dict(payload)))
    return out


def get_preset(preset_id: str) -> Preset | None:
    for p in list_presets():
        if p.id == preset_id:
            return p
    return None


def _dump(presets: list[Preset]) -> dict:
    return {"version": 1, "presets": [asdict(p) for p in presets]}


async def _save_all_async(presets: list[Preset]) -> None:
    await store.save(STORE_NAME, _dump(presets))


async def create_preset_async(name: str, payload: dict) -> Preset:
    pid = uuid.uuid4().hex[:8]
    preset = Preset(id=pid, name=name, payload=dict(payload))
    presets = list_presets()
    presets.append(preset)
    await _save_all_async(presets)
    return preset


async def update_preset_async(
    preset_id: str, name: str | None = None, payload: dict | None = None
) -> Preset | None:
    presets = list_presets()
    target: Preset | None = None
    for p in presets:
        if p.id == preset_id:
            target = p
            break
    if target is None:
        return None
    if name is not None:
        target.name = name
    if payload is not None:
        target.payload = dict(payload)
    await _save_all_async(presets)
    return target


async def delete_preset_async(preset_id: str) -> bool:
    presets = list_presets()
    kept = [p for p in presets if p.id != preset_id]
    if len(kept) == len(presets):
        return False
    await _save_all_async(kept)
    return True


# Sync wrappers for callers outside an event loop (tests / CLI).
def _run_sync(coro):
    import asyncio

    return asyncio.run(coro)


def create_preset(name: str, payload: dict) -> Preset:
    return _run_sync(create_preset_async(name, payload))


def update_preset(preset_id: str, name: str | None = None, payload: dict | None = None) -> Preset | None:
    return _run_sync(update_preset_async(preset_id, name=name, payload=payload))


def delete_preset(preset_id: str) -> bool:
    return _run_sync(delete_preset_async(preset_id))


# --- Validation ----------------------------------------------------------


class PresetValidationError(ValueError):
    """Raised by validate_payload for any rejection reason."""


def validate_payload(raw: object) -> dict:
    """Whitelist + type-check a raw payload; return a cleaned copy or raise.

    Allowed keys: `theme`, `home_layout_id`, `ui_scale`, `favorite_channels`.
    `theme` and `home_layout_id` must be non-empty strings; `ui_scale` must be a
    number in [0.5, 2.0]; `favorite_channels` must be a list of non-empty
    strings.
    """
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise PresetValidationError("payload must be an object")
    if unknown := set(raw.keys()) - ALLOWED_KEYS:
        raise PresetValidationError(f"unknown keys: {sorted(unknown)}")
    cleaned: dict = {}
    for key, value in raw.items():
        if key in ("theme", "home_layout_id"):
            if not isinstance(value, str) or not value:
                raise PresetValidationError(f"{key} must be a non-empty string")
            cleaned[key] = value
        elif key == "ui_scale":
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise PresetValidationError("ui_scale must be a number")
            f = float(value)
            if f != f or f < 0.5 or f > 2.0:  # NaN guard + clamp range
                raise PresetValidationError("ui_scale must be in [0.5, 2.0]")
            cleaned[key] = f
        elif key == "favorite_channels":
            if not isinstance(value, list) or not all(
                isinstance(v, str) and v for v in value
            ):
                raise PresetValidationError(
                    "favorite_channels must be a list of non-empty strings"
                )
            cleaned[key] = list(value)
    return cleaned


async def apply_preset(preset_id: str, broker) -> dict:
    """Write every key in the preset's payload to runtime_config and broadcast
    one `config_changed` per key. Returns the effective config dict. Raises
    KeyError if the preset id does not exist."""
    preset = get_preset(preset_id)
    if preset is None:
        raise KeyError(preset_id)
    for key, value in preset.payload.items():
        # Sanitize_payload was applied at create/update, so we trust the types.
        if key == "ui_scale":
            value = _sanitize_ui_scale(value)
        await runtime_config.set(key, value)
        await broker.publish({"event": "config_changed", "key": key, "value": value})
    return runtime_config.all()


def _sanitize_ui_scale(v: object) -> float:
    """Mirror of runtime_config._sanitize_ui_scale without importing the private name."""
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 1.0
    if f != f:
        return 1.0
    return max(0.5, min(2.0, f))


# --- HTTP router ---------------------------------------------------------


from dataclasses import asdict as _asdict  # noqa: E402  (placed near router)

from fastapi import APIRouter, HTTPException, Request  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

router = APIRouter(prefix="/modes", tags=["modes"])


def _broker(request: Request):
    broker = getattr(request.app.state, "broker", None)
    if broker is None:
        raise HTTPException(status_code=503, detail="broker unavailable")
    return broker


class CreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    payload: dict = Field(default_factory=dict)


class UpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    payload: dict | None = None


@router.get("")
async def list_modes() -> dict:
    """List all stored presets in insertion order."""
    return {"presets": [_asdict(p) for p in list_presets()]}


@router.post("")
async def create_mode(body: CreatePayload) -> dict:
    try:
        cleaned = validate_payload(body.payload)
    except PresetValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    preset = await create_preset_async(body.name.strip(), cleaned)
    return _asdict(preset)


@router.patch("/{preset_id}")
async def update_mode(preset_id: str, body: UpdatePayload) -> dict:
    if body.payload is not None:
        try:
            cleaned = validate_payload(body.payload)
        except PresetValidationError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        cleaned = None
    name = body.name.strip() if body.name is not None else None
    updated = await update_preset_async(preset_id, name=name, payload=cleaned)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"unknown preset: {preset_id}")
    return _asdict(updated)


@router.delete("/{preset_id}")
async def delete_mode(preset_id: str) -> dict:
    if not await delete_preset_async(preset_id):
        raise HTTPException(status_code=404, detail=f"unknown preset: {preset_id}")
    return {"deleted": preset_id}


@router.post("/{preset_id}/apply")
async def apply_mode(preset_id: str, request: Request) -> dict:
    """Atomically write every key in the preset's payload to runtime_config
    and broadcast one `config_changed` per key via the WS broker."""
    broker = _broker(request)
    try:
        effective = await apply_preset(preset_id, broker)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown preset: {preset_id}")
    return {"ok": True, "preset_id": preset_id, "config": effective}