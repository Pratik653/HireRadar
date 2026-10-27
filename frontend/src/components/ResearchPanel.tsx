import { ArrowUpRight, Check, Copy, ExternalLink as LinkIcon, RotateCcw, Search, ShieldCheck, SkipForward, Telescope } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORY_LABELS,
  FEEDBACK_LABEL,
  LADDER,
  STRATEGY_HINT,
  STRATEGY_LABEL,
  WINDOWS,
  WINDOW_LABEL,
  broaderOf,
  buildResearchPlan,
  configKey,
  linkedinDateFilter,
  narrowerOf,
  rankWithFeedback,
  widerWindow,
  type Feedback,
  type PostedWindow,
  type ResearchCategory,
  type ResearchQuery,
  type Strategy,
} from "../lib/linkedin";
import { readStored, writeStored } from "../lib/storage";
import type { Days, LocationSelection } from "../lib/types";
import { CompanionCard } from "./CompanionCard";
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
const ENGINE_LABEL = { linkedin: "Open on LinkedIn", google: "Open on Google", bing: "Open on Bing" } as const;
const ENGINE_STYLE = {
  linkedin: "bg-[#0a66c2] hover:bg-[#084e96]",
  google: "bg-slate-700 hover:bg-slate-800",
  bing: "bg-slate-700 hover:bg-slate-800",
} as const;
const STRATEGY_STYLE: Record<Strategy, string> = {
  focused: "bg-violet-50 text-violet-800 ring-violet-200",
  balanced: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  broad: "bg-sky-50 text-sky-800 ring-sky-200",
  discovery: "bg-amber-50 text-amber-900 ring-amber-200",
};
const FEEDBACK_STYLE: Record<Feedback, string> = {
  unreviewed: "text-slate-500",
  relevant: "text-emerald-700",
  none: "text-rose-700",
  irrelevant: "text-amber-700",
};

function readOpened(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(OPENED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function ResearchPanel({ titles, skills, locations, days, onImport }: Props) {
  const [posted, setPosted] = useState<PostedWindow>(() => linkedinDateFilter(days));
  useEffect(() => setPosted(linkedinDateFilter(days)), [days]);

  const plan = useMemo(() => buildResearchPlan({ titles, skills, locations, days, window: posted }), [titles, skills, locations, days, posted]);

  // Feedback is kept per search configuration, in this browser only.
  const config = configKey({ titles, skills, locations });
  const feedbackKey = `research-feedback:${config}`;
  const [feedback, setFeedback] = useState<Record<string, Feedback>>(() => readStored(feedbackKey, {}));
  useEffect(() => setFeedback(readStored(feedbackKey, {})), [feedbackKey]);
  const saveFeedback = (next: Record<string, Feedback>) => {
    setFeedback(next);
    writeStored(feedbackKey, next);
  };

  const [strategy, setStrategy] = useState<Strategy | "all">("all");
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
  useEffect(() => setVisible(PAGE), [strategy, category, filter, plan]);

  const ranked = useMemo(() => rankWithFeedback(plan, feedback), [plan, feedback]);

  // Progress recorded in the Research Companion flows back here.
  const syncFromCompanion = useCallback(
    (fromCompanion: Record<string, Feedback>, openedThere: string[]) => {
      setFeedback((current) => {
        const merged = { ...current, ...fromCompanion };
        if (JSON.stringify(merged) === JSON.stringify(current)) return current;
        writeStored(feedbackKey, merged);
        return merged;
      });
      setOpened((current) => (openedThere.every((id) => current.has(id)) ? current : new Set([...current, ...openedThere])));
    },
    [feedbackKey],
  );
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return ranked.filter(
      (p) =>
        (strategy === "all" || p.strategy === strategy) &&
        (category === "all" || p.category === category) &&
        (!needle || p.query.toLowerCase().includes(needle) || p.label.toLowerCase().includes(needle)),
    );
  }, [ranked, strategy, category, filter]);

  const strategyCounts = useMemo(() => {
    const out: Partial<Record<Strategy, number>> = {};
    plan.forEach((p) => (out[p.strategy] = (out[p.strategy] ?? 0) + 1));
    return out;
  }, [plan]);
  const categories = useMemo(() => (Object.keys(CATEGORY_LABELS) as ResearchCategory[]).filter((c) => plan.some((p) => p.category === c)), [plan]);

  const open = (item: ResearchQuery) => {
    // One tab per click, always started by the user.
    window.open(item.url, "_blank", "noopener,noreferrer");
    setOpened((prev) => new Set(prev).add(item.id));
  };
  const markOpened = (item: ResearchQuery) => setOpened((prev) => new Set(prev).add(item.id));
  const next = rows.find((r) => !opened.has(r.id));
  const openedHere = rows.filter((r) => opened.has(r.id)).length;
  const reviewed = plan.filter((p) => (feedback[p.id] ?? "unreviewed") !== "unreviewed").length;
  const wider = widerWindow(posted);

  const copy = async (item: ResearchQuery) => {
    try {
      await navigator.clipboard.writeText(item.query);
      setCopied(item.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const chip = (key: Strategy | "all", name: string, count: number, title?: string) => (
    <button
      key={key}
      type="button"
      title={title}
      aria-pressed={strategy === key}
      onClick={() => setStrategy(key)}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition ${
        strategy === key ? "border-indigo-600 bg-indigo-600 font-medium text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"
      }`}
    >
      {name} <span className={strategy === key ? "text-indigo-100" : "text-slate-400"}>{count}</span>
    </button>
  );

  const suggestion = (item: ResearchQuery) => {
    const f = feedback[item.id];
    const target = f === "none" ? broaderOf(plan, item, feedback) : f === "irrelevant" ? narrowerOf(plan, item, feedback) : null;
    if (f === "none" && !target && wider) {
      return (
        <p className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-900">
          No wider search left for this role.{" "}
          <button type="button" onClick={() => setPosted(wider)} className="font-medium underline">
            Widen the date to {WINDOW_LABEL[wider].toLowerCase()}
          </button>
        </p>
      );
    }
    if (!target) return null;
    return (
      <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-1.5 text-xs ${f === "none" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
        <span className="font-medium">{f === "none" ? "Try broader:" : "Try more focused:"}</span>
        <code className="min-w-0 flex-1 truncate font-mono" title={target.query}>
          {target.query}
        </code>
        <button type="button" onClick={() => open(target)} className="inline-flex items-center gap-0.5 font-medium underline">
          Open <ArrowUpRight size={12} />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <div className="space-y-1">
          <p>
            <strong>LinkedIn research mode.</strong> These are <em>search suggestions</em>, not discovered vacancies: none
            of them has been run. Each link opens LinkedIn's own search (or a web search) in your browser, under your
            account. HireRadar does not log in to LinkedIn, scrape it or store LinkedIn credentials, and it cannot see
            how many results a search returns.
          </p>
          <p>
            After opening a search, mark what you found. HireRadar then suggests a broader or more focused search and
            reorders the list. Copy relevant posts into{" "}
            <button type="button" onClick={onImport} className="font-medium underline">
              Import posts
            </button>{" "}
            to score them.
          </p>
        </div>
      </div>

      {plan.length > 0 && (
        <CompanionCard ranked={ranked} feedback={feedback} configKey={config} posted={posted} onSync={syncFromCompanion} />
      )}

      {plan.length === 0 ? (
        <p className="text-sm text-slate-500">Add at least one job title or skill to generate searches.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span>
                <strong className="text-slate-900">{plan.length}</strong> searches · {reviewed} reviewed
              </span>
              <label className="inline-flex items-center gap-1.5">
                Posted
                <select
                  aria-label="Posted within"
                  value={posted}
                  onChange={(e) => setPosted(e.target.value as PostedWindow)}
                  className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm"
                >
                  {WINDOWS.map((w) => (
                    <option key={w} value={w}>
                      {WINDOW_LABEL[w]}
                    </option>
                  ))}
                </select>
              </label>
              {wider && (
                <button type="button" onClick={() => setPosted(wider)} className="text-xs font-medium text-indigo-700 hover:underline">
                  Widen to {WINDOW_LABEL[wider].toLowerCase()}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(opened.size > 0 || reviewed > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setOpened(new Set());
                    saveFeedback({});
                  }}
                  title="Forget which searches were opened and reviewed"
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <RotateCcw size={13} /> Reset progress
                </button>
              )}
              <button
                type="button"
                onClick={() => next && open(next)}
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

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Search strategies">
            {chip("all", "All", plan.length)}
            {(["balanced", "focused", "broad", "discovery"] as Strategy[])
              .filter((s) => strategyCounts[s])
              .map((s) => chip(s, STRATEGY_LABEL[s], strategyCounts[s] ?? 0, STRATEGY_HINT[s]))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter searches, e.g. Dubai or recruiter"
                aria-label="Filter generated searches"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <select
              aria-label="Search category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ResearchCategory | "all")}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No searches match this filter.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white" aria-label="Generated searches">
              {rows.slice(0, visible).map((item) => {
                const done = opened.has(item.id);
                const f = feedback[item.id] ?? "unreviewed";
                const broader = item.engine === "linkedin" ? broaderOf(plan, item, feedback) : null;
                return (
                  <li key={item.id} className="p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium text-slate-800">
                          <span title={STRATEGY_HINT[item.strategy]} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STRATEGY_STYLE[item.strategy]}`}>
                            {STRATEGY_LABEL[item.strategy]}
                          </span>
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
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copy(item)}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <Copy size={13} /> {copied === item.id ? "Copied" : "Copy query"}
                        </button>
                        <span onClickCapture={() => markOpened(item)}>
                          <ExternalLink
                            href={item.url}
                            className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-white ${ENGINE_STYLE[item.engine]}`}
                          >
                            {ENGINE_LABEL[item.engine]} <LinkIcon size={13} />
                          </ExternalLink>
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`What did you find for ${item.label}?`}
                        value={f}
                        onChange={(e) => saveFeedback({ ...feedback, [item.id]: e.target.value as Feedback })}
                        className={`h-8 rounded-md border border-slate-300 bg-white px-1.5 text-xs ${FEEDBACK_STYLE[f]}`}
                      >
                        {(Object.keys(FEEDBACK_LABEL) as Feedback[]).map((k) => (
                          <option key={k} value={k}>
                            {FEEDBACK_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      {broader && (
                        <button
                          type="button"
                          onClick={() => open(broader)}
                          title={`Opens: ${broader.query}`}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <Telescope size={13} /> Try broader search
                        </button>
                      )}
                    </div>
                    {suggestion(item)}
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
        Strategies run from narrow to wide: {LADDER.map((s) => STRATEGY_LABEL[s]).join(" → ")}. Balanced searches come first:
        a shorter title, hiring words as alternatives and the country rather than the city, because many hiring posts
        never name the exact title or city. LinkedIn's post search filters only by past 24 hours, week or month; choose
        "Any time" to remove the date filter. Your location choices stay unchanged in your profile even when a search
        leaves the place out. Feedback is stored in this browser only.
      </p>
    </div>
  );
}
