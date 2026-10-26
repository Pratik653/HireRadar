"""Request and response contracts shared by the API, the engine and exporters."""

from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app import geo
from app.security import clean_text, safe_public_url

ShortText = Annotated[str, Field(max_length=120)]
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")


class Intent(str, Enum):
    EXPLICIT_VACANCY = "explicit_vacancy"
    HIRING_MANAGER = "hiring_manager"
    RECRUITER = "recruiter"
    GENERAL_RECRUITMENT = "general_recruitment"
    WEAK_SIGNAL = "weak_signal"
    UNRELATED = "unrelated"


INTENT_LABELS = {
    Intent.EXPLICIT_VACANCY: "Explicit vacancy",
    Intent.HIRING_MANAGER: "Direct hiring-manager announcement",
    Intent.RECRUITER: "Recruiter hiring announcement",
    Intent.GENERAL_RECRUITMENT: "General recruitment announcement",
    Intent.WEAK_SIGNAL: "Weak hiring signal",
    Intent.UNRELATED: "Unrelated content",
}

WorkMode = Literal["onsite", "hybrid", "remote"]
Seniority = Literal["intern", "junior", "mid", "senior", "lead", "manager", "executive"]
DateConfidence = Literal["exact", "reported", "unknown"]


class LocationSelection(BaseModel):
    country_code: str = Field(min_length=2, max_length=2)
    city: str | None = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _known(self) -> LocationSelection:
        self.country_code = self.country_code.upper()
        if geo.country_name(self.country_code) is None:
            raise ValueError(f"unsupported country code {self.country_code}")
        if self.city and not geo.known_city(self.country_code, self.city):
            raise ValueError(f"unsupported city {self.city} for {self.country_code}")
        return self


class CompanyBoard(BaseModel):
    """A public applicant-tracking job board, identified by provider and slug."""

    provider: Literal["greenhouse", "lever", "ashby"]
    slug: str = Field(min_length=1, max_length=64)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str) -> str:
        value = value.strip().lower()
        if not SLUG_RE.match(value):
            raise ValueError("board slug may only contain letters, digits, '.', '_' and '-'")
        return value


class ImportedPost(BaseModel):
    """A hiring post the user found and copied in themselves."""

    text: str = Field(min_length=20, max_length=8000)
    url: str | None = Field(default=None, max_length=2048)
    author_name: str | None = Field(default=None, max_length=120)
    author_position: str | None = Field(default=None, max_length=160)
    author_profile_url: str | None = Field(default=None, max_length=2048)
    company: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=160)
    published_at: datetime | None = None
    platform: str = Field(default="LinkedIn", max_length=40)

    @field_validator("url", "author_profile_url")
    @classmethod
    def _url(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        return safe_public_url(value)

    @field_validator("text", "author_name", "author_position", "company", "location", "platform")
    @classmethod
    def _clean(cls, value: str | None) -> str | None:
        return clean_text(value) if value is not None else None


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["demo", "live"] = "live"
    locations: list[LocationSelection] = Field(default_factory=list, max_length=40)
    work_modes: list[WorkMode] = Field(default_factory=lambda: ["onsite", "hybrid", "remote"])
    titles: list[ShortText] = Field(default_factory=list, max_length=15)
    skills: list[ShortText] = Field(default_factory=list, max_length=40)
    description: str = Field(default="", max_length=6000)
    resume_text: str = Field(default="", max_length=20000)
    exclusions: list[ShortText] = Field(default_factory=list, max_length=30)
    seniority: list[Seniority] = Field(default_factory=list, max_length=7)
    days: Literal[1, 3, 7, 14, 30] = 7
    include_undated: bool = True
    sources: list[Literal["remotive", "company_boards", "manual_import"]] = Field(
        default_factory=lambda: ["remotive", "company_boards", "manual_import"], max_length=5
    )
    company_boards: list[CompanyBoard] = Field(default_factory=list, max_length=12)
    imports: list[ImportedPost] = Field(default_factory=list, max_length=50)
    min_score: float = Field(default=0, ge=0, le=100)

    @field_validator("titles", "skills", "exclusions")
    @classmethod
    def _terms(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        for value in values:
            value = clean_text(value)
            if value and value.lower() not in {v.lower() for v in out}:
                out.append(value)
        return out

    @model_validator(mode="after")
    def _needs_target(self) -> SearchRequest:
        if not (self.titles or self.skills or self.description.strip()):
            raise ValueError("provide at least one job title, skill or a job description")
        return self


class Contact(BaseModel):
    name: str | None = None
    position: str | None = None
    profile_url: str | None = None
    provenance: Literal["user_provided", "source_listing", "synthetic"]


class ScoreBreakdown(BaseModel):
    role: float
    intent: float
    geography: float
    recency: float


class Opportunity(BaseModel):
    id: str
    title: str
    company: str | None = None
    country: str | None = None
    city: str | None = None
    location_raw: str | None = None
    work_mode: WorkMode | None = None
    seniority: Seniority | None = None
    published_at: datetime | None = None
    date_confidence: DateConfidence = "unknown"
    intent: Intent
    intent_label: str
    score: float
    breakdown: ScoreBreakdown
    explanations: list[str]
    matched_skills: list[str] = Field(default_factory=list)
    source: str
    source_label: str
    source_url: str | None = None
    contact: Contact | None = None
    snippet: str = ""
    is_demo: bool = False
    duplicates: list[str] = Field(default_factory=list)


class SourceStatus(BaseModel):
    source: str
    label: str
    status: Literal["ok", "empty", "error", "skipped"]
    live: bool
    fetched: int = 0
    message: str | None = None


class SearchSummary(BaseModel):
    fetched: int
    returned: int
    removed_duplicates: int
    removed_by_exclusion: int
    removed_by_location: int
    removed_by_date: int
    removed_unrelated: int
    removed_below_min_score: int
    removed_low_relevance: int
    undated: int


class SearchResponse(BaseModel):
    mode: Literal["demo", "live"]
    generated_at: datetime
    request: SearchRequest
    results: list[Opportunity]
    summary: SearchSummary
    sources: list[SourceStatus]
    weights: dict[str, float]
    notes: list[str] = Field(default_factory=list)


class TrackedStatus(BaseModel):
    status: Literal["not_applied", "saved", "applied", "contacted", "interviewing", "offer", "rejected"] = "not_applied"
    follow_up: str | None = Field(default=None, max_length=10)
    notes: str | None = Field(default=None, max_length=1000)


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    response: SearchResponse
    tracking: dict[str, TrackedStatus] = Field(default_factory=dict, max_length=500)
