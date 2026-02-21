import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  generateEmails,
  getCachedTailored,
} from "@/services/api";
import type {
  TailoredResume,
  EmailGenerateResponse,
  GeneratedEmail,
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

export default function EmailPage() {
  const navigate = useNavigate();
  const [tailoredList, setTailoredList] = useState<TailoredResume[]>([]);
  const [selectedTailorId, setSelectedTailorId] = useState<string | null>(null);
  const [emails, setEmails] = useState<EmailGenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getCachedTailored()
      .then((data: TailoredResume[]) => {
        setTailoredList(data);
        if (data.length > 0) {
          setSelectedTailorId(data[data.length - 1].id);
        }
      })
      .catch(() => setError("Failed to load tailored resumes"))
      .finally(() => setReady(true));
  }, []);

  const handleGenerate = async () => {
    if (!selectedTailorId) return;
    const model = getSelectedModel();
    if (!model) {
      setError("Please select a model in Settings first.");
      return;
    }

    setError(null);
    setLoading(true);
    setEmails(null);

    try {
      const result = await generateEmails({
        tailor_id: selectedTailorId,
        provider: model.provider,
        model_key: model.model_key,
      });
      setEmails(result);
    } catch (err: unknown) {
      const detail =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data
              ?.detail
          : null;
      setError(detail ?? "Email generation failed. Check your API key.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Cold Emails</h1>
        <p className="text-zinc-400 mt-1">
          Generate personalized outreach emails for recruiter and hiring manager.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* No tailored resumes */}
      {ready && tailoredList.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-300">
          ⚠️ No tailored resumes found. Complete the tailoring step first.
        </div>
      )}

      {/* Generate Button */}
      {ready && tailoredList.length > 0 && !emails && !loading && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-6 text-center space-y-4">
          <div className="text-4xl">✉️</div>
          <div>
            <h3 className="font-semibold text-zinc-200">Ready to Generate</h3>
            <p className="text-sm text-zinc-400 mt-1">
              AI will write two cold emails: one for the recruiter (impact-focused)
              and one for the hiring manager (technically-focused).
            </p>
          </div>
          {tailoredList.length > 1 && (
            <select
              value={selectedTailorId ?? ""}
              onChange={(e) => setSelectedTailorId(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
            >
              {tailoredList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.keywords_coverage}% coverage
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleGenerate}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-medium transition-colors text-lg"
          >
            Generate Emails
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-8 text-center space-y-3">
          <div className="text-3xl animate-pulse">✍️</div>
          <p className="text-zinc-400 text-sm">
            Writing cold emails… This takes about 15-20 seconds.
          </p>
        </div>
      )}

      {/* Email Results */}
      {emails && (
        <div className="space-y-4">
          {/* Context banner */}
          <div className="bg-zinc-800/30 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-500">
            For <span className="text-zinc-300">{emails.candidate_name}</span> →{" "}
            <span className="text-zinc-300">{emails.job_title}</span> @{" "}
            <span className="text-zinc-300">{emails.company}</span>
          </div>

          {/* Recruiter Email */}
          <EmailCard
            email={emails.recruiter_email}
            label="Recruiter Email"
            description="Performance/impact focused, minimal technical jargon"
            icon="👤"
            onCopy={copyToClipboard}
            copied={copied}
          />

          {/* Hiring Manager Email */}
          <EmailCard
            email={emails.hiring_manager_email}
            label="Hiring Manager Email"
            description="Technically confident, demonstrates domain expertise"
            icon="👨‍💻"
            onCopy={copyToClipboard}
            copied={copied}
          />
        </div>
      )}

      {/* Navigation */}
      {emails && (
        <div className="flex justify-between pt-4">
          <button
            onClick={() => {
              setEmails(null);
            }}
            className="text-zinc-400 hover:text-zinc-200 px-4 py-2 transition-colors"
          >
            ← Re-generate
          </button>
          <button
            onClick={() => navigate("/download")}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            Next: Download All →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Email Card ──────────────────────────────────────────────────────────────
function EmailCard({
  email,
  label,
  description,
  icon,
  onCopy,
  copied,
}: {
  email: GeneratedEmail;
  label: string;
  description: string;
  icon: string;
  onCopy: (text: string, label: string) => void;
  copied: string | null;
}) {
  const [showTips, setShowTips] = useState(false);

  const fullText = `Subject: ${email.subject}\n\n${email.body}`;

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-200 text-sm">
            {icon} {label}
          </h3>
          <p className="text-[10px] text-zinc-500">{description}</p>
        </div>
        <button
          onClick={() => onCopy(fullText, label)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            copied === label
              ? "bg-green-500/20 text-green-300"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          }`}
        >
          {copied === label ? "✓ Copied!" : "📋 Copy"}
        </button>
      </div>

      {/* Subject */}
      <div className="px-4 py-2 border-b border-zinc-800">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
          Subject
        </span>
        <p className="text-sm text-zinc-200 font-medium mt-0.5">
          {email.subject}
        </p>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
          {email.body}
        </p>
      </div>

      {/* Tips */}
      {email.tips.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowTips(!showTips)}
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            {showTips ? "Hide tips ▲" : "💡 Show improvement tips ▼"}
          </button>
          {showTips && (
            <ul className="mt-1.5 space-y-1">
              {email.tips.map((tip, i) => (
                <li key={i} className="text-xs text-zinc-400 flex">
                  <span className="text-blue-400 mr-1.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
