import { afterEach, describe, expect, it, vi } from "vitest";
// The extension's own validator: HireRadar's session must pass it unchanged.
import { validateExternalMessage, validateSession } from "../../../extension/src/session.js";
import {
  browserSupportsCompanion,
  buildCompanionSession,
  detectCompanion,
  fetchCompanionState,
  startCompanion,
} from "./companion";
import { buildResearchPlan, rankWithFeedback, type Feedback } from "./linkedin";

const plan = buildResearchPlan({
  titles: ["Business Operations Specialist", "LLM Engineer"],
  skills: ["Python"],
  locations: [{ country_code: "AE", city: "Sharjah" }, { country_code: "AE", city: "Dubai" }],
  days: 7,
});

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.useRealTimers();
});

function fakeChrome(handler: (id: string, msg: Record<string, unknown>) => unknown) {
  const sent: unknown[] = [];
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      sendMessage: (id: string, msg: Record<string, unknown>, reply: (r: unknown) => void) => {
        sent.push(msg);
        setTimeout(() => reply(handler(id, msg)), 0);
      },
    },
  };
  return sent;
}

describe("without the extension", () => {
  it("resolves to null and never throws", async () => {
    expect(await detectCompanion()).toBeNull();
    expect(await fetchCompanionState("x", "abc")).toBeNull();
    expect((await startCompanion("x", buildCompanionSession(plan, {}, "abc", "past-week"))).ok).toBe(false);
  });

  it("times out instead of hanging when the extension does not answer", async () => {
    vi.useFakeTimers();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage: () => {} } };
    const pending = detectCompanion();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBeNull();
  });

  it("supports desktop Chromium only", () => {
    expect(browserSupportsCompanion("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/155.0 Safari/537.36")).toBe(true);
    expect(browserSupportsCompanion("Mozilla/5.0 (Windows NT 10.0) Chrome/155.0 Safari/537.36 Edg/156.0")).toBe(true);
    expect(browserSupportsCompanion("Mozilla/5.0 (Windows NT 10.0; rv:140.0) Gecko/20100101 Firefox/140.0")).toBe(false);
    expect(browserSupportsCompanion("Mozilla/5.0 (Linux; Android 14) Chrome/155.0 Mobile Safari/537.36")).toBe(false);
  });
});

describe("session transfer", () => {
  const feedback: Record<string, Feedback> = {};
  const ranked = rankWithFeedback(plan, feedback);

  it("sends only LinkedIn searches, in priority order, that the extension accepts", () => {
    const session = buildCompanionSession(ranked, feedback, "abc123", "past-week");
    expect(session.queries.map((q) => q.id)).toEqual(ranked.filter((p) => p.engine === "linkedin").map((p) => p.id));
    const result = validateSession({ ...session }, Date.now());
    expect(result.ok).toBe(true);
    expect(Object.keys(session.queries[0]).sort()).toEqual(["broader", "category", "id", "label", "narrower", "query", "strategy", "subject", "url"]);
  });

  it("carries the relaxation ladder so the companion relaxes like the web app", () => {
    const session = buildCompanionSession(ranked, feedback, "abc123", "past-week");
    const focused = session.queries.find((q) => q.strategy === "focused")!;
    const firstBroader = session.queries.find((q) => q.id === focused.broader[0])!;
    expect(firstBroader.strategy).toBe("balanced");
    expect(firstBroader.subject).toBe(focused.subject);
    const broad = session.queries.find((q) => q.strategy === "broad")!;
    expect(broad.narrower.length).toBeGreaterThan(0);
  });

  it("starts at the first unreviewed search and passes existing feedback", () => {
    const linkedin = ranked.filter((p) => p.engine === "linkedin");
    const fb: Record<string, Feedback> = { [linkedin[0].id]: "none" };
    const session = buildCompanionSession(rankWithFeedback(plan, fb), fb, "abc123", "past-week");
    expect(session.feedback).toEqual(fb);
    expect(session.queries[session.startIndex].id).not.toBe(linkedin[0].id);
  });

  it("speaks the documented protocol", async () => {
    const sent = fakeChrome((_id, msg) =>
      msg.type === "hireradar/ping" ? { ok: true, v: 1, version: "1.0.0", session: null } : { ok: true, state: { index: 2, opened: ["a"], feedback: { a: "relevant" } } },
    );
    const status = await detectCompanion();
    expect(status).toEqual({ id: "gcboglbpfkdbfdmapiggnplpbeljhonn", version: "1.0.0", session: null });
    expect(await fetchCompanionState(status!.id, "abc123")).toEqual({ index: 2, opened: ["a"], feedback: { a: "relevant" } });
    await startCompanion(status!.id, buildCompanionSession(ranked, {}, "abc123", "past-week"));
    for (const msg of sent) expect(validateExternalMessage(msg)).toBe(true);
  });

  it("ignores malformed replies", async () => {
    fakeChrome(() => "not an object");
    expect(await detectCompanion()).toBeNull();
  });
});
