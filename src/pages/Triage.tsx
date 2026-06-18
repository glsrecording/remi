import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import { useLocation } from "wouter";
import { Mic, MicOff, Loader2, Check, X, Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const COMMIT_THRESHOLD = 65; // identical to Tasks.tsx
const LONG_PRESS_MS    = 500; // identical to Tasks.tsx

// Design-system context colors (mirror design-system.css; hex so the `color + "33"`
// alpha-concat glow pattern works — mode-independent, safe in light + dark).
// Triage's identity is purple (the capture/ambient color); swipe targets map to
// the context palette. NB: the const is named PINK for history but now holds the
// purple identity value — every PINK reference renders purple.
const PINK   = "#9b8de8";  // --color-tonight (purple) — screen identity / cards
const AMBER  = "#f5a623";  // --color-tasks    — Today / Key Insight
const TEAL   = "#3dd6b0";  // --color-studio   — Tomorrow
const PURPLE = "#9b8de8";  // --color-tonight  — Queue
const BLUE   = "#378add";  // --color-calls    — Someday / Memory (pass 2)
const GREEN  = "#5bc468";  // --color-done     — Gratitude
const GRAY   = "#888890";  // --text-secondary — Memory / Insight (neutral, pass 1)
const ALERT  = "#ef4444";  // recording / delete (semantic, mode-independent)

// ── Types ────────────────────────────────────────────────────────────────────

type Phase       = "capture" | "pass2" | "done";
type Pass1Action = "today" | "tomorrow" | "queue" | "memory" | "someday";
type Pass2Action = "insight" | "memory" | "gratitude" | "jarvis";

// `backlog` items are EXISTING Notion tasks (id = real page id) surfaced by the
// "what am I behind on" sweep — they reschedule via /tasks/move, never create.
interface TriageItem { id: string; text: string; backlog?: boolean }
interface Counts {
  today: number; tomorrow: number; queue: number; someday: number;
  insight: number; memory: number; gratitude: number; jarvis: number;
}

// ── Swipe targets ─────────────────────────────────────────────────────────────
// Pass 1: ↑Today →Tomorrow ↓Queue ←Memory/Insight
// Long press → Someday (same as Tasks.tsx).

const P1_TARGETS = [
  { action: "today"    as Pass1Action, label: "Today",            color: AMBER,  arrow: "↑" },
  { action: "tomorrow" as Pass1Action, label: "Tomorrow",         color: TEAL,   arrow: "→" },
  { action: "queue"    as Pass1Action, label: "Queue",            color: PURPLE, arrow: "↓" },
  { action: "memory"   as Pass1Action, label: "Memory / Insight", color: GRAY,   arrow: "←" },
];

const P2_TARGETS = [
  { action: "insight"   as Pass2Action, label: "Key Insight",      color: AMBER,  arrow: "→" },
  { action: "memory"    as Pass2Action, label: "Memory",           color: BLUE,   arrow: "←" },
  { action: "gratitude" as Pass2Action, label: "Gratitude",        color: GREEN,  arrow: "↑" },
  { action: "jarvis"    as Pass2Action, label: "Jarvis Knowledge", color: PURPLE, arrow: "↓" },
];

const SOMEDAY_COLOR = BLUE;  // long-press → Someday (was gray)

// ── API helpers ──────────────────────────────────────────────────────────────

function createTask(title: string, bucket: "today" | "tomorrow" | "queue" | "someday"): void {
  fetch(`${JARVIS_URL}/tasks/create`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, bucket }),
  })
    .then((r) => { if (!r.ok) console.error("[Triage] /tasks/create failed:", r.status, bucket, title); })
    .catch((err) => console.error("[Triage] /tasks/create network error:", err));
}

// Reschedule an EXISTING task (backlog sweep) — moves the Notion page, never
// creates a duplicate. /tasks/move accepts today | tomorrow | someday here.
function moveTask(pageId: string, bucket: "today" | "tomorrow" | "someday"): void {
  fetch(`${JARVIS_URL}/tasks/move`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: pageId, bucket }),
  })
    .then((r) => { if (!r.ok) console.error("[Triage] /tasks/move failed:", r.status, bucket, pageId); })
    .catch((err) => console.error("[Triage] /tasks/move network error:", err));
}

interface BacklogTask { id: string; text: string }
async function fetchBacklog(excludeIds: string[]): Promise<BacklogTask[]> {
  const qs = excludeIds.length ? `?exclude=${encodeURIComponent(excludeIds.join(","))}` : "";
  const r = await fetch(`${JARVIS_URL}/triage-backlog${qs}`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!r.ok) throw new Error(`triage-backlog ${r.status}`);
  const data = await r.json();
  return Array.isArray(data.tasks) ? (data.tasks as BacklogTask[]) : [];
}

// "what am I behind on" and close variants → surface the backlog sweep.
function isBacklogPhrase(text: string): boolean {
  const s = text.trim().toLowerCase().replace(/[.?!]+$/, "");
  return (
    /\bbehind on\b/.test(s) ||
    /what'?s?\s+overdue\b/.test(s) ||
    /\bshow\s+(?:me\s+)?overdue\b/.test(s) ||
    /\bwhat did i miss\b/.test(s) ||
    s === "overdue"
  );
}

function saveMemory(text: string, type: Pass2Action): void {
  const prefixes: Record<Pass2Action, string> = {
    insight:   "Key insight:",
    memory:    "Memory:",
    gratitude: "Gratitude:",
    jarvis:    "Add to my Jarvis Knowledge:",
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
  return y < 0 ? P2_TARGETS[2] : P2_TARGETS[3];              // up=gratitude, down=jarvis
}

// ── Input row — Journal mic pattern (getUserMedia at mount, pointer events, lock mode) ─

function TriageInputRow({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [focused, setFocused] = useState(false);  // pink glow on focus (MainChat pattern)
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  // getUserMedia called once at mount — never inside a pointer/touch handler
  const micStreamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const pointerStartYRef = useRef<number>(0);
  const micStartTimeRef = useRef<number>(0);
  const cancelledRef = useRef(false);

  useEffect(() => { taRef.current?.focus(); }, []);

  useEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
  }, [text]);

  // Acquire mic permission at mount; release on unmount
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => { micStreamRef.current = stream; })
      .catch(() => {});
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    };
  }, []);

  function submit() {
    const t = text.trim(); if (!t) return;
    onAdd(t); setText("");
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 1500);
    setTimeout(() => taRef.current?.focus(), 50);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") setText("");
  }

  // Start recording from pre-mounted stream — synchronous, no getUserMedia call.
  // Transcript goes directly to onAdd (no review step).
  function startMediaRecording() {
    if (isRecording) return;
    if (!micStreamRef.current) return;
    cancelledRef.current = false;
    audioChunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const recorder = new MediaRecorder(micStreamRef.current, { mimeType });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
    recorder.onstop = () => {
      const duration = Date.now() - micStartTimeRef.current;
      const cancelled = cancelledRef.current;
      cancelledRef.current = false;
      setIsRecording(false);
      setIsLocked(false);
      // Discard taps under 500ms or explicit cancels
      if (cancelled || duration < 500) return;
      setIsProcessing(true);
      // 800ms flush: Safari delivers dataavailable after onstop (out of spec)
      setTimeout(async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (blob.size === 0) { setIsProcessing(false); return; }
        try {
          const transcript = await transcribeAudio(blob);
          if (transcript) {
            onAdd(transcript);
            setJustSubmitted(true);
            setTimeout(() => setJustSubmitted(false), 1500);
          }
        } catch { /* silent */ }
        finally { setIsProcessing(false); }
      }, 800);
    };
    recorder.start(100);
    micStartTimeRef.current = Date.now();
    setIsRecording(true);
  }

  const handleMicCancel = useCallback(() => {
    cancelledRef.current = true;
    setIsLocked(false);
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    holdActiveRef.current = false;
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleMicSend = useCallback(() => {
    setIsLocked(false);
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  const canSubmit = text.trim().length > 0;

  return (
    <div
      style={{
        background: "var(--surface-elevated)",
        borderRadius: "var(--radius-lg)",
        // Solid purple border + a constant neon glow (the capture zone is the
        // energy source for the ambient field). Focus intensifies the glow.
        border: `1.5px solid ${PINK}`,
        boxShadow: focused
          ? `0 0 16px ${PINK}80, 0 0 30px ${PINK}3a, inset 0 0 10px ${PINK}1f`
          : `0 0 12px ${PINK}66, 0 0 24px ${PINK}26`,
        transition: "border-color 0.15s ease, box-shadow 0.2s ease",
      }}
    >
      {/* Lock bar */}
      {isLocked && (
        <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <button type="button" onClick={handleMicCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
            style={{ background: `${ALERT}1f`, border: `1px solid ${ALERT}40`, color: ALERT }}>
            <X size={12} /> Cancel
          </button>
          <div className="flex items-center gap-1.5">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="wave-bar w-0.5 rounded-full" style={{ height: "14px", background: ALERT, animationDelay: `${(i-1)*0.1}s` }} />
            ))}
            <Lock size={12} className="ml-1" style={{ color: PINK }} />
          </div>
          <button type="button" onClick={handleMicSend}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
            style={{ background: `${PINK}26`, border: `1px solid ${PINK}66`, color: PINK }}>
            Send ↑
          </button>
        </div>
      )}
      {/* Recording indicator */}
      {(isRecording && !isLocked) && (
        <div className="flex items-center justify-center gap-2 px-3 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="wave-bar w-0.5 rounded-full" style={{ height: "14px", background: ALERT, animationDelay: `${(i-1)*0.1}s` }} />
          ))}
          <span className="text-xs ml-1" style={{ color: ALERT }}>Recording</span>
          <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>↑ slide to lock</span>
        </div>
      )}
      {/* Capture feedback — brief pink ✓ after text or voice submit */}
      {justSubmitted && !isRecording && !isProcessing && !isLocked && (
        <div className="flex items-center justify-center gap-1.5 px-3 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <Check size={11} style={{ color: PINK }} />
          <span className="text-xs" style={{ color: PINK }}>Added</span>
        </div>
      )}
      {/* Input row */}
      <div className="flex items-end gap-1.5 px-3 py-2">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add an item…"
          rows={1}
          className="flex-1 bg-transparent text-lg outline-none min-w-0 resize-none overflow-hidden placeholder:opacity-50"
          style={{ lineHeight: "1.4", color: "var(--text-primary)" }}
        />
        {/* Confirm / Send — pink filled when text present, pink-outlined when empty */}
        <button
          type="button"
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{
            background: canSubmit ? PINK : "transparent",
            border: `1px solid ${canSubmit ? PINK : `${PINK}80`}`,
          }}
          onClick={submit}
          disabled={!canSubmit}
        >
          <Check size={11} style={{ color: canSubmit ? "#1a0a12" : `${PINK}99` }} />
        </button>
        {/* Mic — outlined pink at rest, filled (red) while recording, slide up to lock */}
        <button
          type="button"
          className={`shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 ${isRecording && !isLocked ? "voice-button-recording" : ""}`}
          style={{
            background: isRecording ? ALERT : "transparent",
            border: `1.5px solid ${isRecording ? ALERT : PINK}`,
            boxShadow: `0 0 12px ${isRecording ? ALERT : PINK}3a`,
            marginRight: "20px",
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
            pointerStartYRef.current = e.clientY;
            holdActiveRef.current = false;
            setIsLocked(false);
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
            holdTimerRef.current = setTimeout(() => {
              holdActiveRef.current = true;
              startMediaRecording();
            }, 150);
          }}
          onPointerMove={(e) => {
            if (!isRecording || isLocked) return;
            const deltaY = pointerStartYRef.current - e.clientY;
            if (deltaY > 60) setIsLocked(true);
          }}
          onPointerUp={() => {
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            holdActiveRef.current = false;
            if (isLocked) return;
            if (mediaRecorderRef.current?.state !== "inactive") {
              mediaRecorderRef.current?.stop();
              mediaRecorderRef.current = null;
            }
          }}
          onPointerCancel={() => {
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            holdActiveRef.current = false;
            if (isLocked) return;
            if (mediaRecorderRef.current?.state !== "inactive") {
              mediaRecorderRef.current?.stop();
              mediaRecorderRef.current = null;
            }
          }}
          onPointerLeave={() => {
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            holdActiveRef.current = false;
            if (isLocked) return;
            if (mediaRecorderRef.current?.state !== "inactive") {
              mediaRecorderRef.current?.stop();
              mediaRecorderRef.current = null;
            }
          }}
        >
          {isProcessing ? (
            <Loader2 size={16} className="animate-spin" style={{ color: PINK }} />
          ) : isRecording && isLocked ? (
            <Lock size={16} style={{ color: "#ffffff" }} />
          ) : isRecording ? (
            <MicOff size={16} style={{ color: "#ffffff" }} />
          ) : (
            <Mic size={16} style={{ color: PINK }} />
          )}
        </button>
      </div>
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
  const commitColorRef = useRef(SOMEDAY_COLOR);

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
        commitColorRef.current = SOMEDAY_COLOR;
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
            ? `color-mix(in srgb, ${SOMEDAY_COLOR} 20%, transparent)`
            : "transparent",
          border: dominant
            ? `1.5px solid color-mix(in srgb, ${swipeColor} ${Math.round(progress * 70)}%, transparent)`
            : longPressing
            ? `1.5px solid ${SOMEDAY_COLOR}70`
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
            style={{ color: SOMEDAY_COLOR, fontFamily: "'Space Mono', monospace" }}
          >
            Someday
          </span>
        )}
      </div>
      {/* Sliding card */}
      <div
        className="relative flex flex-col px-4 md:px-5 pt-3.5 md:pt-4 pb-2.5 md:pb-3 select-none"
        style={{
          background: committing ? `${commitColorRef.current}22` : "var(--surface-card)",
          borderRadius: "var(--radius-lg)",
          borderLeft: `3px solid ${PINK}`,
          borderTop: "1px solid var(--border-subtle)",
          borderRight: "1px solid var(--border-subtle)",
          borderBottom: "1px solid var(--border-subtle)",
          boxShadow: committing ? "none" : `0 0 10px ${PINK}33`,
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
        <p className="text-base md:text-lg leading-snug min-w-0 whitespace-normal break-words pr-5" style={{ color: "var(--text-primary)" }}>
          {item.text}
        </p>
        <p
          className="text-right pointer-events-none select-none"
          style={{
            fontSize: "9px",
            color: "var(--text-muted)",
            fontFamily: "'Space Mono', monospace",
            letterSpacing: "0.04em",
            marginTop: "6px",
          }}
        >
          hold → someday
        </p>
        <button
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-40 hover:opacity-80 transition-opacity active:scale-90"
          style={{ background: `${ALERT}1a`, border: `1px solid ${ALERT}40` }}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); setCommitted(true); onDismissed(item); }}
        >
          <X size={8} style={{ color: ALERT }} />
        </button>
      </div>
    </div>
  );
}

// ── Pass 2 card — 4-direction swipe + dismiss X ───────────────────────────────
// ↑Gratitude ↓Jarvis Knowledge →Key Insight ←Memory — all routed via /remi with prefix.

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
  const commitColorRef = useRef(BLUE);

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
        className="relative flex items-start gap-3 px-4 py-3.5 md:px-5 md:py-4 select-none"
        style={{
          background: committing ? `${commitColorRef.current}22` : "var(--surface-card)",
          borderRadius: "var(--radius-lg)",
          borderLeft: `3px solid ${PINK}`,
          borderTop: "1px solid var(--border-subtle)",
          borderRight: "1px solid var(--border-subtle)",
          borderBottom: "1px solid var(--border-subtle)",
          boxShadow: committing ? "none" : `0 0 10px ${PINK}33`,
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
        <p className="text-base md:text-lg leading-snug flex-1 min-w-0 whitespace-normal break-words pr-5" style={{ color: "var(--text-primary)" }}>
          {item.text}
        </p>
        <button
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center opacity-40 hover:opacity-80 transition-opacity active:scale-90"
          style={{ background: `${ALERT}1a`, border: `1px solid ${ALERT}40` }}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); setCommitted(true); onDismissed(item); }}
        >
          <X size={8} style={{ color: ALERT }} />
        </button>
      </div>
    </div>
  );
}

// ── Skeleton card — pulsing placeholder shown while decompose is in-flight ────

function SkeletonCard() {
  return (
    <div
      className="animate-pulse px-4 py-3.5"
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        borderLeft: `3px solid ${PINK}33`,
        borderTop: "1px solid var(--border-subtle)",
        borderRight: "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="rounded"
        style={{ height: "20px", background: "var(--border-default)", width: "72%" }}
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
          <span style={{ color: GRAY }}>← Memory</span>
          <span style={{ color: AMBER }}>↑ Today</span>
          <span style={{ color: PURPLE }}>↓ Queue</span>
          <span style={{ color: TEAL }}>→ Tomorrow</span>
        </>
      ) : (
        <>
          <span style={{ color: GREEN }}>↑ Gratitude</span>
          <span style={{ color: BLUE }}>← Memory</span>
          <span style={{ color: AMBER }}>→ Insight</span>
          <span style={{ color: PURPLE }}>↓ Jarvis</span>
        </>
      )}
    </div>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────

function Header({ label, accent, count, onMenu }: { label: string; accent: string; count?: number; onMenu: () => void }) {
  return (
    <PageHeader
      title={label}
      color={accent}
      onMenu={onMenu}
      right={count !== undefined && count > 0 ? (
        <span className="text-xs mr-1" style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
          {count} left
        </span>
      ) : undefined}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ZERO_COUNTS: Counts = { today: 0, tomorrow: 0, queue: 0, someday: 0, insight: 0, memory: 0, gratitude: 0, jarvis: 0 };

export default function Triage() {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pass1Queue, setPass1Queue] = useState<TriageItem[]>([]);
  const [pass2Queue, setPass2Queue] = useState<TriageItem[]>([]);
  const [phase, setPhase]           = useState<Phase>("capture");
  const [counts, setCounts]         = useState<Counts>(ZERO_COUNTS);
  const [decomposing, setDecomposing] = useState(false);
  const [backlogMsg, setBacklogMsg] = useState<string | null>(null); // sweep banner
  const hasStarted = useRef(false); // true once any item enters pass1Queue

  // Clear the "Found N overdue" banner once the last backlog card leaves the queue.
  useEffect(() => {
    if (backlogMsg?.startsWith("Found") && !pass1Queue.some((i) => i.backlog)) {
      setBacklogMsg(null);
    }
  }, [pass1Queue, backlogMsg]);

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
    // "what am I behind on" surfaces the backlog instead of capturing a new item.
    if (isBacklogPhrase(text)) { loadBacklog(); return; }
    hasStarted.current = true;
    setDecomposing(true);
    decomposeText(text)
      .then((items) => {
        setPass1Queue((prev) => [...prev, ...items.map((t) => ({ id: uid(), text: t }))]);
      })
      .finally(() => setDecomposing(false));
  }

  // Pull overdue + unscheduled tasks and APPEND them after the current queue as
  // swipeable backlog cards. Excludes backlog items already shown so a repeat
  // "what am I behind on" doesn't duplicate.
  function loadBacklog(): void {
    const excludeIds = pass1Queue.filter((i) => i.backlog).map((i) => i.id);
    fetchBacklog(excludeIds)
      .then((tasks) => {
        if (tasks.length === 0) {
          setBacklogMsg("You're caught up — nothing overdue");
          setTimeout(() => setBacklogMsg(null), 2000);
          return;
        }
        hasStarted.current = true;
        setBacklogMsg(`Found ${tasks.length} overdue task${tasks.length !== 1 ? "s" : ""} — swipe to schedule or dismiss.`);
        setPass1Queue((prev) => [
          ...prev,
          ...tasks.map((t) => ({ id: t.id, text: t.text, backlog: true })),
        ]);
      })
      .catch(() => {
        setBacklogMsg("Couldn't load backlog — try again.");
        setTimeout(() => setBacklogMsg(null), 2500);
      });
  }

  function handlePass1Swipe(item: TriageItem, action: Pass1Action) {
    // Backlog items are EXISTING tasks: reschedule via /tasks/move (never create
    // a duplicate). today/tomorrow/someday move the Notion page; queue/memory
    // leave it as-is and just drop it from the sweep view. Dismiss (X) likewise
    // removes without deleting.
    if (item.backlog) {
      if (action === "today")         { moveTask(item.id, "today");    setCounts((c) => ({ ...c, today:    c.today    + 1 })); }
      else if (action === "tomorrow") { moveTask(item.id, "tomorrow"); setCounts((c) => ({ ...c, tomorrow: c.tomorrow + 1 })); }
      else if (action === "someday")  { moveTask(item.id, "someday");  setCounts((c) => ({ ...c, someday:  c.someday  + 1 })); }
      // queue / memory → no Notion change; the task stays as it was, just leaves the sweep.
      setPass1Queue((prev) => prev.filter((i) => i.id !== item.id));
      return;
    }
    if (action === "today") {
      createTask(item.text, "today");
      setCounts((c) => ({ ...c, today: c.today + 1 }));
    } else if (action === "tomorrow") {
      createTask(item.text, "tomorrow");
      setCounts((c) => ({ ...c, tomorrow: c.tomorrow + 1 }));
    } else if (action === "queue") {
      createTask(item.text, "queue");
      setCounts((c) => ({ ...c, queue: c.queue + 1 }));
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
    else if (action === "jarvis")    setCounts((c) => ({ ...c, jarvis:    c.jarvis    + 1 }));
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
    const total = counts.today + counts.queue + counts.tomorrow + counts.someday
                + counts.insight + counts.memory + counts.gratitude + counts.jarvis;
    return (
      <div className="flex flex-col h-[100dvh]" style={{ background: "var(--surface-base)" }}>
        <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <Header label="Triage" accent={PINK} onMenu={() => setMenuOpen(true)} />
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center space-y-2">
            <p
              className="text-xs font-bold tracking-widest uppercase mb-6"
              style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}
            >
              Done
            </p>
            {counts.today > 0 && (
              <p className="text-lg" style={{ color: AMBER }}>
                {counts.today} today
              </p>
            )}
            {counts.tomorrow > 0 && (
              <p className="text-lg" style={{ color: TEAL }}>
                {counts.tomorrow} tomorrow
              </p>
            )}
            {counts.queue > 0 && (
              <p className="text-lg" style={{ color: PURPLE }}>
                {counts.queue} queued
              </p>
            )}
            {counts.someday > 0 && (
              <p className="text-lg" style={{ color: SOMEDAY_COLOR }}>
                {counts.someday} someday
              </p>
            )}
            {counts.insight > 0 && (
              <p className="text-lg" style={{ color: AMBER }}>
                {counts.insight} key insight{counts.insight !== 1 ? "s" : ""}
              </p>
            )}
            {counts.memory > 0 && (
              <p className="text-lg" style={{ color: BLUE }}>
                {counts.memory} to memory
              </p>
            )}
            {counts.gratitude > 0 && (
              <p className="text-lg" style={{ color: GREEN }}>
                {counts.gratitude} gratitude{counts.gratitude !== 1 ? "s" : ""}
              </p>
            )}
            {counts.jarvis > 0 && (
              <p className="text-lg" style={{ color: PURPLE }}>
                {counts.jarvis} to Jarvis Knowledge
              </p>
            )}
            {total === 0 && (
              <p className="text-lg" style={{ color: "var(--text-muted)" }}>Nothing sorted.</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: "var(--surface-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
              onClick={reset}
            >
              New session
            </button>
            <button
              className="px-6 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{ background: `${PINK}22`, color: PINK, border: `1px solid ${PINK}40` }}
              onClick={() => navigate("/tasks")}
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
      <div className="flex flex-col h-[100dvh]" style={{ background: "var(--surface-base)" }}>
        <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <Header label="What type?" accent={PINK} count={pass2Queue.length} onMenu={() => setMenuOpen(true)} />
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
    <div className="flex flex-col h-[100dvh]" style={{ background: "var(--surface-base)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Header label="Triage" accent={PINK} count={pass1Queue.length > 0 ? pass1Queue.length : undefined} onMenu={() => setMenuOpen(true)} />
      {/* Scrollable card area — input row is NOT here. Deep-purple ambient field:
          the glow is strongest at the bottom (the capture zone) and fades upward. */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 mx-2 flex flex-col gap-4"
        style={{
          borderRadius: "var(--radius-lg)",
          background:
            "radial-gradient(ellipse at 50% 100%, rgba(155,141,232,0.12) 0%, rgba(155,141,232,0.06) 40%, transparent 70%)",
          border: "1px solid rgba(155,141,232,0.2)",
          boxShadow:
            "inset 0 0 60px rgba(155,141,232,0.08), 0 0 30px rgba(155,141,232,0.1)",
        }}
      >
        {backlogMsg && (
          <div
            className="px-4 py-3 rounded-lg text-sm text-center"
            style={{ background: `${PINK}14`, border: `1px solid ${PINK}33`, color: "var(--text-secondary)", fontFamily: "'Space Mono', monospace" }}
          >
            {backlogMsg}
          </div>
        )}
        {pass1Queue.length === 0 && decomposing ? (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : pass1Queue.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 -mt-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: `${PINK}15`, border: `1.5px solid ${PINK}33`, boxShadow: `0 0 20px ${PINK}26` }}
            >
              <Mic size={26} style={{ color: PINK }} />
            </div>
            <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
              ready when you are
            </p>
            <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
              speak or type to capture
            </p>
          </div>
        ) : (
          <>
            <HintStrip pass={1} />
            <div className="flex flex-col gap-3" style={{ touchAction: "none" }}>
              {pass1Queue.map((item, idx) => {
                // One divider at the capture→backlog boundary (backlog items are
                // always appended, so they're contiguous at the end).
                const prev = pass1Queue[idx - 1];
                const showDivider = !!item.backlog && !!prev && !prev.backlog;
                return (
                  <Fragment key={item.id}>
                    {showDivider && (
                      <div
                        className="flex items-center gap-2 py-1 px-1 select-none"
                        style={{ fontFamily: "'Space Mono', monospace", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}
                      >
                        <span className="flex-1" style={{ height: 1, background: "var(--border-default)" }} />
                        <span>Overdue &amp; Unscheduled</span>
                        <span className="flex-1" style={{ height: 1, background: "var(--border-default)" }} />
                      </div>
                    )}
                    <Pass1Card
                      item={item}
                      onSwiped={handlePass1Swipe}
                      onDismissed={handlePass1Dismiss}
                    />
                  </Fragment>
                );
              })}
            </div>
          </>
        )}
      </div>
      {/* Input row pinned to bottom — matches Session.tsx pattern. mx-2 aligns it
          with the ambient container above and lets the input's neon glow breathe. */}
      <div className="shrink-0 px-4 pt-2 mx-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        <TriageInputRow onAdd={addItem} />
      </div>
    </div>
  );
}
