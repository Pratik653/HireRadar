"""Hiring posts the user found themselves (for example via LinkedIn research
mode) and pasted into HireRadar. Nothing is fetched; the URL is kept as evidence."""

from __future__ import annotations

from typing import ClassVar

from app.models import Contact, SearchRequest
from app.sources.base import FetchResult, RawRecord, SourceInfo
from app.sources.http import SafeClient


def _title_from(text: str) -> str:
    first = text.strip().splitlines()[0] if text.strip() else ""
    return first[:120] or "Imported hiring post"


class ManualImportAdapter:
    info: ClassVar[SourceInfo] = SourceInfo(
        key="manual_import",
        label="Your imported posts",
        live=True,
        authentication="None. You paste post text, links and dates you collected yourself.",
        coverage="Whatever you import, from any platform.",
        rate_limits="None.",
        terms="You are responsible for copying only content you are allowed to view and keep. "
        "HireRadar does not fetch the URLs you enter.",
        reliability="As accurate as the imported data. Contact details are marked as user-provided.",
    )

    async def fetch(self, request: SearchRequest, client: SafeClient) -> FetchResult:
        records = []
        for post in request.imports:
            contact = None
            if post.author_name or post.author_profile_url:
                contact = Contact(
                    name=post.author_name,
                    position=post.author_position,
                    profile_url=post.author_profile_url,
                    provenance="user_provided",
                )
            records.append(
                RawRecord(
                    source=self.info.key,
                    source_label=f"{post.platform} (imported)",
                    title=_title_from(post.text),
                    text=post.text,
                    company=post.company,
                    location_raw=post.location,
                    url=post.url,
                    published_at=post.published_at,
                    date_confidence="reported" if post.published_at else "unknown",
                    contact=contact,
                    author_position=post.author_position,
                )
            )
        return FetchResult(records)
