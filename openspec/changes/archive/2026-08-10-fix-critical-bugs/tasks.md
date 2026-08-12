# Tasks

## 1. Real volume control

- [x] 1.1 Add `backend/catodo/mixer.py`: detect `wpctl`/`pactl` once (cached), expose async `get_volume() -> int | None`, `set_volume(level: int) -> bool`, `adjust(delta: int) -> int | None`, shelling out with timeouts and logging failures without raising.
- [x] 1.2 Wire `ChannelManager.set_volume`/`adjust_volume` to the mixer; on startup read back the real level (fallback 50); keep the `volume_changed` event.
- [x] 1.3 Fallback path: when no mixer exists and the current channel accepts a `volume` command (Spotify), forward the level (scaled 0.0–1.0).
- [x] 1.4 Frontend: apply `state.volume / 100` to the Anime `<video>` element whenever volume changes.
- [x] 1.5 Verify: `curl -X POST 'http://127.0.0.1:8765/api/volume?level=70'` audibly changes system volume; `/api/state` volume matches `wpctl get-volume @DEFAULT_AUDIO_SINK@`.

## 2. Accurate playing state

- [x] 2.1 In `ChannelManager.command`, after transport commands (`play`/`pause`/`toggle`/`next`/`prev`), fetch the channel's `state()` and derive `playing` (prefer boolean `playing`, then `status == "Playing"`); leave unchanged when the channel reports neither.
- [x] 2.2 Remove the command-name guessing logic (`cmd in ("play", "toggle") ...`).
- [x] 2.3 Verify: with Spotify paused, `toggle` then `GET /api/state` shows `playing: true` only after Spotify actually resumes.

## 3. Atomic runtime config

- [x] 3.1 `save()`: write `config.json.tmp` + `os.replace()`; add module-level `asyncio.Lock` around `set()`'s load-modify-save.
- [x] 3.2 Corrupt recovery: on JSON decode error, move file to `config.json.bak` and continue with defaults + warning log.
- [x] 3.3 Verify: write garbage to `~/.local/share/catodo/config.json`, restart backend → starts with defaults, `.bak` exists, `/api/config` responds 200.

## 4. EventBroker shutdown

- [x] 4.1 `close()`: set `_closed`, then for each subscriber queue make room for the sentinel (drop oldest if full); consume the sentinel inside `subscribe()` so it is never yielded to clients.
- [x] 4.2 Verify: connect a WS client, `systemctl --user stop catodo` → no hanging tasks in logs, client sees a clean close and no `{"event": "_closed"}` frame.

## 5. Dead code removal

- [x] 5.1 Delete the duplicate `SpotifyChannel.state()` (second definition in `channels/spotify.py`).
- [x] 5.2 Remove `pydbus` from `backend/pyproject.toml` and `uv sync`; remove `settings.chromium_bin` and `settings.channels` from `config.py`; remove `RATINGS_FILE` from `datadir.py`.
- [x] 5.3 Verify: backend starts (`uv run python -m catodo`), `GET /api/health` 200, `grep -rn "pydbus\|chromium_bin\|RATINGS_FILE" backend/` returns nothing.

## 6. Regression pass

- [x] 6.1 Walk every scenario in this change's specs once against a running instance and record results in the PR/commit description.
