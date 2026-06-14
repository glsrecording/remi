import { useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Check, Archive as ArchiveIcon, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";
import {
  JARVIS_URL, authHeader, memoryPatch, relativeDate, statusColor,
  Pill, SubHeader, CleanState, SwipeCard, UndoToast, ErrorToast, TEAL, UNDO_MS,
} from "@/components/MemoryKit";

interface MemEntry {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  created_time: string;
  _hidden?: boolean;
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "Memory":      return "var(--color-studio)";
    case "Insight":     return "var(--color-tonight)";
    case "Gratitude":   return "var(--color-tasks)";
    case "Jarvis Chat": return "var(--text-secondary)";
    default:            return "var(--text-secondary)";
  }
}

export default function PersonalMemory() {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [entries, setEntries]       = useState<MemEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet]           = useState<MemEntry | null>(null);
  const [toastEntry, setToastEntry] = useState<MemEntry | null>(null);
  const [errMsg, setErrMsg]         = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useGutterScroll(scrollRef);

  // Deferred-archive bookkeeping: the PATCH to Archived only fires when the undo
  // window expires (or on flush/unmount) — never on the swipe itself.
  const pendingRef = useRef<MemEntry | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError(false);
    try {
      const r = await fetch(`${JARVIS_URL}/memory_bank`, { headers: authHeader });
      if (!r.ok) throw new Error(`${r.status}`);
      setEntries((await r.json()) as MemEntry[]);
    } catch (e) {
      console.error("[PersonalMemory] load failed:", e);
      setError(true);
    } finally {
      setLoading(false);
      if (showRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!errMsg) return;
    const id = setTimeout(() => setErrMsg(null), 3000);
    return () => clearTimeout(id);
  }, [errMsg]);

  // Commit any still-pending archive when the page unmounts (navigate away).
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pendingRef.current) memoryPatch("memory_bank", pendingRef.current.id, { status: "Archived" });
  }, []);

  function commitArchive(m: MemEntry) {
    setEntries((prev) => prev.filter((e) => e.id !== m.id));
    memoryPatch("memory_bank", m.id, { status: "Archived" }).then((ok) => {
      if (!ok) setErrMsg("Couldn't save — try again");
    });
  }

  function archive(m: MemEntry) {
    // Flush a previous pending archive (its undo window is over the moment a new one starts).
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (pendingRef.current && pendingRef.current.id !== m.id) commitArchive(pendingRef.current);

    setEntries((prev) => prev.map((e) => (e.id === m.id ? { ...e, _hidden: true } : e)));
    pendingRef.current = m;
    setToastEntry(m);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      setToastEntry(null);
      commitArchive(m);
    }, UNDO_MS);
  }

  function undo() {
    const m = pendingRef.current;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    pendingRef.current = null;
    setToastEntry(null);
    if (!m) return;
    setEntries((prev) => prev.map((e) => (e.id === m.id ? { ...e, _hidden: false, status: "Draft" } : e)));
    memoryPatch("memory_bank", m.id, { status: "Draft" });
  }

  async function approve(m: MemEntry, extra?: Record<string, string>) {
    const prev = m.status;
    setEntries((p) => p.map((e) => (e.id === m.id ? { ...e, status: "Approved", ...(extra ? parseExtra(extra) : {}) } : e)));
    const ok = await memoryPatch("memory_bank", m.id, { status: "Approved", ...(extra || {}) });
    if (!ok) {
      setEntries((p) => p.map((e) => (e.id === m.id ? { ...e, status: prev } : e)));
      setErrMsg("Couldn't save — try again");
    }
  }

  // Apply edited title/body locally so the card reflects the change immediately.
  function parseExtra(extra: Record<string, string>): Partial<MemEntry> {
    const out: Partial<MemEntry> = {};
    if (extra.title !== undefined) out.title = extra.title;
    if (extra.body !== undefined)  out.body = extra.body;
    return out;
  }

  const visible  = entries.filter((e) => !e._hidden);
  const needs    = visible.filter((e) => e.status !== "Approved");
  const approved = visible.filter((e) => e.status === "Approved");

  function card(m: MemEntry, inReview: boolean) {
    const flagged = m.status === "Pending";
    const accent  = !inReview ? "var(--border-default)" : flagged ? "var(--color-tasks)" : TEAL;
    return (
      <SwipeCard
        key={m.id}
        accent={accent}
        canApprove={inReview}
        onApprove={() => approve(m)}
        onArchive={() => archive(m)}
        onTap={() => setSheet(m)}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Pill label={m.category || "Memory"} color={categoryColor(m.category)} />
          <span className="flex-1" />
          {m.status && m.status !== "Approved" && <Pill label={m.status} color={statusColor(m.status)} />}
        </div>
        <p className="text-sm font-semibold leading-snug break-words" style={{ color: "var(--text-primary)" }}>
          {m.title || "Untitled"}
        </p>
        {m.body && (
          <p
            className="text-xs mt-1 leading-relaxed"
            style={{ color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {m.body}
          </p>
        )}
        <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>{relativeDate(m.created_time)}</p>
      </SwipeCard>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}>
      <PageHeader
        title="Personal Memory"
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
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Memories · Insights · Gratitude</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-24" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {loading ? (
          <div className="space-y-2 pt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse" style={{ height: 78, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-subtle)" }} />
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
            <SubHeader label="Needs Review" count={needs.length} />
            {needs.length === 0 ? (
              <CleanState label="Personal memory is clean" />
            ) : (
              <div className="space-y-2">{needs.map((m) => card(m, true))}</div>
            )}
            {approved.length > 0 && (
              <>
                <SubHeader label="Approved" count={approved.length} />
                <div className="space-y-2">{approved.map((m) => card(m, false))}</div>
              </>
            )}
          </>
        )}
      </div>

      {toastEntry && <UndoToast message="Archived" onUndo={undo} onExpire={() => { /* commit handled by timer */ }} />}
      {errMsg && <ErrorToast message={errMsg} />}

      {sheet && (
        <PersonalSheet
          entry={sheet}
          onClose={() => setSheet(null)}
          onApprove={(extra) => { approve(sheet, extra); setSheet(null); }}
          onArchive={(extra) => {
            // Persist any inline edits, then run the deferred archive flow.
            if (extra && Object.keys(extra).length) memoryPatch("memory_bank", sheet.id, extra);
            archive(sheet);
            setSheet(null);
          }}
        />
      )}

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

// ── Bottom sheet ──────────────────────────────────────────────────────────────
function PersonalSheet({ entry, onClose, onApprove, onArchive }: {
  entry: MemEntry;
  onClose: () => void;
  onApprove: (extra?: Record<string, string>) => void;
  onArchive: (extra?: Record<string, string>) => void;
}) {
  const [title, setTitle] = useState(entry.title);
  const [body, setBody]   = useState(entry.body);

  function extra(): Record<string, string> {
    const e: Record<string, string> = {};
    if (title !== entry.title) e.title = title;
    if (body !== entry.body)   e.body = body;
    return e;
  }
  const inputStyle: React.CSSProperties = {
    background: "var(--surface-card)", border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-md)", color: "var(--text-primary)", outline: "none", width: "100%",
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="rounded-t-2xl px-5 pt-4 overflow-y-auto"
        style={{
          background: "var(--surface-base)", borderTop: `1px solid color-mix(in srgb, ${TEAL} 33%, transparent)`,
          maxHeight: "88%", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <Pill label={entry.category || "Memory"} color={categoryColor(entry.category)} />
          <button className="p-1 rounded-lg hover:bg-white/5" style={{ color: "var(--text-secondary)" }} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="px-3 py-2.5 text-base mb-3" style={inputStyle} data-testid="sheet-title" />

        <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="px-3 py-2.5 text-sm mb-3 resize-none" style={inputStyle} data-testid="sheet-body" />

        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Captured {relativeDate(entry.created_time)}</p>

        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-2 py-3 text-base font-semibold active:scale-95"
            style={{ background: TEAL, color: "var(--surface-base)", borderRadius: "var(--radius-md)" }}
            onClick={() => onApprove(extra())}
            data-testid="sheet-approve"
          >
            <Check size={16} /> Approve
          </button>
          <button
            className="flex items-center justify-center gap-2 px-4 py-3 text-base font-semibold active:scale-95"
            style={{ background: "color-mix(in srgb, var(--color-personal) 14%, transparent)", color: "var(--color-personal)", borderRadius: "var(--radius-md)" }}
            onClick={() => onArchive(extra())}
            data-testid="sheet-archive"
          >
            <ArchiveIcon size={16} /> Archive
          </button>
        </div>
      </div>
    </div>
  );
}
