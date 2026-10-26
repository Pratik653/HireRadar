"""Runtime settings read from environment variables.

Everything has a safe default so the API starts locally with no configuration.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _csv(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    allowed_origins: list[str] = field(default_factory=list)
    max_body_bytes: int = 256_000
    rate_limit_per_minute: int = 30
    source_timeout_seconds: float = 12.0
    search_timeout_seconds: float = 25.0
    max_response_bytes: int = 6_000_000
    cache_ttl_seconds: int = 900
    log_level: str = "INFO"


def load_settings() -> Settings:
    origins = _csv(
        os.getenv(
            "ALLOWED_ORIGINS",
            "https://pratik653.github.io,http://localhost:5173,http://127.0.0.1:5173",
        )
    )
    return Settings(
        allowed_origins=origins,
        max_body_bytes=int(os.getenv("MAX_BODY_BYTES", "256000")),
        rate_limit_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "30")),
        source_timeout_seconds=float(os.getenv("SOURCE_TIMEOUT_SECONDS", "12")),
        search_timeout_seconds=float(os.getenv("SEARCH_TIMEOUT_SECONDS", "25")),
        max_response_bytes=int(os.getenv("MAX_UPSTREAM_RESPONSE_BYTES", "6000000")),
        cache_ttl_seconds=int(os.getenv("CACHE_TTL_SECONDS", "900")),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )


settings = load_settings()
