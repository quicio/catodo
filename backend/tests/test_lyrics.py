"""Tests for the lyrics lookup endpoint."""
import asyncio

from catodo import lyrics


class _Response:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _AsyncClient:
    def __init__(self, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, url, params=None):
        if url == lyrics.LRCLIB_GET:
            return _Response(
                200,
                {
                    "id": 1,
                    "trackName": "Etched Headplate",
                    "artistName": "Burial",
                    "syncedLyrics": None,
                    "plainLyrics": "A hardcore",
                },
            )
        assert url == lyrics.LRCLIB_SEARCH
        return _Response(
            200,
            [
                {
                    "id": 2,
                    "trackName": "Etched Headplate",
                    "artistName": "Burial",
                    "syncedLyrics": None,
                    "plainLyrics": "Dark angel, fall from the heavens above",
                },
                {
                    "id": 3,
                    "trackName": "Etched Headplate",
                    "artistName": "Burial",
                    "syncedLyrics": "[00:01.00] Dark angel, fall from the heavens above",
                    "plainLyrics": "Dark angel, fall from the heavens above",
                },
            ],
        )


def test_search_fallback_is_used_when_exact_match_has_no_synced_lyrics(monkeypatch):
    monkeypatch.setattr(lyrics.httpx, "AsyncClient", _AsyncClient)

    result = asyncio.run(
        lyrics.lyrics(artist="Burial", track="Etched Headplate", duration=360)
    )

    assert result["synced"] is True
    assert result["lines"] == [
        {"t": 1.0, "text": "Dark angel, fall from the heavens above"}
    ]
