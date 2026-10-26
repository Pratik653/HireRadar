import type { Opportunity, Tracked } from "./types";

/** Only http(s) URLs are ever rendered as links. */
export function safeHref(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** CSV cell with spreadsheet formula injection neutralised (OWASP guidance). */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(results: Opportunity[], tracking: Record<string, Tracked>): string {
  const header = [
    "score", "title", "company", "contact_name", "contact_position", "contact_source", "country", "city",
    "location_as_listed", "work_mode", "published_at", "date_confidence", "intent", "source", "post_url",
    "contact_profile_url", "matched_skills", "evidence", "application_status", "data",
  ];
  const rows = results.map((r) => [
    r.score, r.title, r.company, r.contact?.name, r.contact?.position, r.contact?.provenance, r.country, r.city,
    r.location_raw, r.work_mode, r.published_at, r.date_confidence, r.intent_label, r.source_label,
    safeHref(r.source_url), safeHref(r.contact?.profile_url), r.matched_skills.join("; "), r.snippet,
    tracking[r.id]?.status ?? "not_applied", r.is_demo ? "SYNTHETIC" : "live",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
