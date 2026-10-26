import { COUNTRY_BY_CODE } from "./catalog";
import type { Days, LocationSelection } from "./types";

// LinkedIn's content search only offers these date buckets.
export function linkedinDateFilter(days: Days): "past-24h" | "past-week" | "past-month" {
  if (days <= 1) return "past-24h";
  if (days <= 7) return "past-week";
  return "past-month";
}

function quoted(term: string): string {
  return `"${term.replace(/"/g, "").trim()}"`;
}

function placeNames(locations: LocationSelection[]): string[] {
  const names = locations.map((l) => l.city || COUNTRY_BY_CODE[l.country_code]?.name).filter(Boolean) as string[];
  return [...new Set(names)];
}

export interface ResearchLink {
  label: string;
  query: string;
  url: string;
  kind: "linkedin" | "web";
}

/**
 * Builds search links the user opens in their own browser. Nothing here calls
 * LinkedIn: we only compose URLs for the standard search pages.
 */
export function buildResearchLinks(titles: string[], locations: LocationSelection[], days: Days): ResearchLink[] {
  const places = placeNames(locations).slice(0, 4);
  const roles = titles.slice(0, 4);
  if (!roles.length) return [];
  const links: ResearchLink[] = [];
  const datePosted = linkedinDateFilter(days);

  for (const role of roles) {
    const where = places.length ? ` (${places.map(quoted).join(" OR ")})` : "";
    const query = `hiring ${quoted(role)}${where}`;
    const params = new URLSearchParams({
      keywords: query,
      datePosted: `"${datePosted}"`,
      sortBy: '"date_posted"',
    });
    links.push({
      label: `${role}${places.length ? ` · ${places.join(", ")}` : ""}`,
      query,
      url: `https://www.linkedin.com/search/results/content/?${params.toString()}`,
      kind: "linkedin",
    });
  }

  const roleClause = roles.map(quoted).join(" OR ");
  const placeClause = places.length ? ` (${places.map(quoted).join(" OR ")})` : "";
  const webQuery = `site:linkedin.com/posts ("hiring" OR "we're hiring") (${roleClause})${placeClause}`;
  const tbs = days <= 1 ? "qdr:d" : days <= 7 ? "qdr:w" : "qdr:m";
  links.push({
    label: "Web search for public LinkedIn posts",
    query: webQuery,
    url: `https://www.google.com/search?${new URLSearchParams({ q: webQuery, tbs }).toString()}`,
    kind: "web",
  });
  return links;
}
