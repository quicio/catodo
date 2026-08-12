## ADDED Requirements

### Requirement: Episode events

The channel SHALL publish `episode_changed` (with the episode record) whenever the current episode changes through any path (`set_episode`, `next`, `prev`).

#### Scenario: Next episode pushes event

- **WHEN** a `next` command advances the episode
- **THEN** connected clients receive `episode_changed` with the new episode before their next render.
