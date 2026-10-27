# Architecture

HireRadar is two separately deployed parts:

```
 Browser (GitHub Pages)                         Render free web service
 ┌──────────────────────────────┐   HTTPS/JSON  ┌────────────────────────────────────────────┐
 │ React + TypeScript (Vite)    │ ────────────▶ │ FastAPI                                    │
 │  search form, results, LinkedIn│  /api/search  │  validation (Pydantic) → adapters → scoring │
 │  research links, imports     │  /api/export  │  → dedupe → response / XLSX                │
 │  localStorage: preferences,  │  /health      │                                            │
 │  imports, application status │               │  outbound allowlist: Greenhouse, Lever,    │
 └──────────────────────────────┘               │  Ashby, Remotive                           │
                                                └────────────────────────────────────────────┘
```

The API is stateless. It has no database and keeps nothing between requests except a 15-minute in-memory cache
of upstream API responses and rate-limit counters. A restart loses both, which is fine.

## Backend layout (`backend/app`)

| Module | Responsibility |
|---|---|
| `models.py` | Request/response contracts. `SearchRequest` validates every field: location selections (region id, ISO 3166-1 country, ISO 3166-2 subdivision, city) against the catalog, board slugs against a strict pattern, URLs through `safe_public_url`, list sizes and text lengths. |
| `geo.py` | Loads `data/locations.json` (see below), detects places in location fields and free text, and resolves ambiguous names. |
| `text.py` | Title normalisation (`Sr. ML Eng` → `senior machine learning engineer`), role families, skill synonyms and "implies" relations, seniority detection, evidence snippets. |
| `intent.py` | Rule-based hiring-intent classifier. Returns the class, its score and the phrase that triggered it. |
| `scoring.py` | Filters (exclusions, intent, location/work mode, date window), the four score components, role-relevance floor, deduplication. |
| `sources/` | Adapters. Each returns `FetchResult(records, warnings)` of `RawRecord`s and carries a `SourceInfo` describing auth, coverage, rate limits, terms and reliability. |
| `sources/http.py` | The only way adapters reach the network: HTTPS to an allowlist of hosts, no redirects, response size cap, timeouts, small TTL cache. |
| `search.py` | Runs the selected adapters concurrently, turns failures into per-source status, never substitutes demo data. |
| `export.py` | openpyxl workbook: Hiring Leads, Search Summary, Application Tracker. |
| `security.py` | URL validation, rate limiter, request-size and header middleware. |

## Scoring

```
score = 100 × (0.4 × role + 0.3 × intent + 0.2 × geography + 0.1 × recency)
```

**Role** (0–1) is a weighted mean of the parts that apply to the query:

- title overlap (0.35): the share of a target title's core words found in the job title. If both titles have a
  role noun from different families (engineering vs sales), the overlap is multiplied by 0.4. This stops
  "AI Engineer" matching "AI Sales Executive" on the word "AI";
- skill coverage (0.35): the share of the user's skills found in the title, text or tags. Synonyms such as
  `RAG = retrieval-augmented generation` count once. "Implies" relations let a FastAPI posting count as Python
  evidence without folding the user's own FastAPI keyword into Python;
- TF-IDF cosine (0.30): between the query document (titles, skills, description, resume) and the job text,
  using unigrams and bigrams with sublinear tf. Cosine ≥ 0.35 counts as 1.0. The fixed saturation keeps a score
  meaningful across searches, unlike normalising by the batch maximum.

A seniority outside the user's preference multiplies role by 0.8. An item is hidden when role < 0.15, or when
titles or skills were given but there is neither a ≥ 50% title match nor a single skill match. Without that
rule, strong intent, a matching city and a recent date could lift an unrelated vacancy to about 60 points.

**Intent**: explicit vacancy 1.0, hiring-manager post 0.95, recruiter post 0.85, general recruitment 0.7,
weak signal 0.3. Unrelated content and job-seeker posts are removed. Records from ATS boards and job APIs are
explicit vacancies by construction.

**Geography**: each detected place is compared with each selection, and the best pair counts (selections are
OR-ed). Inside a selected region, country, state or city 1.0; same state but another city 0.7; same country but
another city or state 0.6; no stated location 0.3. A remote role gets 0.9 when it names a selected country or a
region word that covers one ("EMEA", "GCC", "APAC"), 0.8 when it says worldwide, and 0.5 when eligibility is
unclear. A remote role limited to places outside the selection is removed, as are on-site roles elsewhere and
work modes the user did not select. Selecting *Worldwide* disables location filtering.

**Recency**: `1 − age / window`. Items without a trustworthy date get 0 and keep `published_at = null`.
Users can exclude them. Dates are labelled `exact` (from the source's publish field), `reported` (Lever's
creation time, or a date the user typed), or `unknown`.

These weights are heuristics chosen to make the ranking readable. They have not been validated against labelled
data, and the UI and the Excel report both say so.

## Location catalog

`backend/app/data/locations.json` is generated by `backend/scripts/build_locations.py`. Country and subdivision
codes and names come from ISO 3166 via pycountry (the Debian iso-codes data). `scripts/locations_source.py` adds
what ISO lacks: UN M49 continents, the GCC group, hub cities, aliases (`Bangalore`, `München`, `DXB`, `KSA`),
region words used in remote eligibility, and English names where ISO uses a local one (`Bayern` → Bavaria).
The frontend imports the same file, so codes and labels never drift apart.

Detection runs one longest-match-first regex over all names, so "New Jersey" is never read as Jersey and
"Papua New Guinea" never as Guinea. A name with several readings (London, Cambridge, Washington, Georgia) is
resolved by other places in the same text, by a state abbreviation next to it ("London, ON"), or by a default
marked in the catalog. Without any of those it is dropped. State abbreviations ("TX", "NSW") count only next to
a place in the same country, because "CA" alone could mean California or Canada. In free text, such as a
job description read when the listing has no location field, only capitalised city and country names count,
and names that are also common words or surnames (Jordan, Chad, Georgia) are ignored.

## Deduplication

Items are processed in score order. An item merges into an earlier one when any of these hold:

1. both have the same source URL;
2. same company (normalised), same set of core title words and same city;
3. same company and TF-IDF cosine ≥ 0.9 between their texts.

The kept item lists the merged copies in `duplicates`.

## Sources

| Source | Live | Auth | Coverage | Rate limits | Terms | Notes |
|---|---|---|---|---|---|---|
| Greenhouse board API | yes | none | companies you add | not published; one request per board per search, cached 15 min | link to the original posting | `first_published` is the exact publish date |
| Lever postings API | yes | none | companies you add | as above | as above | only `createdAt`, labelled "reported" |
| Ashby job-board API | yes | none | companies you add | as above | as above | `publishedAt` exact |
| Remotive | yes | none | remote roles worldwide | not published; ≤ 2 requests per search, cached | must link back and credit Remotive; 24 h delay; no resubmission to other job boards | remote only |
| Manual import | yes | none | whatever the user imports | none | user copies only what they may keep | URLs never fetched |
| Demo | no | — | fictional GCC dataset | — | synthetic | `mode="demo"` only |
| LinkedIn | no | partner approval | — | — | User Agreement prohibits scraping | research mode instead |

Verified GCC boards (October 2026): Careem and Tamara on Greenhouse, Ziina on Ashby.

## Frontend (`frontend/src`)

- `App.tsx`: mode switch, tabs, search and export flow.
- `lib/useBackend.ts`: cold-start tracking. It pings `/health` when the page loads. A request still pending after
  2.5 s switches the notice to "waking". Any HTTP answer, including a 4xx, proves the backend is awake. Network
  errors, timeouts and proxy 502/503/504 count as "unreachable". The "We're awake!" message appears only after a
  slow start that ended in a real response, and at most once per browser session.
- `lib/linkedin.ts`: research-mode URL builder.
- `lib/safe.ts`: `safeHref` (http/https only), CSV formula escaping.
- `lib/storage.ts`: guarded localStorage. The app still works when storage is blocked.
- `public/demo-snapshot.json`: the demo search run through the real backend engine during the Pages build. It is
  shown, clearly labelled, when the site has no backend URL or the backend cannot be reached in demo mode.

## Research Companion (extension)

```
 HireRadar page ──chrome.runtime.sendMessage(ID, msg)──▶ service worker ──tabs.update──▶ one LinkedIn tab
 (github.io only, via externally_connectable)            │  chrome.storage.local         (URL only; never read)
                                                         └─windows.create(popup)──▶ companion window ⇄ Keep on top (Document PiP)
```

- **Session transfer.** `frontend/src/lib/companion.ts` builds the session from the planner's ranked queue:
  LinkedIn searches only, each with id, strategy, category, label, query, URL, and its broader and narrower
  candidates from `relaxationCandidates`, so the companion relaxes exactly as the web app does.
- **Validation.** `extension/src/session.js` validates every session: known fields only, at most 100 searches,
  URLs restricted to `https://www.linkedin.com/search/results/content/` with matching keywords, and a 30-day
  expiry. HireRadar's frontend tests run their sessions through the same validator.
- **Messages.** Four message types are allowed (`ping`, `start`, `state`, `open`); anything else is rejected.
- **No LinkedIn access.** The extension has `storage` as its only permission and no host permissions or content
  scripts. Navigation uses `tabs.create` / `tabs.update` on the one tab it opened, which needs no permission and
  cannot read the page.
- **Window.** The companion is an extension-owned popup window. The OS provides moving, resizing from any edge
  or corner, minimizing and closing. The service worker remembers its bounds and clamps them to the visible
  screen and a 320×420–720×1000 range. Minimize shrinks it to a bubble anchored at the same corner. *Keep on top*
  moves the UI into a Document Picture-in-Picture window; the popup shrinks instead of minimizing, because
  browsers close a PiP window whose opener is minimized.
- **Why not a bubble inside LinkedIn:** LinkedIn's User Agreement §8.2 prohibits overlaying or modifying its
  pages, and its help centre lists appearance-changing extensions as prohibited.

## Trade-offs

- **No database.** Users keep their own data in the browser. The cost is no cross-device sync.
- **Rules, not a model, for intent.** Every result can show why it got its label, and the service needs nothing
  heavier than scikit-learn. The cost is lower recall on unusual phrasing.
- **User-selected company boards instead of crawling.** Every request goes to an official endpoint the company
  publishes for this purpose. The cost is that coverage depends on the boards the user adds.
- **No server-side URL fetching.** This removes the SSRF surface. The cost is that imported posts must include
  their text.
