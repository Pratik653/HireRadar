"""HireRadar API."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app import __version__, geo
from app.config import settings
from app.export import build_workbook
from app.models import ExportRequest, SearchRequest, SearchResponse
from app.scoring import WEIGHTS
from app.search import run_search
from app.security import GuardMiddleware, RateLimiter
from app.sources import DEMO_ADAPTER, LIVE_ADAPTERS, PLANNED_SOURCES
from app.sources.http import SafeClient

logging.basicConfig(level=settings.log_level, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("hireradar")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = SafeClient()
    yield
    await app.state.client.aclose()


app = FastAPI(
    title="HireRadar API",
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)
app.add_middleware(
    GuardMiddleware,
    limiter=RateLimiter(settings.rate_limit_per_minute),
    body_limits={"/api/export": 2_000_000},
    default_limit=settings.max_body_bytes,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
    max_age=600,
)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Keep the message useful without echoing the (possibly large) submitted input.
    errors = [{"field": ".".join(str(p) for p in err["loc"][1:]), "message": err["msg"]} for err in exc.errors()][:20]
    return JSONResponse({"detail": "Invalid request", "errors": errors}, status_code=422)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": __version__, "time": datetime.now(UTC).isoformat()}


@app.get("/api/meta")
async def meta() -> dict:
    return {
        "version": __version__,
        "locations": geo.catalog(),
        "weights": WEIGHTS,
        "sources": [asdict(a.info) for a in LIVE_ADAPTERS.values()],
        "demo_source": asdict(DEMO_ADAPTER.info),
        "planned_sources": [asdict(s) for s in PLANNED_SOURCES],
        "suggested_boards": [
            {"provider": "greenhouse", "slug": "careem", "company": "Careem"},
            {"provider": "greenhouse", "slug": "tamara", "company": "Tamara"},
            {"provider": "ashby", "slug": "ziina", "company": "Ziina"},
        ],
    }


@app.post("/api/search", response_model=SearchResponse)
async def search(request: Request, body: SearchRequest) -> SearchResponse:
    response = await run_search(body, request.app.state.client)
    log.info(
        "search mode=%s sources=%s fetched=%d returned=%d",
        body.mode,
        ",".join(s.source + ":" + s.status for s in response.sources),
        response.summary.fetched,
        response.summary.returned,
    )
    return response


@app.post("/api/export")
async def export(body: ExportRequest) -> Response:
    content = build_workbook(body)
    stamp = body.response.generated_at.strftime("%Y%m%d-%H%M")
    prefix = "hireradar-demo" if body.response.mode == "demo" else "hireradar"
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{prefix}-{stamp}.xlsx"'},
    )
