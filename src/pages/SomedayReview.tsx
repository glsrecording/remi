import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Archive } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS, BrainItem, todayLabel } from "@/lib/storage";
import UndoBar from "@/components/UndoBar";

const COMMIT_THRESHOLD = 80;

interface SwipeableProps {
  item: BrainItem;
  onPromote: (item: BrainItem) => void;
}

function SwipeableRow({ item, onPromote }: SwipeableProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [committing, setCommitting] = useState(false);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);

  const progress = Math.min(1, Math.abs(offsetX) / COMMIT_THRESHOLD);

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || startX.current === null) return;
    setOffsetX(Math.min(0, e.clientX - startX.current));
  };

  const handlePointerUp = () => {
    dragging.current = false;
    if (Math.abs(offsetX) >= COMMIT_THRESHOLD) {
      setCommitting(true);
      setTimeout(() => {
        onPromote(item);
        setOffsetX(0);
        setCommitting(false);
      }, 220);
    } else {
      setOffsetX(0);
    }
    startX.current = null;
  };

  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Green reveal — right side */}
      <div
        className="absolute inset-0 flex items-center justify-end px-5 rounded-xl"
        style={{
          background: `rgba(34,197,94,${0.08 + progress * 0.18})`,
          borderRight: `3px solid rgba(34,197,94,${progress})`,
          transition: dragging.current ? "none" : "all 0.25s ease",
        }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{
            opacity: progress,
            transform: `translateX(${-progress * 4}px)`,
            transition: dragging.current ? "none" : "all 0.25s ease",
          }}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: "#22c55e", fontFamily: "'Space Mono', monospace" }}
          >
            Today
          </span>
          <ArrowLeft size={13} style={{ color: "#22c55e" }} />
        </div>
      </div>

      {/* Item row */}
      <div
        className="relative flex items-start gap-3 px-4 py-3.5 border border-white/5"
        style={{
          background: committing ? "rgba(34,197,94,0.12)" : "#333333",
          borderRadius: "0.75rem",
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current
            ? "none"
            : "transform 0.3s cubic-bezier(0.34,1.3,0.64,1), background 0.2s ease",
          willChange: "transform",
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
          style={{ background: "#a855f7" }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 leading-snug select-none">{item.text}</p>
          <p className="text-xs text-white/25 mt-0.5">{item.date}</p>
        </div>
      </div>
    </div>
  );
}

export default function SomedayReview() {
  const [, navigate] = useLocation();
  const [ACCENT] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [items, setItems] = useLocalStorage<BrainItem[]>(STORAGE_KEYS.BRAIN_DUMP_ITEMS, []);
  const [undoAction, setUndoAction] = useState<{ message: string; onUndo: () => void } | null>(null);

  const someday = items.filter((i) => i.bucket === "someday");

  const promoteToToday = (item: BrainItem) => {
    const promoted: BrainItem = { ...item, bucket: "today" };
    setItems((prev) => prev.map((i) => (i.id === item.id ? promoted : i)));
    setUndoAction({
      message: `Moved to Today`,
      onUndo: () => setItems((prev) => prev.map((i) => (i.id === item.id ? item : i))),
    });
  };

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
          data-testid="button-back"
        >
          <ArrowLeft size={20} />
        </button>
        <Archive size={16} className="text-white/30" />
        <span
          className="text-base font-bold tracking-tight"
          style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}
        >
          Someday Review
        </span>
        {someday.length > 0 && (
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ background: "#a855f720", color: "#a855f7" }}
          >
            {someday.length}
          </span>
        )}
      </div>

      {/* Hint */}
      <div className="px-4 pt-5 pb-2">
        <p className="text-xs text-white/25 tracking-wide">
          Swipe left on any item to pull it into Today
        </p>
      </div>

      {/* List */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-6 space-y-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {someday.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Archive size={32} className="text-white/10" />
            <p className="text-sm text-white/25">Nothing in Someday yet</p>
            <p className="text-xs text-white/15 text-center px-6">
              Add ideas from Brain Dump or type "Someday: [idea]" in the main chat
            </p>
          </div>
        ) : (
          someday.map((item) => (
            <SwipeableRow key={item.id} item={item} onPromote={promoteToToday} />
          ))
        )}
      </div>

      {undoAction && (
        <UndoBar
          message={undoAction.message}
          onUndo={undoAction.onUndo}
          onDismiss={() => setUndoAction(null)}
          accentColor="#22c55e"
        />
      )}
    </div>
  );
}
