# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [SemVer](https://semver.org/).

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
