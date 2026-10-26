// Worldwide location catalog and selection logic. The catalog is the same file
// the backend validates against (backend/app/data/locations.json), so codes and
// names always agree.
import data from "../../../backend/app/data/locations.json";
import type { LocationSelection } from "./types";

export interface City {
  name: string;
  aliases?: string[];
}
export interface Subdivision {
  code: string;
  name: string;
  type: string;
  aliases: string[];
  cities?: City[];
}
export interface Country {
  code: string;
  name: string;
  continent: string;
  aliases: string[];
  subdivisions?: Subdivision[];
  cities?: City[];
}
export interface Region {
  id: string;
  name: string;
  kind: "world" | "continent" | "group";
  parent?: string;
  countries: string[];
}

export const REGIONS = data.regions as Region[];
export const COUNTRIES = data.countries as Country[];
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<string, Region>;
export const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c])) as Record<string, Country>;
const SUB_BY_CODE: Record<string, Subdivision & { country: string }> = {};
COUNTRIES.forEach((c) => c.subdivisions?.forEach((s) => (SUB_BY_CODE[s.code] = { ...s, country: c.code })));

export const CONTINENTS = REGIONS.filter((r) => r.kind === "continent");
export const groupsOf = (continent: string) => REGIONS.filter((r) => r.kind === "group" && r.parent === continent);
export const hasChildren = (c: Country) => Boolean(c.subdivisions?.length || c.cities?.length);
export const subdivisionName = (code: string) => SUB_BY_CODE[code]?.name;

// --- keys and hierarchy ---------------------------------------------------------
// r:europe · c:DE · s:DE-BY · t:DE|DE-BY|Munich

export function keyOf(sel: LocationSelection): string {
  if (sel.region) return `r:${sel.region}`;
  if (sel.city) return `t:${sel.country_code}|${sel.subdivision ?? ""}|${sel.city}`;
  if (sel.subdivision) return `s:${sel.subdivision}`;
  return `c:${sel.country_code}`;
}

export function fromKey(key: string): LocationSelection {
  const [kind, rest] = [key.slice(0, 1), key.slice(2)];
  if (kind === "r") return { region: rest };
  if (kind === "s") return { country_code: rest.split("-")[0], subdivision: rest };
  if (kind === "t") {
    const [country_code, subdivision, city] = rest.split("|");
    return subdivision ? { country_code, subdivision, city } : { country_code, city };
  }
  return { country_code: rest };
}

/** Every broader selection that would include ``key`` (nearest first). */
export function ancestorsOf(key: string): string[] {
  const out: string[] = [];
  const regionsFor = (code: string) => {
    const country = COUNTRY_BY_CODE[code];
    if (!country) return;
    groupsOf(country.continent)
      .filter((g) => g.countries.includes(code))
      .forEach((g) => out.push(`r:${g.id}`));
    out.push(`r:${country.continent}`, "r:world");
  };
  const sel = fromKey(key);
  if (sel.region) {
    const region = REGION_BY_ID[sel.region];
    if (region?.kind === "group" && region.parent) out.push(`r:${region.parent}`);
    if (region && region.kind !== "world") out.push("r:world");
    return out;
  }
  if (sel.city && sel.subdivision) out.push(`s:${sel.subdivision}`);
  if (sel.city || sel.subdivision) out.push(`c:${sel.country_code}`);
  regionsFor(sel.country_code!);
  return out;
}

export const isWithin = (key: string, parent: string) => ancestorsOf(key).includes(parent);

export function label(sel: LocationSelection): string {
  if (sel.region) return REGION_BY_ID[sel.region]?.name ?? sel.region;
  const parts: string[] = [];
  for (const part of [sel.city, sel.subdivision && subdivisionName(sel.subdivision), COUNTRY_BY_CODE[sel.country_code!]?.name]) {
    if (part && !parts.includes(part)) parts.push(part);
  }
  return parts.join(", ");
}

export function isValid(sel: LocationSelection): boolean {
  if (sel.region) return Boolean(REGION_BY_ID[sel.region]) && !sel.country_code && !sel.city && !sel.subdivision;
  const country = sel.country_code ? COUNTRY_BY_CODE[sel.country_code] : undefined;
  if (!country) return false;
  if (sel.subdivision && SUB_BY_CODE[sel.subdivision]?.country !== country.code) return false;
  if (!sel.city) return true;
  const cities = sel.subdivision ? SUB_BY_CODE[sel.subdivision].cities : country.cities;
  return Boolean(cities?.some((c) => c.name === sel.city));
}

// --- selection operations (pure) -------------------------------------------------

export const selectedKeys = (value: LocationSelection[]) => new Set(value.map(keyOf));

/** The selected ancestor that already includes ``key``, if any. */
export function coveringSelection(value: LocationSelection[], key: string): string | undefined {
  const keys = selectedKeys(value);
  return ancestorsOf(key).find((a) => keys.has(a));
}

/** Add or remove one selection. Adding a broad place drops the narrower
 *  selections inside it, so a country never carries a list of its cities. */
export function toggle(value: LocationSelection[], sel: LocationSelection): LocationSelection[] {
  const key = keyOf(sel);
  if (value.some((v) => keyOf(v) === key)) return value.filter((v) => keyOf(v) !== key);
  if (coveringSelection(value, key)) return value;
  return [...value.filter((v) => !isWithin(keyOf(v), key)), sel];
}

/** Remove a place and everything selected inside it. */
export function clearWithin(value: LocationSelection[], key: string): LocationSelection[] {
  return value.filter((v) => {
    const k = keyOf(v);
    return k !== key && !isWithin(k, key);
  });
}

export const countWithin = (value: LocationSelection[], key: string) =>
  value.filter((v) => keyOf(v) === key || isWithin(keyOf(v), key)).length;

export function sanitize(value: unknown): LocationSelection[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((v): v is LocationSelection => {
    if (!v || typeof v !== "object" || !isValid(v as LocationSelection)) return false;
    const key = keyOf(v as LocationSelection);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- presets and search ----------------------------------------------------------

export const PRESETS: { label: string; sel: LocationSelection }[] = [
  { label: "GCC", sel: { region: "gcc" } },
  { label: "India", sel: { country_code: "IN" } },
  { label: "Europe", sel: { region: "europe" } },
  { label: "USA", sel: { country_code: "US" } },
  { label: "Canada", sel: { country_code: "CA" } },
  { label: "Australia", sel: { country_code: "AU" } },
  { label: "Africa", sel: { region: "africa" } },
  { label: "Worldwide", sel: { region: "world" } },
];

export interface SearchHit {
  sel: LocationSelection;
  name: string;
  path: string;
  kind: "Region" | "Country" | "State / province" | "City";
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SEARCH_INDEX: (SearchHit & { terms: string[] })[] = [
  ...REGIONS.map((r) => ({ sel: { region: r.id }, name: r.name, path: r.kind === "group" ? "Region in Asia" : "Region", kind: "Region" as const, terms: [r.name] })),
  ...COUNTRIES.flatMap((c) => {
    const continent = REGION_BY_ID[c.continent].name;
    const rows: (SearchHit & { terms: string[] })[] = [
      { sel: { country_code: c.code }, name: c.name, path: continent, kind: "Country", terms: [c.name, ...c.aliases] },
    ];
    c.cities?.forEach((city) =>
      rows.push({ sel: { country_code: c.code, city: city.name }, name: city.name, path: c.name, kind: "City", terms: [city.name, ...(city.aliases ?? [])] }),
    );
    c.subdivisions?.forEach((s) => {
      rows.push({ sel: { country_code: c.code, subdivision: s.code }, name: s.name, path: c.name, kind: "State / province", terms: [s.name, ...s.aliases] });
      s.cities?.forEach((city) =>
        rows.push({ sel: { country_code: c.code, subdivision: s.code, city: city.name }, name: city.name, path: `${s.name}, ${c.name}`, kind: "City", terms: [city.name, ...(city.aliases ?? [])] }),
      );
    });
    return rows;
  }),
].map((row) => ({ ...row, terms: row.terms.map(fold) }));

export function searchLocations(query: string, limit = 30): SearchHit[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const rank = (terms: string[]) =>
    terms.some((t) => t === q) ? 0 : terms.some((t) => t.startsWith(q)) ? 1 : terms.some((t) => t.split(/[\s-]/).some((w) => w.startsWith(q))) ? 2 : terms.some((t) => t.includes(q)) ? 3 : 9;
  return SEARCH_INDEX.map((row) => ({ row, r: rank(row.terms) }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || a.row.name.localeCompare(b.row.name))
    .slice(0, limit)
    .map(({ row }) => ({ sel: row.sel, name: row.name, path: row.path, kind: row.kind }));
}
