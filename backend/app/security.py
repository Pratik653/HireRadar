"""Input hygiene, URL safety, rate limiting and request-size limits.

HireRadar never fetches a user-supplied URL. User URLs are only validated and
echoed back as links. Outbound requests go to a fixed allowlist of API hosts
(see ``app.sources.http``), which is the SSRF boundary.
"""

from __future__ import annotations

import ipaddress
import re
import time
from collections import defaultdict, deque
from urllib.parse import urlsplit, urlunsplit

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_BLOCKED_HOST_SUFFIXES = (".local", ".localhost", ".internal", ".lan", ".home", ".corp")


def clean_text(value: str) -> str:
    """Drop control characters and collapse surrounding whitespace."""
    return _CONTROL.sub("", value).strip()


def safe_public_url(value: str) -> str:
    """Return a normalised http(s) URL or raise ``ValueError``.

    Rejects other schemes (``javascript:``, ``data:``, ``file:``), embedded
    credentials, raw IP addresses and internal host names. The result is safe to
    render as a link; it is never fetched by the server.
    """
    value = clean_text(value)
    if len(value) > 2048:
        raise ValueError("URL is too long")
    parts = urlsplit(value)
    if parts.scheme.lower() not in {"http", "https"}:
        raise ValueError("only http and https links are accepted")
    if parts.username or parts.password:
        raise ValueError("links with embedded credentials are not accepted")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host or "." not in host:
        raise ValueError("link must have a public host name")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("links to raw IP addresses are not accepted")
    if host == "localhost" or host.endswith(_BLOCKED_HOST_SUFFIXES):
        raise ValueError("links to internal hosts are not accepted")
    netloc = host if parts.port in (None, 80, 443) else f"{host}:{parts.port}"
    return urlunsplit((parts.scheme.lower(), netloc, parts.path or "/", parts.query, ""))


def maybe_safe_url(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return safe_public_url(value)
    except ValueError:
        return None


class RateLimiter:
    """Sliding-window limiter keyed by client address. In-memory by design:
    the service runs as one process and losing counters on restart is fine."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        window = self._hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= self.per_minute:
            return False
        window.append(now)
        if len(self._hits) > 10_000:
            self._hits = defaultdict(deque, {key: window})
        return True


def client_key(request: Request) -> str:
    # Render terminates TLS at a proxy and sets X-Forwarded-For; the first hop is the client.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class GuardMiddleware(BaseHTTPMiddleware):
    """Rate-limit and size-limit POST requests under ``/api``."""

    def __init__(self, app, limiter: RateLimiter, body_limits: dict[str, int], default_limit: int):
        super().__init__(app)
        self.limiter = limiter
        self.body_limits = body_limits
        self.default_limit = default_limit

    async def dispatch(self, request: Request, call_next):
        if request.method == "POST" and request.url.path.startswith("/api/"):
            if not self.limiter.allow(client_key(request)):
                return JSONResponse(
                    {"detail": "Too many requests. Please wait a minute and try again."},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )
            limit = self.body_limits.get(request.url.path, self.default_limit)
            declared = request.headers.get("content-length")
            if declared is not None and (not declared.isdigit() or int(declared) > limit):
                return JSONResponse({"detail": "Request body is too large."}, status_code=413)
            body = await request.body()
            if len(body) > limit:
                return JSONResponse({"detail": "Request body is too large."}, status_code=413)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response
