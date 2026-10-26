"""Worldwide catalog, place detection, selection validation and geographic scoring."""

from io import BytesIO

import pytest
from conftest import record, request
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from pydantic import ValidationError

from app import geo
from app.main import app
from app.models import LocationSelection


def labels(text: str, strict: bool = False) -> list[str]:
    return [p.label for p in geo.find_places(text, strict)]


# --- catalog -------------------------------------------------------------------


def test_catalog_is_consistent():
    cat = geo.catalog()
    assert len(cat.countries) > 200
    for region in cat.regions.values():
        assert set(region["countries"]) <= set(cat.countries), region["id"]
    for code, sub in cat.subdivisions.items():
        assert code.startswith(sub["country"] + "-")
    assert {"IN-KA", "US-CA", "CA-ON", "AU-NSW", "DE-BY"} <= set(cat.subdivisions)
    assert cat.region_countries("gcc") == {"AE", "QA", "BH", "SA", "KW", "OM"}
    assert cat.region_countries("gcc") <= cat.region_countries("asia")


# --- detection and ambiguity ---------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Bengaluru, Karnataka", ["Bengaluru, Karnataka, India"]),
        ("Bangalore", ["Bengaluru, Karnataka, India"]),
        ("München", ["Munich, Bavaria, Germany"]),
        ("Berlin, Germany", ["Berlin, Germany"]),
        ("Toronto, Canada (hybrid)", ["Toronto, Ontario, Canada"]),
        ("Sydney NSW", ["Sydney, New South Wales, Australia"]),
        ("Riyadh, KSA", ["Riyadh, Saudi Arabia"]),
        ("Singapore", ["Singapore"]),
    ],
)
def test_detects_cities_with_aliases(text, expected):
    assert labels(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("London", ["London, United Kingdom"]),  # default reading
        ("London, ON, Canada", ["London, Ontario, Canada"]),
        ("London, Ontario", ["London, Ontario, Canada"]),
        ("Cambridge, MA", ["Cambridge, Massachusetts, United States"]),
        ("Seattle, WA", ["Seattle, Washington, United States"]),
        ("Perth, WA", ["Perth, Western Australia, Australia"]),  # WA resolved by the city
        ("Washington, DC", ["Washington, District of Columbia, United States"]),
        ("Washington", ["United States"]),  # state or D.C.: only the country is certain
        ("Atlanta, Georgia", ["Atlanta, Georgia, United States"]),
        ("Tbilisi, Georgia", []),  # the country or the US state: no clue, so no guess
        ("New Jersey", ["New Jersey, United States"]),  # not the island of Jersey
        ("Papua New Guinea", ["Papua New Guinea"]),  # not Guinea
        ("Remote - CA", []),  # California or Canada: ambiguous abbreviation alone
        ("Boise, ID, USA", ["Idaho, United States"]),
    ],
)
def test_ambiguous_names_need_context(text, expected):
    assert labels(text) == expected


def test_free_text_ignores_names_that_are_common_words():
    text = "Michael Jordan from Georgia joins our team; we ship to Turkey. Based in Dubai."
    assert labels(text, strict=True) == ["Dubai, United Arab Emirates"]


def test_region_words_cover_countries():
    assert {"DE", "ZA", "AE"} <= geo.mentioned_regions("Remote — EMEA")
    assert geo.mentioned_regions("Remote (GCC)") == {"AE", "QA", "BH", "SA", "KW", "OM"}


# --- validation ----------------------------------------------------------------


def test_selection_shapes():
    assert LocationSelection(region="europe").label == "Europe"
    assert LocationSelection(country_code="in", subdivision="in-ka").label == "Karnataka, India"
    city = LocationSelection(country_code="IN", city="Bengaluru")  # subdivision inferred
    assert city.subdivision == "IN-KA" and city.label == "Bengaluru, Karnataka, India"
    legacy = LocationSelection(country_code="SA", city="Riyadh")  # saved before v0.2
    assert legacy.label == "Riyadh, Saudi Arabia"


@pytest.mark.parametrize(
    "payload",
    [
        {"region": "atlantis"},
        {"region": "europe", "country_code": "DE"},
        {"country_code": "DE", "subdivision": "US-CA"},
        {"country_code": "US", "subdivision": "US-NY", "city": "Austin"},
        {"country_code": "AE", "city": "Doha"},
        {},
    ],
)
def test_invalid_selections_rejected(payload):
    with pytest.raises(ValidationError):
        LocationSelection(**payload)


# --- scoring: OR semantics across levels ---------------------------------------

WORLD_PICK = [
    {"country_code": "AE", "city": "Dubai"},
    {"country_code": "QA", "city": "Doha"},
    {"country_code": "DE", "subdivision": "DE-BE", "city": "Berlin"},
    {"country_code": "CA", "subdivision": "CA-ON", "city": "Toronto"},
    {"country_code": "AU", "subdivision": "AU-NSW", "city": "Sydney"},
    {"country_code": "IN", "subdivision": "IN-KA", "city": "Bengaluru"},
]


def _score(locations, *records, **kw):
    from conftest import NOW

    from app.scoring import score

    return score(list(records), request(locations=locations, **kw), NOW)


def test_multiple_cities_across_continents():
    items = [
        record(title=f"Python Developer {i}", url=f"https://x.example.com/{i}", location_raw=loc, company=f"Co {i}")
        for i, loc in enumerate(["Dubai, UAE", "Berlin, Germany", "Bangalore, India", "Sydney, Australia", "Paris"])
    ]
    results, summary = _score(WORLD_PICK, *items)
    assert sorted(r.city for r in results) == ["Bengaluru", "Berlin", "Dubai", "Sydney"]
    assert all(r.breakdown.geography == 1.0 for r in results)
    assert summary.removed_by_location == 1  # Paris


def test_multiple_continents():
    items = [
        record(title="Python Developer A", url="https://x.example.com/a", location_raw="Munich, Germany"),
        record(title="Python Developer B", url="https://x.example.com/b", location_raw="Nairobi, Kenya", company="B"),
        record(title="Python Developer C", url="https://x.example.com/c", location_raw="Austin, TX", company="C"),
    ]
    results, _ = _score([{"region": "europe"}, {"region": "africa"}], *items)
    assert sorted(r.country for r in results) == ["Germany", "Kenya"]


def test_country_level_selection_matches_any_city_and_country_only_text():
    items = [
        record(title="Python Developer A", url="https://x.example.com/a", location_raw="Pune, Maharashtra"),
        record(title="Python Developer B", url="https://x.example.com/b", location_raw="India", company="B"),
    ]
    results, _ = _score([{"country_code": "IN"}], *items)
    assert len(results) == 2 and {r.breakdown.geography for r in results} == {1.0}


def test_subdivision_selection():
    items = [
        record(title="Python Developer A", url="https://x.example.com/a", location_raw="San Jose, CA"),
        record(title="Python Developer B", url="https://x.example.com/b", location_raw="Austin, Texas", company="B"),
    ]
    results, _ = _score([{"country_code": "US", "subdivision": "US-CA"}], *items)
    by_city = {r.city: r.breakdown.geography for r in results}
    assert by_city == {"San Jose": 1.0, "Austin": 0.6}
    assert next(r for r in results if r.city == "San Jose").subdivision == "California"


def test_same_named_city_in_another_country_does_not_match():
    london_on = record(location_raw="London, ON, Canada")
    results, summary = _score([{"country_code": "GB", "city": "London"}], london_on)
    assert results == [] and summary.removed_by_location == 1
    results, _ = _score([{"country_code": "CA", "subdivision": "CA-ON", "city": "London"}], london_on)
    assert results[0].breakdown.geography == 1.0


def test_worldwide_selection_accepts_any_location():
    results, _ = _score([{"region": "world"}], record(location_raw="Reykjavik"))
    assert results[0].breakdown.geography == 1.0


def test_remote_eligibility_follows_stated_region():
    restricted = record(location_raw="Remote — USA, Canada", remote_hint=True)
    results, summary = _score([{"region": "gcc"}], restricted)
    assert results == [] and summary.removed_by_location == 1

    emea = record(location_raw="Remote — EMEA", remote_hint=True)
    assert _score([{"country_code": "AE"}], emea)[0][0].breakdown.geography == 0.9

    in_country = record(location_raw="Remote, Germany", remote_hint=True)
    assert (
        _score([{"country_code": "DE", "subdivision": "DE-BY", "city": "Munich"}], in_country)[0][0].breakdown.geography
        == 0.9
    )


# --- API and export ------------------------------------------------------------


def test_search_and_export_carry_selected_locations():
    payload = {
        "mode": "demo",
        "titles": ["LLM Engineer", "Python Developer"],
        "skills": ["Python", "RAG"],
        "locations": [
            {"region": "gcc"},
            {"country_code": "DE", "subdivision": "DE-BE", "city": "Berlin"},
            {"country_code": "IN", "subdivision": "IN-KA"},
        ],
        "days": 30,
    }
    with TestClient(app) as client:
        response = client.post("/api/search", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["request"]["locations"][1] == {
            "region": None,
            "country_code": "DE",
            "subdivision": "DE-BE",
            "city": "Berlin",
        }
        countries = {r["country"] for r in body["results"]}
        assert {"Germany", "India"} & countries and countries <= {
            "United Arab Emirates",
            "Qatar",
            "Bahrain",
            "Saudi Arabia",
            "Kuwait",
            "Oman",
            "Germany",
            "India",
            None,
        }
        xlsx = client.post("/api/export", json={"response": body}).content
    wb = load_workbook(BytesIO(xlsx))
    summary = {r[0].value: r[1].value for r in wb["Search Summary"].iter_rows() if r[0].value}
    assert summary["Locations"] == "GCC; Berlin, Germany; Karnataka, India"
    leads = wb["Hiring Leads"]
    assert [c.value for c in leads[1]][6:9] == ["Country", "State / Province", "City"]
