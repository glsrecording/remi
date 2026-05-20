import { useState, useEffect, useCallback, useRef } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";
import { Loader2, RefreshCw, ExternalLink, GripVertical } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

const STAGE_FILTERS = ["All", "AI Draft", "My Rewrite", "Final", "Filmed", "Posted"];

const STAGE_COLORS: Record<string, string> = {
  "AI Draft":   "#9ca3af",
  "My Rewrite": "#fbbf24",
  "Final":      "#60a5fa",
  "Filmed":     "#a78bfa",
  "Posted":     "#4ade80",
};

const STAGE_BORDER_COLORS: Record<string, string> = {
  "AI Draft":   "#6b7280",
  "My Rewrite": "#eab308",
  "Final":      "#3b82f6",
  "Filmed":     "#a855f7",
  "Posted":     "#22c55e",
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
      className="px-4 py-3.5 rounded-xl"
      style={{ background: "var(--t-card)", border: "1px solid var(--t-border)" }}
    >
      <div className="h-3.5 rounded mb-2" style={{ background: "var(--t-border-md)", width: "72%" }} />
      <div className="h-3.5 rounded mb-3" style={{ background: "var(--t-border)", width: "52%" }} />
      <div className="h-5 w-16 rounded-full" style={{ background: "var(--t-border)" }} />
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
  const stageColor  = STAGE_COLORS[script.draft_stage] ?? "#9ca3af";
  const borderColor = STAGE_BORDER_COLORS[script.draft_stage] ?? "#6b7280";
  const isTop3      = rank < 3;

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
      className="flex items-stretch rounded-xl transition-opacity"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      {showDragHandle && (
        <div
          className="flex items-center px-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          style={{ color: "var(--t-text6)" }}
        >
          <GripVertical size={15} />
        </div>
      )}

      <button
        className="flex-1 text-left px-4 py-3.5 rounded-xl transition-all active:scale-[0.99]"
        onClick={handleCardTap}
        style={{
          background:   "var(--t-card)",
          borderLeft:   isTop3 ? "3px solid #39b54a" : `3px solid ${borderColor}`,
          borderTop:    isDragOver ? "1.5px dashed var(--t-border-md)" : "1px solid var(--t-border)",
          borderRight:  isDragOver ? "1.5px dashed var(--t-border-md)" : "1px solid var(--t-border)",
          borderBottom: isDragOver ? "1.5px dashed var(--t-border-md)" : "1px solid var(--t-border)",
        }}
      >
        <p
          className="text-sm font-medium leading-snug mb-2"
          style={{
            color:           "var(--t-text2)",
            display:         "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow:        "hidden",
          }}
        >
          {script.name}
        </p>
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: stageColor + "22", color: stageColor }}
          >
            {script.draft_stage || "—"}
          </span>
          {script.script_file && (
            <ExternalLink size={12} style={{ color: "var(--t-text6)" }} />
          )}
        </div>
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContentPipeline() {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
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
  const visible         = stage === "All" ? tabScripts : scripts.filter(s => s.draft_stage === stage);
  const showDragHandles = stage === "All";

  const shortCount = scripts.filter(s => s.content_type === "Short-Form").length;
  const longCount  = scripts.filter(s => s.content_type === "Long-Form").length;

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
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader
        title="Content"
        color={remiColor}
        onMenu={() => setMenuOpen(true)}
        right={
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "var(--t-text5)" }}
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
        style={{ borderBottom: "1px solid var(--t-border)" }}
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
                color:        active ? remiColor : "var(--t-text5)",
                borderBottom: active ? `2px solid ${remiColor}` : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {t}
              {!loading && count > 0 && (
                <span
                  className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    background: active ? remiColor + "20" : "var(--t-el-low)",
                    color:      active ? remiColor        : "var(--t-text6)",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stage filter chips */}
      <div
        className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto shrink-0"
        style={{ scrollbarWidth: "none" }}
      >
        {STAGE_FILTERS.map(f => {
          const active    = stage === f;
          const chipColor = f === "All" ? remiColor : (STAGE_COLORS[f] ?? remiColor);
          return (
            <button
              key={f}
              onClick={() => setStage(f)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 active:scale-95"
              style={{
                background: active ? chipColor + "22" : "var(--t-card)",
                color:      active ? chipColor        : "var(--t-text5)",
                border:     active ? `1.5px solid ${chipColor}60` : "1.5px solid var(--t-border-md)",
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
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-center" style={{ color: "var(--t-text4)" }}>
              Could not load scripts ({error})
            </p>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium active:scale-95"
              style={{ background: remiColor + "20", color: remiColor }}
              onClick={load}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm" style={{ color: "var(--t-text6)" }}>
              No scripts in this view.
            </p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
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
        )}

        {!loading && !error && visible.length > 0 && showDragHandles && (
          <p className="text-center text-xs mt-4" style={{ color: "var(--t-text6)" }}>
            Drag ≡ to reorder
          </p>
        )}
      </div>

      {loading && scripts.length > 0 && (
        <div className="absolute top-20 right-4">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--t-text6)" }} />
        </div>
      )}
    </div>
  );
}
