import { RotateCcw, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <div className="flex items-center gap-1.5">
          {hint && <span className="text-xs text-slate-400">{hint}</span>}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Small icon button that clears or restores one field. "clear" shows an ×,
 * "restore" a counter-clockwise arrow. Disabled when there is nothing to reset,
 * so it never shifts the layout by appearing and disappearing.
 */
export function ResetButton({
  onClick,
  disabled,
  label,
  variant = "clear",
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  variant?: "clear" | "restore";
  className?: string;
}) {
  const Icon = variant === "clear" ? X : RotateCcw;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 ${className}`}
    >
      <Icon size={15} aria-hidden />
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        active
          ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
          : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"
      }`}
    >
      {children}
    </button>
  );
}

export function TagInput({
  values,
  onChange,
  placeholder,
  max = 30,
  label,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  max?: number;
  label: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim().slice(0, 120))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const part of parts) {
      if (!next.some((v) => v.toLowerCase() === part.toLowerCase()) && next.length < max) next.push(part);
    }
    onChange(next);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-sm text-indigo-800">
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-indigo-400 hover:text-indigo-700"
          >
            <X size={13} />
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => commit(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[,\n]/.test(text)) {
            e.preventDefault();
            commit(text);
          }
        }}
        placeholder={values.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-slate-400"
      />
    </div>
  );
}

export function Badge({ tone, children, title }: { tone: string; children: ReactNode; title?: string }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    blue: "bg-sky-50 text-sky-800 ring-sky-200",
    indigo: "bg-indigo-50 text-indigo-800 ring-indigo-200",
    violet: "bg-violet-50 text-violet-800 ring-violet-200",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    red: "bg-rose-50 text-rose-800 ring-rose-200",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  );
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
    </a>
  );
}
