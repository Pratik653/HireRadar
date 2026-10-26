# Deployment

The frontend and backend deploy independently. The frontend works without the backend. In that case it shows
the pre-computed demo snapshot, and Live mode and Excel export are disabled.

## Frontend: GitHub Pages

`.github/workflows/pages.yml` runs on every push to `main`. It:

1. installs the backend requirements and runs `python -m scripts.build_demo_snapshot` so the static demo is
   fresh;
2. builds the Vite app with `VITE_BASE=/HireRadar/`, which a project Pages site at
   `https://<user>.github.io/HireRadar/` needs;
3. uploads `frontend/dist` and deploys it with `actions/deploy-pages`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

To connect the backend, add a repository variable (not a secret, since the URL is public):
**Settings → Secrets and variables → Actions → Variables → `VITE_API_URL` = `https://<service>.onrender.com`**,
then re-run the workflow.

## Backend: Render free web service

`render.yaml` is a Render Blueprint.

1. In Render: **New → Blueprint**, connect the GitHub repository, and accept `hireradar-api`.
2. Render builds from `backend/` with `pip install -r requirements.txt` and starts
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`.
   `--proxy-headers` makes the rate limiter see client addresses, not Render's proxy.
3. The health check is `GET /health`.
4. Copy the service URL into the `VITE_API_URL` repository variable (see above).

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://pratik653.github.io,http://localhost:5173,http://127.0.0.1:5173` | CORS allowlist, comma-separated, exact origins (no paths) |
| `RATE_LIMIT_PER_MINUTE` | `30` | POST requests per client per minute under `/api` |
| `MAX_BODY_BYTES` | `256000` | Body limit for `/api/search` (`/api/export` allows 2 MB) |
| `SOURCE_TIMEOUT_SECONDS` | `12` | Per-request upstream timeout |
| `SEARCH_TIMEOUT_SECONDS` | `25` | Per-source wall-clock limit |
| `MAX_UPSTREAM_RESPONSE_BYTES` | `6000000` | Upstream response size cap |
| `CACHE_TTL_SECONDS` | `900` | Upstream response cache |
| `LOG_LEVEL` | `INFO` | Log level |
| `PYTHON_VERSION` | `3.12.8` (set in `render.yaml`) | Render's Python runtime |

There are no secrets. No source needs an API key.

### Free-tier behaviour

Render's free web services sleep after about 15 minutes without traffic. The next request waits while the
instance boots. During that time the Render proxy may return 502/503, or the request may just hang. The
frontend treats both as "waking", shows the cold-start notice, and offers Retry if the request fails. It pings
`/health` as soon as the page loads so the boot starts before the user presses Search.

Measured locally, the API's working set is about 140 MB after several searches (mostly numpy, scipy and
scikit-learn), well under the free tier's 512 MB. There are no background
workers and no browsers.

## Local development

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; use .venv/bin/activate elsewhere
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev                   # reads VITE_API_URL from .env.development
```

Open http://localhost:5173. API docs are at http://localhost:8000/docs.
