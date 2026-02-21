import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  tailorResume,
  getCachedJDs,
  getCachedResumes,
  rankResumes,
} from "@/services/api";
import type {
  TailoredResume,
  TailoredExperienceEntry,
  ParsedJD,
  ParsedResume,
  RankingResponse,
} from "@/types";

function getSelectedModel(): { provider: string; model_key: string } | null {
  try {
    const raw = localStorage.getItem("art_selected_model");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.provider && parsed?.model_key) return parsed;
    return null;
  } catch {
    return null;
  }
}

type PipelineStep = {
  label: string;
  status: "pending" | "active" | "done" | "error";
};

export default function TailorPage() {
  const navigate = useNavigate();
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>([]);

  // Data state
  const [jds, setJds] = useState<ParsedJD[]>([]);
  const [resumes, setResumes] = useState<ParsedResume[]>([]);
  const [topResumeId, setTopResumeId] = useState<string | null>(null);
  const [selectedJdId, setSelectedJdId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Load data and auto-detect top resume
  useEffect(() => {
    Promise.all([getCachedJDs(), getCachedResumes()])
      .then(async ([jdData, resumeData]) => {
        setJds(jdData);
        setResumes(resumeData);
        if (jdData.length > 0) {
          const jdId = jdData[jdData.length - 1].id;
          setSelectedJdId(jdId);

          // Get top resume from scoring
          if (resumeData.length > 0) {
            try {
              const ranking: RankingResponse = await rankResumes(jdId);
              setTopResumeId(ranking.top_resume_id);
            } catch {
              setTopResumeId(resumeData[0].id);
            }
          }
        }
        setReady(true);
      })
      .catch(() => {
        setError("Failed to load data. Parse a JD and upload resumes first.");
        setReady(true);
      });
  }, []);

  const startTailoring = async () => {
    if (!selectedJdId || !topResumeId) return;
    const model = getSelectedModel();
    if (!model) {
      setError("Please select a model in Settings first.");
      return;
    }

    setError(null);
    setLoading(true);
    setTailored(null);

    // Build pipeline steps (we don't know exact count, estimate)
    const resume = resumes.find((r) => r.id === topResumeId);
    const expCount = resume?.experience.length ?? 2;
    const pipelineSteps: PipelineStep[] = [
      { label: "Tailoring tagline", status: "active" },
      { label: "Rewriting summary", status: "pending" },
      { label: "Optimizing skills", status: "pending" },
      ...Array.from({ length: expCount }, (_, i) => ({
        label: `Rewriting experience #${i + 1}`,
        status: "pending" as const,
      })),
    ];
    setSteps(pipelineSteps);

    // Simulate step progression with timers (actual call is blocking)
    let currentStep = 0;
    const stepInterval = setInterval(() => {
      currentStep++;
      if (currentStep < pipelineSteps.length) {
        setSteps((prev) =>
          prev.map((s, i) => ({
            ...s,
            status: i < currentStep ? "done" : i === currentStep ? "active" : "pending",
          }))
        );
      }
    }, 8000); // ~8s per step estimate

    try {
      const result = await tailorResume({
        jd_id: selectedJdId,
        resume_id: topResumeId,
        provider: model.provider,
        model_key: model.model_key,
      });
      clearInterval(stepInterval);
      setSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
      setTailored(result);
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setSteps((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s))
      );
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(detail ?? "Tailoring failed. Check your API key and try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasData = jds.length > 0 && resumes.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Tailor Resume</h1>
        <p className="text-zinc-400 mt-1">
          AI will rewrite your resume section-by-section to match the job description.
        </p>
      </div>

      {/* Missing data warnings */}
      {ready && !hasData && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-300 space-y-2">
          {jds.length === 0 && <p>⚠️ No parsed JDs found. Parse a job description first.</p>}
          {resumes.length === 0 && <p>⚠️ No uploaded resumes found. Upload resumes first.</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
      )}

      {/* Start button */}
      {ready && hasData && !tailored && !loading && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6 text-center space-y-4">
          <div className="text-4xl">✨</div>
          <div>
            <h3 className="font-semibold text-zinc-200">Ready to Tailor</h3>
            <p className="text-sm text-zinc-400 mt-1">
              The AI will rewrite your tagline, summary, skills, and experience bullets
              to match the target JD.
            </p>
          </div>
          <button
            onClick={startTailoring}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-medium transition-colors text-lg"
          >
            Start Tailoring
          </button>
        </div>
      )}

      {/* Pipeline Progress */}
      {steps.length > 0 && (loading || tailored) && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Pipeline Progress</h3>
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-5 text-center">
                {step.status === "done" && <span className="text-green-400">✓</span>}
                {step.status === "active" && <span className="text-blue-400 animate-pulse">⏳</span>}
                {step.status === "pending" && <span className="text-zinc-600">○</span>}
                {step.status === "error" && <span className="text-red-400">✗</span>}
              </span>
              <span
                className={`text-sm ${
                  step.status === "done"
                    ? "text-zinc-300"
                    : step.status === "active"
                    ? "text-blue-300"
                    : step.status === "error"
                    ? "text-red-300"
                    : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tailored Result */}
      {tailored && <TailoredView tailored={tailored} />}

      {/* Navigation */}
      {tailored && (
        <div className="flex justify-between pt-4">
          <button
            onClick={() => {
              setTailored(null);
              setSteps([]);
            }}
            className="text-zinc-400 hover:text-zinc-200 px-4 py-2 transition-colors"
          >
            ← Re-tailor
          </button>
          <button
            onClick={() => navigate("/projects")}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            Next: Project Bank →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tailored Result View ────────────────────────────────────────────────────
function TailoredView({ tailored }: { tailored: TailoredResume }) {
  return (
    <div className="space-y-4">
      {/* Coverage banner */}
      <div className={`rounded-lg p-3 flex items-center justify-between ${
        tailored.keywords_coverage >= 70
          ? "bg-green-500/10 border border-green-500/30"
          : tailored.keywords_coverage >= 50
          ? "bg-amber-500/10 border border-amber-500/30"
          : "bg-red-500/10 border border-red-500/30"
      }`}>
        <span className="text-sm font-medium text-zinc-300">
          JD Keyword Coverage
        </span>
        <span className={`text-lg font-bold ${
          tailored.keywords_coverage >= 70 ? "text-green-400" :
          tailored.keywords_coverage >= 50 ? "text-amber-400" : "text-red-400"
        }`}>
          {tailored.keywords_coverage}%
        </span>
      </div>

      {/* Tagline */}
      <Section title="Tagline">
        <p className="text-sm text-zinc-200 italic">{tailored.tagline}</p>
      </Section>

      {/* Summary */}
      <Section title="Professional Summary">
        <p className="text-sm text-zinc-300">{tailored.summary}</p>
      </Section>

      {/* Skills */}
      <Section title="Skills">
        <div className="space-y-2">
          {Object.entries(tailored.skills).map(([category, skillStr]) => (
            <div key={category}>
              <h5 className="text-xs font-medium text-zinc-400">{category}</h5>
              <p className="text-sm text-zinc-300">{skillStr}</p>
            </div>
          ))}
        </div>
        {(tailored.skills_added.length > 0 || tailored.skills_removed.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {tailored.skills_added.map((s, i) => (
              <span key={`a-${i}`} className="px-2 py-0.5 bg-green-500/15 text-green-300 rounded">
                + {s}
              </span>
            ))}
            {tailored.skills_removed.map((s, i) => (
              <span key={`r-${i}`} className="px-2 py-0.5 bg-red-500/15 text-red-300 rounded">
                − {s}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Experience */}
      <Section title="Experience">
        <div className="space-y-4">
          {tailored.experience.map((exp, i) => (
            <ExperienceCard key={i} exp={exp} />
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Experience Card ─────────────────────────────────────────────────────────
function ExperienceCard({ exp }: { exp: TailoredExperienceEntry }) {
  return (
    <div className="bg-zinc-800/30 rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-sm font-medium text-zinc-200">
          {exp.title} @ {exp.company}
        </h4>
        <span className="text-xs text-zinc-500 shrink-0 ml-2">{exp.dates}</span>
      </div>
      <ul className="space-y-1">
        {exp.bullets.map((b, j) => (
          <li key={j} className="text-xs text-zinc-300 flex">
            <span className="text-zinc-600 mr-1.5">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {exp.keywords_used.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {exp.keywords_used.map((kw, j) => (
            <span key={j} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 rounded text-[10px]">
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section Wrapper ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}
