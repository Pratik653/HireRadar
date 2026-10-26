"""Location catalog and location matching.

The catalog is deliberately small and explicit. Adding a market means adding a
country entry with its cities and the aliases people actually write in posts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

REGIONS: dict[str, dict] = {
    "GCC": {
        "label": "Gulf Cooperation Council",
        "aliases": ["gcc", "gulf", "middle east", "mena"],
        "countries": {
            "AE": {
                "name": "United Arab Emirates",
                "aliases": ["uae", "u.a.e", "united arab emirates", "emirates"],
                "cities": {
                    "Dubai": ["dubai", "dxb", "difc", "dubai internet city", "jlt"],
                    "Abu Dhabi": ["abu dhabi", "abudhabi", "auh", "adgm", "masdar"],
                    "Sharjah": ["sharjah", "shj"],
                },
            },
            "QA": {
                "name": "Qatar",
                "aliases": ["qatar"],
                "cities": {"Doha": ["doha", "lusail"]},
            },
            "BH": {
                "name": "Bahrain",
                "aliases": ["bahrain", "kingdom of bahrain"],
                "cities": {"Manama": ["manama"]},
            },
            "SA": {
                "name": "Saudi Arabia",
                "aliases": ["saudi arabia", "ksa", "saudi", "kingdom of saudi arabia"],
                "cities": {
                    "Riyadh": ["riyadh", "ruh"],
                    "Jeddah": ["jeddah", "jidda", "jiddah"],
                    "Dammam": ["dammam", "khobar", "al khobar", "dhahran"],
                },
            },
            "KW": {
                "name": "Kuwait",
                "aliases": ["kuwait"],
                "cities": {"Kuwait City": ["kuwait city"]},
            },
            "OM": {
                "name": "Oman",
                "aliases": ["oman", "sultanate of oman"],
                "cities": {"Muscat": ["muscat"]},
            },
        },
    },
}

REMOTE_PATTERN = re.compile(r"\b(remote|work from home|wfh|anywhere|distributed)\b", re.I)
HYBRID_PATTERN = re.compile(r"\bhybrid\b", re.I)
ONSITE_PATTERN = re.compile(r"\b(on-?site|in-?office|office based)\b", re.I)


@dataclass(frozen=True)
class Place:
    country_code: str
    country: str
    city: str | None


def _alias_regex(aliases: list[str]) -> re.Pattern[str]:
    parts = sorted((re.escape(a) for a in aliases), key=len, reverse=True)
    return re.compile(r"(?<![a-z])(" + "|".join(parts) + r")(?![a-z])", re.I)


_CITY_INDEX: list[tuple[re.Pattern[str], Place]] = []
_COUNTRY_INDEX: list[tuple[re.Pattern[str], Place]] = []
_REGION_PATTERN = _alias_regex([a for r in REGIONS.values() for a in r["aliases"]])

for _region in REGIONS.values():
    for _code, _country in _region["countries"].items():
        _COUNTRY_INDEX.append((_alias_regex(_country["aliases"]), Place(_code, _country["name"], None)))
        for _city, _aliases in _country["cities"].items():
            _CITY_INDEX.append((_alias_regex([_city.lower(), *_aliases]), Place(_code, _country["name"], _city)))


def catalog() -> list[dict]:
    """Region → country → city tree for the UI."""
    return [
        {
            "region": key,
            "label": region["label"],
            "countries": [
                {"code": code, "name": c["name"], "cities": list(c["cities"].keys())}
                for code, c in region["countries"].items()
            ],
        }
        for key, region in REGIONS.items()
    ]


def country_name(code: str) -> str | None:
    for region in REGIONS.values():
        if code in region["countries"]:
            return region["countries"][code]["name"]
    return None


def known_city(code: str, city: str) -> bool:
    for region in REGIONS.values():
        if code in region["countries"]:
            return city in region["countries"][code]["cities"]
    return False


def find_places(text: str) -> list[Place]:
    """Every catalog place mentioned in ``text``; cities imply their country."""
    if not text:
        return []
    found: dict[tuple[str, str | None], Place] = {}
    for pattern, place in _CITY_INDEX:
        if pattern.search(text):
            found[(place.country_code, place.city)] = place
    for pattern, place in _COUNTRY_INDEX:
        if pattern.search(text) and not any(k[0] == place.country_code for k in found):
            found[(place.country_code, None)] = place
    return list(found.values())


def mentions_region(text: str) -> bool:
    return bool(text and _REGION_PATTERN.search(text))


def detect_work_mode(text: str) -> str | None:
    if not text:
        return None
    if HYBRID_PATTERN.search(text):
        return "hybrid"
    if REMOTE_PATTERN.search(text):
        return "remote"
    if ONSITE_PATTERN.search(text):
        return "onsite"
    return None
