"""Factory returns the right adapter per platform."""
from __future__ import annotations

import pytest

import catodo.platform as platform_mod
from catodo.infrastructure import factory
from catodo.infrastructure.linux.input_injector import _XdotoolInjector, _YdotoolInjector
from catodo.infrastructure.linux.mixer import WpctlPactlMixer
from catodo.infrastructure.linux.uri_opener import XdgUriOpener
from catodo.infrastructure.macos.input_injector import _CliclickInjector, _OsascriptInjector
from catodo.infrastructure.macos.mixer import OsascriptMixer
from catodo.infrastructure.macos.spotify_client import ApplescriptSpotifyClient
from catodo.infrastructure.macos.uri_opener import MacOpenUriOpener


@pytest.fixture(autouse=True)
def _restore_platform():
    orig_mac = platform_mod.IS_MACOS
    orig_lin = platform_mod.IS_LINUX
    yield
    platform_mod.IS_MACOS = orig_mac
    platform_mod.IS_LINUX = orig_lin
    factory.reset_for_tests()


def test_mixer_macos():
    platform_mod.IS_MACOS = True
    platform_mod.IS_LINUX = False
    assert isinstance(factory.build_mixer(), OsascriptMixer)


def test_mixer_linux():
    platform_mod.IS_MACOS = False
    platform_mod.IS_LINUX = True
    assert isinstance(factory.build_mixer(), WpctlPactlMixer)


def test_uri_opener_macos():
    platform_mod.IS_MACOS = True
    platform_mod.IS_LINUX = False
    assert isinstance(factory.build_uri_opener(), MacOpenUriOpener)


def test_uri_opener_linux():
    platform_mod.IS_MACOS = False
    platform_mod.IS_LINUX = True
    assert isinstance(factory.build_uri_opener(), XdgUriOpener)


def test_spotify_client_macos():
    platform_mod.IS_MACOS = True
    platform_mod.IS_LINUX = False
    client = factory.build_spotify_client()
    assert isinstance(client, ApplescriptSpotifyClient)
    assert hasattr(client, "is_available")


def test_spotify_client_linux():
    platform_mod.IS_MACOS = False
    platform_mod.IS_LINUX = True
    client = factory.build_spotify_client()
    assert not isinstance(client, ApplescriptSpotifyClient)
    assert hasattr(client, "is_available")


def test_input_injector_macos():
    platform_mod.IS_MACOS = True
    platform_mod.IS_LINUX = False
    inj = factory.build_input_injector()
    assert isinstance(inj, (_CliclickInjector, _OsascriptInjector))


def test_input_injector_linux():
    platform_mod.IS_MACOS = False
    platform_mod.IS_LINUX = True
    inj = factory.build_input_injector()
    assert isinstance(inj, (_XdotoolInjector, _YdotoolInjector))


def test_factory_caches_singletons():
    platform_mod.IS_MACOS = False
    platform_mod.IS_LINUX = True
    a = factory.build_mixer()
    b = factory.build_mixer()
    assert a is b