# Reference audit: pritamdharme/linkedin-hiring-post

Reviewed: commit `2b70361` ("Initial commit: LinkedIn hiring-post agent (Playwright + Python)"), October 2026.

## Licence and reuse decision

The repository has **no LICENSE file**, no copyright or licence notice in its source or docs, and the GitHub API
reports `license: null`. Without a licence, the author keeps all rights. Public visibility on GitHub lets others
view and fork the repository, but it does not grant permission to copy, modify or redistribute the code.

**Decision: no code was copied or adapted.** HireRadar is an independent implementation. It uses only ideas
that the reference describes publicly in its README: score post text against a resume with TF-IDF, filter a
posts search by date, and keep evidence for manual review. Ideas like these are not protected by copyright. The
project is credited in the README as the design reference.

## What the reference does

| File | Purpose | Notes |
|---|---|---|
| `linkedin_scraper.py` | Playwright: manual login once, saves `storage_state.json`, then headless content search for the past 24 h, scrolls 12 times and reads `data-testid="expandable-text-box"` plus `aria-label` markers | Session cookies are stored on disk in plain text |
| `resume_matcher.py` | TF-IDF (`stop_words="english"`) + cosine similarity between the resume and each post | Fits the vectoriser on resume + posts; scores are relative to the batch |
| `csv_exporter.py` | Writes `score, author, link, text` to a dated CSV | No formula-injection escaping |
| `draft_generator.py` | Pulls an email address from the post with a regex, guesses the role from the first line, writes template outreach drafts | Extracts contact emails from post text |
| `main.py` / `config.py` | Orchestration; `.env` settings (`SEARCH_KEYWORD`, `HOURS_LOOKBACK` unused, `MIN_MATCH_SCORE`) | Single keyword, single run |

## Findings

**Technically reusable ideas**
- TF-IDF cosine is a sensible, dependency-light baseline for text relevance.
- Keeping all scraped items (not only matches) for manual review is a good evidence practice.
- Using the posts search instead of the formal Jobs section finds informal hiring announcements earlier.

**Needs refactoring or improvement**
- Matching is one undifferentiated cosine score. There is no title normalisation, no skill synonyms (RAG and
  retrieval-augmented generation count as different), no seniority handling and no explanation of the score.
- Scores depend on which posts are in the batch, and `MIN_MATCH_SCORE` has no stable meaning.
- Duplicate detection only compares exact post text.
- Role-title guessing uses the first line of the post, which often contains emoji or the company name.

**Missing features**
- Hiring-intent classification. Job seekers' `#OpenToWork` posts and "I joined X" announcements use the same
  vocabulary as vacancies and are not separated.
- Location filtering, multiple keywords, a date window beyond 24 h, exclusions, an application tracker.
- Any data source other than LinkedIn.

**Unsuitable for a hosted, multi-user application**
- Requires a real browser per user and a logged-in LinkedIn session on the server. Hosting it would mean
  holding users' LinkedIn session cookies, which HireRadar must never do.
- Long-running headless Chromium does not fit a 512 MB free instance or a stateless API.
- Writes files (`storage_state.json`, CSVs, `debug_page.html`) to local disk, which Render's free tier does not keep.

**Security, privacy, reliability and platform compliance**
- The README itself says that automating LinkedIn breaks LinkedIn's Terms of Service. LinkedIn's User Agreement
  prohibits scraping and automated access, whether or not the user logged in manually.
- `storage_state.json` holds authentication cookies in plain text. It is git-ignored, but anyone with the file
  can use the account.
- `debug_page.html` saves a full authenticated page, including other people's personal data, to disk.
- Harvesting email addresses from posts and drafting outreach is processing of personal data without a stated
  basis.
- Selectors depend on LinkedIn markup and break without warning. The tool exits with zero results rather than
  failing visibly (it does save the HTML for debugging).
- CSV output does not escape cells starting with `=`, `+`, `-` or `@`.

## How HireRadar handles each point

| Reference behaviour | HireRadar |
|---|---|
| Automated LinkedIn scraping | LinkedIn **research mode**: builds LinkedIn and web search URLs that the user opens in their own browser. Posts are added by manual or CSV/JSON import. No credentials, cookies or sessions ever reach HireRadar. |
| One data source | Adapter interface (`backend/app/sources`). Live adapters: Greenhouse, Lever and Ashby public board APIs, Remotive, and manual import. |
| Single TF-IDF score | Four explained components: role and skills (title overlap with role families, skill synonyms, TF-IDF), hiring intent, geography and recency. Each result lists its reasons. |
| No intent model | Rule-based classifier with six classes; job-seeker and announcement posts are removed; weak signals are labelled, not promoted. |
| Exact-text dedupe | Same URL, or same company + core title + city, or same company with near-identical text. |
| Emails extracted from posts | Not done. Contacts come only from what the user enters (marked *user-provided*); ATS listings have none. |
| CSV only | Three-sheet XLSX with frozen, filtered headers, validated hyperlinks and formula-injection protection, plus CSV with the same protection. |
| Local files and sessions | Stateless API. Preferences, imports and application status live in the user's browser storage. |
