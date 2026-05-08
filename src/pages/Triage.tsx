import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, MicOff, Loader2, Check } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const COMMIT_THRESHOLD = 65; // identical to Tasks.tsx

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = "capture" | "pass2" | "done";
type Pass1Action = "today" | "tomorrow" | "someday" | "memory";
type Pass2Action = "memory" | "insight";
interface TriageItem { id: string; text: string }
interface Counts { today: number; tomorrow: number; someday: number; memory: number }

// ── Swipe targets — directions and colors mirror Tasks.tsx exactly.
//    Right (→) was "Tonight" — relabeled "Memory / Insight" per spec.
//    Left  (←) was "Done"    — relabeled "Someday" for triage context.

const P1_TARGETS = [
  { action: "today"    as Pass1Action, label: "Today",            color: "#f59e0b", arrow: "↑" },
  { action: "memory"   as Pass1Action, label: "Memory / Insight", color: "#c084fc", arrow: "→" },
  { action: "tomorrow" as Pass1Action, label: "Tomorrow",         color: "#60a5fa", arrow: "↓" },
  { action: "someday"  as Pass1Action, label: "Someday",          color: "#94a3b8", arrow: "←" },
];

const P2_TARGETS = [
  { action: "insight" as Pass2Action, label: "Key Insight", color: "#f59e0b", arrow: "→" },
  { action: "memory"  as Pass2Action, label: "Memory",      color: "#60a5fa", arrow: "←" },
];

// ── API helpers ──────────────────────────────────────────────────────────────

function createTask(title: string, bucket: "today" | "tomorrow" | "someday"): void {
  fetch(`${JARVIS_URL}/tasks/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, bucket }),
  })
    .then((r) => { if (!r.ok) console.error("[Triage] /tasks/create failed:", r.status, bucket, title); })
    .catch((err) => console.error("[Triage] /tasks/create network error:", err));
}

// Routes through /remi NLP: "Memory: …" → memory_capture intent → Memory Bank DB.
// "Key insight: …" → memory_capture with Insight category.
// No dedicated visual-memory endpoint exists without touching telegram_bot.py.
function saveMemory(text: string, type: Pass2Action): void {
  const message = type === "memory" ? `Memory: ${text}` : `Key insight: ${text}`;
  fetch(`${JARVIS_URL}/remi`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, user_id: "triage" }),
  })
    .then((r) => { if (!r.ok) console.error("[Triage] /remi memory save failed:", r.status, type, text); })
    .catch((err) => console.error("[Triage] /remi network error:", err));
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "recording.webm");
  fd.append("model", "whisper-1");
  fd.append("language", "en");
  const r = await fetch(`${JARVIS_URL}/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`Whisper ${r.status}`);
  return ((await r.json()).text ?? "").trim();
}

function uid(): string { return Math.random().toString(36).slice(2, 10); }

// ── Swipe direction resolvers ────────────────────────────────────────────────

function getP1Dominant(x: number, y: number) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax > ay) return x > 0 ? P1_TARGETS[1] : P1_TARGETS[3]; // right=memory, left=someday
  return y < 0 ? P1_TARGETS[0] : P1_TARGETS[2];              // up=today,   down=tomorrow
}

function getP2Dominant(x: number, y: number) {
  if (Math.abs(y) > Math.abs(x) * 0.8) return null; // too vertical — no commit in Pass 2
  return x > 0 ? P2_TARGETS[0] : P2_TARGETS[1];     // right=insight, left=memory
}

// ── Input row — matches AddTaskCard from Tasks.tsx ───────────────────────────

function TriageInputRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const taRef    = useRef<HTMLTextAreaElement>(null);
  const recRef   = useRef<MediaRecorder | null>(null);
  const chunks   = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => { taRef.current?.focus(); }, []);

  useEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
  }, [text]);

  function submit() {
    const t = text.trim(); if (!t) return;
    onAdd(t); setText("");
    setTimeout(() => taRef.current?.focus(), 50);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") setText("");
  }

  async function micDown() {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunks.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const rec  = new MediaRecorder(stream, { mimeType: mime });
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunks.current, { type: mime });
        chunks.current = [];
        if (blob.size > 0) {
          setTranscribing(true);
          try { const t = await transcribeAudio(blob); if (t) setText(t); } catch { /* silent */ }
          finally { setTranscribing(false); taRef.current?.focus(); }
        }
      };
      rec.start(100); setRecording(true);
    } catch { /* mic denied — silent */ }
  }

  function micUp() {
    if (!recRef.current || recRef.current.state === "inactive") return;
    recRef.current.stop(); recRef.current = null; setRecording(false);
  }

  const canSubmit = text.trim().length > 0;

  return (
    <div
      className="flex items-end gap-1.5 px-3 py-2 rounded-xl"
      style={{
        background: "#333333",
        borderLeft: "3px solid rgba(245,158,11,0.4)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Add an item…"
        rows={1}
        className="flex-1 bg-transparent text-lg text-white/85 outline-none min-w-0 placeholder:text-white/25 resize-none overflow-hidden"
        style={{ lineHeight: "1.4" }}
      />
      <button
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{
          background: recording ? "#ef444420" : "transparent",
          border: `1px solid ${recording ? "#ef4444" : transcribing ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.1)"}`,
        }}
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); micDown(); }}
        onPointerUp={micUp}
        onPointerLeave={micUp}
      >
        {transcribing
          ? <Loader2 size={11} className="animate-spin" style={{ color: "#f59e0b" }} />
          : recording
          ? <MicOff size={11} style={{ color: "#ef4444" }} />
          : <Mic size={11} style={{ color: "rgba(255,255,255,0.35)" }} />}
      </button>
      <button
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{
          background: canSubmit ? "#f59e0b22" : "transparent",
          border: `1px solid ${canSubmit ? "#f59e0b60" : "rgba(255,255,255,0.08)"}`,
        }}
        onClick={submit}
        disabled={!canSubmit}
      >
        <Check size={11} style={{ color: canSubmit ? "#f59e0b" : "rgba(255,255,255,0.2)" }} />
      </button>
    </div>
  );
}

// ── Pass 1 card — 4-direction swipe, identical to Tasks.tsx SwipeableCard ────

interface P1CardProps { item: TriageItem; onSwiped: (item: TriageItem, action: Pass1Action) => void }

function Pass1Card({ item, onSwiped }: P1CardProps) {
  const [offset, setOffset]       = useState({ x: 0, y: 0 });
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted]   = useState(false);
  const startPos      = useRef<{ x: number; y: number } | null>(null);
  const dragging      = useRef(false);
  const offsetRef     = useRef({ x: 0, y: 0 });
  const dirRef        = useRef<"undecided" | "swipe" | "scroll">("undecided");
  const commitColorRef = useRef("#94a3b8");

  const mag      = Math.sqrt(offset.x ** 2 + offset.y ** 2);
  const progress = Math.min(1, mag / COMMIT_THRESHOLD);
  const dominant = mag > 8 ? getP1Dominant(offset.x, offset.y) : null;
  const swipeColor = dominant ? dominant.color : "rgba(255,255,255,0.25)";

  function resetDrag() {
    dragging.current = false; dirRef.current = "undecided";
    offsetRef.current = { x: 0, y: 0 }; setOffset({ x: 0, y: 0 });
    startPos.current = null;
  }

  function onDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true; dirRef.current = "undecided";
    offsetRef.current = { x: 0, y: 0 }; e.stopPropagation();
  }

  function onMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x, ny = e.clientY - startPos.current.y;
    const m  = Math.sqrt(nx ** 2 + ny ** 2);
    if (dirRef.current === "undecided" && m >= 8) {
      const ax = Math.abs(nx), ay = Math.abs(ny);
      if (ax >= 1.5 * ay || ay >= 1.5 * ax) {
        dirRef.current = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else { dirRef.current = "scroll"; resetDrag(); return; }
    }
    if (dirRef.current !== "swipe") return;
    offsetRef.current = { x: nx, y: ny }; setOffset({ x: nx, y: ny });
  }

  function onUp() {
    if (!dragging.current) return;
    const { x, y } = offsetRef.current;
    const m = Math.sqrt(x ** 2 + y ** 2);
    if (dirRef.current === "swipe" && m >= COMMIT_THRESHOLD) {
      const swipe = getP1Dominant(x, y);
      commitColorRef.current = swipe.color;
      dragging.current = false; dirRef.current = "undecided";
      setCommitting(true);
      setTimeout(() => { setCommitted(true); onSwiped(item, swipe.action as Pass1Action); }, 200);
      return;
    }
    resetDrag();
  }

  if (committed) return null;

  return (
    <div className="relative rounded-xl" style={{ overflow: "hidden" }}>
      {/* Direction hint backdrop — identical to Tasks.tsx */}
      <div
        className="absolute inset-0 rounded-xl flex items-center justify-center"
        style={{
          background: dominant
            ? `color-mix(in srgb, ${swipeColor} ${Math.round(progress * 25)}%, transparent)`
            : "transparent",
          border: dominant
            ? `1.5px solid color-mix(in srgb, ${swipeColor} ${Math.round(progress * 70)}%, transparent)`
            : "1.5px solid transparent",
          transition: dragging.current ? "none" : "all 0.25s ease",
        }}
      >
        {dominant && (
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{
              color: swipeColor, opacity: progress,
              fontFamily: "'Space Mono', monospace",
              transition: dragging.current ? "none" : "opacity 0.15s",
            }}
          >
            {dominant.label}
          </span>
        )}
      </div>
      {/* Sliding card */}
      <div
        className="relative flex items-start gap-3 px-4 py-3.5 rounded-xl select-none"
        style={{
          background: committing ? `${commitColorRef.current}22` : "#333333",
          borderLeft: "3px solid rgba(245,158,11,0.4)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: dragging.current ? "none" : "transform 0.35s cubic-bezier(0.34,1.3,0.64,1), background 0.2s",
          willChange: "transform",
          cursor: mag > 4 ? "grabbing" : "default",
          touchAction: "none",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <p className="text-lg text-white/85 leading-snug flex-1 min-w-0 whitespace-normal break-words">
          {item.text}
        </p>
      </div>
    </div>
  );
}

// ── Pass 2 card — horizontal swipe only (left=Memory, right=Key Insight) ─────

interface P2CardProps { item: TriageItem; onSwiped: (item: TriageItem, action: Pass2Action) => void }

function Pass2Card({ item, onSwiped }: P2CardProps) {
  const [offset, setOffset]         = useState({ x: 0, y: 0 });
  const [committing, setCommitting]   = useState(false);
  const [committed, setCommitted]     = useState(false);
  const startPos      = useRef<{ x: number; y: number } | null>(null);
  const dragging      = useRef(false);
  const offsetRef     = useRef({ x: 0, y: 0 });
  const dirRef        = useRef<"undecided" | "swipe" | "scroll">("undecided");
  const commitColorRef = useRef("#60a5fa");

  const mag      = Math.abs(offset.x); // horizontal only
  const progress = Math.min(1, mag / COMMIT_THRESHOLD);
  const dominant = mag > 8 ? getP2Dominant(offset.x, offset.y) : null;
  const swipeColor = dominant ? dominant.color : "rgba(255,255,255,0.25)";

  function resetDrag() {
    dragging.current = false; dirRef.current = "undecided";
    offsetRef.current = { x: 0, y: 0 }; setOffset({ x: 0, y: 0 });
    startPos.current = null;
  }

  function onDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true; dirRef.current = "undecided";
    offsetRef.current = { x: 0, y: 0 }; e.stopPropagation();
  }

  function onMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x, ny = e.clientY - startPos.current.y;
    const m  = Math.sqrt(nx ** 2 + ny ** 2);
    if (dirRef.current === "undecided" && m >= 8) {
      const ax = Math.abs(nx), ay = Math.abs(ny);
      if (ax >= 1.5 * ay) {
        dirRef.current = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else { dirRef.current = "scroll"; resetDrag(); return; }
    }
    if (dirRef.current !== "swipe") return;
    offsetRef.current = { x: nx, y: 0 }; setOffset({ x: nx, y: 0 }); // y locked to 0
  }

  function onUp() {
    if (!dragging.current) return;
    const { x } = offsetRef.current;
    const m = Math.abs(x);
    if (dirRef.current === "swipe" && m >= COMMIT_THRESHOLD) {
      const swipe = getP2Dominant(x, 0);
      if (swipe) {
        commitColorRef.current = swipe.color;
        dragging.current = false; dirRef.current = "undecided";
        setCommitting(true);
        setTimeout(() => { setCommitted(true); onSwiped(item, swipe.action as Pass2Action); }, 200);
        return;
      }
    }
    resetDrag();
  }

  if (committed) return null;

  return (
    <div className="relative rounded-xl" style={{ overflow: "hidden" }}>
      <div
        className="absolute inset-0 rounded-xl flex items-center justify-center"
        style={{
          background: dominant
            ? `color-mix(in srgb, ${swipeColor} ${Math.round(progress * 25)}%, transparent)`
            : "transparent",
          border: dominant
            ? `1.5px solid color-mix(in srgb, ${swipeColor} ${Math.round(progress * 70)}%, transparent)`
            : "1.5px solid transparent",
          transition: dragging.current ? "none" : "all 0.25s ease",
        }}
      >
        {dominant && (
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{
              color: swipeColor, opacity: progress,
              fontFamily: "'Space Mono', monospace",
              transition: dragging.current ? "none" : "opacity 0.15s",
            }}
          >
            {dominant.label}
          </span>
        )}
      </div>
      <div
        className="relative flex items-start gap-3 px-4 py-3.5 rounded-xl select-none"
        style={{
          background: committing ? `${commitColorRef.current}22` : "#333333",
          borderLeft: "3px solid rgba(192,132,252,0.5)", // purple — flagged as memory in pass 1
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          transform: `translateX(${offset.x}px)`,
          transition: dragging.current ? "none" : "transform 0.35s cubic-bezier(0.34,1.3,0.64,1), background 0.2s",
          willChange: "transform",
          cursor: mag > 4 ? "grabbing" : "default",
          touchAction: "none",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <p className="text-lg text-white/85 leading-snug flex-1 min-w-0 whitespace-normal break-words">
          {item.text}
        </p>
      </div>
    </div>
  );
}

// ── Direction hint strip ──────────────────────────────────────────────────────

function HintStrip({ pass }: { pass: 1 | 2 }) {
  return (
    <div
      className="flex justify-between px-1"
      style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", fontWeight: 700,
               letterSpacing: "0.08em", textTransform: "uppercase" }}
    >
      {pass === 1 ? (
        <>
          <span style={{ color: "#94a3b8" }}>← Someday</span>
          <span style={{ color: "#f59e0b" }}>↑ Today</span>
          <span style={{ color: "#60a5fa" }}>↓ Tomorrow</span>
          <span style={{ color: "#c084fc" }}>→ Memory</span>
        </>
      ) : (
        <>
          <span style={{ color: "#60a5fa" }}>← Memory</span>
          <span style={{ color: "#f59e0b" }}>→ Key Insight</span>
        </>
      )}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function Header({ label, accent, count }: { label: string; accent: string; count?: number }) {
  const [, navigate] = useLocation();
  return (
    <div
      className="flex items-center gap-3 px-4 py-4 border-b border-white/5 shrink-0"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
    >
      <button
        className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors active:scale-95"
        onClick={() => navigate("/")}
      >
        <ArrowLeft size={18} />
      </button>
      <span
        className="text-sm font-bold tracking-widest uppercase"
        style={{ fontFamily: "'Space Mono', monospace", color: accent }}
      >
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span
          className="ml-auto text-xs text-white/30"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          {count} left
        </span>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Triage() {
  const [pass1Queue, setPass1Queue] = useState<TriageItem[]>([]);
  const [pass2Queue, setPass2Queue] = useState<TriageItem[]>([]);
  const [phase, setPhase]           = useState<Phase>("capture");
  const [counts, setCounts]         = useState<Counts>({ today: 0, tomorrow: 0, someday: 0, memory: 0 });

  // Transition: pass 1 complete → pass 2 or done
  useEffect(() => {
    if (phase !== "capture") return;
    const processed = counts.today + counts.tomorrow + counts.someday + pass2Queue.length;
    if (pass1Queue.length === 0 && processed === 0) return; // nothing has happened yet
    if (pass1Queue.length === 0) {
      setPhase(pass2Queue.length > 0 ? "pass2" : "done");
    }
  }, [pass1Queue.length, pass2Queue.length, counts, phase]);

  // Transition: pass 2 complete → done
  useEffect(() => {
    if (phase === "pass2" && pass2Queue.length === 0) setPhase("done");
  }, [pass2Queue.length, phase]);

  function addItem(text: string) {
    setPass1Queue((prev) => [...prev, { id: uid(), text }]);
  }

  function handlePass1Swipe(item: TriageItem, action: Pass1Action) {
    if (action === "today") {
      createTask(item.text, "today");
      setCounts((c) => ({ ...c, today: c.today + 1 }));
    } else if (action === "tomorrow") {
      createTask(item.text, "tomorrow");
      setCounts((c) => ({ ...c, tomorrow: c.tomorrow + 1 }));
    } else if (action === "someday") {
      createTask(item.text, "someday");
      setCounts((c) => ({ ...c, someday: c.someday + 1 }));
    } else if (action === "memory") {
      setPass2Queue((prev) => [...prev, item]);
    }
    setPass1Queue((prev) => prev.filter((i) => i.id !== item.id));
  }

  function handlePass2Swipe(item: TriageItem, action: Pass2Action) {
    saveMemory(item.text, action);
    setCounts((c) => ({ ...c, memory: c.memory + 1 }));
    setPass2Queue((prev) => prev.filter((i) => i.id !== item.id));
  }

  function reset() {
    setPass1Queue([]); setPass2Queue([]);
    setPhase("capture"); setCounts({ today: 0, tomorrow: 0, someday: 0, memory: 0 });
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === "done") {
    const total = counts.today + counts.tomorrow + counts.someday + counts.memory;
    return (
      <div className="flex flex-col h-screen" style={{ background: "#111111" }}>
        <Header label="Triage" accent="#f59e0b" />
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center space-y-2">
            <p
              className="text-white/30 text-xs font-bold tracking-widest uppercase mb-6"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              Done
            </p>
            {counts.today > 0 && (
              <p className="text-lg" style={{ color: "#f59e0b" }}>
                {counts.today} today
              </p>
            )}
            {counts.tomorrow > 0 && (
              <p className="text-lg" style={{ color: "#60a5fa" }}>
                {counts.tomorrow} tomorrow
              </p>
            )}
            {counts.someday > 0 && (
              <p className="text-lg" style={{ color: "#94a3b8" }}>
                {counts.someday} someday
              </p>
            )}
            {counts.memory > 0 && (
              <p className="text-lg" style={{ color: "#c084fc" }}>
                {counts.memory} saved to memory
              </p>
            )}
            {total === 0 && (
              <p className="text-lg text-white/30">Nothing sorted.</p>
            )}
          </div>
          <button
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b40" }}
            onClick={reset}
          >
            Start another session
          </button>
        </div>
      </div>
    );
  }

  // ── Pass 2 screen ────────────────────────────────────────────────────────────
  if (phase === "pass2") {
    return (
      <div className="flex flex-col h-screen" style={{ background: "#111111" }}>
        <Header label="Memory or Insight?" accent="#c084fc" count={pass2Queue.length} />
        <div className="flex-1 flex flex-col gap-4 px-4 py-4 overflow-y-auto">
          <HintStrip pass={2} />
          <div className="flex flex-col gap-3">
            {pass2Queue.map((item) => (
              <Pass2Card key={item.id} item={item} onSwiped={handlePass2Swipe} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Capture + Pass 1 screen ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen" style={{ background: "#111111" }}>
      <Header label="Triage" accent="#f59e0b" count={pass1Queue.length > 0 ? pass1Queue.length : undefined} />
      <div className="flex-1 flex flex-col gap-4 px-4 py-4 overflow-y-auto">
        <TriageInputRow onAdd={addItem} />
        {pass1Queue.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p
              className="text-white/20 text-sm text-center leading-loose"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              Add items above,<br />then swipe to sort.
            </p>
          </div>
        ) : (
          <>
            <HintStrip pass={1} />
            <div className="flex flex-col gap-3">
              {pass1Queue.map((item) => (
                <Pass1Card key={item.id} item={item} onSwiped={handlePass1Swipe} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
