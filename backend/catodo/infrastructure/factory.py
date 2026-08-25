"""Adapter factory — selects the right platform adapter per port.

Single point that maps OS → concrete adapter for each port. The composition
root (`main.py:44 lifespan`) calls these builders once at startup and stores
the results on `app.state`. Tests can monkeypatch `platform.IS_MACOS` to
simulate macOS or Linux.
"""
from __future__ import annotations

from catodo import platform
from catodo.domain.ports import InputInjectorPort, MixerPort, SpotifyClientPort, UriOpenerPort

_mixer: MixerPort | None = None
_injector: InputInjectorPort | None = None
_uri_opener: UriOpenerPort | None = None
_spotify_client: SpotifyClientPort | None = None


def build_mixer() -> MixerPort:
    global _mixer
    if _mixer is not None:
        return _mixer
    if platform.IS_MACOS:
        from catodo.infrastructure.macos.mixer import OsascriptMixer

        _mixer = OsascriptMixer()
    else:
        from catodo.infrastructure.linux.mixer import WpctlPactlMixer

        _mixer = WpctlPactlMixer()
    return _mixer


def build_input_injector() -> InputInjectorPort:
    global _injector
    if _injector is not None:
        return _injector
    if platform.IS_MACOS:
        from catodo.infrastructure.macos.input_injector import build_macos_injector

        _injector = build_macos_injector()
    else:
        from catodo.infrastructure.linux.input_injector import build_linux_injector

        _injector = build_linux_injector()
    return _injector


def build_uri_opener() -> UriOpenerPort:
    global _uri_opener
    if _uri_opener is not None:
        return _uri_opener
    if platform.IS_MACOS:
        from catodo.infrastructure.macos.uri_opener import MacOpenUriOpener

        _uri_opener = MacOpenUriOpener()
    else:
        from catodo.infrastructure.linux.uri_opener import XdgUriOpener

        _uri_opener = XdgUriOpener()
    return _uri_opener


def build_spotify_client() -> SpotifyClientPort:
    global _spotify_client
    if _spotify_client is not None:
        return _spotify_client
    if platform.IS_MACOS:
        from catodo.infrastructure.macos.spotify_client import ApplescriptSpotifyClient

        _spotify_client = ApplescriptSpotifyClient()
    else:
        from catodo.infrastructure.linux.spotify_client import DbusSpotifyClient

        _spotify_client = DbusSpotifyClient()
    return _spotify_client


def reset_for_tests() -> None:
    """Drop cached singletons — used by tests that flip `platform.IS_MACOS`."""
    global _mixer, _injector, _uri_opener, _spotify_client
    _mixer = _injector = _uri_opener = _spotify_client = None