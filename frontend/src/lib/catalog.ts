// Region → country → city tree. Mirrors backend/app/geo.py so the form renders
// instantly, before the backend has woken up.

export interface Country {
  code: string;
  name: string;
  cities: string[];
}

export interface Region {
  region: string;
  label: string;
  countries: Country[];
}

export const REGIONS: Region[] = [
  {
    region: "GCC",
    label: "Gulf Cooperation Council",
    countries: [
      { code: "AE", name: "United Arab Emirates", cities: ["Dubai", "Abu Dhabi", "Sharjah"] },
      { code: "QA", name: "Qatar", cities: ["Doha"] },
      { code: "BH", name: "Bahrain", cities: ["Manama"] },
      { code: "SA", name: "Saudi Arabia", cities: ["Riyadh", "Jeddah", "Dammam"] },
      { code: "KW", name: "Kuwait", cities: ["Kuwait City"] },
      { code: "OM", name: "Oman", cities: ["Muscat"] },
    ],
  },
];

export const COUNTRY_BY_CODE = Object.fromEntries(
  REGIONS.flatMap((r) => r.countries).map((c) => [c.code, c]),
) as Record<string, Country>;

export const SUGGESTED_BOARDS = [
  { provider: "greenhouse", slug: "careem", company: "Careem" },
  { provider: "greenhouse", slug: "tamara", company: "Tamara" },
  { provider: "ashby", slug: "ziina", company: "Ziina" },
] as const;

export const INTENT_LABELS: Record<string, string> = {
  explicit_vacancy: "Explicit vacancy",
  hiring_manager: "Hiring manager",
  recruiter: "Recruiter",
  general_recruitment: "General recruitment",
  weak_signal: "Weak signal",
  unrelated: "Unrelated",
};
