# Design

## Context

See proposal.md — Why. Mechanically, this change is unusual: its "implementation" is an ordered sequence of OpenSpec bookkeeping operations plus doc edits, and the order matters because archiving copies delta specs into `openspec/specs/`.

## Goals / Non-Goals

**Goals**
- End with `openspec/specs/` containing a truthful baseline for everything that runs today.
- `openspec validate` passes for every change in the repo afterward.

**Non-Goals**
- No runtime code changes.
- No re-scoping of the MVP (no retro-fitting new requirements into `initial-mvp` beyond factual fixes).

## Decisions

### Decision 1: Fix `initial-mvp` in place, then archive it

`initial-mvp` is complete but unarchived, so its delta specs are still editable. We correct the factual errors inside `openspec/changes/initial-mvp/` first (Tauri → Electron, channel bar auto-hide 3s → 8s, the real four-channel set, systemd unit details), and only then run `openspec archive initial-mvp`. This makes the four MVP capabilities land in `openspec/specs/` already truthful, instead of archiving lies and patching them with a second change.

### Decision 2: Extension deltas use ADDED, not MODIFIED

Every spec in this change uses `## ADDED Requirements`, including the one for the existing `backend-api` capability, because no MVP requirement changes meaning — we only document endpoints that shipped unspecified. ADDED deltas merge cleanly at archive time and avoid copying MVP requirement text into this change.

### Decision 3: Specs describe current behavior, including its warts

Where today's behavior is intentional-but-odd (e.g. `GET .../stream?rel=` selecting the episode as a side effect, duck-typed capability endpoints returning empty collections), the spec documents the observable contract as-is. The queued hardening changes will MODIFY these specs; that is where behavior debates belong, not here.

### Decision 4: Sequence

1. Edit `openspec/config.yaml` (Electron stack, real channels, data dir).
2. Edit `initial-mvp` artifacts (factual fixes).
3. `openspec archive initial-mvp` → baseline lands.
4. Verify this change's deltas validate against the new baseline.
5. This change is then ready to be applied (doc edits already done in steps 1–2 are its implementation) and archived.
