import { CheckCircle2, ExternalLink as LinkIcon, PanelRightOpen, PlugZap, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  COMPANION_DOWNLOAD,
  COMPANION_GUIDE,
  browserSupportsCompanion,
  buildCompanionSession,
  detectCompanion,
  fetchCompanionState,
  openCompanion,
  startCompanion,
  type CompanionStatus,
} from "../lib/companion";
import type { Feedback, PostedWindow, ResearchQuery } from "../lib/linkedin";
import { ExternalLink } from "./ui";

interface Props {
  ranked: ResearchQuery[];
  feedback: Record<string, Feedback>;
  configKey: string;
  posted: PostedWindow;
  /** Merge progress the user recorded in the companion back into this page. */
  onSync: (feedback: Record<string, Feedback>, opened: string[]) => void;
}

type Phase = "checking" | "missing" | "connected";

export function CompanionCard({ ranked, feedback, configKey, posted, onSync }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [guide, setGuide] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const supported = browserSupportsCompanion();
  const total = ranked.filter((p) => p.engine === "linkedin").length;

  const check = useCallback(async () => {
    setPhase("checking");
    const found = await detectCompanion();
    setStatus(found);
    setPhase(found ? "connected" : "missing");
    return found;
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // When the user comes back from LinkedIn, pick up what they marked in the companion.
  useEffect(() => {
    if (!status) return;
    const sync = async (event?: Event) => {
      if (event?.type === "visibilitychange" && document.visibilityState !== "visible") return;
      const state = await fetchCompanionState(status.id, configKey);
      if (state) onSync(state.feedback, state.opened);
    };
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [status, configKey, onSync]);

  const start = async () => {
    const found = status ?? (await check());
    if (!found) return;
    setStarting(true);
    setMessage(null);
    const result = await startCompanion(found.id, buildCompanionSession(ranked, feedback, configKey, posted));
    setStarting(false);
    setMessage(
      result.ok
        ? { tone: "ok", text: `Companion opened with ${total} LinkedIn searches. Use Next and Previous there; LinkedIn opens in one tab.` }
        : { tone: "error", text: `The companion could not start: ${result.error ?? "unknown error"}.` },
    );
    if (result.ok) setStatus({ ...found, session: { configKey, total } });
  };

  const sameSession = status?.session?.configKey === configKey;

  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <PanelRightOpen size={18} className="shrink-0 text-indigo-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">Research Companion</p>
          <p className="text-xs text-slate-500" role="status">
            {phase === "checking" && "Checking for the browser extension…"}
            {phase === "missing" && (supported ? "Optional browser extension — not installed." : "Needs desktop Chrome or Edge 116+.")}
            {phase === "connected" && (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 size={13} aria-hidden /> Connected (v{status?.version})
              </span>
            )}
          </p>
        </div>
        {phase === "connected" ? (
          <div className="flex flex-wrap gap-2">
            {sameSession && (
              <button
                type="button"
                onClick={() => status && openCompanion(status.id)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Show companion
              </button>
            )}
            <button
              type="button"
              onClick={start}
              disabled={starting || total === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-700 px-3 text-xs font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              <PlugZap size={14} aria-hidden /> {sameSession ? "Restart with these searches" : `Start companion (${total})`}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setGuide(!guide)}
            aria-expanded={guide}
            disabled={phase === "checking"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-700 px-3 text-xs font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            <PlugZap size={14} aria-hidden /> Enable Research Companion
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        A small floating window that steps through these searches in one LinkedIn tab, with Previous, Next, Try broader and
        feedback, so you don't have to come back here after every search. It never reads or changes LinkedIn pages.
      </p>

      {message && <p className={`mt-2 text-xs ${message.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}

      {guide && phase !== "connected" && (
        <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
          {!supported && (
            <p className="text-amber-800">
              The companion is a Chrome/Edge extension for desktop. On other browsers keep using <em>Open on LinkedIn</em>.
            </p>
          )}
          <p className="font-medium">Install it once (about a minute):</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <ExternalLink href={COMPANION_DOWNLOAD} className="font-medium text-indigo-700 underline">
                Download the companion
              </ExternalLink>{" "}
              and unzip it.
            </li>
            <li>
              Open <code>chrome://extensions</code> (or <code>edge://extensions</code>) and switch on <strong>Developer mode</strong>.
            </li>
            <li>
              Choose <strong>Load unpacked</strong> and select the unzipped <code>hireradar-companion-1.0.0</code> folder.
            </li>
            <li>Come back here and press Check again.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={check}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 font-medium hover:bg-slate-100"
            >
              <RefreshCw size={13} aria-hidden /> Check again
            </button>
            <ExternalLink href={COMPANION_GUIDE} className="inline-flex items-center gap-1 text-indigo-700 underline">
              Guide, permissions and privacy <LinkIcon size={12} />
            </ExternalLink>
          </div>
          <p className="text-slate-500">
            The extension asks only for local storage. It has no access to LinkedIn pages, cookies or passwords. It is not in
            the Chrome Web Store yet, which is why the install is manual.
          </p>
        </div>
      )}
    </div>
  );
}
