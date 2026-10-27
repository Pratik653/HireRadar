# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/Pratik653/HireRadar/security/advisories/new) rather than a public
issue. I aim to reply within a week.

## What HireRadar protects against

| Risk | Control |
|---|---|
| SSRF | The server never fetches a user-supplied URL. Adapters reach only `remotive.com`, `boards-api.greenhouse.io`, `api.lever.co` and `api.ashbyhq.com`, over HTTPS, without following redirects. Company-board slugs must match `^[a-z0-9][a-z0-9._-]{0,63}$` before they are placed in a URL. |
| Unsafe links | User URLs must be http(s), have a public host name, no credentials, no IP literal and no internal suffix (`.local`, `.internal` …). The frontend renders only http(s) links, with `rel="noopener noreferrer nofollow"`. |
| Spreadsheet formula injection | XLSX cells beginning with `= + - @` or a tab or CR are stored as literal strings. In CSV they get a leading apostrophe. |
| Oversized or abusive requests | Strict Pydantic schemas (`extra="forbid"`, list and length limits), 256 kB body limit for search and 2 MB for export, 30 POST requests per client per minute, upstream timeouts and response size caps. |
| CORS | Exact-origin allowlist from `ALLOWED_ORIGINS`; GET/POST and `Content-Type` only; no credentials. |
| Credential exposure | No accounts and no API keys. HireRadar never asks for, stores or forwards LinkedIn passwords, cookies or sessions. |
| Logging | Request bodies (resume text, imported posts) are not logged. Validation errors return field names and messages, not the submitted values. |

## Research Companion extension

- Its only permission is `storage`. It has no host permissions and no content scripts, so it cannot read or
  modify any page, LinkedIn included, and has no access to cookies or credentials.
- `externally_connectable` admits only `https://pratik653.github.io`. The service worker re-checks the sender's
  origin and accepts four message types. Sessions are schema-validated, and URLs must be LinkedIn post searches
  whose keywords match the query.
- Extension pages use a `script-src 'self'` CSP. `node extension/scripts/build.mjs --check` enforces the
  permission boundary in CI.

## Data handling

- Preferences, resume text, imported posts and application status stay in the browser's `localStorage`.
  **Clear my local data** removes them.
- Each search sends the form, including resume text and imports in Live mode, to the API. The API processes the
  request in memory and keeps nothing. Upstream API responses (public job listings) are cached for 15 minutes.
- Contact details appear only when the user typed them in (shown as *user-provided*). HireRadar does not extract
  email addresses or profiles from posts.

## Out of scope

The Render free tier gives no uptime guarantee, and the in-memory rate limiter resets when the service restarts.
For heavier use, put a proper rate limiter in front of the API.
