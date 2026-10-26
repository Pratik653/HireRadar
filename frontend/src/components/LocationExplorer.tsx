import { ChevronRight, Globe2, MapPin, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  CONTINENTS,
  COUNTRY_BY_CODE,
  PRESETS,
  clearWithin,
  countWithin,
  coveringSelection,
  fromKey,
  groupsOf,
  hasChildren,
  keyOf,
  label,
  searchLocations,
  selectedKeys,
  toggle,
  type Country,
  type Subdivision,
} from "../lib/locations";
import type { LocationSelection } from "../lib/types";
import { ResetButton } from "./ui";

interface Props {
  value: LocationSelection[];
  onChange: (value: LocationSelection[]) => void;
}

const CHIP_LIMIT = 8;
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function LocationExplorer({ value, onChange }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showAllChips, setShowAllChips] = useState(false);
  const keys = useMemo(() => selectedKeys(value), [value]);
  const hits = useMemo(() => searchLocations(query), [query]);

  const flip = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const state = (key: string) => {
    const covering = coveringSelection(value, key);
    const inside = countWithin(value, key) - (keys.has(key) ? 1 : 0);
    return { checked: keys.has(key) || Boolean(covering), covering, inside };
  };

  // Render helpers are plain functions, not components, so React keeps the same
  // DOM (and keyboard focus) across re-renders. Children are built only when expanded.

  /** One row of the tree: expand toggle, checkbox, name, count and clear. */
  const row = ({
    nodeKey,
    name,
    depth,
    expandId,
    icon,
    sub,
    children,
  }: {
    nodeKey: string;
    name: string;
    depth: number;
    expandId?: string;
    icon?: ReactNode;
    sub?: string;
    children?: () => ReactNode;
  }) => {
    const { checked, covering, inside } = state(nodeKey);
    const expanded = expandId ? open.has(expandId) : false;
    return (
      <li key={nodeKey}>
        <div className="flex min-h-9 items-center gap-1 pr-1 hover:bg-slate-50" style={{ paddingLeft: `${depth * 14 + 4}px` }}>
          {expandId ? (
            <button
              type="button"
              onClick={() => flip(expandId)}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
              className="inline-flex h-8 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700"
            >
              <ChevronRight size={15} className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="w-7 shrink-0" />
          )}
          <label
            className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-sm ${covering ? "text-slate-400" : "text-slate-800"}`}
            title={covering ? `Included in ${label(fromKey(covering))}` : undefined}
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-indigo-600"
              checked={checked}
              disabled={Boolean(covering)}
              ref={(el) => {
                if (el) el.indeterminate = !checked && inside > 0;
              }}
              onChange={() => onChange(toggle(value, fromKey(nodeKey)))}
            />
            {icon}
            <span className="truncate">{name}</span>
            {sub && <span className="shrink-0 text-xs text-slate-400">{sub}</span>}
            {inside > 0 && !checked && (
              <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 text-xs font-medium text-indigo-700">{inside}</span>
            )}
          </label>
          {countWithin(value, nodeKey) > 0 ? (
            <ResetButton label={`Clear selections in ${name}`} onClick={() => onChange(clearWithin(value, nodeKey))} />
          ) : (
            <span className="w-8 shrink-0" />
          )}
        </div>
        {expanded && children && <ul>{children()}</ul>}
      </li>
    );
  };

  /** A collapsible "Other countries (N)" list without its own checkbox. */
  const more = (id: string, title: string, depth: number, children: () => ReactNode) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => flip(id)}
        aria-expanded={open.has(id)}
        className="flex min-h-9 w-full items-center gap-1 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <span className="inline-flex h-8 w-7 items-center justify-center">
          <ChevronRight size={15} className={`transition-transform duration-150 ${open.has(id) ? "rotate-90" : ""}`} />
        </span>
        {title}
      </button>
      {open.has(id) && <ul>{children()}</ul>}
    </li>
  );

  const cityRows = (country: Country, cities: { name: string }[], sub: Subdivision | undefined, depth: number) =>
    cities.map((city) =>
      row({ nodeKey: keyOf({ country_code: country.code, subdivision: sub?.code, city: city.name }), name: city.name, depth }),
    );

  const countryRow = (country: Country, depth: number) => {
    const subs = [...(country.subdivisions ?? [])].sort(byName);
    const featured = subs.filter((s) => s.cities?.length);
    const rest = subs.filter((s) => !s.cities?.length);
    const noun = country.code === "CA" ? "provinces" : country.code === "DE" ? "states" : "states and territories";
    const subRow = (s: Subdivision, d: number, withCities: boolean) =>
      row({
        nodeKey: `s:${s.code}`,
        name: s.name,
        sub: s.code.split("-")[1],
        depth: d,
        expandId: withCities ? `s:${s.code}` : undefined,
        children: withCities ? () => cityRows(country, s.cities ?? [], s, d + 1) : undefined,
      });
    return row({
      nodeKey: `c:${country.code}`,
      name: country.name,
      depth,
      expandId: hasChildren(country) ? `c:${country.code}` : undefined,
      children: () =>
        subs.length > 0 ? (
          <>
            {featured.map((s) => subRow(s, depth + 1, true))}
            {rest.length > 0 &&
              more(`more:${country.code}`, `Other ${noun} (${rest.length})`, depth + 1, () =>
                rest.map((s) => subRow(s, depth + 2, false)),
              )}
          </>
        ) : (
          cityRows(country, country.cities ?? [], undefined, depth + 1)
        ),
    });
  };

  const chips = showAllChips ? value : value.slice(0, CHIP_LIMIT);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Location presets">
        {PRESETS.map((preset) => {
          const active = keys.has(keyOf(preset.sel));
          const covering = active ? undefined : coveringSelection(value, keyOf(preset.sel));
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(toggle(value, preset.sel))}
              disabled={Boolean(covering)}
              title={covering ? `Already included in ${label(fromKey(covering))}` : `${active ? "Remove" : "Add"} ${preset.label}`}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 ${
                active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-2">
        {value.length === 0 ? (
          <p className="flex items-center gap-1.5 px-1 py-0.5 text-xs text-slate-500">
            <Globe2 size={14} /> No location filter: every location is accepted.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected locations">
            {chips.map((sel) => (
              <li key={keyOf(sel)} className="inline-flex max-w-full items-center gap-1 rounded-md bg-indigo-50 py-0.5 pl-2 pr-0.5 text-xs text-indigo-900">
                {sel.region ? <Globe2 size={12} className="shrink-0" /> : <MapPin size={12} className="shrink-0" />}
                <span className="truncate">{label(sel)}</span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => keyOf(v) !== keyOf(sel)))}
                  aria-label={`Remove ${label(sel)}`}
                  title={`Remove ${label(sel)}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-indigo-400 hover:bg-indigo-100 hover:text-indigo-800"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
            {value.length > CHIP_LIMIT && (
              <li>
                <button type="button" onClick={() => setShowAllChips(!showAllChips)} className="px-1 py-0.5 text-xs font-medium text-indigo-700 hover:underline">
                  {showAllChips ? "Show fewer" : `+${value.length - CHIP_LIMIT} more`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search countries, states or cities"
          aria-label="Search locations"
          className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear location search"
            className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-slate-700"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white">
        {query.trim().length >= 2 ? (
          hits.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No locations match “{query}”.</p>
          ) : (
            <ul aria-label="Location search results">
              {hits.map((hit) => {
                const key = keyOf(hit.sel);
                const { checked, covering } = state(key);
                return (
                  <li key={key}>
                    <label
                      className={`flex min-h-10 cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 ${covering ? "text-slate-400" : ""}`}
                      title={covering ? `Included in ${label(fromKey(covering))}` : undefined}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-indigo-600"
                        checked={checked}
                        disabled={Boolean(covering)}
                        onChange={() => onChange(toggle(value, hit.sel))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-800">{hit.name}</span>
                        <span className="block truncate text-xs text-slate-500">{hit.path}</span>
                      </span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{hit.kind}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <ul aria-label="Locations by continent" className="py-1">
            {CONTINENTS.map((continent) => {
              const groups = groupsOf(continent.id);
              const grouped = new Set(groups.flatMap((g) => g.countries));
              const countries = continent.countries.map((c) => COUNTRY_BY_CODE[c]).filter((c) => !grouped.has(c.code)).sort(byName);
              const featured = countries.filter(hasChildren);
              const others = countries.filter((c) => !hasChildren(c));
              return row({
                nodeKey: `r:${continent.id}`,
                name: continent.name,
                depth: 0,
                expandId: `r:${continent.id}`,
                icon: <Globe2 size={14} className="shrink-0 text-slate-400" />,
                children: () => (
                  <>
                    {groups.map((group) =>
                      row({
                        nodeKey: `r:${group.id}`,
                        name: group.name,
                        sub: `${group.countries.length} countries`,
                        depth: 1,
                        expandId: `r:${group.id}`,
                        children: () => group.countries.map((c) => COUNTRY_BY_CODE[c]).sort(byName).map((c) => countryRow(c, 2)),
                      }),
                    )}
                    {featured.map((c) => countryRow(c, 1))}
                    {others.length > 0 &&
                      more(`more:${continent.id}`, `Other countries (${others.length})`, 1, () => others.map((c) => countryRow(c, 2)))}
                  </>
                ),
              });
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
