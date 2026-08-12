"""MQTT bridge — control y estado de Cátodo vía broker MQTT.

Solo arranca si `mqtt_host` está configurado. Se suscribe a `<prefix>/cmd/#`
para recibir comandos y publica `<prefix>/state` (retain) con el estado actual.
Reconecta con backoff si el broker se cae.
"""
from __future__ import annotations

import asyncio
import json
import logging

from catodo.voice import match as match_voice

log = logging.getLogger("catodo.mqtt")


class MqttBridge:
    def __init__(self, manager, broker) -> None:
        self._manager = manager
        self._broker = broker
        self._task: asyncio.Task | None = None

    @staticmethod
    def _config() -> dict:
        from catodo import runtime_config

        return {
            "host": str(runtime_config.get("mqtt_host") or ""),
            "port": int(runtime_config.get("mqtt_port") or 1883),
            "username": runtime_config.get("mqtt_user") or None,
            "password": runtime_config.get("mqtt_pass") or None,
            "prefix": str(runtime_config.get("mqtt_topic_prefix") or "catodo"),
        }

    async def start(self) -> None:
        if not self._config()["host"]:
            log.info("mqtt: sin mqtt_host configurado — bridge inactivo")
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        prefix = self._config()["prefix"]
        cmd_topic = f"{prefix}/cmd/#"
        state_topic = f"{prefix}/state"
        while True:
            from asyncio_mqtt import Client, MqttError

            cfg = self._config()
            try:
                client = Client(
                    hostname=cfg["host"],
                    port=cfg["port"],
                    username=cfg["username"],
                    password=cfg["password"],
                )
                await client.connect()
                log.info("mqtt conectado a %s:%s", cfg["host"], cfg["port"])
            except (MqttError, Exception) as e:
                log.warning("mqtt connect falló: %s", e)
                await asyncio.sleep(5)
                continue
            try:
                await client.subscribe(cmd_topic)
                await self._publish_state(client, state_topic)
                tasks = [
                    asyncio.create_task(self._consume(client, cmd_topic, prefix)),
                    asyncio.create_task(self._publish_events(client, state_topic)),
                ]
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
                for t in pending:
                    t.cancel()
                for t in done:
                    exc = t.exception()
                    if exc:
                        raise exc
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.warning("mqtt loop error: %s", e)
            finally:
                try:
                    await client.disconnect()
                except Exception:
                    pass
            await asyncio.sleep(5)

    async def _consume(self, client, cmd_topic: str, prefix: str) -> None:
        async with client.filtered_messages(cmd_topic) as messages:
            async for message in messages:
                payload = message.payload.decode(errors="replace").strip()
                await self._handle(message.topic, payload, prefix)

    async def _publish_events(self, client, state_topic: str) -> None:
        async for event in self._broker.subscribe():
            if event.get("event") in ("channel_changed", "volume_changed", "playing_changed"):
                await self._publish_state(client, state_topic)

    async def _publish_state(self, client, state_topic: str) -> None:
        st = self._manager.state()
        payload = json.dumps(
            {
                "channel": st.get("current_channel_id"),
                "volume": st.get("volume"),
                "playing": st.get("playing"),
            },
            ensure_ascii=False,
        )
        await client.publish(state_topic, payload, retain=True)

    async def _handle(self, topic: str, payload: str, prefix: str) -> None:
        base = f"{prefix}/cmd/"
        name = topic[len(base):] if topic.startswith(base) else topic
        log.info("mqtt cmd: %s = %r", name, payload)
        try:
            if name == "channel":
                await self._open(payload)
            elif name == "next":
                await self._manager.next()
            elif name == "prev":
                await self._manager.previous()
            elif name == "volume":
                await self._volume(payload)
            elif name == "play":
                if self._manager.current:
                    await self._manager.command(self._manager.current, "play")
            elif name == "pause":
                if self._manager.current:
                    await self._manager.command(self._manager.current, "pause")
            elif name == "home":
                await self._broker.publish({"event": "channel_changed", "channel_id": None})
            else:
                log.info("mqtt: comando desconocido %s", name)
        except Exception as e:
            log.warning("mqtt command %s falló: %s", name, e)

    async def _open(self, payload: str) -> None:
        if not payload:
            return
        for ch in self._manager.list():
            if ch["id"] == payload:
                await self._manager.open(payload)
                return
        intent = match_voice(payload, self._manager.list())
        if intent["recognized"] and intent["action"] == "open":
            await self._manager.open(intent["channel"])

    async def _volume(self, payload: str) -> None:
        s = payload.strip().lower()
        if s in ("+", "up", "subir"):
            await self._manager.adjust_volume(5)
        elif s in ("-", "down", "bajar"):
            await self._manager.adjust_volume(-5)
        else:
            try:
                await self._manager.set_volume(int(s))
            except ValueError:
                pass
