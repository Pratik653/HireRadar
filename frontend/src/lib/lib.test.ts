import { describe, expect, it } from "vitest";
import { normaliseImport } from "../components/ImportPanel";
import { classifyHttpFailure } from "./api";
import { buildResearchLinks, linkedinDateFilter } from "./linkedin";
import { csvCell, safeHref } from "./safe";

describe("research links", () => {
  it("maps windows to LinkedIn's date buckets", () => {
    expect(linkedinDateFilter(1)).toBe("past-24h");
    expect(linkedinDateFilter(3)).toBe("past-week");
    expect(linkedinDateFilter(14)).toBe("past-month");
  });

  it("builds encoded LinkedIn content-search URLs", () => {
    const links = buildResearchLinks(["LLM Engineer"], [{ country_code: "AE", city: "Dubai" }, { country_code: "QA" }], 7);
    const url = new URL(links[0].url);
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/search/results/content/");
    expect(url.searchParams.get("keywords")).toBe('hiring "LLM Engineer" ("Dubai" OR "Qatar")');
    expect(url.searchParams.get("datePosted")).toBe('"past-week"');
    expect(links.at(-1)?.kind).toBe("web");
  });

  it("needs a title", () => {
    expect(buildResearchLinks([], [], 7)).toEqual([]);
  });
});

describe("safety helpers", () => {
  it("only allows http(s) links", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });

  it("neutralises spreadsheet formulas in CSV", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe("");
  });
});

describe("imports", () => {
  it("validates and normalises rows", () => {
    const ok = normaliseImport({ text: "We are hiring a Python developer in Dubai", url: "https://www.linkedin.com/posts/x", published_at: "2026-10-01" });
    expect(typeof ok).toBe("object");
    expect(normaliseImport({ text: "short" })).toMatch(/at least 20/);
    expect(normaliseImport({ text: "We are hiring a Python developer in Dubai", url: "javascript:x" })).toMatch(/http/);
    expect(normaliseImport({ text: "We are hiring a Python developer in Dubai", published_at: "yesterday-ish" })).toMatch(/date/);
  });
});

describe("backend error classification", () => {
  it("treats proxy errors as wake-up, others as API errors", () => {
    expect(classifyHttpFailure(503)).toBe("unreachable");
    expect(classifyHttpFailure(502)).toBe("unreachable");
    expect(classifyHttpFailure(422)).toBe("api");
    expect(classifyHttpFailure(500)).toBe("api");
    expect(classifyHttpFailure(429)).toBe("api");
  });
});
