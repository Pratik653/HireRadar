import { sanitize } from "./locations";
import type { SearchRequest } from "./types";

export type FormState = Omit<SearchRequest, "mode" | "imports">;

export const DEFAULT_FORM: FormState = {
  locations: [{ country_code: "AE" }, { country_code: "SA", city: "Riyadh" }, { country_code: "QA" }],
  work_modes: ["onsite", "hybrid", "remote"],
  titles: ["Applied AI Engineer", "LLM Engineer", "Python Developer"],
  skills: ["Python", "RAG", "LangGraph", "Agentic AI", "LLM"],
  description: "",
  resume_text: "",
  exclusions: [],
  seniority: [],
  days: 7,
  include_undated: true,
  sources: ["company_boards", "remotive", "manual_import"],
  company_boards: [
    { provider: "greenhouse", slug: "careem" },
    { provider: "greenhouse", slug: "tamara" },
    { provider: "ashby", slug: "ziina" },
  ],
  min_score: 0,
};

/**
 * Per-field reset rules. "clear" empties the field; "restore" puts the default
 * back (used where an empty value would make the search meaningless, such as no
 * work arrangement at all). Each reset touches only its own keys.
 */
export const FIELD_RESETS = {
  locations: { mode: "clear", keys: ["locations"] },
  work_modes: { mode: "restore", keys: ["work_modes"] },
  titles: { mode: "clear", keys: ["titles"] },
  skills: { mode: "clear", keys: ["skills"] },
  description: { mode: "clear", keys: ["description"] },
  resume_text: { mode: "clear", keys: ["resume_text"] },
  dates: { mode: "restore", keys: ["days", "include_undated"] },
  seniority: { mode: "clear", keys: ["seniority"] },
  exclusions: { mode: "clear", keys: ["exclusions"] },
  min_score: { mode: "restore", keys: ["min_score"] },
  sources: { mode: "restore", keys: ["sources", "company_boards"] },
} as const satisfies Record<string, { mode: "clear" | "restore"; keys: readonly (keyof FormState)[] }>;

export type ResettableField = keyof typeof FIELD_RESETS;

function emptyOf(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (typeof value === "string") return "";
  return value;
}

function resetValue(field: ResettableField, key: keyof FormState): unknown {
  return FIELD_RESETS[field].mode === "clear" ? emptyOf(DEFAULT_FORM[key]) : DEFAULT_FORM[key];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function resetField(form: FormState, field: ResettableField): FormState {
  const next = { ...form } as Record<keyof FormState, unknown>;
  for (const key of FIELD_RESETS[field].keys) next[key] = resetValue(field, key);
  return next as FormState;
}

/** True when the field already holds its reset value, so its button is disabled. */
export function isFieldReset(form: FormState, field: ResettableField): boolean {
  return FIELD_RESETS[field].keys.every((key) => same(form[key], resetValue(field, key)));
}

export const isFormDefault = (form: FormState) => same(form, DEFAULT_FORM);

/** Repair a form read from browser storage: fill missing keys from the
 *  defaults and drop locations the current catalog does not know. */
export function sanitizeForm(stored: unknown): FormState {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<FormState>;
  const form = { ...DEFAULT_FORM, ...raw } as FormState;
  return { ...form, locations: sanitize(form.locations) };
}
