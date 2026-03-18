import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { parseJDText, parseJDUrl, patchJD } from "@/services/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ParsedJD } from "@/types";
import {
  Loader2,
  Link as LinkIcon,
  FileText,
  CheckCircle2,
  Briefcase,
  MapPin,
  GraduationCap,
  Clock,
  Tag,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getSelectedModel } from "@/constants/providers";

const JD_TYPE_LABELS: Record<string, string> = {
  java_backend: "☕ Java Backend",
  python_backend: "🐍 Python Backend",
  ai_ml: "🤖 AI / ML",
  frontend: "🎨 Frontend",
  fullstack: "🔧 Full Stack",
  new_grad: "🎓 New Grad / Entry",
};

// ── Component ───────────────────────────────────────────────────────────────

type InputMode = "text" | "url";

export default function JDPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [parsedJD, setParsedJD] = useState<ParsedJD | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const selectedModel = getSelectedModel();

  const textMutation = useMutation({
    mutationFn: () => {
      if (!selectedModel) throw new Error("No model selected");
      return parseJDText(text, selectedModel.provider, selectedModel.model_key);
    },
    onSuccess: (data) => setParsedJD(data),
  });

  const urlMutation = useMutation({
    mutationFn: () => {
      if (!selectedModel) throw new Error("No model selected");
      return parseJDUrl(url, selectedModel.provider, selectedModel.model_key);
    },
    onSuccess: (data) => setParsedJD(data),
  });

  const isLoading = textMutation.isPending || urlMutation.isPending;
  const error = textMutation.error || urlMutation.error;

  const handleParse = () => {
    if (mode === "text") {
      textMutation.mutate();
    } else {
      urlMutation.mutate();
    }
  };

  const canSubmit =
    selectedModel &&
    ((mode === "text" && text.trim().length > 50) ||
      (mode === "url" && url.trim().startsWith("http")));

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Briefcase className="h-6 w-6" /> Job Description
        </h1>
        <p className="text-muted-foreground mt-1">
          Paste a job description or provide a URL to scrape it automatically.
        </p>
      </div>

      {/* No model warning */}
      {!selectedModel && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ No LLM model selected.{" "}
          <button
            onClick={() => navigate("/settings")}
            className="font-medium underline hover:no-underline"
          >
            Go to Settings
          </button>{" "}
          to add an API key first.
        </div>
      )}

      {/* Input mode toggle */}
      {!parsedJD && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setMode("text")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                mode === "text"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <FileText className="h-4 w-4" /> Paste Text
            </button>
            <button
              onClick={() => setMode("url")}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                mode === "url"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              <LinkIcon className="h-4 w-4" /> From URL
            </button>
          </div>

          {/* Input */}
          <div className="rounded-lg border border-border p-4 space-y-4">
            {mode === "text" ? (
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Job Description Text
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the full job description here..."
                  rows={12}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {text.length} characters{" "}
                  {text.length < 50 && text.length > 0 && (
                    <span className="text-amber-600">
                      — need at least 50 characters
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Job Listing URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/company/jobs/12345"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supports LinkedIn, Greenhouse, Lever, Workday, and most job
                  boards
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
                {(error as Error).message || "Something went wrong. Try again."}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleParse}
              disabled={!canSubmit || isLoading}
              className={cn(
                "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center justify-center gap-2"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "url" ? "Scraping & Parsing..." : "Parsing..."}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Parse Job Description
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Parsed JD display */}
      {parsedJD && !editMode && <ParsedJDView jd={parsedJD} showRaw={showRaw} setShowRaw={setShowRaw} />}
      {parsedJD && editMode && (
        <JDEditView
          jd={parsedJD}
          onSave={(updated) => { setParsedJD(updated); setEditMode(false); }}
          onCancel={() => setEditMode(false)}
        />
      )}

      {/* Actions after parsing */}
      {parsedJD && !editMode && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setEditMode(true)}
            className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 transition-colors"
          >
            Fix LLM mistakes
          </button>
        </div>
      )}

      {parsedJD && (
        <div className="flex gap-3">
          <button
            onClick={() => {
              setParsedJD(null);
              setText("");
              setUrl("");
            }}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Parse Another JD
          </button>
          <button
            onClick={() => navigate("/resume")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            Next: Upload Resume <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── ParsedJD View ───────────────────────────────────────────────────────────

function ParsedJDView({
  jd,
  showRaw,
  setShowRaw,
}: {
  jd: ParsedJD;
  showRaw: boolean;
  setShowRaw: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-green-800">
            Job description parsed successfully
          </p>
          <p className="text-sm text-green-700 mt-0.5">
            {jd.required_skills.length} required skills,{" "}
            {jd.preferred_skills.length} preferred skills,{" "}
            {jd.keywords_to_match.length} keywords identified
            {jd.created_at && <span className="ml-2 opacity-70">· {formatRelativeTime(jd.created_at)}</span>}
          </p>
        </div>
      </div>

      {/* Title / Company / Location / Type */}
      <div className="rounded-lg border border-border p-5 space-y-3">
        <div>
          <h2 className="text-xl font-bold">{jd.job_title}</h2>
          <p className="text-muted-foreground">{jd.company}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {jd.location && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {jd.location}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <Tag className="h-3 w-3" />{" "}
            {JD_TYPE_LABELS[jd.jd_type] ?? jd.jd_type}
          </span>
          {jd.required_experience_years != null && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />{" "}
              {jd.required_experience_years}+ years
            </span>
          )}
          {jd.education && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" /> {jd.education}
            </span>
          )}
        </div>
      </div>

      {/* Skills */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SkillList
          title="Required Skills"
          skills={jd.required_skills}
          color="red"
        />
        <SkillList
          title="Preferred Skills"
          skills={jd.preferred_skills}
          color="amber"
        />
      </div>

      {/* Responsibilities */}
      {jd.key_responsibilities.length > 0 && (
        <div className="rounded-lg border border-border p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Key Responsibilities
          </h3>
          <ul className="space-y-1.5 text-sm">
            {jd.key_responsibilities.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Keywords */}
      {jd.keywords_to_match.length > 0 && (
        <div className="rounded-lg border border-border p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Keywords to Match
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {jd.keywords_to_match.map((kw, i) => (
              <span
                key={i}
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Raw text toggle */}
      <button
        onClick={() => setShowRaw(!showRaw)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {showRaw ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        {showRaw ? "Hide" : "Show"} raw JD text
      </button>
      {showRaw && (
        <pre className="rounded-lg border border-border bg-muted/50 p-4 text-xs leading-relaxed overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
          {jd.raw_text}
        </pre>
      )}
    </div>
  );
}

// ── JD Edit View ─────────────────────────────────────────────────────────────

function JDEditView({
  jd,
  onSave,
  onCancel,
}: {
  jd: ParsedJD;
  onSave: (updated: ParsedJD) => void;
  onCancel: () => void;
}) {
  const [jobTitle, setJobTitle] = useState(jd.job_title);
  const [company, setCompany] = useState(jd.company);
  const [requiredSkills, setRequiredSkills] = useState(jd.required_skills.join(", "));
  const [preferredSkills, setPreferredSkills] = useState(jd.preferred_skills.join(", "));
  const [keywords, setKeywords] = useState(jd.keywords_to_match.join(", "));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = {
        job_title: jobTitle.trim(),
        company: company.trim(),
        required_skills: requiredSkills.split(",").map((s) => s.trim()).filter(Boolean),
        preferred_skills: preferredSkills.split(",").map((s) => s.trim()).filter(Boolean),
        keywords_to_match: keywords.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const updated = await patchJD(jd.id, patch);
      onSave(updated);
    } catch {
      // ignore — user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-5 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Edit JD Fields</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Job Title</label>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Company</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Required Skills (comma-separated)</label>
        <textarea
          value={requiredSkills}
          onChange={(e) => setRequiredSkills(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Preferred Skills (comma-separated)</label>
        <textarea
          value={preferredSkills}
          onChange={(e) => setPreferredSkills(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Keywords to Match (comma-separated)</label>
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save Changes
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── SkillList sub-component ─────────────────────────────────────────────────

function SkillList({
  title,
  skills,
  color,
}: {
  title: string;
  skills: string[];
  color: "red" | "amber";
}) {
  if (skills.length === 0) return null;
  const bgColor = color === "red" ? "bg-red-50" : "bg-amber-50";
  const textColor = color === "red" ? "text-red-700" : "text-amber-700";
  const chipBg = color === "red" ? "bg-red-100" : "bg-amber-100";

  return (
    <div className={cn("rounded-lg border p-4", bgColor)}>
      <h3
        className={cn(
          "text-sm font-semibold uppercase tracking-wider mb-2",
          textColor
        )}
      >
        {title} ({skills.length})
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill, i) => (
          <span
            key={i}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              chipBg,
              textColor
            )}
          >
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}
