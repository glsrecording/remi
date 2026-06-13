import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";
import { Loader2, RefreshCw, ExternalLink, GripVertical, Film, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

// Screen identity — Content is the creative / AI-adjacent screen → tonight purple.
const ACCENT = "#9b8de8";       // --color-tonight
const DONE_GREEN = "#5bc468";   // --color-done — top-3 priority accent bar

const STAGE_FILTERS = ["All", "AI Draft", "My Rewrite", "Final", "Filmed", "Posted"];

// Per-stage status color, mapped onto the design-system context palette. Kept as
// hex so the `color + "22"` alpha-concat pattern works (same approach as Tasks).
//   AI Draft   → gray   (--text-secondary)  raw AI output
//   My Rewrite → amber  (--color-tasks)      draft in progress
//   Final      → blue   (--color-calls)      ready
//   Filmed     → teal   (--color-studio)
//   Posted     → green  (--color-done)       published
const STAGE_COLORS: Record<string, string> = {
  "AI Draft":   "#888890",
  "My Rewrite": "#f5a623",
  "Final":      "#378add",
  "Filmed":     "#3dd6b0",
  "Posted":     "#5bc468",
};

// Per-content-type icon for the card's icon square.
const TYPE_ICONS: Record<string, LucideIcon> = {
  "Short-Form": Film,
  "Long-Form":  Youtube,
};

interface Script {
  page_id:      string;
  name:         string;
  content_type: string;
  draft_stage:  string;
  script_file:  string;
  sort_order:   number;
}

type Tab = "Short-Form" | "Long-Form";

async function fetchScripts(): Promise<Script[]> {
  const res = await fetch(`${JARVIS_URL}/content-scripts`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.scripts as Script[];
}

async function patchReorder(order: string[]) {
  try {
    await fetch(`${JARVIS_URL}/content-reorder`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
  } catch { /* silent — local order already updated */ }
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="px-4 py-3.5"
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="h-3.5 rounded mb-2" style={{ background: "var(--border-default)", width: "72%" }} />
      <div className="h-3.5 rounded mb-3" style={{ background: "var(--border-subtle)", width: "52%" }} />
      <div className="h-5 w-16 rounded-full" style={{ background: "var(--border-subtle)" }} />
    </div>
  );
}

// ── Script card ───────────────────────────────────────────────────────────────

function ScriptCard({
  script,
  rank,
  showDragHandle,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  script:         Script;
  rank:           number;
  showDragHandle: boolean;
  isDragging:     boolean;
  isDragOver:     boolean;
  onDragStart:    () => void;
  onDragOver:     (e: React.DragEvent) => void;
  onDrop:         (e: React.DragEvent) => void;
  onDragEnd:      () => void;
}) {
  const stageColor = STAGE_COLORS[script.draft_stage] ?? "#888890";
  const isTop3     = rank < 3;
  const accentBar  = isTop3 ? DONE_GREEN : stageColor;
  const TypeIcon   = TYPE_ICONS[script.content_type] ?? Film;

  function handleCardTap() {
    if (script.script_file) {
      window.open(script.script_file, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div
      draggable={showDragHandle}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="flex items-stretch transition-opacity"
      style={{ borderRadius: "var(--radius-lg)", opacity: isDragging ? 0.4 : 1 }}
    >
      {showDragHandle && (
        <div
          className="flex items-center px-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          style={{ color: "var(--text-muted)" }}
        >
          <GripVertical size={15} />
        </div>
      )}

      <button
        className="flex-1 text-left flex items-start gap-3 px-4 py-3.5 transition-all active:scale-[0.99]"
        onClick={handleCardTap}
        style={{
          background:   "var(--surface-card)",
          borderRadius: "var(--radius-lg)",
          borderLeft:   `3px solid ${accentBar}`,
          borderTop:    isDragOver ? "1.5px dashed var(--border-strong)" : "1px solid var(--border-subtle)",
          borderRight:  isDragOver ? "1.5px dashed var(--border-strong)" : "1px solid var(--border-subtle)",
          borderBottom: isDragOver ? "1.5px dashed var(--border-strong)" : "1px solid var(--border-subtle)",
        }}
      >
        {/* Stage-colored icon square */}
        <div
          className="shrink-0 flex items-center justify-center mt-0.5"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-md)",
            background: stageColor + "1a",
            border: `1px solid ${stageColor}33`,
          }}
        >
          <TypeIcon size={16} style={{ color: stageColor }} />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="font-medium leading-snug mb-2"
            style={{
              color:           "var(--text-primary)",
              fontSize:        "var(--font-size-base)",
              display:         "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow:        "hidden",
            }}
          >
            {script.name}
          </p>
          <div className="flex items-center gap-2">
            {/* Status pill */}
            <span
              className="rounded-full"
              style={{
                background: stageColor + "26",
                color: stageColor,
                border: `1px solid ${stageColor}66`,
                fontFamily: "'Space Mono', monospace",
                fontSize: "var(--font-size-xs)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "2px 8px",
              }}
            >
              {script.draft_stage || "—"}
            </span>
            {script.script_file && (
              <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContentPipeline() {
  const [menuOpen, setMenuOpen] = useState(false);

  const [scripts,    setScripts]    = useState<Script[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [tab,        setTab]        = useState<Tab>("Short-Form");
  const [stage,      setStage]      = useState("All");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useGutterScroll(scrollRef);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setScripts(await fetchScripts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabScripts      = scripts.filter(s => s.content_type === tab);
  const visible         = stage === "All" ? tabScripts : tabScripts.filter(s => s.draft_stage === stage);
  const showDragHandles = stage === "All";

  const shortCount = scripts.filter(s => s.content_type === "Short-Form").length;
  const longCount  = scripts.filter(s => s.content_type === "Long-Form").length;

  // Section-header (above the list): label + dot color track the active filter —
  // a stage when one is selected, else the active content-type tab.
  const sectionLabel = stage === "All" ? tab : stage;
  const sectionColor = stage === "All" ? ACCENT : (STAGE_COLORS[stage] ?? ACCENT);

  // ── Drag ──────────────────────────────────────────────────────────────────

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const newTabScripts = [...tabScripts];
    const fromIdx = newTabScripts.findIndex(s => s.page_id === draggingId);
    const toIdx   = newTabScripts.findIndex(s => s.page_id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = newTabScripts.splice(fromIdx, 1);
    newTabScripts.splice(toIdx, 0, moved);
    const otherScripts = scripts.filter(s => s.content_type !== tab);
    setScripts([...newTabScripts, ...otherScripts]);
    setDraggingId(null);
    setDragOverId(null);
    patchReorder(newTabScripts.map(s => s.page_id));
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--surface-base)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader
        title="Content"
        color={ACCENT}
        onMenu={() => setMenuOpen(true)}
        right={
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: ACCENT }}
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      {/* Tabs */}
      <div
        className="flex px-4 pt-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {(["Short-Form", "Long-Form"] as Tab[]).map(t => {
          const count  = t === "Short-Form" ? shortCount : longCount;
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setStage("All"); }}
              className="px-4 pb-3 text-sm font-semibold transition-colors"
              style={{
                color:        active ? ACCENT : "var(--text-secondary)",
                borderBottom: active ? `2px solid ${ACCENT}` : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {t}
              {!loading && count > 0 && (
                <span
                  className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    background: active ? ACCENT + "20" : "var(--surface-elevated)",
                    color:      active ? ACCENT        : "var(--text-muted)",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stage filter pills — neutral treatment, matching Tasks */}
      <div
        className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto shrink-0"
        style={{ scrollbarWidth: "none" }}
      >
        {STAGE_FILTERS.map(f => {
          const active = stage === f;
          return (
            <button
              key={f}
              onClick={() => setStage(f)}
              className="font-medium transition-all shrink-0 active:scale-95 whitespace-nowrap"
              style={{
                padding: "4px 12px",
                borderRadius: "var(--radius-pill)",
                fontSize: "var(--font-size-sm)",
                background: active ? "var(--surface-elevated)" : "transparent",
                border: `1px solid ${active ? "var(--border-strong)" : "var(--border-subtle)"}`,
                color: active ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pt-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {loading && (
          <div className="space-y-2.5 pt-1">
            {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
              Could not load scripts ({error})
            </p>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium active:scale-95"
              style={{ background: ACCENT + "20", color: ACCENT }}
              onClick={load}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No scripts in this view.
            </p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <>
            {/* Section header — colored dot + uppercase label + count badge */}
            <div className="flex items-center gap-2.5 py-1 mb-2">
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: "8px",
                  height: "8px",
                  background: sectionColor,
                  boxShadow: `0 0 8px ${sectionColor}66`,
                }}
              />
              <span
                className="font-bold uppercase flex-1"
                style={{
                  color: sectionColor,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "var(--font-size-sm)",
                  letterSpacing: "0.08em",
                }}
              >
                {sectionLabel}
              </span>
              <span
                className="font-mono rounded-full"
                style={{
                  background: sectionColor + "1f",
                  color: sectionColor,
                  fontSize: "var(--font-size-xs)",
                  padding: "2px 8px",
                }}
              >
                {visible.length}
              </span>
            </div>

            <div className="space-y-2">
              {visible.map((s, i) => (
                <ScriptCard
                  key={s.page_id}
                  script={s}
                  rank={i}
                  showDragHandle={showDragHandles}
                  isDragging={draggingId === s.page_id}
                  isDragOver={dragOverId === s.page_id}
                  onDragStart={() => handleDragStart(s.page_id)}
                  onDragOver={(e) => handleDragOver(e, s.page_id)}
                  onDrop={(e) => handleDrop(e, s.page_id)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>

            {showDragHandles && (
              <p className="text-center text-xs mt-4" style={{ color: "var(--text-muted)" }}>
                Drag ≡ to reorder
              </p>
            )}
          </>
        )}
      </div>

      {loading && scripts.length > 0 && (
        <div className="absolute top-20 right-4">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
        </div>
      )}
    </div>
  );
}
