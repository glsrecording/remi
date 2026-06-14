import { useState, useRef, useEffect, useCallback } from "react";
import {
  RefreshCw, Loader2, Check, Archive as ArchiveIcon, X, Undo2, Zap,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const TEAL             = "var(--color-studio)";
const COMMIT_THRESHOLD = 65;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemEntry {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  created_time: string;
}

interface KnowEntry {
  id: string;
  title: string;
  canonical_statement: string;
  type: string;
  status: string;
  evidence_summary: string;
  confidence: number | null;
  expires_at: string;
  created_time: string;
}

// ── Color maps (design-system tokens only) ────────────────────────────────────

function categoryColor(cat: string): string {
  switch (cat) {
    case "Memory":      return "var(--color-studio)";
    case "Insight":     return "var(--color-tonight)";
    case "Gratitude":   return "var(--color-tasks)";
    case "Jarvis Chat": return "var(--text-secondary)";
    default:            return "var(--text-secondary)";
  }
}

function typeColor(t: string): string {
  switch (t) {
    case "preference":    return "var(--color-tonight)";
    case "project_fact":  return "var(--color-calls)";
    case "routing_truth": return "var(--color-personal)";
    case "constraint":    return "var(--color-tasks)";
    case "alias":         return "var(--color-studio)";
    case "workflow_fact": return "var(--color-studio)";
    default:              return "var(--text-secondary)";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "Pending":  return "var(--color-tasks)";
    case "Approved": return "var(--color-studio)";
    case "Active":   return "var(--color-done)";
    case "Draft":    return "var(--text-secondary)";
    default:         return "var(--text-secondary)";
  }
}

function isNeedsReview(status: string): boolean {
  return status === "Draft" || status === "Pending";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  if (!iso) return "";
  try {
    const then = new Date(iso);
    const now  = new Date();
    const a = new Date(then.getFullYear(), then.getMonth(), then.getDate());
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((b.getTime() - a.getTime()) / 86400000);
    if (days <= 0)  return "today";
    if (days === 1) return "yesterday";
    if (days < 7)   return `${days} days ago`;
    if (days < 30)  { const w = Math.floor(days / 7); return `${w} week${w > 1 ? "s" : ""} ago`; }
    return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="shrink-0"
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        fontSize: "10px",
        padding: "1px 8px",
        borderRadius: "var(--radius-pill)",
        fontWeight: 600,
        letterSpacing: "0.3px",
      }}
    >
      {label}
    </span>
  );
}

// ── Swipe card — left → Archive, right → Approve ──────────────────────────────

function SwipeCard({
  accent,
  canApprove,
  onApprove,
  onArchive,
  onTap,
  children,
}: {
  accent: string;
  canApprove: boolean;
  onApprove: () => void;
  onArchive: () => void;
  onTap: () => void;
  children: React.ReactNode;
}) {
  const [offsetX, setOffsetX]     = useState(0);
  const [removing, setRemoving]   = useState(false);

  const startPos     = useRef<{ x: number; y: number } | null>(null);
  const dragging     = useRef(false);
  const offsetRef    = useRef(0);
  const directionRef = useRef<"undecided" | "swipe" | "scroll">("undecided");

  function onDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    directionRef.current = "undecided";
    offsetRef.current = 0;
    e.stopPropagation();
  }

  function onMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x;
    const ny = e.clientY - startPos.current.y;
    const mag = Math.sqrt(nx ** 2 + ny ** 2);

    if (directionRef.current === "undecided" && mag >= 8) {
      const ax = Math.abs(nx), ay = Math.abs(ny);
      const rightward = nx > 0;
      // Lock to horizontal swipe; ignore a rightward drag when approve isn't allowed.
      if (ax >= ay * 1.5 && (!rightward || canApprove)) {
        directionRef.current = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        directionRef.current = "scroll";
        dragging.current = false;
        return;
      }
    }

    if (directionRef.current !== "swipe") return;
    let x = nx;
    if (x > 0 && !canApprove) x = 0;      // no right swipe when approve disabled
    offsetRef.current = x;
    setOffsetX(x);
  }

  function onUp() {
    if (!dragging.current) return;
    dragging.current = false;
    const off = offsetRef.current;

    if (directionRef.current === "swipe" && Math.abs(off) >= COMMIT_THRESHOLD) {
      if (off < 0) {
        // Archive — slide fully out, parent handles removal + undo.
        setRemoving(true);
        onArchive();
        return;
      }
      if (off > 0 && canApprove) {
        // Approve — parent re-groups the card into Approved; snap offset back.
        onApprove();
        offsetRef.current = 0;
        setOffsetX(0);
        directionRef.current = "undecided";
        return;
      }
    }

    if (directionRef.current === "undecided" && Math.abs(off) < 8) {
      offsetRef.current = 0;
      setOffsetX(0);
      onTap();
      return;
    }

    offsetRef.current = 0;
    setOffsetX(0);
    directionRef.current = "undecided";
  }

  if (removing) return null;

  const progress = Math.min(1, Math.abs(offsetX) / COMMIT_THRESHOLD);

  return (
    <div className="relative" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      {/* Archive hint (revealed sliding left) */}
      {offsetX < 0 && (
        <div
          className="absolute inset-0 flex items-center justify-end px-4"
          style={{
            borderRadius: "var(--radius-lg)",
            background: `color-mix(in srgb, var(--color-personal) ${Math.round(progress * 26)}%, transparent)`,
          }}
        >
          <span
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--color-personal)", opacity: progress }}
          >
            <ArchiveIcon size={13} /> Archive
          </span>
        </div>
      )}
      {/* Approve hint (revealed sliding right) */}
      {offsetX > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-start px-4"
          style={{
            borderRadius: "var(--radius-lg)",
            background: `color-mix(in srgb, ${TEAL} ${Math.round(progress * 26)}%, transparent)`,
          }}
        >
          <span
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest"
            style={{ color: TEAL, opacity: progress }}
          >
            <Check size={14} /> Approve
          </span>
        </div>
      )}

      {/* Sliding card with left accent bar */}
      <div
        className="relative select-none"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          borderLeft: `3px solid ${accent}`,
          borderRadius: "var(--radius-lg)",
          padding: "12px 14px",
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current ? "none" : "transform 0.32s cubic-bezier(0.34,1.3,0.64,1)",
          willChange: "transform",
          touchAction: "none",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {children}
      </div>
    </div>
  );
}

// ── Inline undo toast (4s) — token-pure ───────────────────────────────────────

function UndoToast({ message, onUndo, onExpire }: {
  message: string; onUndo: () => void; onExpire: () => void;
}) {
  const start = useRef(Date.now());
  const [pct, setPct] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      const left = 4000 - (Date.now() - start.current);
      if (left <= 0) { clearInterval(id); onExpire(); } else { setPct(left / 4000); }
    }, 100);
    return () => clearInterval(id);
  }, [onExpire]);
  return (
    <div
      className="absolute left-3 right-3 z-40 overflow-hidden shadow-xl"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        background: "var(--surface-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div className="h-0.5 w-full" style={{ background: "var(--border-subtle)" }}>
        <div className="h-full" style={{ width: `${pct * 100}%`, background: TEAL, transition: "width 0.1s linear" }} />
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>{message}</p>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold active:scale-95"
          style={{ background: `color-mix(in srgb, ${TEAL} 18%, transparent)`, color: TEAL, borderRadius: "var(--radius-md)" }}
          onClick={onUndo}
          data-testid="memory-undo"
        >
          <Undo2 size={13} /> Undo
        </button>
      </div>
    </div>
  );
}

// ── Section scaffold ──────────────────────────────────────────────────────────

function SubHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-4 pb-2">
      <span
        style={{
          fontFamily: "'Space Mono', monospace", fontSize: "10px", letterSpacing: "1.2px",
          textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{count}</span>
    </div>
  );
}

function CleanState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8">
      <div
        className="flex items-center justify-center"
        style={{
          width: 44, height: 44, borderRadius: "var(--radius-pill)",
          background: `color-mix(in srgb, ${TEAL} 14%, transparent)`,
        }}
      >
        <Check size={22} style={{ color: TEAL }} />
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{label} ✓</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Sheet =
  | { kind: "personal"; entry: MemEntry }
  | { kind: "jarvis"; entry: KnowEntry }
  | null;

type Undo = { kind: "personal" | "jarvis"; id: string; prevStatus: string } | null;

export default function MemoryReview() {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [personal, setPersonal]   = useState<MemEntry[]>([]);
  const [jarvis, setJarvis]       = useState<KnowEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet]         = useState<Sheet>(null);
  const [undo, setUndo]           = useState<Undo>(null);
  const [toastErr, setToastErr]   = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useGutterScroll(scrollRef);

  const auth = { Authorization: `Bearer ${REMI_API_KEY}` };

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError(false);
    try {
      const [pRes, jRes] = await Promise.all([
        fetch(`${JARVIS_URL}/memory_bank`, { headers: auth }),
        fetch(`${JARVIS_URL}/jarvis_knowledge`, { headers: auth }),
      ]);
      if (!pRes.ok || !jRes.ok) throw new Error("fetch failed");
      setPersonal((await pRes.json()) as MemEntry[]);
      setJarvis((await jRes.json()) as KnowEntry[]);
    } catch (e) {
      console.error("[MemoryReview] load failed:", e);
      setError(true);
    } finally {
      setLoading(false);
      if (showRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss the error toast.
  useEffect(() => {
    if (!toastErr) return;
    const id = setTimeout(() => setToastErr(null), 3000);
    return () => clearTimeout(id);
  }, [toastErr]);

  async function apiPatch(kind: "personal" | "jarvis", id: string, body: Record<string, string>): Promise<boolean> {
    const path = kind === "personal" ? "memory_bank" : "jarvis_knowledge";
    try {
      const r = await fetch(`${JARVIS_URL}/${path}/${id}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return true;
    } catch (e) {
      console.error(`[MemoryReview] PATCH ${path}/${id} failed:`, e);
      return false;
    }
  }

  // ── Personal actions ──
  function setMemStatus(id: string, status: string) {
    setPersonal((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
  }

  async function approveMem(m: MemEntry, extra?: Record<string, string>) {
    const prev = m.status;
    setMemStatus(m.id, "Approved");
    const ok = await apiPatch("personal", m.id, { status: "Approved", ...(extra || {}) });
    if (!ok) { setMemStatus(m.id, prev); setToastErr("Couldn't save — try again"); }
  }

  async function archiveMem(m: MemEntry, extra?: Record<string, string>) {
    const prev = m.status;
    setPersonal((p) => p.filter((x) => x.id !== m.id));
    const ok = await apiPatch("personal", m.id, { status: "Archived", ...(extra || {}) });
    if (!ok) { setPersonal((p) => [m, ...p]); setToastErr("Couldn't save — try again"); return; }
    setUndo({ kind: "personal", id: m.id, prevStatus: prev || "Draft" });
  }

  // ── Jarvis actions ──
  function setKnowStatus(id: string, status: string) {
    setJarvis((prev) => prev.map((k) => (k.id === id ? { ...k, status } : k)));
  }

  async function setKnow(k: KnowEntry, status: string, extra?: Record<string, string>) {
    const prev = k.status;
    setKnowStatus(k.id, status);
    const ok = await apiPatch("jarvis", k.id, { status, ...(extra || {}) });
    if (!ok) { setKnowStatus(k.id, prev); setToastErr("Couldn't save — try again"); }
  }

  async function archiveKnow(k: KnowEntry, extra?: Record<string, string>) {
    const prev = k.status;
    setJarvis((p) => p.filter((x) => x.id !== k.id));
    const ok = await apiPatch("jarvis", k.id, { status: "Archived", ...(extra || {}) });
    if (!ok) { setJarvis((p) => [k, ...p]); setToastErr("Couldn't save — try again"); return; }
    setUndo({ kind: "jarvis", id: k.id, prevStatus: prev || "Draft" });
  }

  async function doUndo() {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    const ok = await apiPatch(u.kind, u.id, { status: "Draft" });
    if (!ok) { setToastErr("Couldn't undo — try again"); return; }
    // Re-fetch to restore the card into the correct subsection cleanly.
    load();
  }

  // ── Grouping ──
  const pNeeds    = personal.filter((m) => isNeedsReview(m.status));
  const pApproved = personal.filter((m) => !isNeedsReview(m.status));
  const jNeeds    = jarvis.filter((k) => isNeedsReview(k.status));
  const jActive   = jarvis.filter((k) => k.status === "Active");
  const jApproved = jarvis.filter((k) => !isNeedsReview(k.status) && k.status !== "Active");

  // ── Render: a personal card ──
  function memCard(m: MemEntry, inReview: boolean) {
    const flagged = m.status === "Pending";
    const accent  = flagged ? "var(--color-tasks)" : TEAL;
    return (
      <SwipeCard
        key={m.id}
        accent={inReview ? accent : "var(--border-default)"}
        canApprove={inReview}
        onApprove={() => approveMem(m)}
        onArchive={() => archiveMem(m)}
        onTap={() => setSheet({ kind: "personal", entry: m })}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Pill label={m.category || "Memory"} color={categoryColor(m.category)} />
          {flagged && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--color-tasks)" }}>
              <Zap size={11} /> Flagged
            </span>
          )}
          <span className="flex-1" />
          {m.status && isNeedsReview(m.status) && <Pill label={m.status} color={statusColor(m.status)} />}
        </div>
        <p className="text-sm font-semibold leading-snug break-words" style={{ color: "var(--text-primary)" }}>
          {m.title || "Untitled"}
        </p>
        {m.body && (
          <p
            className="text-xs mt-1 leading-relaxed"
            style={{
              color: "var(--text-secondary)", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {m.body}
          </p>
        )}
        <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>{relativeDate(m.created_time)}</p>
      </SwipeCard>
    );
  }

  // ── Render: a jarvis card ──
  function knowCard(k: KnowEntry, group: "review" | "active" | "approved") {
    const flagged = k.status === "Pending";
    const accent =
      group === "active" ? "var(--color-done)" :
      group === "approved" ? "var(--border-default)" :
      flagged ? "var(--color-tasks)" : TEAL;
    return (
      <SwipeCard
        key={k.id}
        accent={accent}
        canApprove={group === "review"}
        onApprove={() => setKnow(k, "Approved")}
        onArchive={() => archiveKnow(k)}
        onTap={() => setSheet({ kind: "jarvis", entry: k })}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Pill label={k.type || "other"} color={typeColor(k.type)} />
          {flagged && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--color-tasks)" }}>
              <Zap size={11} /> Jarvis flagged
            </span>
          )}
          {group === "active" && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--color-done)" }}>
              In context
            </span>
          )}
          <span className="flex-1" />
          {k.status && <Pill label={k.status} color={statusColor(k.status)} />}
        </div>
        <p className="text-sm font-semibold leading-snug break-words" style={{ color: "var(--text-primary)" }}>
          {k.title || "Untitled"}
        </p>
        {k.canonical_statement && (
          <p
            className="text-xs mt-1 leading-relaxed"
            style={{
              color: "var(--text-secondary)", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {k.canonical_statement}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {typeof k.confidence === "number" && (
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {Math.round(k.confidence * (k.confidence <= 1 ? 100 : 1))}% confidence
            </span>
          )}
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeDate(k.created_time)}</span>
        </div>
      </SwipeCard>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh]" style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}>
      <PageHeader
        title="Memory Review"
        color={TEAL}
        onMenu={() => setMenuOpen(true)}
        right={
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: refreshing ? TEAL : "var(--text-secondary)" }}
            onClick={() => load(true)}
            disabled={refreshing}
            data-testid="memory-refresh"
          >
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        }
      />
      <div className="px-4 pt-2 pb-1 shrink-0">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Personal • Knowledge</p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pb-24"
        style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {loading ? (
          <div className="space-y-2 pt-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{ height: 78, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 pt-16">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Couldn't load memories</p>
            <button
              className="px-4 py-2 text-sm font-semibold active:scale-95"
              style={{ background: `color-mix(in srgb, ${TEAL} 16%, transparent)`, color: TEAL, borderRadius: "var(--radius-md)" }}
              onClick={() => load(true)}
              data-testid="memory-retry"
            >
              Tap to retry
            </button>
          </div>
        ) : (
          <>
            {/* ── SECTION 1 — PERSONAL ── */}
            <div className="pt-4">
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)", fontFamily: "'Space Mono', monospace" }}>
                Personal Memory
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Memories · Insights · Gratitude</p>
            </div>

            <SubHeader label="Needs Review" count={pNeeds.length} />
            {pNeeds.length === 0 ? (
              <CleanState label="Personal memory is clean" />
            ) : (
              <div className="space-y-2">{pNeeds.map((m) => memCard(m, true))}</div>
            )}

            {pApproved.length > 0 && (
              <>
                <SubHeader label="Approved" count={pApproved.length} />
                <div className="space-y-2">{pApproved.map((m) => memCard(m, false))}</div>
              </>
            )}

            {/* ── SECTION 2 — JARVIS KNOWLEDGE ── */}
            <div className="pt-8">
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)", fontFamily: "'Space Mono', monospace" }}>
                Jarvis Knowledge
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>What Jarvis knows about you</p>
            </div>

            <SubHeader label="Needs Review" count={jNeeds.length} />
            {jNeeds.length === 0 ? (
              <CleanState label="Jarvis knowledge is clean" />
            ) : (
              <div className="space-y-2">{jNeeds.map((k) => knowCard(k, "review"))}</div>
            )}

            {jActive.length > 0 && (
              <>
                <SubHeader label="Active" count={jActive.length} />
                <div className="space-y-2">{jActive.map((k) => knowCard(k, "active"))}</div>
              </>
            )}

            {jApproved.length > 0 && (
              <>
                <SubHeader label="Approved" count={jApproved.length} />
                <div className="space-y-2">{jApproved.map((k) => knowCard(k, "approved"))}</div>
              </>
            )}
          </>
        )}
      </div>

      {/* Undo toast */}
      {undo && (
        <UndoToast
          message="Archived"
          onUndo={doUndo}
          onExpire={() => setUndo(null)}
        />
      )}

      {/* Error toast */}
      {toastErr && (
        <div
          className="absolute left-3 right-3 z-40 px-4 py-3 shadow-xl"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
            background: "var(--surface-elevated)",
            border: "1px solid color-mix(in srgb, var(--color-personal) 40%, var(--border-default))",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--color-personal)" }}>{toastErr}</p>
        </div>
      )}

      {/* Bottom sheet */}
      {sheet && (
        <DetailSheet
          sheet={sheet}
          onClose={() => setSheet(null)}
          onApproveMem={(m, extra) => { approveMem(m, extra); setSheet(null); }}
          onArchiveMem={(m, extra) => { archiveMem(m, extra); setSheet(null); }}
          onKnow={(k, status, extra) => { setKnow(k, status, extra); setSheet(null); }}
          onArchiveKnow={(k, extra) => { archiveKnow(k, extra); setSheet(null); }}
        />
      )}

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

// ── Bottom sheet ──────────────────────────────────────────────────────────────

function sheetInput(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "var(--surface-card)",
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
    ...extra,
  };
}

function DetailSheet({
  sheet, onClose, onApproveMem, onArchiveMem, onKnow, onArchiveKnow,
}: {
  sheet: NonNullable<Sheet>;
  onClose: () => void;
  onApproveMem: (m: MemEntry, extra?: Record<string, string>) => void;
  onArchiveMem: (m: MemEntry, extra?: Record<string, string>) => void;
  onKnow: (k: KnowEntry, status: string, extra?: Record<string, string>) => void;
  onArchiveKnow: (k: KnowEntry, extra?: Record<string, string>) => void;
}) {
  const isPersonal = sheet.kind === "personal";
  const m = sheet.kind === "personal" ? sheet.entry : null;
  const k = sheet.kind === "jarvis" ? sheet.entry : null;

  const [title, setTitle] = useState(isPersonal ? m!.title : k!.title);
  const [bodyText, setBodyText] = useState(isPersonal ? m!.body : k!.canonical_statement);

  function memExtra(): Record<string, string> {
    const e: Record<string, string> = {};
    if (m && title !== m.title) e.title = title;
    if (m && bodyText !== m.body) e.body = bodyText;
    return e;
  }
  function knowExtra(): Record<string, string> {
    const e: Record<string, string> = {};
    if (k && title !== k.title) e.title = title;
    if (k && bodyText !== k.canonical_statement) e.canonical_statement = bodyText;
    return e;
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="rounded-t-2xl px-5 pt-4 overflow-y-auto"
        style={{
          background: "var(--surface-base)",
          borderTop: `1px solid color-mix(in srgb, ${TEAL} 33%, transparent)`,
          maxHeight: "88%",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <Pill
            label={isPersonal ? (m!.category || "Memory") : (k!.type || "other")}
            color={isPersonal ? categoryColor(m!.category) : typeColor(k!.type)}
          />
          <button className="p-1 rounded-lg hover:bg-white/5" style={{ color: "var(--text-secondary)" }} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="px-3 py-2.5 text-base mb-3"
          style={sheetInput()}
          data-testid="sheet-title"
        />

        <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
          {isPersonal ? "Body" : "Canonical statement"}
        </label>
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={4}
          className="px-3 py-2.5 text-sm mb-3 resize-none"
          style={sheetInput()}
          data-testid="sheet-body"
        />

        {/* Jarvis-only read-only context */}
        {k && (
          <div className="mb-3 space-y-1.5">
            {k.evidence_summary && (
              <div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Evidence: </span>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{k.evidence_summary}</span>
              </div>
            )}
            {typeof k.confidence === "number" && (
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {Math.round(k.confidence * (k.confidence <= 1 ? 100 : 1))}% confidence
              </div>
            )}
            {k.expires_at && (
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Expires {k.expires_at}</div>
            )}
          </div>
        )}

        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Captured {relativeDate(isPersonal ? m!.created_time : k!.created_time)}
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-2 py-3 text-base font-semibold active:scale-95"
            style={{ background: TEAL, color: "var(--surface-base)", borderRadius: "var(--radius-md)" }}
            onClick={() => isPersonal ? onApproveMem(m!, memExtra()) : onKnow(k!, "Approved", knowExtra())}
            data-testid="sheet-approve"
          >
            <Check size={16} /> Approve
          </button>
          {k && k.status === "Approved" && (
            <button
              className="flex-1 flex items-center justify-center gap-2 py-3 text-base font-semibold active:scale-95"
              style={{ background: "var(--color-done)", color: "var(--surface-base)", borderRadius: "var(--radius-md)" }}
              onClick={() => onKnow(k, "Active", knowExtra())}
              data-testid="sheet-active"
            >
              Mark Active
            </button>
          )}
          <button
            className="flex items-center justify-center gap-2 px-4 py-3 text-base font-semibold active:scale-95"
            style={{
              background: "color-mix(in srgb, var(--color-personal) 14%, transparent)",
              color: "var(--color-personal)", borderRadius: "var(--radius-md)",
            }}
            onClick={() => isPersonal ? onArchiveMem(m!, memExtra()) : onArchiveKnow(k!, knowExtra())}
            data-testid="sheet-archive"
          >
            <ArchiveIcon size={16} /> Archive
          </button>
        </div>
      </div>
    </div>
  );
}
