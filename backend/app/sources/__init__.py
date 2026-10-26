"""Source registry. Add a new adapter here and it appears in ``/api/meta``."""

from app.sources.base import FetchResult, RawRecord, SourceAdapter, SourceInfo
from app.sources.boards import CompanyBoardsAdapter
from app.sources.demo import DemoAdapter
from app.sources.manual import ManualImportAdapter
from app.sources.remotive import RemotiveAdapter

LIVE_ADAPTERS: dict[str, SourceAdapter] = {
    "manual_import": ManualImportAdapter(),
    "company_boards": CompanyBoardsAdapter(),
    "remotive": RemotiveAdapter(),
}
DEMO_ADAPTER = DemoAdapter()

# Documented but not implemented: shown in the UI so users know why it is absent.
PLANNED_SOURCES = [
    SourceInfo(
        key="linkedin_official",
        label="LinkedIn (official API)",
        live=False,
        authentication="Requires an approved LinkedIn partner program application.",
        coverage="Not available to HireRadar today.",
        rate_limits="Set by LinkedIn per partner agreement.",
        terms="LinkedIn's User Agreement prohibits scraping and automated access. HireRadar "
        "offers research mode (search links you open yourself) plus manual import instead.",
        reliability="Not integrated.",
    ),
]

__all__ = [
    "DEMO_ADAPTER",
    "LIVE_ADAPTERS",
    "PLANNED_SOURCES",
    "FetchResult",
    "RawRecord",
    "SourceAdapter",
    "SourceInfo",
]
