// Talks to the optional HireRadar Research Companion browser extension.
//
// The extension lists this site in `externally_connectable`, which is the only
// way a page can reach it; Chrome then exposes `chrome.runtime.sendMessage` to
// this origin alone. Without the extension `chrome.runtime` is undefined here and
// every call resolves to null, so HireRadar works exactly as before.
import { relaxationCandidates, type Feedback, type PostedWindow, type ResearchQuery } from "./linkedin";

/** Pinned by the public key in extension/manifest.json. A store listing can be added via VITE_COMPANION_ID. */
export const COMPANION_IDS = ["gcboglbpfkdbfdmapiggnplpbeljhonn", ...(import.meta.env.VITE_COMPANION_ID ? [import.meta.env.VITE_COMPANION_ID] : [])];
export const COMPANION_VERSION = "1.0.0";
export const COMPANION_DOWNLOAD = `https://github.com/Pratik653/HireRadar/releases/download/companion-v${COMPANION_VERSION}/hireradar-companion-${COMPANION_VERSION}.zip`;
export const COMPANION_GUIDE = "https://github.com/Pratik653/HireRadar/blob/main/extension/README.md";
const PROTOCOL = 1;
const MAX_QUERIES = 100;

interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, reply: (response: unknown) => void) => void;
  lastError?: unknown;
}
const runtime = (): ChromeRuntime | null => {
  const rt = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  return rt && typeof rt.sendMessage === "function" ? rt : null;
};

export interface CompanionSession {
  v: 1;
  configKey: string;
  createdAt: number;
  posted: PostedWindow;
  startIndex: number;
  feedback: Record<string, Feedback>;
  queries: {
    id: string;
    strategy: ResearchQuery["strategy"];
    category: string;
    label: string;
    subject: string;
    query: string;
    url: string;
    broader: string[];
    narrower: string[];
  }[];
}

export interface CompanionStatus {
  id: string;
  version: string;
  session: { configKey: string; total: number } | null;
}

/** Desktop Chromium (Chrome, Edge, Brave …) is required for the extension. */
export function browserSupportsCompanion(ua = navigator.userAgent): boolean {
  return /(Chrome|Chromium|Edg)\/\d+/.test(ua) && !/Mobile|Android/.test(ua);
}

function call(id: string, msg: unknown, timeoutMs = 1500): Promise<Record<string, unknown> | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(id, msg, (response) => {
        clearTimeout(timer);
        void rt.lastError; // reading it silences "receiving end does not exist"
        resolve(response && typeof response === "object" ? (response as Record<string, unknown>) : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Find an installed companion. Null when it is not installed or not reachable. */
export async function detectCompanion(): Promise<CompanionStatus | null> {
  for (const id of COMPANION_IDS) {
    const r = await call(id, { type: "hireradar/ping", v: PROTOCOL });
    if (r?.ok === true && typeof r.version === "string") {
      return { id, version: r.version, session: (r.session as CompanionStatus["session"]) ?? null };
    }
  }
  return null;
}

/** Only what navigation needs: LinkedIn searches in priority order, with their relaxation links. */
export function buildCompanionSession(
  ranked: ResearchQuery[],
  feedback: Record<string, Feedback>,
  configKey: string,
  posted: PostedWindow,
  startId?: string,
  now = Date.now(),
): CompanionSession {
  const linkedin = ranked.filter((p) => p.engine === "linkedin").slice(0, MAX_QUERIES);
  const ids = new Set(linkedin.map((p) => p.id));
  const keep = (list: ResearchQuery[]) => list.map((p) => p.id).filter((id) => ids.has(id)).slice(0, 20);
  const startIndex = Math.max(0, startId ? linkedin.findIndex((p) => p.id === startId) : linkedin.findIndex((p) => (feedback[p.id] ?? "unreviewed") === "unreviewed"));
  return {
    v: PROTOCOL,
    configKey,
    createdAt: now,
    posted,
    startIndex,
    feedback: Object.fromEntries(Object.entries(feedback).filter(([id, f]) => ids.has(id) && f !== "unreviewed")),
    queries: linkedin.map((p) => ({
      id: p.id,
      strategy: p.strategy,
      category: p.category,
      label: p.label,
      subject: p.subject,
      query: p.query,
      url: p.url,
      broader: keep(relaxationCandidates(linkedin, p, 1)),
      narrower: keep(relaxationCandidates(linkedin, p, -1)),
    })),
  };
}

export async function startCompanion(id: string, session: CompanionSession): Promise<{ ok: boolean; error?: string }> {
  const { startIndex, ...rest } = session;
  const r = await call(id, { type: "hireradar/start", v: PROTOCOL, session: { ...rest, startIndex } }, 5000);
  return r ? { ok: r.ok === true, error: typeof r.error === "string" ? r.error : undefined } : { ok: false, error: "The companion did not respond." };
}

export async function openCompanion(id: string): Promise<boolean> {
  return (await call(id, { type: "hireradar/open", v: PROTOCOL }))?.ok === true;
}

/** Progress and feedback the user recorded in the companion for this configuration. */
export async function fetchCompanionState(id: string, configKey: string) {
  const r = await call(id, { type: "hireradar/state", v: PROTOCOL, configKey });
  const state = r?.ok === true ? (r.state as { index: number; opened: string[]; feedback: Record<string, Feedback> } | null) : null;
  return state && typeof state === "object" ? state : null;
}
