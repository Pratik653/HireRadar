# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Setup

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#local-development) for running both parts locally.

## Checks

These run in CI on every pull request:

```bash
cd backend
ruff check app ../tests
ruff format --check app ../tests
pytest -q
```

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

## Guidelines

- **Tests use fixtures, not the network.** Live adapters are tested with `httpx.MockTransport`. Never add tests
  that call LinkedIn or depend on real accounts.
- **Never present synthetic data as live.** Demo records must keep `is_demo=True`, and a failed source must show
  as failed, never be filled in with demo data.
- **Don't invent fields.** If a source has no publish date or contact, leave it empty.
- **New source adapters** go in `backend/app/sources/`. Implement `fetch(request, client) -> FetchResult`, fill in
  `SourceInfo` honestly (auth, coverage, rate limits, terms, reliability), add the host to `ALLOWED_HOSTS` in
  `sources/http.py`, register the adapter in `sources/__init__.py`, and add a test with a stubbed transport. The
  source's terms must allow the use.
- **New locations** go in `backend/app/geo.py` and `frontend/src/lib/catalog.ts`.
- Keep the scoring explainable. Every factor that changes a score should add a line to `explanations`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Branches

`main` is protected: open a pull request and wait for CI to pass.
