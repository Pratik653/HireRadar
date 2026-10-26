import { FlaskConical, Github, Radar, Radio } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ImportPanel } from "./components/ImportPanel";
import { ResearchPanel } from "./components/ResearchPanel";
import { Results } from "./components/Results";
import { SearchPanel } from "./components/SearchPanel";
import { SourcesPanel } from "./components/SourcesPanel";
import { WakeNotice } from "./components/WakeNotice";
import { API_URL, ApiError, exportXlsx, search } from "./lib/api";
import { DEFAULT_FORM, sanitizeForm, type FormState } from "./lib/form";
import { download, toCsv } from "./lib/safe";
import { clearStored, useStoredState } from "./lib/storage";
import type { ApplicationStatus, ImportedPost, Mode, SearchResponse, Tracked } from "./lib/types";
import { useBackend } from "./lib/useBackend";

type Tab = "results" | "research" | "import" | "sources";
const REPO_URL = "https://github.com/Pratik653/HireRadar";

export default function App() {
  const [mode, setMode] = useStoredState<Mode>("mode", "demo");
  const [form, setForm] = useStoredState<FormState>("form", DEFAULT_FORM, sanitizeForm);
  const [imports, setImports] = useStoredState<ImportedPost[]>("imports", []);
  const [tracking, setTracking] = useStoredState<Record<string, Tracked>>("tracking", {});
  const [tab, setTab] = useState<Tab>("results");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [snapshot, setSnapshot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const backend = useBackend();

  const loadSnapshot = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}demo-snapshot.json`);
    if (!res.ok) throw new Error("snapshot missing");
    setResponse(await res.json());
    setSnapshot(true);
    setError(null);
    setTab("results");
  }, []);

  const runSearch = useCallback(async () => {
    setBusy(true);
    setError(null);
    setTab("results");
    try {
      const body = { ...form, mode, imports: mode === "live" ? imports : [] };
      const result = await backend.track(() => search(body));
      setResponse(result);
      setSnapshot(false);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("Unexpected error.", "api");
      setError(err);
      if (mode === "demo" && err.kind !== "api") await loadSnapshot().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }, [form, mode, imports, backend, loadSnapshot]);

  // Without a backend the demo still shows something honest: the static snapshot.
  useEffect(() => {
    if (!API_URL && mode === "demo" && !response) loadSnapshot().catch(() => undefined);
  }, [mode, response, loadSnapshot]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setResponse(null);
    setSnapshot(false);
    setError(null);
  };

  const setStatus = (id: string, status: ApplicationStatus) => setTracking({ ...tracking, [id]: { ...tracking[id], status } });

  const onExportXlsx = async () => {
    if (!response) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await backend.track(() => exportXlsx(response, tracking));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
      download(blob, `hireradar${response.mode === "demo" ? "-demo" : ""}-${stamp}.xlsx`);
    } catch (e) {
      setExportError(e instanceof ApiError ? `Excel export failed: ${e.message}` : "Excel export failed.");
    } finally {
      setExporting(false);
    }
  };

  const onExportCsv = () => {
    if (!response) return;
    const csv = "﻿" + toCsv(response.results, tracking);
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `hireradar${response.mode === "demo" ? "-demo" : ""}.csv`);
  };

  const errorBox = error && error.kind === "api" && (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
      <p className="font-medium">{error.message}</p>
      {error.details && (
        <ul className="mt-1 list-disc pl-4 text-xs">
          {error.details.map((d) => <li key={d.field + d.message}>{d.field ? `${d.field}: ` : ""}{d.message}</li>)}
        </ul>
      )}
    </div>
  );
  const notConfigured = backend.status === "not_configured" && (
    <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      This build is not connected to a backend. {mode === "demo" ? "Showing the pre-computed demo snapshot." : "Live search and Excel export need the backend — see DEPLOYMENT.md."}
    </p>
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "results", label: "Results" },
    { key: "research", label: "LinkedIn research" },
    { key: "import", label: `Import posts${imports.length ? ` (${imports.length})` : ""}` },
    { key: "sources", label: "Sources & method" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-700 text-white">
              <Radar size={20} />
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight">HireRadar</h1>
              <p className="text-xs text-slate-500">Who is hiring, for what, where and when</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-sm" role="radiogroup" aria-label="Data mode">
              <button
                type="button" role="radio" aria-checked={mode === "demo"} onClick={() => switchMode("demo")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 ${mode === "demo" ? "bg-amber-400 font-medium text-amber-950 shadow-sm" : "text-slate-600"}`}
              >
                <FlaskConical size={14} /> Demo
              </button>
              <button
                type="button" role="radio" aria-checked={mode === "live"} onClick={() => switchMode("live")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 ${mode === "live" ? "bg-emerald-600 font-medium text-white shadow-sm" : "text-slate-600"}`}
              >
                <Radio size={14} /> Live
              </button>
            </div>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <Github size={18} />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[380px_1fr]">
        <aside className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 pt-4 sm:px-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <SearchPanel
            form={form}
            setForm={setForm}
            mode={mode}
            importCount={imports.length}
            busy={busy}
            onSearch={runSearch}
            notice={notConfigured || <WakeNotice status={backend.status} justWoke={backend.justWoke} busy={busy} onRetry={runSearch} />}
            error={errorBox}
          />
          <div className="flex justify-end py-3 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => {
                if (confirm("Remove all HireRadar data (preferences, imports, statuses) from this browser?")) {
                  clearStored();
                  location.reload();
                }
              }}
              className="hover:text-rose-700"
            >
              Clear my local data
            </button>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Sections">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "results" &&
            (response ? (
              <Results
                response={response}
                tracking={tracking}
                setStatus={setStatus}
                onExportXlsx={onExportXlsx}
                onExportCsv={onExportCsv}
                exporting={exporting}
                exportError={exportError}
                canExportXlsx={Boolean(API_URL)}
                snapshot={snapshot}
              />
            ) : (
              <Welcome mode={mode} busy={busy} />
            ))}
          {tab === "research" && <ResearchPanel titles={form.titles} skills={form.skills} locations={form.locations} days={form.days} onImport={() => setTab("import")} />}
          {tab === "import" && (
            <div className="space-y-3">
              {mode === "demo" && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Imported posts are scored in <strong>Live</strong> mode. Demo mode only uses synthetic data.
                </p>
              )}
              <ImportPanel imports={imports} setImports={setImports} />
            </div>
          )}
          {tab === "sources" && <SourcesPanel />}
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        HireRadar is open source (Apache-2.0). Verify every lead at its source before applying.{" "}
        <a href={REPO_URL} className="text-indigo-700 hover:underline" target="_blank" rel="noopener noreferrer">GitHub</a>
      </footer>
    </div>
  );
}

function Welcome({ mode, busy }: { mode: Mode; busy: boolean }) {
  if (busy) {
    return (
      <div className="space-y-2" aria-busy>
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-200/70" />)}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Find who is hiring — and why it matches you</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        HireRadar collects hiring announcements and vacancies, classifies the hiring intent, scores each against your
        roles, skills and locations, removes duplicates and explains every score. Choose locations and roles on the
        left, then search.
      </p>
      <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <li className="rounded-lg bg-slate-50 p-3"><strong className="block">Demo</strong>Synthetic GCC examples. Nothing real, clearly marked.</li>
        <li className="rounded-lg bg-slate-50 p-3"><strong className="block">Live</strong>Company career boards, Remotive and posts you import.</li>
        <li className="rounded-lg bg-slate-50 p-3"><strong className="block">LinkedIn</strong>Research links you open yourself, plus manual import.</li>
      </ul>
      <p className="mt-4 text-xs text-slate-500">You are in {mode === "demo" ? "Demo" : "Live"} mode.</p>
    </div>
  );
}
