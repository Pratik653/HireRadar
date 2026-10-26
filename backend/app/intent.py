"""Rule-based hiring-intent classification.

Deterministic on purpose: every label comes with the phrase that triggered it,
so a user can see why a post was (or was not) treated as a vacancy.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models import Intent

INTENT_SCORES = {
    Intent.EXPLICIT_VACANCY: 1.0,
    Intent.HIRING_MANAGER: 0.95,
    Intent.RECRUITER: 0.85,
    Intent.GENERAL_RECRUITMENT: 0.7,
    Intent.WEAK_SIGNAL: 0.3,
    Intent.UNRELATED: 0.0,
}


def _rx(*phrases: str) -> re.Pattern[str]:
    return re.compile(r"(" + "|".join(phrases) + r")", re.I)


# Job seekers and congratulation posts use hiring vocabulary but are not openings.
NOT_HIRING = _rx(
    r"#?open\s?to\s?work",
    r"i am looking for (a )?(new )?(job|role|opportunit)",
    r"i'?m looking for (a )?(new )?(job|role|opportunit)",
    r"seeking (new )?(opportunities|a role)",
    r"(i|i'?ve) (got|been) hired",
    r"happy to (share|announce) (that )?i('?m| am| have)",
    r"excited to (share|announce) (that )?i('?m| am| have| will)",
    r"started a new position",
    r"laid off",
    r"please help me find",
)
HIRING_MANAGER = _rx(
    r"(my|our) team is (hiring|growing|looking)",
    r"i'?m hiring",
    r"i am hiring",
    r"join my team",
    r"hiring for my team",
    r"i'?m (building|growing) (a|my) team",
    r"looking for (an?|someone).{0,40}to join (my|our) team",
    r"reach out to me directly",
    r"dm me",
    r"send me (your|a) (cv|resume)",
)
RECRUITER = _rx(
    r"my client",
    r"on behalf of",
    r"i'?m recruiting",
    r"i am recruiting",
    r"recruiting for",
    r"exclusive (search|mandate)",
    r"retained search",
    r"(send|share) (your )?(cv|resume)s?",
    r"cv to",
    r"resumes? to",
)
GENERAL = _rx(
    r"we'?re hiring",
    r"we are hiring",
    r"now hiring",
    r"urgent(ly)? hiring",
    r"#hiring",
    r"\bhiring\b",
    r"join (us|our team)",
    r"open (roles|positions|vacanc)",
    r"vacanc(y|ies)",
    r"job opening",
    r"we are looking for",
    r"we'?re looking for",
    r"apply (now|here|via|at|today)",
)
VACANCY_DETAIL = _rx(
    r"requirements?:",
    r"responsibilities",
    r"qualifications",
    r"years of experience",
    r"\d\+?\s*(years|yrs)",
    r"job description",
    r"apply (now|here|via|at|today)",
    r"how to apply",
    r"full[- ]time",
    r"contract (role|position)",
    r"salary",
    r"location:",
)
WEAK = _rx(
    r"growing (the )?team",
    r"exciting things (coming|ahead)",
    r"looking for talent",
    r"talent (community|pool)",
    r"opportunities (soon|coming)",
    r"keep an eye out",
    r"we'?re expanding",
    r"stay tuned",
    r"open to connect",
    r"always looking for",
)
RECRUITER_POSITION = _rx(
    r"recruit", r"talent", r"\bta\b", r"sourcing", r"headhunt", r"staffing", r"\bhr\b", r"people partner"
)
MANAGER_POSITION = _rx(
    r"head of", r"director", r"manager", r"\blead\b", r"founder", r"\bcto\b", r"\bceo\b", r"\bvp\b", r"chief"
)


@dataclass(frozen=True)
class IntentResult:
    intent: Intent
    score: float
    evidence: str


def _first(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    return match.group(0) if match else None


def classify(text: str, author_position: str | None = None, structured_listing: bool = False) -> IntentResult:
    """Classify one item. ``structured_listing`` marks records from job APIs and
    ATS boards, which are vacancies by construction."""
    if structured_listing:
        return IntentResult(Intent.EXPLICIT_VACANCY, 1.0, "published as a job listing by the source")

    text = text or ""
    position = author_position or ""

    if hit := _first(NOT_HIRING, text):
        return IntentResult(Intent.UNRELATED, 0.0, f'job-seeker or announcement phrase "{hit}"')

    general = _first(GENERAL, text)
    detail = _first(VACANCY_DETAIL, text)
    manager = _first(HIRING_MANAGER, text)
    recruiter = _first(RECRUITER, text)

    if manager and (MANAGER_POSITION.search(position) or not RECRUITER_POSITION.search(position)):
        return IntentResult(Intent.HIRING_MANAGER, 0.95, f'first-person hiring phrase "{manager}"')
    if recruiter or (RECRUITER_POSITION.search(position) and (general or manager)):
        trigger = recruiter or f"poster's position ({position})"
        return IntentResult(Intent.RECRUITER, 0.85, f"recruiter signal: {trigger}")
    if general and detail:
        return IntentResult(Intent.EXPLICIT_VACANCY, 1.0, f'hiring phrase "{general}" with vacancy detail "{detail}"')
    if general:
        return IntentResult(Intent.GENERAL_RECRUITMENT, 0.7, f'hiring phrase "{general}"')
    if hit := _first(WEAK, text):
        return IntentResult(Intent.WEAK_SIGNAL, 0.3, f'indirect phrase "{hit}" — not a confirmed vacancy')
    return IntentResult(Intent.UNRELATED, 0.0, "no hiring language found")
