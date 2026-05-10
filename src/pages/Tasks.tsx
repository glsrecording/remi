import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, Loader2, ChevronDown, ChevronRight,
  Plus, Mic, MicOff, Check, X,
} from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const ACCENT = "#f59e0b";
const COMMIT_THRESHOLD = 65;
const LONG_PRESS_MS = 500;

interface Task {
  id: string;
  title: string;
  url: string;
}

interface TaskBuckets {
  today: Task[];
  tonight: Task[];
  tomorrow: Task[];
  someday: Task[];
}

type Bucket = keyof TaskBuckets;
type SwipeAction = Bucket | "done";

const BUCKET_META: Record<Bucket, { label: string; emoji: string; color: string }> = {
  today:    { label: "Today",    emoji: "⚡", color: "#f59e0b" },
  tonight:  { label: "Tonight",  emoji: "🌙", color: "#c084fc" },
  tomorrow: { label: "Tomorrow", emoji: "🌅", color: "#60a5fa" },
  someday:  { label: "Someday",  emoji: "💭", color: "#94a3b8" },
};

// Index matches swipe direction: 0=up→Today, 1=right→Tonight, 2=down→Tomorrow, 3=left→Done
const SWIPE_TARGETS: Array<{ action: SwipeAction; label: string; color: string; arrow: string }> = [
  { action: "today",    label: "Today",    color: "#f59e0b", arrow: "↑" },
  { action: "tonight",  label: "Tonight",  color: "#c084fc", arrow: "→" },
  { action: "tomorrow", label: "Tomorrow", color: "#60a5fa", arrow: "↓" },
  { action: "done",     label: "Done ✓",   color: "#22c55e", arrow: "←" },
];

async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", "whisper-1");
  formData.append("language", "en");
  const response = await fetch(`${JARVIS_URL}/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`Whisper error ${response.status}`);
  const data = await response.json();
  return (data.text ?? "").trim();
}

async function applyTaskAction(pageId: string, action: SwipeAction): Promise<void> {
  await fetch(`${JARVIS_URL}/tasks/move`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REMI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_id: pageId, bucket: action }),
  }).then((r) => {
    if (!r.ok) console.error("[Remi] /tasks/move failed:", r.status, r.statusText);
  }).catch((err) => {
    console.error("[Remi] /tasks/move network error:", err);
  });
}

async function fetchTasks(): Promise<TaskBuckets> {
  const res = await fetch(`${JARVIS_URL}/tasks`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.tasks as TaskBuckets;
}

function createTaskDirect(title: string, bucket: Bucket): void {
  fetch(`${JARVIS_URL}/tasks/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REMI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, bucket }),
  }).then((r) => {
    if (!r.ok) console.error("[Remi] /tasks/create failed:", r.status);
  }).catch((err) => {
    console.error("[Remi] /tasks/create network error:", err);
  });
}

function getDominantSwipe(x: number, y: number) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax > ay) return x > 0 ? SWIPE_TARGETS[1] : SWIPE_TARGETS[3];
  return y < 0 ? SWIPE_TARGETS[0] : SWIPE_TARGETS[2];
}

interface UndoState {
  task: Task;
  fromBucket: Bucket;
  action: SwipeAction;
}

function undoLabel(action: SwipeAction): string {
  if (action === "done") return "Marked done";
  return `Moved to ${BUCKET_META[action].label}`;
}

function actionColor(action: SwipeAction): string {
  if (action === "done") return "#22c55e";
  return BUCKET_META[action].color;
}

function UndoToast({
  state,
  onUndo,
  onDismiss,
}: {
  state: UndoState;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const color = actionColor(state.action);

  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed left-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        background: "#1e1e1e",
        border: `1px solid ${color}30`,
        animation: "slide-up 0.2s ease",
      }}
    >
      <span className="text-sm text-white/70 flex-1 leading-snug">
        <span className="font-semibold" style={{ color }}>
          {undoLabel(state.action)}
        </span>
      </span>
      <button
        className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95"
        style={{ background: color + "22", color }}
        onClick={onUndo}
      >
        Undo
      </button>
    </div>
  );
}

// ── Inline add-task card ────────────────────────────────────────────────────

interface AddTaskCardProps {
  bucket: Bucket;
  color: string;
  onCancel: () => void;
  onSubmitted: (title: string) => void;
}

function AddTaskCard({ bucket, color, onCancel, onSubmitted }: AddTaskCardProps) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef  = useRef<BlobPart[]>([]);
  const streamRef       = useRef<MediaStream | null>(null);
  const holdToSendRef   = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [text]);

  function handleSubmit() {
    const title = text.trim();
    if (!title) return;
    onSubmitted(title);           // dismiss immediately + optimistic add
    createTaskDirect(title, bucket); // fire-and-forget background write
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
    if (e.key === "Escape") onCancel();
  }

  async function handleMicDown() {
    if (isRecording || isTranscribing) return;
    holdToSendRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const autoSubmit = holdToSendRef.current;
        holdToSendRef.current = false;
        await new Promise<void>((resolve) => setTimeout(resolve, 800));
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (blob.size > 0) {
          setIsTranscribing(true);
          try {
            const transcript = await transcribeAudio(blob);
            if (transcript) {
              if (autoSubmit) {
                // Hold-to-send: submit immediately without requiring Check button
                onSubmitted(transcript.trim());
                createTaskDirect(transcript.trim(), bucket);
              } else {
                setText(transcript);
                inputRef.current?.focus();
              }
            }
          } catch {
            // silent fail — user can type instead
          } finally {
            setIsTranscribing(false);
          }
        }
      };
      recorder.start(100);
      setIsRecording(true);
    } catch {
      // mic permission denied
    }
  }

  function handleMicUp() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }

  function handleHoldDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    holdToSendRef.current = true;
    handleMicDown();
  }

  const canSubmit = text.trim().length > 0;

  return (
    <div
      className="flex items-end gap-1.5 px-3 py-2 rounded-xl"
      style={{
        background: "#333333",
        borderLeft: `3px solid ${color}70`,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="New task…"
        rows={1}
        className="flex-1 bg-transparent text-lg text-white/85 outline-none min-w-0 placeholder:text-white/25 resize-none overflow-hidden"
        style={{ lineHeight: "1.4" }}
      />

      {/* Mic */}
      <button
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{
          background: isRecording ? "#ef444420" : "transparent",
          border: `1px solid ${isRecording ? "#ef4444" : isTranscribing ? color + "50" : "rgba(255,255,255,0.1)"}`,
        }}
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handleMicDown(); }}
        onPointerUp={handleMicUp}
        onPointerLeave={handleMicUp}
      >
        {isTranscribing
          ? <Loader2 size={11} className="animate-spin" style={{ color }} />
          : isRecording
          ? <MicOff size={11} style={{ color: "#ef4444" }} />
          : <Mic size={11} style={{ color: "rgba(255,255,255,0.35)" }} />}
      </button>

      {/* Confirm */}
      <button
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{
          background: canSubmit ? color + "22" : "transparent",
          border: `1px solid ${canSubmit ? color + "60" : "rgba(255,255,255,0.08)"}`,
        }}
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        <Check size={11} style={{ color: canSubmit ? color : "rgba(255,255,255,0.2)" }} />
      </button>

      {/* Cancel */}
      <button
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={onCancel}
      >
        <X size={11} style={{ color: "rgba(255,255,255,0.3)" }} />
      </button>

      {/* Hold-to-send mic — right thumb position, auto-submits on release */}
      <button
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 ${isRecording ? "voice-button-recording" : ""}`}
        style={{
          background: isRecording ? "#ef444420" : "#f59e0b14",
          border: `1px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
          marginRight: "16px",
        }}
        onPointerDown={handleHoldDown}
        onPointerUp={handleMicUp}
        onPointerLeave={handleMicUp}
      >
        {isTranscribing
          ? <Loader2 size={11} className="animate-spin" style={{ color: "#f59e0b" }} />
          : isRecording
          ? <MicOff size={11} style={{ color: "#ef4444" }} />
          : <Mic size={11} style={{ color: "#f59e0b" }} />}
      </button>
    </div>
  );
}

// ── Swipeable task card ─────────────────────────────────────────────────────

interface SwipeableCardProps {
  task: Task;
  sourceBucket: Bucket;
  onMoved: (task: Task, action: SwipeAction) => void;
}

function SwipeableCard({ task, sourceBucket, onMoved }: SwipeableCardProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [longPressing, setLongPressing] = useState(false);

  const startPos       = useRef<{ x: number; y: number } | null>(null);
  const dragging       = useRef(false);
  const offsetRef      = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitColorRef = useRef<string>("#22c55e");
  // "undecided" until first 8px of movement reveals intent; "scroll" aborts swipe handler
  const directionRef   = useRef<"undecided" | "swipe" | "scroll">("undecided");

  const magnitude   = Math.sqrt(offset.x ** 2 + offset.y ** 2);
  const progress    = Math.min(1, magnitude / COMMIT_THRESHOLD);
  const dominant    = magnitude > 8 ? getDominantSwipe(offset.x, offset.y) : null;
  const validTarget = dominant && dominant.action !== sourceBucket;
  const swipeColor  = validTarget ? dominant!.color : "rgba(255,255,255,0.25)";

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setLongPressing(false);
  }

  function resetDrag() {
    dragging.current = false;
    directionRef.current = "undecided";
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    startPos.current = null;
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    directionRef.current = "undecided";
    offsetRef.current = { x: 0, y: 0 };
    // Defer setPointerCapture until direction is confirmed as a horizontal swipe
    e.stopPropagation();

    // Start long press timer
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      // Only fire if drag is still active and no significant movement
      if (!dragging.current) return;
      if (Math.sqrt(offsetRef.current.x ** 2 + offsetRef.current.y ** 2) < 8) {
        dragging.current = false;
        directionRef.current = "undecided";
        commitColorRef.current = BUCKET_META["someday"].color;
        setCommitting(true);
        setTimeout(() => {
          setCommitted(true);
          onMoved(task, "someday");
        }, 200);
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x;
    const ny = e.clientY - startPos.current.y;
    const mag = Math.sqrt(nx ** 2 + ny ** 2);

    // Cancel long press on any significant movement (same threshold as direction lock)
    if (mag >= 8) cancelLongPress();

    // Lock direction on first meaningful movement
    // One axis must be at least 1.5× the other to commit to a swipe
    if (directionRef.current === "undecided" && mag >= 8) {
      const ax = Math.abs(nx), ay = Math.abs(ny);
      if (ax >= 1.5 * ay || ay >= 1.5 * ax) {
        // One axis clearly dominant → commit to swipe, capture pointer
        directionRef.current = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        // Too diagonal → treat as scroll
        directionRef.current = "scroll";
        resetDrag();
        return;
      }
    }

    if (directionRef.current !== "swipe") return;

    offsetRef.current = { x: nx, y: ny };
    setOffset({ x: nx, y: ny });
  }

  function handlePointerUp() {
    if (!dragging.current) return;
    cancelLongPress();

    const { x, y } = offsetRef.current;
    const mag = Math.sqrt(x ** 2 + y ** 2);

    if (directionRef.current === "swipe" && mag >= COMMIT_THRESHOLD) {
      const swipe = getDominantSwipe(x, y);
      if (swipe.action !== sourceBucket) {
        commitColorRef.current = swipe.color;
        dragging.current = false;
        directionRef.current = "undecided";
        setCommitting(true);
        setTimeout(() => {
          setCommitted(true);
          onMoved(task, swipe.action);
        }, 200);
        return;
      }
    }

    resetDrag();
  }

  if (committed) return null;

  const commitColor = commitColorRef.current;

  return (
    <div className="relative rounded-xl" style={{ overflow: "hidden" }}>
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
              color: swipeColor,
              opacity: progress * (validTarget ? 1 : 0.5),
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
          background: committing ? `${commitColor}22` : "#333333",
          borderLeft: `3px solid ${BUCKET_META[sourceBucket].color}70`,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: dragging.current ? "none" : "transform 0.35s cubic-bezier(0.34,1.3,0.64,1), background 0.2s",
          willChange: "transform",
          cursor: magnitude > 4 ? "grabbing" : "default",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <p className="text-lg text-white/85 leading-snug flex-1 min-w-0 whitespace-normal break-words">{task.title}</p>
      </div>
    </div>
  );
}

// ── Bucket section ──────────────────────────────────────────────────────────

function BucketSection({
  bucket,
  tasks,
  defaultOpen,
  onMoved,
  onTaskAdded,
}: {
  bucket: Bucket;
  tasks: Task[];
  defaultOpen: boolean;
  onMoved: (task: Task, fromBucket: Bucket, action: SwipeAction) => void;
  onTaskAdded: (title: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [adding, setAdding] = useState(false);
  const meta = BUCKET_META[bucket];

  function handleAddClick(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
    setAdding(true);
  }

  return (
    <div className="space-y-2">
      {/* Header row — div so we can nest buttons */}
      <div className="w-full flex items-center gap-2 py-1">
        {/* Collapse trigger covers emoji + label */}
        <div
          className="flex items-center gap-2 flex-1 cursor-pointer"
          onClick={() => setOpen((o) => !o)}
          role="button"
          aria-expanded={open}
        >
          <span className="text-base">{meta.emoji}</span>
          <span
            className="text-sm font-bold tracking-tight"
            style={{ color: meta.color, fontFamily: "'Space Mono', monospace" }}
          >
            {meta.label}
          </span>
        </div>

        {/* Count badge */}
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{ background: meta.color + "20", color: meta.color }}
        >
          {tasks.length}
        </span>

        {/* Add button */}
        <button
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all active:scale-90"
          style={{ background: meta.color + "18", color: meta.color }}
          onClick={handleAddClick}
          aria-label={`Add task to ${meta.label}`}
        >
          <Plus size={12} />
        </button>

        {/* Chevron */}
        <div
          className="cursor-pointer p-0.5"
          onClick={() => setOpen((o) => !o)}
          role="button"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open
            ? <ChevronDown  size={14} style={{ color: meta.color, opacity: 0.6 }} />
            : <ChevronRight size={14} style={{ color: meta.color, opacity: 0.6 }} />}
        </div>
      </div>

      {open && (
        <div className="space-y-1.5 mx-4">
          {adding && (
            <AddTaskCard
              bucket={bucket}
              color={meta.color}
              onCancel={() => setAdding(false)}
              onSubmitted={(title) => { setAdding(false); onTaskAdded(title); }}
            />
          )}
          {tasks.length === 0 && !adding && (
            <p className="text-xs text-white/25 pl-2">Nothing here.</p>
          )}
          {tasks.map((task) => (
            <SwipeableCard
              key={task.id}
              task={task}
              sourceBucket={bucket}
              onMoved={(t, action) => onMoved(t, bucket, action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Tasks() {
  const [, navigate] = useLocation();
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [buckets, setBuckets]   = useState<TaskBuckets>({
    today: [], tonight: [], tomorrow: [], someday: [],
  });
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  // True after first successful fetch — suppresses the full-page spinner on subsequent load() calls
  const initialLoaded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBuckets(await fetchTasks());
      initialLoaded.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  // Background refresh — no spinner, no error state change
  const silentLoad = useCallback(async () => {
    try {
      setBuckets(await fetchTasks());
    } catch {
      // silent — leave existing state intact
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Optimistically add task, then silently refresh after 2s to get the real page_id
  const handleTaskAdded = useCallback((title: string, bucket: Bucket) => {
    const tempTask: Task = { id: `temp-${Date.now()}`, title, url: "" };
    setBuckets((prev) => ({
      ...prev,
      [bucket]: [tempTask, ...prev[bucket]],
    }));
    setTimeout(silentLoad, 2000);
  }, [silentLoad]);

  const handleMoved = useCallback((task: Task, fromBucket: Bucket, action: SwipeAction) => {
    applyTaskAction(task.id, action);

    setBuckets((prev) => ({
      ...prev,
      [fromBucket]: prev[fromBucket].filter((t) => t.id !== task.id),
    }));

    setUndoState({ task, fromBucket, action });
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoState) return;
    const { task, fromBucket, action } = undoState;
    applyTaskAction(task.id, fromBucket);
    setBuckets((prev) => ({
      ...prev,
      [fromBucket]: [...prev[fromBucket], task],
    }));
    setUndoState((s) => (s?.task.id === task.id && s.action === action ? null : s));
  }, [undoState]);

  const totalCount = Object.values(buckets).reduce((n, a) => n + a.length, 0);

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#000000" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background: "#1a1a1a",
          paddingTop:    "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <button
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="text-base font-bold tracking-tight flex-1"
          style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}
        >
          Tasks
        </span>
        {!loading && (
          <span className="text-xs text-white/25 mr-2">{totalCount} total</span>
        )}
        <button
          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Swipe legend */}
      <div className="px-4 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-center gap-5">
          {SWIPE_TARGETS.map((s) => (
            <span
              key={s.action}
              className="text-xs"
              style={{ color: s.color, opacity: 0.75, fontFamily: "'Space Mono', monospace" }}
            >
              {s.arrow} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div
        className="flex-1 overflow-y-auto px-4 py-5 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {loading && !initialLoaded.current && (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
            <span className="text-sm text-white/40">Loading tasks…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-red-400/80">Could not load tasks ({error})</p>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: ACCENT + "20", color: ACCENT }}
              onClick={load}
            >
              Retry
            </button>
          </div>
        )}

        {(!loading || initialLoaded.current) && !error && (
          <div className="space-y-6">
            {(["today", "tonight", "tomorrow", "someday"] as Bucket[]).map((b) => (
              <BucketSection
                key={b}
                bucket={b}
                tasks={buckets[b]}
                defaultOpen={b === "today" || b === "tonight"}
                onMoved={handleMoved}
                onTaskAdded={(title) => handleTaskAdded(title, b)}
              />
            ))}
          </div>
        )}
      </div>

      {undoState && (
        <UndoToast
          state={undoState}
          onUndo={handleUndo}
          onDismiss={() => setUndoState(null)}
        />
      )}
    </div>
  );
}
