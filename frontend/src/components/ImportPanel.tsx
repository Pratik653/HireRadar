import Papa from "papaparse";
import { FileUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { safeHref } from "../lib/safe";
import type { ImportedPost } from "../lib/types";

interface Props {
  imports: ImportedPost[];
  setImports: (posts: ImportedPost[]) => void;
}

const EMPTY: ImportedPost = {
  text: "",
  url: "",
  author_name: "",
  author_position: "",
  author_profile_url: "",
  company: "",
  location: "",
  published_at: "",
  platform: "LinkedIn",
};
const MAX_IMPORTS = 50;
const FIELDS = ["text", "url", "author_name", "author_position", "author_profile_url", "company", "location", "published_at", "platform"] as const;

/** Normalise one imported row; returns an error message if it is unusable. */
export function normaliseImport(raw: Record<string, unknown>): ImportedPost | string {
  const get = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const text = get("text").slice(0, 8000);
  if (text.length < 20) return "post text must be at least 20 characters";
  for (const key of ["url", "author_profile_url"]) {
    if (get(key) && !safeHref(get(key))) return `${key} must be an http(s) link`;
  }
  let published: string | null = null;
  if (get("published_at")) {
    const date = new Date(get("published_at"));
    if (Number.isNaN(date.getTime())) return "published_at is not a valid date";
    published = date.toISOString();
  }
  return {
    text,
    url: get("url") || null,
    author_name: get("author_name").slice(0, 120) || null,
    author_position: get("author_position").slice(0, 160) || null,
    author_profile_url: get("author_profile_url") || null,
    company: get("company").slice(0, 120) || null,
    location: get("location").slice(0, 160) || null,
    published_at: published,
    platform: get("platform").slice(0, 40) || "LinkedIn",
  };
}

export function ImportPanel({ imports, setImports }: Props) {
  const [draft, setDraft] = useState<ImportedPost>(EMPTY);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const set = (key: keyof ImportedPost, value: string) => setDraft({ ...draft, [key]: value });

  const add = (rows: Record<string, unknown>[]) => {
    const accepted: ImportedPost[] = [];
    const errors: string[] = [];
    rows.forEach((row, i) => {
      const result = normaliseImport(row);
      if (typeof result === "string") errors.push(`row ${i + 1}: ${result}`);
      else accepted.push(result);
    });
    const room = MAX_IMPORTS - imports.length;
    setImports([...imports, ...accepted.slice(0, room)]);
    const skipped = accepted.length > room ? ` ${accepted.length - room} skipped (limit ${MAX_IMPORTS}).` : "";
    setMessage(
      errors.length
        ? { tone: "error", text: `Added ${Math.min(accepted.length, room)}.${skipped} ${errors.slice(0, 3).join("; ")}` }
        : { tone: "ok", text: `Added ${Math.min(accepted.length, room)} post(s).${skipped}` },
    );
  };

  const onFile = (file: File) => {
    if (file.size > 1_000_000) {
      setMessage({ tone: "error", text: "File is larger than 1 MB." });
      return;
    }
    file.text().then((content) => {
      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          const data = JSON.parse(content);
          add(Array.isArray(data) ? data : [data]);
        } catch {
          setMessage({ tone: "error", text: "Could not parse JSON." });
        }
      } else {
        const parsed = Papa.parse<Record<string, unknown>>(content, { header: true, skipEmptyLines: true });
        add(parsed.data);
      }
    });
  };

  const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-500";

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          add([draft as unknown as Record<string, unknown>]);
          setDraft(EMPTY);
        }}
      >
        <textarea
          required
          value={draft.text}
          onChange={(e) => set("text", e.target.value)}
          rows={5}
          placeholder="Paste the full hiring post text *"
          className={`${input} sm:col-span-2`}
          aria-label="Post text"
        />
        <input value={draft.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="Post URL" className={input} aria-label="Post URL" />
        <input type="datetime-local" value={draft.published_at ?? ""} onChange={(e) => set("published_at", e.target.value)} className={input} aria-label="Published at" title="Publication date as shown on the post" />
        <input value={draft.author_name ?? ""} onChange={(e) => set("author_name", e.target.value)} placeholder="Poster name" className={input} aria-label="Poster name" />
        <input value={draft.author_position ?? ""} onChange={(e) => set("author_position", e.target.value)} placeholder="Poster position, e.g. Head of AI" className={input} aria-label="Poster position" />
        <input value={draft.author_profile_url ?? ""} onChange={(e) => set("author_profile_url", e.target.value)} placeholder="Poster profile URL" className={input} aria-label="Poster profile URL" />
        <input value={draft.company ?? ""} onChange={(e) => set("company", e.target.value)} placeholder="Company" className={input} aria-label="Company" />
        <input value={draft.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Location, e.g. Dubai, UAE" className={input} aria-label="Location" />
        <select value={draft.platform} onChange={(e) => set("platform", e.target.value)} className={input} aria-label="Platform">
          <option>LinkedIn</option>
          <option>X</option>
          <option>Company website</option>
          <option>Newsletter</option>
          <option>Other</option>
        </select>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800">
            Save post
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            <FileUp size={15} /> Import CSV / JSON
            <input type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <span className="text-xs text-slate-500">Columns: {FIELDS.join(", ")}</span>
        </div>
      </form>
      {message && <p className={`text-sm ${message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Saved posts ({imports.length}/{MAX_IMPORTS})
          </h3>
          {imports.length > 0 && (
            <button type="button" onClick={() => setImports([])} className="text-xs text-rose-700 hover:underline">
              Remove all
            </button>
          )}
        </div>
        {imports.length === 0 ? (
          <p className="text-sm text-slate-500">No posts saved yet. They stay in this browser until you remove them.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {imports.map((post, i) => (
              <li key={i} className="flex gap-2 p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-800">{post.text}</p>
                  <p className="text-xs text-slate-500">
                    {[post.author_name, post.company, post.location, post.published_at?.slice(0, 10) ?? "no date", post.platform].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button type="button" aria-label="Remove post" onClick={() => setImports(imports.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
