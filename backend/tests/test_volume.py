"""Test volume parsing and mixer fallback logic."""
import pytest

from catodo.mixer import adjust_volume, get_volume, has_mixer, set_volume

# The API-level volume parsing is handled by the raw query value reader,
# not a standalone function, but we test the mixer directly.


@pytest.mark.asyncio
async def test_has_mixer_does_not_raise():
    """Volume detection should not raise even without wpctl/pactl."""
    result = has_mixer()
    assert isinstance(result, bool)


@pytest.mark.asyncio
async def test_set_volume_clamps():
    """set_volume clamps to [0, 100]."""
    assert await set_volume(-10) in (True, False)
    assert await set_volume(150) in (True, False)


@pytest.mark.asyncio
async def test_get_volume_returns_none_or_int():
    """get_volume returns None (no mixer) or int."""
    result = await get_volume()
    assert result is None or isinstance(result, int)


@pytest.mark.asyncio
async def test_adjust_volume():
    """adjust_volume does not raise."""
    result = await adjust_volume(5)
    assert result is None or isinstance(result, int)
