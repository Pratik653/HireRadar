"""Remotive public remote-jobs API (https://remotive.com/api/remote-jobs)."""

from __future__ import annotations

from typing import ClassVar

from app.models import SearchRequest
from app.sources.base import FetchResult, RawRecord, SourceInfo, parse_datetime
from app.sources.http import SafeClient, SourceError
from app.text import strip_html

API = "https://remotive.com/api/remote-jobs"


class RemotiveAdapter:
    info: ClassVar[SourceInfo] = SourceInfo(
        key="remotive",
        label="Remotive",
        live=True,
        authentication="None. Public JSON API.",
        coverage="Remote roles worldwide; each job states the candidate locations it accepts.",
        rate_limits="Not published. Remotive asks for light use; HireRadar makes at most two "
        "requests per search and caches responses for 15 minutes.",
        terms="Jobs must link back to the Remotive URL and name Remotive as the source. "
        "Listings appear with a 24-hour delay. Do not resubmit jobs to other job boards.",
        reliability="Good. Stable public endpoint; publication dates are exact.",
    )

    async def fetch(self, request: SearchRequest, client: SafeClient) -> FetchResult:
        if "remote" not in request.work_modes:
            return FetchResult()
        queries = (request.titles[:1] + request.skills[:1]) or ["engineer"]
        records: dict[int, RawRecord] = {}
        errors: list[str] = []
        for query in queries:
            try:
                data = await client.get_json(API, params={"search": query, "limit": 100})
            except SourceError as exc:
                errors.append(str(exc))
                continue
            for job in (data or {}).get("jobs", []) if isinstance(data, dict) else []:
                if not isinstance(job, dict) or job.get("id") in records:
                    continue
                records[job["id"]] = RawRecord(
                    source=self.info.key,
                    source_label=self.info.label,
                    title=str(job.get("title") or "Untitled role"),
                    text=strip_html(str(job.get("description") or ""))[:6000],
                    company=job.get("company_name") or None,
                    location_raw=f"Remote — {job.get('candidate_required_location') or 'location not stated'}",
                    url=job.get("url"),
                    published_at=parse_datetime(job.get("publication_date")),
                    date_confidence="exact" if job.get("publication_date") else "unknown",
                    structured=True,
                    remote_hint=True,
                    extra={"tags": job.get("tags") or []},
                )
        if errors and not records:
            raise SourceError(errors[0])
        return FetchResult(list(records.values()), errors)
