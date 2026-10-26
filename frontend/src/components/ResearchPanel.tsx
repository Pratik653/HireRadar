import { Check, Copy, ExternalLink as LinkIcon, RotateCcw, Search, ShieldCheck, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABELS, buildResearchPlan, linkedinDateFilter, type ResearchCategory, type ResearchQuery } from "../lib/linkedin";
import type { Days, LocationSelection } from "../lib/types";
import { ExternalLink } from "./ui";

interface Props {
  titles: string[];
  skills: string[];
  locations: LocationSelection[];
  days: Days;
  onImport: () => void;
}

const PAGE = 12;
const OPENED_KEY = "hireradar:research-opened";
const WINDOW_LABEL = { "past-24h": "past 24 hours", "past-week": "past week", "past-month": "past month" } as const;
const ENGINE_LABEL = { linkedin: "Open on LinkedIn", google: "Open on Google", bing: "Open on Bing" } as const;
const ENGINE_STYLE = {
  linkedin: "bg-[#0a66c2] hover:bg-[#084e96]",
  google: "bg-slate-700 hover:bg-slate-800",
  bing: "bg-slate-700 hover:bg-slate-800",
} as const;

function readOpened(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(OPENED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function ResearchPanel({ titles, skills, locations, days, onImport }: Props) {
  const plan = useMemo(() => buildResearchPlan({ titles, skills, locations, days }), [titles, skills, locations, days]);
  const [category, setCategory] = useState<ResearchCategory | "all">("all");
  const [filter, setFilter] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [opened, setOpened] = useState<Set<string>>(readOpened);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(OPENED_KEY, JSON.stringify([...opened]));
    } catch {
      /* storage unavailable: progress lasts for this view only */
    }
  }, [opened]);
  useEffect(() => setVisible(PAGE), [category, filter, plan]);

  const counts = useMemo(() => {
    const out: Partial<Record<ResearchCategory, number>> = {};
    plan.forEach((p) => (out[p.category] = (out[p.category] ?? 0) + 1));
    return out;
  }, [plan]);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return plan.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (!needle || p.query.toLowerCase().includes(needle) || p.label.toLowerCase().includes(needle)),
    );
  }, [plan, category, filter]);

  const markOpened = (item: ResearchQuery) => setOpened((prev) => new Set(prev).add(item.id));
  const next = rows.find((r) => !opened.has(r.id));
  const openedHere = rows.filter((r) => opened.has(r.id)).length;
  const linkedinCount = plan.filter((p) => p.engine === "linkedin").length;

  const openNext = () => {
    if (!next) return;
    // One tab per click, always started by the user.
    window.open(next.url, "_blank", "noopener,noreferrer");
    markOpened(next);
  };

  const copy = async (item: ResearchQuery) => {
    try {
      await navigator.clipboard.writeText(item.query);
      setCopied(item.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const chip = (key: ResearchCategory | "all", name: string, count: number) => (
    <button
      key={key}
      type="button"
      aria-pressed={category === key}
      onClick={() => setCategory(key)}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition ${
        category === key ? "border-indigo-600 bg-indigo-600 font-medium text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"
      }`}
    >
      {name} <span className={category === key ? "text-indigo-100" : "text-slate-400"}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <div className="space-y-1">
          <p>
            <strong>LinkedIn research mode.</strong> These are <em>search suggestions</em>, not discovered vacancies: none
            of them has been run. Each link opens LinkedIn's own search (or a web search) in your browser, under your
            account. HireRadar does not log in to LinkedIn, scrape it or store LinkedIn credentials.
          </p>
          <p>
            When you find a relevant post, copy its text and link into{" "}
            <button type="button" onClick={onImport} className="font-medium underline">
              Import posts
            </button>{" "}
            to score, deduplicate and export it with everything else.
          </p>
        </div>
      </div>

      {plan.length === 0 ? (
        <p className="text-sm text-slate-500">Add at least one job title or skill to generate searches.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{plan.length}</strong> research searches ·{" "}
              {linkedinCount} LinkedIn · {plan.length - linkedinCount} web · LinkedIn window:{" "}
              {WINDOW_LABEL[linkedinDateFilter(days)]}
            </p>
            <div className="flex items-center gap-2">
              {opened.size > 0 && (
                <button
                  type="button"
                  onClick={() => setOpened(new Set())}
                  title="Forget which searches were opened"
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <RotateCcw size={13} /> Reset progress
                </button>
              )}
              <button
                type="button"
                onClick={openNext}
                disabled={!next}
                title={next ? `Opens: ${next.query}` : "Every search in this view has been opened"}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-700 px-3 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
              >
                <SkipForward size={14} /> Open next search
                <span className="text-indigo-200">
                  {openedHere}/{rows.length}
                </span>
              </button>
            </div>
          </div>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Search categories">
            {chip("all", "All", plan.length)}
            {(Object.keys(CATEGORY_LABELS) as ResearchCategory[])
              .filter((c) => counts[c])
              .map((c) => chip(c, CATEGORY_LABELS[c], counts[c] ?? 0))}
          </div>

          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter generated searches, e.g. Dubai or recruiter"
              aria-label="Filter generated searches"
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No searches match this filter.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Generated searches">
              {rows.slice(0, visible).map((item) => {
                const done = opened.has(item.id);
                return (
                  <li key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-slate-800">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">{CATEGORY_LABELS[item.category]}</span>
                        <span className="min-w-0 truncate">{item.label}</span>
                        {done && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-normal text-emerald-700">
                            <Check size={12} /> opened
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-500" title={item.query}>
                        {item.query}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => copy(item)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Copy size={13} /> {copied === item.id ? "Copied" : "Copy query"}
                      </button>
                      <span onClickCapture={() => markOpened(item)}>
                        <ExternalLink
                          href={item.url}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-white ${ENGINE_STYLE[item.engine]}`}
                        >
                          {ENGINE_LABEL[item.engine]} <LinkIcon size={13} />
                        </ExternalLink>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {rows.length > visible && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-slate-500">
                Showing {visible} of {rows.length}
              </span>
              <button type="button" onClick={() => setVisible(visible + PAGE)} className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">
                Show more
              </button>
              <button type="button" onClick={() => setVisible(rows.length)} className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">
                Show all
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-slate-500">
        LinkedIn's post search offers only 24-hour, week and month filters, so the window is rounded up. Queries use the
        quoted phrases and OR that LinkedIn documents for search, one place per query; LinkedIn may still match them
        loosely. Web searches look for public LinkedIn posts that search engines have indexed, so they find fewer and
        older posts. Open searches one at a time, browse normally and copy only what you need.
      </p>
    </div>
  );
}
