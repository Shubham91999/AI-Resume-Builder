import { useState, useEffect } from "react";
import { downloadDocx, downloadPdf, downloadZip, downloadTxt, getCachedTailored, getScoreComparison } from "@/services/api";
import type { TailoredResume, ScoreComparison } from "@/types";
import { Loader2, FileDown, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/Toast";
import { formatRelativeTime } from "@/lib/utils";

// Group tailored resumes by original_resume_id, sorted newest first within each group
function groupByResume(list: TailoredResume[]): Map<string, TailoredResume[]> {
  const sorted = [...list].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
  const map = new Map<string, TailoredResume[]>();
  for (const t of sorted) {
    const key = t.original_resume_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return map;
}

export default function DownloadPage() {
  const { toast } = useToast();
  const [tailoredList, setTailoredList] = useState<TailoredResume[]>([]);
  const [scoreComparisons, setScoreComparisons] = useState<Record<string, ScoreComparison>>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersionGroups, setExpandedVersionGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCachedTailored()
      .then(async (data: TailoredResume[]) => {
        setTailoredList(data);
        // Fetch all score comparisons in parallel
        const results = await Promise.allSettled(
          data.map((t) => getScoreComparison(t.id).then((c) => ({ id: t.id, c })))
        );
        const comparisons: Record<string, ScoreComparison> = {};
        for (const r of results) {
          if (r.status === "fulfilled") comparisons[r.value.id] = r.value.c;
        }
        setScoreComparisons(comparisons);
      })
      .catch(() => setError("Failed to load tailored resumes"))
      .finally(() => setLoading(false));
  }, []);

  const toggleVersionGroup = (resumeId: string) => {
    setExpandedVersionGroups((prev) => {
      const next = new Set(prev);
      if (next.has(resumeId)) next.delete(resumeId);
      else next.add(resumeId);
      return next;
    });
  };

  const handleDownload = async (
    tailorId: string,
    format: "docx" | "pdf" | "zip" | "txt",
    name: string
  ) => {
    setDownloading(tailorId + format);
    setError(null);
    try {
      const blob =
        format === "docx" ? await downloadDocx(tailorId)
        : format === "pdf" ? await downloadPdf(tailorId)
        : format === "zip" ? await downloadZip(tailorId)
        : await downloadTxt(tailorId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/\s+/g, "_")}_Tailored.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("success", `${format.toUpperCase()} downloaded successfully`);
    } catch {
      setError(`Failed to download ${format.toUpperCase()}`);
      toast("error", `Failed to download ${format.toUpperCase()}`);
    } finally {
      setDownloading(null);
    }
  };

  const grouped = groupByResume(tailoredList);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Download</h1>
        <p className="text-zinc-400 mt-1">
          Export your tailored resume in multiple formats. Version history is grouped by resume.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading…</span>
        </div>
      ) : tailoredList.length === 0 ? (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-8 text-center space-y-2">
          <div className="text-3xl">📄</div>
          <p className="text-zinc-400">
            No tailored resumes found. Complete the tailoring step first.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([resumeId, versions]) => {
            const latest = versions[0];
            const hasHistory = versions.length > 1;
            const historyExpanded = expandedVersionGroups.has(resumeId);

            return (
              <div key={resumeId} className="space-y-3">
                {/* Resume group header */}
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-300">{latest.name}</h2>
                  <span className="text-xs text-zinc-600">·</span>
                  <span className="text-xs text-zinc-500">{versions.length} version{versions.length > 1 ? "s" : ""}</span>
                </div>

                {/* Latest version card */}
                <ResumeCard
                  t={latest}
                  versionLabel="Latest"
                  scoreComparison={scoreComparisons[latest.id]}
                  downloading={downloading}
                  onDownload={handleDownload}
                />

                {/* Older versions (collapsible) */}
                {hasHistory && (
                  <div>
                    <button
                      onClick={() => toggleVersionGroup(resumeId)}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {historyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {historyExpanded ? "Hide" : "Show"} {versions.length - 1} older version{versions.length - 1 > 1 ? "s" : ""}
                    </button>
                    {historyExpanded && (
                      <div className="mt-2 space-y-3 pl-4 border-l border-zinc-700">
                        {versions.slice(1).map((t, i) => (
                          <ResumeCard
                            key={t.id}
                            t={t}
                            versionLabel={`v${versions.length - 1 - i}`}
                            scoreComparison={scoreComparisons[t.id]}
                            downloading={downloading}
                            onDownload={handleDownload}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Resume Card ──────────────────────────────────────────────────────────────
function ResumeCard({
  t,
  versionLabel,
  scoreComparison,
  downloading,
  onDownload,
}: {
  t: TailoredResume;
  versionLabel: string;
  scoreComparison?: ScoreComparison;
  downloading: string | null;
  onDownload: (id: string, format: "docx" | "pdf" | "zip" | "txt", name: string) => void;
}) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">{versionLabel}</span>
            {t.created_at && (
              <span className="text-xs text-zinc-500">{formatRelativeTime(t.created_at)}</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            JD: {t.jd_id.slice(0, 8)}… · Coverage:{" "}
            <span className={t.keywords_coverage >= 70 ? "text-green-400" : t.keywords_coverage >= 50 ? "text-amber-400" : "text-red-400"}>
              {t.keywords_coverage}%
            </span>
          </p>
        </div>
      </div>

      {/* Before/After ATS Score */}
      {scoreComparison && (
        <div className="mb-4 bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-3">
          <h4 className="text-xs font-medium text-zinc-400 mb-2">ATS Score Comparison</h4>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-lg font-bold text-zinc-400">{scoreComparison.before.overall_score.toFixed(1)}%</p>
              <p className="text-[10px] text-zinc-500">Before</p>
            </div>
            <div className="text-zinc-600 text-xl">→</div>
            <div className="text-center">
              <p className="text-lg font-bold text-green-400">{scoreComparison.after.overall_score.toFixed(1)}%</p>
              <p className="text-[10px] text-zinc-500">After</p>
            </div>
            <div className={`ml-auto text-sm font-semibold ${scoreComparison.improvement_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
              {scoreComparison.improvement_pct >= 0 ? "+" : ""}{scoreComparison.improvement_pct.toFixed(1)}%
            </div>
          </div>
          {scoreComparison.keywords_added.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-[10px] text-zinc-500 mr-1">Added:</span>
              {scoreComparison.keywords_added.slice(0, 8).map((kw, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-green-500/10 text-green-300 rounded text-[10px]">+{kw}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Stat label="Experience" value={`${t.experience.length} roles`} />
        <Stat label="Skills Added" value={`+${t.skills_added.length}`} />
        <Stat label="Projects" value={`${t.projects.length}`} />
        <Stat label="Sections" value={`${Object.keys(t.skills).length} cats`} />
      </div>

      {/* Download buttons */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          onClick={() => onDownload(t.id, "docx", t.name)}
          disabled={downloading !== null}
          className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white py-2 rounded-lg font-medium transition-colors text-sm"
        >
          {downloading === t.id + "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} DOCX
        </button>
        <button
          onClick={() => onDownload(t.id, "pdf", t.name)}
          disabled={downloading !== null}
          className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white py-2 rounded-lg font-medium transition-colors text-sm"
        >
          {downloading === t.id + "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF
        </button>
        <button
          onClick={() => onDownload(t.id, "txt", t.name)}
          disabled={downloading !== null}
          className="flex items-center justify-center gap-1.5 bg-amber-700 hover:bg-amber-600 disabled:bg-zinc-700 text-white py-2 rounded-lg font-medium transition-colors text-sm"
          title="ATS-optimized plain text"
        >
          {downloading === t.id + "txt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} TXT
        </button>
        <button
          onClick={() => onDownload(t.id, "zip", t.name)}
          disabled={downloading !== null}
          className="flex items-center justify-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white py-2 rounded-lg font-medium transition-colors text-sm"
        >
          {downloading === t.id + "zip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} ZIP
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-medium text-zinc-200">{value}</p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}
