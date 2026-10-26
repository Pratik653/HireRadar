import { Copy, ExternalLink as LinkIcon, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { buildResearchLinks } from "../lib/linkedin";
import type { Days, LocationSelection } from "../lib/types";
import { ExternalLink } from "./ui";

interface Props {
  titles: string[];
  locations: LocationSelection[];
  days: Days;
  onImport: () => void;
}

export function ResearchPanel({ titles, locations, days, onImport }: Props) {
  const links = buildResearchLinks(titles, locations, days);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <div className="space-y-1">
          <p>
            <strong>LinkedIn research mode.</strong> HireRadar does not log in to LinkedIn, scrape it or store LinkedIn
            credentials. These links open LinkedIn's own search in your browser, under your account.
          </p>
          <p>
            When you find a relevant post, copy its text and link into{" "}
            <button type="button" onClick={onImport} className="font-medium underline">
              Import posts
            </button>{" "}
            to score, deduplicate and export it with everything else.
          </p>
        </div>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-slate-500">Add at least one job title to generate searches.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {links.map((link) => (
            <li key={link.url} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{link.label}</p>
                <p className="truncate font-mono text-xs text-slate-500" title={link.query}>
                  {link.query}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => copy(link.query)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Copy size={13} /> {copied === link.query ? "Copied" : "Copy query"}
                </button>
                <ExternalLink
                  href={link.url}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-white ${link.kind === "linkedin" ? "bg-[#0a66c2] hover:bg-[#084e96]" : "bg-slate-700 hover:bg-slate-800"}`}
                >
                  {link.kind === "linkedin" ? "Open on LinkedIn" : "Open web search"} <LinkIcon size={13} />
                </ExternalLink>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        LinkedIn's post search offers only 24-hour, week and month filters, so the window is rounded up. Respect
        LinkedIn's User Agreement: browse normally and copy only what you need.
      </p>
    </div>
  );
}
