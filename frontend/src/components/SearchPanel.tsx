import { Plus, Search, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SUGGESTED_BOARDS } from "../lib/catalog";
import type { CompanyBoard, Days, LiveSource, Mode, SearchRequest, Seniority, WorkMode } from "../lib/types";
import { LocationPicker } from "./LocationPicker";
import { Chip, Section, TagInput } from "./ui";

export type FormState = Omit<SearchRequest, "mode" | "imports">;

export const DEFAULT_FORM: FormState = {
  locations: [{ country_code: "AE" }, { country_code: "SA", city: "Riyadh" }, { country_code: "QA" }],
  work_modes: ["onsite", "hybrid", "remote"],
  titles: ["Applied AI Engineer", "LLM Engineer", "Python Developer"],
  skills: ["Python", "RAG", "LangGraph", "Agentic AI", "LLM"],
  description: "",
  resume_text: "",
  exclusions: [],
  seniority: [],
  days: 7,
  include_undated: true,
  sources: ["company_boards", "remotive", "manual_import"],
  company_boards: [
    { provider: "greenhouse", slug: "careem" },
    { provider: "greenhouse", slug: "tamara" },
    { provider: "ashby", slug: "ziina" },
  ],
  min_score: 0,
};

const DAYS: { value: Days; label: string }[] = [
  { value: 1, label: "24 hours" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];
const WORK_MODES: WorkMode[] = ["onsite", "hybrid", "remote"];
const SENIORITY: Seniority[] = ["intern", "junior", "mid", "senior", "lead", "manager", "executive"];
const SOURCES: { key: LiveSource; label: string; hint: string }[] = [
  { key: "company_boards", label: "Company career boards", hint: "Greenhouse · Lever · Ashby" },
  { key: "remotive", label: "Remotive", hint: "Remote roles, 24h delay" },
  { key: "manual_import", label: "Your imported posts", hint: "LinkedIn and others" },
];

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

interface Props {
  form: FormState;
  setForm: (f: FormState) => void;
  mode: Mode;
  importCount: number;
  busy: boolean;
  onSearch: () => void;
  notice: ReactNode;
  error?: ReactNode;
}

export function SearchPanel({ form, setForm, mode, importCount, busy, onSearch, notice, error }: Props) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  const [board, setBoard] = useState<CompanyBoard>({ provider: "greenhouse", slug: "" });
  const [showResume, setShowResume] = useState(Boolean(form.resume_text));
  const canSearch = form.titles.length > 0 || form.skills.length > 0 || form.description.trim().length > 0;

  const addBoard = (b: CompanyBoard) => {
    const slug = b.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(slug)) return;
    if (form.company_boards.some((x) => x.provider === b.provider && x.slug === slug)) return;
    set("company_boards", [...form.company_boards, { provider: b.provider, slug }].slice(0, 12));
    setBoard({ ...board, slug: "" });
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSearch && !busy) onSearch();
      }}
    >
      <Section title="Where">
        <LocationPicker value={form.locations} onChange={(v) => set("locations", v)} />
        <div className="flex flex-wrap gap-2 pt-1">
          {WORK_MODES.map((m) => (
            <Chip key={m} active={form.work_modes.includes(m)} onClick={() => set("work_modes", toggle(form.work_modes, m))}>
              {m === "onsite" ? "On-site" : m[0].toUpperCase() + m.slice(1)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Target roles" hint="Enter or comma to add">
        <TagInput label="Job titles" values={form.titles} onChange={(v) => set("titles", v)} placeholder="e.g. LLM Engineer" max={15} />
      </Section>

      <Section title="Skills & keywords">
        <TagInput label="Skills" values={form.skills} onChange={(v) => set("skills", v)} placeholder="e.g. Python, RAG, LangGraph" max={40} />
      </Section>

      <Section title="Desired job description" hint="optional">
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value.slice(0, 6000))}
          rows={3}
          placeholder="Describe the work you want: products, domain, team, responsibilities…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        {showResume ? (
          <div className="space-y-1">
            <textarea
              value={form.resume_text}
              onChange={(e) => set("resume_text", e.target.value.slice(0, 20000))}
              rows={4}
              placeholder="Paste resume text (plain text). Used for similarity only."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="text-xs text-slate-500">
              Stored only in this browser. Sent with each search for scoring and not kept by the server.
            </p>
          </div>
        ) : (
          <button type="button" onClick={() => setShowResume(true)} className="text-sm text-indigo-700 hover:underline">
            + Add resume text for better matching
          </button>
        )}
      </Section>

      <Section title="Published within">
        <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-slate-300 bg-white text-sm" role="radiogroup">
          {DAYS.map((d) => (
            <button
              type="button"
              role="radio"
              aria-checked={form.days === d.value}
              key={d.value}
              onClick={() => set("days", d.value)}
              className={`px-1 py-1.5 transition ${form.days === d.value ? "bg-indigo-600 font-medium text-white" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-indigo-600" checked={form.include_undated} onChange={(e) => set("include_undated", e.target.checked)} />
          Include items without a trustworthy date (ranked lower, never given a date)
        </label>
      </Section>

      <details className="group rounded-lg border border-slate-200 bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Refine: seniority, exclusions, minimum score</summary>
        <div className="mt-3 space-y-4">
          <Section title="Seniority" hint="none = any">
            <div className="flex flex-wrap gap-1.5">
              {SENIORITY.map((s) => (
                <Chip key={s} active={form.seniority.includes(s)} onClick={() => set("seniority", toggle(form.seniority, s))}>
                  {s}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title="Exclude keywords">
            <TagInput label="Exclusions" values={form.exclusions} onChange={(v) => set("exclusions", v)} placeholder="e.g. unpaid, sales" />
          </Section>
          <Section title="Minimum score" hint={`${form.min_score}`}>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={form.min_score}
              onChange={(e) => set("min_score", Number(e.target.value))}
              className="w-full accent-indigo-600"
              aria-label="Minimum score"
            />
          </Section>
        </div>
      </details>

      {mode === "live" && (
        <Section title="Live sources">
          <div className="space-y-1.5">
            {SOURCES.map((s) => (
              <label key={s.key} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 accent-indigo-600" checked={form.sources.includes(s.key)} onChange={() => set("sources", toggle(form.sources, s.key))} />
                <span>
                  {s.label} <span className="text-slate-400">· {s.hint}</span>
                  {s.key === "manual_import" && <span className="ml-1 text-indigo-700">({importCount} saved)</span>}
                </span>
              </label>
            ))}
          </div>
          {form.sources.includes("company_boards") && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
              <ul className="flex flex-wrap gap-1.5">
                {form.company_boards.map((b) => (
                  <li key={`${b.provider}/${b.slug}`} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {b.provider}/{b.slug}
                    <button
                      type="button"
                      aria-label={`Remove ${b.slug}`}
                      onClick={() => set("company_boards", form.company_boards.filter((x) => x !== b))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-1.5">
                <select
                  aria-label="Board provider"
                  value={board.provider}
                  onChange={(e) => setBoard({ ...board, provider: e.target.value as CompanyBoard["provider"] })}
                  className="rounded-md border border-slate-300 bg-white px-1.5 text-sm"
                >
                  <option value="greenhouse">Greenhouse</option>
                  <option value="lever">Lever</option>
                  <option value="ashby">Ashby</option>
                </select>
                <input
                  aria-label="Board name"
                  value={board.slug}
                  onChange={(e) => setBoard({ ...board, slug: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addBoard(board);
                    }
                  }}
                  placeholder="board name, e.g. careem"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <button type="button" onClick={() => addBoard(board)} aria-label="Add board" className="rounded-md border border-slate-300 px-2 hover:bg-slate-50">
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                The board name is the last part of a company's jobs URL, e.g. boards.greenhouse.io/<b>careem</b>. Suggested:{" "}
                {SUGGESTED_BOARDS.map((b, i) => (
                  <span key={b.slug}>
                    {i > 0 && ", "}
                    <button type="button" className="text-indigo-700 hover:underline" onClick={() => addBoard(b)}>
                      {b.company}
                    </button>
                  </span>
                ))}
              </p>
            </div>
          )}
        </Section>
      )}

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        {notice}
        {error}
        <button
          type="submit"
          disabled={!canSearch || busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-white" aria-hidden /> : <Search size={18} />}
          {busy ? "Searching…" : mode === "demo" ? "Search demo data" : "Search live sources"}
        </button>
        {!canSearch && <p className="text-center text-xs text-slate-500">Add a job title, a skill or a description to search.</p>}
      </div>
    </form>
  );
}
