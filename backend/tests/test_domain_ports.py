"""Duck-typing smoke test: a bare class with the right methods satisfies a Port."""
from __future__ import annotations

from catodo.domain.ports import (
    InputInjectorPort,
    MixerPort,
    SpotifyClientPort,
    UriOpenerPort,
)


class _StubMixer:
    async def get_volume(self): return 50

    async def set_volume(self, level): return True

    async def set_default_sink(self, sink): return True

    def is_available(self): return True


class _StubInjector:
    async def move(self, dx, dy): return None

    async def click(self, button): return None

    async def scroll(self, dy): return None

    async def key(self, name, shift=False): return None

    async def type_text(self, text): return None

    def is_available(self): return True


class _StubOpener:
    def open(self, uri): return True


class _StubSpotify:
    def is_available(self): return False

    async def play(self): return None

    async def pause(self): return None

    async def next(self): return None

    async def previous(self): return None

    async def set_volume(self, level): return None

    async def open_uri(self, uri): return None

    async def get_state(self): return {}


def test_mixer_satisfies_protocol():
    assert isinstance(_StubMixer(), MixerPort)


def test_injector_satisfies_protocol():
    assert isinstance(_StubInjector(), InputInjectorPort)


def test_uri_opener_satisfies_protocol():
    assert isinstance(_StubOpener(), UriOpenerPort)


def test_spotify_client_satisfies_protocol():
    assert isinstance(_StubSpotify(), SpotifyClientPort)