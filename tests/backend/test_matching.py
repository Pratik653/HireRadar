"""Geography, dates, normalisation, intent, scoring and deduplication."""

from datetime import timedelta

import pytest
from conftest import NOW, record, request

from app import geo
from app.intent import classify
from app.models import Intent
from app.scoring import score
from app.text import canonical_skill, detect_seniority, normalize_title, skills_in

# --- normalisation -------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Sr. ML Eng", "senior machine learning engineer"),
        ("GenAI / LLM Engineer", "generative ai large language model engineer"),
        ("Python Dev (FastAPI)", "python developer fastapi"),
    ],
)
def test_normalize_title(raw, expected):
    assert normalize_title(raw) == expected


def test_skill_synonyms_map_to_canonical():
    assert canonical_skill("Retrieval Augmented Generation") == "rag"
    assert canonical_skill("GenAI") == "llm"
    text = "Build retrieval-augmented generation with large language models and LangGraph"
    assert skills_in(text, ["RAG", "LLM", "LangGraph", "Kotlin"]) == ["rag", "llm", "langgraph"]


def test_skill_match_respects_word_boundaries():
    assert skills_in("Strong HTML and CSS", ["ML"]) == []


@pytest.mark.parametrize(
    ("title", "level"),
    [("Senior Data Engineer", "senior"), ("Head of AI", "executive"), ("ML Intern", "intern"), ("Data Engineer", None)],
)
def test_seniority(title, level):
    assert detect_seniority(title) == level


# --- geography -----------------------------------------------------------------


def test_find_places_city_and_alias():
    places = geo.find_places("Hybrid — DIFC, Dubai")
    assert [(p.country_code, p.city) for p in places] == [("AE", "Dubai")]
    assert geo.find_places("Riyadh, KSA")[0].city == "Riyadh"
    assert geo.find_places("Kingdom of Saudi Arabia")[0].city is None


def test_geo_filter_keeps_selected_city_and_drops_others(now):
    items = [
        record(title="Python Developer A", location_raw="Dubai, UAE", url="https://x.example.com/a"),
        record(title="Python Developer B", location_raw="Riyadh, Saudi Arabia", url="https://x.example.com/b"),
        record(title="Python Developer C", location_raw="San Francisco, CA", url="https://x.example.com/c"),
    ]
    results, summary = score(items, request(), now)
    assert [r.city for r in results] == ["Dubai"]
    assert summary.removed_by_location == 2


def test_geo_same_country_other_city_scores_lower(now):
    req = request(locations=[{"country_code": "AE", "city": "Dubai"}])
    results, _ = score([record(location_raw="Abu Dhabi, UAE")], req, now)
    assert results[0].breakdown.geography == 0.6


def test_geo_whole_country_selection(now):
    req = request(locations=[{"country_code": "SA"}])
    results, _ = score([record(location_raw="Jeddah, Saudi Arabia")], req, now)
    assert results[0].breakdown.geography == 1.0


def test_remote_roles_follow_work_mode_preference(now):
    remote = record(location_raw="Remote — Worldwide", remote_hint=True)
    assert score([remote], request(work_modes=["onsite", "hybrid", "remote"]), now)[0][0].breakdown.geography == 0.8
    results, summary = score([remote], request(work_modes=["onsite"]), now)
    assert results == [] and summary.removed_by_location == 1


def test_unknown_location_kept_with_low_score(now):
    results, _ = score([record(location_raw=None, text="We are hiring a Python developer. Apply now.")], request(), now)
    assert results[0].breakdown.geography == 0.3


# --- dates ---------------------------------------------------------------------


def test_date_window_filters_old_items(now):
    items = [
        record(published_at=NOW - timedelta(days=2), url="https://x.example.com/new"),
        record(published_at=NOW - timedelta(days=10), url="https://x.example.com/old", title="Python Dev Old"),
    ]
    results, summary = score(items, request(days=7), now)
    assert len(results) == 1 and summary.removed_by_date == 1


def test_undated_items_are_not_given_a_date(now):
    item = record(published_at=None, date_confidence="unknown")
    results, summary = score([item], request(include_undated=True), now)
    assert results[0].published_at is None
    assert results[0].date_confidence == "unknown"
    assert results[0].breakdown.recency == 0
    assert summary.undated == 1
    assert score([item], request(include_undated=False), now)[1].removed_by_date == 1


def test_recency_decays_linearly(now):
    fresh = score([record(published_at=NOW)], request(days=7), now)[0][0]
    half = score([record(published_at=NOW - timedelta(days=3.5))], request(days=7), now)[0][0]
    assert fresh.breakdown.recency == 1.0
    assert half.breakdown.recency == pytest.approx(0.5, abs=0.01)


# --- intent --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "position", "expected"),
    [
        ("My team is hiring a backend engineer in Dubai. DM me.", "Engineering Manager", Intent.HIRING_MANAGER),
        ("I'm recruiting on behalf of my client for a Python role.", "Senior Recruiter", Intent.RECRUITER),
        ("We're hiring! Join our team in Doha.", None, Intent.GENERAL_RECRUITMENT),
        ("We are hiring a Data Engineer. Requirements: 3+ years SQL. Apply now.", None, Intent.EXPLICIT_VACANCY),
        ("Exciting things coming, we're expanding next year. Stay tuned!", "CTO", Intent.WEAK_SIGNAL),
        ("#OpenToWork I am looking for a new role as an AI engineer", None, Intent.UNRELATED),
        ("Excited to share that I'm starting a new position at Acme!", None, Intent.UNRELATED),
        ("Great conference on AI ethics today.", None, Intent.UNRELATED),
    ],
)
def test_intent_classification(text, position, expected):
    assert classify(text, position).intent is expected


def test_structured_listings_are_explicit_vacancies():
    assert classify("anything", structured_listing=True).intent is Intent.EXPLICIT_VACANCY


def test_job_seeker_posts_are_dropped(now):
    seeker = record(text="#OpenToWork I'm looking for a new job as a Python developer in Dubai")
    results, summary = score([seeker], request(), now)
    assert results == [] and summary.removed_unrelated == 1


def test_weak_signal_is_labelled_not_promoted(now):
    weak = record(title="Growing the team", text="We're expanding our Python platform team next year, stay tuned.")
    result = score([weak], request(), now)[0][0]
    assert result.intent is Intent.WEAK_SIGNAL
    assert result.breakdown.intent == 0.3


# --- scoring -------------------------------------------------------------------


def test_relevant_item_outranks_partial_match(now):
    good = record(url="https://x.example.com/good")
    partial = record(
        title="Data Analyst",
        text="We are hiring a Data Analyst. SQL and some Python scripting. Apply now.",
        url="https://x.example.com/partial",
        company="Other Co",
    )
    results, _ = score([partial, good], request(), now)
    assert [r.title for r in results] == ["Senior Python Developer", "Data Analyst"]
    assert results[0].score > results[1].score + 15


def test_unrelated_role_is_hidden_despite_strong_intent(now):
    sales = record(
        title="Sales Executive",
        text="We are hiring a Sales Executive. 5+ years B2B sales. Apply now.",
        company="Other Co",
    )
    results, summary = score([sales], request(), now)
    assert results == [] and summary.removed_low_relevance == 1


def test_score_is_weighted_sum_and_explained(now):
    result = score([record()], request(), now)[0][0]
    b = result.breakdown
    assert result.score == pytest.approx(
        100 * (0.4 * b.role + 0.3 * b.intent + 0.2 * b.geography + 0.1 * b.recency), abs=0.1
    )
    joined = " ".join(result.explanations)
    for prefix in ("Role:", "Skills:", "Intent:", "Location:", "Recency:"):
        assert prefix in joined
    assert result.matched_skills == ["python", "fastapi"]


def test_exclusion_keywords_remove_items(now):
    results, summary = score(
        [record(text="We are hiring a Python developer. Unpaid internship.")], request(exclusions=["unpaid"]), now
    )
    assert results == [] and summary.removed_by_exclusion == 1


def test_seniority_preference_penalises_mismatch(now):
    match = score([record()], request(seniority=["senior"]), now)[0][0]
    mismatch = score([record()], request(seniority=["junior"]), now)[0][0]
    assert mismatch.breakdown.role == pytest.approx(match.breakdown.role * 0.8, abs=0.002)


def test_min_score_threshold(now):
    results, summary = score([record()], request(min_score=99), now)
    assert results == [] and summary.removed_below_min_score == 1


def test_unsafe_urls_are_dropped_from_results(now):
    result = score([record(url="javascript:alert(1)")], request(), now)[0][0]
    assert result.source_url is None


# --- deduplication -------------------------------------------------------------


def test_duplicates_by_company_title_city(now):
    a = record(title="Machine Learning Engineer, Search", url="https://a.example.com/1")
    b = record(title="Machine Learning Engineer - Search", url="https://b.example.com/2")
    results, summary = score([a, b], request(titles=["Machine Learning Engineer"]), now)
    assert len(results) == 1 and summary.removed_duplicates == 1
    assert results[0].duplicates


def test_duplicates_by_url(now):
    a = record(company="A Co", url="https://same.example.com/x")
    b = record(company="B Co", title="Python Engineer", url="https://same.example.com/x")
    assert len(score([a, b], request(), now)[0]) == 1


def test_different_companies_are_not_duplicates(now):
    a = record(company="A Co", url="https://a.example.com/1")
    b = record(company="B Co", url="https://b.example.com/1")
    assert len(score([a, b], request(), now)[0]) == 2


def test_text_similarity_alone_does_not_make_a_role_relevant(now):
    sales = record(
        title="AI Sales Executive",
        text="We are hiring an AI Sales Executive to sell our AI platform. Apply now.",
        company="Other Co",
    )
    results, summary = score([sales], request(titles=["AI Engineer"], skills=["Python"]), now)
    assert results == [] and summary.removed_low_relevance == 1
