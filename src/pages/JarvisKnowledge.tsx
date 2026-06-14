import { useState, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, Check, Archive as ArchiveIcon, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";
import {
  JARVIS_URL, authHeader, memoryPatch, relativeDate, statusColor,
  Pill, SubHeader, CleanState, SwipeCard, UndoToast, ErrorToast, TEAL, UNDO_MS,
} from "@/components/MemoryKit";

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
  _hidden?: boolean;
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

function pctConfidence(c: number): number {
  return Math.round(c * (c <= 1 ? 100 : 1));
}

export default function JarvisKnowledge() {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [entries, setEntries]       = useState<KnowEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet]           = useState<KnowEntry | null>(null);
  const [toastEntry, setToastEntry] = useState<KnowEntry | null>(null);
  const [errMsg, setErrMsg]         = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useGutterScroll(scrollRef);

  const pendingRef = useRef<KnowEntry | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError(false);
    try {
      const r = await fetch(`${JARVIS_URL}/jarvis_knowledge`, { headers: authHeader });
      if (!r.ok) throw new Error(`${r.status}`);
      setEntries((await r.json()) as KnowEntry[]);
    } catch (e) {
      console.error("[JarvisKnowledge] load failed:", e);
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

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pendingRef.current) memoryPatch("jarvis_knowledge", pendingRef.current.id, { status: "Archived" });
  }, []);

  function commitArchive(k: KnowEntry) {
    setEntries((prev) => prev.filter((e) => e.id !== k.id));
    memoryPatch("jarvis_knowledge", k.id, { status: "Archived" }).then((ok) => {
      if (!ok) setErrMsg("Couldn't save — try again");
    });
  }

  function archive(k: KnowEntry) {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (pendingRef.current && pendingRef.current.id !== k.id) commitArchive(pendingRef.current);

    setEntries((prev) => prev.map((e) => (e.id === k.id ? { ...e, _hidden: true } : e)));
    pendingRef.current = k;
    setToastEntry(k);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      setToastEntry(null);
      commitArchive(k);
    }, UNDO_MS);
  }

  function undo() {
    const k = pendingRef.current;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    pendingRef.current = null;
    setToastEntry(null);
    if (!k) return;
    setEntries((prev) => prev.map((e) => (e.id === k.id ? { ...e, _hidden: false, status: "Draft" } : e)));
    memoryPatch("jarvis_knowledge", k.id, { status: "Draft" });
  }

  function applyExtra(extra?: Record<string, string>): Partial<KnowEntry> {
    const out: Partial<KnowEntry> = {};
    if (extra?.title !== undefined) out.title = extra.title;
    if (extra?.canonical_statement !== undefined) out.canonical_statement = extra.canonical_statement;
    return out;
  }

  async function setStatus(k: KnowEntry, status: string, extra?: Record<string, string>) {
    const prev = k.status;
    setEntries((p) => p.map((e) => (e.id === k.id ? { ...e, status, ...applyExtra(extra) } : e)));
    const ok = await memoryPatch("jarvis_knowledge", k.id, { status, ...(extra || {}) });
    if (!ok) {
      setEntries((p) => p.map((e) => (e.id === k.id ? { ...e, status: prev } : e)));
      setErrMsg("Couldn't save — try again");
    }
  }

  const visible  = entries.filter((e) => !e._hidden);
  const needs    = visible.filter((e) => e.status !== "Approved" && e.status !== "Active");
  const active   = visible.filter((e) => e.status === "Active");
  const approved = visible.filter((e) => e.status === "Approved");

  function card(k: KnowEntry, group: "review" | "active" | "approved") {
    const flagged = k.status === "Pending";
    const accent =
      group === "active"   ? "var(--color-done)" :
      group === "approved" ? "var(--border-default)" :
      flagged ? "var(--color-tasks)" : TEAL;
    return (
      <SwipeCard
        key={k.id}
        accent={accent}
        canApprove={group === "review"}
        onApprove={() => setStatus(k, "Approved")}
        onArchive={() => archive(k)}
        onTap={() => setSheet(k)}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Pill label={k.type || "other"} color={typeColor(k.type)} />
          {group === "active" && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--color-done)" }}>In context</span>
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
            style={{ color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {k.canonical_statement}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {typeof k.confidence === "number" && (
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{pctConfidence(k.confidence)}% confidence</span>
          )}
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeDate(k.created_time)}</span>
        </div>
      </SwipeCard>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}>
      <PageHeader
        title="Jarvis Knowledge"
        color={TEAL}
        onMenu={() => setMenuOpen(true)}
        right={
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: refreshing ? TEAL : "var(--text-secondary)" }}
            onClick={() => load(true)}
            disabled={refreshing}
            data-testid="knowledge-refresh"
          >
            {refreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
        }
      />
      <div className="px-4 pt-2 pb-1 shrink-0">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>What Jarvis knows about you</p>
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
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Couldn't load knowledge</p>
            <button
              className="px-4 py-2 text-sm font-semibold active:scale-95"
              style={{ background: `color-mix(in srgb, ${TEAL} 16%, transparent)`, color: TEAL, borderRadius: "var(--radius-md)" }}
              onClick={() => load(true)}
              data-testid="knowledge-retry"
            >
              Tap to retry
            </button>
          </div>
        ) : (
          <>
            <SubHeader label="Needs Review" count={needs.length} />
            {needs.length === 0 ? (
              <CleanState label="Jarvis knowledge is clean" />
            ) : (
              <div className="space-y-2">{needs.map((k) => card(k, "review"))}</div>
            )}
            {active.length > 0 && (
              <>
                <SubHeader label="Active" count={active.length} />
                <div className="space-y-2">{active.map((k) => card(k, "active"))}</div>
              </>
            )}
            {approved.length > 0 && (
              <>
                <SubHeader label="Approved" count={approved.length} />
                <div className="space-y-2">{approved.map((k) => card(k, "approved"))}</div>
              </>
            )}
          </>
        )}
      </div>

      {toastEntry && <UndoToast message="Archived" onUndo={undo} onExpire={() => { /* commit handled by timer */ }} />}
      {errMsg && <ErrorToast message={errMsg} />}

      {sheet && (
        <KnowledgeSheet
          entry={sheet}
          onClose={() => setSheet(null)}
          onApprove={(extra) => { setStatus(sheet, "Approved", extra); setSheet(null); }}
          onActive={(extra) => { setStatus(sheet, "Active", extra); setSheet(null); }}
          onArchive={(extra) => {
            if (extra && Object.keys(extra).length) memoryPatch("jarvis_knowledge", sheet.id, extra);
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
function KnowledgeSheet({ entry, onClose, onApprove, onActive, onArchive }: {
  entry: KnowEntry;
  onClose: () => void;
  onApprove: (extra?: Record<string, string>) => void;
  onActive: (extra?: Record<string, string>) => void;
  onArchive: (extra?: Record<string, string>) => void;
}) {
  const [title, setTitle] = useState(entry.title);
  const [canon, setCanon] = useState(entry.canonical_statement);

  function extra(): Record<string, string> {
    const e: Record<string, string> = {};
    if (title !== entry.title) e.title = title;
    if (canon !== entry.canonical_statement) e.canonical_statement = canon;
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
          <Pill label={entry.type || "other"} color={typeColor(entry.type)} />
          <button className="p-1 rounded-lg hover:bg-white/5" style={{ color: "var(--text-secondary)" }} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="px-3 py-2.5 text-base mb-3" style={inputStyle} data-testid="sheet-title" />

        <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Canonical statement</label>
        <textarea value={canon} onChange={(e) => setCanon(e.target.value)} rows={4} className="px-3 py-2.5 text-sm mb-3 resize-none" style={inputStyle} data-testid="sheet-body" />

        <div className="mb-3 space-y-1.5">
          {entry.evidence_summary && (
            <div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Evidence: </span>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{entry.evidence_summary}</span>
            </div>
          )}
          {typeof entry.confidence === "number" && (
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{pctConfidence(entry.confidence)}% confidence</div>
          )}
          {entry.expires_at && (
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Expires {entry.expires_at}</div>
          )}
        </div>

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
          {entry.status === "Approved" && (
            <button
              className="flex-1 flex items-center justify-center gap-2 py-3 text-base font-semibold active:scale-95"
              style={{ background: "var(--color-done)", color: "var(--surface-base)", borderRadius: "var(--radius-md)" }}
              onClick={() => onActive(extra())}
              data-testid="sheet-active"
            >
              Mark Active
            </button>
          )}
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
