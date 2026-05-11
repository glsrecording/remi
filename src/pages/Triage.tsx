import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, MicOff, Loader2, Check, X } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const COMMIT_THRESHOLD = 65; // identical to Tasks.tsx
const LONG_PRESS_MS    = 500; // identical to Tasks.tsx

// ── Types ────────────────────────────────────────────────────────────────────

type Phase       = "capture" | "pass2" | "done";
type Pass1Action = "today" | "tonight" | "tomorrow" | "memory" | "someday";
type Pass2Action = "insight" | "memory" | "gratitude" | "bio";

interface TriageItem { id: string; text: string }
interface Counts {
  today: number; tonight: number; tomorrow: number; someday: number;
  insight: number; memory: number; gratitude: number; bio: number;
}

// ── Swipe targets ─────────────────────────────────────────────────────────────
// Pass 1 mirrors Tasks.tsx exactly: ↑Today ↓Tomorrow →Tonight ←Memory/Insight
// Long press → Someday (same as Tasks.tsx).

const P1_TARGETS = [
  { action: "today"   as Pass1Action, label: "Today",            color: "#f59e0b", arrow: "↑" },
  { action: "tonight" as Pass1Action, label: "Tonight",          color: "#c084fc", arrow: "→" },
  { action: "tomorrow"as Pass1Action, label: "Tomorrow",         color: "#60a5fa", arrow: "↓" },
  { action: "memory"  as Pass1Action, label: "Memory / Insight", color: "#94a3b8", arrow: "←" },
];

const P2_TARGETS = [
  { action: "insight"   as Pass2Action, label: "Key Insight", color: "#f59e0b", arrow: "→" },
  { action: "memory"    as Pass2Action, label: "Memory",      color: "#60a5fa", arrow: "←" },
  { action: "gratitude" as Pass2Action, label: "Gratitude",   color: "#22c55e", arrow: "↑" },
  { action: "bio"       as Pass2Action, label: "Bio Note",    color: "#fb923c", arrow: "↓" },
];

// ── API helpers ──────────────────────────────────────────────────────────────

function createTask(title: string, bucket: "today" | "tonight" | "tomorrow" | "someday"): void {
  fetch(`${JARVIS_URL}/tasks/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, bucket }),
  })
    .then((r) => { if (!r.ok) console.error("[Triage] /tasks/create failed:", r.status, bucket, title); })
    .catch((err) => console.error("[Triage] /tasks/create network error:", err));
}

function saveMemory(text: string, type: Pass2Action): void {
  const prefixes: Record<Pass2Action, string> = {
    insight:   "Key insight:",
    memory:    "Memory:",
    gratitude: "Gratitude:",
    bio:       "Bio note:",
  };
  const message = `${prefixes[type]} ${text}`;
  fetch(`${JARVIS_URL}/remi`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, user_id: "triage" }),
  })
    .then((r) => { if (!r.ok) console.error("[Triage] /remi save failed:", r.status, type, text); })
    .catch((err) => console.error("[Triage] /remi network error:", err));
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const fd = new FormData();
  const blobType = blob.type || "";
  const ext = blobType.includes("mp4") || blobType.includes("m4a") ? "mp4"
    : blobType.includes("ogg") ? "ogg" : "webm";
  fd.append("file", blob, `recording.${ext}`);
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

async function decomposeText(text: string): Promise<string[]> {
  try {
    const r = await fetch(`${JARVIS_URL}/triage/decompose`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items: string[] = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
    return items.length > 0 ? items : [text];
  } catch (err) {
    console.error("[Triage] decomposeText failed, using raw input:", err);
    return [text];
  }
}

// ── Swipe direction resolvers ────────────────────────────────────────────────

function getP1Dominant(x: number, y: number) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax > ay) return x > 0 ? P1_TARGETS[1] : P1_TARGETS[3]; // right=tonight, left=memory
  return y < 0 ? P1_TARGETS[0] : P1_TARGETS[2];              // up=today,    down=tomorrow
}

function getP2Dominant(x: number, y: number) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax > ay) return x > 0 ? P2_TARGETS[0] : P2_TARGETS[1]; // right=insight, left=memory
  return y < 0 ? P2_TARGETS[2] : P2_TARGETS[3];              // up=gratitude, down=bio
}

// ── Input row — matches AddTaskCard from Tasks.tsx ───────────────────────────

function TriageInputRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const micStartTimeRef = useRef<number>(0);
  const micCancelledRef = useRef(false);
  const touchEndedRef = useRef(false);
  const holdToSendRef = useRef(false);

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

  const stopRecorder = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop();
      recRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async (autoSubmit: boolean) => {
    if (isRecording) return;
    micCancelledRef.current = false;
    touchEndedRef.current = false;
    holdToSendRef.current = autoSubmit;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunks.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/ogg";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recRef.current = rec;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.current.push(ev.data); };
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const duration = Date.now() - micStartTimeRef.current;
        const cancelled = micCancelledRef.current;
        const autoSub = holdToSendRef.current;
        micCancelledRef.current = false;
        holdToSendRef.current = false;
        setIsRecording(false);
        if (cancelled || duration < 500) return;
        setIsProcessing(true);
        setTimeout(async () => {
          const blob = new Blob(chunks.current, { type: mime });
          chunks.current = [];
          if (blob.size === 0) { setIsProcessing(false); return; }
          try {
            const t = await transcribeAudio(blob);
            if (t) {
              if (autoSub) {
                onAdd(t.trim());
                setText("");
                setTimeout(() => taRef.current?.focus(), 50);
              } else {
                setText(t);
                taRef.current?.focus();
              }
            }
          } catch { /* silent */ }
          finally { setIsProcessing(false); }
        }, 800);
      };
      rec.start(100);
      micStartTimeRef.current = Date.now();
      if (touchEndedRef.current) {
        micCancelledRef.current = true;
        rec.stop();
        recRef.current = null;
        return;
      }
      setIsRecording(true);
    } catch { /* mic denied — silent */ }
  }, [isRecording, onAdd]);

  const handleLeftTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRecording(false);
  }, [startRecording]);

  const handleLeftTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!isRecording) { touchEndedRef.current = true; return; }
    stopRecorder();
  }, [isRecording, stopRecorder]);

  const handleRightTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startRecording(true);
  }, [startRecording]);

  const handleRightTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!isRecording) { touchEndedRef.current = true; return; }
    stopRecorder();
  }, [isRecording, stopRecorder]);

  const handleMicCancel = useCallback(() => {
    micCancelledRef.current = true;
    stopRecorder();
  }, [stopRecorder]);

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

      {/* Left mic — transcribe to input field */}
      <button
        type="button"
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{
          background: isRecording ? "#ef444420" : "transparent",
          border: `1px solid ${isRecording ? "#ef4444" : isProcessing ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.1)"}`,
          touchAction: "none",
        }}
        onTouchStart={handleLeftTouchStart}
        onTouchEnd={handleLeftTouchEnd}
        onTouchCancel={handleMicCancel}
      >
        {isProcessing
          ? <Loader2 size={11} className="animate-spin" style={{ color: "#f59e0b" }} />
          : isRecording
          ? <MicOff size={11} style={{ color: "#ef4444" }} />
          : <Mic size={11} style={{ color: "rgba(255,255,255,0.35)" }} />}
      </button>

      {/* Confirm */}
      <button
        type="button"
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

      {/* Right amber mic — auto-submits on release */}
      <button
        type="button"
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 ${isRecording ? "voice-button-recording" : ""}`}
        style={{
          background: isRecording ? "#ef444420" : "#f59e0b14",
          border: `1px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
          marginRight: "24px",
          touchAction: "none",
        }}
        onTouchStart={handleRightTouchStart}
        onTouchEnd={handleRightTouchEnd}
        onTouchCancel={handleMicCancel}
      >
        {isProcessing
          ? <Loader2 size={11} className="animate-spin" style={{ color: "#f59e0b" }} />
          : isRecording
          ? <MicOff size={11} style={{ color: "#ef4444" }} />
          : <Mic size={11} style={{ color: "#f59e0b" }} />}
      </button>
    </div>
  );
}

// ── Pass 1 card — 4-direction swipe + long press (Someday) + dismiss X ────────
// Gesture map mirrors Tasks.tsx SwipeableCard exactly.

interface P1CardProps {
  item: TriageItem;
  onSwiped: (item: TriageItem, action: Pass1Action) => void;
  onDismissed: (item: TriageItem) => void;
}

function Pass1Card({ item, onSwiped, onDismissed }: P1CardProps) {
  const [offset, setOffset]         = useState({ x: 0, y: 0 });
  const [committing, setCommitting]   = useState(false);
  const [committed, setCommitted]     = useState(false);
  const [longPressing, setLongPressing] = useState(false);

  const startPos       = useRef<{ x: number; y: number } | null>(null);
  const dragging       = useRef(false);
  const offsetRef      = useRef({ x: 0, y: 0 });
  const dirRef         = useRef<"undecided" | "swipe" | "scroll">("undecided");
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitColorRef = useRef("#94a3b8");

  const mag      = Math.sqrt(offset.x ** 2 + offset.y ** 2);
  const progress = Math.min(1, mag / COMMIT_THRESHOLD);
  const dominant = mag > 8 ? getP1Dominant(offset.x, offset.y) : null;
  const swipeColor = dominant ? dominant.color : "rgba(255,255,255,0.25)";

  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    setLongPressing(false);
  }

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

    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      if (!dragging.current) return;
      if (Math.sqrt(offsetRef.current.x ** 2 + offsetRef.current.y ** 2) < 8) {
        setLongPressing(true);
        dragging.current = false; dirRef.current = "undecided";
        commitColorRef.current = "#94a3b8";
        setCommitting(true);
        setTimeout(() => { setCommitted(true); onSwiped(item, "someday"); }, 200);
      }
    }, LONG_PRESS_MS);
  }

  function onMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x, ny = e.clientY - startPos.current.y;
    const m  = Math.sqrt(nx ** 2 + ny ** 2);
    if (m >= 8) cancelLongPress();
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
    cancelLongPress();
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
    <div className="relative rounded-xl" style={{ overflow: "hidden", touchAction: "none" }}>
      {/* Direction hint backdrop */}
      <div
        className="absolute inset-0 rounded-xl flex items-center justify-center"
        style={{
          background: dominant
            ? `color-mix(in srgb, ${swipeColor} ${Math.round(progress * 25)}%, transparent)`
            : longPressing
            ? "color-mix(in srgb, #94a3b8 20%, transparent)"
            : "transparent",
          border: dominant
            ? `1.5px solid color-mix(in srgb, ${swipeColor} ${Math.round(progress * 70)}%, transparent)`
            : longPressing
            ? "1.5px solid #94a3b870"
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
        {longPressing && !dominant && (
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{ color: "#94a3b8", fontFamily: "'Space Mono', monospace" }}
          >
            Someday
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
        onContextMenu={(e) => e.preventDefault()}
      >
        <p className="text-lg text-white/85 leading-snug flex-1 min-w-0 whitespace-normal break-words pr-5">
          {item.text}
        </p>
        <button
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-30 hover:opacity-60 transition-opacity active:scale-90"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); setCommitted(true); onDismissed(item); }}
        >
          <X size={8} style={{ color: "rgba(255,255,255,0.7)" }} />
        </button>
      </div>
    </div>
  );
}

// ── Pass 2 card — 4-direction swipe + dismiss X ───────────────────────────────
// ↑Gratitude ↓Bio →Key Insight ←Memory — all routed via /remi with prefix.

interface P2CardProps {
  item: TriageItem;
  onSwiped: (item: TriageItem, action: Pass2Action) => void;
  onDismissed: (item: TriageItem) => void;
}

function Pass2Card({ item, onSwiped, onDismissed }: P2CardProps) {
  const [offset, setOffset]         = useState({ x: 0, y: 0 });
  const [committing, setCommitting]   = useState(false);
  const [committed, setCommitted]     = useState(false);

  const startPos       = useRef<{ x: number; y: number } | null>(null);
  const dragging       = useRef(false);
  const offsetRef      = useRef({ x: 0, y: 0 });
  const dirRef         = useRef<"undecided" | "swipe" | "scroll">("undecided");
  const commitColorRef = useRef("#60a5fa");

  const mag      = Math.sqrt(offset.x ** 2 + offset.y ** 2);
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
      const swipe = getP2Dominant(x, y);
      commitColorRef.current = swipe.color;
      dragging.current = false; dirRef.current = "undecided";
      setCommitting(true);
      setTimeout(() => { setCommitted(true); onSwiped(item, swipe.action as Pass2Action); }, 200);
      return;
    }
    resetDrag();
  }

  if (committed) return null;

  return (
    <div className="relative rounded-xl" style={{ overflow: "hidden", touchAction: "none" }}>
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
          borderLeft: "3px solid rgba(148,163,184,0.4)", // gray — from memory swipe in pass 1
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
        onContextMenu={(e) => e.preventDefault()}
      >
        <p className="text-lg text-white/85 leading-snug flex-1 min-w-0 whitespace-normal break-words pr-5">
          {item.text}
        </p>
        <button
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-30 hover:opacity-60 transition-opacity active:scale-90"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); setCommitted(true); onDismissed(item); }}
        >
          <X size={8} style={{ color: "rgba(255,255,255,0.7)" }} />
        </button>
      </div>
    </div>
  );
}

// ── Skeleton card — pulsing placeholder shown while decompose is in-flight ────

function SkeletonCard() {
  return (
    <div
      className="animate-pulse px-4 py-3.5 rounded-xl"
      style={{
        background: "#2a2a2a",
        borderLeft: "3px solid rgba(245,158,11,0.12)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="rounded"
        style={{ height: "20px", background: "rgba(255,255,255,0.07)", width: "72%" }}
      />
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
          <span style={{ color: "#94a3b8" }}>← Memory</span>
          <span style={{ color: "#f59e0b" }}>↑ Today</span>
          <span style={{ color: "#60a5fa" }}>↓ Tomorrow</span>
          <span style={{ color: "#c084fc" }}>→ Tonight</span>
        </>
      ) : (
        <>
          <span style={{ color: "#22c55e" }}>↑ Gratitude</span>
          <span style={{ color: "#60a5fa" }}>← Memory</span>
          <span style={{ color: "#f59e0b" }}>→ Insight</span>
          <span style={{ color: "#fb923c" }}>↓ Bio</span>
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

const ZERO_COUNTS: Counts = { today: 0, tonight: 0, tomorrow: 0, someday: 0, insight: 0, memory: 0, gratitude: 0, bio: 0 };

export default function Triage() {
  const [, navigate] = useLocation();
  const [pass1Queue, setPass1Queue] = useState<TriageItem[]>([]);
  const [pass2Queue, setPass2Queue] = useState<TriageItem[]>([]);
  const [phase, setPhase]           = useState<Phase>("capture");
  const [counts, setCounts]         = useState<Counts>(ZERO_COUNTS);
  const [decomposing, setDecomposing] = useState(false);
  const hasStarted = useRef(false); // true once any item enters pass1Queue

  // On mount: load pre-decomposed items from a Remi brain dump redirect
  useEffect(() => {
    const preload = sessionStorage.getItem("triage_preload");
    if (!preload) return;
    sessionStorage.removeItem("triage_preload");
    try {
      const items: string[] = JSON.parse(preload);
      if (Array.isArray(items) && items.length > 0) {
        hasStarted.current = true;
        setPass1Queue(items.filter(Boolean).map((t) => ({ id: uid(), text: t })));
      }
    } catch { /* malformed preload — ignore */ }
  }, []);

  // Transition: pass 1 complete → pass 2 or done
  useEffect(() => {
    if (phase !== "capture") return;
    if (pass1Queue.length === 0 && !hasStarted.current) return; // nothing added yet
    if (pass1Queue.length === 0) {
      setPhase(pass2Queue.length > 0 ? "pass2" : "done");
    }
  }, [pass1Queue.length, pass2Queue.length, phase]);

  // Transition: pass 2 complete → done
  useEffect(() => {
    if (phase === "pass2" && pass2Queue.length === 0) setPhase("done");
  }, [pass2Queue.length, phase]);

  function addItem(text: string): void {
    hasStarted.current = true;
    setDecomposing(true);
    decomposeText(text)
      .then((items) => {
        setPass1Queue((prev) => [...prev, ...items.map((t) => ({ id: uid(), text: t }))]);
      })
      .finally(() => setDecomposing(false));
  }

  function handlePass1Swipe(item: TriageItem, action: Pass1Action) {
    if (action === "today") {
      createTask(item.text, "today");
      setCounts((c) => ({ ...c, today: c.today + 1 }));
    } else if (action === "tonight") {
      createTask(item.text, "tonight");
      setCounts((c) => ({ ...c, tonight: c.tonight + 1 }));
    } else if (action === "tomorrow") {
      createTask(item.text, "tomorrow");
      setCounts((c) => ({ ...c, tomorrow: c.tomorrow + 1 }));
    } else if (action === "someday") {
      createTask(item.text, "someday");
      setCounts((c) => ({ ...c, someday: c.someday + 1 }));
    } else if (action === "memory") {
      setPass2Queue((prev) => [...prev, item]); // no count yet — incremented in pass 2
    }
    setPass1Queue((prev) => prev.filter((i) => i.id !== item.id));
  }

  function handlePass1Dismiss(item: TriageItem) {
    setPass1Queue((prev) => prev.filter((i) => i.id !== item.id));
  }

  function handlePass2Swipe(item: TriageItem, action: Pass2Action) {
    saveMemory(item.text, action);
    if (action === "insight")   setCounts((c) => ({ ...c, insight:   c.insight   + 1 }));
    else if (action === "memory")    setCounts((c) => ({ ...c, memory:    c.memory    + 1 }));
    else if (action === "gratitude") setCounts((c) => ({ ...c, gratitude: c.gratitude + 1 }));
    else if (action === "bio")       setCounts((c) => ({ ...c, bio:       c.bio       + 1 }));
    setPass2Queue((prev) => prev.filter((i) => i.id !== item.id));
  }

  function handlePass2Dismiss(item: TriageItem) {
    setPass2Queue((prev) => prev.filter((i) => i.id !== item.id));
  }

  function reset() {
    hasStarted.current = false;
    setPass1Queue([]); setPass2Queue([]);
    setPhase("capture"); setCounts(ZERO_COUNTS);
    setDecomposing(false);
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === "done") {
    const total = counts.today + counts.tonight + counts.tomorrow + counts.someday
                + counts.insight + counts.memory + counts.gratitude + counts.bio;
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
            {counts.tonight > 0 && (
              <p className="text-lg" style={{ color: "#c084fc" }}>
                {counts.tonight} tonight
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
            {counts.insight > 0 && (
              <p className="text-lg" style={{ color: "#f59e0b" }}>
                {counts.insight} key insight{counts.insight !== 1 ? "s" : ""}
              </p>
            )}
            {counts.memory > 0 && (
              <p className="text-lg" style={{ color: "#60a5fa" }}>
                {counts.memory} to memory
              </p>
            )}
            {counts.gratitude > 0 && (
              <p className="text-lg" style={{ color: "#22c55e" }}>
                {counts.gratitude} gratitude{counts.gratitude !== 1 ? "s" : ""}
              </p>
            )}
            {counts.bio > 0 && (
              <p className="text-lg" style={{ color: "#fb923c" }}>
                {counts.bio} bio note{counts.bio !== 1 ? "s" : ""}
              </p>
            )}
            {total === 0 && (
              <p className="text-lg text-white/30">Nothing sorted.</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: "#ffffff10", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.12)" }}
              onClick={reset}
            >
              New session
            </button>
            <button
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b40" }}
              onClick={() => navigate("/brain-dump")}
            >
              Task view
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Pass 2 screen ────────────────────────────────────────────────────────────
  if (phase === "pass2") {
    return (
      <div className="flex flex-col h-screen" style={{ background: "#111111" }}>
        <Header label="What type?" accent="#94a3b8" count={pass2Queue.length} />
        <div className="flex-1 flex flex-col gap-4 px-4 py-4 overflow-y-auto">
          <HintStrip pass={2} />
          <div className="flex flex-col gap-3" style={{ touchAction: "none" }}>
            {pass2Queue.map((item) => (
              <Pass2Card
                key={item.id}
                item={item}
                onSwiped={handlePass2Swipe}
                onDismissed={handlePass2Dismiss}
              />
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
        {pass1Queue.length === 0 && decomposing ? (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : pass1Queue.length === 0 ? (
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
            <div className="flex flex-col gap-3" style={{ touchAction: "none" }}>
              {pass1Queue.map((item) => (
                <Pass1Card
                  key={item.id}
                  item={item}
                  onSwiped={handlePass1Swipe}
                  onDismissed={handlePass1Dismiss}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
