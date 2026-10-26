// Mirrors backend/app/models.py. Keep the two in sync.

export type Mode = "demo" | "live";
export type WorkMode = "onsite" | "hybrid" | "remote";
export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead" | "manager" | "executive";
export type Days = 1 | 3 | 7 | 14 | 30;
export type LiveSource = "remotive" | "company_boards" | "manual_import";
export type Intent =
  | "explicit_vacancy"
  | "hiring_manager"
  | "recruiter"
  | "general_recruitment"
  | "weak_signal"
  | "unrelated";

export interface LocationSelection {
  country_code: string;
  city?: string | null;
}

export interface CompanyBoard {
  provider: "greenhouse" | "lever" | "ashby";
  slug: string;
}

export interface ImportedPost {
  text: string;
  url?: string | null;
  author_name?: string | null;
  author_position?: string | null;
  author_profile_url?: string | null;
  company?: string | null;
  location?: string | null;
  published_at?: string | null;
  platform: string;
}

export interface SearchRequest {
  mode: Mode;
  locations: LocationSelection[];
  work_modes: WorkMode[];
  titles: string[];
  skills: string[];
  description: string;
  resume_text: string;
  exclusions: string[];
  seniority: Seniority[];
  days: Days;
  include_undated: boolean;
  sources: LiveSource[];
  company_boards: CompanyBoard[];
  imports: ImportedPost[];
  min_score: number;
}

export interface Contact {
  name?: string | null;
  position?: string | null;
  profile_url?: string | null;
  provenance: "user_provided" | "source_listing" | "synthetic";
}

export interface Opportunity {
  id: string;
  title: string;
  company?: string | null;
  country?: string | null;
  city?: string | null;
  location_raw?: string | null;
  work_mode?: WorkMode | null;
  seniority?: Seniority | null;
  published_at?: string | null;
  date_confidence: "exact" | "reported" | "unknown";
  intent: Intent;
  intent_label: string;
  score: number;
  breakdown: { role: number; intent: number; geography: number; recency: number };
  explanations: string[];
  matched_skills: string[];
  source: string;
  source_label: string;
  source_url?: string | null;
  contact?: Contact | null;
  snippet: string;
  is_demo: boolean;
  duplicates: string[];
}

export interface SourceStatus {
  source: string;
  label: string;
  status: "ok" | "empty" | "error" | "skipped";
  live: boolean;
  fetched: number;
  message?: string | null;
}

export interface SearchSummary {
  fetched: number;
  returned: number;
  removed_duplicates: number;
  removed_by_exclusion: number;
  removed_by_location: number;
  removed_by_date: number;
  removed_unrelated: number;
  removed_below_min_score: number;
  removed_low_relevance: number;
  undated: number;
}

export interface SearchResponse {
  mode: Mode;
  generated_at: string;
  request: SearchRequest;
  results: Opportunity[];
  summary: SearchSummary;
  sources: SourceStatus[];
  weights: Record<string, number>;
  notes: string[];
}

export type ApplicationStatus =
  | "not_applied"
  | "saved"
  | "applied"
  | "contacted"
  | "interviewing"
  | "offer"
  | "rejected";

export interface Tracked {
  status: ApplicationStatus;
  follow_up?: string | null;
  notes?: string | null;
}
