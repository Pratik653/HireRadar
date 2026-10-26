"""Title normalisation, skill synonyms, seniority detection and keyword helpers."""

from __future__ import annotations

import html
import re

# Canonical skill → equivalent phrasings. A user term in this table is
# canonicalised, so "Retrieval Augmented Generation" and "RAG" count once.
SKILL_SYNONYMS: dict[str, list[str]] = {
    "python": ["python", "python3"],
    "llm": [
        "llm",
        "llms",
        "large language model",
        "large language models",
        "genai",
        "generative ai",
        "gen ai",
        "foundation model",
        "foundation models",
    ],
    "rag": ["rag", "retrieval augmented generation", "retrieval-augmented generation", "retrieval augmented"],
    "langgraph": ["langgraph", "lang graph"],
    "langchain": ["langchain", "lang chain"],
    "agentic ai": ["agentic ai", "agentic", "ai agents", "ai agent", "multi-agent", "multi agent", "autonomous agents"],
    "machine learning": ["machine learning", "ml"],
    "deep learning": ["deep learning", "neural network", "neural networks"],
    "nlp": ["nlp", "natural language processing"],
    "computer vision": ["computer vision", "image recognition", "object detection"],
    "mlops": ["mlops", "ml ops", "model deployment", "model serving"],
    "ai research": ["ai research"],
    "data engineering": ["data engineering", "data pipeline", "data pipelines"],
    "sql": ["sql"],
    "kubernetes": ["kubernetes", "k8s"],
    "javascript": ["javascript", "js"],
    "go": ["golang"],
    "prompt engineering": ["prompt engineering", "prompt design", "prompting"],
    "fine-tuning": ["fine-tuning", "fine tuning", "finetuning"],
}

# Evidence that implies a broader skill without being the same thing: a FastAPI
# posting is a Python posting, but a user asking for FastAPI wants FastAPI.
SKILL_IMPLIES: dict[str, list[str]] = {
    "python": ["fastapi", "django", "flask", "pandas", "pytorch"],
    "llm": ["gpt", "llama", "claude", "gemini", "mistral"],
    "rag": ["vector search", "vector database", "vector db", "pgvector", "pinecone", "weaviate"],
    "agentic ai": ["langgraph", "crewai", "autogen", "tool calling", "function calling"],
    "machine learning": ["scikit-learn", "sklearn", "xgboost", "pytorch", "tensorflow"],
    "deep learning": ["pytorch", "tensorflow", "keras", "transformers"],
    "nlp": ["transformers", "text mining", "hugging face", "huggingface"],
    "computer vision": ["opencv", "yolo"],
    "mlops": ["mlflow", "kubeflow", "sagemaker", "vertex ai"],
    "ai research": ["research scientist", "research engineer", "neurips", "icml", "acl", "publications"],
    "data engineering": ["etl", "elt", "airflow", "spark", "pyspark", "dbt", "databricks", "kafka"],
    "sql": ["postgresql", "postgres", "mysql", "sql server", "snowflake", "bigquery"],
    "kubernetes": ["helm", "eks", "aks", "gke"],
    "javascript": ["typescript", "node.js", "nodejs", "react", "next.js"],
    "fine-tuning": ["lora", "qlora", "peft", "rlhf", "dpo"],
}

# Title aliases are applied before comparison so "Sr. ML Eng" ≈ "senior machine learning engineer".
_TITLE_REWRITES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(p, re.I), r)
    for p, r in [
        (r"\bsr\.?(?=\s|$)", "senior"),
        (r"\bjr\.?(?=\s|$)", "junior"),
        (r"\beng\.?(?=\s|$)", "engineer"),
        (r"\bdev\b", "developer"),
        (r"\bml\b", "machine learning"),
        (r"\bai/ml\b", "ai machine learning"),
        (r"\bgen\s?ai\b", "generative ai"),
        (r"\bswe\b", "software engineer"),
        (r"\bsde\b", "software engineer"),
        (r"\bnlp\b", "natural language processing"),
        (r"\bllm\b", "large language model"),
        (r"\brag\b", "retrieval augmented generation"),
        (r"\bmgr\b", "manager"),
        (r"\bvp\b", "vice president"),
    ]
]

SENIORITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("intern", re.compile(r"\b(intern|internship|trainee|graduate program)\b", re.I)),
    ("executive", re.compile(r"\b(chief|cto|ceo|cio|vice president|vp|head of|director)\b", re.I)),
    ("manager", re.compile(r"\b(manager|management)\b", re.I)),
    ("lead", re.compile(r"\b(lead|principal|staff|architect)\b", re.I)),
    ("senior", re.compile(r"\b(senior|sr\.?)\b", re.I)),
    ("junior", re.compile(r"\b(junior|jr\.?|entry[- ]level|associate)\b", re.I)),
]

STOPWORDS = frozenset(
    """a an and or of to in on for with is are was were be been this that your you we our
    i my me as at by from it its into about role roles job jobs position team join
    hiring hire looking engineer engineers developer developers specialist""".split()
)

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#.\-]*[a-z0-9+#]|[a-z0-9]")


def strip_html(value: str) -> str:
    return _WS.sub(" ", html.unescape(_TAG.sub(" ", value or ""))).strip()


def normalize_title(title: str) -> str:
    value = (title or "").lower()
    value = re.sub(r"[|/()\[\],:–—-]+", " ", value)
    for pattern, replacement in _TITLE_REWRITES:
        value = pattern.sub(replacement, value)
    return _WS.sub(" ", value).strip()


_TITLE_STOP = STOPWORDS - {"engineer", "engineers", "developer", "developers", "specialist"}
_SENIORITY_WORDS = {"senior", "junior", "lead", "principal", "staff", "head", "intern", "associate"}

# Role nouns grouped by the kind of work. "AI Engineer" and "AI Sales Executive"
# share a word but not a family, and should not count as the same title.
ROLE_FAMILIES: dict[str, set[str]] = {
    "engineering": {"engineer", "developer", "programmer", "architect", "swe", "devops", "sre"},
    "science": {"scientist", "researcher", "research"},
    "analysis": {"analyst"},
    "design": {"designer"},
    "product": {"product"},
    "sales": {"sales", "account", "executive", "business"},
    "management": {"manager", "director", "head"},
    "people": {"recruiter", "hr", "talent"},
}


def title_core(title: str) -> set[str]:
    """Meaningful title words with seniority markers removed."""
    words = set(normalize_title(title).split())
    return {w for w in words if w not in _SENIORITY_WORDS and w not in _TITLE_STOP and len(w) > 1}


def role_families(title: str) -> set[str]:
    words = set(normalize_title(title).split())
    return {family for family, nouns in ROLE_FAMILIES.items() if words & nouns}


def detect_seniority(title: str) -> str | None:
    for level, pattern in SENIORITY_PATTERNS:
        if pattern.search(title or ""):
            return level
    return None


def _skill_regex(forms: list[str]) -> re.Pattern[str]:
    alternatives = "|".join(sorted((re.escape(f) for f in forms), key=len, reverse=True))
    return re.compile(r"(?<![a-z0-9])(" + alternatives + r")(?![a-z0-9])", re.I)


_SKILL_RES = {skill: _skill_regex(forms + SKILL_IMPLIES.get(skill, [])) for skill, forms in SKILL_SYNONYMS.items()}


def canonical_skill(term: str) -> str:
    """Map a user term to its canonical skill name, or return it lower-cased."""
    low = term.strip().lower()
    for skill, forms in SKILL_SYNONYMS.items():
        if low == skill or low in forms:
            return skill
    return low


def skill_pattern(term: str) -> re.Pattern[str]:
    canonical = canonical_skill(term)
    return _SKILL_RES.get(canonical) or _skill_regex([canonical])


def skills_in(text: str, terms: list[str]) -> list[str]:
    """Canonical names of the requested ``terms`` that occur in ``text``."""
    hits: list[str] = []
    for term in terms:
        canonical = canonical_skill(term)
        if canonical not in hits and skill_pattern(term).search(text or ""):
            hits.append(canonical)
    return hits


def contains_term(text: str, term: str) -> bool:
    return bool(_skill_regex([term.strip().lower()]).search(text or ""))


def tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall((text or "").lower()) if t not in STOPWORDS]


def snippet(text: str, terms: list[str], length: int = 240) -> str:
    """A short excerpt centred on the first matched term, for evidence display."""
    text = _WS.sub(" ", text or "").strip()
    if len(text) <= length:
        return text
    start = 0
    for term in terms:
        match = skill_pattern(term).search(text)
        if match:
            start = max(0, match.start() - length // 3)
            break
    excerpt = text[start : start + length].strip()
    return ("…" if start else "") + excerpt + ("…" if start + length < len(text) else "")
