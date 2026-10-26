import { AlertTriangle, ChevronDown, Download, ExternalLink as LinkIcon, FileSpreadsheet, Info, SearchX } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { INTENT_LABELS } from "../lib/catalog";
import { safeHref } from "../lib/safe";
import type { ApplicationStatus, Intent, Opportunity, SearchResponse, Tracked } from "../lib/types";
import { Badge, ExternalLink } from "./ui";

const INTENT_TONE: Record<Intent, string> = {
  explicit_vacancy: "green",
  hiring_manager: "indigo",
  recruiter: "violet",
  general_recruitment: "blue",
  weak_signal: "amber",
  unrelated: "slate",
};
const STATUSES: ApplicationStatus[] = ["not_applied", "saved", "applied", "contacted", "interviewing", "offer", "rejected"];

function age(iso?: string | null): string {
  if (!iso) return "date unknown";
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "just now";
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function scoreTone(score: number): string {
  if (score >= 75) return "bg-emerald-600";
  if (score >= 55) return "bg-indigo-600";
  if (score >= 40) return "bg-amber-500";
  return "bg-slate-400";
}

function Bar({ label, value, weight }: { label: string; value: number; weight: number }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-xs">
      <span className="text-slate-600">
        {label} <span className="text-slate-400">×{weight}</span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="text-right tabular-nums text-slate-700">{Math.round(value * 100)}%</span>
    </div>
  );
}

function Details({ opp, weights }: { opp: Opportunity; weights: Record<string, number> }) {
  const post = safeHref(opp.source_url);
  const profile = safeHref(opp.contact?.profile_url);
  return (
    <div className="grid gap-4 bg-slate-50 p-4 md:grid-cols-2">
      <div className="space-y-3">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</h4>
          <p className="text-sm leading-relaxed text-slate-700">{opp.snippet || "No text available."}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {post && (
            <ExternalLink href={post} className="inline-flex items-center gap-1 text-indigo-700 hover:underline">
              Original post <LinkIcon size={13} />
            </ExternalLink>
          )}
          {profile && (
            <ExternalLink href={profile} className="inline-flex items-center gap-1 text-indigo-700 hover:underline">
              Contact profile <LinkIcon size={13} />
            </ExternalLink>
          )}
        </div>
        {opp.duplicates.length > 0 && (
          <p className="text-xs text-slate-500">
            Merged {opp.duplicates.length} duplicate{opp.duplicates.length > 1 ? "s" : ""}: {opp.duplicates.join(" · ")}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Score {opp.score}</h4>
          <Bar label="Role & skills" value={opp.breakdown.role} weight={weights.role} />
          <Bar label="Hiring intent" value={opp.breakdown.intent} weight={weights.intent} />
          <Bar label="Geography" value={opp.breakdown.geography} weight={weights.geography} />
          <Bar label="Recency" value={opp.breakdown.recency} weight={weights.recency} />
        </div>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {opp.explanations.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface Props {
  response: SearchResponse;
  tracking: Record<string, Tracked>;
  setStatus: (id: string, status: ApplicationStatus) => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
  exporting: boolean;
  exportError?: string | null;
  canExportXlsx: boolean;
  snapshot: boolean;
}

export function Results({ response, tracking, setStatus, onExportXlsx, onExportCsv, exporting, exportError, canExportXlsx, snapshot }: Props) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [intent, setIntent] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<"score" | "recent">("score");
  const [open, setOpen] = useState<string | null>(null);

  const options = useMemo(() => {
    const locs = new Set<string>();
    const sources = new Set<string>();
    const intents = new Set<string>();
    response.results.forEach((r) => {
      locs.add(r.city ?? r.country ?? (r.work_mode === "remote" ? "Remote" : "Unspecified"));
      sources.add(r.source_label);
      intents.add(r.intent);
    });
    return { locs: [...locs].sort(), sources: [...sources].sort(), intents: [...intents] };
  }, [response]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = response.results.filter((r) => {
      const loc = r.city ?? r.country ?? (r.work_mode === "remote" ? "Remote" : "Unspecified");
      if (location && loc !== location) return false;
      if (intent && r.intent !== intent) return false;
      if (source && r.source_label !== source) return false;
      if (q && ![r.title, r.company, r.snippet, r.contact?.name, r.location_raw].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
    if (sort === "recent") {
      return [...filtered].sort((a, b) => (b.published_at ? Date.parse(b.published_at) : 0) - (a.published_at ? Date.parse(a.published_at) : 0));
    }
    return filtered;
  }, [response, query, location, intent, source, sort]);

  const s = response.summary;
  const removed = [
    [s.removed_duplicates, "duplicates"],
    [s.removed_unrelated, "not hiring"],
    [s.removed_by_location, "outside location/work mode"],
    [s.removed_by_date, "outside date window"],
    [s.removed_low_relevance, "unrelated roles"],
    [s.removed_by_exclusion, "excluded keywords"],
    [s.removed_below_min_score, "below min score"],
  ].filter(([n]) => (n as number) > 0);

  const select = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      {response.mode === "demo" && (
        <div className="flex items-start gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            <strong>DEMO MODE — synthetic examples.</strong> Companies, people and links are fictional and point to
            example.org. Switch to Live mode to search real sources.
            {snapshot && " This is a pre-computed snapshot because the backend is not connected; filters below still work."}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {response.sources.map((src) => (
          <Badge
            key={src.source}
            tone={src.status === "ok" ? "green" : src.status === "error" ? "red" : "slate"}
            title={src.message ?? undefined}
          >
            {src.label}: {src.status === "ok" ? `${src.fetched} fetched` : src.status}
            {!src.live && " · synthetic"}
          </Badge>
        ))}
      </div>
      {response.sources.filter((src) => src.status === "error" || src.message).map((src) => (
        <p key={src.source} className={`text-xs ${src.status === "error" ? "text-rose-700" : "text-slate-500"}`}>
          {src.label}: {src.message}
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search within results"
          aria-label="Search within results"
          className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-auto sm:min-w-[12rem] sm:flex-1"
        />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <select aria-label="Filter by location" value={location} onChange={(e) => setLocation(e.target.value)} className={select}>
            <option value="">All locations</option>
            {options.locs.map((l) => <option key={l}>{l}</option>)}
          </select>
          <select aria-label="Filter by intent" value={intent} onChange={(e) => setIntent(e.target.value)} className={select}>
            <option value="">All intents</option>
            {options.intents.map((i) => <option key={i} value={i}>{INTENT_LABELS[i]}</option>)}
          </select>
          <select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)} className={select}>
            <option value="">All sources</option>
            {options.sources.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "score" | "recent")} className={select}>
            <option value="score">Most relevant</option>
            <option value="recent">Most recent</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportXlsx}
            disabled={!canExportXlsx || exporting || !response.results.length}
            title={canExportXlsx ? "Excel report with three sheets" : "Excel export needs the backend"}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <FileSpreadsheet size={15} /> {exporting ? "Preparing…" : "Excel"}
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={!response.results.length}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={15} /> CSV
          </button>
        </div>
      </div>
      {exportError && <p className="text-sm text-rose-700">{exportError}</p>}

      <p className="text-sm text-slate-600">
        <strong className="text-slate-900">{rows.length}</strong> of {s.returned} opportunities shown · {s.fetched} items
        scanned{removed.length > 0 && " · removed: "}
        {removed.map(([n, label]) => `${n} ${label}`).join(", ")}
        {s.undated > 0 && ` · ${s.undated} without a trustworthy date`}
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <SearchX className="text-slate-400" size={32} />
          <p className="font-medium text-slate-700">No opportunities match.</p>
          <p className="max-w-md text-sm text-slate-500">
            Try a wider publication window, more locations or skills, fewer exclusions — or clear the result filters above.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="hidden bg-slate-50 text-xs uppercase tracking-wide text-slate-500 md:table-header-group">
              <tr>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Opportunity</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Where · When</th>
                <th className="px-3 py-2 font-medium">Intent · Source</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const isOpen = open === r.id;
                const post = safeHref(r.source_url);
                return (
                  <Fragment key={r.id}>
                    <tr className="flex flex-col gap-1 px-3 py-3 align-top md:table-row md:px-0 md:py-0">
                      <td className="md:px-3 md:py-3">
                        <span className={`inline-flex h-9 w-11 items-center justify-center rounded-md text-sm font-semibold tabular-nums text-white ${scoreTone(r.score)}`}>
                          {Math.round(r.score)}
                        </span>
                      </td>
                      <td className="md:max-w-xs md:px-3 md:py-3">
                        <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="text-left font-medium text-slate-900 hover:text-indigo-700" aria-expanded={isOpen}>
                          {r.title}
                          <ChevronDown size={14} className={`ml-1 inline transition ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                        <p className="text-slate-600">{r.company ?? "Company not stated"}</p>
                        {r.matched_skills.length > 0 && (
                          <p className="mt-0.5 text-xs text-slate-500">{r.matched_skills.join(" · ")}</p>
                        )}
                      </td>
                      <td className="text-sm md:px-3 md:py-3">
                        {r.contact?.name ? (
                          <>
                            <p className="text-slate-800">{r.contact.name}</p>
                            <p className="text-xs text-slate-500">{r.contact.position}</p>
                            <Badge tone={r.contact.provenance === "synthetic" ? "amber" : "slate"}>
                              {r.contact.provenance === "synthetic" ? "synthetic" : "user-provided"}
                            </Badge>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">No verified contact</span>
                        )}
                      </td>
                      <td className="text-sm md:px-3 md:py-3">
                        <p className="text-slate-800">{[r.city, r.country].filter(Boolean).join(", ") || r.location_raw || "Location not stated"}</p>
                        <p className="text-xs text-slate-500">
                          {r.work_mode && `${r.work_mode} · `}
                          <span title={r.published_at ?? undefined}>{age(r.published_at)}</span>
                          {r.date_confidence === "reported" && " (reported)"}
                        </p>
                      </td>
                      <td className="space-y-1 md:px-3 md:py-3">
                        <Badge tone={INTENT_TONE[r.intent]} title={r.intent_label}>
                          {r.intent === "weak_signal" && <Info size={11} />}
                          {INTENT_LABELS[r.intent]}
                        </Badge>
                        <p className="text-xs text-slate-500">
                          {post ? (
                            <ExternalLink href={post} className="inline-flex items-center gap-0.5 text-indigo-700 hover:underline">
                              {r.source_label} <LinkIcon size={11} />
                            </ExternalLink>
                          ) : (
                            r.source_label
                          )}
                        </p>
                      </td>
                      <td className="md:px-3 md:py-3">
                        <select
                          aria-label={`Application status for ${r.title}`}
                          value={tracking[r.id]?.status ?? "not_applied"}
                          onChange={(e) => setStatus(r.id, e.target.value as ApplicationStatus)}
                          className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
                        >
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>{st.replace("_", " ")}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="block md:table-row">
                        <td colSpan={6} className="block md:table-cell">
                          <Details opp={r} weights={response.weights} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {response.notes.length > 0 && (
        <ul className="space-y-1 text-xs text-slate-500">
          {response.notes.map((n) => <li key={n}>• {n}</li>)}
        </ul>
      )}
    </div>
  );
}
