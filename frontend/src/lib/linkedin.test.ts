import { describe, expect, it } from "vitest";
import { CATEGORY_LABELS, buildResearchPlan, linkedinDateFilter, type ResearchQuery } from "./linkedin";

const typical = {
  titles: ["LLM Engineer", "Applied AI Engineer", "Python Developer"],
  skills: ["Python", "RAG", "LangGraph", "Agentic AI"],
  locations: [{ country_code: "AE", city: "Dubai" }, { country_code: "QA" }, { country_code: "IN", subdivision: "IN-KA", city: "Bengaluru" }],
  days: 7 as const,
};

const places = ["Dubai", "Qatar", "Bengaluru"];
const linkedin = (plan: ResearchQuery[]) => plan.filter((p) => p.engine === "linkedin");

describe("research plan", () => {
  const plan = buildResearchPlan(typical);

  it("produces 30–60 distinct searches", () => {
    expect(plan.length).toBeGreaterThanOrEqual(30);
    expect(plan.length).toBeLessThanOrEqual(60);
    expect(new Set(plan.map((p) => `${p.engine}:${p.query.toLowerCase()}`)).size).toBe(plan.length);
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
  });

  it("covers every category, and the first screen is already diverse", () => {
    expect(new Set(plan.map((p) => p.category))).toEqual(new Set(Object.keys(CATEGORY_LABELS)));
    expect(new Set(plan.slice(0, 12).map((p) => p.category)).size).toBeGreaterThanOrEqual(10);
  });

  it("uses semantic variations of roles and skills", () => {
    const text = plan.map((p) => p.query).join(" ");
    for (const term of ["GenAI Engineer", "Machine Learning Engineer", "RAG", "GenAI", "AI agents", "vector database", "enterprise AI", "Python"]) {
      expect(text).toContain(term);
    }
  });

  it("names at most one place per query and uses every selected place", () => {
    for (const item of plan) {
      expect(places.filter((p) => item.query.includes(`"${p}"`)).length).toBeLessThanOrEqual(1);
    }
    for (const p of places) expect(plan.some((item) => item.query.includes(`"${p}"`))).toBe(true);
  });

  it("builds LinkedIn URLs with only the supported content-search parameters", () => {
    for (const item of linkedin(plan)) {
      const url = new URL(item.url);
      expect(url.origin + url.pathname).toBe("https://www.linkedin.com/search/results/content/");
      expect([...url.searchParams.keys()].sort()).toEqual(["datePosted", "keywords", "sortBy"]);
      expect(url.searchParams.get("keywords")).toBe(item.query);
      expect(url.searchParams.get("datePosted")).toBe('"past-week"');
      expect(url.searchParams.get("sortBy")).toBe('"date_posted"');
      // Documented syntax only: balanced quotes, at most one OR group, no wildcards or +/-.
      expect((item.query.match(/"/g) ?? []).length % 2).toBe(0);
      expect((item.query.match(/\(/g) ?? []).length).toBeLessThanOrEqual(1);
      expect(item.query).not.toMatch(/[*{}[\]<>]|(^|\s)[+-]\w/);
      expect((item.query.match(/"[^"]+"/g) ?? []).length).toBeLessThanOrEqual(4); // stays broad enough to match
    }
  });

  it("builds web-search alternatives for indexed LinkedIn posts", () => {
    const web = plan.filter((p) => p.category === "web");
    expect(web.length).toBeGreaterThanOrEqual(4);
    for (const item of web) {
      const url = new URL(item.url);
      expect(item.query.startsWith("site:linkedin.com/posts ")).toBe(true);
      if (item.engine === "google") {
        expect(url.origin + url.pathname).toBe("https://www.google.com/search");
        expect(url.searchParams.get("q")).toBe(item.query);
        expect(url.searchParams.get("tbs")).toBe("qdr:w");
      } else {
        expect(url.origin + url.pathname).toBe("https://www.bing.com/search");
        expect(url.searchParams.get("filters")).toBe('ex1:"ez2"');
      }
    }
    expect(web.some((w) => w.engine === "bing")).toBe(true);
  });

  it("is deterministic", () => {
    expect(buildResearchPlan(typical)).toEqual(plan);
  });
});

describe("research plan edge cases", () => {
  it("needs a role or a skill", () => {
    expect(buildResearchPlan({ titles: [], skills: [], locations: [], days: 7 })).toEqual([]);
  });

  it("stays useful without locations, without padding", () => {
    const plan = buildResearchPlan({ titles: ["Data Engineer"], skills: [], locations: [], days: 30 });
    expect(plan.length).toBeGreaterThanOrEqual(25);
    expect(plan.length).toBeLessThanOrEqual(60);
    expect(linkedin(plan).every((p) => new URL(p.url).searchParams.get("datePosted") === '"past-month"')).toBe(true);
  });

  it("works from skills alone", () => {
    const plan = buildResearchPlan({ titles: [], skills: ["Kubernetes", "Terraform"], locations: [], days: 1 });
    expect(plan.length).toBeGreaterThan(10);
    expect(plan.every((p) => !p.query.includes('""'))).toBe(true);
  });

  it("adds no place terms for a worldwide search", () => {
    const plan = buildResearchPlan({ ...typical, locations: [{ region: "world" }] });
    expect(plan.some((p) => /Worldwide/.test(p.query))).toBe(false);
  });

  it("uses region, state and city names as places", () => {
    const plan = buildResearchPlan({ ...typical, locations: [{ region: "europe" }, { country_code: "IN", subdivision: "IN-KA" }] });
    expect(plan.some((p) => p.query.includes('"Europe"'))).toBe(true);
    expect(plan.some((p) => p.query.includes('"Karnataka"'))).toBe(true);
  });

  it("strips quotes and parentheses typed by the user", () => {
    const plan = buildResearchPlan({ titles: ['Senior "ML" (Ops) Engineer'], skills: [], locations: [], days: 7 });
    for (const p of linkedin(plan)) expect((p.query.match(/"/g) ?? []).length % 2).toBe(0);
  });

  it("rounds windows to LinkedIn's buckets", () => {
    expect([1, 3, 7, 14, 30].map((d) => linkedinDateFilter(d as 1))).toEqual([
      "past-24h", "past-week", "past-week", "past-month", "past-month",
    ]);
  });
});
