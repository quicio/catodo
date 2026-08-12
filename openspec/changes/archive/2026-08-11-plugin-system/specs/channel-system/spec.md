## MODIFIED Requirements

### Requirement: Channel registration

The system SHALL register channels at startup from the static built-in list plus any installed, enabled plugins. Plugins SHALL NOT require code changes to the core or a rebuild.

#### Scenario: Adding a new channel

- **WHEN** a plugin with a supported `type` is installed and enabled
- **THEN** the channel becomes available via `GET /api/channels` without changes to other modules

#### Scenario: Built-in channels

- **WHEN** the system starts with no plugins installed
- **THEN** the built-in channels (Spotify, YouTube, Anime, TV) are still registered as today

#### Scenario: Invalid plugin does not block startup

- **WHEN** a plugin has an invalid manifest or a duplicated id
- **THEN** it is skipped, logged, and the rest of the channels (built-ins and valid plugins) still load

#### Scenario: Disabled plugin

- **WHEN** a plugin is disabled
- **THEN** its channel is not registered and does not appear in `GET /api/channels`
