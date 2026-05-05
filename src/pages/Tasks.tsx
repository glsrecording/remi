import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, RefreshCw, Loader2, ChevronDown, ChevronRight } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const ACCENT = "#f59e0b";
const COMMIT_THRESHOLD = 65;

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

const BUCKET_META: Record<Bucket, { label: string; emoji: string; color: string }> = {
  today:    { label: "Today",    emoji: "⚡", color: "#f59e0b" },
  tonight:  { label: "Tonight",  emoji: "🌙", color: "#8b5cf6" },
  tomorrow: { label: "Tomorrow", emoji: "🌅", color: "#3b82f6" },
  someday:  { label: "Someday",  emoji: "💭", color: "#6b7280" },
};

// Index matches swipe direction: 0=up→Today, 1=right→Tonight, 2=down→Tomorrow, 3=left→Someday
const SWIPE_TARGETS: Array<{ bucket: Bucket; label: string; color: string; arrow: string }> = [
  { bucket: "today",    label: "Today",    color: "#f59e0b", arrow: "↑" },
  { bucket: "tonight",  label: "Tonight",  color: "#8b5cf6", arrow: "→" },
  { bucket: "tomorrow", label: "Tomorrow", color: "#3b82f6", arrow: "↓" },
  { bucket: "someday",  label: "Someday",  color: "#6b7280", arrow: "←" },
];

async function sendToJarvis(message: string): Promise<void> {
  await fetch(`${JARVIS_URL}/remi`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REMI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, user_id: "remi" }),
  }).catch(() => {});
}

async function fetchTasks(): Promise<TaskBuckets> {
  const res = await fetch(`${JARVIS_URL}/tasks`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.tasks as TaskBuckets;
}

function getDominantSwipe(x: number, y: number) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax > ay) return x > 0 ? SWIPE_TARGETS[1] : SWIPE_TARGETS[3];
  return y < 0 ? SWIPE_TARGETS[0] : SWIPE_TARGETS[2];
}

interface SwipeableCardProps {
  task: Task;
  sourceBucket: Bucket;
  onMoved: (taskId: string) => void;
}

function SwipeableCard({ task, sourceBucket, onMoved }: SwipeableCardProps) {
  // Render state — drives visual
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  // Refs — read instantly in event handlers without closure staleness
  const startPos  = useRef<{ x: number; y: number } | null>(null);
  const dragging  = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 }); // always in sync with real position

  const magnitude   = Math.sqrt(offset.x ** 2 + offset.y ** 2);
  const progress    = Math.min(1, magnitude / COMMIT_THRESHOLD);
  const dominant    = magnitude > 8 ? getDominantSwipe(offset.x, offset.y) : null;
  const validTarget = dominant && dominant.bucket !== sourceBucket;
  const swipeColor  = validTarget ? dominant!.color : "rgba(255,255,255,0.25)";

  function handlePointerDown(e: React.PointerEvent) {
    // Only left-button / primary touch
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    offsetRef.current = { x: 0, y: 0 };
    // Capture so we keep receiving events even when pointer leaves element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x;
    const ny = e.clientY - startPos.current.y;
    offsetRef.current = { x: nx, y: ny };
    setOffset({ x: nx, y: ny });
  }

  function handlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;

    // Read from ref — guaranteed to be the real final position
    const { x, y } = offsetRef.current;
    const mag = Math.sqrt(x ** 2 + y ** 2);

    if (mag >= COMMIT_THRESHOLD) {
      const swipe = getDominantSwipe(x, y);
      if (swipe.bucket !== sourceBucket) {
        setCommitting(true);
        sendToJarvis(`move ${task.title} to ${swipe.label.toLowerCase()}`);
        setTimeout(() => {
          setCommitted(true);
          onMoved(task.id);
        }, 200);
        return;
      }
    }

    // Not committed — spring back
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    startPos.current = null;
  }

  if (committed) return null;

  return (
    <div className="relative rounded-xl" style={{ overflow: "hidden" }}>
      {/* Direction hint backdrop — sits behind the sliding card */}
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
              color: swipeColor,
              opacity: progress * (validTarget ? 1 : 0.5),
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
        className="relative flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/5 select-none"
        style={{
          background: committing ? `${swipeColor}22` : "#333333",
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          // Only apply spring when NOT dragging — dragging.current is read at render time
          // which is correct because setOffset causes a re-render that reads the updated ref
          transition: dragging.current ? "none" : "transform 0.35s cubic-bezier(0.34,1.3,0.64,1), background 0.2s",
          willChange: "transform",
          cursor: magnitude > 4 ? "grabbing" : "default",
          // CRITICAL: prevent browser from intercepting touch as scroll/pan
          // Without this, mobile fires pointercancel after ~1mm movement
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <p className="text-sm text-white/85 leading-snug flex-1 min-w-0">{task.title}</p>
      </div>
    </div>
  );
}

function BucketSection({
  bucket,
  tasks,
  defaultOpen,
  onMoved,
}: {
  bucket: Bucket;
  tasks: Task[];
  defaultOpen: boolean;
  onMoved: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = BUCKET_META[bucket];

  return (
    <div className="space-y-2">
      <button
        className="w-full flex items-center gap-2 py-1 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-base">{meta.emoji}</span>
        <span
          className="text-sm font-bold tracking-tight flex-1"
          style={{ color: meta.color, fontFamily: "'Space Mono', monospace" }}
        >
          {meta.label}
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full mr-1"
          style={{ background: meta.color + "20", color: meta.color }}
        >
          {tasks.length}
        </span>
        {open
          ? <ChevronDown  size={14} style={{ color: meta.color, opacity: 0.6 }} />
          : <ChevronRight size={14} style={{ color: meta.color, opacity: 0.6 }} />}
      </button>

      {open && tasks.length === 0 && (
        <p className="text-xs text-white/25 pl-7">Nothing here.</p>
      )}

      {open && tasks.length > 0 && (
        <div className="space-y-1.5 pl-1">
          {tasks.map((task) => (
            <SwipeableCard
              key={task.id}
              task={task}
              sourceBucket={bucket}
              onMoved={onMoved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Tasks() {
  const [, navigate] = useLocation();
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [buckets, setBuckets]   = useState<TaskBuckets>({
    today: [], tonight: [], tomorrow: [], someday: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBuckets(await fetchTasks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Remove card from all buckets immediately on swipe commit
  const handleMoved = useCallback((taskId: string) => {
    setBuckets((prev) => {
      const next = { ...prev };
      (Object.keys(next) as Bucket[]).forEach((b) => {
        next[b] = prev[b].filter((t) => t.id !== taskId);
      });
      return next;
    });
  }, []);

  const totalCount = Object.values(buckets).reduce((n, a) => n + a.length, 0);

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#232323" }}>
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
              key={s.bucket}
              className="text-xs"
              style={{ color: s.color, opacity: 0.55, fontFamily: "'Space Mono', monospace" }}
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
        {loading && (
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

        {!loading && !error && (
          <div className="space-y-6">
            {(["today", "tonight", "tomorrow", "someday"] as Bucket[]).map((b) => (
              <BucketSection
                key={b}
                bucket={b}
                tasks={buckets[b]}
                defaultOpen={b === "today" || b === "tonight"}
                onMoved={handleMoved}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
