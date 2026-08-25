## ADDED Requirements

### Requirement: Link to install the tray client

The remote page SHALL expose a clearly-labelled link or button that points the user to install or download the native system-tray client, surfaced prominently when the device opening `/remote` looks like a desktop OS (no touch-primary heuristics, large viewport, or `pointer: fine`).

#### Scenario: Desktop user opens the remote

- **WHEN** a desktop user opens `/remote`
- **THEN** an "Instalar cliente de bandeja" link is visible and points to the project's tray-client download page or repository release URL.

#### Scenario: Phone user opens the remote

- **WHEN** a phone user opens `/remote`
- **THEN** the link is hidden or de-emphasised to keep the mobile remote UI uncluttered.

#### Scenario: Link target unreachable

- **WHEN** the user clicks the link and the target URL returns a non-2xx
- **THEN** the link still navigates (the browser shows its own error page) — the remote page does not block or intercept the click.