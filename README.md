# HireRadar

**Find who is hiring, for what, where and when. Every match comes with the reasons behind its score.**

[![CI](https://github.com/Pratik653/HireRadar/actions/workflows/ci.yml/badge.svg)](https://github.com/Pratik653/HireRadar/actions/workflows/ci.yml)
[![Pages](https://github.com/Pratik653/HireRadar/actions/workflows/pages.yml/badge.svg)](https://github.com/Pratik653/HireRadar/actions/workflows/pages.yml)
![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12%20%7C%203.13-blue)
![License](https://img.shields.io/badge/license-Apache--2.0-green)

**[Open the live demo →](https://pratik653.github.io/HireRadar/)** No sign-up or install needed. Demo mode uses a
synthetic GCC dataset and labels it on every screen.

Job boards list vacancies. Many openings appear earlier, and sometimes only, as a post from a hiring manager,
recruiter or founder: *"My team in Dubai is hiring an LLM engineer, DM me."* HireRadar brings those
announcements together with structured vacancies from company career boards. It classifies how strong the
hiring signal is, scores each item against your roles, skills, locations and date window, removes duplicates,
and exports the result to a formatted Excel workbook with an application tracker.

![HireRadar dashboard showing ranked hiring opportunities in demo mode](docs/images/dashboard.png)

## What it does

| | |
|---|---|
| **Targeting** | Worldwide Continent → Country → State/Province → City explorer (216 countries by ISO 3166 code, states for India, the US, Canada, Australia and Germany, 270+ hub cities) with search, presets (GCC, India, Europe, USA, Canada, Australia, Africa, Worldwide) and removable chips; on-site/hybrid/remote, multiple job titles and skills, a free-text job description, optional resume text, exclusions, seniority, and a window of 24 h, 3, 7, 14 or 30 days. Every field has its own reset, plus *Reset all* |
| **Hiring intent** | Each item gets one of six classes: explicit vacancy, hiring-manager post, recruiter post, general recruitment, weak signal, unrelated. `#OpenToWork` and "I've joined…" posts are removed. Weak signals are labelled, never presented as vacancies |
| **Explainable score** | `100 × (0.4 role + 0.3 intent + 0.2 geography + 0.1 recency)`, with a breakdown and plain-language reasons for every result |
| **Matching** | Title normalisation (`Sr. ML Eng` → `senior machine learning engineer`), role families so "AI Engineer" doesn't match "AI Sales Executive", skill synonyms (RAG = retrieval-augmented generation), TF-IDF similarity |
| **Honest dates** | A date is shown only when the source provides one. Each is labelled *exact*, *reported* (Lever creation time or a date you entered) or *unknown*. Undated items are never given a date |
| **Deduplication** | Same URL, same company + title + city, or same company with near-identical text |
| **LinkedIn research mode** | Plans a short list of LinkedIn post searches in four strategies, from Focused (exact title, your city) through Balanced (shorter title, country, hiring words as alternatives) to Broad and Discovery (role family, related titles and skills, no location keyword), plus Google/Bing searches for indexed posts. Mark what each search found and HireRadar suggests a broader or more focused one; widen the date filter up to *Any time*. You open each search in your own browser; HireRadar never sees LinkedIn's results |
| **Import** | Paste a post, or upload CSV/JSON. Imports stay in your browser |
| **Export** | XLSX with *Hiring Leads*, *Search Summary* and *Application Tracker* sheets (frozen, filtered headers, validated links, formula-injection protection), plus CSV |

## Data sources

| Source | Status | What it gives you |
|---|---|---|
| Company career boards (Greenhouse, Lever, Ashby) | **Live** | Official public job-board APIs for the companies you add. Tested GCC boards: Careem, Tamara (Greenhouse), Ziina (Ashby) |
| [Remotive](https://remotive.com) | **Live** | Remote roles worldwide. Listings arrive 24 h late, per Remotive's terms, and link back to Remotive |
| Your imported posts | **Live** | Anything you collected yourself, from LinkedIn or elsewhere, scored with everything else |
| LinkedIn | **Research mode only** | See below |
| Demo dataset | Synthetic | Fictional companies and people, links to example.org, used only in Demo mode |

If a live source fails, the results say which one and why. HireRadar never fills the gap with demo data. Each
source's auth, coverage, rate limits and terms are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#sources).

### Why LinkedIn is not scraped

LinkedIn's User Agreement prohibits scraping and automated access, and logging in manually doesn't change that.
A hosted service that automated LinkedIn would also have to hold its users' session cookies. HireRadar
therefore never asks for, stores or forwards LinkedIn credentials, cookies or sessions. Research mode
generates the searches and you run them in your own browser. When you find a post worth tracking, copy it into
**Import posts**. The adapter interface leaves room for an official LinkedIn integration if partner access
ever becomes available.

## Research Companion (optional browser extension)

The [Research Companion](extension/README.md) is a small Chrome/Edge extension. It steps through HireRadar's
LinkedIn research searches from a floating window, so you don't have to switch back to HireRadar after every
search:
- *Previous* and *Next* move one reused LinkedIn tab through the prioritized queue.
- *Try broader* follows HireRadar's relaxation ladder.
- You mark what each search found, and those marks sync back to HireRadar.

You can move the window, resize it from any edge or corner, minimize it to a bubble, close and reopen it, and
pin it on top of other windows.

It never injects anything into LinkedIn. LinkedIn's User Agreement prohibits overlaying or modifying its pages,
so the companion is its own window. It asks only for `storage` and has no access to any website.

Install it from the [companion-v1.0.0 release](https://github.com/Pratik653/HireRadar/releases/tag/companion-v1.0.0)
with *Load unpacked*; it is not in the Chrome Web Store yet. HireRadar works the same without it.

## Architecture

```
frontend/  React 19 + TypeScript + Vite + Tailwind   → GitHub Pages (static)
backend/   FastAPI + Pydantic + scikit-learn + openpyxl → Render free web service (stateless)
tests/     backend tests (pytest); frontend tests live next to the code (vitest)
extension/ optional Research Companion (Manifest V3, Chrome/Edge), packaged as its own release
docs/      architecture, deployment, reference audit
```

The API has no database. Preferences, resume text, imports and application status stay in your browser's
local storage. The server processes each request in memory, reaches only an allowlist of four job-API hosts, and
never fetches a URL you supply. Details: [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [SECURITY.md](SECURITY.md).

**Free-tier cold starts.** The API runs on Render's free plan, which sleeps after about 15 minutes idle. The
page starts waking it as soon as it loads and shows a short notice while it boots. Errors from the API
itself, such as validation or rate limits, are shown as errors rather than as a wake-up delay.

## Running locally

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, talks to http://localhost:8000
```

Tests: `pytest -q` in `backend/` (110 tests) and `npm test` in `frontend/`. Deployment:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Limitations

- **Coverage depends on the boards you add.** HireRadar does not crawl job sites. Company boards and Remotive
  together cover far fewer GCC roles than the large job portals.
- **Weights are heuristics.** The 40/30/20/10 split and the intent scores were chosen to make the ranking
  readable. They have not been validated against labelled data.
- **Intent rules are English-only** and keyword-based. Unusual phrasing, or posts in Arabic, may be classified
  as weak or unrelated.
- **Worldwide filters, limited live coverage.** You can target any of 216 countries, but live listings come only from
  the company boards you add, Remotive's remote roles and your imports. Many markets have no live source yet.
- **Location detection uses a catalog** of hub cities. A listing in a smaller town is matched at state or country
  level when the listing names them, and otherwise counts as outside your selection. Ambiguous names
  ("Georgia", a bare "Washington") are resolved from context or left unmatched rather than guessed.
- **No accounts, no sync.** Data stays in one browser. Clearing site data removes it.
- **Cold starts.** The first request after an idle period can take a while on the free tier.

## Roadmap

- More hub cities and state/province data for further countries.
- Source adapters with authorised coverage outside the GCC (for example more public ATS boards per market).
- Additional authorised sources: Workable and SmartRecruiters public job widgets, and more Remotive-style APIs.
- A small labelled set of hiring posts to measure intent precision and recall and tune the weights.
- Optional lightweight embeddings, if they fit the free-tier memory budget.
- Arabic hiring-phrase rules.

## Acknowledgements

The idea of searching hiring *posts* rather than job listings, and of TF-IDF matching against a resume, comes
from [pritamdharme/linkedin-hiring-post](https://github.com/pritamdharme/linkedin-hiring-post). That
repository has no licence, so none of its code is used here. HireRadar is an independent implementation.
See [docs/REFERENCE_AUDIT.md](docs/REFERENCE_AUDIT.md) for the review.

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE).
