import { useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Bell } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const ACCENT           = "#a78bfa";
const DELETE_COLOR     = "#ef4444";
const COMMIT_THRESHOLD = 65;

interface Reminder {
  id: string;
  title: string;
  fire_date: string;
  fire_time: string;
  recurrence: string | null;
  notion_page_id: string | null;
  fired: boolean;
  call?: boolean;
}

type FilterKey = "All" | "Upcoming" | "Recurring" | "Fired";

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
}: {
  reminder: Reminder;
  onDelete: () => void;
}) {
  const [offsetX, setOffsetX]      = useState(0);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted]   = useState(false);
  const [deleting, setDeleting]     = useState(false);

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
      try {
        const r = await fetch(`${JARVIS_URL}/reminder/${reminder.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${REMI_API_KEY}` },
        });
        if (!r.ok) throw new Error(`${r.status}`);
      } catch (err) {
        console.error("[Reminders] delete failed:", err);
      }
      setCommitted(true);
      onDelete();
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
          </div>
          {reminder.recurrence && (
            <span
              className="shrink-0 text-xs px-2.5 py-1 rounded-full font-medium tracking-wide capitalize"
              style={{
                background: `${ACCENT}18`,
                color: ACCENT,
                border: `1px solid ${ACCENT}44`,
              }}
            >
              {reminder.recurrence}
            </span>
          )}
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

  return (
    <div
      className="flex flex-col h-[100dvh]"
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
            />
          ))
        )}
      </div>

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
