import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  uploadResume,
  getCachedResumes,
  getDriveAuthUrl,
  getDriveStatus,
  disconnectDrive,
  listDriveFiles,
  importFromDrive,
} from "@/services/api";
import type { ParsedResume, DriveFile } from "@/types";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// ── Helper: get selected model from localStorage ────────────────────────────
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

// ── Main Page ───────────────────────────────────────────────────────────────
export default function ResumePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [resumes, setResumes] = useState<ParsedResume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: "pending" | "uploading" | "done" | "error"; error?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Google Drive state
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveFolderLink, setDriveFolderLink] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveImporting, setDriveImporting] = useState(false);
  const [driveImportQueue, setDriveImportQueue] = useState<{ name: string; status: string; error?: string }[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Load cached resumes on first mount
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    setLoaded(true);
    getCachedResumes()
      .then((data: ParsedResume[]) => {
        if (data.length > 0) setResumes(data);
      })
      .catch(() => {});
    // Check Drive auth status
    getDriveStatus()
      .then((r: { authenticated: boolean }) => setDriveConnected(r.authenticated))
      .catch(() => {});
  }

  // Listen for OAuth popup messages
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "drive-auth-success") {
        setDriveConnected(true);
        setDriveError(null);
      } else if (event.data?.type === "drive-auth-error") {
        setDriveError(`Google auth failed: ${event.data.error}`);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Google Drive handlers
  const handleDriveConnect = useCallback(async () => {
    setDriveLoading(true);
    setDriveError(null);
    try {
      const { auth_url } = await getDriveAuthUrl();
      // Open consent in a popup
      const w = 500, h = 600;
      const left = window.screenX + (window.outerWidth - w) / 2;
      const top = window.screenY + (window.outerHeight - h) / 2;
      window.open(auth_url, "drive-auth", `width=${w},height=${h},left=${left},top=${top}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start Google auth";
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? msg
          : msg;
      setDriveError(detail);
    } finally {
      setDriveLoading(false);
    }
  }, []);

  const handleDriveDisconnect = useCallback(async () => {
    try {
      await disconnectDrive();
      setDriveConnected(false);
      setDriveFiles([]);
      setDriveFolderLink("");
    } catch {
      // ignore
    }
  }, []);

  const handleDriveListFiles = useCallback(async () => {
    if (!driveFolderLink.trim()) {
      setDriveError("Please enter a Google Drive folder link.");
      return;
    }
    setDriveLoading(true);
    setDriveError(null);
    setDriveFiles([]);
    try {
      const resp = await listDriveFiles(driveFolderLink);
      setDriveFiles(resp.files);
      if (resp.files.length === 0) {
        setDriveError("No PDF or DOCX files found in this folder.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to list files";
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? msg
          : msg;
      setDriveError(detail);
    } finally {
      setDriveLoading(false);
    }
  }, [driveFolderLink]);

  const handleDriveImport = useCallback(async () => {
    const model = getSelectedModel();
    if (!model) {
      setDriveError("Please select a model in Settings first.");
      return;
    }
    setDriveImporting(true);
    setDriveError(null);
    setDriveImportQueue(driveFiles.map((f) => ({ name: f.name, status: "pending" })));

    try {
      const resp = await importFromDrive(driveFolderLink, model.provider, model.model_key);
      // Update queue with results
      setDriveImportQueue(
        resp.results.map((r: { file_name: string; success: boolean; error?: string }) => ({
          name: r.file_name,
          status: r.success ? "done" : "error",
          error: r.error,
        }))
      );
      // Refresh cached resumes to include new imports
      const cached = await getCachedResumes();
      setResumes(cached);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? msg
          : msg;
      setDriveError(detail);
      setDriveImportQueue([]);
    } finally {
      setDriveImporting(false);
    }
  }, [driveFolderLink, driveFiles]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const model = getSelectedModel();
      if (!model) {
        setError("Please select a model in Settings first.");
        return;
      }

      setError(null);
      setUploading(true);

      const fileArray = Array.from(files);
      const queue = fileArray.map((f) => ({ name: f.name, status: "pending" as const }));
      setUploadQueue(queue);

      const results: ParsedResume[] = [...resumes];

      for (let i = 0; i < fileArray.length; i++) {
        setUploadQueue((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "uploading" } : item
          )
        );

        try {
          const parsed = await uploadResume(fileArray[i], model.provider, model.model_key);
          results.push(parsed);
          setUploadQueue((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "done" } : item
            )
          );
          toast("success", `Parsed: ${parsed.name}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          const detail =
            typeof err === "object" && err !== null && "response" in err
              ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? msg
              : msg;
          setUploadQueue((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: "error", error: detail } : item
            )
          );
        }
      }

      setResumes(results);
      setUploading(false);
    },
    [resumes]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) handleFiles(files);
      e.target.value = ""; // Reset so same file can be selected again
    },
    [handleFiles]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Upload Resumes</h1>
        <p className="text-zinc-400 mt-1">
          Upload one or more resumes (PDF or DOCX). They'll be parsed into structured sections by AI.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-zinc-600 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-400/5 transition-colors cursor-pointer"
        onClick={() => document.getElementById("resume-file-input")?.click()}
      >
        <div className="text-4xl mb-3">📄</div>
        <p className="text-zinc-300 font-medium">
          Drag & drop resume files here
        </p>
        <p className="text-zinc-500 text-sm mt-1">
          or click to browse — accepts .pdf and .docx
        </p>
        <input
          id="resume-file-input"
          type="file"
          accept=".pdf,.docx,.doc"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* ── Google Drive Import ─────────────────────────────────────────── */}
      <div className="border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 bg-zinc-800/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📁</span>
            <div>
              <h3 className="font-semibold text-zinc-200">Import from Google Drive</h3>
              <p className="text-xs text-zinc-500">Connect your Google account and import resumes from a shared folder</p>
            </div>
          </div>
          {driveConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                Connected
              </span>
              <button
                onClick={handleDriveDisconnect}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleDriveConnect}
              disabled={driveLoading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {driveLoading ? "Opening..." : "Connect Google Drive"}
            </button>
          )}
        </div>

        {driveConnected && (
          <div className="px-5 py-4 space-y-4">
            {/* Folder link input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={driveFolderLink}
                onChange={(e) => setDriveFolderLink(e.target.value)}
                placeholder="Paste Google Drive folder link..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-zinc-200 placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                onClick={handleDriveListFiles}
                disabled={driveLoading || !driveFolderLink.trim()}
                className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                {driveLoading ? "Scanning..." : "Scan Folder"}
              </button>
            </div>

            {/* Drive error */}
            {driveError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {driveError}
              </div>
            )}

            {/* Found files */}
            {driveFiles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-zinc-400">
                    Found {driveFiles.length} resume{driveFiles.length !== 1 ? "s" : ""}
                  </h4>
                  <button
                    onClick={handleDriveImport}
                    disabled={driveImporting}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {driveImporting ? "Importing..." : `Import All (${driveFiles.length})`}
                  </button>
                </div>

                <div className="space-y-1.5">
                  {driveFiles.map((f) => {
                    const importResult = driveImportQueue.find((q) => q.name === f.name);
                    const sizeKB = Math.round(parseInt(f.size || "0") / 1024);
                    return (
                      <div
                        key={f.id}
                        className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">
                            {f.name.endsWith(".pdf") ? "📕" : "📘"}
                          </span>
                          <span className="text-sm text-zinc-300 truncate">{f.name}</span>
                          <span className="text-xs text-zinc-600 shrink-0">
                            {sizeKB > 0 ? `${sizeKB} KB` : ""}
                          </span>
                        </div>
                        <span className="text-xs shrink-0 ml-2">
                          {!importResult && !driveImporting && (
                            <span className="text-zinc-500">Ready</span>
                          )}
                          {driveImporting && !importResult && (
                            <span className="text-blue-400 animate-pulse">Waiting...</span>
                          )}
                          {importResult?.status === "done" && (
                            <span className="text-green-400">✓ Imported</span>
                          )}
                          {importResult?.status === "error" && (
                            <span className="text-red-400" title={importResult.error}>
                              ✗ Failed
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-400">Upload Progress</h3>
          {uploadQueue.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-2"
            >
              <span className="text-sm text-zinc-300 truncate max-w-[70%]">
                {item.name}
              </span>
              <span className="text-xs">
                {item.status === "pending" && (
                  <span className="text-zinc-500">Waiting...</span>
                )}
                {item.status === "uploading" && (
                  <span className="text-blue-400 animate-pulse">Parsing...</span>
                )}
                {item.status === "done" && (
                  <span className="text-green-400">✓ Done</span>
                )}
                {item.status === "error" && (
                  <span className="text-red-400" title={item.error}>
                    ✗ Failed
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Parsed Resumes */}
      {resumes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Parsed Resumes ({resumes.length})
            </h2>
            <button
              onClick={() => setConfirmClearAll(true)}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Clear All
            </button>

            {confirmClearAll && (
              <ConfirmDialog
                title="Clear all resumes?"
                message="This will remove all parsed resumes from this session. You'll need to re-upload them."
                confirmLabel="Clear All"
                destructive
                onConfirm={() => {
                  setResumes([]);
                  setUploadQueue([]);
                  setConfirmClearAll(false);
                  toast("success", "All resumes cleared");
                }}
                onCancel={() => setConfirmClearAll(false)}
              />
            )}
          </div>

          {resumes.map((resume) => (
            <ResumeCard
              key={resume.id}
              resume={resume}
              expanded={expandedId === resume.id}
              onToggle={() =>
                setExpandedId(expandedId === resume.id ? null : resume.id)
              }
            />
          ))}
        </div>
      )}

      {/* Navigation */}
      {resumes.length > 0 && !uploading && (
        <div className="flex justify-end pt-4">
          <button
            onClick={() => navigate("/score")}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            Next: ATS Scoring →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Resume Card Component ───────────────────────────────────────────────────
function ResumeCard({
  resume,
  expanded,
  onToggle,
}: {
  resume: ParsedResume;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-700/30 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-lg">📄</span>
            <div>
              <h3 className="font-semibold text-zinc-200">{resume.name}</h3>
              <p className="text-xs text-zinc-500 truncate">
                {resume.file_name} • {resume.skills.length} skills • {resume.experience.length} roles
              </p>
            </div>
          </div>
        </div>
        <span className="text-zinc-500 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-zinc-700 p-4 space-y-4">
          {/* Contact */}
          {resume.contact && (
            <Section title="Contact">
              <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
                {resume.contact.email && <span>📧 {resume.contact.email}</span>}
                {resume.contact.phone && <span>📱 {resume.contact.phone}</span>}
                {resume.contact.linkedin && <span>🔗 {resume.contact.linkedin}</span>}
                {resume.contact.location && <span>📍 {resume.contact.location}</span>}
              </div>
            </Section>
          )}

          {/* Tagline */}
          {resume.tagline && (
            <Section title="Tagline">
              <p className="text-sm text-zinc-300 italic">{resume.tagline}</p>
            </Section>
          )}

          {/* Summary */}
          {resume.summary && (
            <Section title="Summary">
              <p className="text-sm text-zinc-300">{resume.summary}</p>
            </Section>
          )}

          {/* Skills */}
          {resume.skills.length > 0 && (
            <Section title="Skills">
              <div className="flex flex-wrap gap-1.5">
                {resume.skills.map((skill, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded text-xs"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Experience */}
          {resume.experience.length > 0 && (
            <Section title="Experience">
              <div className="space-y-3">
                {resume.experience.map((exp, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-sm font-medium text-zinc-200">
                        {exp.title} @ {exp.company}
                      </h4>
                      <span className="text-xs text-zinc-500 shrink-0 ml-2">
                        {exp.dates}
                      </span>
                    </div>
                    {exp.bullets.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {exp.bullets.map((b, j) => (
                          <li key={j} className="text-xs text-zinc-400 flex">
                            <span className="text-zinc-600 mr-1.5">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Projects */}
          {resume.projects.length > 0 && (
            <Section title="Projects">
              <div className="space-y-3">
                {resume.projects.map((proj, i) => (
                  <div key={i}>
                    <h4 className="text-sm font-medium text-zinc-200">
                      {proj.name}
                    </h4>
                    {proj.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {proj.technologies.map((t, j) => (
                          <span
                            key={j}
                            className="px-1.5 py-0.5 bg-purple-500/15 text-purple-300 rounded text-[10px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {proj.bullets.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {proj.bullets.map((b, j) => (
                          <li key={j} className="text-xs text-zinc-400 flex">
                            <span className="text-zinc-600 mr-1.5">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Education */}
          {resume.education.length > 0 && (
            <Section title="Education">
              <div className="space-y-1">
                {resume.education.map((edu, i) => (
                  <div key={i} className="text-sm text-zinc-300">
                    <span className="font-medium">{edu.degree}</span>
                    <span className="text-zinc-500"> — {edu.school}</span>
                    {edu.year && (
                      <span className="text-zinc-600 text-xs ml-2">({edu.year})</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Certifications */}
          {resume.certifications.length > 0 && (
            <Section title="Certifications">
              <div className="flex flex-wrap gap-1.5">
                {resume.certifications.map((cert, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-green-500/15 text-green-300 rounded text-xs"
                  >
                    {cert}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section Wrapper ─────────────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
        {title}
      </h4>
      {children}
    </div>
  );
}
