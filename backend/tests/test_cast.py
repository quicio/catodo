"""Screen casting — CastManager y relay de señalización WS."""
import pytest
from fastapi.testclient import TestClient

from catodo.cast import CastManager
from catodo.main import app


class FakeBroker:
    def __init__(self):
        self.events = []

    async def publish(self, event):
        self.events.append(event)


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.mark.asyncio
async def test_lifecycle():
    """Spec: screen-casting / Ciclo de vida idle→signaling→active→idle."""
    broker = FakeBroker()
    cm = CastManager(broker=broker)
    assert cm.state == "idle"
    await cm.start("Mi PC")
    assert cm.state == "signaling"
    assert cm.info()["source"] == "Mi PC"
    await cm.activate()
    assert cm.state == "active"
    assert broker.events[-1]["event"] == "cast_session_started"
    await cm.end()
    assert cm.state == "idle"
    assert broker.events[-1]["event"] == "cast_session_ended"


@pytest.mark.asyncio
async def test_replace_active_session():
    """Spec: screen-casting / Una nueva fuente reemplaza la sesión activa."""
    broker = FakeBroker()
    cm = CastManager(broker=broker)
    await cm.start("A")
    await cm.activate()
    await cm.start("B")
    assert cm.state == "signaling"
    assert cm.info()["source"] == "B"


def test_cast_state_endpoint(client):
    """Spec: screen-casting / GET /api/cast expone el estado."""
    r = client.get("/api/cast")
    assert r.status_code == 200
    assert r.json()["state"] == "idle"


def test_ws_relay(client):
    """Spec: screen-casting / El backend relaja signaling entre source y receiver."""
    with client.websocket_connect("/api/cast/ws?role=source&label=Test") as src:
        with client.websocket_connect("/api/cast/ws?role=receiver") as recv:
            # al registrarse el receiver, la fuente es avisada
            assert src.receive_text() == "__catodo_receiver_ready"
            # offer → relay
            src.send_text('{"type":"offer","sdp":"x"}')
            assert recv.receive_text() == '{"type":"offer","sdp":"x"}'
            # answer → relay
            recv.send_text('{"type":"answer","sdp":"y"}')
            assert src.receive_text() == '{"type":"answer","sdp":"y"}'
            # ready → sesión activa
            src.send_text("__catodo_ready")
            assert client.get("/api/cast").json()["state"] == "active"
            # stop → sesión termina y la fuente recibe aviso
            client.post("/api/cast/stop")
            assert client.get("/api/cast").json()["state"] == "idle"
            assert src.receive_text() == "__catodo_stop"
