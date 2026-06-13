import { useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Bell, BellRing, Repeat, Plus, X, Send } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const ACCENT           = "#a78bfa";
const DELETE_COLOR     = "#ef4444";
const COMMIT_THRESHOLD = 65;

type Recurrence = "daily" | "weekly" | "monthly" | "twice_monthly" | null;

interface Reminder {
  id: string;
  title: string;
  fire_date: string;
  fire_time: string;
  recurrence: string | null;
  notion_page_id: string | null;
  fired: boolean;
  nag_mode?: boolean;
  nag_interval_hours?: number;
  call?: boolean;
}

type FilterKey = "All" | "Upcoming" | "Recurring" | "Fired";

const RECUR_OPTIONS: { key: Recurrence; label: string }[] = [
  { key: null,            label: "None" },
  { key: "daily",         label: "Daily" },
  { key: "weekly",        label: "Weekly" },
  { key: "monthly",       label: "Monthly" },
  { key: "twice_monthly", label: "Twice a month" },
];

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

// "Repeats weekly • Mondays" — for weekly we append the weekday derived from fire_date.
function recurrenceLabel(rec: string | null, fireDate?: string): string {
  switch (rec) {
    case "daily":         return "Repeats daily";
    case "monthly":       return "Repeats monthly";
    case "twice_monthly": return "Repeats twice a month";
    case "weekly": {
      let suffix = "";
      if (fireDate) {
        try {
          const [y, m, d] = fireDate.split("-").map(Number);
          suffix = ` • ${WEEKDAYS[new Date(y, m - 1, d).getDay()]}`;
        } catch { /* ignore */ }
      }
      return `Repeats weekly${suffix}`;
    }
    default: return "";
  }
}

function formatDateTime(date: string, time: string): string {
  try {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const datePart = dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const [h, min] = time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12  = h % 12 || 12;
    const timePart = `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
    return `${datePart} at ${timePart}`;
  } catch {
    return `${date} ${time}`;
  }
}

// ── Swipeable card — left swipe → Delete ──────────────────────────────────────

function SwipeableReminderCard({
  reminder,
  onDelete,
  onEdit,
}: {
  reminder: Reminder;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [offsetX, setOffsetX]      = useState(0);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted]   = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState(false);

  const startPos     = useRef<{ x: number; y: number } | null>(null);
  const dragging     = useRef(false);
  const offsetRef    = useRef(0);
  const directionRef = useRef<"undecided" | "swipe" | "scroll">("undecided");

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    directionRef.current = "undecided";
    offsetRef.current = 0;
    e.stopPropagation();
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x;
    const ny = e.clientY - startPos.current.y;
    const mag = Math.sqrt(nx ** 2 + ny ** 2);

    if (directionRef.current === "undecided" && mag >= 8) {
      const ax = Math.abs(nx), ay = Math.abs(ny);
      if (ax >= ay * 1.5 && nx < 0) {
        // horizontal left — commit to swipe
        directionRef.current = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        // vertical or right — let page scroll
        directionRef.current = "scroll";
        dragging.current = false;
        return;
      }
    }

    if (directionRef.current !== "swipe") return;
    const x = Math.min(0, nx); // negative = leftward
    offsetRef.current = x;
    setOffsetX(x);
  }

  async function handlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;

    if (
      directionRef.current === "swipe" &&
      Math.abs(offsetRef.current) >= COMMIT_THRESHOLD
    ) {
      setCommitting(true);
      setDeleting(true);
      setError(false);
      try {
        const r = await fetch(`${JARVIS_URL}/reminder/${reminder.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${REMI_API_KEY}` },
        });
        if (!r.ok) throw new Error(`${r.status}`);
        // Success only — remove the card. On failure we keep it (below).
        setCommitted(true);
        onDelete();
      } catch (err) {
        console.error("[Reminders] delete failed:", err);
        // Keep the card, surface an inline error, snap it back into place.
        setError(true);
        setCommitting(false);
        setDeleting(false);
        directionRef.current = "undecided";
        offsetRef.current = 0;
        setOffsetX(0);
      }
      return;
    }

    // Tap (never crossed the 8px threshold → direction still undecided) → open editor.
    if (directionRef.current === "undecided" && Math.abs(offsetRef.current) < 8) {
      directionRef.current = "undecided";
      offsetRef.current = 0;
      setOffsetX(0);
      onEdit();
      return;
    }

    directionRef.current = "undecided";
    offsetRef.current = 0;
    setOffsetX(0);
  }

  if (committed) return null;

  const progress = Math.min(1, Math.abs(offsetX) / COMMIT_THRESHOLD);
  const isFired  = reminder.fired;

  return (
    <div className="relative rounded-xl" style={{ overflow: "hidden" }}>
      {/* Red hint revealed on the right as the card slides left */}
      <div
        className="absolute inset-0 rounded-xl flex items-center justify-end px-4"
        style={{
          background: `color-mix(in srgb, ${DELETE_COLOR} ${Math.round(progress * 28)}%, transparent)`,
          border: `1.5px solid color-mix(in srgb, ${DELETE_COLOR} ${Math.round(progress * 70)}%, transparent)`,
          transition: dragging.current ? "none" : "all 0.25s ease",
        }}
      >
        {Math.abs(offsetX) > 8 && (
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{
              color: DELETE_COLOR,
              opacity: progress,
              fontFamily: "'Space Mono', monospace",
              transition: dragging.current ? "none" : "opacity 0.15s",
            }}
          >
            {deleting ? "..." : "Delete"}
          </span>
        )}
      </div>

      {/* Sliding card */}
      <div
        className="relative px-4 py-3.5 rounded-xl select-none"
        style={{
          background: committing ? `${DELETE_COLOR}22` : "var(--t-card)",
          border: "1px solid rgba(255,255,255,0.05)",
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current
            ? "none"
            : "transform 0.35s cubic-bezier(0.34,1.3,0.64,1), background 0.2s",
          willChange: "transform",
          cursor: offsetX < -4 ? "grabbing" : "default",
          touchAction: "none",
          opacity: isFired ? 0.55 : 1,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p
              className="text-base font-medium leading-snug break-words"
              style={{
                color: isFired ? "var(--t-text5)" : "var(--t-text)",
                textDecoration: isFired ? "line-through" : "none",
              }}
            >
              {reminder.title}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--t-text6)" }}>
              {formatDateTime(reminder.fire_date, reminder.fire_time)}
            </p>
            {isFired && (
              <p className="text-xs mt-0.5" style={{ color: "var(--t-text6)", opacity: 0.7 }}>
                Fired
              </p>
            )}
            {(reminder.recurrence || reminder.nag_mode) && (
              <div className="flex items-center gap-3 mt-1.5">
                {reminder.recurrence && (
                  <span className="flex items-center gap-1" style={{ color: ACCENT, opacity: isFired ? 0.6 : 0.95 }}>
                    <Repeat size={12} strokeWidth={2.25} />
                    <span className="text-xs font-medium tracking-wide">
                      {recurrenceLabel(reminder.recurrence, reminder.fire_date)}
                    </span>
                  </span>
                )}
                {reminder.nag_mode && (
                  <span className="flex items-center gap-1" style={{ color: "#f5a623", opacity: isFired ? 0.6 : 0.95 }}>
                    <BellRing size={12} strokeWidth={2.25} />
                    <span className="text-xs font-medium tracking-wide">
                      Nags every {reminder.nag_interval_hours ?? 4}h
                    </span>
                  </span>
                )}
              </div>
            )}
            {error && (
              <p className="text-xs mt-1" style={{ color: DELETE_COLOR }}>
                Couldn't delete — swipe again to retry.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const FILTERS: FilterKey[] = ["All", "Upcoming", "Recurring", "Fired"];

const EMPTY_MESSAGES: Record<FilterKey, string> = {
  All:       "No reminders yet.",
  Upcoming:  "No upcoming reminders.",
  Recurring: "No recurring reminders.",
  Fired:     "No fired reminders.",
};

export default function Reminders() {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [reminders, setReminders]   = useState<Reminder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("All");
  const [refreshing, setRefreshing] = useState(false);

  // ── Add-reminder sheet state ──
  const [addOpen, setAddOpen]   = useState(false);
  const [whatText, setWhatText] = useState("");
  const [whenText, setWhenText] = useState("");
  const [sending, setSending]   = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // ── Edit-reminder sheet state ──
  const [editing, setEditing]       = useState<Reminder | null>(null);
  const [edTitle, setEdTitle]       = useState("");
  const [edDate, setEdDate]         = useState("");
  const [edTime, setEdTime]         = useState("");
  const [edRecur, setEdRecur]       = useState<Recurrence>(null);
  const [edNag, setEdNag]           = useState(false);
  const [edNagHours, setEdNagHours] = useState(4);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError]   = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useGutterScroll(scrollRef);

  const fetchReminders = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const r = await fetch(`${JARVIS_URL}/reminders`, {
        headers: { Authorization: `Bearer ${REMI_API_KEY}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      setReminders((data.reminders as Reminder[]) ?? []);
    } catch (e) {
      console.error("[Reminders] fetch failed:", e);
    } finally {
      setLoading(false);
      if (showRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const filtered = reminders.filter((r) => {
    if (activeFilter === "All")       return true;
    if (activeFilter === "Upcoming")  return !r.fired;
    if (activeFilter === "Recurring") return !!r.recurrence;
    if (activeFilter === "Fired")     return r.fired;
    return true;
  });

  function handleDelete(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  function openEditor(r: Reminder) {
    setEditing(r);
    setEdTitle(r.title);
    setEdDate(r.fire_date);
    setEdTime((r.fire_time || "09:00").slice(0, 5));
    setEdRecur((r.recurrence as Recurrence) ?? null);
    setEdNag(!!r.nag_mode);
    setEdNagHours(r.nag_interval_hours ?? 4);
    setEditError(null);
  }

  function closeEditor() {
    setEditing(null);
    setEditError(null);
  }

  async function saveEdit() {
    if (!editing || savingEdit) return;
    const title = edTitle.trim();
    if (!title) { setEditError("Title can't be empty."); return; }
    setSavingEdit(true);
    setEditError(null);
    const patch = {
      title,
      fire_date: edDate,
      fire_time: edTime,
      recurrence: edRecur ?? "",
      nag_mode: edNag,
      nag_interval_hours: edNagHours,
    };
    try {
      const r = await fetch(`${JARVIS_URL}/reminder/${editing.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${REMI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json().catch(() => ({}));
      const updated: Reminder = data.reminder ?? {
        ...editing,
        title,
        fire_date: edDate,
        fire_time: edTime,
        recurrence: edRecur,
        nag_mode: edNag,
        nag_interval_hours: edNagHours,
      };
      setReminders((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...updated } : x)));
      closeEditor();
    } catch (e) {
      console.error("[Reminders] edit failed:", e);
      setEditError("Couldn't save changes — try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  function closeAddSheet() {
    setAddOpen(false);
    setWhatText("");
    setWhenText("");
    setAddError(null);
  }

  // Routes through the existing /remi chat endpoint — Jarvis classifies and
  // creates the reminder via _capture_reminder (natural-language time parsing).
  async function addReminder() {
    const what = whatText.trim();
    const when = whenText.trim();
    if (!what || sending) return;
    const message = `Remind me to ${what}${when ? ` ${when}` : ""}`;
    setSending(true);
    setAddError(null);
    try {
      const r = await fetch(`${JARVIS_URL}/remi`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REMI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, user_id: "reminders-page" }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      closeAddSheet();
      await fetchReminders(true);
    } catch (e) {
      console.error("[Reminders] add failed:", e);
      setAddError("Couldn't add that reminder — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="relative flex flex-col h-[100dvh]"
      style={{ background: "var(--t-bg)", color: "var(--t-text)" }}
    >
      <PageHeader
        title="Reminders"
        color={ACCENT}
        onMenu={() => setMenuOpen(true)}
        right={
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: refreshing ? ACCENT : "var(--t-text5)" }}
            onClick={() => fetchReminders(true)}
            disabled={refreshing}
            data-testid="button-refresh"
          >
            {refreshing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
        }
      />

      {/* Filter chips */}
      <div
        className="flex gap-2 px-4 py-3 shrink-0 overflow-x-auto"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full tracking-wide transition-all"
            style={{
              background: activeFilter === f ? `${ACCENT}20` : "var(--t-card)",
              color:      activeFilter === f ? ACCENT : "var(--t-text5)",
              border: `1.5px solid ${
                activeFilter === f ? `${ACCENT}55` : "rgba(255,255,255,0.07)"
              }`,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
        style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {loading ? (
          <div className="flex justify-center pt-12">
            <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-16 gap-3">
            <Bell
              size={32}
              style={{ color: "var(--t-text6)", opacity: 0.35 }}
            />
            <p className="text-sm" style={{ color: "var(--t-text6)" }}>
              {EMPTY_MESSAGES[activeFilter]}
            </p>
          </div>
        ) : (
          filtered.map((r) => (
            <SwipeableReminderCard
              key={r.id}
              reminder={r}
              onDelete={() => handleDelete(r.id)}
              onEdit={() => openEditor(r)}
            />
          ))
        )}
      </div>

      {/* Add-reminder FAB */}
      <button
        onClick={() => setAddOpen(true)}
        aria-label="Add reminder"
        data-testid="button-add-reminder"
        className="absolute z-20 flex items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
        style={{
          right: 20,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          width: 56,
          height: 56,
          background: ACCENT,
          color: "#1a1625",
          boxShadow: `0 6px 20px ${ACCENT}55`,
        }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* Add-reminder bottom sheet */}
      {addOpen && (
        <div
          className="absolute inset-0 z-30 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={closeAddSheet}
        >
          <div
            className="rounded-t-2xl px-5 pt-4"
            style={{
              background: "var(--t-bg)",
              borderTop: `1px solid ${ACCENT}33`,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: "var(--t-text)" }}>
                New Reminder
              </h2>
              <button
                onClick={closeAddSheet}
                className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: "var(--t-text5)" }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <label className="block text-xs mb-1.5" style={{ color: "var(--t-text6)" }}>
              What do you want to be reminded about?
            </label>
            <input
              autoFocus
              value={whatText}
              onChange={(e) => setWhatText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addReminder(); }}
              placeholder="call the vet"
              className="w-full rounded-xl px-3.5 py-3 text-base outline-none mb-3.5"
              style={{
                background: "var(--t-card)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--t-text)",
              }}
            />

            <label className="block text-xs mb-1.5" style={{ color: "var(--t-text6)" }}>
              When? <span style={{ opacity: 0.6 }}>(plain English)</span>
            </label>
            <input
              value={whenText}
              onChange={(e) => setWhenText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addReminder(); }}
              placeholder="tomorrow at 3pm"
              className="w-full rounded-xl px-3.5 py-3 text-base outline-none mb-4"
              style={{
                background: "var(--t-card)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--t-text)",
              }}
            />

            {addError && (
              <p className="text-xs mb-3" style={{ color: DELETE_COLOR }}>
                {addError}
              </p>
            )}

            <button
              onClick={addReminder}
              disabled={!whatText.trim() || sending}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold transition-opacity"
              style={{
                background: ACCENT,
                color: "#1a1625",
                opacity: !whatText.trim() || sending ? 0.5 : 1,
              }}
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Send size={16} /> Send
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Edit-reminder bottom sheet */}
      {editing && (
        <div
          className="absolute inset-0 z-30 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={closeEditor}
        >
          <div
            className="rounded-t-2xl px-5 pt-4 overflow-y-auto"
            style={{
              background: "var(--t-bg)",
              borderTop: `1px solid ${ACCENT}33`,
              maxHeight: "88%",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: "var(--t-text)" }}>
                Edit Reminder
              </h2>
              <button
                onClick={closeEditor}
                className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: "var(--t-text5)" }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <label className="block text-xs mb-1.5" style={{ color: "var(--t-text6)" }}>
              Reminder
            </label>
            <input
              value={edTitle}
              onChange={(e) => setEdTitle(e.target.value)}
              placeholder="call the vet"
              className="w-full rounded-xl px-3.5 py-3 text-base outline-none mb-3.5"
              style={{
                background: "var(--t-card)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--t-text)",
              }}
            />

            <div className="flex gap-3 mb-3.5">
              <div className="flex-1">
                <label className="block text-xs mb-1.5" style={{ color: "var(--t-text6)" }}>
                  Date
                </label>
                <input
                  type="date"
                  value={edDate}
                  onChange={(e) => setEdDate(e.target.value)}
                  className="w-full rounded-xl px-3 py-3 text-sm outline-none"
                  style={{
                    background: "var(--t-card)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--t-text)",
                    colorScheme: "dark",
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1.5" style={{ color: "var(--t-text6)" }}>
                  Time
                </label>
                <input
                  type="time"
                  value={edTime}
                  onChange={(e) => setEdTime(e.target.value)}
                  className="w-full rounded-xl px-3 py-3 text-sm outline-none"
                  style={{
                    background: "var(--t-card)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--t-text)",
                    colorScheme: "dark",
                  }}
                />
              </div>
            </div>

            <label className="block text-xs mb-1.5" style={{ color: "var(--t-text6)" }}>
              Repeat
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {RECUR_OPTIONS.map((opt) => {
                const active = edRecur === opt.key;
                return (
                  <button
                    key={opt.label}
                    onClick={() => setEdRecur(opt.key)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full tracking-wide transition-all"
                    style={{
                      background: active ? `${ACCENT}20` : "var(--t-card)",
                      color:      active ? ACCENT : "var(--t-text5)",
                      border: `1.5px solid ${active ? `${ACCENT}55` : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Nag toggle */}
            <div
              className="flex items-center justify-between rounded-xl px-3.5 py-3 mb-1"
              style={{ background: "var(--t-card)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-2">
                <BellRing size={16} style={{ color: edNag ? "#f5a623" : "var(--t-text6)" }} />
                <span className="text-sm" style={{ color: "var(--t-text)" }}>
                  Nag until done
                </span>
              </div>
              <button
                onClick={() => setEdNag((v) => !v)}
                role="switch"
                aria-checked={edNag}
                className="relative rounded-full transition-colors"
                style={{
                  width: 44,
                  height: 26,
                  background: edNag ? "#f5a623" : "rgba(255,255,255,0.12)",
                }}
              >
                <span
                  className="absolute rounded-full bg-white transition-transform"
                  style={{
                    width: 20,
                    height: 20,
                    top: 3,
                    left: 3,
                    transform: edNag ? "translateX(18px)" : "translateX(0)",
                  }}
                />
              </button>
            </div>
            {edNag && (
              <div className="flex items-center gap-2 mb-4 mt-2 px-1">
                <span className="text-xs" style={{ color: "var(--t-text6)" }}>Re-notify every</span>
                <select
                  value={edNagHours}
                  onChange={(e) => setEdNagHours(Number(e.target.value))}
                  className="rounded-lg px-2 py-1 text-xs outline-none"
                  style={{
                    background: "var(--t-card)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "var(--t-text)",
                  }}
                >
                  {[1, 2, 3, 4, 6, 8, 12].map((h) => (
                    <option key={h} value={h}>{h}h</option>
                  ))}
                </select>
              </div>
            )}
            {!edNag && <div className="mb-4" />}

            {editError && (
              <p className="text-xs mb-3" style={{ color: DELETE_COLOR }}>
                {editError}
              </p>
            )}

            <button
              onClick={saveEdit}
              disabled={!edTitle.trim() || savingEdit}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-base font-semibold transition-opacity"
              style={{
                background: ACCENT,
                color: "#1a1625",
                opacity: !edTitle.trim() || savingEdit ? 0.5 : 1,
              }}
            >
              {savingEdit ? <Loader2 size={18} className="animate-spin" /> : "Save changes"}
            </button>
          </div>
        </div>
      )}

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
