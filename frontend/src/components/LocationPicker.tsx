import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { REGIONS } from "../lib/catalog";
import type { LocationSelection } from "../lib/types";

interface Props {
  value: LocationSelection[];
  onChange: (value: LocationSelection[]) => void;
}

/**
 * Region → country → city. Ticking a country with no city selected means the
 * whole country; ticking cities narrows it to those cities.
 */
export function LocationPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ AE: true });

  const hasCountry = (code: string) => value.some((v) => v.country_code === code);
  const hasCity = (code: string, city: string) => value.some((v) => v.country_code === code && v.city === city);
  const wholeCountry = (code: string) => value.some((v) => v.country_code === code && !v.city);

  const toggleCountry = (code: string) => {
    onChange(hasCountry(code) ? value.filter((v) => v.country_code !== code) : [...value, { country_code: code }]);
  };

  const toggleCity = (code: string, city: string, allCities: string[]) => {
    let next = value.filter((v) => !(v.country_code === code && !v.city));
    if (hasCity(code, city)) {
      next = next.filter((v) => !(v.country_code === code && v.city === city));
    } else {
      next = [...next, { country_code: code, city }];
    }
    const selected = next.filter((v) => v.country_code === code).length;
    if (selected === allCities.length) {
      next = [...next.filter((v) => v.country_code !== code), { country_code: code }];
    }
    onChange(next);
  };

  const toggleRegion = (codes: string[]) => {
    const all = codes.every(wholeCountry);
    const rest = value.filter((v) => !codes.includes(v.country_code));
    onChange(all ? rest : [...rest, ...codes.map((c) => ({ country_code: c }))]);
  };

  return (
    <div className="space-y-2">
      {REGIONS.map((region) => {
        const codes = region.countries.map((c) => c.code);
        return (
          <div key={region.region} className="rounded-lg border border-slate-200 bg-white">
            <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={codes.every(wholeCountry)}
                ref={(el) => {
                  if (el) el.indeterminate = !codes.every(wholeCountry) && codes.some(hasCountry);
                }}
                onChange={() => toggleRegion(codes)}
              />
              {region.region} <span className="font-normal text-slate-500">· {region.label}</span>
            </label>
            <ul className="divide-y divide-slate-100">
              {region.countries.map((country) => {
                const partial = hasCountry(country.code) && !wholeCountry(country.code);
                return (
                  <li key={country.code} className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="accent-indigo-600"
                          checked={wholeCountry(country.code)}
                          ref={(el) => {
                            if (el) el.indeterminate = partial;
                          }}
                          onChange={() => toggleCountry(country.code)}
                        />
                        {country.name}
                        {partial && (
                          <span className="text-xs text-indigo-600">
                            {value.filter((v) => v.country_code === country.code).length} cities
                          </span>
                        )}
                      </label>
                      {country.cities.length > 1 && (
                        <button
                          type="button"
                          aria-expanded={!!open[country.code]}
                          aria-label={`Show cities in ${country.name}`}
                          onClick={() => setOpen((o) => ({ ...o, [country.code]: !o[country.code] }))}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <ChevronDown size={16} className={open[country.code] ? "rotate-180 transition" : "transition"} />
                        </button>
                      )}
                    </div>
                    {open[country.code] && country.cities.length > 1 && (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pb-1 pl-6">
                        {country.cities.map((city) => (
                          <label key={city} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="accent-indigo-600"
                              checked={wholeCountry(country.code) || hasCity(country.code, city)}
                              onChange={() => toggleCity(country.code, city, country.cities)}
                            />
                            {city}
                          </label>
                        ))}
                      </div>
                    )}
                    {country.cities.length === 1 && (
                      <p className="pl-6 text-xs text-slate-400">{country.cities[0]}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <p className="text-xs text-slate-400">More regions can be added in backend/app/geo.py.</p>
    </div>
  );
}
