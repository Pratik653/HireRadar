// Pure helpers shared by the service worker and the companion page, and covered
// by `node --test`. Nothing here touches chrome.* APIs.

export const PROTOCOL = 1;
export const MAX_QUERIES = 100;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // a research session expires after 30 days
export const STRATEGIES = ["focused", "balanced", "broad", "discovery"];
export const FEEDBACK = ["unreviewed", "relevant", "none", "irrelevant"];
export const FEEDBACK_LABEL = {
  unreviewed: "Not reviewed",
  relevant: "Relevant results found",
  none: "No results",
  irrelevant: "Results not relevant",
};
export const STRATEGY_LABEL = { focused: "Focused", balanced: "Balanced", broad: "Broad", discovery: "Discovery" };

/** Window sizes for the companion, in CSS pixels. */
export const SIZE = {
  default: { width: 380, height: 540 },
  min: { width: 320, height: 420 },
  max: { width: 720, height: 1000 },
  compact: { width: 230, height: 150 },
};

const ID = /^[a-z0-9]{1,16}$/;
const isStr = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;

/** Only LinkedIn's post-search page, over HTTPS, with the query in `keywords`. */
export function isResearchUrl(url, query) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === "www.linkedin.com" &&
    u.pathname === "/search/results/content/" &&
    !u.username &&
    !u.password &&
    u.searchParams.get("keywords") === query
  );
}

/**
 * Validate a research session sent by HireRadar. Returns a clean copy that
 * holds only the fields the companion needs, or an error.
 */
export function validateSession(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "session must be an object" };
  if (raw.v !== PROTOCOL) return { ok: false, error: "unsupported session version" };
  if (!isStr(raw.configKey, 32) || !ID.test(raw.configKey)) return { ok: false, error: "invalid configKey" };
  if (!Number.isFinite(raw.createdAt) || raw.createdAt > now + 60_000) return { ok: false, error: "invalid createdAt" };
  if (now - raw.createdAt > SESSION_TTL_MS) return { ok: false, error: "session expired" };
  if (!isStr(raw.posted, 32)) return { ok: false, error: "invalid posted window" };
  if (!Array.isArray(raw.queries) || raw.queries.length === 0 || raw.queries.length > MAX_QUERIES) {
    return { ok: false, error: `queries must be a list of 1–${MAX_QUERIES} items` };
  }
  const ids = new Set();
  const queries = [];
  for (const q of raw.queries) {
    if (!q || typeof q !== "object") return { ok: false, error: "query must be an object" };
    if (!ID.test(q.id) || ids.has(q.id)) return { ok: false, error: "query ids must be unique short ids" };
    if (!STRATEGIES.includes(q.strategy)) return { ok: false, error: "unknown strategy" };
    if (!isStr(q.category, 32) || !isStr(q.label, 200) || !isStr(q.subject, 120) || !isStr(q.query, 300)) {
      return { ok: false, error: "query text fields missing or too long" };
    }
    if (!isResearchUrl(q.url, q.query)) return { ok: false, error: "query URL must be a LinkedIn post search for that query" };
    for (const list of [q.broader, q.narrower]) {
      if (!Array.isArray(list) || list.length > 20 || !list.every((id) => ID.test(id))) {
        return { ok: false, error: "broader/narrower must be short id lists" };
      }
    }
    ids.add(q.id);
    queries.push({
      id: q.id, strategy: q.strategy, category: q.category, label: q.label, subject: q.subject,
      query: q.query, url: q.url, broader: [...q.broader], narrower: [...q.narrower],
    });
  }
  // Relaxation links must point inside this session.
  for (const q of queries) {
    q.broader = q.broader.filter((id) => ids.has(id));
    q.narrower = q.narrower.filter((id) => ids.has(id));
  }
  const feedback = {};
  if (raw.feedback && typeof raw.feedback === "object") {
    for (const [id, status] of Object.entries(raw.feedback)) {
      if (ids.has(id) && FEEDBACK.includes(status) && status !== "unreviewed") feedback[id] = status;
    }
  }
  const start = Number.isInteger(raw.startIndex) && raw.startIndex >= 0 && raw.startIndex < queries.length ? raw.startIndex : 0;
  return {
    ok: true,
    session: { v: PROTOCOL, configKey: raw.configKey, createdAt: raw.createdAt, posted: raw.posted, queries },
    feedback,
    startIndex: start,
  };
}

/** Messages HireRadar may send. Anything else is rejected. */
export function validateExternalMessage(msg) {
  if (!msg || typeof msg !== "object" || msg.v !== PROTOCOL || typeof msg.type !== "string") return false;
  switch (msg.type) {
    case "hireradar/ping":
    case "hireradar/open":
      return Object.keys(msg).every((k) => ["type", "v"].includes(k));
    case "hireradar/state":
      return typeof msg.configKey === "string" && ID.test(msg.configKey) && Object.keys(msg).length === 3;
    case "hireradar/start":
      return Boolean(msg.session) && typeof msg.session === "object" && Object.keys(msg).length === 3;
    default:
      return false;
  }
}

/** First relaxation candidate the user has not reviewed yet, as a queue index. */
export function relaxTarget(session, index, direction, feedback) {
  const current = session?.queries?.[index];
  if (!current) return null;
  const list = direction === "broader" ? current.broader : current.narrower;
  for (const id of list) {
    if ((feedback[id] ?? "unreviewed") !== "unreviewed") continue;
    const i = session.queries.findIndex((q) => q.id === id);
    if (i >= 0) return i;
  }
  return null;
}

/** Keep a window inside the visible screen and within the size limits. */
export function clampBounds(bounds, screen, min = SIZE.min, max = SIZE.max) {
  const maxW = Math.min(max.width, screen.width);
  const maxH = Math.min(max.height, screen.height);
  const width = Math.round(Math.min(Math.max(bounds.width, Math.min(min.width, maxW)), maxW));
  const height = Math.round(Math.min(Math.max(bounds.height, Math.min(min.height, maxH)), maxH));
  const left = Math.round(Math.min(Math.max(bounds.left, screen.left), screen.left + screen.width - width));
  const top = Math.round(Math.min(Math.max(bounds.top, screen.top), screen.top + screen.height - height));
  return { left, top, width, height };
}

export const sameBounds = (a, b) =>
  Boolean(a && b) && ["left", "top", "width", "height"].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) <= 1);

/** Progress that reflects what the user did, never what LinkedIn returned. */
export function progress(session, state) {
  const total = session?.queries?.length ?? 0;
  const ids = new Set((session?.queries ?? []).map((q) => q.id));
  const opened = (state.opened ?? []).filter((id) => ids.has(id)).length;
  const reviewed = Object.entries(state.feedback ?? {}).filter(([id, f]) => ids.has(id) && f !== "unreviewed").length;
  return { total, opened, reviewed, position: total ? state.index + 1 : 0 };
}
