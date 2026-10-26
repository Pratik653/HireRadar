import { useEffect, useState } from "react";

// Everything personal (preferences, resume text, imports, application status)
// lives in this browser only. Storage can be unavailable (private mode), so
// every access is guarded and the app works without it.

const PREFIX = "hireradar:";

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage disabled */
  }
}

export function clearStored(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function useStoredState<T>(key: string, fallback: T, repair?: (stored: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    const stored = readStored<unknown>(key, fallback);
    return repair ? repair(stored) : (stored as T);
  });
  useEffect(() => writeStored(key, value), [key, value]);
  return [value, setValue] as const;
}
