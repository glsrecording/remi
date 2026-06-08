import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

const LIFE_AREAS = ["Studio", "Personal", "Family", "Dad", "Business", "Content"] as const;
type LifeArea = typeof LIFE_AREAS[number];

const AREA_COLORS: Record<LifeArea, string> = {
  Studio:   "#f59e0b",
  Personal: "#60a5fa",
  Family:   "#22c55e",
  Dad:      "#f97316",
  Business: "#a855f7",
  Content:  "#ec4899",
};

const GROUP_ORDER = ["Unsorted", ...LIFE_AREAS] as const;

// Work-mode categories (Master Tasks "Category" select). Amber accent per the
// Remi design system. Must match the backend _ALLOWED_CATEGORIES set exactly.
const CATEGORIES = ["Communication", "Filming", "Admin", "Writing", "Studio", "General"] as const;
const CATEGORY_ACCENT = "#f59e0b";

interface SchedulerTask {
  id: string;
  title: string;
  life_area: string | null;
  category: string | null;
}

async function apiFetchTasks(): Promise<SchedulerTask[]> {
  const r = await fetch(`${JARVIS_URL}/scheduler`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as SchedulerTask[];
}

async function apiPatch(id: string, patch: { life_area?: string; scheduled_date?: string; category?: string }): Promise<void> {
  const r = await fetch(`${JARVIS_URL}/scheduler/update`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${REMI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!r.ok) throw new Error(`${r.status}`);
}

async function apiArchive(id: string): Promise<void> {
  const r = await fetch(`${JARVIS_URL}/scheduler/update`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${REMI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, action: "done" }),
  });
  if (!r.ok) throw new Error(`${r.status}`);
}

function todayISO(): string  { return new Date().toISOString().slice(0, 10); }
function tomorrowISO(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function Scheduler() {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [menuOpen, setMenuOpen] = useState(false);

  const [tasks,       setTasks]       = useState<SchedulerTask[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  // IDs of cards that currently show the date-assignment row
  const [showDateSet, setShowDateSet] = useState<Set<string>>(new Set());
  // ID of card that has the native date picker open
  const [pickDateId,  setPickDateId]  = useState<string | null>(null);
  // ID of card whose Category picker is open
  const [catPickId,   setCatPickId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await apiFetchTasks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCardTap(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
    setPickDateId(null);
    setCatPickId(null);
  }

  async function handleAreaTap(area: LifeArea) {
    if (!selectedId) return;
    const id = selectedId;
    // Optimistic update — move to group, reveal date row
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, life_area: area } : t));
    setShowDateSet((prev) => new Set([...prev, id]));
    try {
      await apiPatch(id, { life_area: area });
    } catch {
      load();
    }
  }

  async function handleDateAssign(id: string, isoDate: string) {
    // Optimistic remove — card graduates out of Scheduler
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
    setShowDateSet((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setPickDateId(null);
    try {
      await apiPatch(id, { scheduled_date: isoDate });
    } catch {
      load();
    }
  }

  async function handleCategoryAssign(id: string, category: string) {
    // Optimistic — show the chip immediately, close the picker, then write back.
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, category } : t));
    setCatPickId(null);
    try {
      await apiPatch(id, { category });
    } catch {
      load();  // revert to server truth on failure
    }
  }

  async function handleDone(id: string) {
    // Optimistic remove — archive the task
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    setShowDateSet((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setPickDateId((prev) => (prev === id ? null : prev));
    try {
      await apiArchive(id);
    } catch {
      load();
    }
  }

  // Build group list — only groups with at least one task
  const groups = (GROUP_ORDER as readonly string[]).map((group) => ({
    label: group,
    tasks: tasks.filter((t) =>
      group === "Unsorted" ? !t.life_area : t.life_area === group
    ),
  })).filter((g) => g.tasks.length > 0);

  const today    = todayISO();
  const tomorrow = tomorrowISO();

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader
        title="Scheduler"
        color={remiColor}
        onMenu={() => setMenuOpen(true)}
        right={<>
          {!loading && tasks.length > 0 && (
            <span className="text-xs mr-1" style={{ color: "var(--t-text6)" }}>{tasks.length}</span>
          )}
          <button
            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
            onClick={load}
            disabled={loading}
            data-testid="button-refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </>}
      />

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel — task list ─────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto py-4"
          style={{ paddingLeft: "12px", paddingRight: "8px", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          onClick={() => { setSelectedId(null); setPickDateId(null); setCatPickId(null); }}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16">
              <Loader2 size={18} className="animate-spin" style={{ color: remiColor }} />
              <span className="text-sm" style={{ color: "var(--t-text5)" }}>Loading queue…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm" style={{ color: "rgba(239,68,68,0.8)" }}>Could not load ({error})</p>
              <button
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: remiColor + "20", color: remiColor }}
                onClick={(e) => { e.stopPropagation(); load(); }}
              >
                Retry
              </button>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-sm font-medium" style={{ color: "var(--t-text5)" }}>Queue is clear.</p>
              <p className="text-xs" style={{ color: "var(--t-text6)" }}>Swipe cards into Queue from Triage</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => {
                const groupColor = group.label === "Unsorted"
                  ? "var(--t-text5)"
                  : (AREA_COLORS[group.label as LifeArea] ?? remiColor);
                return (
                  <div key={group.label}>
                    {/* Group header */}
                    <p
                      className="text-xs font-bold uppercase tracking-widest mb-2 px-1"
                      style={{ fontFamily: "'Space Mono', monospace", color: groupColor }}
                    >
                      {group.label}
                    </p>

                    <div className="space-y-1.5">
                      {group.tasks.map((task) => {
                        const isSelected  = selectedId === task.id;
                        const hasDateRow  = showDateSet.has(task.id);
                        const isPickDate  = pickDateId === task.id;
                        const isCatPick   = catPickId === task.id;
                        const areaColor   = task.life_area
                          ? (AREA_COLORS[task.life_area as LifeArea] ?? remiColor)
                          : null;

                        return (
                          <div
                            key={task.id}
                            className="rounded-xl overflow-hidden"
                            style={{
                              background: "var(--t-card)",
                              border: isSelected
                                ? `1.5px solid ${remiColor}`
                                : "1px solid var(--t-border)",
                              transition: "border-color 0.15s",
                            }}
                            onClick={(e) => { e.stopPropagation(); handleCardTap(task.id); }}
                          >
                            {/* Card main row */}
                            <div className="flex items-start gap-2 px-3 py-3">
                              <p
                                className="flex-1 text-sm leading-snug"
                                style={{
                                  color: "var(--t-text2)",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {task.title}
                              </p>
                              {task.life_area && (
                                <span
                                  className="shrink-0 rounded px-1.5 py-0.5"
                                  style={{
                                    background: (areaColor ?? remiColor) + "18",
                                    color: areaColor ?? remiColor,
                                    fontFamily: "'Space Mono', monospace",
                                    fontSize: "9px",
                                    letterSpacing: "0.05em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {task.life_area}
                                </span>
                              )}
                              {/* Category chip (amber) when set, muted "+ Cat" affordance when empty.
                                  Tap toggles the inline picker; stops propagation so it doesn't
                                  toggle card selection / the life-area panel. */}
                              <button
                                className="shrink-0 rounded px-1.5 py-0.5 transition-all active:scale-95"
                                style={{
                                  background: task.category ? CATEGORY_ACCENT + "1f" : "var(--t-el-low)",
                                  color: task.category ? CATEGORY_ACCENT : "var(--t-text6)",
                                  border: `1px solid ${task.category ? CATEGORY_ACCENT + "55" : "var(--t-border)"}`,
                                  fontFamily: "'Space Mono', monospace",
                                  fontSize: "9px",
                                  letterSpacing: "0.05em",
                                  textTransform: "uppercase",
                                }}
                                onClick={(e) => { e.stopPropagation(); setPickDateId(null); setCatPickId((prev) => (prev === task.id ? null : task.id)); }}
                                data-testid={`category-chip-${task.id}`}
                              >
                                {task.category ?? "+ Cat"}
                              </button>
                              <button
                                className="shrink-0 px-2 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                style={{ background: "rgba(34,197,94,0.12)", color: "rgba(34,197,94,0.75)" }}
                                onClick={(e) => { e.stopPropagation(); handleDone(task.id); }}
                              >
                                Done ✓
                              </button>
                            </div>

                            {/* Category picker — opens on tap of the category chip.
                                Selecting writes back to Notion via /scheduler/update. */}
                            {isCatPick && (
                              <div
                                className="flex flex-wrap gap-1.5 px-3 pt-2 pb-3"
                                style={{ borderTop: "1px solid var(--t-border)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {CATEGORIES.map((cat) => {
                                  const active = task.category === cat;
                                  return (
                                    <button
                                      key={cat}
                                      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                      style={{
                                        background: active ? CATEGORY_ACCENT + "26" : "var(--t-el-low)",
                                        border: `1px solid ${active ? CATEGORY_ACCENT + "66" : "var(--t-border)"}`,
                                        color: active ? CATEGORY_ACCENT : "var(--t-text4)",
                                      }}
                                      onClick={() => handleCategoryAssign(task.id, cat)}
                                      data-testid={`category-opt-${cat.toLowerCase()}-${task.id}`}
                                    >
                                      {cat}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Date assignment row — visible when life area assigned */}
                            {isSelected && hasDateRow && (
                              <div
                                className="flex items-center gap-1.5 px-3 pt-2 pb-3"
                                style={{ borderTop: "1px solid var(--t-border)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                  style={{ background: remiColor + "20", color: remiColor }}
                                  onClick={() => handleDateAssign(task.id, today)}
                                >
                                  Today
                                </button>
                                <button
                                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                  style={{ background: "var(--t-el-med)", color: "var(--t-text3)" }}
                                  onClick={() => handleDateAssign(task.id, tomorrow)}
                                >
                                  Tomorrow
                                </button>
                                {isPickDate ? (
                                  <input
                                    type="date"
                                    className="flex-1 text-xs rounded-lg px-2 py-2"
                                    style={{
                                      background: "var(--t-el-med)",
                                      border: "1px solid var(--t-border-md)",
                                      color: "var(--t-text3)",
                                      minHeight: "34px",
                                    }}
                                    min={today}
                                    autoFocus
                                    onChange={(e) => {
                                      if (e.target.value) handleDateAssign(task.id, e.target.value);
                                    }}
                                  />
                                ) : (
                                  <button
                                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                    style={{ background: "var(--t-el-med)", color: "var(--t-text6)" }}
                                    onClick={() => setPickDateId(task.id)}
                                  >
                                    Pick…
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right panel — life area buttons ───────────────────────────── */}
        <div
          className="shrink-0 flex flex-col border-l overflow-y-auto"
          style={{
            width: "88px",
            borderColor: "var(--t-border)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <div className="flex flex-col gap-1.5 px-1.5 py-4 h-full justify-center">
            {LIFE_AREAS.map((area) => {
              const color    = AREA_COLORS[area];
              const isArmed  = selectedId !== null;
              return (
                <button
                  key={area}
                  className="w-full rounded-xl font-bold tracking-wide transition-all active:scale-95"
                  style={{
                    minHeight: "44px",
                    background: isArmed ? color + "18" : "var(--t-el-low)",
                    border: `1px solid ${isArmed ? color + "50" : "var(--t-border)"}`,
                    color: isArmed ? color : "var(--t-text5)",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "10px",
                    letterSpacing: "0.04em",
                    transition: "background 0.15s, border-color 0.15s, color 0.15s",
                  }}
                  onClick={() => handleAreaTap(area)}
                  data-testid={`area-btn-${area.toLowerCase()}`}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
