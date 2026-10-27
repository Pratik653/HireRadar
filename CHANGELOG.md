# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Worldwide location targeting: Continent → Country → State/Province → City explorer covering 216 countries
  (ISO 3166-1), states and provinces for India, the United States, Canada, Australia and Germany (ISO 3166-2) and
  270+ hub cities, with search, presets (GCC, India, Europe, USA, Canada, Australia, Africa, Worldwide),
  removable chips and per-level clear controls.
- Reset control on every search field and a *Reset all* button. Imports, application statuses and results are kept.
- *State / Province* in results and in the Excel report; readable location labels in the Search Summary.
- Synthetic demo items outside the GCC (Berlin, Bengaluru, Toronto, Sydney).
- LinkedIn research planner: 30–60 distinct searches per session across ten post categories (hiring
  announcements, recruiters, hiring managers, referrals, urgent hiring, startups, team expansion, technology,
  alternative titles, indirect signals) plus Google and Bing searches for indexed LinkedIn posts. Related titles
  and technologies are added, each query names one place, and the tab gains category filters, a query filter,
  Show more / Show all, and a one-at-a-time *Open next search*.

### Changed

- LinkedIn research uses four search strategies (Focused, Balanced, Broad, Discovery) instead of ANDing an exact
  hiring phrase, exact title and exact city in every query. Hiring language is an OR group, titles are shortened
  ("Business Operations Specialist" → "Operations Specialist") and places relax from city to country to none.
  The plan is smaller (about 15–30 searches), Balanced first, with role families and related titles for
  business roles as well as technical ones.
- Research searches can be marked *Relevant results*, *No results* or *Not relevant*; HireRadar then offers a
  broader or more focused search and reorders the list. Feedback is stored in the browser per search
  configuration. A *Posted* control widens the date filter up to *Any time*, and LinkedIn URLs now encode spaces
  as `%20` like LinkedIn's own links.
- Geographic matching works at region, country, state and city level with OR semantics, and resolves ambiguous
  place names from context instead of guessing.
- Remote roles limited to regions outside the selection are now removed instead of being shown as "eligibility
  not verified".
- Location selections accept `region` and `subdivision`; the earlier `{country_code, city}` shape still works.

## [0.1.0] - 2026-10-26

First public release.

### Added

- FastAPI backend with `/health`, `/api/meta`, `/api/search` and `/api/export`.
- Source adapters: Greenhouse, Lever and Ashby public job-board APIs; Remotive; user-imported posts; a synthetic
  demo dataset that is used only in demo mode.
- Explainable scoring: role and skills (title normalisation, role families, skill synonyms, TF-IDF), rule-based
  hiring intent with six classes, GCC geography with aliases and work modes, and recency over a 1–30 day window.
- Removal of job-seeker and announcement posts, a role-relevance floor, deduplication by URL, by
  company + title + city, and by near-identical text.
- Three-sheet Excel report (Hiring Leads, Search Summary, Application Tracker) and CSV export, both protected
  against formula injection.
- React + TypeScript frontend: Region → Country → City picker, role/skill/exclusion inputs, seniority, date window,
  results table with filters, sorting, score breakdown and application status.
- LinkedIn research mode (search links the user opens themselves) and post import (form, CSV, JSON), stored in
  the browser.
- Cold-start notice for the Render free tier, with wake-up detection, retry, and a separate display for API errors.
- Static demo snapshot for GitHub Pages when no backend is connected.
- CI (ruff, pytest, typecheck, vitest, build), GitHub Pages deployment and a Render Blueprint.

[0.1.0]: https://github.com/Pratik653/HireRadar/releases/tag/v0.1.0
