import { COUNTRY_BY_CODE, REGION_BY_ID, subdivisionName } from "./locations";
import type { Days, LocationSelection } from "./types";

// Research mode builds search URLs that the user opens in their own browser.
// Nothing here contacts LinkedIn or a search engine, and HireRadar never learns
// how many results a search returned; the user tells us through feedback.
//
// Syntax: only what LinkedIn documents for search
// (https://www.linkedin.com/help/linkedin/answer/75814): "quoted phrases",
// upper-case OR, and one pair of parentheses at most. No wildcards, + or -.
//
// Why queries are short: LinkedIn's post search ANDs every term, and a quoted
// phrase must appear verbatim. A query that demands an exact hiring phrase, an
// exact job title and an exact city at once ("my team is hiring" "Business
// Operations Specialist" "Sharjah") almost never matches. So each query quotes
// at most one or two phrases, hiring language is an OR group, and the place
// relaxes from city to country to none as the strategy widens.

// ---------------------------------------------------------------------------------
// Date filter

/** LinkedIn's post search offers these buckets; "any" omits the filter. */
export type PostedWindow = "past-24h" | "past-week" | "past-month" | "any";
export const WINDOW_LABEL: Record<PostedWindow, string> = {
  "past-24h": "Past 24 hours",
  "past-week": "Past week",
  "past-month": "Past month",
  any: "Any time",
};
export const WINDOWS: PostedWindow[] = ["past-24h", "past-week", "past-month", "any"];

export function linkedinDateFilter(days: Days): Exclude<PostedWindow, "any"> {
  if (days <= 1) return "past-24h";
  if (days <= 7) return "past-week";
  return "past-month";
}

export const widerWindow = (w: PostedWindow): PostedWindow | null => WINDOWS[WINDOWS.indexOf(w) + 1] ?? null;

// ---------------------------------------------------------------------------------
// Types

export type Strategy = "focused" | "balanced" | "broad" | "discovery";
export const STRATEGY_LABEL: Record<Strategy, string> = {
  focused: "Focused",
  balanced: "Balanced",
  broad: "Broad",
  discovery: "Discovery",
};
export const STRATEGY_HINT: Record<Strategy, string> = {
  focused: "Exact title, hiring language and your city",
  balanced: "Shorter title and country-level location",
  broad: "Role family and hiring language, no location keyword",
  discovery: "Related titles, skills and indirect hiring language",
};
/** Narrow → wide. "Try broader" moves right, "more focused" moves left. */
export const LADDER: Strategy[] = ["focused", "balanced", "broad", "discovery"];

export type ResearchCategory =
  | "direct"
  | "recruiter"
  | "manager"
  | "referral"
  | "urgent"
  | "expansion"
  | "alt_titles"
  | "tech"
  | "indirect"
  | "web";

export const CATEGORY_LABELS: Record<ResearchCategory, string> = {
  direct: "Hiring announcements",
  recruiter: "Recruiter posts",
  manager: "Hiring managers",
  referral: "Referrals",
  urgent: "Urgent hiring",
  expansion: "Team expansion",
  alt_titles: "Alternative titles",
  tech: "Skills",
  indirect: "Indirect signals",
  web: "Web search",
};

export interface ResearchQuery {
  id: string;
  strategy: Strategy;
  category: ResearchCategory;
  /** The user's title (or skill) this query is about; links broader/narrower siblings. */
  subject: string;
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
  window?: PostedWindow;
}

export type Feedback = "relevant" | "none" | "irrelevant" | "unreviewed";
export const FEEDBACK_LABEL: Record<Feedback, string> = {
  unreviewed: "Not reviewed",
  relevant: "Relevant results found",
  none: "No results",
  irrelevant: "Results not relevant",
};

// ---------------------------------------------------------------------------------
// Vocabulary

const SENIORITY = /\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|head of|associate|entry[- ]level|mid[- ]level|graduate|trainee|intern)\b/gi;

// Related job titles, keyed by words in the user's title. Covers business roles
// as well as technical ones.
const ROLE_ALTERNATIVES: [RegExp, string[]][] = [
  [/\boperations?\b|\bops\b/i, ["Operations Coordinator", "Operations Analyst", "Business Operations Associate", "Operations Executive"]],
  [/\bbusiness analyst\b/i, ["Business Analyst", "Process Analyst", "Operations Analyst"]],
  [/\bproject manager|program manager\b/i, ["Project Coordinator", "Program Manager", "Delivery Manager"]],
  [/\bproduct manager\b/i, ["Product Owner", "Technical Product Manager", "Product Lead"]],
  [/\bsales|business development\b/i, ["Account Executive", "Business Development Manager", "Sales Executive"]],
  [/\bmarketing\b/i, ["Marketing Executive", "Digital Marketing Specialist", "Growth Marketer"]],
  [/\b(finance|financial|accountant|accounting)\b/i, ["Financial Analyst", "Accountant", "Finance Executive"]],
  [/\b(hr|human resources|people|talent)\b/i, ["HR Generalist", "Talent Acquisition Specialist", "HR Business Partner"]],
  [/\bcustomer (success|support|service)\b/i, ["Customer Success Manager", "Customer Support Specialist", "Client Services Executive"]],
  [/\bdata analyst\b/i, ["Business Intelligence Analyst", "Reporting Analyst", "Analytics Specialist"]],
  [/\b(llm|large language)\b/i, ["GenAI Engineer", "Generative AI Engineer", "AI Engineer"]],
  [/\b(gen ?ai|generative)\b/i, ["LLM Engineer", "AI Engineer", "Applied AI Engineer"]],
  [/\b(applied ai|ai engineer)\b/i, ["Machine Learning Engineer", "LLM Engineer", "Applied Scientist"]],
  [/\b(machine learning|ml)\b/i, ["ML Engineer", "MLOps Engineer", "Applied Scientist"]],
  [/\bdata scien/i, ["Machine Learning Scientist", "Applied Scientist", "Data Analyst"]],
  [/\bdata engineer/i, ["Analytics Engineer", "Big Data Engineer", "ETL Developer"]],
  [/\bpython\b/i, ["Python Engineer", "Backend Engineer", "Django Developer"]],
  [/\bback-?end\b/i, ["Backend Developer", "Software Engineer", "API Engineer"]],
  [/\bfront ?end|react\b/i, ["Frontend Developer", "React Developer", "UI Engineer"]],
  [/\bfull ?stack\b/i, ["Full Stack Engineer", "Software Engineer", "Web Developer"]],
  [/\b(devops|sre|platform|cloud)\b/i, ["DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer"]],
  [/\b(qa|test|quality)\b/i, ["QA Engineer", "Test Automation Engineer", "SDET"]],
  [/\bsecurity\b/i, ["Security Engineer", "Cybersecurity Analyst", "Application Security Engineer"]],
  [/\b(designer|ux|ui)\b/i, ["Product Designer", "UX Designer", "UI Designer"]],
  [/\bsoftware (engineer|developer)\b/i, ["Software Developer", "Backend Engineer", "Full Stack Engineer"]],
];

// The broad role family used when no exact title is required.
const ROLE_FAMILY: [RegExp, string][] = [
  [/\boperations?\b|\bops\b/i, "operations"],
  [/\b(sales|business development)\b/i, "sales"],
  [/\bmarketing\b/i, "marketing"],
  [/\b(finance|financial|accountant|accounting)\b/i, "finance"],
  [/\b(hr|human resources|talent|recruit)/i, "HR"],
  [/\bcustomer (success|support|service)\b/i, "customer success"],
  [/\b(project|program) manager\b/i, "project manager"],
  [/\bproduct manager\b/i, "product manager"],
  [/\b(data scien|machine learning|\bml\b|\bai\b|llm|gen ?ai)/i, "AI engineer"],
  [/\bdata (engineer|analyst)\b/i, "data"],
  [/\b(designer|ux|ui)\b/i, "designer"],
];

// Neighbouring skills, keyed by a skill or a word in a title.
const RELATED_SKILLS: [RegExp, string[]][] = [
  [/\boperations?\b|\bops\b/i, ["process improvement", "vendor management"]],
  [/\b(llm|gen ?ai|generative|large language)\b/i, ["RAG", "GenAI", "AI agents", "vector database", "enterprise AI"]],
  [/\brag\b|retrieval/i, ["vector search", "LLM"]],
  [/\b(langgraph|langchain|agent|agentic)\b/i, ["AI agents", "LangChain"]],
  [/\bpython\b/i, ["FastAPI", "Django"]],
  [/\b(machine learning|ml)\b/i, ["PyTorch", "MLOps"]],
  [/\bdata engineer|etl|spark\b/i, ["Databricks", "Airflow"]],
  [/\b(react|front ?end)\b/i, ["TypeScript", "Next.js"]],
];

// How people actually write the country in hiring posts.
const COUNTRY_SHORT: Record<string, string> = {
  AE: "UAE", SA: "Saudi", US: "USA", GB: "UK", KR: "Korea", NL: "Netherlands", HK: "Hong Kong",
};

// ---------------------------------------------------------------------------------
// Helpers

const clean = (s: string) => s.replace(/["()]/g, "").replace(/\s+/g, " ").trim();
const q = (s: string) => `"${clean(s)}"`;
/** Quote only multi-word terms; single words match as well without quotes. */
const term = (s: string) => (clean(s).includes(" ") ? q(s) : clean(s));
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
const uniq = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const expand = (table: [RegExp, string[]][], terms: string[]) =>
  terms.flatMap((t) => table.filter(([re]) => re.test(t)).flatMap(([, more]) => more));

/** Small stable hash for React keys, progress and feedback storage. */
export function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** "Senior Business Operations Specialist" → "Operations Specialist". */
export function coreTitle(title: string): string {
  const words = clean(title.replace(SENIORITY, " ")).split(" ").filter(Boolean);
  return (words.length >= 3 ? words.slice(-2) : words).join(" ") || clean(title);
}

export function roleFamily(title: string): string {
  return ROLE_FAMILY.find(([re]) => re.test(title))?.[1] ?? coreTitle(title);
}

export function alternativeTitles(title: string): string[] {
  const own = new Set([clean(title).toLowerCase(), coreTitle(title).toLowerCase()]);
  return uniq(expand(ROLE_ALTERNATIVES, [title])).filter((t) => !own.has(t.toLowerCase()));
}

export function placeNames(locations: LocationSelection[]): string[] {
  return uniq(locations.filter((l) => l.region !== "world").map((l) => placeLadder(l).focused).filter(Boolean) as string[]);
}

/** City → country → region → none, from the existing location taxonomy. */
export function placeLadder(sel: LocationSelection): { focused: string | null; balanced: string | null } {
  if (sel.region) {
    if (sel.region === "world") return { focused: null, balanced: null };
    const name = REGION_BY_ID[sel.region]?.name ?? null;
    return { focused: name, balanced: name };
  }
  const code = sel.country_code ?? "";
  const country = COUNTRY_SHORT[code] ?? COUNTRY_BY_CODE[code]?.name ?? null;
  const focused = sel.city || (sel.subdivision && subdivisionName(sel.subdivision)) || country;
  return { focused, balanced: country };
}

// ---------------------------------------------------------------------------------
// URLs

/** LinkedIn's own search uses %20 for spaces and quoted facet values. */
export function linkedinUrl(keywords: string, window: PostedWindow): string {
  const params: string[] = [`keywords=${encodeURIComponent(keywords)}`];
  if (window !== "any") params.push(`datePosted=${encodeURIComponent(`"${window}"`)}`);
  params.push(`sortBy=${encodeURIComponent('"date_posted"')}`);
  return `https://www.linkedin.com/search/results/content/?${params.join("&")}`;
}

export function googleUrl(query: string, window: PostedWindow): string {
  const params = new URLSearchParams({ q: query });
  const tbs = { "past-24h": "qdr:d", "past-week": "qdr:w", "past-month": "qdr:m", any: "" }[window];
  if (tbs) params.set("tbs", tbs);
  return `https://www.google.com/search?${params.toString()}`;
}

export function bingUrl(query: string, window: PostedWindow): string {
  // Bing freshness: ez1 = past 24 hours, ez2 = past week, ez3 = past month.
  const params = new URLSearchParams({ q: query });
  const range = { "past-24h": "ez1", "past-week": "ez2", "past-month": "ez3", any: "" }[window];
  if (range) params.set("filters", `ex1:"${range}"`);
  return `https://www.bing.com/search?${params.toString()}`;
}

// ---------------------------------------------------------------------------------
// Planner

const HIRING = `(hiring OR "we're hiring" OR "now hiring")`;
const CAPS: Record<Strategy, number> = { focused: 6, balanced: 10, broad: 5, discovery: 8 };
const WEB_CAP = 3;
const ORDER: Strategy[] = ["balanced", "focused", "discovery", "broad"]; // default priority

interface Draft {
  strategy: Strategy;
  category: ResearchCategory;
  subject: string;
  label: string;
  query: string;
}

/**
 * Plan a research session: a small, deduplicated set of searches in four
 * strategies, ordered Balanced first. Deterministic for the same input.
 */
export function buildResearchPlan(input: ResearchInput): ResearchQuery[] {
  const window = input.window ?? linkedinDateFilter(input.days);
  const roles = uniq(input.titles.map(clean)).slice(0, 3);
  const skills = uniq(input.skills.map(clean)).slice(0, 5);
  if (!roles.length && !skills.length) return [];

  const ladders = input.locations.map(placeLadder);
  const focusedPlaces = uniq(ladders.map((l) => l.focused).filter(Boolean) as string[]).slice(0, 3);
  const balancedPlaces = uniq(ladders.map((l) => l.balanced).filter(Boolean) as string[]).slice(0, 2);
  const at = (list: string[], i: number) => (list.length ? list[i % list.length] : null);

  const drafts: Draft[] = [];
  const add = (strategy: Strategy, category: ResearchCategory, subject: string, query: string, place: string | null) =>
    drafts.push({ strategy, category, subject, query, label: join(subject, place && `· ${place}`) });

  roles.forEach((role, i) => {
    const core = coreTitle(role);
    const family = roleFamily(role);
    const city = at(focusedPlaces, i);
    const country = at(balancedPlaces, i);

    // Focused: the exact title is the only required phrase; hiring words and
    // the city are plain keywords.
    add("focused", "direct", role, join(q(role), "hiring", city && term(city)), city);
    add("focused", "manager", role, join(q(role), `("my team" OR "join my team" OR "I'm hiring")`), null);
    if (focusedPlaces.length > 1) {
      const other = at(focusedPlaces, i + 1);
      add("focused", "recruiter", role, join(q(role), `(recruiting OR "my client")`, other && term(other)), other);
    }

    // Balanced: shorter title, hiring language as an OR group, country level.
    add("balanced", "direct", role, join(HIRING, q(core), country && term(country)), country);
    add("balanced", "recruiter", role, join(`(recruiter OR recruiting OR "my client")`, q(core), country && term(country)), country);
    add("balanced", "manager", role, join(`("my team" OR "join our team" OR "join my team")`, q(core)), null);
    add("balanced", "urgent", role, join(`(urgent OR urgently OR immediate)`, "hiring", q(core), country && term(country)), country);
    add("balanced", "referral", role, join(`(referral OR refer)`, "hiring", q(core)), null);
    add("balanced", "expansion", role, join(`("growing our team" OR "expanding our team" OR "new role")`, q(core)), null);

    // Broad: role family, several hiring signals, no location keyword.
    // Unquoted words must all appear, but not side by side or in order.
    add("broad", "direct", role, join(HIRING, core), null);
    add("broad", "direct", role, join(`(vacancy OR opening OR "open role" OR "open position")`, family), null);

    // Discovery: related titles, then indirect hiring language.
    alternativeTitles(role).slice(0, 2).forEach((alt, j) => {
      const place = j === 0 ? country : null;
      add("discovery", "alt_titles", role, join("hiring", q(alt), place && term(place)), place);
    });
    add("discovery", "indirect", role, join(`("join us" OR "we're building" OR "DM me")`, q(core)), null);
  });

  // Skills: user skills first, then a few neighbours; Discovery strategy.
  const skillTerms = uniq([...skills, ...expand(RELATED_SKILLS, [...roles, ...skills])]).slice(0, 4);
  skillTerms.forEach((skill, i) => {
    const country = at(balancedPlaces, i);
    add("discovery", "tech", skill, join(HIRING, term(skill), country && term(country)), country);
  });

  // Public web search for indexed LinkedIn posts (Broad).
  const web: Draft[] = [];
  (roles.length ? roles : skillTerms).slice(0, WEB_CAP).forEach((subject, i) => {
    const country = at(balancedPlaces, i);
    web.push({
      strategy: "broad",
      category: "web",
      subject,
      query: join("site:linkedin.com/posts", `(hiring OR "we're hiring")`, q(coreTitle(subject)), country && term(country)),
      label: join(coreTitle(subject), country && `· ${country}`, i % 2 ? "(Bing)" : "(Google)"),
    });
  });

  // Deduplicate, cap per strategy, then order: strategy priority, interleaving roles.
  const seen = new Set<string>();
  const counts: Record<Strategy, number> = { focused: 0, balanced: 0, broad: 0, discovery: 0 };
  const kept = drafts.filter((d) => {
    const key = d.query.toLowerCase();
    if (seen.has(key) || counts[d.strategy] >= CAPS[d.strategy]) return false;
    seen.add(key);
    counts[d.strategy]++;
    return true;
  });
  const ordered = ORDER.flatMap((strategy) => interleave(kept.filter((d) => d.strategy === strategy)));

  const make = (d: Draft, engine: ResearchQuery["engine"]): ResearchQuery => ({
    ...d,
    id: hash(`${engine}:${d.query.toLowerCase()}`),
    engine,
    url: engine === "linkedin" ? linkedinUrl(d.query, window) : engine === "google" ? googleUrl(d.query, window) : bingUrl(d.query, window),
  });
  return [
    ...ordered.map((d) => make(d, "linkedin")),
    ...web.map((d, i) => make(d, i % 2 ? "bing" : "google")),
  ];
}

/** Round-robin by subject so one role does not fill the top of the list. */
function interleave(items: Draft[]): Draft[] {
  const groups = new Map<string, Draft[]>();
  items.forEach((d) => groups.set(d.subject, [...(groups.get(d.subject) ?? []), d]));
  const lists = [...groups.values()];
  const out: Draft[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) lists.forEach((l) => l[i] && out.push(l[i]));
  return out;
}

// ---------------------------------------------------------------------------------
// Feedback-driven navigation and ordering

/**
 * Every wider (or narrower) LinkedIn search for the same role, nearest first:
 * the next strategy step before the one after it, same category first within a
 * step. The Research Companion receives these lists so it relaxes exactly as
 * the web app does.
 */
export function relaxationCandidates(plan: ResearchQuery[], from: ResearchQuery, direction: 1 | -1): ResearchQuery[] {
  const out: ResearchQuery[] = [];
  const step = LADDER.indexOf(from.strategy);
  for (let s = step + direction; s >= 0 && s < LADDER.length; s += direction) {
    const level = plan.filter((p) => p.strategy === LADDER[s] && p.engine === "linkedin" && p.subject === from.subject);
    out.push(...level.filter((p) => p.category === from.category), ...level.filter((p) => p.category !== from.category));
  }
  return out;
}

function sibling(plan: ResearchQuery[], from: ResearchQuery, direction: 1 | -1, feedback: Record<string, Feedback>) {
  return relaxationCandidates(plan, from, direction).find((p) => (feedback[p.id] ?? "unreviewed") === "unreviewed") ?? null;
}

/** The next wider search for the same role that has not been reviewed yet. */
export const broaderOf = (plan: ResearchQuery[], from: ResearchQuery, feedback: Record<string, Feedback> = {}) =>
  sibling(plan, from, 1, feedback);

/** The next narrower search for the same role that has not been reviewed yet. */
export const narrowerOf = (plan: ResearchQuery[], from: ResearchQuery, feedback: Record<string, Feedback> = {}) =>
  sibling(plan, from, -1, feedback);

/**
 * Reorder with the user's feedback: searches already reviewed go last, a role
 * whose searches came back empty gets its wider searches first, and categories
 * that produced relevant results move up. Stable otherwise.
 */
export function rankWithFeedback(plan: ResearchQuery[], feedback: Record<string, Feedback>): ResearchQuery[] {
  const empty = new Map<string, number>(); // subject → widest strategy step that came back empty
  const good = new Set<string>(); // categories with relevant results
  plan.forEach((p) => {
    const f = feedback[p.id];
    if (f === "none") empty.set(p.subject, Math.max(empty.get(p.subject) ?? -1, LADDER.indexOf(p.strategy)));
    if (f === "relevant") good.add(p.category);
  });
  const score = (p: ResearchQuery, index: number) => {
    const f = feedback[p.id] ?? "unreviewed";
    let s = index;
    if (f !== "unreviewed") s += 1000;
    const emptyStep = empty.get(p.subject);
    if (emptyStep !== undefined && f === "unreviewed") s += LADDER.indexOf(p.strategy) > emptyStep ? -500 : 200;
    if (good.has(p.category) && f === "unreviewed") s -= 100;
    return s;
  };
  return plan.map((p, i) => ({ p, s: score(p, i) })).sort((a, b) => a.s - b.s).map((x) => x.p);
}

/** Feedback is remembered per search configuration (roles, skills, places). */
export function configKey(input: Pick<ResearchInput, "titles" | "skills" | "locations">): string {
  const places = input.locations.map((l) => [l.region, l.country_code, l.subdivision, l.city].filter(Boolean).join(":")).sort();
  return hash(JSON.stringify([input.titles.map((t) => t.toLowerCase()).sort(), input.skills.map((s) => s.toLowerCase()).sort(), places]));
}
