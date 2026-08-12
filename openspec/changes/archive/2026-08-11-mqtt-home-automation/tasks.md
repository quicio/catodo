## 1. Backend — bridge MQTT

- [x] 1.1 Agregar `asyncio-mqtt` a `pyproject.toml` y sincronizar con uv.
- [x] 1.2 Crear `catodo/mqtt_bridge.py`: `MqttBridge` que arranca solo si `mqtt_host` está configurado, con reconexión y logs.
- [x] 1.3 Integrar en el lifespan de `main.py` (start/stop).

## 2. Backend — comandos y estado

- [x] 2.1 Suscripción a `<prefix>/cmd/#`: `channel` (id/nombre vía `voice.match`), `next`, `prev`, `volume` (nivel o +/-), `play`, `pause`, `home`.
- [x] 2.2 Publicación de `<prefix>/state` (retain) con `{channel, volume, playing}` al conectar y en cada evento relevante del broker de eventos.

## 3. Config

- [x] 3.1 Claves `mqtt_host`, `mqtt_port`, `mqtt_user`, `mqtt_pass`, `mqtt_topic_prefix` en `runtime_config`.

## 4. Tests backend

- [x] 4.1 Tests del parser de comandos MQTT (channel por nombre/id, volumen, desconocido → ignorado).
- [x] 4.2 Test de que sin `mqtt_host` el bridge no arranca.

## 5. Verificación

- [x] 5.1 E2E con un broker local (mosquitto): publicar `catodo/cmd/channel youtube` → abre el canal; observar `catodo/state` al cambiar volumen.
- [x] 5.2 README: ejemplos de Home Assistant (switch de canal, sensor de estado).
