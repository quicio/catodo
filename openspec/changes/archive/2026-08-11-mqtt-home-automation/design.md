## Context

El backend ya tiene `ChannelManager` (open/next/prev/volume/commands), el broker de eventos WS (para re-publicar estado) y el matcher de intenciones de voice (`catodo/voice.py`, reusable). Se agrega un cliente MQTT como puente.

## Goals / Non-Goals

**Goals:**
- Control de Cátodo desde MQTT (Home Assistant, botones, rutinas).
- Publicar estado para automatizaciones.
- No romper si el broker no está configurado.

**Non-Goals:**
- Autodiscovery, control de dispositivos, TLS/WS en esta iteración.

## Decisions

### 1. Cliente `asyncio-mqtt` (o `paho-mqtt` en thread)
Se agrega `asyncio-mqtt` a `pyproject.toml`. `MqttBridge` en `catodo/mqtt_bridge.py`:
- `start()` crea el cliente solo si `mqtt_host` está configurado (si no, no-op).
- `stop()` desconecta.
- Se registra en el lifespan (`main.py`) y se cierra en shutdown.

### 2. Tópicos
- Entrada: `<prefix>/cmd/<comando>` con payload = valor (`channel` → id/nombre; `volume` → nivel o `+/-`; `next`/`prev`/`play`/`pause`/`home` → sin payload).
- Salida: `<prefix>/state` → JSON `{channel, volume, playing}` (retain=true para que los suscriptores nuevos vean el estado).
- Default prefix `catodo`; configurable.

### 3. Traducción de comandos
Reusa `catodo/voice.match` para comandos tipo texto (`channel` con nombre), y casos directos para `next/prev/volume/play/pause/home`. `channel` acepta id o nombre (normalizado).

### 4. Estado saliente
`MqttBridge` se suscribe a eventos del broker de eventos WS (`channel_changed`, `volume_changed`, `playing_changed`) y publica `catodo/state` con el estado actual de `manager.state()`.

## Risks / Trade-offs

- **Dependencia nueva** → `asyncio-mqtt` es liviano y sin sistema; si el broker está caído, reconexión con backoff y logs.
- **Payloads de HA** → se aceptan tanto string como JSON; se documentan ejemplos en README.
