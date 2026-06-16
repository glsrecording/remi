import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGutterScroll } from "@/hooks/useGutterScroll";
import {
  RefreshCw, Loader2, ChevronDown, ChevronRight,
  Plus, Mic, MicOff, Check, X, GripVertical, Star,
  Square, CheckSquare, Calendar, Circle,
  Music, MessageSquare, Briefcase, PenLine, Film, Hash, Layers, Heart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const ACCENT = "#f5a623";   // --color-tasks (amber/gold)
const COMMIT_THRESHOLD = 65;
const LONG_PRESS_MS = 500;

// Phone vs tablet — matches the Tailwind `md:` breakpoint (768px). Used only to
// size lucide icons (a JS `size` prop CSS can't reach) so phone cards stay
// compact while tablet (>=768px) is untouched.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

interface Task {
  id: string;
  title: string;
  url: string;
  sort_order?: number | null;
  category?: string;
}

// Category filter chips (cards view only). "All" is the default/no-filter state.
// Values must match the Master Tasks "Category" select options exactly.
const CATEGORY_FILTERS = [
  "All", "Communication", "Filming", "Admin", "Writing", "Family", "Studio", "General",
] as const;
type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

// Assignable work-mode categories (no "All"). Must match the backend
// _ALLOWED_TASK_CATEGORIES set exactly.
const CATEGORY_OPTIONS = [
  "Communication", "Filming", "Admin", "Writing", "Family", "Studio", "General",
] as const;

// Per-category colors — color-by-context identity from the redesign. Hex values
// mirror the design-system.css context tokens (--color-studio etc.); kept as hex
// so the existing `color + "33"` alpha-concat pattern works. Drives the card's
// left accent bar, icon square, and category chip + the bottom-sheet picker.
const CATEGORY_COLORS: Record<string, string> = {
  Studio:        "#3dd6b0",  // --color-studio   (teal)
  Communication: "#9b8de8",  // --color-tonight  (purple)
  Admin:         "#378add",  // --color-calls    (blue)
  Writing:       "#d4537e",  // --color-personal (pink)
  Family:        "#9b8de8",  // --color-tonight  (purple)
  Filming:       "#e8831a",  // orange (no token)
  General:       "#888890",  // --text-secondary (gray, readable)
};
// Per-category fill behind the icon square. Uses the design-system tokens so
// General (a surface token) flips in light mode; the context -bg tints stay dark
// in both modes by design (accent context colors don't change between themes).
const CATEGORY_BG: Record<string, string> = {
  Studio:        "var(--color-studio-bg)",
  Communication: "var(--color-tonight-bg)",
  Admin:         "var(--color-calls-bg)",
  Writing:       "var(--color-personal-bg)",
  Family:        "var(--color-tonight-bg)",
  Filming:       "var(--color-filming-bg)",  // dark orange / light pastel via token
  General:       "var(--surface-elevated)",
};
// Per-category icon for the 32px square.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Studio:        Music,
  Communication: MessageSquare,
  Admin:         Briefcase,
  Writing:       PenLine,
  Family:        Heart,
  Filming:       Film,
  General:       Hash,
};
const CATEGORY_EMPTY = "#888890";  // --text-secondary — visible "add a category" affordance

interface TaskBuckets {
  today: Task[];
  tonight: Task[];
  tomorrow: Task[];
  someday: Task[];
}

type Bucket = keyof TaskBuckets;
type SwipeAction = Bucket | "done";

const DRAGGABLE_BUCKETS = new Set<Bucket>(["today", "tonight", "tomorrow"]);

// Bucket colors map to the design-system context palette (mirrors design-system.css):
// Today = --color-tasks, Tonight = --color-tonight, Tomorrow = --color-studio, Someday = gray.
const BUCKET_META: Record<Bucket, { label: string; emoji: string; color: string }> = {
  today:    { label: "Today",    emoji: "⚡", color: "#f5a623" },  // --color-tasks
  tonight:  { label: "Tonight",  emoji: "🌙", color: "#9b8de8" },  // --color-tonight
  tomorrow: { label: "Tomorrow", emoji: "🌅", color: "#3dd6b0" },  // --color-studio
  someday:  { label: "Someday",  emoji: "💭", color: "#888890" },  // --text-secondary
};

// ── Per-bucket focus state (localStorage) ───────────────────────────────────

type FocusBucket = "today" | "tonight" | "tomorrow";

const FOCUS_BUCKETS = new Set<Bucket>(["today", "tonight", "tomorrow"]);

const FOCUS_KEYS: Record<FocusBucket, string> = {
  today:    "remi_focus_today",
  tonight:  "remi_focus_tonight",
  tomorrow: "remi_focus_tomorrow",
};

function loadFocus(): Record<FocusBucket, string | null> {
  const r = { today: null, tonight: null, tomorrow: null } as Record<FocusBucket, string | null>;
  for (const b of Object.keys(FOCUS_KEYS) as FocusBucket[]) {
    try { r[b] = localStorage.getItem(FOCUS_KEYS[b]); } catch { /* ignore */ }
  }
  return r;
}

function saveFocusBucket(bucket: FocusBucket, id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(FOCUS_KEYS[bucket]);
    else localStorage.setItem(FOCUS_KEYS[bucket], id);
  } catch { /* ignore */ }
}

// Index matches swipe direction: 0=up→Today, 1=right→Tonight, 2=down→Tomorrow, 3=left→Done
const SWIPE_TARGETS: Array<{ action: SwipeAction; label: string; color: string; arrow: string }> = [
  { action: "today",    label: "Today",    color: "#f5a623", arrow: "↑" },  // --color-tasks
  { action: "tonight",  label: "Tonight",  color: "#9b8de8", arrow: "→" },  // --color-tonight
  { action: "tomorrow", label: "Tomorrow", color: "#3dd6b0", arrow: "↓" },  // --color-studio
  { action: "done",     label: "Done ✓",   color: "#5bc468", arrow: "←" },  // --color-done
];

async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  const blobType = audioBlob.type || "";
  const ext = blobType.includes("mp4") || blobType.includes("m4a") ? "mp4"
    : blobType.includes("ogg") ? "ogg" : "webm";
  formData.append("file", audioBlob, `recording.${ext}`);
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

async function patchTaskReorder(pageId: string, sortOrder: number): Promise<void> {
  await fetch(`${JARVIS_URL}/task/${encodeURIComponent(pageId)}/reorder`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sort_order: sortOrder }),
  }).catch(() => {});
}

async function patchTaskTitle(pageId: string, title: string): Promise<void> {
  const res = await fetch(`${JARVIS_URL}/task/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

async function patchTaskCategory(pageId: string, category: string): Promise<void> {
  const res = await fetch(`${JARVIS_URL}/task/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

async function fetchTasks(priorityOnly = false): Promise<TaskBuckets> {
  const url = priorityOnly ? `${JARVIS_URL}/tasks?priority=urgent` : `${JARVIS_URL}/tasks`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${REMI_API_KEY}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  // Guard: a body without a valid `tasks` object (e.g. an auth/session error
  // returned as 200 {error: ...}, or a malformed payload) must NEVER reach
  // setBuckets — returning undefined would crash the next render
  // (buckets.today.length) and, with no error boundary, tear down the whole app
  // until the PWA is restarted. Throw instead so load()'s catch shows the in-page
  // error/retry state. Partial payloads get their missing buckets filled with [].
  const t = data?.tasks;
  if (!t || typeof t !== "object") {
    throw new Error(data?.error ? String(data.error) : "Malformed tasks response");
  }
  return {
    today:    Array.isArray(t.today)    ? t.today    : [],
    tonight:  Array.isArray(t.tonight)  ? t.tonight  : [],
    tomorrow: Array.isArray(t.tomorrow) ? t.tomorrow : [],
    someday:  Array.isArray(t.someday)  ? t.someday  : [],
  };
}

// ── Projects (GTD) — studio-teal cards below the task buckets ────────────────
// Studio context color (--color-studio) per the redesign — distinct from amber
// tasks and the green done state. (ProjectDetail.tsx keeps its own color.)
const PROJECT_COLOR = "#3dd6b0";  // --color-studio

interface Project {
  id: string;
  name: string;
  area: string | null;
  status: string | null;
  next_action: string | null;
  focus_date: string | null;
  notes: string | null;
  task_ids: string[];
}

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${JARVIS_URL}/projects`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return (data.projects ?? []) as Project[];
}

// Local calendar date (YYYY-MM-DD) — NOT toISOString (UTC), which can be a day
// off near midnight in PDT. Must match the backend's date.today() comparison.
function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Single full-width green project card. Tap anywhere → ProjectDetail.
function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const focusToday = !!project.focus_date && project.focus_date === localTodayISO();
  return (
    <div
      className="relative flex items-start gap-3 px-4 py-3.5 rounded-xl select-none cursor-pointer transition-all active:scale-[0.99]"
      style={{
        background: "var(--surface-card)",
        borderLeft: `3px solid ${PROJECT_COLOR}`,
        borderTop: `1px solid ${PROJECT_COLOR}2e`,
        borderRight: `1px solid ${PROJECT_COLOR}2e`,
        borderBottom: `1px solid ${PROJECT_COLOR}2e`,
      }}
      onClick={onOpen}
      data-testid={`project-card-${project.id}`}
    >
      {/* Teal icon square */}
      <div
        className="shrink-0 flex items-center justify-center mt-0.5"
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "var(--radius-md)",
          background: "var(--color-studio-bg)",
          border: `1px solid ${PROJECT_COLOR}33`,
        }}
      >
        <Layers size={16} style={{ color: PROJECT_COLOR }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold leading-snug" style={{ color: "var(--text-primary)", fontSize: "var(--font-size-md)" }}>
            {project.name}
          </span>
          {project.area && (
            <span
              className="shrink-0 rounded px-2 py-0.5"
              style={{
                background: "var(--t-el-low)",
                color: "var(--t-text5)",
                fontFamily: "'Space Mono', monospace",
                fontSize: "9px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {project.area}
            </span>
          )}
          {focusToday && (
            <span
              className="shrink-0 rounded px-2 py-0.5"
              style={{
                background: PROJECT_COLOR + "22",
                color: PROJECT_COLOR,
                border: `1px solid ${PROJECT_COLOR}55`,
                fontFamily: "'Space Mono', monospace",
                fontSize: "9px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Focus: Today
            </span>
          )}
        </div>
        {project.next_action && (
          <p
            className="text-sm mt-1 truncate"
            style={{ color: "var(--t-text5)" }}
          >
            {project.next_action}
          </p>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 mt-0.5" style={{ color: PROJECT_COLOR }} />
    </div>
  );
}

// ── Daily cache ─────────────────────────────────────────────────────────────

const CACHE_KEY = "remi_tasks_cache";

interface TaskCache {
  tasks: TaskBuckets;
  date: string;
  fetchedAt: number;
}

function loadCache(): TaskCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TaskCache;
  } catch { return null; }
}

function saveCache(tasks: TaskBuckets): void {
  const today = new Date().toISOString().slice(0, 10);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ tasks, date: today, fetchedAt: Date.now() }));
  } catch { /* storage full — skip */ }
}

function clearCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  if (action === "done") return "#5bc468";
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
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed left-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        background: "var(--t-card)",
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
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const micStartTimeRef = useRef<number>(0);
  const micCancelledRef = useRef(false);
  const touchEndedRef = useRef(false);
  const holdToSendRef = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [text]);

  function handleSubmit() {
    const title = text.trim();
    if (!title) return;
    onSubmitted(title);
    createTaskDirect(title, bucket);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
    if (e.key === "Escape") onCancel();
  }

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
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
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      recorder.onstop = () => {
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
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];
          if (blob.size === 0) { setIsProcessing(false); return; }
          try {
            const transcript = await transcribeAudio(blob);
            if (transcript) {
              if (autoSub) {
                onSubmitted(transcript.trim());
                createTaskDirect(transcript.trim(), bucket);
              } else {
                setText(transcript);
                inputRef.current?.focus();
              }
            }
          } catch { /* silent — user can type instead */ }
          finally { setIsProcessing(false); }
        }, 800);
      };
      recorder.start(100);
      micStartTimeRef.current = Date.now();
      if (touchEndedRef.current) {
        micCancelledRef.current = true;
        recorder.stop();
        mediaRecorderRef.current = null;
        return;
      }
      setIsRecording(true);
    } catch { /* mic permission denied */ }
  }, [isRecording, bucket, onSubmitted]);

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
        background: "var(--surface-card)",
        borderLeft: `3px solid ${color}70`,
        borderTop: "1px solid var(--border-subtle)",
        borderRight: "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
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

      {/* Left mic — transcribe to input field */}
      <button
        type="button"
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{
          background: isRecording ? "#ef444420" : "transparent",
          border: `1px solid ${isRecording ? "#ef4444" : isProcessing ? color + "50" : "rgba(255,255,255,0.1)"}`,
          touchAction: "none",
        }}
        onTouchStart={handleLeftTouchStart}
        onTouchEnd={handleLeftTouchEnd}
        onTouchCancel={handleMicCancel}
      >
        {isProcessing
          ? <Loader2 size={11} className="animate-spin" style={{ color }} />
          : isRecording
          ? <MicOff size={11} style={{ color: "#ef4444" }} />
          : <Mic size={11} style={{ color: "var(--t-text5)" }} />}
      </button>

      {/* Confirm */}
      <button
        type="button"
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
        type="button"
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
        style={{ background: "transparent", border: "1px solid var(--t-border-md)" }}
        onClick={onCancel}
      >
        <X size={11} style={{ color: "var(--t-text6)" }} />
      </button>

      {/* Right amber mic — auto-submits on release */}
      <button
        type="button"
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 ${isRecording ? "voice-button-recording" : ""}`}
        style={{
          background: isRecording ? "#ef444420" : "#f59e0b14",
          border: `1px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
          marginRight: "16px",
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

// ── Swipeable task card ─────────────────────────────────────────────────────

interface SwipeableCardProps {
  task: Task;
  sourceBucket: Bucket;
  onMoved: (task: Task, action: SwipeAction) => void;
  onTitleChanged: (task: Task, newTitle: string) => void;
  onCategoryChanged: (task: Task, category: string) => void;
  focusedTaskId?: string | null;
  onToggleFocus?: () => void;
}

interface CategoryPickerProps {
  current?: string | null;            // currently-assigned category → highlighted chip
  onSelect: (cat: string) => void;
  onClose: () => void;
}

// Shared category bottom-sheet — used by both the Cards view (SwipeableCard) and
// the List view (ListMode). `fixed inset-0` so it escapes any ancestor's
// overflow:hidden; stopPropagation keeps taps off the surface underneath. The
// caller owns open/close state and the optimistic Notion write.
function CategoryPicker({ current, onSelect, onClose }: CategoryPickerProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="w-full rounded-t-2xl p-4"
        style={{
          background: "var(--t-card)",
          borderTop: "1px solid var(--t-border)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="text-xs uppercase tracking-widest mb-3 px-1"
          style={{ color: "var(--t-text6)", fontFamily: "'Space Mono', monospace" }}
        >
          Category
        </p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((cat) => {
            const active = current === cat;
            const optColor = CATEGORY_COLORS[cat] ?? ACCENT;
            return (
              <button
                key={cat}
                type="button"
                className="px-3 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95"
                style={{
                  background: active ? optColor + "33" : optColor + "1a",
                  border: `1px solid ${active ? optColor : optColor + "66"}`,
                  color: optColor,
                }}
                onClick={() => onSelect(cat)}
                data-testid={`category-opt-${cat.toLowerCase()}`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SwipeableCard({ task, sourceBucket, onMoved, onTitleChanged, onCategoryChanged, focusedTaskId, onToggleFocus }: SwipeableCardProps) {
  const isFocused = focusedTaskId === task.id;
  const isMobile = useIsMobile();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [longPressing, setLongPressing] = useState(false);

  // Inline title editing
  const [editingTitle, setEditingTitle]   = useState(false);
  const [draftTitle,   setDraftTitle]     = useState(task.title);
  const [savingTitle,  setSavingTitle]    = useState(false);
  const [titleError,   setTitleError]     = useState(false);
  const commitInFlightRef                 = useRef(false);

  // Category assignment — chip + bottom-sheet picker, optimistic + Notion write-back
  const [pickerOpen,    setPickerOpen]    = useState(false);
  const [localCategory, setLocalCategory] = useState<string | undefined>(task.category);
  // Keep local copy in sync when the parent task prop changes (e.g. refetch)
  useEffect(() => { setLocalCategory(task.category); }, [task.category]);

  async function assignCategory(category: string) {
    setPickerOpen(false);
    const prev = localCategory;
    setLocalCategory(category);                 // optimistic
    onCategoryChanged(task, category);          // update parent buckets + cache
    try {
      await patchTaskCategory(task.id, category);
    } catch {
      setLocalCategory(prev);                   // revert on failure
      onCategoryChanged(task, prev ?? "");
    }
  }

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

  function enterEditMode(e: React.MouseEvent) {
    if (task.id.startsWith("temp-")) return;
    e.stopPropagation();
    setDraftTitle(task.title);
    setTitleError(false);
    setEditingTitle(true);
  }

  async function confirmEdit() {
    if (commitInFlightRef.current) return;
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === task.title) {
      setEditingTitle(false);
      setTitleError(false);
      return;
    }
    commitInFlightRef.current = true;
    setSavingTitle(true);
    try {
      await patchTaskTitle(task.id, trimmed);
      onTitleChanged(task, trimmed);
      setEditingTitle(false);
      setTitleError(false);
    } catch {
      setTitleError(true);
      setEditingTitle(false);
      setTimeout(() => setTitleError(false), 3000);
    } finally {
      setSavingTitle(false);
      commitInFlightRef.current = false;
    }
  }

  function cancelEdit() {
    setEditingTitle(false);
    setDraftTitle(task.title);
    setTitleError(false);
  }

  if (committed) return null;

  const commitColor = commitColorRef.current;

  // Color-by-context: the card's left accent bar, icon square, and chip all key
  // off the task's category. Uncategorized → muted gray (--text-muted).
  const catColor = localCategory ? (CATEGORY_COLORS[localCategory] ?? ACCENT) : "#444450";
  const catBg    = localCategory ? (CATEGORY_BG[localCategory] ?? "var(--surface-elevated)") : "var(--surface-elevated)";
  const CatIcon  = (localCategory && CATEGORY_ICONS[localCategory]) || Circle;

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
        className="relative flex items-start gap-2 md:gap-3 px-3 py-3 md:px-5 md:py-4 rounded-xl select-none"
        style={{
          background: committing ? `${commitColor}22` : "var(--surface-card)",
          borderLeft: `${isFocused ? "4px" : "3px"} solid ${catColor}`,
          borderTop: `1px solid ${isFocused ? "rgba(245,166,35,0.25)" : "var(--border-subtle)"}`,
          borderRight: `1px solid ${isFocused ? "rgba(245,166,35,0.25)" : "var(--border-subtle)"}`,
          borderBottom: `1px solid ${isFocused ? "rgba(245,166,35,0.25)" : "var(--border-subtle)"}`,
          // Starred (focused) tasks keep the brighter amber inset glow; everything
          // else gets a subtle category-tinted lift (~8%) for depth without weight.
          boxShadow: isFocused ? "inset 4px 0 16px rgba(245,166,35,0.5)" : `0 2px 12px ${catColor}14`,
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
        {editingTitle ? (
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); confirmEdit(); }
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={confirmEdit}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 min-w-0 bg-transparent text-lg md:text-xl leading-snug outline-none"
            style={{
              color: savingTitle ? "var(--t-text4)" : "var(--t-text)",
              borderBottom: "1.5px solid rgba(245,158,11,0.55)",
            }}
          />
        ) : (
          <>
            {/* Category icon square — 28px on phone, 32px on tablet (md+) */}
            <div
              className="shrink-0 flex items-center justify-center mt-0.5 w-[28px] h-[28px] md:w-[32px] md:h-[32px]"
              style={{
                borderRadius: "var(--radius-md)",
                background: catBg,
                border: `1px solid ${catColor}33`,
              }}
            >
              <CatIcon size={isMobile ? 15 : 16} style={{ color: catColor }} />
            </div>
            {/* Title + chip — stacked on phone (title full width, chip on its own
                line below); inline on tablet (md:flex-row) so the 768px+ layout is
                byte-for-byte unchanged. */}
            <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-start gap-1 md:gap-3">
              {/* Title — 13px phone / 14px tablet; wraps naturally (no clamp). */}
              <p
                className="leading-snug min-w-0 w-full md:w-auto md:flex-1 break-words mt-1 text-[13px] md:text-[14px]"
                style={{
                  // Very subtle tint of the title toward its category color (~85% of
                  // the theme text + 15% category) — stays fully readable in both modes.
                  color: titleError ? "#ef4444" : `color-mix(in srgb, var(--text-primary) 85%, ${catColor})`,
                  fontWeight: 500,
                }}
                onClick={enterEditMode}
              >
                {task.title}
              </p>
              {/* Category chip — per-category color when set, visible "+ Cat"
                  affordance when empty. self-start so it hugs content on phone;
                  mt aligns it on tablet. stopPropagation keeps it off swipe/edit. */}
              <button
                type="button"
                className="shrink-0 self-start rounded px-2 py-1 mt-0 md:mt-1 transition-all active:scale-95"
                style={{
                  background: localCategory ? (CATEGORY_COLORS[localCategory] ?? ACCENT) + "26" : CATEGORY_EMPTY + "1f",
                  color: localCategory ? (CATEGORY_COLORS[localCategory] ?? ACCENT) : CATEGORY_EMPTY,
                  border: localCategory
                    ? `1px solid ${(CATEGORY_COLORS[localCategory] ?? ACCENT)}66`
                    : `1px dashed ${CATEGORY_EMPTY}80`,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: "var(--font-size-xs)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  touchAction: "none",
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (!task.id.startsWith("temp-")) setPickerOpen(true); }}
                data-testid={`task-category-${task.id}`}
              >
                {localCategory ?? "+ Cat"}
              </button>
            </div>
            {onToggleFocus && (
              <button
                type="button"
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-colors mt-0.5"
                style={{
                  background: "transparent",
                  color: isFocused ? "var(--color-tasks)" : "var(--text-dim)",
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleFocus(); }}
                aria-label={isFocused ? "Remove focus" : "Set as focus task"}
              >
                <Star size={isMobile ? 17 : 15} fill={isFocused ? "var(--color-tasks)" : "none"} />
              </button>
            )}
            {/* Circle checkbox — tap to mark done (reuses the swipe-left done action) */}
            <button
              type="button"
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md transition-colors -mr-1 mt-0.5"
              style={{ background: "transparent", color: "var(--text-muted)" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); if (!task.id.startsWith("temp-")) onMoved(task, "done"); }}
              aria-label="Mark done"
              data-testid={`task-done-${task.id}`}
            >
              <Circle size={isMobile ? 17 : 18} />
            </button>
          </>
        )}
      </div>

      {/* Category picker — shared bottom sheet (fixed escapes the card's
          overflow:hidden). stopPropagation keeps taps off the swipe surface. */}
      {pickerOpen && (
        <CategoryPicker
          current={localCategory}
          onSelect={assignCategory}
          onClose={() => setPickerOpen(false)}
        />
      )}
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
  onReordered,
  onTitleChanged,
  onCategoryChanged,
  focusedTaskId,
  onToggleFocus,
  openAddSignal,
}: {
  bucket: Bucket;
  tasks: Task[];
  defaultOpen: boolean;
  onMoved: (task: Task, fromBucket: Bucket, action: SwipeAction) => void;
  onTaskAdded: (title: string) => void;
  onReordered: (bucket: Bucket, newOrder: Task[]) => void;
  onTitleChanged: (task: Task, newTitle: string) => void;
  onCategoryChanged: (task: Task, category: string) => void;
  focusedTaskId?: string | null;
  onToggleFocus?: (taskId: string) => void;
  openAddSignal?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [adding, setAdding] = useState(false);

  // FAB hook: when the parent bumps openAddSignal, expand + open the add card.
  // Guarded on > 0 so the initial mount (signal 0) doesn't auto-open.
  useEffect(() => {
    if (openAddSignal && openAddSignal > 0) { setOpen(true); setAdding(true); }
  }, [openAddSignal]);
  const meta = BUCKET_META[bucket];
  const isDraggable = DRAGGABLE_BUCKETS.has(bucket);

  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const cardEls = useRef<(HTMLDivElement | null)[]>([]);

  // Sync from parent only when not mid-drag
  useEffect(() => {
    if (dragIdx === null) setLocalTasks(tasks);
  }, [tasks, dragIdx]);

  function calcOverIdx(y: number): number {
    let next = localTasks.length;
    for (let j = 0; j < cardEls.current.length; j++) {
      const el = cardEls.current[j];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { next = j; break; }
    }
    return next;
  }

  function commitDrag(fromIdx: number, toIdx: number) {
    const newTasks = [...localTasks];
    const [moved] = newTasks.splice(fromIdx, 1);
    const insertAt = Math.max(0, Math.min(toIdx > fromIdx ? toIdx - 1 : toIdx, newTasks.length));
    newTasks.splice(insertAt, 0, moved);
    newTasks.forEach((t, i) => patchTaskReorder(t.id, (i + 1) * 1000));
    setLocalTasks(newTasks);
    onReordered(bucket, newTasks);
  }

  function handleAddClick(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
    setAdding(true);
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="w-full flex items-center gap-2 py-1">
        <div
          className="flex items-center gap-2.5 flex-1 cursor-pointer"
          onClick={() => setOpen((o) => !o)}
          role="button"
          aria-expanded={open}
        >
          {/* Colored bucket dot */}
          <span
            className="shrink-0 rounded-full"
            style={{ width: "8px", height: "8px", background: meta.color, boxShadow: `0 0 8px ${meta.color}66` }}
          />
          <span
            className="font-bold uppercase"
            style={{
              color: meta.color,
              fontFamily: "'Space Mono', monospace",
              fontSize: "var(--font-size-sm)",
              letterSpacing: "0.08em",
            }}
          >
            {meta.label}
          </span>
        </div>

        {/* Count badge — bucket bg + text tokens */}
        <span
          className="font-mono rounded-full"
          style={{
            background: meta.color + "1f",
            color: meta.color,
            fontSize: "var(--font-size-xs)",
            padding: "2px 8px",
          }}
        >
          {localTasks.length}
        </span>

        <button
          className="w-6 h-6 rounded-md flex items-center justify-center transition-all active:scale-90"
          style={{ background: meta.color + "18", color: meta.color }}
          onClick={handleAddClick}
          aria-label={`Add task to ${meta.label}`}
        >
          <Plus size={12} />
        </button>

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
        <div className="space-y-1.5 ml-4 mr-0 md:mx-4">
          {adding && (
            <AddTaskCard
              bucket={bucket}
              color={meta.color}
              onCancel={() => setAdding(false)}
              onSubmitted={(title) => { setAdding(false); onTaskAdded(title); }}
            />
          )}
          {localTasks.length === 0 && !adding && (
            <p className="text-xs text-white/25 pl-2">Nothing here.</p>
          )}
          {localTasks.map((task, i) => (
            <div key={task.id}>
              {/* Drop indicator above this slot */}
              {isDraggable && dragIdx !== null && overIdx === i && dragIdx !== i && (
                <div
                  className="rounded-full mb-1"
                  style={{ height: 2, background: meta.color }}
                />
              )}
              <div
                ref={el => { cardEls.current[i] = el; }}
                className="flex items-stretch"
                style={{ opacity: dragIdx === i ? 0.4 : 1 }}
              >
                {/* Drag handle */}
                {isDraggable && (
                  <div
                    className="flex items-center justify-center w-6 shrink-0"
                    style={{
                      touchAction: "none",
                      color: dragIdx === i ? meta.color : "var(--t-text6)",
                      cursor: dragIdx === i ? "grabbing" : "grab",
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      setDragIdx(i);
                      setOverIdx(calcOverIdx(e.clientY));
                    }}
                    onPointerMove={(e) => {
                      if (dragIdx !== i) return;
                      setOverIdx(calcOverIdx(e.clientY));
                    }}
                    onPointerUp={() => {
                      if (dragIdx === null || overIdx === null) {
                        setDragIdx(null); setOverIdx(null); return;
                      }
                      const from = dragIdx, to = overIdx;
                      setDragIdx(null); setOverIdx(null);
                      if (from !== to && from !== to - 1) commitDrag(from, to);
                    }}
                    onPointerCancel={() => { setDragIdx(null); setOverIdx(null); }}
                  >
                    <GripVertical size={14} />
                  </div>
                )}
                {/* Card */}
                <div
                  className="flex-1 min-w-0"
                  style={{
                    transform: dragIdx === i ? "scale(1.01)" : "none",
                    boxShadow: dragIdx === i ? "0 6px 20px rgba(0,0,0,0.5)" : "none",
                    transition: dragIdx !== i ? "transform 0.15s, box-shadow 0.15s" : "none",
                  }}
                >
                  <SwipeableCard
                    task={task}
                    sourceBucket={bucket}
                    onMoved={(t, action) => onMoved(t, bucket, action)}
                    onTitleChanged={(t, newTitle) => {
                      setLocalTasks(prev => prev.map(lt => lt.id === t.id ? { ...lt, title: newTitle } : lt));
                      onTitleChanged(t, newTitle);
                    }}
                    onCategoryChanged={(t, category) => {
                      setLocalTasks(prev => prev.map(lt => lt.id === t.id ? { ...lt, category } : lt));
                      onCategoryChanged(t, category);
                    }}
                    focusedTaskId={focusedTaskId}
                    onToggleFocus={onToggleFocus ? () => onToggleFocus(task.id) : undefined}
                  />
                </div>
              </div>
            </div>
          ))}
          {/* Drop indicator after last card */}
          {isDraggable && dragIdx !== null && overIdx === localTasks.length && (
            <div
              className="rounded-full"
              style={{ height: 2, background: meta.color }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

// ── List Mode — bulk archive + reschedule (separate from card/swipe mode) ────

type ListFilter = "todayTonight" | "unscheduled" | "overdue" | "both";

interface ListTask {
  id: string;
  title: string;
  dateLabel: string;
  category?: string;
}

const LIST_FILTERS: Array<{ key: ListFilter; label: string }> = [
  { key: "todayTonight", label: "Today / Tonight" },
  { key: "unscheduled",  label: "Unscheduled" },
  { key: "overdue",      label: "Overdue" },
  { key: "both",         label: "Both" },
];

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Today/Tonight = the existing /tasks today + tonight buckets (Active + Priority
// Today/Tonight). These carry no scheduled_date, so they're labelled by bucket.
async function listFetchTodayTonight(): Promise<ListTask[]> {
  const res = await fetch(`${JARVIS_URL}/tasks`, { headers: { Authorization: `Bearer ${REMI_API_KEY}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  const b = (data.tasks ?? {}) as { today?: Task[]; tonight?: Task[] };
  return [
    ...(b.today   ?? []).map((t) => ({ id: t.id, title: t.title, dateLabel: "Today",   category: t.category })),
    ...(b.tonight ?? []).map((t) => ({ id: t.id, title: t.title, dateLabel: "Tonight", category: t.category })),
  ];
}

// Overdue = existing /weekly-review/overdue (Active + Scheduled Date < today,
// excludes Someday). Carries the real scheduled date.
async function listFetchOverdue(): Promise<ListTask[]> {
  const res = await fetch(`${JARVIS_URL}/weekly-review/overdue`, { headers: { Authorization: `Bearer ${REMI_API_KEY}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = (await res.json()) as Array<{ id: string; title: string; scheduled_date: string; category?: string }>;
  return data.map((t) => ({ id: t.id, title: t.title, dateLabel: fmtDate(t.scheduled_date), category: t.category }));
}

// Unscheduled = existing /scheduler endpoint (Active + Priority=Today +
// Scheduled Date empty — the holding cell). Title only; these have no date.
async function listFetchUnscheduled(): Promise<ListTask[]> {
  const res = await fetch(`${JARVIS_URL}/scheduler`, { headers: { Authorization: `Bearer ${REMI_API_KEY}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = (await res.json()) as Array<{ id: string; title: string; category?: string }>;
  return data.map((t) => ({ id: t.id, title: t.title, dateLabel: "", category: t.category }));
}

async function listFetch(filter: ListFilter): Promise<ListTask[]> {
  if (filter === "todayTonight") return listFetchTodayTonight();
  if (filter === "unscheduled")  return listFetchUnscheduled();
  if (filter === "overdue")      return listFetchOverdue();
  // both — union by id (overdue's real date wins for tasks in both). Unscheduled
  // is intentionally NOT part of "both".
  const [tt, od] = await Promise.all([listFetchTodayTonight(), listFetchOverdue()]);
  const map = new Map<string, ListTask>();
  for (const t of tt) map.set(t.id, t);
  for (const t of od) map.set(t.id, t);
  return [...map.values()];
}

// Mark done = POST /tasks/move {bucket:"done"} → sets Status="Done" (same as the
// card/swipe left-swipe). NOT /scheduler/update {action:"done"}, which trashes the
// page so it never shows in the evening briefing or scorecard. Backend reads
// `page_id` (not `id`).
async function listMarkDone(id: string): Promise<void> {
  const r = await fetch(`${JARVIS_URL}/tasks/move`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: id, bucket: "done" }),
  });
  if (!r.ok) throw new Error(`${r.status}`);
}

async function listReschedule(id: string, isoDate: string): Promise<void> {
  const r = await fetch(`${JARVIS_URL}/scheduler/update`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, scheduled_date: isoDate }),
  });
  if (!r.ok) throw new Error(`${r.status}`);
}

function ListMode() {
  const [filter, setFilter]   = useState<ListFilter>("todayTonight");
  const [tasks, setTasks]     = useState<ListTask[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [picking, setPicking] = useState(false);
  const [status, setStatus]   = useState<{ ok: boolean; text: string } | null>(null);
  // Category bottom-sheet: id of the row whose + CAT was tapped (null = closed)
  const [pickerTaskId, setPickerTaskId] = useState<string | null>(null);

  const load = useCallback(async (f: ListFilter) => {
    setLoading(true); setError(null); setStatus(null); setChecked(new Set()); setPicking(false);
    try {
      setTasks(await listFetch(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on filter switch + first mount only. No timer / no date-change refresh
  // (midnight boundary: list stays stable until the user switches filter or refreshes).
  useEffect(() => { load(filter); }, [filter, load]);

  function toggle(id: string) {
    setChecked((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  const allSelected = tasks.length > 0 && checked.size === tasks.length;
  function toggleAll() {
    setChecked(allSelected ? new Set() : new Set(tasks.map((t) => t.id)));
  }

  async function runBulk(kind: "markDone" | "reschedule", isoDate?: string) {
    const sel = tasks.filter((t) => checked.has(t.id));
    if (sel.length === 0) return;
    setBusy(true); setStatus(null); setPicking(false);
    const results = await Promise.allSettled(
      sel.map((t) => (kind === "markDone" ? listMarkDone(t.id) : listReschedule(t.id, isoDate!)))
    );
    const okIds = new Set<string>();
    const failed: ListTask[] = [];
    results.forEach((r, i) => { if (r.status === "fulfilled") okIds.add(sel[i].id); else failed.push(sel[i]); });
    // Succeeded tasks leave the current view (marked done, or rescheduled off the filter).
    setTasks((prev) => prev.filter((t) => !okIds.has(t.id)));
    setChecked(new Set());
    setBusy(false);
    const noun = okIds.size === 1 ? "task" : "tasks";
    const done = kind === "markDone" ? "marked done" : `moved to ${fmtDate(isoDate!)}`;
    setStatus(
      failed.length
        ? { ok: false, text: `${okIds.size} ${done} · ${failed.length} failed: ${failed.map((t) => t.title).join(", ")}` }
        : { ok: true, text: `${okIds.size} ${noun} ${done}` }
    );
  }

  // Assign a category to one row: optimistically recolor it (label + left border)
  // in local state, write to Notion, then close the sheet. Reverts on failure —
  // mirrors SwipeableCard.assignCategory.
  async function assignCategory(id: string, category: string) {
    setPickerTaskId(null);
    const prevCat = tasks.find((t) => t.id === id)?.category;
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, category } : t)));
    try {
      await patchTaskCategory(id, category);
    } catch {
      setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, category: prevCat } : t)));
    }
  }

  const selectedCount = checked.size;
  const today = new Date().toISOString().slice(0, 10);
  const actionsEnabled = selectedCount > 0 && !busy;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filter chips */}
      <div className="px-4 py-2 border-b border-white/5 shrink-0 flex flex-wrap items-center justify-center gap-2">
        {LIST_FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-95"
              style={{
                background: active ? ACCENT + "22" : "var(--t-el-low)",
                border: `1px solid ${active ? ACCENT + "55" : "var(--t-border)"}`,
                color: active ? ACCENT : "var(--t-text5)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Select all + count + manual refresh */}
      {!loading && !error && tasks.length > 0 && (
        <div className="px-4 py-2 flex items-center justify-between shrink-0">
          <button onClick={toggleAll} className="text-xs font-semibold transition-colors active:scale-95" style={{ color: ACCENT }}>
            {allSelected ? "Deselect All" : "Select All"}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--t-text6)" }}>
              {selectedCount > 0 ? `${selectedCount} selected` : `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`}
            </span>
            <button onClick={() => load(filter)} className="p-1 rounded-md text-white/30 hover:text-white transition-colors" aria-label="Refresh list">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
            <span className="text-sm text-white/40">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-red-400/80">Could not load ({error})</p>
            <button className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: ACCENT + "20", color: ACCENT }} onClick={() => load(filter)}>
              Retry
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-center text-sm text-white/30 py-12">Nothing here.</p>
        ) : (
          tasks.map((t) => {
            const isChk = checked.has(t.id);
            // Color-by-context: list rows get a 3px left border + a category label
            // in the category color (uncategorized → muted gray). The checkbox border
            // picks up the category color on hover/focus via the --cat CSS var.
            const catColor = t.category ? (CATEGORY_COLORS[t.category] ?? "#9b8de8") : "#444450";
            return (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                className="group w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.99]"
                style={{
                  background: "var(--t-card)",
                  borderLeft: `3px solid ${catColor}`,
                  borderTop: `1px solid ${isChk ? ACCENT + "66" : "var(--t-border)"}`,
                  borderRight: `1px solid ${isChk ? ACCENT + "66" : "var(--t-border)"}`,
                  borderBottom: `1px solid ${isChk ? ACCENT + "66" : "var(--t-border)"}`,
                  ["--cat" as string]: catColor,
                } as React.CSSProperties}
              >
                {isChk
                  ? <CheckSquare size={18} style={{ color: ACCENT, flexShrink: 0 }} />
                  : <Square size={18} className="shrink-0 transition-colors [color:var(--t-text6)] group-hover:[color:var(--cat)] group-focus-visible:[color:var(--cat)]" />}
                <span className="flex-1 min-w-0 text-sm leading-snug whitespace-normal break-words" style={{ color: "var(--t-text2)" }}>
                  {t.title}
                </span>
                {/* Category chip — tappable to (re)assign. Rendered as a span, not
                    a button, so it doesn't nest an interactive button inside the
                    row button; stopPropagation keeps the tap off the row's
                    toggle(t.id) selection. Set → colored label; empty → dashed
                    + CAT affordance (matches the Cards view). */}
                <span
                  role="button"
                  tabIndex={-1}
                  className="shrink-0 rounded px-2 py-0.5 transition-all active:scale-95"
                  style={{
                    background: t.category ? catColor + "26" : CATEGORY_EMPTY + "1f",
                    color: t.category ? catColor : CATEGORY_EMPTY,
                    border: t.category ? `1px solid ${catColor}66` : `1px dashed ${CATEGORY_EMPTY}80`,
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "10px",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setPickerTaskId(t.id); }}
                  data-testid={`list-task-category-${t.id}`}
                >
                  {t.category ? t.category : "+ Cat"}
                </span>
                <span className="shrink-0 text-xs" style={{ color: "var(--t-text6)" }}>{t.dateLabel}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Status / per-task result */}
      {status && (
        <div className="px-4 py-1.5 shrink-0">
          <p className="text-xs text-center leading-snug" style={{ color: status.ok ? "#22c55e" : "#f87171" }}>{status.text}</p>
        </div>
      )}

      {/* Reschedule date picker */}
      {picking && (
        <div className="px-4 py-2 shrink-0 flex items-center gap-2 border-t border-white/5">
          <input
            type="date"
            min={today}
            autoFocus
            className="flex-1 text-sm rounded-lg px-3 py-2"
            style={{ background: "var(--t-el-med)", border: "1px solid var(--t-border-md)", color: "var(--t-text3)", minHeight: "38px" }}
            onChange={(e) => { if (e.target.value) runBulk("reschedule", e.target.value); }}
          />
          <button onClick={() => setPicking(false)} className="px-3 py-2 text-xs font-medium" style={{ color: "var(--t-text6)" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Bottom bulk actions */}
      <div
        className="px-4 py-3 shrink-0 flex gap-2 border-t border-white/5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <button
          disabled={!actionsEnabled}
          onClick={() => runBulk("markDone")}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{
            background: actionsEnabled ? "rgba(34,197,94,0.14)" : "var(--t-el-low)",
            border: `1px solid ${actionsEnabled ? "rgba(34,197,94,0.4)" : "var(--t-border)"}`,
            color: actionsEnabled ? "#22c55e" : "var(--t-text6)",
          }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Mark Done{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button
          disabled={!actionsEnabled}
          onClick={() => setPicking(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{
            background: actionsEnabled ? "rgba(96,165,250,0.14)" : "var(--t-el-low)",
            border: `1px solid ${actionsEnabled ? "rgba(96,165,250,0.4)" : "var(--t-border)"}`,
            color: actionsEnabled ? "#60a5fa" : "var(--t-text6)",
          }}
        >
          <Calendar size={15} />
          Reschedule{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      </div>

      {/* Category bottom-sheet for the row whose + CAT was tapped */}
      {pickerTaskId && (
        <CategoryPicker
          current={tasks.find((t) => t.id === pickerTaskId)?.category ?? null}
          onSelect={(cat) => assignCategory(pickerTaskId, cat)}
          onClose={() => setPickerTaskId(null)}
        />
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Tasks() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  // FAB → Today add-task: incremented on each FAB tap; the Today BucketSection
  // watches this and opens its inline add card. Additive — no existing flow changes.
  const [fabAddSignal, setFabAddSignal] = useState(0);
  // Category filter (cards view). Stateful within the session; resets to "All"
  // on reload because it is intentionally not persisted to localStorage.
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [loading,   setLoading]   = useState(true);
  const [bgLoading, setBgLoading] = useState(false);
  const [cacheHit,  setCacheHit]  = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [buckets,   setBuckets]   = useState<TaskBuckets>({
    today: [], tonight: [], tomorrow: [], someday: [],
  });
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [focus, setFocus] = useState<Record<FocusBucket, string | null>>(loadFocus);
  const initialLoaded = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useGutterScroll(scrollRef);

  // ── Projects (GTD) — independent of the task fetch/cache path above ─────────
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, []);
  // Surface only projects with Focus Date = today OR Status = Continual.
  const visibleProjects = projects.filter(
    (p) => p.status === "Continual" || (!!p.focus_date && p.focus_date === localTodayISO()),
  );

  const load = useCallback(async (forceRefresh = false) => {
    // ── Cache check ────────────────────────────────────────────────────────
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached && cached.date === todayISO()) {
        setBuckets(cached.tasks);
        setLoading(false);
        setCacheHit(true);
        initialLoaded.current = true;
        // Background refresh — silent, updates cache when done
        setBgLoading(true);
        try {
          const fresh = await fetchTasks();
          setBuckets(fresh);
          saveCache(fresh);
          setCacheHit(false);
        } catch { /* leave cached data visible */ }
        setBgLoading(false);
        return;
      }
    }

    // ── Progressive load ───────────────────────────────────────────────────
    setCacheHit(false);
    setLoading(true);
    setError(null);
    if (forceRefresh) clearCache();

    try {
      // Fetch 1: today + tonight + tomorrow (3 Notion calls)
      const priority = await fetchTasks(true);
      setBuckets(priority);
      setLoading(false);
      initialLoaded.current = true;

      // Fetch 2: full list including Someday (1 more Notion call)
      setBgLoading(true);
      try {
        const full = await fetchTasks();
        setBuckets(full);
        saveCache(full);
      } catch { /* leave priority data — Someday will be empty */ }
      setBgLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
      setLoading(false);
      setBgLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Clear stale focus IDs when task list changes (task deleted/moved externally)
  useEffect(() => {
    setFocus(prev => {
      let changed = false;
      const updated = { ...prev };
      for (const b of Object.keys(FOCUS_KEYS) as FocusBucket[]) {
        if (updated[b] !== null && !buckets[b].some(t => t.id === updated[b])) {
          updated[b] = null;
          saveFocusBucket(b, null);
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [buckets]);

  const handleToggleFocus = useCallback((bucket: FocusBucket, taskId: string) => {
    setFocus(prev => {
      const newId = prev[bucket] === taskId ? null : taskId;
      saveFocusBucket(bucket, newId);
      return { ...prev, [bucket]: newId };
    });
  }, []);

  // Optimistically add task, then refresh + re-cache after 2s to get the real page_id
  const handleTaskAdded = useCallback((title: string, bucket: Bucket) => {
    const tempTask: Task = { id: `temp-${Date.now()}`, title, url: "" };
    setBuckets((prev) => ({ ...prev, [bucket]: [tempTask, ...prev[bucket]] }));
    setTimeout(async () => {
      try {
        const fresh = await fetchTasks();
        setBuckets(fresh);
        saveCache(fresh);
        setCacheHit(false);
      } catch { /* silent — leave optimistic state */ }
    }, 2000);
  }, []);

  const handleMoved = useCallback((task: Task, fromBucket: Bucket, action: SwipeAction) => {
    applyTaskAction(task.id, action);

    setBuckets((prev) => ({
      ...prev,
      [fromBucket]: prev[fromBucket].filter((t) => t.id !== task.id),
    }));

    // Clear focus if the moved/completed task was the focused one for its bucket
    if (FOCUS_BUCKETS.has(fromBucket)) {
      setFocus(prev => {
        const fb = fromBucket as FocusBucket;
        if (prev[fb] === task.id) {
          saveFocusBucket(fb, null);
          return { ...prev, [fb]: null };
        }
        return prev;
      });
    }

    setUndoState({ task, fromBucket, action });
  }, []);

  const handleReordered = useCallback((bucket: Bucket, newTasks: Task[]) => {
    setBuckets(prev => {
      const updated = { ...prev, [bucket]: newTasks };
      saveCache(updated);
      return updated;
    });
  }, []);

  const handleTitleChanged = useCallback((task: Task, newTitle: string) => {
    setBuckets(prev => {
      const updated = { ...prev } as TaskBuckets;
      for (const b of Object.keys(updated) as Bucket[]) {
        updated[b] = updated[b].map(t => t.id === task.id ? { ...t, title: newTitle } : t);
      }
      saveCache(updated);
      return updated;
    });
  }, []);

  const handleCategoryChanged = useCallback((task: Task, category: string) => {
    setBuckets(prev => {
      const updated = { ...prev } as TaskBuckets;
      for (const b of Object.keys(updated) as Bucket[]) {
        updated[b] = updated[b].map(t => t.id === task.id ? { ...t, category } : t);
      }
      saveCache(updated);
      return updated;
    });
  }, []);

  const handleDismissUndo = useCallback(() => setUndoState(null), []);

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

  const totalCount = buckets.today.length + buckets.tonight.length + buckets.tomorrow.length;

  // Apply the category filter to every bucket (display-only — underlying buckets,
  // moves, and reorders are untouched). "All" passes through unfiltered.
  const filteredBuckets: TaskBuckets = categoryFilter === "All"
    ? buckets
    : {
        today:    buckets.today.filter((t) => t.category === categoryFilter),
        tonight:  buckets.tonight.filter((t) => t.category === categoryFilter),
        tomorrow: buckets.tomorrow.filter((t) => t.category === categoryFilter),
        someday:  buckets.someday.filter((t) => t.category === categoryFilter),
      };
  const filteredIsEmpty =
    categoryFilter !== "All" &&
    filteredBuckets.today.length === 0 &&
    filteredBuckets.tonight.length === 0 &&
    filteredBuckets.tomorrow.length === 0 &&
    filteredBuckets.someday.length === 0;

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--surface-base)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader
        title="Tasks"
        color="var(--color-tasks)"
        onMenu={() => setMenuOpen(true)}
        right={<>
          {!loading && (
            <span className="text-xs text-white/25 mr-2">{totalCount} total</span>
          )}
          <button
            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => load(true)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading || bgLoading ? "animate-spin" : ""} />
          </button>
        </>}
      />

      {/* View toggle — Cards (existing swipe mode) vs List (bulk cleanup) */}
      <div className="px-4 py-2.5 shrink-0 flex items-center justify-center gap-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {(["cards", "list"] as const).map((m) => {
          const active = viewMode === m;
          return (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className="font-semibold transition-all active:scale-95"
              style={{
                padding: "5px 18px",
                borderRadius: "var(--radius-pill)",
                fontSize: "var(--font-size-sm)",
                background: active ? ACCENT + "1f" : "transparent",
                border: `1px solid ${active ? ACCENT + "66" : "var(--border-subtle)"}`,
                color: active ? "var(--color-tasks)" : "var(--text-secondary)",
              }}
            >
              {m === "cards" ? "Cards" : "List"}
            </button>
          );
        })}
      </div>

      {viewMode === "list" && <ListMode />}

      {viewMode === "cards" && (
        <>
      {/* Swipe legend + cache status */}
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
        {(cacheHit || bgLoading) && (
          <p className="text-center mt-1" style={{ fontSize: "10px", color: "var(--t-text8)" }}>
            {bgLoading ? (cacheHit ? "Cached · refreshing…" : "Loading rest…") : "Cached"}
          </p>
        )}
      </div>

      {/* Category filter chips — horizontal scroll; cards view only */}
      <div className="px-4 py-2 shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2 w-max">
          {CATEGORY_FILTERS.map((c) => {
            const active = categoryFilter === c;
            return (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className="shrink-0 font-medium transition-all active:scale-95 whitespace-nowrap"
                style={{
                  padding: "4px 12px",
                  borderRadius: "var(--radius-pill)",
                  fontSize: "var(--font-size-sm)",
                  background: active ? "var(--surface-elevated)" : "transparent",
                  border: `1px solid ${active ? "var(--border-strong)" : "var(--border-subtle)"}`,
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Task list */}
      <div
        ref={scrollRef}
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

        {(!loading || initialLoaded.current) && !error && filteredIsEmpty && (
          <p className="text-center text-sm text-white/30 py-12">
            No {categoryFilter} tasks right now.
          </p>
        )}

        {(!loading || initialLoaded.current) && !error && !filteredIsEmpty && (
          <div className="space-y-6">
            {(["today", "tonight", "tomorrow", "someday"] as Bucket[]).map((b) => (
              <BucketSection
                key={b}
                bucket={b}
                tasks={filteredBuckets[b]}
                defaultOpen={b === "today" || b === "tonight"}
                onMoved={handleMoved}
                onTaskAdded={(title) => handleTaskAdded(title, b)}
                onReordered={handleReordered}
                onTitleChanged={handleTitleChanged}
                onCategoryChanged={handleCategoryChanged}
                focusedTaskId={FOCUS_BUCKETS.has(b) ? focus[b as FocusBucket] : undefined}
                onToggleFocus={FOCUS_BUCKETS.has(b) ? (taskId) => handleToggleFocus(b as FocusBucket, taskId) : undefined}
                openAddSignal={b === "today" ? fabAddSignal : undefined}
              />
            ))}
          </div>
        )}

        {/* Projects (GTD) — green cards below the task buckets. Independent of
            the task fetch state and the category filter; surfaces Continual
            projects and any with Focus Date = today. */}
        {visibleProjects.length > 0 && (
          <div className="space-y-2 pt-2">
            <p
              className="uppercase tracking-widest px-1"
              style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace", fontSize: "var(--font-size-xs)" }}
            >
              Projects
            </p>
            {visibleProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB — amber gradient, opens the Today add-task card */}
      <button
        type="button"
        onClick={() => setFabAddSignal((n) => n + 1)}
        className="fixed flex items-center justify-center transition-all active:scale-95"
        style={{
          right: "20px",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          width: "52px",
          height: "52px",
          borderRadius: "var(--radius-pill)",
          background: "linear-gradient(135deg, #f5a623, #e8831a)",
          color: "#ffffff",
          boxShadow: "0 6px 20px rgba(245,166,35,0.35)",
          zIndex: 40,
        }}
        aria-label="Add task"
        data-testid="tasks-fab"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
        </>
      )}

      {viewMode === "cards" && undoState && (
        <UndoToast
          key={`${undoState.task.id}-${undoState.action}`}
          state={undoState}
          onUndo={handleUndo}
          onDismiss={handleDismissUndo}
        />
      )}
    </div>
  );
}
