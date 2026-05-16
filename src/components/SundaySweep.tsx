import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronRight, Check, Loader2, RefreshCw } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HDR = { Authorization: `Bearer ${REMI_API_KEY}` };

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverdueTask  { id: string; title: string; scheduled_date: string; }
interface SomedayTask  { id: string; title: string; }
interface QueueTask    { id: string; title: string; life_area: string | null; }

const LIFE_AREAS = ["Studio", "Personal", "Family", "Dad", "Business", "Content"] as const;
type LifeArea = typeof LIFE_AREAS[number];
const AREA_COLORS: Record<LifeArea, string> = {
  Studio: "#f59e0b", Personal: "#60a5fa", Family: "#22c55e",
  Dad: "#f97316",   Business: "#a855f7", Content: "#ec4899",
};
const GROUP_ORDER = ["Unsorted", ...LIFE_AREAS] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function tomorrowISO(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function fmtDue(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function chipTimeStyle(): { background: string; border: string; color: string } {
  const h = new Date().getHours();
  if (h < 17) return { background: "rgba(34,197,94,0.08)",  border: "1px solid rgba(34,197,94,0.35)",  color: "rgba(34,197,94,0.95)"  };
  if (h < 21) return { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", color: "rgba(245,158,11,0.95)" };
  return           { background: "rgba(239,68,68,0.08)",   border: "1px solid rgba(239,68,68,0.35)",   color: "rgba(239,68,68,0.95)"  };
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchOverdue(): Promise<OverdueTask[]> {
  const r = await fetch(`${JARVIS_URL}/weekly-review/overdue`, { headers: AUTH_HDR });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function postOverdueAction(id: string, action: string, date?: string): Promise<void> {
  await fetch(`${JARVIS_URL}/weekly-review/overdue-action`, {
    method: "POST",
    headers: { ...AUTH_HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ id, action, ...(date ? { date } : {}) }),
  });
}
async function fetchSomeday(): Promise<SomedayTask[]> {
  const r = await fetch(`${JARVIS_URL}/weekly-review/someday`, { headers: AUTH_HDR });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function postSomedayAction(id: string, action: "keep" | "archive"): Promise<void> {
  await fetch(`${JARVIS_URL}/weekly-review/someday-action`, {
    method: "POST",
    headers: { ...AUTH_HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ id, action }),
  });
}
async function postSomedayRestore(id: string): Promise<void> {
  await fetch(`${JARVIS_URL}/weekly-review/someday-restore`, {
    method: "POST",
    headers: { ...AUTH_HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}
async function fetchQueue(): Promise<QueueTask[]> {
  const r = await fetch(`${JARVIS_URL}/scheduler`, { headers: AUTH_HDR });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function patchQueue(id: string, patch: { life_area?: string; scheduled_date?: string }): Promise<void> {
  await fetch(`${JARVIS_URL}/scheduler/update`, {
    method: "PATCH",
    headers: { ...AUTH_HDR, "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
}

// ─── Exported chip ────────────────────────────────────────────────────────────

export function SundaySweepChip({ onOpen }: { onOpen: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isSunday  = new Date().getDay() === 0;
  const isDone    = localStorage.getItem("lastSweepDate") === todayISO();
  if (!isSunday || isDone) return null;

  const ts = chipTimeStyle();
  return (
    <button
      onClick={onOpen}
      className="w-full text-left px-4 py-2.5 shrink-0 transition-all active:opacity-75"
      style={{
        ...ts,
        borderRadius: 0,
        borderLeft: "none", borderRight: "none", borderTop: "none",
        fontFamily: "'Space Mono', monospace",
        fontSize: "11px", fontWeight: 700, letterSpacing: "0.03em",
      }}
      data-testid="sunday-sweep-chip"
    >
      ☑ Sunday Sweep — weekly review ready
    </button>
  );
}

// ─── Card stack shell ─────────────────────────────────────────────────────────

interface CardStackProps {
  count: number;
  exiting: boolean;
  exitDir: "right" | "up";
  accentColor: string;
  children: React.ReactNode;
  height?: number;
}
function CardStack({ count, exiting, exitDir, accentColor, children, height = 140 }: CardStackProps) {
  const exitTransform = exitDir === "right"
    ? "translateX(110%) rotate(6deg)"
    : "translateY(-50px) scale(0.85)";
  return (
    <div className="relative" style={{ height: height + 16, marginBottom: "4px" }}>
      {count >= 3 && (
        <div className="absolute inset-x-0 rounded-xl" style={{
          background: "var(--t-card)", border: "1px solid var(--t-border)",
          top: "14px", transform: "scale(0.94)", zIndex: 10, height,
        }} />
      )}
      {count >= 2 && (
        <div className="absolute inset-x-0 rounded-xl" style={{
          background: "var(--t-card)", border: "1px solid var(--t-border)",
          top: "8px", transform: "scale(0.97)", zIndex: 20, height,
        }} />
      )}
      <div
        className="absolute inset-x-0 rounded-xl px-4 py-4"
        style={{
          background: "var(--t-card)",
          border: `1.5px solid ${accentColor}45`,
          top: 0, zIndex: 30, height,
          transition: exiting ? "transform 0.26s ease, opacity 0.26s ease" : "none",
          transform: exiting ? exitTransform : "none",
          opacity: exiting ? 0 : 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Stage 1 — Overdue Sweep ──────────────────────────────────────────────────

function StageOverdue({ onNext }: { onNext: () => void }) {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [tasks,   setTasks]   = useState<OverdueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [pickDate,setPickDate]= useState(false);
  const [cleared, setCleared] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetchOverdue().then(setTasks).catch(e => setError(String(e))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = todayISO();

  const handleAction = useCallback(async (action: string, date?: string) => {
    if (tasks.length === 0) return;
    const top = tasks[0];
    setExiting(true);
    setTimeout(() => {
      setExiting(false);
      setPickDate(false);
      setTasks(prev => {
        const next = prev.slice(1);
        if (next.length === 0) setCleared(true);
        return next;
      });
    }, 280);
    postOverdueAction(top.id, action, date).catch(() => {});
  }, [tasks]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-16">
      <Loader2 size={18} className="animate-spin" style={{ color: remiColor }} />
      <span className="text-sm" style={{ color: "var(--t-text5)" }}>Loading overdue…</span>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-16">
      <p className="text-sm" style={{ color: "rgba(239,68,68,0.8)" }}>Load failed ({error})</p>
      <button className="px-4 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-all"
        style={{ background: remiColor + "20", color: remiColor }} onClick={load}>Retry</button>
    </div>
  );
  if (tasks.length === 0 && !cleared) return (
    <div className="flex flex-col items-center gap-4 py-12">
      <p className="text-base font-medium" style={{ color: "var(--t-text2)" }}>No overdue tasks. Nice.</p>
      <button onClick={onNext} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
        style={{ background: remiColor, color: "#111111" }}>
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
  if (cleared) return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)" }}>
        <Check size={24} style={{ color: "#22c55e" }} />
      </div>
      <p className="text-base font-medium" style={{ color: "var(--t-text2)" }}>✓ Overdue cleared</p>
      <button onClick={onNext} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
        style={{ background: remiColor, color: "#111111" }}>
        Next <ChevronRight size={16} />
      </button>
    </div>
  );

  const top = tasks[0];
  return (
    <div className="flex flex-col gap-3">
      <CardStack count={tasks.length} exiting={exiting} exitDir="right" accentColor={remiColor} height={140}>
        <p className="text-sm font-semibold leading-snug mb-2" style={{ color: "var(--t-text2)" }}>{top.title}</p>
        <p className="text-xs" style={{ color: "var(--t-text5)" }}>Was due: {fmtDue(top.scheduled_date)}</p>
        {pickDate && (
          <div className="mt-3">
            <input type="date" min={today} autoFocus
              className="rounded-lg px-3 py-2 text-xs w-full"
              style={{ background: "var(--t-el-med)", border: "1px solid var(--t-border-md)", color: "var(--t-text2)" }}
              onChange={e => { if (e.target.value) handleAction("reschedule", e.target.value); }}
            />
          </div>
        )}
      </CardStack>
      <p className="text-center text-xs" style={{ color: "var(--t-text5)" }}>{tasks.length} remaining</p>
      {!pickDate && (
        <div className="grid grid-cols-5 gap-1.5">
          <button onClick={() => handleAction("today")} className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
            style={{ background: remiColor + "20", color: remiColor }}>Today</button>
          <button onClick={() => setPickDate(true)} className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
            style={{ background: "var(--t-el-med)", color: "var(--t-text3)" }}>Reschedule</button>
          <button onClick={() => handleAction("queue")} className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
            style={{ background: "var(--t-el-med)", color: "var(--t-text3)" }}>Queue</button>
          <button onClick={() => handleAction("someday")} className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
            style={{ background: "var(--t-el-med)", color: "var(--t-text5)" }}>Someday</button>
          <button onClick={() => handleAction("done")} className="py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
            style={{ background: "rgba(34,197,94,0.12)", color: "rgba(34,197,94,0.85)" }}>Done ✓</button>
        </div>
      )}
    </div>
  );
}

// ─── Stage 2 — Scheduler (inline, no header) ──────────────────────────────────

function StageScheduler({ onNext }: { onNext: () => void }) {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [tasks,      setTasks]      = useState<QueueTask[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDate,   setShowDate]   = useState<Set<string>>(new Set());
  const [pickDateId, setPickDateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTasks(await fetchQueue()); } catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today    = todayISO();
  const tomorrow = tomorrowISO();

  async function handleArea(area: LifeArea) {
    if (!selectedId) return;
    const id = selectedId;
    setTasks(p => p.map(t => t.id === id ? { ...t, life_area: area } : t));
    setShowDate(p => new Set([...p, id]));
    patchQueue(id, { life_area: area }).catch(load);
  }
  async function handleDate(id: string, iso: string) {
    setTasks(p => p.filter(t => t.id !== id));
    setSelectedId(null);
    setShowDate(p => { const s = new Set(p); s.delete(id); return s; });
    setPickDateId(null);
    patchQueue(id, { scheduled_date: iso }).catch(load);
  }

  const groups = (GROUP_ORDER as readonly string[]).map(g => ({
    label: g,
    tasks: tasks.filter(t => g === "Unsorted" ? !t.life_area : t.life_area === g),
  })).filter(g => g.tasks.length > 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Two-panel body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left: task list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 6px 12px 0" }}
          onClick={() => { setSelectedId(null); setPickDateId(null); }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 size={15} className="animate-spin" style={{ color: remiColor }} />
              <span className="text-xs" style={{ color: "var(--t-text5)" }}>Loading…</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8">
              <p className="text-sm font-medium" style={{ color: "var(--t-text5)" }}>Queue is clear.</p>
              <p className="text-xs" style={{ color: "var(--t-text6)" }}>Triage cards down to add tasks</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(group => {
                const gc = group.label === "Unsorted" ? "var(--t-text5)" : (AREA_COLORS[group.label as LifeArea] ?? remiColor);
                return (
                  <div key={group.label}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-1.5 px-1"
                      style={{ fontFamily: "'Space Mono', monospace", color: gc }}>{group.label}</p>
                    <div className="space-y-1">
                      {group.tasks.map(task => {
                        const sel = selectedId === task.id;
                        const hdr = showDate.has(task.id);
                        const ac  = task.life_area ? (AREA_COLORS[task.life_area as LifeArea] ?? remiColor) : null;
                        return (
                          <div key={task.id} className="rounded-xl overflow-hidden" style={{
                            background: "var(--t-card)",
                            border: sel ? `1.5px solid ${remiColor}` : "1px solid var(--t-border)",
                            transition: "border-color 0.15s",
                          }} onClick={e => { e.stopPropagation(); setSelectedId(p => p === task.id ? null : task.id); setPickDateId(null); }}>
                            <div className="flex items-start gap-2 px-3 py-2.5">
                              <p className="flex-1 text-xs leading-snug" style={{ color: "var(--t-text2)" }}>{task.title}</p>
                              {task.life_area && (
                                <span className="shrink-0 rounded px-1.5 py-0.5" style={{
                                  background: (ac ?? remiColor) + "18", color: ac ?? remiColor,
                                  fontFamily: "'Space Mono', monospace", fontSize: "8px", letterSpacing: "0.05em", textTransform: "uppercase",
                                }}>{task.life_area}</span>
                              )}
                            </div>
                            {sel && hdr && (
                              <div className="flex items-center gap-1.5 px-3 pt-2 pb-3"
                                style={{ borderTop: "1px solid var(--t-border)" }}
                                onClick={e => e.stopPropagation()}>
                                <button className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                  style={{ background: remiColor + "20", color: remiColor }}
                                  onClick={() => handleDate(task.id, today)}>Today</button>
                                <button className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                  style={{ background: "var(--t-el-med)", color: "var(--t-text3)" }}
                                  onClick={() => handleDate(task.id, tomorrow)}>Tomorrow</button>
                                {pickDateId === task.id ? (
                                  <input type="date" min={today} autoFocus
                                    className="flex-1 text-xs rounded-lg px-2 py-1.5"
                                    style={{ background: "var(--t-el-med)", border: "1px solid var(--t-border-md)", color: "var(--t-text3)", minHeight: "30px" }}
                                    onChange={e => { if (e.target.value) handleDate(task.id, e.target.value); }} />
                                ) : (
                                  <button className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                                    style={{ background: "var(--t-el-med)", color: "var(--t-text6)" }}
                                    onClick={() => setPickDateId(task.id)}>Pick…</button>
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
        {/* Right: area buttons */}
        <div style={{ width: 68, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--t-border)", padding: "12px 0 12px 6px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", justifyContent: "center", height: "100%" }}>
            {LIFE_AREAS.map(area => {
              const color = AREA_COLORS[area];
              const armed = selectedId !== null;
              return (
                <button key={area} onClick={() => handleArea(area)}
                  className="w-full rounded-xl font-bold tracking-wide transition-all active:scale-95"
                  style={{
                    minHeight: "38px", fontFamily: "'Space Mono', monospace", fontSize: "9px", letterSpacing: "0.04em",
                    background: armed ? color + "18" : "var(--t-el-low)",
                    border: `1px solid ${armed ? color + "50" : "var(--t-border)"}`,
                    color: armed ? color : "var(--t-text5)",
                    transition: "background 0.15s, border-color 0.15s, color 0.15s",
                  }}>{area}</button>
              );
            })}
          </div>
        </div>
      </div>
      {/* Pinned Next button */}
      <div className="shrink-0 pt-3" style={{ borderTop: "1px solid var(--t-border)" }}>
        <button onClick={onNext}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={{ background: remiColor, color: "#111111" }}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Stage 3 — Someday / Maybe ────────────────────────────────────────────────

function StageSomeday({ onDone }: { onDone: () => void }) {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [tasks,   setTasks]   = useState<SomedayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [undo,    setUndo]    = useState<{ id: string; title: string; left: number } | null>(null);
  const undoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchSomeday().then(setTasks).catch(e => setError(String(e))).finally(() => setLoading(false));
    return () => { if (undoRef.current) clearInterval(undoRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = useCallback(async (action: "keep" | "archive") => {
    if (tasks.length === 0) return;
    const top = tasks[0];
    setExiting(true);
    setTimeout(() => {
      setExiting(false);
      setTasks(prev => {
        const next = prev.slice(1);
        if (next.length === 0) setCleared(true);
        return next;
      });
    }, 280);
    postSomedayAction(top.id, action).catch(() => {});
    if (action === "archive") {
      if (undoRef.current) clearInterval(undoRef.current);
      setUndo({ id: top.id, title: top.title, left: 5 });
      let s = 5;
      undoRef.current = setInterval(() => {
        s -= 1;
        if (s <= 0) { clearInterval(undoRef.current!); undoRef.current = null; setUndo(null); }
        else setUndo(p => p ? { ...p, left: s } : null);
      }, 1000);
    }
  }, [tasks]);

  const handleUndo = useCallback(async () => {
    if (!undo) return;
    if (undoRef.current) { clearInterval(undoRef.current); undoRef.current = null; }
    const { id, title } = undo;
    setUndo(null);
    postSomedayRestore(id).catch(() => {});
    setTasks(p => [{ id, title }, ...p]);
    if (cleared) setCleared(false);
  }, [undo, cleared]);

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-16">
      <Loader2 size={18} className="animate-spin" style={{ color: remiColor }} />
      <span className="text-sm" style={{ color: "var(--t-text5)" }}>Loading someday…</span>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-16">
      <p className="text-sm" style={{ color: "rgba(239,68,68,0.8)" }}>Load failed</p>
    </div>
  );
  if (tasks.length === 0 && !cleared) return (
    <div className="flex flex-col items-center gap-4 py-12">
      <p className="text-base font-medium" style={{ color: "var(--t-text2)" }}>Someday list is empty.</p>
      <button onClick={onDone} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
        style={{ background: "#22c55e", color: "#111111" }}>
        Done <Check size={16} />
      </button>
    </div>
  );
  if (cleared) return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)" }}>
        <Check size={24} style={{ color: "#22c55e" }} />
      </div>
      <p className="text-base font-medium" style={{ color: "var(--t-text2)" }}>✓ Someday reviewed</p>
      <button onClick={onDone} className="flex items-center gap-2 px-8 py-3.5 rounded-xl text-base font-bold transition-all active:scale-95"
        style={{ background: "#22c55e", color: "#111111" }}>
        Done ✓
      </button>
    </div>
  );

  const top = tasks[0];
  return (
    <div className="flex flex-col gap-3">
      <CardStack count={tasks.length} exiting={exiting} exitDir="up" accentColor={remiColor} height={100}>
        <p className="text-sm font-semibold leading-snug" style={{ color: "var(--t-text2)" }}>{top.title}</p>
      </CardStack>
      <p className="text-center text-xs" style={{ color: "var(--t-text5)" }}>{tasks.length} remaining</p>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => handleAction("keep")} className="py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={{ background: "var(--t-el-med)", color: "var(--t-text3)" }}>Keep</button>
        <button onClick={() => handleAction("archive")} className="py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "rgba(239,68,68,0.85)" }}>Archive</button>
      </div>
      {undo && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <p className="flex-1 text-xs" style={{ color: "rgba(239,68,68,0.85)" }}>
            Archived — undo? ({undo.left}s)
          </p>
          <button onClick={handleUndo} className="px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-all"
            style={{ background: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.95)" }}>Undo</button>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const STAGE_LABELS = ["Overdue Sweep",                  "Scheduler",                              "Someday / Maybe"          ];
const STAGE_SUB    = ["Clear the backlog — one card at a time", "Assign dates or life areas to your Queue", "Keep it or let it go"];

interface SundaySweepProps { onClose: () => void; }

export default function SundaySweep({ onClose }: SundaySweepProps) {
  const [stage, setStage]   = useState<1 | 2 | 3>(1);
  const [remiColor]         = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");

  function handleDone() {
    localStorage.setItem("lastSweepDate", todayISO());
    onClose();
  }

  const isStage2 = stage === 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}>
      <div className="relative flex flex-col w-full mx-4"
        style={{
          maxWidth: 480,
          maxHeight: "92dvh",
          background: "var(--t-surface)",
          borderRadius: "20px",
          border: "1px solid var(--t-border)",
          overflow: "hidden",
        }}>

        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-5 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--t-border)" }}>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--t-text5)" }}>
              Stage {stage} of 3
            </p>
            <p className="text-base font-bold" style={{ color: remiColor, fontFamily: "'Space Mono', monospace" }}>
              {STAGE_LABELS[stage - 1]}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--t-text5)" }}>
              {STAGE_SUB[stage - 1]}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors shrink-0"
            style={{ color: "var(--t-text5)" }} data-testid="sweep-close">
            <X size={18} />
          </button>
        </div>

        {/* Stage content */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: isStage2 ? "hidden" : "auto",
          minHeight: 0,
          padding: isStage2 ? "16px 20px 20px" : "20px",
        }}>
          {stage === 1 && <StageOverdue  onNext={() => setStage(2)} />}
          {stage === 2 && <StageScheduler onNext={() => setStage(3)} />}
          {stage === 3 && <StageSomeday  onDone={handleDone} />}
        </div>

        {/* Stage pip indicator */}
        <div className="shrink-0 flex items-center justify-center gap-1.5 pb-3">
          {([1, 2, 3] as const).map(s => (
            <div key={s} className="rounded-full transition-all" style={{
              width: s === stage ? 20 : 6,
              height: 6,
              background: s === stage ? remiColor : "var(--t-border)",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
