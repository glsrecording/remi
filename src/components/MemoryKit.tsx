// Shared building blocks for the two memory-review pages (PersonalMemory,
// JarvisKnowledge). One correct swipe/tap implementation, used by both.
import { useState, useRef, useEffect } from "react";
import { Check, Archive as ArchiveIcon, Undo2 } from "lucide-react";

export const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
export const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
export const TEAL             = "var(--color-studio)";
export const COMMIT_THRESHOLD = 65;
export const UNDO_MS          = 8000;

export const authHeader = { Authorization: `Bearer ${REMI_API_KEY}` };

// PATCH a memory/knowledge page. path = "memory_bank" | "jarvis_knowledge".
export async function memoryPatch(
  path: string, id: string, body: Record<string, string>,
): Promise<boolean> {
  try {
    const r = await fetch(`${JARVIS_URL}/${path}/${id}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return true;
  } catch (e) {
    console.error(`[MemoryKit] PATCH ${path}/${id} failed:`, e);
    return false;
  }
}

export function relativeDate(iso: string): string {
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

export function statusColor(status: string): string {
  switch (status) {
    case "Pending":  return "var(--color-tasks)";
    case "Approved": return "var(--color-studio)";
    case "Active":   return "var(--color-done)";
    case "Draft":    return "var(--text-secondary)";
    default:         return "var(--text-secondary)";
  }
}

export function Pill({ label, color }: { label: string; color: string }) {
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

export function SubHeader({ label, count }: { label: string; count: number }) {
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

export function CleanState({ label }: { label: string }) {
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

// ── Swipe card — left → Archive, right → Approve, tap → open ───────────────────
// touchAction: "pan-y" lets the browser scroll the list vertically while this
// handles horizontal swipes. Tap is detected by total movement < 10px so it
// never conflicts with a swipe or a vertical scroll.
export function SwipeCard({
  accent, canApprove, onApprove, onArchive, onTap, children,
}: {
  accent: string;
  canApprove: boolean;
  onApprove: () => void;
  onArchive: () => void;
  onTap: () => void;
  children: React.ReactNode;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [gone, setGone]       = useState(false);

  const start     = useRef<{ x: number; y: number } | null>(null);
  const active    = useRef(false);
  const offsetRef = useRef(0);
  const movedMax  = useRef(0);
  const mode      = useRef<"undecided" | "swipe" | "scroll">("undecided");

  function down(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current   = { x: e.clientX, y: e.clientY };
    active.current  = true;
    mode.current    = "undecided";
    offsetRef.current = 0;
    movedMax.current  = 0;
  }

  function move(e: React.PointerEvent) {
    if (!active.current || !start.current) return;
    const nx = e.clientX - start.current.x;
    const ny = e.clientY - start.current.y;
    const mag = Math.sqrt(nx * nx + ny * ny);
    if (mag > movedMax.current) movedMax.current = mag;

    if (mode.current === "undecided" && mag >= 8) {
      if (Math.abs(nx) >= Math.abs(ny) * 1.5) {
        mode.current = "swipe";
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
      } else {
        mode.current = "scroll";   // browser pans vertically (touch-action: pan-y)
      }
    }

    if (mode.current !== "swipe") return;
    let x = nx;
    if (x > 0 && !canApprove) x = 0;   // disable right-swipe where approve isn't allowed
    offsetRef.current = x;
    setOffsetX(x);
  }

  function up() {
    if (!active.current) return;
    active.current = false;
    const x = offsetRef.current;
    const moved = movedMax.current;

    if (mode.current === "swipe" && Math.abs(x) >= COMMIT_THRESHOLD) {
      if (x < 0) { setGone(true); onArchive(); return; }
      if (x > 0 && canApprove) { onApprove(); }
      offsetRef.current = 0; setOffsetX(0); mode.current = "undecided";
      return;
    }
    if (moved < 10) {
      offsetRef.current = 0; setOffsetX(0); mode.current = "undecided";
      onTap();
      return;
    }
    offsetRef.current = 0; setOffsetX(0); mode.current = "undecided";
  }

  if (gone) return null;
  const progress = Math.min(1, Math.abs(offsetX) / COMMIT_THRESHOLD);

  return (
    <div className="relative" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      {offsetX < 0 && (
        <div
          className="absolute inset-0 flex items-center justify-end px-4"
          style={{ borderRadius: "var(--radius-lg)", background: `color-mix(in srgb, var(--color-personal) ${Math.round(progress * 26)}%, transparent)` }}
        >
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-personal)", opacity: progress }}>
            <ArchiveIcon size={13} /> Archive
          </span>
        </div>
      )}
      {offsetX > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-start px-4"
          style={{ borderRadius: "var(--radius-lg)", background: `color-mix(in srgb, ${TEAL} ${Math.round(progress * 26)}%, transparent)` }}
        >
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: TEAL, opacity: progress }}>
            <Check size={14} /> Approve
          </span>
        </div>
      )}

      <div
        className="relative select-none"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          borderLeft: `3px solid ${accent}`,
          borderRadius: "var(--radius-lg)",
          padding: "12px 14px",
          transform: `translateX(${offsetX}px)`,
          transition: active.current ? "none" : "transform 0.32s cubic-bezier(0.34,1.3,0.64,1)",
          willChange: "transform",
          touchAction: "pan-y",
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {children}
      </div>
    </div>
  );
}

// ── Undo toast (8s) — token-pure ──────────────────────────────────────────────
export function UndoToast({ message, onUndo, onExpire }: {
  message: string; onUndo: () => void; onExpire: () => void;
}) {
  const startAt = useRef(Date.now());
  const [pct, setPct] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      const left = UNDO_MS - (Date.now() - startAt.current);
      if (left <= 0) { clearInterval(id); onExpire(); } else { setPct(left / UNDO_MS); }
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

// Shared error toast (PATCH failures).
export function ErrorToast({ message }: { message: string }) {
  return (
    <div
      className="absolute left-3 right-3 z-40 px-4 py-3 shadow-xl"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        background: "var(--surface-elevated)",
        border: "1px solid color-mix(in srgb, var(--color-personal) 40%, var(--border-default))",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-personal)" }}>{message}</p>
    </div>
  );
}
