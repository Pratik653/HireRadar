"""Runs the selected source adapters concurrently and scores their output."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from app.config import settings
from app.models import SearchRequest, SearchResponse, SourceStatus
from app.scoring import WEIGHTS, score
from app.sources import DEMO_ADAPTER, LIVE_ADAPTERS, RawRecord, SourceAdapter
from app.sources.http import SafeClient, SourceError

log = logging.getLogger("hireradar.search")

LIVE_NOTES = [
    "LinkedIn is not searched automatically. Use LinkedIn research mode to open searches "
    "yourself, then import the posts you want scored.",
    "Remotive listings appear with a 24-hour delay, per Remotive's API terms.",
]
DEMO_NOTES = ["DEMO MODE: every result below is synthetic. Companies, people and links are fictional."]


async def _run(
    key: str, adapter: SourceAdapter, request: SearchRequest, client: SafeClient
) -> tuple[SourceStatus, list[RawRecord]]:
    info = adapter.info
    if key == "company_boards" and not request.company_boards:
        return SourceStatus(
            source=key, label=info.label, status="skipped", live=info.live, message="No company boards selected."
        ), []
    if key == "manual_import" and not request.imports:
        return SourceStatus(
            source=key, label=info.label, status="skipped", live=info.live, message="No posts imported."
        ), []
    if key == "remotive" and "remote" not in request.work_modes:
        return SourceStatus(
            source=key,
            label=info.label,
            status="skipped",
            live=info.live,
            message="Remotive lists remote roles only; remote is not selected.",
        ), []
    try:
        result = await asyncio.wait_for(adapter.fetch(request, client), timeout=settings.search_timeout_seconds)
    except SourceError as exc:
        return SourceStatus(source=key, label=info.label, status="error", live=info.live, message=str(exc)), []
    except TimeoutError:
        return SourceStatus(
            source=key, label=info.label, status="error", live=info.live, message="source did not respond in time"
        ), []
    except Exception:  # an adapter bug must not take down the whole search
        log.exception("adapter %s failed", key)
        return SourceStatus(
            source=key,
            label=info.label,
            status="error",
            live=info.live,
            message="unexpected error while reading this source",
        ), []
    status = "ok" if result.records else "empty"
    message = "; ".join(result.warnings) or None
    return SourceStatus(
        source=key, label=info.label, status=status, live=info.live, fetched=len(result.records), message=message
    ), result.records


async def run_search(request: SearchRequest, client: SafeClient, now: datetime | None = None) -> SearchResponse:
    now = now or datetime.now(UTC)
    if request.mode == "demo":
        jobs = [("demo", DEMO_ADAPTER)]
    else:
        jobs = [(key, LIVE_ADAPTERS[key]) for key in LIVE_ADAPTERS if key in request.sources]

    outcomes = await asyncio.gather(*(_run(key, adapter, request, client) for key, adapter in jobs))
    statuses = [status for status, _ in outcomes]
    records = [record for _, batch in outcomes for record in batch]

    results, summary = score(records, request, now)
    return SearchResponse(
        mode=request.mode,
        generated_at=now,
        request=request,
        results=results,
        summary=summary,
        sources=statuses,
        weights=WEIGHTS,
        notes=DEMO_NOTES if request.mode == "demo" else LIVE_NOTES,
    )
