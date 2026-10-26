import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, ApiError, ping } from "./api";

export type BackendStatus = "not_configured" | "unknown" | "waking" | "awake" | "unreachable";

const SLOW_AFTER_MS = 2500;
const WOKE_FLAG = "hireradar:woke-shown";

function wokeShown(): boolean {
  try {
    return sessionStorage.getItem(WOKE_FLAG) === "1";
  } catch {
    return false;
  }
}

/**
 * Tracks whether the free-tier backend is asleep, waking or awake. Any answer
 * from the backend, including a validation error, proves it is awake; only
 * network failures, timeouts and proxy 502/503/504 count as "not awake yet".
 */
export function useBackend() {
  const [status, setStatus] = useState<BackendStatus>(API_URL ? "unknown" : "not_configured");
  const [justWoke, setJustWoke] = useState(false);
  const statusRef = useRef(status);
  const sawSlow = useRef(false);
  statusRef.current = status;

  const markAwake = useCallback(() => {
    if (statusRef.current === "awake") return;
    setStatus("awake");
    if (sawSlow.current && !wokeShown()) {
      setJustWoke(true);
      try {
        sessionStorage.setItem(WOKE_FLAG, "1");
      } catch {
        /* ignore */
      }
      setTimeout(() => setJustWoke(false), 5000);
    }
  }, []);

  const track = useCallback(
    async <T,>(call: () => Promise<T>): Promise<T> => {
      const slow = setTimeout(() => {
        if (statusRef.current !== "awake") {
          sawSlow.current = true;
          setStatus("waking");
        }
      }, SLOW_AFTER_MS);
      try {
        const result = await call();
        markAwake();
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.kind === "api") markAwake();
        else if (error instanceof ApiError && error.kind === "unreachable") setStatus("unreachable");
        throw error;
      } finally {
        clearTimeout(slow);
      }
    },
    [markAwake],
  );

  const wake = useCallback(() => {
    if (!API_URL) return;
    setStatus((s) => (s === "unreachable" ? "unknown" : s));
    track(ping).catch(() => undefined);
  }, [track]);

  useEffect(() => {
    wake(); // start the cold start as soon as the page opens
  }, [wake]);

  return { status, justWoke, track, wake };
}
