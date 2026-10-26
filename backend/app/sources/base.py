"""The adapter contract every discovery source implements."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import ClassVar, Protocol

from app.models import Contact, DateConfidence, SearchRequest
from app.sources.http import SafeClient


@dataclass
class RawRecord:
    """A source item before scoring. Adapters fill what they know and leave the
    rest as ``None``; nothing is guessed."""

    source: str
    source_label: str
    title: str
    text: str
    company: str | None = None
    location_raw: str | None = None
    url: str | None = None
    published_at: datetime | None = None
    date_confidence: DateConfidence = "unknown"
    structured: bool = False
    remote_hint: bool | None = None
    contact: Contact | None = None
    author_position: str | None = None
    is_demo: bool = False
    extra: dict = field(default_factory=dict)


@dataclass
class FetchResult:
    records: list[RawRecord] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SourceInfo:
    key: str
    label: str
    live: bool
    authentication: str
    coverage: str
    rate_limits: str
    terms: str
    reliability: str


class SourceAdapter(Protocol):
    info: ClassVar[SourceInfo]

    async def fetch(self, request: SearchRequest, client: SafeClient) -> FetchResult: ...


def parse_datetime(value: object) -> datetime | None:
    """Parse ISO-8601 strings or epoch milliseconds; return aware UTC or ``None``."""
    if value in (None, ""):
        return None
    try:
        if isinstance(value, int | float):
            parsed = datetime.fromtimestamp(value / 1000, tz=UTC)
        else:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, OverflowError, OSError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
