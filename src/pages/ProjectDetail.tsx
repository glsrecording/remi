import { useState, useEffect, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

// Emerald — the Projects accent. Distinct from amber reminders (#f59e0b) and the
// green-500 done chip (#22c55e). Kept in sync with PROJECT_COLOR in Tasks.tsx.
const PROJECT_COLOR = "#10b981";

// Per-category colors — mirrors Tasks.tsx so task chips read consistently.
const CATEGORY_COLORS: Record<string, string> = {
  Communication: "#ef4444",
  General:       "#f97316",
  Filming:       "#f59e0b",
  Admin:         "#3b82f6",
  Writing:       "#ec4899",
  Studio:        "#22c55e",
};

interface Project {
  id: string;
  name: string;
  area: string | null;
  status: string | null;
  next_action: string | null;
  focus_date: string | null;
  notes: string | null;
  task_ids: string[];
}

interface PTask {
  id: string;
  title: string;
  url: string;
  notion_url?: string;
  sort_order?: number | null;
  category?: string;
  status?: string;
  priority?: string;
  scheduled_date?: string | null;
}

interface ProjectTasks {
  today: PTask[];
  coming_soon: PTask[];
}

async function fetchProjectsMeta(): Promise<Project[]> {
  const res = await fetch(`${JARVIS_URL}/projects`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return (data.projects ?? []) as Project[];
}

async function fetchProjectTasks(projectId: string): Promise<ProjectTasks> {
  const res = await fetch(
    `${JARVIS_URL}/projects/${encodeURIComponent(projectId)}/tasks`,
    { headers: { Authorization: `Bearer ${REMI_API_KEY}` } },
  );
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return {
    today: (data.today ?? []) as PTask[],
    coming_soon: (data.coming_soon ?? []) as PTask[],
  };
}

// "2026-06-12" → "Jun 12"; returns "" for null/empty.
function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = MONTHS[parseInt(m[2], 10) - 1] ?? "";
  return `${mon} ${parseInt(m[3], 10)}`;
}

// Read-only task card, styled to match the Tasks.tsx swipe cards. Tap opens the
// Notion page. Swipe-to-done is intentionally NOT wired here — that gesture is
// tightly coupled to the Tasks.tsx bucket state and is out of scope for v1.
function ProjectTaskCard({ task, showDate }: { task: PTask; showDate?: boolean }) {
  const cat = task.category || "";
  const catColor = CATEGORY_COLORS[cat] ?? PROJECT_COLOR;
  const dateLabel = showDate ? fmtDate(task.scheduled_date) : "";
  return (
    <div
      className="relative flex items-start gap-3 px-4 py-3.5 rounded-xl select-none cursor-pointer transition-all active:scale-[0.99]"
      style={{
        background: "var(--t-card)",
        borderLeft: `3px solid ${PROJECT_COLOR}70`,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
      onClick={() => {
        const link = task.url || task.notion_url;
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }}
    >
      <p
        className="text-lg leading-snug flex-1 min-w-0 whitespace-normal break-words"
        style={{ color: "var(--t-text2)" }}
      >
        {task.title}
      </p>
      {dateLabel && (
        <span
          className="shrink-0 mt-1 rounded px-2 py-1"
          style={{
            background: PROJECT_COLOR + "1f",
            color: PROJECT_COLOR,
            border: `1px solid ${PROJECT_COLOR}55`,
            fontFamily: "'Space Mono', monospace",
            fontSize: "9px",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {dateLabel}
        </span>
      )}
      {cat && (
        <span
          className="shrink-0 rounded px-3 py-1.5 mt-1"
          style={{
            background: catColor + "33",
            color: catColor,
            border: `1px solid ${catColor}`,
            fontFamily: "'Space Mono', monospace",
            fontSize: "9px",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {cat}
        </span>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id ? decodeURIComponent(params.id) : "";

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTasks>({ today: [], coming_soon: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comingOpen, setComingOpen] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setError("missing id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [metas, pt] = await Promise.all([
        fetchProjectsMeta(),
        fetchProjectTasks(projectId),
      ]);
      setProject(metas.find((p) => p.id === projectId) ?? null);
      setTasks(pt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const backToTasks = () => navigate("/tasks");

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg-deep)" }}>
      {/* Header — back returns to the task list (not home) */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background: "var(--t-surface)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <button
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors -ml-1"
          style={{ color: "var(--t-text5)" }}
          onClick={backToTasks}
          aria-label="Back to tasks"
          data-testid="button-back-projects"
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="text-base font-bold tracking-tight flex-1 min-w-0 truncate"
          style={{ fontFamily: "'Space Mono', monospace", color: PROJECT_COLOR }}
        >
          {project?.name ?? "Project"}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-5 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {/* Next Action context line under the title */}
        {project?.next_action && (
          <p className="text-sm leading-snug" style={{ color: "var(--t-text5)" }}>
            {project.next_action}
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 size={18} className="animate-spin" style={{ color: PROJECT_COLOR }} />
            <span className="text-sm text-white/40">Loading project…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-red-400/80">Couldn't load project tasks ({error})</p>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: PROJECT_COLOR + "20", color: PROJECT_COLOR }}
              onClick={load}
            >
              Retry
            </button>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium text-white/50"
              onClick={backToTasks}
            >
              Back to tasks
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* TODAY — open by default */}
            <div className="space-y-2">
              <p
                className="text-xs uppercase tracking-widest px-1"
                style={{ color: "var(--t-text6)", fontFamily: "'Space Mono', monospace" }}
              >
                Today
              </p>
              {tasks.today.length > 0 ? (
                <div className="space-y-1.5">
                  {tasks.today.map((t) => (
                    <ProjectTaskCard key={t.id} task={t} />
                  ))}
                </div>
              ) : tasks.coming_soon.length > 0 ? (
                <p className="text-sm py-2 px-1" style={{ color: "var(--t-text5)" }}>
                  Nothing scheduled for today — check Coming Soon
                </p>
              ) : (
                <p className="text-sm py-2 px-1" style={{ color: "var(--t-text5)" }}>
                  No tasks linked to this project yet.
                </p>
              )}
            </div>

            {/* COMING SOON — collapsed by default */}
            {tasks.coming_soon.length > 0 && (
              <div className="space-y-2">
                <button
                  className="w-full flex items-center gap-2 px-1 py-1 transition-colors"
                  onClick={() => setComingOpen((o) => !o)}
                >
                  {comingOpen
                    ? <ChevronDown size={16} style={{ color: "var(--t-text6)" }} />
                    : <ChevronRight size={16} style={{ color: "var(--t-text6)" }} />}
                  <span
                    className="text-xs uppercase tracking-widest"
                    style={{ color: "var(--t-text6)", fontFamily: "'Space Mono', monospace" }}
                  >
                    Coming Soon ({tasks.coming_soon.length})
                  </span>
                </button>
                {comingOpen && (
                  <div className="space-y-1.5">
                    {tasks.coming_soon.map((t) => (
                      <ProjectTaskCard key={t.id} task={t} showDate />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
