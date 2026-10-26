"""Filtering, explainable relevance scoring and deduplication.

The score is a weighted sum of four components, each in [0, 1]:

    role      40%  title overlap, skill coverage and TF-IDF similarity
    intent    30%  hiring-intent class (see ``app.intent``)
    geography 20%  match against the selected countries, cities and work modes
    recency   10%  linear decay across the selected publication window

The weights are starting heuristics, not validated accuracy measures.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app import geo
from app.intent import classify
from app.models import (
    INTENT_LABELS,
    Contact,
    Intent,
    LocationSelection,
    Opportunity,
    ScoreBreakdown,
    SearchRequest,
    SearchSummary,
)
from app.security import maybe_safe_url
from app.sources.base import RawRecord
from app.text import (
    canonical_skill,
    contains_term,
    detect_seniority,
    normalize_title,
    role_families,
    skills_in,
    snippet,
    title_core,
)

WEIGHTS = {"role": 0.4, "intent": 0.3, "geography": 0.2, "recency": 0.1}
TFIDF_SATURATION = 0.35  # cosine at or above this counts as a full text match
DUPLICATE_TEXT_SIMILARITY = 0.9
# Below this role relevance an item is hidden: intent, location and recency alone
# would otherwise lift an unrelated vacancy to a mid-table score.
MIN_ROLE_RELEVANCE = 0.15


@dataclass
class _Candidate:
    record: RawRecord
    intent: Intent
    intent_score: float
    intent_evidence: str
    place: geo.Place | None
    work_mode: str | None
    geo_score: float
    geo_reason: str
    recency: float
    recency_reason: str
    doc: str
    explanations: list[str] = field(default_factory=list)


@dataclass
class Counts:
    fetched: int = 0
    exclusion: int = 0
    location: int = 0
    date: int = 0
    unrelated: int = 0
    min_score: int = 0
    low_relevance: int = 0
    duplicates: int = 0
    undated: int = 0


@dataclass(frozen=True)
class _Geo:
    keep: bool
    score: float
    reason: str
    place: geo.Place | None
    mode: str | None


def _match(place: geo.Place, sel: LocationSelection) -> tuple[float, str]:
    """How well one detected place satisfies one selected location."""
    if sel.region:
        if place.country_code in sel.countries():
            return 1.0, f"{place.label} is in {sel.label}"
        return 0.0, ""
    if place.country_code != sel.country_code:
        return 0.0, ""
    if sel.city:
        if place.city == sel.city and (sel.subdivision is None or place.subdivision == sel.subdivision):
            return 1.0, f"{place.label} matches your selection"
        if sel.subdivision and place.subdivision == sel.subdivision:
            return 0.7, f"{place.label}: same state/province as {sel.city}, different city"
        return 0.6, f"{place.label}: same country as {sel.city}, different or unstated city"
    if sel.subdivision:
        if place.subdivision == sel.subdivision:
            return 1.0, f"{place.label} is in {sel.label}"
        return 0.6, f"{place.label}: same country, outside {sel.label}"
    return 1.0, f"{place.label} is in {place.country}, which you selected"


def _geography(record: RawRecord, request: SearchRequest) -> _Geo:
    """Location relevance. Selections are OR-ed: the best match counts."""
    location = record.location_raw or ""
    places, regions = geo.catalog().scan(location)
    if not location.strip():
        places = geo.find_places(record.text[:600], strict=True)
    mode = geo.detect_work_mode(location) or (
        "remote" if record.remote_hint else geo.detect_work_mode(record.text[:600])
    )
    first = places[0] if places else None

    if mode and mode not in request.work_modes:
        return _Geo(False, 0, f"{mode} roles are not in your work-mode preferences", first, mode)
    selections = request.locations
    if not selections:
        return _Geo(True, 1.0, "no location filter selected", first, mode)
    if any(sel.region == "world" for sel in selections):
        return _Geo(True, 1.0, "worldwide selected", first, mode)

    best = (0.0, "", first)
    for place in places:
        for sel in selections:
            score, reason = _match(place, sel)
            if score > best[0]:
                best = (score, reason, place)
    score, reason, place = best

    if mode == "remote":
        if score > 0:
            # A remote role only needs to accept candidates in that country.
            return _Geo(True, max(score, 0.9), f"remote role; {reason}", place, mode)
        wanted = set().union(*(sel.countries() for sel in selections))
        if regions & wanted:
            return _Geo(True, 0.9, "remote role open to a region that includes your selection", first, mode)
        if places or regions:
            return _Geo(False, 0, f"remote role limited to '{location}', outside your selection", first, mode)
        if geo.WORLDWIDE_PATTERN.search(location):
            return _Geo(True, 0.8, "remote role open worldwide", first, mode)
        return _Geo(True, 0.5, "remote role; candidate-location eligibility not verified", first, mode)

    if score > 0:
        return _Geo(True, score, reason, place, mode)
    if places or regions or location.strip():
        where = location or (first.label if first else "")
        return _Geo(False, 0, f"location '{where}' is outside your selection", first, mode)
    return _Geo(True, 0.3, "location not stated; verify before applying", None, mode)


def _recency(record: RawRecord, request: SearchRequest, now: datetime) -> tuple[bool, float, str]:
    if record.published_at is None:
        if not request.include_undated:
            return False, 0, "no publication date"
        return True, 0.0, "publication date unknown; not counted toward recency"
    age = max(timedelta(0), now - record.published_at)
    window = timedelta(days=request.days)
    if age > window:
        return False, 0, "older than the selected window"
    days = age.total_seconds() / 86400
    label = "reported " if record.date_confidence == "reported" else ""
    age_text = f"{int(age.total_seconds() // 3600)} hours" if days < 2 else f"{days:.0f} days"
    return True, round(1 - age / window, 3), f"{label}published {age_text} ago (window {request.days}d)"


def _query_document(request: SearchRequest) -> str:
    skills = " ".join(canonical_skill(s) + " " + s for s in request.skills)
    titles = " ".join(normalize_title(t) for t in request.titles)
    return " ".join([titles, titles, skills, request.description, request.resume_text[:4000]])


def _title_overlap(job_title: str, wanted: list[str]) -> tuple[float, str | None]:
    """Share of a target title's words found in the job title, best target wins.
    A different kind of role (engineering vs sales) cuts the overlap by 60%."""
    job_words = title_core(job_title)
    job_families = role_families(job_title)
    best, best_title = 0.0, None
    for title in wanted:
        want = title_core(title)
        if not want:
            continue
        overlap = len(want & job_words) / len(want)
        want_families = role_families(title)
        if want_families and job_families and not want_families & job_families:
            overlap *= 0.4
        if overlap > best:
            best, best_title = overlap, title
    return best, best_title


def _stable_id(record: RawRecord) -> str:
    raw = "|".join([record.source, record.url or "", record.title, record.company or ""])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _dedupe_key(opp: Opportunity) -> tuple[str, str, str]:
    company = re.sub(r"[^a-z0-9]", "", (opp.company or "").lower())
    title = " ".join(sorted(title_core(opp.title)))
    return company, title, (opp.city or "").lower()


def score(records: list[RawRecord], request: SearchRequest, now: datetime) -> tuple[list[Opportunity], SearchSummary]:
    counts = Counts(fetched=len(records))
    candidates: list[_Candidate] = []

    for record in records:
        haystack = f"{record.title}\n{record.text}"
        if any(contains_term(haystack, term) for term in request.exclusions):
            counts.exclusion += 1
            continue

        result = classify(haystack, record.author_position, structured_listing=record.structured)
        if result.intent is Intent.UNRELATED:
            counts.unrelated += 1
            continue

        location = _geography(record, request)
        if not location.keep:
            counts.location += 1
            continue

        keep, recency, recency_reason = _recency(record, request, now)
        if not keep:
            counts.date += 1
            continue
        if record.published_at is None:
            counts.undated += 1

        candidates.append(
            _Candidate(
                record=record,
                intent=result.intent,
                intent_score=result.score,
                intent_evidence=result.evidence,
                place=location.place,
                work_mode=location.mode,
                geo_score=location.score,
                geo_reason=location.reason,
                recency=recency,
                recency_reason=recency_reason,
                doc=f"{normalize_title(record.title)} {normalize_title(record.title)} {record.text}",
            )
        )

    similarities: list[float] = []
    if candidates:
        vectorizer = TfidfVectorizer(stop_words="english", sublinear_tf=True, ngram_range=(1, 2))
        matrix = vectorizer.fit_transform([_query_document(request)] + [c.doc for c in candidates])
        similarities = cosine_similarity(matrix[0:1], matrix[1:])[0].tolist()
        doc_matrix = matrix[1:]
    else:
        doc_matrix = None

    opportunities: list[Opportunity] = []
    rows: dict[int, int] = {}  # id(opportunity) -> row in the TF-IDF document matrix
    for index, cand in enumerate(candidates):
        record = cand.record
        text_sim = min(1.0, similarities[index] / TFIDF_SATURATION)
        parts: list[tuple[float, float]] = [(0.3, text_sim)]
        explanations: list[str] = []

        title_score, title_hit = _title_overlap(record.title, request.titles)
        if request.titles:
            parts.append((0.35, title_score))
            if title_hit:
                explanations.append(f"Role: title overlaps {round(title_score * 100)}% with '{title_hit}'")
            else:
                explanations.append("Role: title does not match your target titles")

        matched = skills_in(f"{record.title} {record.text} {' '.join(record.extra.get('tags', []))}", request.skills)
        if request.skills:
            coverage = len(matched) / len(request.skills)
            parts.append((0.35, coverage))
            if matched:
                explanations.append(f"Skills: {len(matched)}/{len(request.skills)} matched ({', '.join(matched)})")
            else:
                explanations.append("Skills: none of your skill keywords found")

        role = sum(w * v for w, v in parts) / sum(w for w, _ in parts)
        explanations.append(f"Text similarity to your target profile: {round(text_sim * 100)}%")

        seniority = detect_seniority(record.title)
        if request.seniority and seniority and seniority not in request.seniority:
            role *= 0.8
            explanations.append(f"Seniority '{seniority}' is outside your preference (role score ×0.8)")

        # Text similarity alone is not enough: a shared word like "AI" must not make
        # a sales role relevant to an engineer. Require a title word or a skill.
        no_direct_match = (request.titles or request.skills) and title_score < 0.5 and not matched
        if role < MIN_ROLE_RELEVANCE or no_direct_match:
            counts.low_relevance += 1
            continue

        explanations.append(f"Intent: {INTENT_LABELS[cand.intent]} — {cand.intent_evidence}")
        explanations.append(f"Location: {cand.geo_reason}")
        explanations.append(f"Recency: {cand.recency_reason}")

        breakdown = ScoreBreakdown(
            role=round(role, 3), intent=cand.intent_score, geography=cand.geo_score, recency=cand.recency
        )
        total = 100 * (
            WEIGHTS["role"] * breakdown.role
            + WEIGHTS["intent"] * breakdown.intent
            + WEIGHTS["geography"] * breakdown.geography
            + WEIGHTS["recency"] * breakdown.recency
        )
        if total < request.min_score:
            counts.min_score += 1
            continue

        contact = record.contact
        if contact is not None:
            contact = Contact(
                name=contact.name,
                position=contact.position,
                profile_url=maybe_safe_url(contact.profile_url),
                provenance=contact.provenance,
            )
        opportunities.append(
            Opportunity(
                id=_stable_id(record),
                title=record.title,
                company=record.company,
                country=cand.place.country if cand.place else None,
                subdivision=cand.place.subdivision_name if cand.place else None,
                city=cand.place.city if cand.place else None,
                location_raw=record.location_raw,
                work_mode=cand.work_mode,
                seniority=seniority,
                published_at=record.published_at,
                date_confidence=record.date_confidence if record.published_at else "unknown",
                intent=cand.intent,
                intent_label=INTENT_LABELS[cand.intent],
                score=round(total, 1),
                breakdown=breakdown,
                explanations=explanations,
                matched_skills=matched,
                source=record.source,
                source_label=record.source_label,
                source_url=maybe_safe_url(record.url),
                contact=contact,
                snippet=snippet(record.text, request.skills + request.titles),
                is_demo=record.is_demo,
            )
        )
        rows[id(opportunities[-1])] = index

    kept = dedupe(opportunities, doc_matrix, rows)
    counts.duplicates = len(opportunities) - len(kept)
    kept.sort(key=lambda o: o.score, reverse=True)

    summary = SearchSummary(
        fetched=counts.fetched,
        returned=len(kept),
        removed_duplicates=counts.duplicates,
        removed_by_exclusion=counts.exclusion,
        removed_by_location=counts.location,
        removed_by_date=counts.date,
        removed_unrelated=counts.unrelated,
        removed_below_min_score=counts.min_score,
        removed_low_relevance=counts.low_relevance,
        undated=sum(1 for o in kept if o.published_at is None),
    )
    return kept, summary


def dedupe(opportunities: list[Opportunity], doc_matrix=None, rows: dict[int, int] | None = None) -> list[Opportunity]:
    """Collapse the same opening seen more than once.

    Two items are duplicates when they share a source URL, or the same company,
    core title words and city, or the same company with near-identical text.
    The highest-scoring copy is kept and lists where the others came from.
    """
    ordered = sorted(opportunities, key=lambda o: o.score, reverse=True)
    kept: list[Opportunity] = []
    for opp in ordered:
        match = None
        for existing in kept:
            if opp.source_url and opp.source_url == existing.source_url:
                match = existing
            elif opp.company and _dedupe_key(opp) == _dedupe_key(existing):
                match = existing
            elif (
                doc_matrix is not None
                and rows
                and opp.company
                and opp.company.lower() == (existing.company or "").lower()
                and cosine_similarity(doc_matrix[rows[id(opp)]], doc_matrix[rows[id(existing)]])[0][0]
                >= DUPLICATE_TEXT_SIMILARITY
            ):
                match = existing
            if match:
                break
        if match:
            match.duplicates.append(opp.source_url or f"{opp.source_label}: {opp.title}")
        else:
            kept.append(opp)
    return kept
