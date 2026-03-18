import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProjects,
  createProject,
  deleteProject,
  updateProject,
  selectProjectsForJD,
  getCachedJDs,
  rewriteProjectBullets,
} from "@/services/api";
import type { ProjectBankEntry, SelectedProject, ParsedJD } from "@/types";
import { Loader2, Pencil, Trash2, Wand2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { getSelectedModel } from "@/constants/providers";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectBankEntry[]>([]);
  const [jds, setJds] = useState<ParsedJD[]>([]);
  const [selected, setSelected] = useState<SelectedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-project form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formBullets, setFormBullets] = useState("");
  const [formSkills, setFormSkills] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [projData, jdData] = await Promise.all([
        getProjects(),
        getCachedJDs(),
      ]);
      setProjects(projData);
      setJds(jdData);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAddProject = async () => {
    if (!formName.trim() || !formBullets.trim()) return;
    setError(null);
    try {
      await createProject({
        name: formName.trim(),
        bullets: formBullets
          .split("\n")
          .map((b) => b.replace(/^[-•]\s*/, "").trim())
          .filter(Boolean),
        skills: formSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setFormName("");
      setFormBullets("");
      setFormSkills("");
      setShowForm(false);
      await refresh();
      toast("success", `Project "${formName.trim()}" added`);
    } catch {
      setError("Failed to add project");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteProject(id);
      await refresh();
      toast("success", `Project "${name}" deleted`);
    } catch {
      setError("Failed to delete project");
    }
  };

  const handleUpdate = async (id: string, name: string, data: { name?: string; bullets?: string[]; skills?: string[] }) => {
    try {
      await updateProject(id, data);
      await refresh();
      toast("success", `Project "${name}" updated`);
    } catch {
      setError("Failed to update project");
    }
  };

  const handleSelectBest = async () => {
    if (jds.length === 0 || projects.length === 0) return;
    setSelecting(true);
    setError(null);
    try {
      const jdId = jds[jds.length - 1].id;
      const result = await selectProjectsForJD(jdId);
      setSelected(result);
      toast("success", `Selected ${result.length} best-matching projects`);
    } catch {
      setError("Failed to select projects. Add more projects or parse a JD first.");
    } finally {
      setSelecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project Bank</h1>
          <p className="text-zinc-400 mt-1">
            Manage your projects. The best 2 will be auto-selected for each JD.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Project"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
          <h3 className="font-medium text-zinc-200 text-sm">New Project</h3>
          <input
            type="text"
            placeholder="Project name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <textarea
            placeholder="Bullet points (one per line)&#10;- Built a REST API serving 10K requests/day&#10;- Implemented JWT authentication with role-based access"
            value={formBullets}
            onChange={(e) => setFormBullets(e.target.value)}
            rows={4}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none resize-none"
          />
          <input
            type="text"
            placeholder="Skills (comma-separated): React, Python, Docker"
            value={formSkills}
            onChange={(e) => setFormSkills(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleAddProject}
            disabled={!formName.trim() || !formBullets.trim()}
            className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Save Project
          </button>
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading projects…</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">📁</div>
          <p className="text-zinc-400">
            No projects yet. Add your projects to include them in tailored resumes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((proj) => (
            <ProjectCard key={proj.id} project={proj} jds={jds} onDelete={(id) => handleDelete(id, proj.name)} onUpdate={(id, data) => handleUpdate(id, proj.name, data)} />
          ))}
        </div>
      )}

      {/* Select Best Projects */}
      {projects.length >= 2 && jds.length > 0 && (
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-zinc-200 text-sm">Auto-Select for JD</h3>
              <p className="text-xs text-zinc-500">
                Pick the 2 most relevant projects for the latest parsed JD.
              </p>
            </div>
            <button
              onClick={handleSelectBest}
              disabled={selecting}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {selecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : "🎯 Select Best 2"}
            </button>
          </div>

          {/* Selected results */}
          {selected.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-700">
              <p className="text-xs text-zinc-500 font-medium">Selected Projects:</p>
              {selected.map((s, i) => (
                <div
                  key={i}
                  className="bg-green-500/5 border border-green-500/20 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-green-300">
                      #{i + 1} {s.name}
                    </span>
                    <span className="text-xs text-green-400 font-mono">
                      {s.score}% match
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={() => navigate("/tailor")}
          className="text-zinc-400 hover:text-zinc-200 px-4 py-2 transition-colors"
        >
          ← Back to Tailor
        </button>
        <button
          onClick={() => navigate("/email")}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          Next: Generate Emails →
        </button>
      </div>
    </div>
  );
}

// ── Project Card ────────────────────────────────────────────────────────────
function ProjectCard({
  project,
  jds,
  onDelete,
  onUpdate,
}: {
  project: ProjectBankEntry;
  jds: ParsedJD[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: { name?: string; bullets?: string[]; skills?: string[] }) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editBullets, setEditBullets] = useState(project.bullets.join("\n"));
  const [editSkills, setEditSkills] = useState(project.skills.join(", "));

  // Rewrite state
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteJdId, setRewriteJdId] = useState<string>(jds[jds.length - 1]?.id ?? "");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteResult, setRewriteResult] = useState<{ original_bullets: string[]; rewritten_bullets: string[]; keywords_used: string[] } | null>(null);

  const handleSave = () => {
    onUpdate(project.id, {
      name: editName.trim(),
      bullets: editBullets
        .split("\n")
        .map((b) => b.replace(/^[-•]\s*/, "").trim())
        .filter(Boolean),
      skills: editSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(project.name);
    setEditBullets(project.bullets.join("\n"));
    setEditSkills(project.skills.join(", "));
    setEditing(false);
  };

  const handleRewrite = async () => {
    const model = getSelectedModel();
    if (!model) { toast("error", "Select a model in Settings first"); return; }
    if (!rewriteJdId) { toast("error", "Select a JD first"); return; }
    setRewriting(true);
    setRewriteResult(null);
    try {
      const result = await rewriteProjectBullets(project.id, rewriteJdId, model.provider, model.model_key);
      setRewriteResult(result);
    } catch {
      toast("error", "Rewrite failed. Check your API key and try again.");
    } finally {
      setRewriting(false);
    }
  };

  const handleAcceptRewrite = () => {
    if (!rewriteResult) return;
    onUpdate(project.id, { bullets: rewriteResult.rewritten_bullets });
    setRewriteResult(null);
    setShowRewrite(false);
    toast("success", "Bullets updated with rewritten version");
  };

  if (editing) {
    return (
      <div className="bg-zinc-800/50 border border-blue-500/30 rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-medium text-blue-400">Editing Project</h4>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
          placeholder="Project name"
        />
        <textarea
          value={editBullets}
          onChange={(e) => setEditBullets(e.target.value)}
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none resize-none"
          placeholder="Bullet points (one per line)"
        />
        <input
          type="text"
          value={editSkills}
          onChange={(e) => setEditSkills(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-blue-500 focus:outline-none"
          placeholder="Skills (comma-separated)"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!editName.trim() || !editBullets.trim()}
            className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="text-zinc-400 hover:text-zinc-200 px-3 py-1.5 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-left flex-1"
        >
          <h4 className="text-sm font-medium text-zinc-200">{project.name}</h4>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {project.skills.slice(0, 6).map((skill, j) => (
              <span
                key={j}
                className="px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded text-[10px]"
              >
                {skill}
              </span>
            ))}
            {project.skills.length > 6 && (
              <span className="text-[10px] text-zinc-500">
                +{project.skills.length - 6} more
              </span>
            )}
          </div>
        </button>
        <div className="flex gap-1 ml-2">
          {jds.length > 0 && (
            <button
              onClick={() => { setShowRewrite(!showRewrite); setRewriteResult(null); }}
              className={`p-1.5 rounded-md transition-colors text-zinc-600 ${showRewrite ? "bg-purple-500/20 text-purple-400" : "hover:text-purple-400 hover:bg-purple-400/10"}`}
              title="Rewrite bullets for JD"
            >
              <Wand2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="text-zinc-600 hover:text-blue-400 p-1.5 rounded-md hover:bg-blue-400/10 transition-colors"
            title="Edit project"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-zinc-600 hover:text-red-400 p-1.5 rounded-md hover:bg-red-400/10 transition-colors"
            title="Delete project"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete project?"
          message={`"${project.name}" will be permanently removed from your project bank.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => { setConfirmDelete(false); onDelete(project.id); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {expanded && (
        <ul className="mt-2 space-y-1 border-t border-zinc-700/50 pt-2">
          {project.bullets.map((b, j) => (
            <li key={j} className="text-xs text-zinc-300 flex">
              <span className="text-zinc-600 mr-1.5">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Rewrite panel */}
      {showRewrite && (
        <div className="mt-3 border-t border-zinc-700/50 pt-3 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 shrink-0">Rewrite for JD:</label>
            <select
              value={rewriteJdId}
              onChange={(e) => setRewriteJdId(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200"
            >
              {jds.map((jd) => (
                <option key={jd.id} value={jd.id}>{jd.job_title} @ {jd.company}</option>
              ))}
            </select>
            <button
              onClick={handleRewrite}
              disabled={rewriting || !rewriteJdId}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              {rewriting ? <><Loader2 className="h-3 w-3 animate-spin" /> Rewriting…</> : "Rewrite"}
            </button>
          </div>

          {rewriteResult && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-medium text-zinc-500 mb-1">Original</p>
                  <ul className="space-y-1">
                    {rewriteResult.original_bullets.map((b, i) => (
                      <li key={i} className="text-xs text-zinc-500 flex"><span className="mr-1">•</span>{b}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-purple-400 mb-1">Rewritten</p>
                  <ul className="space-y-1">
                    {rewriteResult.rewritten_bullets.map((b, i) => (
                      <li key={i} className="text-xs text-zinc-200 flex"><span className="mr-1">•</span>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {rewriteResult.keywords_used.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-zinc-500">Keywords added:</span>
                  {rewriteResult.keywords_used.map((kw, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-purple-500/10 text-purple-300 rounded text-[10px]">{kw}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAcceptRewrite}
                  className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => setRewriteResult(null)}
                  className="text-zinc-400 hover:text-zinc-200 px-3 py-1 text-xs transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
