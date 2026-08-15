## ADDED Requirements

### Requirement: Home renders from a HomeLayout

The Home view SHALL be composed from a `HomeLayout` (list of `HomeComponentConfig`s) resolved by a slot registry, rather than from a single hardcoded JSX tree. The default layout SHALL reproduce the existing Home composition (clock, brand, channel grid, ratings column, mini now-playing when Spotify plays, appearance-settings popover, pair modal, wallpaper background) without changing observable behavior.

#### Scenario: Default layout matches current Home

- **WHEN** the app boots with no explicit layout passed to Home
- **THEN** the default layout renders all current sections in the current positions (reloj top-left, brand centered, channel grid below, ratings + settings column right, pair modal via AppearanceSettings button)

#### Scenario: Layout change reflects in Home

- **WHEN** a different HomeLayout is passed to the Home component
- **THEN** only the components listed in that layout are rendered, in the order given

#### Scenario: Unknown component id does not crash Home

- **WHEN** a layout contains an id that the registry does not know
- **THEN** that entry is skipped or shows a silent fallback; the rest of Home renders normally
