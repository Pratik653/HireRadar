"""Generate ``app/data/locations.json`` from ISO 3166 (pycountry) plus the
curated hubs and aliases in ``scripts/locations_source.py``.

    pip install -r requirements-dev.txt
    python -m scripts.build_locations      (from backend/)

The JSON is committed; the backend reads it at start-up and the frontend
bundles the same file, so both always use the same identifiers.
"""

import json
import unicodedata
from pathlib import Path

import pycountry

from scripts import locations_source as src

OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "locations.json"


def ascii_fold(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))


def city_entries(raw) -> list[dict]:
    items = [raw] if isinstance(raw, str) else raw
    out = []
    for item in items:
        name, aliases = (item, []) if isinstance(item, str) else item
        primary = name.endswith("*")
        name = name.rstrip("*")
        folded = ascii_fold(name).lower()
        alias_set = sorted({a.lower() for a in aliases} | ({folded} if folded != name.lower() else set()))
        entry = {"name": name}
        if alias_set:
            entry["aliases"] = alias_set
        if primary:
            entry["primary"] = True
        out.append(entry)
    return out


def country_name(country) -> str:
    return src.COUNTRY_NAMES.get(country.alpha_2) or getattr(country, "common_name", None) or country.name


def build() -> dict:
    continent_of = {code: cid for cid, (_, codes) in src.CONTINENTS.items() for code in codes}
    countries = []
    for code in sorted(continent_of):
        country = pycountry.countries.get(alpha_2=code)
        if country is None:
            raise SystemExit(f"unknown ISO code {code}")
        name = country_name(country)
        aliases = {name.lower(), country.name.lower(), ascii_fold(name).lower()}
        if getattr(country, "official_name", None):
            aliases.add(country.official_name.lower())
        aliases |= set(src.COUNTRY_ALIASES.get(code, []))
        aliases = {a for a in aliases if "," not in a}  # "Korea, Republic of" is never written that way
        entry = {"code": code, "name": name, "continent": continent_of[code], "aliases": sorted(aliases)}
        if code in src.COUNTRY_CODES_CASED:
            entry["codes"] = src.COUNTRY_CODES_CASED[code]
        if code in src.SUBDIVISION_COUNTRIES:
            subs = []
            for sub in sorted(pycountry.subdivisions.get(country_code=code), key=lambda s: s.code):
                if sub.type in src.SKIP_SUBDIVISION_TYPES:
                    continue
                iso_name = ascii_fold(sub.name) if code == "IN" else sub.name
                display = src.SUBDIVISION_NAMES.get(sub.code, iso_name)
                sub_aliases = {display.lower(), iso_name.lower(), ascii_fold(iso_name).lower()}
                sub_aliases |= set(src.SUBDIVISION_ALIASES.get(sub.code, []))
                sub_entry = {
                    "code": sub.code,
                    "name": display,
                    "type": sub.type,
                    "abbr": sub.code.split("-", 1)[1],
                    "aliases": sorted(sub_aliases),
                }
                if sub.code in src.CITIES:
                    sub_entry["cities"] = city_entries(src.CITIES[sub.code])
                subs.append(sub_entry)
            entry["subdivisions"] = subs
        elif code in src.CITIES:
            entry["cities"] = city_entries(src.CITIES[code])
        countries.append(entry)

    unknown = {
        k
        for k in src.CITIES
        if k.split("-")[0] not in continent_of or ("-" in k and k.split("-")[0] not in src.SUBDIVISION_COUNTRIES)
    }
    if unknown:
        raise SystemExit(f"cities for unknown places: {sorted(unknown)}")

    regions = [{"id": "world", "name": "Worldwide", "kind": "world", "countries": sorted(continent_of)}]
    regions += [
        {"id": cid, "name": name, "kind": "continent", "countries": sorted(codes)}
        for cid, (name, codes) in src.CONTINENTS.items()
    ]
    regions += [
        {"id": gid, "name": name, "kind": "group", "parent": parent, "countries": sorted(codes)}
        for gid, (name, parent, codes) in src.GROUPS.items()
    ]
    return {
        "source": f"ISO 3166-1/3166-2 via pycountry {pycountry.__version__}; hubs and aliases curated",
        "regions": regions,
        "region_aliases": src.REGION_ALIASES,
        "risky_words": sorted(src.RISKY_COUNTRY_WORDS),
        "countries": countries,
    }


if __name__ == "__main__":
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    cities = sum(
        len(c.get("cities", [])) + sum(len(s.get("cities", [])) for s in c.get("subdivisions", []))
        for c in data["countries"]
    )
    subs = sum(len(c.get("subdivisions", [])) for c in data["countries"])
    print(
        f"wrote {OUT.name}: {len(data['countries'])} countries, {subs} subdivisions, {cities} cities, "
        f"{OUT.stat().st_size // 1024} KB"
    )
