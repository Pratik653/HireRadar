// End-to-end check of the companion in real Chrome (not run in CI).
//
//   1. cd frontend && npm run dev                       (HireRadar on http://localhost:5173)
//   2. cd extension && node scripts/build.mjs --dev
//   3. node test/e2e.mjs
//
// Chrome is started headless with a DevTools pipe and the dev build is loaded with
// Extensions.loadUnpacked. www.linkedin.com resolves to an unused local address, so
// the test never contacts LinkedIn; it checks the exact URL the research tab was sent to.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const APP = "http://localhost:5173/";
const EXT = new URL("../dist/hireradar-companion-1.0.0-dev/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ID = "gcboglbpfkdbfdmapiggnplpbeljhonn";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(["pass", name]);
  } catch (e) {
    results.push(["FAIL", `${name}: ${e.message}`]);
  }
};

// ---- Chrome over a DevTools pipe ---------------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), "hr-e2e-"));
const proc = spawn(CHROME, [
  "--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--screen-info={1600x900}",
  "--host-resolver-rules=MAP www.linkedin.com 127.0.0.1:9", "about:blank",
], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
const [, , , toChrome, fromChrome] = proc.stdio;
let seq = 0;
const pending = new Map();
const events = [];
let buffer = "";
fromChrome.on("data", (chunk) => {
  buffer += chunk.toString();
  let i;
  while ((i = buffer.indexOf("\0")) >= 0) {
    const msg = JSON.parse(buffer.slice(0, i));
    buffer = buffer.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else events.push(msg);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    pending.set(++seq, { resolve, reject });
    toChrome.write(JSON.stringify({ id: seq, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });

async function attach(targetId) {
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  return {
    sessionId,
    eval: async (expression) => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
  };
}
const targets = async () => (await send("Target.getTargets")).targetInfos;
const waitFor = async (pred, label, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const t = (await targets()).find(pred);
    if (t) return t;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const until = async (page, expr, label, timeout = 6000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await page.eval(expr).catch(() => false)) return;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const linkedinTabs = async () => (await targets()).filter((t) => t.type === "page" && t.url.includes("linkedin.com"));
const keywordsOf = (url) => new URL(url).searchParams.get("keywords");
const bounds = async (targetId) => (await send("Browser.getWindowForTarget", { targetId })).bounds;

const SEED = JSON.stringify({
  titles: ["Business Operations Specialist"], skills: [], description: "", resume_text: "", exclusions: [], seniority: [],
  locations: [{ country_code: "AE", city: "Sharjah" }, { country_code: "AE", city: "Dubai" }, { country_code: "AE" }],
  work_modes: ["onsite", "hybrid", "remote"], days: 7, include_undated: true, sources: ["manual_import"], company_boards: [], min_score: 0,
});

async function openApp() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const page = await attach(targetId);
  await send("Page.enable", {}, page.sessionId);
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("hireradar:form", ${JSON.stringify(SEED)});` }, page.sessionId);
  await send("Page.navigate", { url: APP }, page.sessionId);
  await until(page, `!!document.querySelector("nav")`, "HireRadar to load");
  await page.eval(`[...document.querySelectorAll("nav button")].find(b => b.innerText.includes("LinkedIn research")).click(); true`);
  return { page, targetId };
}

try {
  // ---- 1. Without the extension: graceful fallback -------------------------------------------
  {
    const { page, targetId } = await openApp();
    await until(page, `document.body.innerText.includes("not installed")`, "missing-extension status");
    await page.eval(`[...document.querySelectorAll("button")].find(b => b.innerText.includes("Enable Research Companion")).click(); true`);
    const guide = await page.eval(`document.body.innerText.includes("Load unpacked") && !!document.querySelector('a[href*="releases/download/companion-v1.0.0"]')`);
    const openLinks = await page.eval(`document.querySelectorAll('[aria-label="Generated searches"] a[href*="linkedin.com"]').length`);
    check("without extension: status, install guide and normal Open on LinkedIn links", () => {
      assert.equal(guide, true);
      assert.ok(openLinks > 0);
    });
    await send("Target.closeTarget", { targetId });
  }

  // ---- 2. Load the extension ------------------------------------------------------------------
  const { id } = await send("Extensions.loadUnpacked", { path: EXT });
  check("extension loads with the pinned ID", () => assert.equal(id, ID));

  const { page: app, targetId: appTarget } = await openApp();
  await until(app, `document.body.innerText.includes("Connected (v1.0.0)")`, "connected status");
  check("HireRadar detects the companion", () => {});

  // ---- 3. Rejected messages -------------------------------------------------------------------
  const rejected = await app.eval(`(async () => {
    const ask = (msg) => new Promise((r) => chrome.runtime.sendMessage("${ID}", msg, (x) => r(x)));
    const good = (await ask({ type: "hireradar/ping", v: 1 })).ok;
    const unknown = (await ask({ type: "hireradar/eval", v: 1 })).ok;
    const extra = (await ask({ type: "hireradar/ping", v: 1, x: 1 })).ok;
    const badUrl = await ask({ type: "hireradar/start", v: 1, session: { v: 1, configKey: "abc123", createdAt: Date.now(), posted: "past-week",
      queries: [{ id: "a1", strategy: "focused", category: "direct", label: "x", subject: "x", query: "x",
                  url: "https://evil.example/search/results/content/?keywords=x", broader: [], narrower: [] }] } });
    const expired = await ask({ type: "hireradar/start", v: 1, session: { v: 1, configKey: "abc123", createdAt: Date.now() - 40 * 864e5, posted: "past-week", queries: [] } });
    return { good, unknown, extra, badUrl, expired };
  })()`);
  check("only valid messages are accepted", () => {
    assert.equal(rejected.good, true);
    assert.equal(rejected.unknown, false);
    assert.equal(rejected.extra, false);
    assert.equal(rejected.badUrl.ok, false);
    assert.equal(rejected.expired.ok, false);
  });
  const tabsAfterRejected = (await linkedinTabs()).length;
  check("rejected messages open no LinkedIn tab", () => assert.equal(tabsAfterRejected, 0));

  // ---- 4. Start: companion window + one research tab -------------------------------------------
  const plan = await app.eval(`[...document.querySelectorAll('[aria-label="Generated searches"] li p.font-mono')].map(p => p.innerText)`);
  await app.eval(`[...document.querySelectorAll("button")].find(b => b.innerText.includes("Start companion")).click(); true`);
  const companionT = await waitFor((t) => t.url.startsWith(`chrome-extension://${ID}/src/companion.html`), "companion window");
  const companion = await attach(companionT.targetId);
  await until(companion, `!document.getElementById("panel").hidden`, "companion panel");
  const firstTab = await waitFor((t) => t.type === "page" && t.url.includes("linkedin.com"), "research tab");
  const info = await companion.eval(`({ pos: document.getElementById("position").textContent, label: document.getElementById("label").textContent,
    strategy: document.getElementById("strategy").textContent, query: document.getElementById("query").textContent,
    prevDisabled: document.getElementById("prev").disabled })`);
  check("starts at the first prioritized search in one research tab", () => {
    assert.match(info.pos, /^Search 1 of \d+$/);
    assert.equal(info.strategy, "Balanced");
    assert.equal(info.query, plan[0]);
    assert.equal(keywordsOf(firstTab.url), plan[0]);
    assert.equal(info.prevDisabled, true);
  });

  // ---- 5. Next / Previous reuse the same tab; double clicks move once ----------------------------
  await companion.eval(`document.getElementById("next").click(); document.getElementById("next").click(); true`);
  await until(companion, `document.getElementById("position").textContent.startsWith("Search 2 ")`, "position 2");
  await sleep(500);
  let tabs = await linkedinTabs();
  const pos2 = await companion.eval(`document.getElementById("position").textContent`);
  check("Next navigates the existing tab; a double click moves once", () => {
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].targetId, firstTab.targetId);
    assert.equal(keywordsOf(tabs[0].url), plan[1]);
    assert.match(pos2, /^Search 2 /);
  });
  await sleep(700);
  await companion.eval(`document.getElementById("prev").click(); true`);
  await until(companion, `document.getElementById("position").textContent.startsWith("Search 1 ")`, "back to 1");
  await sleep(300);
  tabs = await linkedinTabs();
  check("Previous navigates back in the same tab", () => {
    assert.equal(tabs.length, 1);
    assert.equal(keywordsOf(tabs[0].url), plan[0]);
  });

  // ---- 6. Feedback and relaxation -------------------------------------------------------------
  await sleep(700);
  await companion.eval(`{ const s = document.getElementById("feedback"); s.value = "none"; s.dispatchEvent(new Event("change")); } true`);
  await until(companion, `!document.getElementById("suggest").hidden`, "broader suggestion");
  const suggestion = await companion.eval(`document.getElementById("suggestText").textContent`);
  await companion.eval(`document.getElementById("suggestGo").click(); true`);
  await until(companion, `document.getElementById("strategy").textContent !== "Balanced" || !document.getElementById("position").textContent.startsWith("Search 1 ")`, "relaxed search");
  await sleep(300);
  const relaxed = await companion.eval(`({ strategy: document.getElementById("strategy").textContent, query: document.getElementById("query").textContent })`);
  tabs = await linkedinTabs();
  check("No results offers a broader search that opens in the same tab", () => {
    assert.match(suggestion, /^Try broader: /);
    assert.equal(suggestion.replace("Try broader: ", ""), relaxed.query);
    assert.equal(relaxed.strategy, "Broad");
    assert.equal(tabs.length, 1);
    assert.equal(keywordsOf(tabs[0].url), relaxed.query);
  });
  await sleep(700);
  await companion.eval(`{ const s = document.getElementById("feedback"); s.value = "irrelevant"; s.dispatchEvent(new Event("change")); } true`);
  await until(companion, `document.getElementById("suggestText").textContent.startsWith("Try more focused")`, "focused suggestion");
  check("Results not relevant offers a more focused search", () => {});

  // ---- 7. Sync back to HireRadar ----------------------------------------------------------------
  await send("Target.activateTarget", { targetId: appTarget }); // the user switches back to HireRadar
  await app.eval(`window.dispatchEvent(new Event("focus")); true`);
  await until(app, `/2 reviewed/.test(document.body.innerText)`, "HireRadar to show companion feedback");
  check("feedback recorded in the companion appears in HireRadar", () => {});

  // ---- 8. Window: minimize to bubble and restore --------------------------------------------------
  const before = await bounds(companionT.targetId);
  await companion.eval(`document.getElementById("minimize").click(); true`);
  await until(companion, `!document.getElementById("bubble").hidden`, "bubble");
  await sleep(400);
  const small = await bounds(companionT.targetId);
  const bubbleText = await companion.eval(`document.getElementById("bubbleCount").textContent`);
  await companion.eval(`document.getElementById("bubble").click(); true`);
  await until(companion, `!document.getElementById("panel").hidden`, "panel restored");
  await sleep(500);
  const restored = await bounds(companionT.targetId);
  check("minimize shrinks to a bubble at the same corner and restores size and position", () => {
    assert.ok(small.width < before.width && small.height < before.height, JSON.stringify({ before, small }));
    assert.ok(Math.abs(small.left + small.width - (before.left + before.width)) <= 2, "bubble keeps the right edge (±2 px rounding)");
    assert.match(bubbleText, /^\d+\/\d+$/);
    assert.deepEqual([restored.left, restored.top, restored.width, restored.height], [before.left, before.top, before.width, before.height]);
  });

  // ---- 9. Resize limits and staying on screen ------------------------------------------------------
  const { windowId } = await send("Browser.getWindowForTarget", { targetId: companionT.targetId });
  await send("Browser.setWindowBounds", { windowId, bounds: { width: 150, height: 150 } });
  await sleep(900);
  const tooSmall = await bounds(companionT.targetId);
  await send("Browser.setWindowBounds", { windowId, bounds: { left: 1500, top: 850, width: 500, height: 600 } });
  await sleep(900);
  const offscreen = await bounds(companionT.targetId);
  await send("Browser.setWindowBounds", { windowId, bounds: { left: 200, top: 120, width: 420, height: 600 } });
  await sleep(900);
  const chosen = await bounds(companionT.targetId);
  check("resizing is clamped to the minimum size and the window is kept on screen", () => {
    assert.ok(tooSmall.width >= 320 && tooSmall.height >= 420, JSON.stringify(tooSmall));
    assert.ok(offscreen.left + offscreen.width <= 1600 && offscreen.top + offscreen.height <= 900, JSON.stringify(offscreen));
    assert.deepEqual([chosen.left, chosen.top, chosen.width, chosen.height], [200, 120, 420, 600]);
  });

  // ---- 10. Close, reopen, reload ---------------------------------------------------------------------
  const posBeforeClose = await companion.eval(`document.getElementById("position").textContent`);
  await companion.eval(`document.getElementById("close").click(); true`).catch(() => {});
  await sleep(800);
  const gone = !(await targets()).some((t) => t.url.startsWith(`chrome-extension://${ID}/src/companion.html`));
  await app.eval(`[...document.querySelectorAll("button")].find(b => b.innerText === "Show companion").click(); true`);
  const reopenedT = await waitFor((t) => t.url.startsWith(`chrome-extension://${ID}/src/companion.html`), "reopened companion");
  const reopened = await attach(reopenedT.targetId);
  await until(reopened, `!document.getElementById("panel").hidden`, "reopened panel");
  const reopenedInfo = await reopened.eval(`({ pos: document.getElementById("position").textContent, fb: document.getElementById("feedback").value })`);
  const reopenedBounds = await bounds(reopenedT.targetId);
  await send("Page.enable", {}, reopened.sessionId);
  await send("Page.reload", {}, reopened.sessionId);
  await sleep(1200);
  const afterReload = await reopened.eval(`document.getElementById("position").textContent`);
  check("close keeps progress; reopen restores position, feedback and window bounds; reload keeps state", () => {
    assert.equal(gone, true);
    assert.equal(reopenedInfo.pos, posBeforeClose);
    assert.equal(reopenedInfo.fb, "irrelevant");
    assert.deepEqual([reopenedBounds.left, reopenedBounds.top, reopenedBounds.width, reopenedBounds.height], [200, 120, 420, 600]);
    assert.equal(afterReload, posBeforeClose);
  });

  // ---- 11. Research tab closed by the user: next search opens a new one ------------------------------
  await send("Target.closeTarget", { targetId: (await linkedinTabs())[0].targetId });
  await sleep(500);
  await reopened.eval(`document.getElementById("next").click(); true`);
  await sleep(900);
  tabs = await linkedinTabs();
  check("if the research tab was closed, Next opens exactly one new tab", () => assert.equal(tabs.length, 1));

  // ---- 12. Keep on top availability --------------------------------------------------------------------
  const pin = await reopened.eval(`({ api: "documentPictureInPicture" in window, visible: !document.getElementById("pin").hidden })`);
  check("Keep on top is offered exactly when the browser supports it", () => assert.equal(pin.visible, pin.api));
  results.push(["info", `documentPictureInPicture available in this browser: ${pin.api}`]);
  if (pin.api) {
    const direct = await reopened.eval(`(async () => { try { const w = await documentPictureInPicture.requestWindow({ width: 10, height: 10 }); w.close(); return "ok"; } catch (e) { return e.name + ": " + e.message; } })()`);
    results.push(["info", `requestWindow from the companion window: ${direct}`]);
    await sleep(500);
    const early = await reopened.eval(`(async () => { document.getElementById("pin").click(); await new Promise(r => setTimeout(r, 150)); return !!documentPictureInPicture.window; })()`);
    results.push(["info", `floating window open 150 ms after click: ${early}`]);
    await sleep(1200);
    const floating = await reopened.eval(`({ moved: !document.getElementById("app"), pip: !!documentPictureInPicture.window,
      pressed: documentPictureInPicture.window?.document.getElementById("pin")?.getAttribute("aria-pressed") })`);
    results.push(["info", `floating state after 1.2 s: ${JSON.stringify(floating)}`]);
    await reopened.eval(`documentPictureInPicture.window?.close(); true`);
    await sleep(800);
    await sleep(1200);
    const backInfo = await reopened.eval(`({ app: !!document.getElementById("app"), panelHidden: document.getElementById("panel")?.hidden, bubbleHidden: document.getElementById("bubble")?.hidden, docked: !document.getElementById("docked").hidden, w: innerWidth })`);
    results.push(["info", `after closing the floating window: ${JSON.stringify(backInfo)}`]);
    const back = backInfo.app && !backInfo.panelHidden;
    check("Keep on top moves the companion into a floating window and back", () => {
      assert.equal(floating.pip, true);
      assert.equal(floating.moved, true);
      assert.equal(floating.pressed, "true");
      assert.equal(back, true);
    });
  }

  // ---- 13. Other origins cannot reach the extension --------------------------------------------------------
  const { targetId: otherT } = await send("Target.createTarget", { url: "http://127.0.0.1:5173/" });
  const other = await attach(otherT);
  await sleep(1500);
  const reachable = await other.eval(`typeof chrome !== "undefined" && !!chrome.runtime && typeof chrome.runtime.sendMessage === "function"`);
  check("a page on another origin has no messaging channel to the extension", () => assert.equal(reachable, false));
  void appTarget;
} catch (e) {
  results.push(["FAIL", `aborted: ${e.message}`]);
} finally {
  for (const [status, name] of results) console.log(`${status.padEnd(4)} ${name}`);
  const failed = results.filter(([s]) => s === "FAIL").length;
  console.log(`\n${results.filter(([s]) => s === "pass").length} passed, ${failed} failed`);
  proc.kill();
  process.exitCode = failed ? 1 : 0;
}
