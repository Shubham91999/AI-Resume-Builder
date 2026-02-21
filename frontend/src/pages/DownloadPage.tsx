import { useState, useEffect } from "react";
import { downloadDocx, downloadPdf, downloadZip, getCachedTailored, getScoreComparison } from "@/services/api";
import type { TailoredResume, ScoreComparison } from "@/types";

export default function DownloadPage() {
  const [tailoredList, setTailoredList] = useState<TailoredResume[]>([]);
  const [scoreComparisons, setScoreComparisons] = useState<Record<string, ScoreComparison>>({});
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCachedTailored()
      .then(async (data: TailoredResume[]) => {
        setTailoredList(data);
        // Fetch score comparisons for each tailored resume
        for (const t of data) {
          try {
            const comparison = await getScoreComparison(t.id);
            setScoreComparisons((prev) => ({ ...prev, [t.id]: comparison }));
          } catch {
            // Score comparison may not be available if caches expired
          }
        }
      })
      .catch(() => setError("Failed to load tailored resumes"))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (
    tailorId: string,
    format: "docx" | "pdf" | "zip",
    name: string
  ) => {
    setDownloading(tailorId + format);
    setError(null);
    try {
      const blob =
        format === "docx"
          ? await downloadDocx(tailorId)
          : format === "pdf"
          ? await downloadPdf(tailorId)
          : await downloadZip(tailorId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/\s+/g, "_")}_Tailored.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to download ${format.toUpperCase()}`);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Download</h1>
        <p className="text-zinc-400 mt-1">
          Export your tailored resume as a professional DOCX document.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-center py-12">Loading…</div>
      ) : tailoredList.length === 0 ? (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-8 text-center space-y-2">
          <div className="text-3xl">📄</div>
          <p className="text-zinc-400">
            No tailored resumes found. Complete the tailoring step first.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tailoredList.map((t) => (
            <div
              key={t.id}
              className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-zinc-200">{t.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    JD: {t.jd_id.slice(0, 8)}… · Keyword Coverage:{" "}
                    <span
                      className={
                        t.keywords_coverage >= 70
                          ? "text-green-400"
                          : t.keywords_coverage >= 50
                          ? "text-amber-400"
                          : "text-red-400"
                      }
                    >
                      {t.keywords_coverage}%
                    </span>
                  </p>
                </div>
              </div>

              {/* Before/After ATS Score */}
              {scoreComparisons[t.id] && (
                <div className="mb-4 bg-zinc-900/50 border border-zinc-700/50 rounded-lg p-3">
                  <h4 className="text-xs font-medium text-zinc-400 mb-2">ATS Score Comparison</h4>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-zinc-400">
                        {scoreComparisons[t.id].before.overall_score.toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-zinc-500">Before</p>
                    </div>
                    <div className="text-zinc-600 text-xl">→</div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-400">
                        {scoreComparisons[t.id].after.overall_score.toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-zinc-500">After</p>
                    </div>
                    <div className={`ml-auto text-sm font-semibold ${scoreComparisons[t.id].improvement_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {scoreComparisons[t.id].improvement_pct >= 0 ? "+" : ""}
                      {scoreComparisons[t.id].improvement_pct.toFixed(1)}%
                    </div>
                  </div>
                  {scoreComparisons[t.id].keywords_added.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-[10px] text-zinc-500 mr-1">Added:</span>
                      {scoreComparisons[t.id].keywords_added.slice(0, 8).map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-green-500/10 text-green-300 rounded text-[10px]">
                          +{kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <Stat
                  label="Experience"
                  value={`${t.experience.length} roles`}
                />
                <Stat
                  label="Skills Added"
                  value={`+${t.skills_added.length}`}
                />
                <Stat
                  label="Projects"
                  value={`${t.projects.length}`}
                />
                <Stat
                  label="Sections"
                  value={`${Object.keys(t.skills).length} categories`}
                />
              </div>

              {/* Download buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleDownload(t.id, "docx", t.name)}
                  disabled={downloading !== null}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white py-2.5 rounded-lg font-medium transition-colors text-sm"
                >
                  {downloading === t.id + "docx" ? "Generating…" : "📄 DOCX"}
                </button>
                <button
                  onClick={() => handleDownload(t.id, "pdf", t.name)}
                  disabled={downloading !== null}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white py-2.5 rounded-lg font-medium transition-colors text-sm"
                >
                  {downloading === t.id + "pdf" ? "Converting…" : "📑 PDF"}
                </button>
                <button
                  onClick={() => handleDownload(t.id, "zip", t.name)}
                  disabled={downloading !== null}
                  className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white py-2.5 rounded-lg font-medium transition-colors text-sm"
                >
                  📦 ZIP
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
