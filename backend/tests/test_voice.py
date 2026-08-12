"""Voice control — matcher de intenciones y endpoint /api/voice."""
import pytest
from fastapi.testclient import TestClient

from catodo.main import app
from catodo.voice import match

CHANNELS = [
    {"id": "spotify", "name": "Spotify"},
    {"id": "youtube", "name": "YouTube"},
    {"id": "anime", "name": "Anime"},
    {"id": "arcade", "name": "Arcade"},
]


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# --- Matcher ---

def test_channel_by_name():
    it = match("poné youtube", CHANNELS)
    assert it == {"recognized": True, "action": "open", "channel": "youtube"}


def test_channel_by_number():
    assert match("canal 2", CHANNELS)["channel"] == "youtube"
    assert match("canal dos", CHANNELS)["channel"] == "youtube"


def test_verbs():
    assert match("siguiente", CHANNELS)["action"] == "next"
    assert match("volvé atrás", CHANNELS)["action"] == "prev"
    assert match("sube el volumen", CHANNELS)["action"] == "volume_up"
    assert match("baja el volumen", CHANNELS)["action"] == "volume_down"
    assert match("pausa", CHANNELS)["action"] == "pause"
    assert match("reproducí", CHANNELS)["action"] == "play"
    assert match("andá al inicio", CHANNELS)["action"] == "home"


def test_not_recognized():
    it = match("hola cómo estás", CHANNELS)
    assert it["recognized"] is False
    assert it["action"] is None


# --- Endpoint ---

def test_voice_endpoint_opens_channel(client):
    r = client.post("/api/voice", json={"text": "poné arcade"})
    assert r.status_code == 200
    data = r.json()
    assert data["recognized"] is True
    assert data["action"] == "open"
    assert data["channel"] == "arcade"
    assert client.get("/api/state").json()["current_channel_id"] == "arcade"


def test_voice_endpoint_requires_text(client):
    r = client.post("/api/voice", json={})
    assert r.status_code == 400
