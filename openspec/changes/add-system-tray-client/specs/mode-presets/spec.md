## Purpose

Persists named bundles of Cátodo configuration (theme, home layout, UI scale, favorite channels) as user-editable presets that can be applied atomically from any client (kiosko config panel, system tray, future remote clients).

## ADDED Requirements

### Requirement: Preset data model

The system SHALL persist a list of presets where each preset has a stable `id`, a human-readable `name`, and a `payload` containing any subset of: `theme`, `home_layout_id`, `ui_scale`, and `favorite_channels` (a list of channel ids).

#### Scenario: Create a preset

- **WHEN** a client POSTs `{name: "Cine", payload: {theme: "cinema-dark", home_layout_id: "cinema-layout", ui_scale: 1.1, favorite_channels: ["youtube","tv"]}}` to `/api/modes`
- **THEN** the preset is persisted with a generated `id` and returned in the response body; subsequent GETs include it.

#### Scenario: Rename a preset

- **WHEN** a client PATCHes `/api/modes/<id>` with `{name: "Películas"}`
- **THEN** the preset's name is updated and persisted; the id and payload remain stable.

#### Scenario: Delete a preset

- **WHEN** a client DELETEs `/api/modes/<id>`
- **THEN** the preset is removed and no longer appears in `GET /api/modes`.

### Requirement: List presets

`GET /api/modes` SHALL return the full ordered list of presets for the current user.

#### Scenario: Empty list

- **WHEN** no presets are stored
- **THEN** the response is `{presets: []}`.

#### Scenario: Populated list

- **WHEN** two presets exist
- **THEN** the response is `{presets: [<preset-1>, <preset-2>]}` in insertion order.

### Requirement: Apply a preset atomically

`POST /api/modes/<id>/apply` SHALL update each key present in the preset's `payload` in `runtime_config`, persist the change, and broadcast one `config_changed` event per changed key via the WebSocket broker.

#### Scenario: All keys present

- **WHEN** a client POSTs to `/api/modes/<id>/apply` and the preset's payload has `theme`, `home_layout_id`, and `ui_scale`
- **THEN** the backend writes all three keys, the response returns the new effective config, and three `config_changed` events are published (one per key).

#### Scenario: Partial payload

- **WHEN** the preset's payload only contains `theme`
- **THEN** only `theme` is written and only one `config_changed` event is published.

#### Scenario: Unknown id

- **WHEN** a client POSTs to `/api/modes/<id>/apply` with an id that does not exist
- **THEN** the backend returns HTTP 404 and no config is changed.

### Requirement: Validation

The backend SHALL reject presets whose `payload` contains keys outside the allowed set (`theme`, `home_layout_id`, `ui_scale`, `favorite_channels`) with HTTP 400, and SHALL reject payloads whose values fail type checks (e.g. `ui_scale` not a number, `favorite_channels` not a list of strings).

#### Scenario: Invalid key

- **WHEN** a client POSTs a preset with payload `{exec: "rm -rf /"}`
- **THEN** the backend returns HTTP 400 and does not persist the preset.

### Requirement: UI editing

The kiosko's config panel SHALL expose a "Modos" sub-panel that lists existing presets with rename / delete controls, lets the user create a new preset from the current effective config, and apply any preset with a single click.

#### Scenario: Create from current config

- **WHEN** the user clicks "Guardar modo actual" with theme=`spotify-dark`, layout=`minimal-layout`, ui_scale=1.0, favorites=`["spotify","anime"]`
- **THEN** a new preset appears in the list with that exact payload.

#### Scenario: Apply from the panel

- **WHEN** the user clicks "Aplicar" on a preset
- **THEN** the kiosko reflects the new theme, layout, ui_scale and favorites within one second, matching the preset's payload.

## REMOVED Requirements

### Requirement: Built-in default presets

**Reason**: The system does not ship pre-defined modes; users compose their own from the config panel. Shipping defaults would impose opinions and clutter the tray submenu for users who only have one or two presets.

**Migration**: First-run users create their own preset with the "Guardar modo actual" button. Documentation should suggest creating a "Default" preset mirroring the out-of-the-box config.