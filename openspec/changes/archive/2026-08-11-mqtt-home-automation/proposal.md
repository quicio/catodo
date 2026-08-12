## Why

Cátodo vive en el living junto a la domótica. Integrar MQTT (que además cubre Zigbee vía zigbee2mqtt) permite encender la TV, cambiar de canal o subir volumen desde Home Assistant, botones físicos o rutinas — y publicar el estado actual (canal, reproduciendo) para automatizaciones.

## What Changes

- **Cliente MQTT en el backend**: conecta a un broker configurable (`mqtt_host`, `mqtt_port`, `mqtt_user`/`mqtt_pass`, `mqtt_topic_prefix` default `catodo`).
- **Control entrante**: se suscribe a `catodo/cmd/#` y traduce mensajes a acciones (`channel: <id>`, `next`, `prev`, `volume: <n|+|-`, `play`, `pause`, `home`) — mismo motor de intenciones que voice (reuso de `catodo/voice.py` para canales/verbos).
- **Estado saliente**: publica `catodo/state` (JSON con canal actual, volumen, playing) en cada cambio relevante (eventos del broker WS).
- **Config de broker** en `runtime_config`; si no hay host configurado, el cliente no arranca (sin error).
- **Eventos de log**: conexión/desconexión del broker se loguean.

## Capabilities

### New Capabilities
- `mqtt-home-automation`: puente MQTT de control y estado de Cátodo.

### Modified Capabilities
- Ninguna.

## Impact

- **Backend**: módulo `catodo/mqtt_bridge.py` (cliente paho-mqtt o asyncio-mqtt), inicialización en lifespan, suscripción a comandos y publicación de estado al subscribirse a eventos del broker.
- **Config**: `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_pass`, `mqtt_topic_prefix` en `runtime_config`.
- **Dependencia**: `paho-mqtt` (o `asyncio-mqtt`) agregada a `pyproject.toml`.
- **Otros**: tests (parser de comandos MQTT, formato del estado), README con ejemplos de Home Assistant.

## Non-goals

- No autodiscovery de dispositivos.
- No control de dispositivos (solo Cátodo actúa y publica su estado).
- No TLS/WebSocket del broker en esta iteración (se puede sumar).
- No reenvío de mensajes de zigbee2mqtt hacia Cátodo más allá de comandos.
