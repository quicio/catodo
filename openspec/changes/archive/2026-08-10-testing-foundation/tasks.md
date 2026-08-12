# Tasks

## 1. Scaffold

- [x] 1.1 Add dev dependency group (`pytest`, `pytest-asyncio`, `ruff`) to `backend/pyproject.toml`; `uv sync --group dev`.
- [x] 1.2 Create `backend/tests/` with `conftest.py`: tmp data dir fixture, app factory with fake channels, env isolation helper.
- [x] 1.3 Verify: `uv run --group dev pytest backend/tests` collects and passes an empty suite; plain `uv sync` does not install pytest.

## 2. Unit tests (pure logic)

- [x] 2.1 `test_volume.py`: `_parse_volume` (int, `+`, `-`, invalid), mixer fallback order with a fake runner.
- [x] 2.2 `test_config.py`: defaults, override round-trip, atomic save (tmp+rename), corrupt → `.bak` recovery, concurrent `set()` keeps both keys.
- [x] 2.3 `test_events.py`: publish reaches subscribers, full queue drops safely, `close()` terminates saturated subscribers without yielding control frames.
- [x] 2.4 `test_store.py` / `test_anime_scan.py`: JSON store envelope + recovery; scan grouping (series/season inference) over a tmp tree.
- [x] 2.5 Verify: all pass offline (`pytest -q` with network disabled).

## 3. API smoke tests

- [x] 3.1 `test_api_smoke.py`: health 200; channel list shape; open unknown → 404; volume absolute/relative/invalid; config round-trip ignoring unknown keys; each test names its spec scenario.
- [x] 3.2 WebSocket test: snapshot-first after `event-driven-state` lands (until then, assert event fan-out from a REST trigger).
- [x] 3.3 Verify: smoke tests use a temp data dir (real `~/.local/share/catodo` untouched — assert no files created there).

## 4. Lint + typecheck gates

- [x] 4.1 Configure ruff (`E,F,I,UP,ASYNC`, line-length 110) in `backend/pyproject.toml`; fix or consciously noqa existing findings.
- [x] 4.2 Add `npm run typecheck` (`tsc --noEmit`) to `frontend/package.json`.
- [x] 4.3 Create `scripts/check.sh`: ruff + pytest + typecheck, fail-fast, summary output.
- [x] 4.4 Verify: `scripts/check.sh` exits 0 on the clean tree and non-zero when a deliberate error is introduced (then reverted).

## 5. Documentation

- [x] 5.1 README: add a "Development" section pointing at `scripts/check.sh` and how to run backend tests.
- [x] 5.2 Verify: a fresh clone can run the check script following only the README.
