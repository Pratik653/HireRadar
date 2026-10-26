import { RotateCw } from "lucide-react";
import type { BackendStatus } from "../lib/useBackend";

interface Props {
  status: BackendStatus;
  justWoke: boolean;
  busy: boolean;
  onRetry: () => void;
}

/** Friendly cold-start notice for the free-tier backend. Shown only until the
 *  backend has answered once; never claims success before a real response. */
export function WakeNotice({ status, justWoke, busy, onRetry }: Props) {
  if (justWoke) {
    return (
      <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        🚀 We're awake! Let's find your next opportunity.
      </div>
    );
  }

  if (status === "waking") {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <span className="animate-steam text-lg" aria-hidden>
          ☕
        </span>
        <span className="flex-1">Brewing some CPU power... waking up our backend!</span>
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" aria-hidden />
      </div>
    );
  }

  if (status === "unreachable") {
    return (
      <div role="alert" className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
        <p>
          <strong>We couldn't reach the backend.</strong> It may still be starting up, or the service may be
          unavailable. Your search settings are saved in this browser.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-rose-700 px-3 py-1 text-white hover:bg-rose-800 disabled:opacity-60"
        >
          <RotateCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (status === "unknown") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        <p className="font-medium text-slate-700">☕ Our backend runs on coffee and a free hosting plan!</p>
        <p className="mt-0.5">
          After 15 minutes of inactivity, our server takes a little power nap. 😴 If your first search takes a
          moment, don't worry — we're just waking it up. Thanks for your patience!
        </p>
      </div>
    );
  }

  return null;
}
