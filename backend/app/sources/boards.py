"""Public applicant-tracking-system job boards: Greenhouse, Lever and Ashby.

Each of these vendors publishes an official, unauthenticated job-board API so
that companies can show their openings on other sites. The user chooses which
company boards to query; the server only builds URLs on the vendor's API host
from a validated slug.
"""

from __future__ import annotations

import asyncio
import html
from typing import ClassVar

from app.models import CompanyBoard, SearchRequest
from app.sources.base import FetchResult, RawRecord, SourceInfo, parse_datetime
from app.sources.http import SafeClient, SourceError
from app.text import strip_html

MAX_TEXT = 6000


def _company_from_slug(slug: str) -> str:
    return slug.replace("-", " ").replace("_", " ").title()


def _greenhouse(board: CompanyBoard, data: object) -> list[RawRecord]:
    jobs = data.get("jobs", []) if isinstance(data, dict) else []
    out = []
    for job in jobs:
        published = parse_datetime(job.get("first_published"))
        out.append(
            RawRecord(
                source="greenhouse",
                source_label="Greenhouse",
                title=str(job.get("title") or "Untitled role"),
                text=strip_html(html.unescape(str(job.get("content") or "")))[:MAX_TEXT],
                company=job.get("company_name") or _company_from_slug(board.slug),
                location_raw=(job.get("location") or {}).get("name"),
                url=job.get("absolute_url"),
                published_at=published,
                date_confidence="exact" if published else "unknown",
                structured=True,
            )
        )
    return out


def _lever(board: CompanyBoard, data: object) -> list[RawRecord]:
    jobs = data if isinstance(data, list) else []
    out = []
    for job in jobs:
        categories = job.get("categories") or {}
        lists = " ".join(
            f"{item.get('text', '')}: {strip_html(item.get('content', ''))}" for item in job.get("lists") or []
        )
        created = parse_datetime(job.get("createdAt"))
        workplace = job.get("workplaceType")
        out.append(
            RawRecord(
                source="lever",
                source_label="Lever",
                title=str(job.get("text") or "Untitled role"),
                text=f"{job.get('descriptionPlain') or ''} {lists}".strip()[:MAX_TEXT],
                company=_company_from_slug(board.slug),
                location_raw=", ".join(categories.get("allLocations") or []) or categories.get("location"),
                url=job.get("hostedUrl"),
                published_at=created,
                # Lever exposes the posting's creation time, not its publish time.
                date_confidence="reported" if created else "unknown",
                structured=True,
                remote_hint=True if workplace == "remote" else None,
            )
        )
    return out


def _ashby(board: CompanyBoard, data: object) -> list[RawRecord]:
    jobs = data.get("jobs", []) if isinstance(data, dict) else []
    out = []
    for job in jobs:
        if job.get("isListed") is False:
            continue
        locations = [job.get("location")] + [(loc or {}).get("location") for loc in job.get("secondaryLocations") or []]
        published = parse_datetime(job.get("publishedAt"))
        out.append(
            RawRecord(
                source="ashby",
                source_label="Ashby",
                title=str(job.get("title") or "Untitled role"),
                text=str(job.get("descriptionPlain") or "")[:MAX_TEXT],
                company=_company_from_slug(board.slug),
                location_raw=", ".join(loc for loc in locations if loc) or None,
                url=job.get("jobUrl"),
                published_at=published,
                date_confidence="exact" if published else "unknown",
                structured=True,
                remote_hint=True if job.get("isRemote") or job.get("workplaceType") == "Remote" else None,
            )
        )
    return out


PROVIDERS = {
    "greenhouse": ("https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", {"content": "true"}, _greenhouse),
    "lever": ("https://api.lever.co/v0/postings/{slug}", {"mode": "json"}, _lever),
    "ashby": ("https://api.ashbyhq.com/posting-api/job-board/{slug}", None, _ashby),
}


class CompanyBoardsAdapter:
    info: ClassVar[SourceInfo] = SourceInfo(
        key="company_boards",
        label="Company career boards",
        live=True,
        authentication="None. Greenhouse, Lever and Ashby publish official public job-board APIs.",
        coverage="Only the companies you add. Suggested GCC boards: Careem and Tamara (Greenhouse), Ziina (Ashby).",
        rate_limits="Not published for read-only board APIs. One request per board per search, "
        "cached for 15 minutes; at most 12 boards per search.",
        terms="Data is published by each company for display on third-party sites. Link to the "
        "original posting and do not alter job details.",
        reliability="High. These endpoints back companies' own careers pages. Lever reports "
        "creation time rather than publish time; HireRadar labels those dates as 'reported'.",
    )

    async def fetch(self, request: SearchRequest, client: SafeClient) -> FetchResult:
        async def one(board: CompanyBoard) -> list[RawRecord]:
            template, params, parse = PROVIDERS[board.provider]
            try:
                data = await client.get_json(template.format(slug=board.slug), params=params)
            except SourceError as exc:
                raise SourceError(f"{board.provider}/{board.slug}: {exc}") from exc
            return parse(board, data)

        results = await asyncio.gather(*(one(b) for b in request.company_boards), return_exceptions=True)
        records: list[RawRecord] = []
        errors: list[str] = []
        for result in results:
            if isinstance(result, SourceError):
                errors.append(str(result))
            elif isinstance(result, Exception):
                errors.append("unexpected response format")
            else:
                records.extend(result)
        if errors and not records:
            raise SourceError("; ".join(errors))
        return FetchResult(records, errors)
