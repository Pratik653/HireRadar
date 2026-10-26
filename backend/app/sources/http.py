"""Outbound HTTP for source adapters.

Only hosts in ``ALLOWED_HOSTS`` can be reached, redirects are not followed,
responses are size-capped and short-lived responses are cached in memory so
repeated searches do not hammer upstream APIs.
"""

from __future__ import annotations

import json
import time
from urllib.parse import urlsplit

import httpx

from app.config import settings

ALLOWED_HOSTS = frozenset(
    {
        "remotive.com",
        "boards-api.greenhouse.io",
        "api.lever.co",
        "api.ashbyhq.com",
    }
)
USER_AGENT = "HireRadar/0.1 (+https://github.com/Pratik653/HireRadar)"


class SourceError(Exception):
    """An upstream source failed in a way worth showing to the user."""


class SafeClient:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.source_timeout_seconds, connect=5.0),
            follow_redirects=False,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        self._cache: dict[str, tuple[float, object]] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_json(self, url: str, params: dict | None = None) -> object:
        host = (urlsplit(url).hostname or "").lower()
        if urlsplit(url).scheme != "https" or host not in ALLOWED_HOSTS:
            raise SourceError(f"host {host!r} is not on the outbound allowlist")

        key = str(httpx.URL(url, params=params))
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < settings.cache_ttl_seconds:
            return cached[1]

        try:
            async with self._client.stream("GET", url, params=params) as response:
                if response.status_code == 404:
                    raise SourceError("not found (check the board name)")
                if response.status_code == 429:
                    raise SourceError("rate limited by the source; try again later")
                if response.status_code >= 400:
                    raise SourceError(f"source returned HTTP {response.status_code}")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > settings.max_response_bytes:
                        raise SourceError("source response exceeded the size limit")
        except httpx.TimeoutException as exc:
            raise SourceError("source timed out") from exc
        except httpx.HTTPError as exc:
            raise SourceError(f"network error: {exc.__class__.__name__}") from exc

        try:
            data = json.loads(body)
        except ValueError as exc:
            raise SourceError("source returned invalid JSON") from exc

        if len(self._cache) > 256:
            self._cache.clear()
        self._cache[key] = (time.monotonic(), data)
        return data
