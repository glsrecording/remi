import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, RefreshCw, Loader2, ChevronDown, ChevronRight } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const ACCENT = "#f59e0b";

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

const SWIPE_BUCKETS: Array<{ bucket: Bucket; direction: string; label: string; dx: number; dy: number; color: string }> = [
  { bucket: "today",    direction: "up",    label: "Today",    dx:  0, dy: -1, color: "#f59e0b" },
  { bucket: "tonight",  direction: "right",  label: "Tonight",  dx:  1, dy:  0, color: "#8b5cf6" },
  { bucket: "tomorrow", direction: "down",  label: "Tomorrow", dx:  0, dy:  1, color: "#3b82f6" },
  { bucket: "someday",  direction: "left",  label: "Someday",  dx: -1, dy:  0, color: "#6b7280" },
];

const COMMIT_THRESHOLD = 70;

async function sendToJarvis(message: string): Promise<void> {
  await fetch(`${JARVIS_URL}/remi`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${REMI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, user_id: "remi" }),
  });
}

async function fetchTasks(): Promise<TaskBuckets> {
  const res = await fetch(`${JARVIS_URL}/tasks`, {
    headers: { "Authorization": `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Tasks fetch failed: ${res.status}`);
  const data = await res.json();
  return data.tasks as TaskBuckets;
}

interface SwipeableCardProps {
  task: Task;
  sourceBucket: Bucket;
  onMoved: (taskId: string, toBucket: Bucket) => void;
}

function SwipeableCard({ task, sourceBucket, onMoved }: SwipeableCardProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  const magnitude = Math.sqrt(offset.x ** 2 + offset.y ** 2);
  const progress  = Math.min(1, magnitude / COMMIT_THRESHOLD);

  const dominantSwipe = (() => {
    if (magnitude < 6) return null;
    const ax = Math.abs(offset.x), ay = Math.abs(offset.y);
    if (ax > ay) return offset.x > 0 ? SWIPE_BUCKETS[1] : SWIPE_BUCKETS[3]; // right/left
    return offset.y < 0 ? SWIPE_BUCKETS[0] : SWIPE_BUCKETS[2];               // up/down
  })();

  const isValidTarget = dominantSwipe && dominantSwipe.bucket !== sourceBucket;

  const handlePointerDown = (e: React.PointerEvent) => {
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !startPos.current) return;
    setOffset({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    if (isValidTarget && magnitude >= COMMIT_THRESHOLD) {
      const target = dominantSwipe!.bucket;
      setCommitting(true);
      sendToJarvis(`move ${task.title} to ${dominantSwipe!.label.toLowerCase()}`)
        .catch(() => {});
      setTimeout(() => {
        setCommitted(true);
        onMoved(task.id, target);
      }, 220);
    } else {
      setOffset({ x: 0, y: 0 });
    }
    startPos.current = null;
  }, [isValidTarget, magnitude, dominantSwipe, task.title, task.id, onMoved]);

  if (committed) return null;

  const swipeColor = isValidTarget ? dominantSwipe!.color : "rgba(255,255,255,0.3)";

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ touchAction: "pan-x pan-y" }}>
      {/* Directional hint backdrop */}
      {dominantSwipe && (
        <div
          className="absolute inset-0 rounded-xl flex items-center justify-center"
          style={{
            background: `${swipeColor}${Math.round(progress * 40).toString(16).padStart(2, "0")}`,
            border: `1.5px solid ${swipeColor}${Math.round(progress * 180).toString(16).padStart(2, "0")}`,
          }}
        >
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{
              color: swipeColor,
              opacity: progress,
              fontFamily: "'Space Mono', monospace",
            }}
          >
            {dominantSwipe.label}
          </span>
        </div>
      )}

      <div
        className="relative flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/5"
        style={{
          background: committing ? `${swipeColor}18` : "#333333",
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: dragging.current ? "none" : "transform 0.3s cubic-bezier(0.34,1.3,0.64,1), background 0.2s",
          willChange: "transform",
          cursor: magnitude > 4 ? "grabbing" : "default",
          userSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 leading-snug">{task.title}</p>
        </div>
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
  onMoved: (taskId: string, toBucket: Bucket) => void;
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
        {open ? (
          <ChevronDown size={14} style={{ color: meta.color, opacity: 0.6 }} />
        ) : (
          <ChevronRight size={14} style={{ color: meta.color, opacity: 0.6 }} />
        )}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<TaskBuckets>({
    today: [], tonight: [], tomorrow: [], someday: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTasks();
      setBuckets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMoved = useCallback((taskId: string, toBucket: Bucket) => {
    setBuckets((prev) => {
      const updated = { ...prev };
      (["today", "tonight", "tomorrow", "someday"] as Bucket[]).forEach((b) => {
        updated[b] = prev[b].filter((t) => t.id !== taskId);
      });
      return updated;
    });
  }, []);

  const totalCount = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#232323" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background: "#1a1a1a",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
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
          <span className="text-xs text-white/30 mr-2">{totalCount} total</span>
        )}
        <button
          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Swipe hint */}
      <div className="px-4 py-2 border-b border-white/5 shrink-0">
        <p className="text-xs text-white/20 text-center tracking-wide">
          Swipe cards to move between buckets
        </p>
        <div className="flex items-center justify-center gap-4 mt-1.5">
          {SWIPE_BUCKETS.map((s) => (
            <span key={s.bucket} className="text-xs" style={{ color: s.color, opacity: 0.6, fontFamily: "'Space Mono', monospace" }}>
              {s.direction === "up" ? "↑" : s.direction === "down" ? "↓" : s.direction === "right" ? "→" : "←"} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
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
            <p className="text-sm text-red-400/80">{error}</p>
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
