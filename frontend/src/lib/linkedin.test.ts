import { describe, expect, it } from "vitest";
import {
  LADDER,
  alternativeTitles,
  bingUrl,
  broaderOf,
  buildResearchPlan,
  configKey,
  coreTitle,
  googleUrl,
  linkedinDateFilter,
  linkedinUrl,
  narrowerOf,
  placeLadder,
  rankWithFeedback,
  roleFamily,
  widerWindow,
  type Feedback,
  type ResearchQuery,
} from "./linkedin";

const ops = {
  titles: ["Business Operations Specialist"],
  skills: [],
  locations: [{ country_code: "AE", city: "Sharjah" }, { country_code: "AE", city: "Dubai" }, { country_code: "AE" }],
  days: 7 as const,
};
const ai = {
  titles: ["Applied AI Engineer", "LLM Engineer", "Python Developer"],
  skills: ["Python", "RAG", "LangGraph"],
  locations: [{ country_code: "AE", city: "Dubai" }, { country_code: "QA" }],
  days: 7 as const,
};

const phrases = (query: string) => query.match(/"[^"]+"/g) ?? [];
const outsideGroups = (query: string) => query.replace(/\([^)]*\)/g, "");
const linkedin = (plan: ResearchQuery[]) => plan.filter((p) => p.engine === "linkedin");

describe("role variations", () => {
  it("shortens titles and drops seniority", () => {
    expect(coreTitle("Business Operations Specialist")).toBe("Operations Specialist");
    expect(coreTitle("Senior Python Developer")).toBe("Python Developer");
    expect(coreTitle("Applied AI Engineer")).toBe("AI Engineer");
    expect(coreTitle("Accountant")).toBe("Accountant");
  });

  it("knows role families and related titles beyond tech", () => {
    expect(roleFamily("Business Operations Specialist")).toBe("operations");
    expect(roleFamily("Senior Accountant")).toBe("finance");
    expect(alternativeTitles("Business Operations Specialist")).toContain("Operations Coordinator");
    expect(alternativeTitles("LLM Engineer")).toContain("GenAI Engineer");
  });
});

describe("geographic fallback", () => {
  it("relaxes city → country → none", () => {
    expect(placeLadder({ country_code: "AE", city: "Sharjah" })).toEqual({ focused: "Sharjah", balanced: "UAE" });
    expect(placeLadder({ country_code: "IN", subdivision: "IN-KA" })).toEqual({ focused: "Karnataka", balanced: "India" });
    expect(placeLadder({ region: "gcc" })).toEqual({ focused: "GCC", balanced: "GCC" });
    expect(placeLadder({ region: "world" })).toEqual({ focused: null, balanced: null });
  });

  it("uses the city only in Focused, the country in Balanced, nothing in Broad", () => {
    const plan = linkedin(buildResearchPlan(ops));
    const by = (s: string) => plan.filter((p) => p.strategy === s);
    expect(by("focused").some((p) => /Sharjah|Dubai/.test(p.query))).toBe(true);
    expect(by("balanced").some((p) => /Sharjah|Dubai/.test(p.query))).toBe(false);
    expect(by("balanced").some((p) => /\bUAE\b/.test(p.query))).toBe(true);
    expect(by("broad").some((p) => /Sharjah|Dubai|UAE/.test(p.query))).toBe(false);
  });

  it("does not repeat a country for cities in the same country", () => {
    const plan = linkedin(buildResearchPlan(ops)).filter((p) => p.strategy === "balanced" && p.category === "direct");
    expect(plan).toHaveLength(1);
  });
});

describe("query relaxation", () => {
  const plans = [buildResearchPlan(ops), buildResearchPlan(ai)];

  it("never requires an exact hiring phrase, exact title and exact place at once", () => {
    for (const p of plans.flatMap(linkedin)) {
      const required = phrases(outsideGroups(p.query));
      expect(required.length).toBeLessThanOrEqual(1);
    }
  });

  it("puts Balanced first and covers all four strategies", () => {
    for (const plan of plans) {
      expect(plan[0].strategy).toBe("balanced");
      expect(new Set(plan.map((p) => p.strategy))).toEqual(new Set(LADDER));
    }
  });

  it("stays small: no more than the per-strategy caps", () => {
    expect(buildResearchPlan(ops).length).toBeLessThanOrEqual(20);
    expect(buildResearchPlan(ai).length).toBeLessThanOrEqual(32);
    expect(buildResearchPlan(ops).length).toBeGreaterThanOrEqual(10);
  });

  it("deduplicates and is deterministic", () => {
    for (const plan of plans) {
      expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
      expect(new Set(plan.map((p) => `${p.engine}:${p.query.toLowerCase()}`)).size).toBe(plan.length);
    }
    expect(buildResearchPlan(ai)).toEqual(buildResearchPlan(ai));
  });

  it("keeps the role in every LinkedIn query", () => {
    for (const p of linkedin(buildResearchPlan(ops))) {
      expect(p.query).toMatch(/operations|process improvement|vendor management/i);
    }
  });
});

describe("Boolean syntax", () => {
  it("uses only documented operators", () => {
    for (const p of [ops, ai].flatMap((i) => buildResearchPlan(i))) {
      expect((p.query.match(/"/g) ?? []).length % 2).toBe(0);
      expect((p.query.match(/\(/g) ?? []).length).toBeLessThanOrEqual(1);
      expect((p.query.match(/\(/g) ?? []).length).toBe((p.query.match(/\)/g) ?? []).length);
      expect(p.query).not.toMatch(/\b(or|and|not)\b(?=\s)/); // operators are upper case
      expect(p.query).not.toMatch(/[*{}[\]<>]|(^|\s)[+-]\w/);
    }
  });

  it("strips quotes and parentheses typed by the user", () => {
    const plan = buildResearchPlan({ titles: ['Senior "Ops" (EMEA) Lead'], skills: [], locations: [], days: 7 });
    for (const p of plan) expect((p.query.match(/"/g) ?? []).length % 2).toBe(0);
  });
});

describe("URLs and date filters", () => {
  it("encodes LinkedIn URLs like LinkedIn does", () => {
    const url = linkedinUrl(`(hiring OR "we're hiring") "Operations Specialist" UAE`, "past-month");
    expect(url).toContain("keywords=(hiring%20OR%20%22we're%20hiring%22)%20%22Operations%20Specialist%22%20UAE");
    expect(url).toContain("datePosted=%22past-month%22");
    expect(url).toContain("sortBy=%22date_posted%22");
    expect(url).not.toContain("+");
    expect(new URL(url).searchParams.get("keywords")).toBe(`(hiring OR "we're hiring") "Operations Specialist" UAE`);
  });

  it("drops the date filter for Any time", () => {
    expect(new URL(linkedinUrl("hiring", "any")).searchParams.has("datePosted")).toBe(false);
    expect(new URL(googleUrl("x", "any")).searchParams.has("tbs")).toBe(false);
    expect(new URL(bingUrl("x", "any")).searchParams.has("filters")).toBe(false);
    expect(new URL(googleUrl("x", "past-week")).searchParams.get("tbs")).toBe("qdr:w");
    expect(new URL(bingUrl("x", "past-month")).searchParams.get("filters")).toBe('ex1:"ez3"');
  });

  it("widens one step at a time", () => {
    expect([1, 3, 7, 14, 30].map((d) => linkedinDateFilter(d as 1))).toEqual(["past-24h", "past-week", "past-week", "past-month", "past-month"]);
    expect(widerWindow("past-week")).toBe("past-month");
    expect(widerWindow("past-month")).toBe("any");
    expect(widerWindow("any")).toBeNull();
  });

  it("applies the chosen window to every search", () => {
    const plan = buildResearchPlan({ ...ops, window: "any" });
    expect(linkedin(plan).every((p) => !new URL(p.url).searchParams.has("datePosted"))).toBe(true);
  });
});

describe("feedback", () => {
  const plan = buildResearchPlan(ops);
  const focused = plan.find((p) => p.strategy === "focused" && p.category === "direct")!;
  const balanced = plan.find((p) => p.strategy === "balanced" && p.category === "direct")!;

  it("offers the next broader and the next more focused search", () => {
    expect(broaderOf(plan, focused)?.id).toBe(balanced.id);
    expect(narrowerOf(plan, balanced)?.id).toBe(focused.id);
    const fb: Record<string, Feedback> = { [balanced.id]: "none" };
    expect(broaderOf(plan, focused, fb)?.strategy).toBe("balanced"); // skips the reviewed one…
    expect(broaderOf(plan, focused, fb)?.id).not.toBe(balanced.id); // …for another Balanced search
  });

  it("reorders: reviewed last, wider searches first after empty results", () => {
    const fb: Record<string, Feedback> = { [balanced.id]: "none" };
    const ranked = rankWithFeedback(plan, fb);
    expect(ranked.at(-1)!.id).toBe(balanced.id);
    expect(["broad", "discovery"]).toContain(ranked[0].strategy);
    expect(rankWithFeedback(plan, {})).toEqual(plan);
  });

  it("keys stored feedback by search configuration", () => {
    expect(configKey(ops)).toBe(configKey({ ...ops, titles: ["business operations specialist"] }));
    expect(configKey(ops)).not.toBe(configKey({ ...ops, locations: [{ country_code: "QA" }] }));
  });
});
