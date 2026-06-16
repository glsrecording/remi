import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";

interface UndoBarProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
  accentColor?: string;
}

export default function UndoBar({
  message,
  onUndo,
  onDismiss,
  duration = 90000,
  accentColor = "#f59e0b",
}: UndoBarProps) {
  const [remaining, setRemaining] = useState(duration);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const left = duration - elapsed;
      if (left <= 0) {
        clearInterval(tick);
        onDismiss();
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [duration, onDismiss]);

  const progress = remaining / duration; // 1 → 0
  const secs = Math.ceil(remaining / 1000);

  const handleUndo = () => {
    onUndo();
    onDismiss();
  };

  return (
    <div
      className="fixed left-3 right-3 z-40 rounded-2xl overflow-hidden shadow-xl bubble-in remi-panel-bar"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
        background: "var(--t-card)",
        border: "1px solid var(--t-border-md)",
      }}
      data-testid="undo-bar"
    >
      {/* Progress bar */}
      <div className="w-full h-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-none"
          style={{
            width: `${progress * 100}%`,
            background: accentColor,
            transition: "width 0.25s linear",
          }}
        />
      </div>

      {/* Content */}
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="flex-1 text-sm text-white/70 leading-snug">{message}</p>
        <span className="text-xs text-white/25 tabular-nums shrink-0">{secs}s</span>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 shrink-0"
          style={{ background: accentColor + "22", color: accentColor }}
          onClick={handleUndo}
          data-testid="button-undo"
        >
          <Undo2 size={13} />
          Undo
        </button>
        <button
          className="p-1.5 rounded-lg text-white/25 hover:text-white/60 transition-colors shrink-0"
          onClick={onDismiss}
          data-testid="button-dismiss-undo"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
