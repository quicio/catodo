# Design

## Context

See proposal.md — Why. Four bug clusters, one goal: stop lying to the user (volume HUD), stop guessing state (`playing`), stop corrupting data (config), stop leaking tasks (WS shutdown), and delete the code that already lies by existing (dead/duplicate).

## Goals / Non-Goals

**Goals**
- Every fix is independently verifiable via the API or a unit-level check.
- No new Python dependencies.

**Non-Goals**
- No architectural rework (poll→WS, async wallpapers, channel protocols are separate changes).

## Decisions

### Decision 1: `wpctl` first, `pactl` fallback, MPRIS last

Volume resolution order at runtime:
1. `wpctl set-volume @DEFAULT_AUDIO_SINK@ <pct>%` (PipeWire; present on the target machine).
2. `pactl set-sink-volume @DEFAULT_SINK@ <pct>%` (PulseAudio/PipeWire-compat).
3. If neither binary exists and the current channel supports a `volume` command (Spotify does, 0.0–1.0 scale), forward there.
4. Always keep the in-memory value so the API contract never breaks.

Detection is a one-time `shutil.which` probe cached on first use. Startup read-back parses `wpctl get-volume @DEFAULT_AUDIO_SINK@` (or `pactl get-sink-volume`), falling back to 50 on parse failure.

Rationale: shelling out matches the existing style (`xdg-open`, systemd) and avoids a new dependency like `pulsectl`.

### Decision 2: `playing` derives from the channel, lazily

After a transport command (`play`/`pause`/`toggle`/`next`/`prev`), the manager asks the channel for fresh state and maps it: Spotify `status == "Playing"`; Anime's `playing` flag; channels that report neither leave `playing` unchanged. Channels get an optional convention: `state()` may include a boolean-ish `playing` or a MPRIS-style `status`. The manager prefers `playing`, then `status`. No `state()` polling loop is added here — derivation happens only on command, keeping this change small (full eventing is `event-driven-state`).

Rationale: fixes the lie with ~20 lines; avoids inventing a pub/sub layer now.

### Decision 3: Atomic config via temp + rename + asyncio lock

`runtime_config.save()` writes `config.json.tmp` then `os.replace()` (atomic on POSIX). A module-level `asyncio.Lock` serializes `set()`. Corrupt-file handling: on JSON error, rename to `config.json.bak` (overwriting a previous `.bak`) and continue with defaults.

### Decision 4: EventBroker close drains instead of enqueuing

`close()` sets `_closed`, then for each subscriber queue: if full, drop oldest items until the sentinel fits. The sentinel is consumed by the generator loop itself (check `_closed` after wake) and is never yielded to the client. This kills both the hang and the fake `{"event": "_closed"}` frame.

### Decision 5: Dead code removal list

- `SpotifyChannel.state()` second definition (lines ~250) — delete.
- `pydbus` from `pyproject.toml` (nothing imports it; we use `pygobject`/Gio).
- `settings.chromium_bin` — no consumer since YouTube stopped launching Chromium.
- `settings.channels` env list — `build_default_registry()` is static; keeping the env var implies configurability that does not exist. Removing the setting is the honest fix (a real channel-toggle feature is out of scope).
- `RATINGS_FILE` constant — returns when `media-persistence` implements ratings.
- Frontend: apply global volume to the Anime `<video>` (`el.volume = volume/100`), and stop claiming hotkeys `1–6` anywhere only 4 channels exist (README handled in `sync-specs-reality`).
