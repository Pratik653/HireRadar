import type { SearchRequest, SearchResponse, Tracked } from "./types";

export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/**
 * "unreachable" covers what a sleeping Render free instance looks like from the
 * browser: network failures, timeouts and the proxy's 502/503/504 while the
 * container boots. "api" is a real answer from our backend (validation, rate
 * limit, server error) and is shown as-is, never as a wake-up delay.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "unreachable" | "api" | "not_configured",
    readonly status?: number,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

const WAKING_STATUSES = new Set([502, 503, 504]);

export function classifyHttpFailure(status: number): ApiError["kind"] {
  return WAKING_STATUSES.has(status) ? "unreachable" : "api";
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 75_000): Promise<Response> {
  if (!API_URL) throw new ApiError("The backend URL is not configured for this build.", "not_configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError("Could not reach the backend.", "unreachable");
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return response;

  const kind = classifyHttpFailure(response.status);
  let message = `Request failed (HTTP ${response.status}).`;
  let details: { field: string; message: string }[] | undefined;
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") message = body.detail;
    if (Array.isArray(body?.errors)) details = body.errors;
  } catch {
    /* non-JSON body, keep the generic message */
  }
  throw new ApiError(message, kind, response.status, details);
}

export async function ping(): Promise<void> {
  await request("/health", {}, 75_000);
}

export async function search(body: SearchRequest): Promise<SearchResponse> {
  const response = await request("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function exportXlsx(response: SearchResponse, tracking: Record<string, Tracked>): Promise<Blob> {
  const ids = new Set(response.results.map((r) => r.id));
  const relevant = Object.fromEntries(Object.entries(tracking).filter(([id]) => ids.has(id)));
  const res = await request("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response, tracking: relevant }),
  });
  return res.blob();
}
