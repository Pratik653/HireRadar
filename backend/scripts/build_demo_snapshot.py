"""Write frontend/public/demo-snapshot.json: the demo search run through the real
engine, used by the static site when no backend is connected.

    python -m scripts.build_demo_snapshot   (from backend/)
"""

import asyncio
import json
from pathlib import Path

from app.models import SearchRequest
from app.search import run_search
from app.sources.http import SafeClient

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo-snapshot.json"

# Same as DEFAULT_FORM in frontend/src/components/SearchPanel.tsx, so the snapshot
# matches what a first-time visitor sees in the form.
REQUEST = SearchRequest(
    mode="demo",
    titles=["Applied AI Engineer", "LLM Engineer", "Python Developer"],
    skills=["Python", "RAG", "LangGraph", "Agentic AI", "LLM"],
    locations=[{"country_code": "AE"}, {"country_code": "SA", "city": "Riyadh"}, {"country_code": "QA"}],
    days=7,
)


async def main() -> None:
    client = SafeClient()
    try:
        response = await run_search(REQUEST, client)
    finally:
        await client.aclose()
    OUT.write_text(json.dumps(response.model_dump(mode="json"), indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} ({len(response.results)} results)")


if __name__ == "__main__":
    asyncio.run(main())
