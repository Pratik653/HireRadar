// Companion window UI. Reads the research session from chrome.storage.local and
// asks the service worker to navigate; it never touches LinkedIn pages.
import { SESSION_TTL_MS, SIZE, STRATEGY_LABEL, progress, relaxTarget } from "./session.js";

const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => ({ ok: false }));
const CATEGORY = {
  direct: "Hiring announcement", recruiter: "Recruiter posts", manager: "Hiring managers", referral: "Referrals",
  urgent: "Urgent hiring", expansion: "Team expansion", alt_titles: "Alternative titles", tech: "Skills",
  indirect: "Indirect signals", web: "Web search",
};

// Keep direct references: while floating on top, these nodes live in the
// picture-in-picture document, where document.getElementById would not find them.
const nodes = new Map();
const $ = (id) => {
  if (!nodes.has(id)) nodes.set(id, document.getElementById(id));
  return nodes.get(id);
};
let view = { session: null, state: null };
let busy = false;
let pip = null; // Document Picture-in-Picture window, when "Keep on top" is on
let pipCompact = false;
let pipExpanded = null;

// ---- rendering --------------------------------------------------------------------

async function refresh() {
  const { session = null, state = {} } = await chrome.storage.local.get(["session", "state"]);
  const expired = session && Date.now() - session.createdAt > SESSION_TTL_MS;
  view = { session: expired ? null : session, state: { index: 0, opened: [], feedback: {}, ...state } };
  $("emptyReason").textContent = expired
    ? "This research session is more than 30 days old. Start a new one from HireRadar's LinkedIn research tab."
    : "Open HireRadar, go to LinkedIn research and choose Enable Research Companion.";
  render();
}

function render() {
  const { session, state } = view;
  const compact = pip ? pipCompact : Boolean(state.compact);
  const q = session?.queries?.[state.index];
  $("empty").hidden = Boolean(q);
  $("panel").hidden = !q || compact;
  $("bubble").hidden = !q || !compact;
  if (!q) return;

  const p = progress(session, state);
  $("position").textContent = `Search ${p.position} of ${p.total}`;
  $("tally").textContent = `${p.opened} opened · ${p.reviewed} reviewed`;
  $("meter").style.width = `${(p.position / p.total) * 100}%`;
  $("bubbleCount").textContent = `${p.position}/${p.total}`;
  document.title = `${p.position}/${p.total} · HireRadar Research Companion`;

  const strategy = $("strategy");
  strategy.textContent = STRATEGY_LABEL[q.strategy];
  strategy.className = `badge ${q.strategy}`;
  $("category").textContent = CATEGORY[q.category] ?? q.category;
  $("label").textContent = q.label;
  $("query").textContent = q.query;
  $("query").title = q.query;

  const f = state.feedback[q.id] ?? "unreviewed";
  $("feedback").value = f;
  $("prev").disabled = busy || state.index <= 0;
  $("next").disabled = busy || state.index >= p.total - 1;
  const broader = relaxTarget(session, state.index, "broader", state.feedback);
  $("broader").disabled = busy || broader == null;
  $("broader").title = broader == null ? "No wider search left for this role" : `Opens: ${session.queries[broader].query}`;

  // After feedback, suggest the next step: wider after "No results", narrower after "Not relevant".
  const direction = f === "none" ? "broader" : f === "irrelevant" ? "narrower" : null;
  const target = direction ? relaxTarget(session, state.index, direction, state.feedback) : null;
  const box = $("suggest");
  box.hidden = target == null;
  box.className = `suggest ${f}`;
  if (target != null) {
    $("suggestText").textContent = `${direction === "broader" ? "Try broader" : "Try more focused"}: ${session.queries[target].query}`;
    $("suggestGo").dataset.direction = direction;
  }
}

// ---- actions ----------------------------------------------------------------------

async function act(msg) {
  if (busy) return;
  busy = true;
  render();
  try {
    await send(msg);
  } finally {
    busy = false;
    await refresh();
  }
}

$("prev").addEventListener("click", () => act({ type: "step", delta: -1 }));
$("next").addEventListener("click", () => act({ type: "step", delta: 1 }));
$("broader").addEventListener("click", () => act({ type: "relax", direction: "broader" }));
$("suggestGo").addEventListener("click", (e) => act({ type: "relax", direction: e.currentTarget.dataset.direction }));
$("reopen").addEventListener("click", () => act({ type: "reopen" }));
$("feedback").addEventListener("change", (e) => act({ type: "feedback", status: e.target.value }));

$("minimize").addEventListener("click", () => setCompact(true));
$("bubble").addEventListener("click", () => setCompact(false));
$("close").addEventListener("click", () => {
  if (pip) pip.close();
  send({ type: "close" });
});

async function setCompact(compact) {
  if (pip) {
    // In Keep-on-top mode the browser owns the window; resize it ourselves.
    if (compact) pipExpanded = { width: pip.innerWidth, height: pip.innerHeight };
    pipCompact = compact;
    try {
      const size = compact ? SIZE.compact : pipExpanded ?? SIZE.default;
      pip.resizeTo(size.width, size.height);
    } catch {
      /* resizing needs a user gesture; the layout still switches */
    }
    render();
    return;
  }
  await send({ type: "compact", compact });
  await refresh();
}

// Keyboard shortcuts work only inside the companion window, never on LinkedIn.
function onKey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    if (!$("next").disabled) $("next").click();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (!$("prev").disabled) $("prev").click();
  }
}
document.addEventListener("keydown", onKey);

// ---- Keep on top (Document Picture-in-Picture) ---------------------------------------

if ("documentPictureInPicture" in window) {
  const pin = $("pin");
  pin.hidden = false;
  pin.setAttribute("aria-pressed", "false");
  pin.addEventListener("click", async () => {
    if (pip) {
      pip.close();
      return;
    }
    try {
      pip = await documentPictureInPicture.requestWindow({ width: innerWidth, height: innerHeight });
    } catch {
      pip = null;
      return;
    }
    const link = pip.document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("src/companion.css");
    pip.document.head.append(link);
    pip.document.title = "HireRadar";
    pip.document.body.append($("app"));
    pip.document.addEventListener("keydown", onKey);
    pin.setAttribute("aria-pressed", "true");
    pin.title = pin.ariaLabel = "Stop keeping on top";
    pipCompact = false;
    render();
    // The floating window takes over. Shrink this window rather than minimizing it:
    // browsers close a picture-in-picture window when its opener is minimized.
    $("docked").hidden = false;
    send({ type: "compact", compact: true });

    pip.addEventListener("pagehide", () => {
      document.body.append($("app"));
      pip = null;
      pin.setAttribute("aria-pressed", "false");
      pin.title = pin.ariaLabel = "Keep on top of other windows";
      $("docked").hidden = true;
      send({ type: "compact", compact: false });
      render();
    });
  });
}

$("dock").addEventListener("click", () => pip?.close());

// ---- lifecycle ----------------------------------------------------------------------

function reportScreen() {
  // The service worker has no screen; tell it what is visible so it can keep the window on screen.
  const s = window.screen;
  send({ type: "screen", left: s.availLeft ?? 0, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.session || changes.state)) refresh();
});
window.addEventListener("resize", reportScreen);
reportScreen();
refresh();
