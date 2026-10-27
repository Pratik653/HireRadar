// HireRadar Research Companion — service worker.
//
// It never reads or changes LinkedIn pages. It only:
//   * accepts a research queue from HireRadar (externally_connectable, origin-checked),
//   * opens or re-points one research tab to the user's chosen search (tabs.create/update,
//     which need no permission and no host access),
//   * keeps the companion window and its saved size/position,
//   * stores progress and feedback in chrome.storage.local on this device.
import { PROTOCOL, SIZE, clampBounds, relaxTarget, sameBounds, validateExternalMessage, validateSession } from "./session.js";

const COMPANION_URL = chrome.runtime.getURL("src/companion.html");
const NAV_COOLDOWN_MS = 600; // ignore accidental double clicks
const ALLOWED_ORIGINS = new Set(
  (chrome.runtime.getManifest().externally_connectable?.matches ?? []).map((m) => new URL(m.replace(/\*$/, "")).origin),
);

const DEFAULT_STATE = {
  index: 0,
  opened: [],
  feedback: {},
  tabId: null,
  windowId: null,
  bounds: null, // expanded size and position, remembered across sessions
  compact: false,
  screen: null,
  lastNavAt: 0,
};

// ---- storage ------------------------------------------------------------------

async function load() {
  const { session = null, state = {} } = await chrome.storage.local.get(["session", "state"]);
  return { session, state: { ...DEFAULT_STATE, ...state } };
}

async function save(patch) {
  const { state } = await load();
  const next = { ...state, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

// ---- research tab ---------------------------------------------------------------

let navigating = Promise.resolve();

/** Point the single research tab at queue[index]. Serialised and rate limited. */
function navigate(index, { force = false } = {}) {
  navigating = navigating.then(async () => {
    const { session, state } = await load();
    if (!session || index < 0 || index >= session.queries.length) return { ok: false, error: "no such search" };
    const now = Date.now();
    if (!force && now - state.lastNavAt < NAV_COOLDOWN_MS) return { ok: false, error: "busy" };
    const url = session.queries[index].url;
    let tabId = state.tabId;
    try {
      if (tabId == null) throw new Error("no tab");
      await chrome.tabs.update(tabId, { url, active: true });
    } catch {
      const target = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
      const tab = await chrome.tabs.create({ url, active: true, ...(target ? { windowId: target.id } : {}) });
      tabId = tab.id;
    }
    const id = session.queries[index].id;
    // The cooldown is for repeated user steps; a forced open (start, reopen) does not start it.
    await save({ index, tabId, lastNavAt: force ? state.lastNavAt : now, opened: [...new Set([...state.opened, id])] });
    return { ok: true, index };
  });
  return navigating;
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { state } = await load();
  if (state.tabId === tabId) await save({ tabId: null });
});

// ---- companion window -----------------------------------------------------------

async function companionWindow() {
  const { state } = await load();
  if (state.windowId == null) return null;
  return chrome.windows.get(state.windowId).catch(() => null);
}

async function openCompanion() {
  const existing = await companionWindow();
  if (existing) {
    await chrome.windows.update(existing.id, { focused: true, ...(existing.state === "minimized" ? { state: "normal" } : {}) });
    return existing.id;
  }
  const { state } = await load();
  let bounds = state.bounds;
  if (!bounds) {
    // First run: dock near the right edge of the current browser window.
    const anchor = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
    const { width, height } = SIZE.default;
    bounds = anchor
      ? { width, height, left: anchor.left + Math.max(0, anchor.width - width - 24), top: anchor.top + 96 }
      : { width, height, left: 80, top: 80 };
  }
  if (state.screen) bounds = clampBounds(bounds, state.screen);
  const win = await chrome.windows.create({ url: COMPANION_URL, type: "popup", focused: true, ...bounds });
  await save({ windowId: win.id, compact: false, bounds });
  return win.id;
}

async function setCompact(compact) {
  const win = await companionWindow();
  if (!win) return;
  const { state } = await load();
  if (compact) {
    const expanded = { left: win.left, top: win.top, width: win.width, height: win.height };
    await save({ compact: true, bounds: expanded });
    // Shrink towards the top-right corner so the bubble stays where the panel was.
    await chrome.windows.update(win.id, {
      width: SIZE.compact.width,
      height: SIZE.compact.height,
      left: win.left + win.width - SIZE.compact.width,
      top: win.top,
    });
  } else {
    await save({ compact: false });
    const target = state.bounds ?? { ...SIZE.default, left: win.left, top: win.top };
    await chrome.windows.update(win.id, state.screen ? clampBounds(target, state.screen) : target);
  }
}

// Remember the expanded size and position; keep the window on screen and within limits.
let boundsTimer = null;
chrome.windows.onBoundsChanged?.addListener((win) => {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(async () => {
    const { state } = await load();
    if (win.id !== state.windowId || state.compact) return;
    const current = { left: win.left, top: win.top, width: win.width, height: win.height };
    const fixed = state.screen ? clampBounds(current, state.screen) : current;
    if (!sameBounds(fixed, current)) await chrome.windows.update(win.id, fixed).catch(() => {});
    await save({ bounds: fixed });
  }, 250);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { state } = await load();
  // Closing the companion keeps the session, progress and feedback.
  if (state.windowId === windowId) await save({ windowId: null, compact: false });
});

chrome.action.onClicked.addListener(() => openCompanion());

// ---- messages from HireRadar ------------------------------------------------------

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  if (!ALLOWED_ORIGINS.has(sender.origin) || !validateExternalMessage(msg)) {
    reply({ ok: false, error: "rejected" });
    return false;
  }
  handleExternal(msg, sender).then(reply, () => reply({ ok: false, error: "failed" }));
  return true;
});

async function handleExternal(msg) {
  const { session, state } = await load();
  switch (msg.type) {
    case "hireradar/ping":
      return { ok: true, v: PROTOCOL, version: chrome.runtime.getManifest().version, session: session ? { configKey: session.configKey, total: session.queries.length } : null };
    case "hireradar/open":
      await openCompanion();
      return { ok: true };
    case "hireradar/state":
      // Only the progress for the configuration the page asks about; no query text.
      if (!session || session.configKey !== msg.configKey) return { ok: true, state: null };
      return { ok: true, state: { index: state.index, opened: state.opened, feedback: state.feedback } };
    case "hireradar/start": {
      const result = validateSession(msg.session);
      if (!result.ok) return { ok: false, error: result.error };
      const sameConfig = session?.configKey === result.session.configKey;
      const feedback = { ...(sameConfig ? state.feedback : {}), ...result.feedback };
      await chrome.storage.local.set({ session: result.session });
      await save({ index: result.startIndex, feedback, opened: sameConfig ? state.opened : [] });
      await openCompanion();
      await navigate(result.startIndex, { force: true });
      return { ok: true, total: result.session.queries.length };
    }
    default:
      return { ok: false, error: "rejected" };
  }
}

// ---- messages from the companion page -----------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(COMPANION_URL)) return false;
  handleCompanion(msg).then(reply, () => reply({ ok: false, error: "failed" }));
  return true;
});

async function handleCompanion(msg) {
  const { session, state } = await load();
  switch (msg?.type) {
    case "screen":
      if ([msg.left, msg.top, msg.width, msg.height].every(Number.isFinite)) {
        await save({ screen: { left: msg.left, top: msg.top, width: msg.width, height: msg.height } });
      }
      return { ok: true };
    case "go":
      return Number.isInteger(msg.index) ? navigate(msg.index) : { ok: false };
    case "step":
      return session ? navigate(state.index + (msg.delta > 0 ? 1 : -1)) : { ok: false };
    case "reopen":
      return navigate(state.index, { force: true });
    case "relax": {
      const target = relaxTarget(session, state.index, msg.direction === "narrower" ? "narrower" : "broader", state.feedback);
      return target == null ? { ok: false, error: "none left" } : navigate(target);
    }
    case "feedback": {
      const id = session?.queries?.[state.index]?.id;
      if (!id || !["unreviewed", "relevant", "none", "irrelevant"].includes(msg.status)) return { ok: false };
      const feedback = { ...state.feedback };
      if (msg.status === "unreviewed") delete feedback[id];
      else feedback[id] = msg.status;
      await save({ feedback });
      return { ok: true };
    }
    case "compact":
      await setCompact(Boolean(msg.compact));
      return { ok: true };
    case "minimize": {
      const win = await companionWindow();
      if (win) await chrome.windows.update(win.id, { state: "minimized" });
      return { ok: true };
    }
    case "restoreWindow": {
      const win = await companionWindow();
      if (win && win.state === "minimized") await chrome.windows.update(win.id, { state: "normal" });
      return { ok: true };
    }
    case "close": {
      const win = await companionWindow();
      if (win) await chrome.windows.remove(win.id);
      return { ok: true };
    }
    default:
      return { ok: false };
  }
}
