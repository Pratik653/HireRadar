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
