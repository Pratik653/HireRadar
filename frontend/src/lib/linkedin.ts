import { COUNTRY_BY_CODE, REGION_BY_ID, subdivisionName } from "./locations";
import type { Days, LocationSelection } from "./types";

// Research mode builds search URLs that the user opens in their own browser.
// Nothing here contacts LinkedIn or a search engine.
//
// Query syntax is kept to what LinkedIn documents for search: "quoted phrases"
// and an upper-case OR inside one pair of parentheses at most
// (https://www.linkedin.com/help/linkedin/answer/75814). Wildcards, + and - are
// not used. Each query names at most one place, because long location lists
// make LinkedIn's keyword matching less precise.

// LinkedIn's content search only offers these date buckets.
export function linkedinDateFilter(days: Days): "past-24h" | "past-week" | "past-month" {
  if (days <= 1) return "past-24h";
  if (days <= 7) return "past-week";
  return "past-month";
}

export type ResearchCategory =
  | "direct"
  | "recruiter"
  | "manager"
  | "referral"
  | "urgent"
  | "startup"
  | "expansion"
  | "tech"
  | "alt_titles"
  | "indirect"
  | "web";

export const CATEGORY_LABELS: Record<ResearchCategory, string> = {
  direct: "Hiring announcements",
  recruiter: "Recruiter posts",
  manager: "Hiring managers",
  referral: "Referrals",
  urgent: "Urgent hiring",
  startup: "Startups & founders",
  expansion: "Team expansion",
  tech: "Technology",
  alt_titles: "Alternative titles",
  indirect: "Indirect signals",
  web: "Web search",
};

export interface ResearchQuery {
  id: string;
  category: ResearchCategory;
  label: string;
  query: string;
  url: string;
  engine: "linkedin" | "google" | "bing";
}

export interface ResearchInput {
  titles: string[];
  skills: string[];
  locations: LocationSelection[];
  days: Days;
}

// --- vocabulary ---------------------------------------------------------------

// Related job titles, keyed by a word or phrase found in the user's title.
const ROLE_ALTERNATIVES: [RegExp, string[]][] = [
  [/\b(llm|large language)\b/i, ["GenAI Engineer", "Generative AI Engineer", "AI Engineer"]],
  [/\b(gen ?ai|generative)\b/i, ["LLM Engineer", "AI Engineer", "Applied AI Engineer"]],
  [/\b(applied ai|ai engineer)\b/i, ["Machine Learning Engineer", "LLM Engineer", "Applied Scientist"]],
  [/\b(machine learning|ml)\b/i, ["ML Engineer", "MLOps Engineer", "Applied Scientist"]],
  [/\brag\b/i, ["LLM Engineer", "Search Engineer", "AI Engineer"]],
  [/\b(agent|agentic)\b/i, ["AI Agent Engineer", "LLM Engineer", "AI Engineer"]],
  [/\bai research|research scientist|research engineer\b/i, ["Research Scientist", "Research Engineer", "Applied Scientist"]],
  [/\bdata scien/i, ["Machine Learning Scientist", "Applied Scientist", "Data Analyst"]],
  [/\bdata engineer/i, ["Analytics Engineer", "Big Data Engineer", "ETL Developer"]],
  [/\bpython\b/i, ["Python Engineer", "Backend Engineer", "Django Developer"]],
  [/\bbackend|back-end\b/i, ["Backend Developer", "Software Engineer", "API Engineer"]],
  [/\bfront ?end|react\b/i, ["Frontend Developer", "React Developer", "UI Engineer"]],
  [/\bfull ?stack\b/i, ["Full Stack Engineer", "Software Engineer", "Web Developer"]],
  [/\b(devops|sre|platform|cloud)\b/i, ["DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer"]],
  [/\b(qa|test|quality)\b/i, ["QA Engineer", "Test Automation Engineer", "SDET"]],
  [/\bsecurity\b/i, ["Security Engineer", "Cybersecurity Analyst", "Application Security Engineer"]],
  [/\bproduct manager\b/i, ["Product Owner", "Technical Product Manager", "Product Lead"]],
  [/\b(designer|ux|ui)\b/i, ["Product Designer", "UX Designer", "UI Designer"]],
  [/\bsoftware (engineer|developer)\b/i, ["Software Developer", "Backend Engineer", "Full Stack Engineer"]],
];

// Neighbouring technologies, keyed by a skill or a word in a title.
const RELATED_TECH: [RegExp, string[]][] = [
  [/\b(llm|gen ?ai|generative|large language)\b/i, ["RAG", "GenAI", "AI agents", "vector database", "enterprise AI"]],
  [/\brag\b|retrieval/i, ["vector search", "LLM", "embeddings"]],
  [/\b(langgraph|langchain)\b/i, ["LangChain", "LangGraph", "AI agents"]],
  [/\b(agent|agentic)\b/i, ["AI agents", "multi-agent", "LangGraph"]],
  [/\bpython\b/i, ["FastAPI", "Django"]],
  [/\b(machine learning|ml)\b/i, ["PyTorch", "MLOps"]],
  [/\bdata engineer|etl|spark\b/i, ["Databricks", "Airflow", "dbt"]],
  [/\b(react|front ?end)\b/i, ["TypeScript", "Next.js"]],
  [/\b(devops|cloud|kubernetes)\b/i, ["Kubernetes", "Terraform", "AWS"]],
];

// --- helpers ------------------------------------------------------------------

const clean = (s: string) => s.replace(/["()]/g, "").replace(/\s+/g, " ").trim();
const q = (s: string) => `"${clean(s)}"`;
const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ").trim();
const uniq = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function placeNames(locations: LocationSelection[]): string[] {
  const names = locations
    .filter((l) => l.region !== "world") // a worldwide search needs no place terms
    .map((l) =>
      l.region
        ? REGION_BY_ID[l.region]?.name
        : l.city || (l.subdivision && subdivisionName(l.subdivision)) || COUNTRY_BY_CODE[l.country_code ?? ""]?.name,
    )
    .filter(Boolean) as string[];
  return uniq(names);
}

function expand(table: [RegExp, string[]][], terms: string[]): string[] {
  return terms.flatMap((term) => table.filter(([re]) => re.test(term)).flatMap(([, more]) => more));
}

/** Small stable hash for React keys and "opened" tracking. */
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function linkedinUrl(keywords: string, days: Days): string {
  const params = new URLSearchParams({
    keywords,
    datePosted: `"${linkedinDateFilter(days)}"`,
    sortBy: '"date_posted"',
  });
  return `https://www.linkedin.com/search/results/content/?${params.toString()}`;
}

export function googleUrl(query: string, days: Days): string {
  const tbs = days <= 1 ? "qdr:d" : days <= 7 ? "qdr:w" : "qdr:m";
  return `https://www.google.com/search?${new URLSearchParams({ q: query, tbs }).toString()}`;
}

export function bingUrl(query: string, days: Days): string {
  // Bing's freshness filter: ez1 = past 24 hours, ez2 = past week, ez3 = past month.
  const range = days <= 1 ? "ez1" : days <= 7 ? "ez2" : "ez3";
  return `https://www.bing.com/search?${new URLSearchParams({ q: query, filters: `ex1:"${range}"` }).toString()}`;
}

// --- planner ------------------------------------------------------------------

type Template = (role: string, place: string, tech: string) => string;

interface Plan {
  category: Exclude<ResearchCategory, "web">;
  cap: number;
  over: "roles" | "alts" | "tech";
  templates: Template[];
}

// Each template is a short keyword query: one or two quoted phrases, a role and
// one place. Order matters: the earliest templates are the strongest signals.
const PLANS: Plan[] = [
  {
    category: "direct",
    cap: 7,
    over: "roles",
    templates: [
      (r, p) => join(q("hiring"), q(r), p && q(p)),
      (r, p) => join(`("we are hiring" OR "we're hiring")`, q(r), p && q(p)),
      (r, p) => join(q("open position"), q(r), p && q(p)),
      (r, p) => join(q("now hiring"), q(r), p && q(p)),
    ],
  },
  {
    category: "recruiter",
    cap: 5,
    over: "roles",
    templates: [
      (r, p) => join(q("my client"), q(r), p && q(p)),
      (r, p) => join(q("send your CV"), q(r), p && q(p)),
      (r, p) => join(q("recruiting for"), q(r), p && q(p)),
      (r, p) => join(q("share your resume"), q(r), p && q(p)),
    ],
  },
  {
    category: "manager",
    cap: 5,
    over: "roles",
    templates: [
      (r, p) => join(q("my team is hiring"), q(r), p && q(p)),
      (r, p) => join(q("join my team"), q(r), p && q(p)),
      (r) => join(q("I'm hiring"), q(r)),
      (r, p) => join(q("hiring for my team"), q(r), p && q(p)),
    ],
  },
  {
    category: "referral",
    cap: 4,
    over: "roles",
    templates: [
      (r, p) => join(q("happy to refer"), q(r), p && q(p)),
      (r) => join(q("referral"), q(r)),
      (r) => join(q("my company is hiring"), q(r)),
    ],
  },
  {
    category: "urgent",
    cap: 4,
    over: "roles",
    templates: [
      (r, p) => join(q("urgent hiring"), q(r), p && q(p)),
      (r, p) => join(q("immediate joiner"), q(r), p && q(p)),
      (r, p) => join(q("urgently looking for"), q(r), p && q(p)),
    ],
  },
  {
    category: "startup",
    cap: 4,
    over: "tech",
    templates: [
      (_r, p, t) => join(q("founding engineer"), q(t), p && q(p)),
      (_r, p, t) => join(q("startup hiring"), q(t), p && q(p)),
      (_r, _p, t) => join(q("first hire"), q(t)),
    ],
  },
  {
    category: "expansion",
    cap: 4,
    over: "roles",
    templates: [
      (r, p) => join(q("growing our team"), q(r), p && q(p)),
      (r, p) => join(q("expanding our team"), q(r), p && q(p)),
      (r, p) => join(q("new roles"), q(r), p && q(p)),
    ],
  },
  {
    category: "tech",
    cap: 8,
    over: "tech",
    templates: [
      (_r, p, t) => join(q("hiring"), q(t), p && q(p)),
      (_r, p, t) => join(q(`${t} engineer`), q("hiring"), p && q(p)),
      (_r, _p, t) => join(q("looking for"), q(`${t} experience`)),
    ],
  },
  {
    category: "alt_titles",
    cap: 6,
    over: "alts",
    templates: [(r, p) => join(q("hiring"), q(r), p && q(p)), (r, p) => join(q("we are hiring"), q(r), p && q(p))],
  },
  {
    category: "indirect",
    cap: 5,
    over: "tech",
    templates: [
      (_r, p, t) => join(q("join us"), q(t), p && q(p)),
      (_r, _p, t) => join(q("we're building"), q(t)),
      (_r, p, t) => join(q("open roles"), q(t), p && q(p)),
      (_r, _p, t) => join(q("DM me"), q(t)),
      (_r, _p, t) => join(q("looking for someone"), q(t)),
    ],
  },
];

const WEB_CAP = 8;
const MAX_QUERIES = 60;

/**
 * Plan a research session: roughly 30–60 distinct searches across ten post
 * categories plus web-search alternatives. Deterministic: the same input gives
 * the same list in the same order. Categories are interleaved so the first
 * screen already covers every kind of post.
 */
export function buildResearchPlan(input: ResearchInput): ResearchQuery[] {
  const roles = uniq(input.titles.map(clean)).slice(0, 4);
  const skills = uniq(input.skills.map(clean)).slice(0, 6);
  if (!roles.length && !skills.length) return [];

  const lower = new Set(roles.map((r) => r.toLowerCase()));
  const alts = uniq(expand(ROLE_ALTERNATIVES, roles)).filter((a) => !lower.has(a.toLowerCase())).slice(0, 6);
  const tech = uniq([...skills, ...expand(RELATED_TECH, [...roles, ...skills])]).slice(0, 10);
  const places = placeNames(input.locations).slice(0, 8);
  const placeCycle = places.length ? places : [""];
  const seen = new Set<string>();
  let placeTurn = 0;

  const make = (category: ResearchCategory, keywords: string, engine: ResearchQuery["engine"], label: string) => {
    const key = `${engine}:${keywords.toLowerCase()}`;
    if (seen.has(key) || keywords.length > 140) return null;
    seen.add(key);
    const url =
      engine === "linkedin"
        ? linkedinUrl(keywords, input.days)
        : engine === "google"
          ? googleUrl(keywords, input.days)
          : bingUrl(keywords, input.days);
    return { id: hash(key), category, label, query: keywords, url, engine } satisfies ResearchQuery;
  };

  const byCategory: ResearchQuery[][] = PLANS.map((plan) => {
    const subjects = plan.over === "roles" ? roles : plan.over === "alts" ? alts : tech;
    const out: ResearchQuery[] = [];
    // Pair subjects and templates diagonally so each subject meets different
    // templates, and rotate places so every selected place gets queries while
    // no single query lists several places.
    const pairs = plan.templates.length * subjects.length;
    for (let k = 0; k < pairs && out.length < plan.cap; k++) {
      const subject = subjects[k % subjects.length];
      const template = plan.templates[(k + Math.floor(k / subjects.length)) % plan.templates.length];
      const place = placeCycle[placeTurn++ % placeCycle.length];
      const keywords = plan.over === "tech" ? template(roles[0] ?? "", place, subject) : template(subject, place, "");
      const used = keywords.includes(`"${place}"`) ? place : "";
      const item = make(plan.category, keywords, "linkedin", join(subject, used && `· ${used}`));
      if (item) out.push(item);
    }
    return out;
  });

  // Public web search for indexed LinkedIn posts: one place per query.
  const web: ResearchQuery[] = [];
  const subjects = roles.length ? roles : tech;
  for (const place of placeCycle) {
    for (const subject of subjects) {
      if (web.length >= WEB_CAP) break;
      const keywords = join("site:linkedin.com/posts", `("hiring" OR "we're hiring")`, q(subject), place && q(place));
      const engine = web.length % 3 === 2 ? "bing" : "google";
      const item = make("web", keywords, engine, join(subject, place && `· ${place}`, engine === "bing" ? "(Bing)" : "(Google)"));
      if (item) web.push(item);
    }
  }
  byCategory.push(web);

  // Interleave: first of each category, then second of each, and so on.
  const result: ResearchQuery[] = [];
  for (let i = 0; byCategory.some((list) => i < list.length); i++) {
    byCategory.forEach((list) => list[i] && result.push(list[i]));
  }
  return result.slice(0, MAX_QUERIES);
}
