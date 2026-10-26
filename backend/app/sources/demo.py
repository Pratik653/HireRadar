"""Synthetic demonstration data. Used only when the request says ``mode="demo"``
and never mixed into live results. Every record is flagged ``is_demo``."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import ClassVar

from app.models import Contact, SearchRequest
from app.sources.base import FetchResult, RawRecord, SourceInfo
from app.sources.http import SafeClient

DATA_FILE = Path(__file__).with_name("demo_data.json")


def load_demo_records(now: datetime | None = None) -> list[RawRecord]:
    now = now or datetime.now(UTC)
    items = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    records = []
    for item in items:
        published = None
        if item.get("hours_ago") is not None:
            published = now - timedelta(hours=item["hours_ago"])
        contact = None
        if item.get("contact_name"):
            contact = Contact(
                name=item["contact_name"],
                position=item.get("contact_position"),
                provenance="synthetic",
            )
        records.append(
            RawRecord(
                source="demo",
                source_label=f"Demo · {item['platform']}",
                title=item["title"],
                text=item["text"],
                company=item.get("company"),
                location_raw=item.get("location"),
                url=f"https://example.org/hireradar-demo/{item['id']}",
                published_at=published,
                date_confidence="exact" if published else "unknown",
                structured=item.get("structured", False),
                remote_hint=item.get("remote"),
                contact=contact,
                author_position=item.get("contact_position"),
                is_demo=True,
            )
        )
    return records


class DemoAdapter:
    info: ClassVar[SourceInfo] = SourceInfo(
        key="demo",
        label="Demo dataset (synthetic)",
        live=False,
        authentication="None.",
        coverage="Fictional companies and people in GCC cities.",
        rate_limits="None.",
        terms="Synthetic examples written for demonstration. Not real opportunities.",
        reliability="Not applicable. Links point to example.org.",
    )

    async def fetch(self, request: SearchRequest, client: SafeClient) -> FetchResult:
        return FetchResult(load_demo_records())
