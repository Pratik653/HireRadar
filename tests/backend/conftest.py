from datetime import UTC, datetime, timedelta

import pytest

from app.models import SearchRequest
from app.sources.base import RawRecord

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=UTC)


@pytest.fixture
def now() -> datetime:
    return NOW


def record(**overrides) -> RawRecord:
    base = dict(
        source="test",
        source_label="Test",
        title="Senior Python Developer",
        text="We are hiring a Senior Python Developer. Requirements: 5+ years of Python and FastAPI.",
        company="Example Co",
        location_raw="Dubai, United Arab Emirates",
        url="https://jobs.example.com/1",
        published_at=NOW - timedelta(days=1),
        date_confidence="exact",
    )
    base.update(overrides)
    return RawRecord(**base)


def request(**overrides) -> SearchRequest:
    base = dict(
        titles=["Python Developer"],
        skills=["Python", "FastAPI"],
        locations=[{"country_code": "AE", "city": "Dubai"}],
        days=7,
        sources=["manual_import"],
    )
    base.update(overrides)
    return SearchRequest(**base)
