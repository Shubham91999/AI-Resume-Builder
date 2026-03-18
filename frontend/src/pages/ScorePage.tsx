import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { rankResumes, getCachedJDs, getCachedResumes } from "@/services/api";
import type { RankingResponse, ResumeScore, ParsedJD, ParsedResume } from "@/types";
import { Loader2, RefreshCw, BarChart2 } from "lucide-react";

// Multi-JD comparison: resume name → { jdId → score }
type MultiScoreMap = Record<string, Record<string, number>>;

export default function ScorePage() {
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jds, setJds] = useState<ParsedJD[]>([]);
  const [resumes, setResumes] = useState<ParsedResume[]>([]);
  const [selectedJdId, setSelectedJdId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Multi-JD comparison
  const [compareMode, setCompareMode] = useState(false);
  const [selectedJdIds, setSelectedJdIds] = useState<Set<string>>(new Set());
  const [multiScores, setMultiScores] = useState<MultiScoreMap>({});
  const [multiLoading, setMultiLoading] = useState(false);

  // Load cached JDs and resumes
  useEffect(() => {
    Promise.all([getCachedJDs(), getCachedResumes()])
      .then(([jdData, resumeData]) => {
        setJds(jdData);
        setResumes(resumeData);
        if (jdData.length > 0) {
          setSelectedJdId(jdData[jdData.length - 1].id);
        }
      })
      .catch(() => setError("Failed to load cached data. Parse a JD and upload resumes first."));
  }, []);

  // Auto-run scoring when JD is selected and resumes exist
  useEffect(() => {
    if (selectedJdId && resumes.length > 0 && !compareMode) {
      runScoring(selectedJdId);
    }
  }, [selectedJdId, resumes.length, compareMode]);

  const runScoring = async (jdId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await rankResumes(jdId);
      setRanking(result);
    } catch (err: unknown) {
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(detail ?? "Scoring failed. Ensure you have a parsed JD and uploaded resumes.");
    } finally {
      setLoading(false);
    }
  };

  const toggleJdSelection = (jdId: string) => {
    setSelectedJdIds((prev) => {
      const next = new Set(prev);
      if (next.has(jdId)) next.delete(jdId);
      else next.add(jdId);
      return next;
    });
  };

  const runMultiScoring = async () => {
    if (selectedJdIds.size === 0) return;
    setMultiLoading(true);
    setError(null);
    setMultiScores({});
    try {
      const results = await Promise.all(
        [...selectedJdIds].map((jdId) => rankResumes(jdId).then((r: RankingResponse) => ({ jdId, r })))
      );
      const map: MultiScoreMap = {};
      for (const { jdId, r } of results) {
        for (const score of r.rankings) {
          if (!map[score.resume_name]) map[score.resume_name] = {};
          map[score.resume_name][jdId] = score.overall_score;
        }
      }
      setMultiScores(map);
    } catch {
      setError("Multi-JD scoring failed.");
    } finally {
      setMultiLoading(false);
    }
  };

  const hasData = jds.length > 0 && resumes.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">ATS Score & Ranking</h1>
        <p className="text-zinc-400 mt-1">
          See how well your resumes match the job description.
        </p>
      </div>

      {/* Warnings if missing data */}
      {!hasData && !loading && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-300 space-y-2 text-sm">
          {jds.length === 0 && (
            <p>⚠️ No parsed JDs found.{" "}
              <button onClick={() => navigate("/jd")} className="underline hover:no-underline font-medium">Parse a job description first →</button>
            </p>
          )}
          {resumes.length === 0 && (
            <p>⚠️ No uploaded resumes found.{" "}
              <button onClick={() => navigate("/resume")} className="underline hover:no-underline font-medium">Upload a resume first →</button>
            </p>
          )}
        </div>
      )}

      {/* Mode toggle + JD selector */}
      {jds.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setCompareMode(false); setMultiScores({}); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!compareMode ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Single JD
            </button>
            {jds.length > 1 && (
              <button
                onClick={() => { setCompareMode(true); setSelectedJdIds(new Set(jds.map((j) => j.id))); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${compareMode ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
              >
                <BarChart2 className="h-3.5 w-3.5" /> Compare JDs
              </button>
            )}
          </div>

          {!compareMode && jds.length > 1 && (
            <div>
              <label className="text-sm font-medium text-zinc-400 block mb-1">Select Job Description</label>
              <select
                value={selectedJdId ?? ""}
                onChange={(e) => setSelectedJdId(e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-200 w-full max-w-md"
              >
                {jds.map((jd) => (
                  <option key={jd.id} value={jd.id}>{jd.job_title} @ {jd.company}</option>
                ))}
              </select>
            </div>
          )}

          {compareMode && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-400">Select JDs to compare your resumes against:</p>
              <div className="space-y-1">
                {jds.map((jd) => (
                  <label key={jd.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedJdIds.has(jd.id)}
                      onChange={() => toggleJdSelection(jd.id)}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-zinc-300 group-hover:text-zinc-100">{jd.job_title} @ {jd.company}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={runMultiScoring}
                disabled={multiLoading || selectedJdIds.size === 0}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {multiLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Scoring…</> : `Score vs ${selectedJdIds.size} JD${selectedJdIds.size > 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-400 mx-auto" />
          <p className="text-zinc-400">Scoring resumes against the JD...</p>
        </div>
      )}

      {/* Multi-JD comparison table */}
      {compareMode && Object.keys(multiScores).length > 0 && !multiLoading && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">JD Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-zinc-400 font-medium py-2 pr-4">Resume</th>
                  {[...selectedJdIds].map((jdId) => {
                    const jd = jds.find((j) => j.id === jdId);
                    return (
                      <th key={jdId} className="text-center text-zinc-400 font-medium py-2 px-3 text-xs">
                        {jd ? `${jd.job_title}@${jd.company}` : jdId.slice(0, 8)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Object.entries(multiScores)
                  .sort(([, a], [, b]) => Math.max(...Object.values(b)) - Math.max(...Object.values(a)))
                  .map(([resumeName, scores]) => {
                    const maxScore = Math.max(...Object.values(scores));
                    return (
                      <tr key={resumeName} className="border-t border-zinc-700">
                        <td className="py-2 pr-4 text-zinc-200 font-medium">{resumeName}</td>
                        {[...selectedJdIds].map((jdId) => {
                          const score = scores[jdId] ?? null;
                          const isBest = score === maxScore && score !== null;
                          return (
                            <td key={jdId} className="text-center py-2 px-3">
                              {score !== null ? (
                                <span className={`font-semibold ${isBest ? "text-green-400" : score >= 70 ? "text-green-300" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                  {score.toFixed(0)}%{isBest ? " ★" : ""}
                                </span>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rankings Table */}
      {ranking && !loading && !compareMode && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Rankings ({ranking.rankings.length} resume{ranking.rankings.length !== 1 ? "s" : ""})
            </h2>
            <button
              onClick={() => selectedJdId && runScoring(selectedJdId)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-blue-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-score
            </button>
          </div>

          {ranking.rankings.map((score, idx) => (
            <ScoreCard
              key={score.resume_id}
              score={score}
              rank={idx + 1}
              isTop={score.resume_id === ranking.top_resume_id}
              expanded={expandedId === score.resume_id}
              onToggle={() =>
                setExpandedId(expandedId === score.resume_id ? null : score.resume_id)
              }
            />
          ))}

          {/* Proceed button */}
          <div className="flex justify-end pt-4">
            <button
              onClick={() => navigate("/tailor")}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              Next: Tailor Top Resume →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Score Card ──────────────────────────────────────────────────────────────
function ScoreCard({
  score,
  rank,
  isTop,
  expanded,
  onToggle,
}: {
  score: ResumeScore;
  rank: number;
  isTop: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const scoreColor =
    score.overall_score >= 70 ? "text-green-400" :
    score.overall_score >= 50 ? "text-amber-400" :
    "text-red-400";

  const barColor =
    score.overall_score >= 70 ? "bg-green-500" :
    score.overall_score >= 50 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className={`border rounded-xl overflow-hidden ${isTop ? "border-blue-500/50 bg-blue-500/5" : "border-zinc-700 bg-zinc-800/50"}`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 hover:bg-zinc-700/20 transition-colors text-left"
      >
        {/* Rank badge */}
        <div className={`text-lg font-bold w-8 text-center ${isTop ? "text-blue-400" : "text-zinc-500"}`}>
          {isTop ? "⭐" : `#${rank}`}
        </div>

        {/* Name + file */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-zinc-200 truncate">
            {score.resume_name}
            {isTop && <span className="text-xs text-blue-400 ml-2">Top Match</span>}
          </h3>
          <p className="text-xs text-zinc-500 truncate">{score.file_name}</p>
        </div>

        {/* Score */}
        <div className="flex items-center gap-3">
          <div className="w-24">
            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${score.overall_score}%` }} />
            </div>
          </div>
          <span className={`text-lg font-bold ${scoreColor} w-14 text-right`}>
            {score.overall_score}%
          </span>
        </div>

        <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="border-t border-zinc-700 p-4 space-y-4">
          {/* Score breakdown bars */}
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Score Breakdown</h4>
            <div className="space-y-2">
              <BreakdownBar label="Required Skills (35%)" value={score.breakdown.required_skills_pct} />
              <BreakdownBar label="Preferred Skills (15%)" value={score.breakdown.preferred_skills_pct} />
              <BreakdownBar label="Title Alignment (20%)" value={score.breakdown.title_similarity_pct} />
              <BreakdownBar label="Experience Relevance (15%)" value={score.breakdown.experience_relevance_pct} />
              <BreakdownBar label="Years Experience (10%)" value={score.breakdown.years_experience_fit_pct} />
              <BreakdownBar label="Education (5%)" value={score.breakdown.education_match_pct} />
            </div>
          </div>

          {/* Matched skills */}
          {score.matched_required_skills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                ✅ Matched Required Skills ({score.matched_required_skills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {score.matched_required_skills.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-green-500/15 text-green-300 rounded text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Missing skills */}
          {score.missing_required_skills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                ❌ Missing Required Skills ({score.missing_required_skills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {score.missing_required_skills.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-red-500/15 text-red-300 rounded text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Preferred skills matched */}
          {score.matched_preferred_skills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                💡 Matched Preferred Skills
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {score.matched_preferred_skills.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded text-xs">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Knockout Alerts */}
          {score.knockout_alerts.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                ⚠️ Knockout Alerts
              </h4>
              <div className="space-y-1">
                {score.knockout_alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`text-xs px-3 py-1.5 rounded ${
                      alert.severity === "critical"
                        ? "bg-red-500/10 text-red-300 border border-red-500/20"
                        : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                    }`}
                  >
                    {alert.severity === "critical" ? "🚨" : "⚠️"} {alert.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Breakdown Bar ───────────────────────────────────────────────────────────
function BreakdownBar({ label, value }: { label: string; value: number }) {
  const barColor =
    value >= 70 ? "bg-green-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-400 w-44 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-zinc-300 w-10 text-right">{Math.round(value)}%</span>
    </div>
  );
}
