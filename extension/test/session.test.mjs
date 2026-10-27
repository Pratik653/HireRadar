// Run with: node --test extension/test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SESSION_TTL_MS,
  SIZE,
  clampBounds,
  isResearchUrl,
  progress,
  relaxTarget,
  validateExternalMessage,
  validateSession,
} from "../src/session.js";

const NOW = Date.UTC(2026, 9, 27, 12);
const url = (q) => `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}&sortBy=%22date_posted%22`;
const query = (id, strategy, extra = {}) => {
  const text = `hiring "Operations Specialist" ${id}`;
  return { id, strategy, category: "direct", label: `Operations Specialist · ${id}`, subject: "Business Operations Specialist", query: text, url: url(text), broader: [], narrower: [], ...extra };
};
const session = (over = {}) => ({
  v: 1,
  configKey: "abc123",
  createdAt: NOW - 1000,
  posted: "past-week",
  queries: [query("f1", "focused", { broader: ["b1"] }), query("b1", "balanced", { broader: ["r1"], narrower: ["f1"] }), query("r1", "broad", { narrower: ["b1"] })],
  ...over,
});

test("accepts a well-formed session and keeps only known fields", () => {
  const raw = session({ extra: "ignored" });
  raw.queries[0].secret = "dropped";
  const r = validateSession(raw, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.session.queries.length, 3);
  assert.equal("secret" in r.session.queries[0], false);
  assert.equal("extra" in r.session, false);
});

test("rejects malformed, foreign or oversized sessions", () => {
  const bad = [
    null,
    session({ v: 2 }),
    session({ configKey: "../x" }),
    session({ createdAt: NOW - SESSION_TTL_MS - 1 }),
    session({ queries: [] }),
    session({ queries: Array.from({ length: 101 }, (_, i) => query(`q${i}`, "broad")) }),
    session({ queries: [query("f1", "focused"), query("f1", "broad")] }),
    session({ queries: [query("x1", "sideways")] }),
    session({ queries: [{ ...query("x1", "focused"), url: "https://evil.example/search/results/content/?keywords=x" }] }),
    session({ queries: [{ ...query("x1", "focused"), url: "javascript:alert(1)" }] }),
    session({ queries: [{ ...query("x1", "focused"), url: url("something else") }] }),
    session({ queries: [{ ...query("x1", "focused"), url: "http://www.linkedin.com/search/results/content/?keywords=x" }] }),
  ];
  for (const raw of bad) assert.equal(validateSession(raw, NOW).ok, false, JSON.stringify(raw)?.slice(0, 80));
});

test("only LinkedIn post-search URLs for the exact query are allowed", () => {
  assert.equal(isResearchUrl(url("a b"), "a b"), true);
  assert.equal(isResearchUrl("https://www.linkedin.com/in/someone", "a"), false);
  assert.equal(isResearchUrl("https://user:pw@www.linkedin.com/search/results/content/?keywords=a", "a"), false);
});

test("drops relaxation links and feedback that point outside the session", () => {
  const raw = session({ feedback: { b1: "none", zz: "relevant", f1: "bogus" } });
  raw.queries[0].broader = ["b1", "zz"];
  const r = validateSession(raw, NOW);
  assert.deepEqual(r.session.queries[0].broader, ["b1"]);
  assert.deepEqual(r.feedback, { b1: "none" });
});

test("accepts only the four documented message shapes", () => {
  assert.equal(validateExternalMessage({ type: "hireradar/ping", v: 1 }), true);
  assert.equal(validateExternalMessage({ type: "hireradar/state", v: 1, configKey: "abc123" }), true);
  assert.equal(validateExternalMessage({ type: "hireradar/start", v: 1, session: {} }), true);
  assert.equal(validateExternalMessage({ type: "hireradar/open", v: 1 }), true);
  assert.equal(validateExternalMessage({ type: "hireradar/ping", v: 1, extra: 1 }), false);
  assert.equal(validateExternalMessage({ type: "hireradar/ping", v: 2 }), false);
  assert.equal(validateExternalMessage({ type: "hireradar/eval", v: 1 }), false);
  assert.equal(validateExternalMessage("hireradar/ping"), false);
});

test("relaxation skips searches the user already reviewed", () => {
  const s = validateSession(session(), NOW).session;
  assert.equal(relaxTarget(s, 0, "broader", {}), 1);
  assert.equal(relaxTarget(s, 1, "broader", {}), 2);
  assert.equal(relaxTarget(s, 1, "narrower", {}), 0);
  assert.equal(relaxTarget(s, 0, "broader", { b1: "none" }), null);
  assert.equal(relaxTarget(s, 2, "broader", {}), null);
});

test("window bounds stay on screen and within limits", () => {
  const screen = { left: 0, top: 0, width: 1366, height: 728 };
  assert.deepEqual(clampBounds({ left: 2000, top: -50, width: 380, height: 540 }, screen), { left: 986, top: 0, width: 380, height: 540 });
  assert.deepEqual(clampBounds({ left: 10, top: 10, width: 100, height: 100 }, screen), { left: 10, top: 10, width: SIZE.min.width, height: SIZE.min.height });
  assert.deepEqual(clampBounds({ left: 0, top: 0, width: 5000, height: 5000 }, screen), { left: 0, top: 0, width: SIZE.max.width, height: 728 });
  // A screen smaller than the minimum still keeps the window fully visible.
  assert.deepEqual(clampBounds({ left: 0, top: 0, width: 380, height: 540 }, { left: 0, top: 0, width: 300, height: 400 }), { left: 0, top: 0, width: 300, height: 400 });
  // Second monitor to the left (negative coordinates).
  assert.deepEqual(clampBounds({ left: -1900, top: 100, width: 380, height: 540 }, { left: -1920, top: 0, width: 1920, height: 1040 }), { left: -1900, top: 100, width: 380, height: 540 });
});

test("progress counts only what the user did", () => {
  const s = validateSession(session(), NOW).session;
  assert.deepEqual(progress(s, { index: 1, opened: ["f1", "b1", "gone"], feedback: { f1: "none", b1: "unreviewed" } }), {
    total: 3, opened: 2, reviewed: 1, position: 2,
  });
});

test("manifest keeps the permission boundary", async () => {
  const { checkManifest } = await import("../scripts/manifest-check.mjs");
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.deepEqual(manifest.externally_connectable.matches, ["https://pratik653.github.io/*"]);
  assert.deepEqual(checkManifest(manifest), []);
  assert.notDeepEqual(checkManifest({ ...manifest, host_permissions: ["https://www.linkedin.com/*"] }), []);
  assert.notDeepEqual(checkManifest({ ...manifest, permissions: ["storage", "tabs"] }), []);
  assert.notDeepEqual(checkManifest({ ...manifest, content_scripts: [{ matches: ["https://www.linkedin.com/*"], js: ["x.js"] }] }), []);
});
