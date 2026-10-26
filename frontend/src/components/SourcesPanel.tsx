const SOURCES = [
  {
    name: "Company career boards",
    status: "Live",
    detail:
      "Official public job-board APIs from Greenhouse, Lever and Ashby. You choose the companies. No authentication. " +
      "Exact publish dates from Greenhouse and Ashby; Lever reports creation time, labelled 'reported'.",
  },
  {
    name: "Remotive",
    status: "Live",
    detail:
      "Public remote-jobs API. Listings are delayed 24 hours by Remotive and must link back to Remotive, which HireRadar does.",
  },
  {
    name: "Your imported posts",
    status: "Live",
    detail:
      "Posts you paste or upload (CSV/JSON) from LinkedIn or elsewhere. Kept in your browser; sent to the API only for scoring. URLs are never fetched by the server.",
  },
  {
    name: "LinkedIn",
    status: "Research mode only",
    detail:
      "LinkedIn's User Agreement prohibits scraping and automated access. HireRadar builds search links you open yourself and never handles LinkedIn credentials or cookies. An official integration would need LinkedIn partner approval.",
  },
];

const WEIGHTS = [
  ["Role & skills", "40%", "Title-word overlap, share of your skills found (with synonyms such as RAG ↔ retrieval-augmented generation), TF-IDF similarity to your titles, skills, description and resume."],
  ["Hiring intent", "30%", "Rule-based class: explicit vacancy, hiring-manager post, recruiter post, general recruitment, weak signal. Job-seeker and 'I joined' posts are removed."],
  ["Geography", "20%", "Selected city or country 1.0, same country other city 0.6, remote 0.5–0.9 by stated eligibility, unstated 0.3."],
  ["Recency", "10%", "Linear from 1.0 (just posted) to 0 at the end of your window. Items without a trustworthy date score 0 and are never given a date."],
];

export function SourcesPanel() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">Data sources</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {SOURCES.map((s) => (
            <div key={s.name} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{s.name}</h3>
                <span className={`rounded px-1.5 py-0.5 text-xs ${s.status === "Live" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}>{s.status}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{s.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          When a source fails, the results say so. HireRadar never substitutes demo data for a failed live source.
        </p>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">How the score works</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {WEIGHTS.map(([name, weight, text]) => (
                <tr key={name} className="align-top">
                  <td className="w-36 px-3 py-2 font-medium">{name}</td>
                  <td className="w-14 px-3 py-2 tabular-nums text-indigo-700">{weight}</td>
                  <td className="px-3 py-2 text-slate-600">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          These weights are starting heuristics, not a validated accuracy measure. Items whose role relevance is below
          15% are hidden so that intent and location alone cannot lift an unrelated role. Every result lists the
          reasons behind its score.
        </p>
      </section>
    </div>
  );
}
