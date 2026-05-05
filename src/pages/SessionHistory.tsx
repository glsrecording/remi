import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, History, ChevronDown, ChevronUp,
  CheckCircle2, Music2, Trash2, Flame, CalendarDays,
} from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS, SessionLog } from "@/lib/storage";

const STREAK_COLOR = "#14b8a6";

// ── helpers ────────────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMondayOf(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface WeekGroup {
  key: string;          // ISO string of Monday
  label: string;        // "Apr 28 – May 4"
  sessions: SessionLog[];
  totalTasks: number;
  totalMix: number;
  activeDays: number;
  avgTasks: number;
}

function groupByWeek(log: SessionLog[]): WeekGroup[] {
  const map = new Map<string, SessionLog[]>();
  for (const entry of log) {
    const mon = getMondayOf(parseDate(entry.date));
    const key = mon.toISOString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }
  const groups: WeekGroup[] = [];
  for (const [key, sessions] of map) {
    const mon = new Date(key);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const label = `${fmtShort(mon)} – ${fmtShort(sun)}`;
    const totalTasks = sessions.reduce((s, e) => s + e.completedItems.length, 0);
    const totalMix = sessions.reduce((s, e) => s + e.mixNoteCount, 0);
    const activeDays = new Set(sessions.map((e) => e.date)).size;
    const avgTasks = sessions.length > 0 ? Math.round(totalTasks / sessions.length) : 0;
    groups.push({ key, label, sessions, totalTasks, totalMix, activeDays, avgTasks });
  }
  // Newest week first
  return groups.sort((a, b) => b.key.localeCompare(a.key));
}

function computeStreak(log: SessionLog[]): number {
  if (log.length === 0) return 0;
  const unique = [...new Set(log.map((e) => e.date))]
    .map(parseDate)
    .sort((a, b) => b.getTime() - a.getTime());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const DAY = 86400000;
  if (Math.round((today.getTime() - unique[0].getTime()) / DAY) > 1) return 0;
  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    if (Math.round((unique[i - 1].getTime() - unique[i].getTime()) / DAY) === 1) streak++;
    else break;
  }
  return streak;
}

function streakLabel(n: number): string {
  if (n >= 30) return "legendary";
  if (n >= 14) return "on fire";
  if (n >= 7) return "locked in";
  if (n >= 3) return "building";
  if (n === 2) return "two in a row";
  return "started";
}

// ── sub-components ─────────────────────────────────────────────────────────

function SessionCard({
  entry,
  accent,
  onDelete,
}: {
  entry: SessionLog;
  accent: string;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasItems = entry.completedItems.length > 0;
  return (
    <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: "#2e2e2e" }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/85 leading-tight" style={{ fontFamily: "'Space Mono', monospace" }}>
            {entry.date}
          </p>
          <p className="text-xs text-white/25 mt-0.5">Wrapped at {entry.timestamp}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {entry.completedItems.length > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "#22c55e18", color: "#22c55e" }}>
              <CheckCircle2 size={10} />{entry.completedItems.length}
            </span>
          )}
          {entry.mixNoteCount > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: `${accent}18`, color: accent }}>
              <Music2 size={10} />{entry.mixNoteCount}
            </span>
          )}
        </div>
        {hasItems ? (
          <button className="p-1.5 rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-all" onClick={() => setOpen((p) => !p)}>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <button className="p-1.5 rounded-lg text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-all" onClick={() => onDelete(entry.id)}>
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {open && hasItems && (
        <div className="border-t border-white/5 px-4 py-3 space-y-1.5">
          {entry.completedItems.map((text, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <CheckCircle2 size={12} className="shrink-0 mt-0.5" style={{ color: "#22c55e50" }} />
              <p className="text-xs text-white/40 leading-snug line-through decoration-white/20">{text}</p>
            </div>
          ))}
          <div className="pt-1.5 flex justify-end">
            <button className="text-xs text-white/20 hover:text-red-400 transition-colors flex items-center gap-1" onClick={() => onDelete(entry.id)}>
              <Trash2 size={10} /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekCard({
  group,
  accent,
  onDelete,
}: {
  group: WeekGroup;
  accent: string;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "#333333" }}>
      {/* Week header */}
      <button className="w-full text-left px-4 py-4" onClick={() => setOpen((p) => !p)}>
        <div className="flex items-start gap-3">
          <CalendarDays size={15} className="shrink-0 mt-0.5" style={{ color: STREAK_COLOR }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/90 leading-tight" style={{ fontFamily: "'Space Mono', monospace" }}>
              {group.label}
            </p>
            <p className="text-xs text-white/30 mt-0.5">
              {group.activeDays} active day{group.activeDays !== 1 ? "s" : ""} · {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="shrink-0">{open ? <ChevronUp size={14} className="text-white/25" /> : <ChevronDown size={14} className="text-white/25" />}</div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: "#22c55e14", color: "#22c55e" }}>
            <CheckCircle2 size={11} />
            <span className="font-semibold">{group.totalTasks}</span> tasks done
          </span>
          {group.totalMix > 0 && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: `${accent}14`, color: accent }}>
              <Music2 size={11} />
              <span className="font-semibold">{group.totalMix}</span> mix notes
            </span>
          )}
          {group.sessions.length > 1 && (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: `${STREAK_COLOR}12`, color: STREAK_COLOR }}>
              ~<span className="font-semibold">{group.avgTasks}</span> avg/session
            </span>
          )}
        </div>
      </button>

      {/* Expanded sessions */}
      {open && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-2">
          {group.sessions
            .slice()
            .sort((a, b) => b.id.localeCompare(a.id))
            .map((entry) => (
              <SessionCard key={entry.id} entry={entry} accent={accent} onDelete={onDelete} />
            ))}
        </div>
      )}
    </div>
  );
}

// ── main ───────────────────────────────────────────────────────────────────

type ViewMode = "sessions" | "weekly";

export default function SessionHistory() {
  const [, navigate] = useLocation();
  const [ACCENT] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [log, setLog] = useLocalStorage<SessionLog[]>(STORAGE_KEYS.SESSION_LOG, []);
  const [viewMode, setViewMode] = useState<ViewMode>("sessions");

  const streak = computeStreak(log);
  const weekGroups = groupByWeek(log);

  const deleteEntry = (id: string) => setLog((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#232323" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{ background: "#1a1a1a", paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)", paddingBottom: "14px" }}
      >
        <button className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1" onClick={() => navigate("/")} data-testid="button-back">
          <ArrowLeft size={20} />
        </button>
        <History size={16} className="text-white/30" />
        <span className="text-base font-bold tracking-tight" style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}>
          Session History
        </span>
        {log.length > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: `${ACCENT}20`, color: ACCENT }}>
            {log.length} session{log.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Streak banner */}
      {streak > 0 && (
        <div className="mx-4 mt-4 rounded-2xl px-5 py-4 flex items-center gap-4" style={{ background: `${STREAK_COLOR}12`, border: `1px solid ${STREAK_COLOR}30` }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${STREAK_COLOR}20` }}>
            <Flame size={22} style={{ color: STREAK_COLOR }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold leading-none" style={{ fontFamily: "'Space Mono', monospace", color: STREAK_COLOR }}>
              {streak} day{streak !== 1 ? "s" : ""}
            </p>
            <p className="text-xs mt-1" style={{ color: `${STREAK_COLOR}90` }}>
              {streakLabel(streak)} — keep wrapping up nightly
            </p>
          </div>
          {streak >= 7 && (
            <div className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: `${STREAK_COLOR}20`, color: STREAK_COLOR, fontFamily: "'Space Mono', monospace" }}>
              🔥 {streak >= 30 ? "30+" : streak >= 14 ? "14+" : "7+"}
            </div>
          )}
        </div>
      )}

      {/* Segmented control */}
      {log.length > 0 && (
        <div className="mx-4 mt-4 flex rounded-xl p-1" style={{ background: "#1a1a1a" }}>
          {(["sessions", "weekly"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 capitalize"
              style={{
                background: viewMode === mode ? "#333333" : "transparent",
                color: viewMode === mode ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                fontFamily: "'Space Mono', monospace",
              }}
              onClick={() => setViewMode(mode)}
            >
              {mode === "sessions" ? "Sessions" : "Weekly"}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-4 space-y-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {log.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <History size={32} className="text-white/10" />
            <p className="text-sm text-white/25">No sessions yet</p>
            <p className="text-xs text-white/15 text-center px-8">
              Say "Wrap up" or "End session" in chat to log your first night
            </p>
          </div>
        ) : viewMode === "sessions" ? (
          log.map((entry) => (
            <SessionCard key={entry.id} entry={entry} accent={ACCENT} onDelete={deleteEntry} />
          ))
        ) : (
          weekGroups.map((group) => (
            <WeekCard key={group.key} group={group} accent={ACCENT} onDelete={deleteEntry} />
          ))
        )}
      </div>
    </div>
  );
}
