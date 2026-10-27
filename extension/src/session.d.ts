// Types for session.js, used by HireRadar's contract tests.
export const PROTOCOL: 1;
export const MAX_QUERIES: number;
export const SESSION_TTL_MS: number;
export function isResearchUrl(url: string, query: string): boolean;
export function validateSession(
  raw: unknown,
  now?: number,
): { ok: true; session: { queries: unknown[] }; feedback: Record<string, string>; startIndex: number } | { ok: false; error: string };
export function validateExternalMessage(msg: unknown): boolean;
