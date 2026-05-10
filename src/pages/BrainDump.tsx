import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Mic,
  MicOff,
  CheckCircle2,
  Trash2,
  ArrowRight,
  Pin,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS, BrainItem, BucketType, todayLabel } from "@/lib/storage";
import UndoBar from "@/components/UndoBar";

const COMMIT_THRESHOLD = 80;

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

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

interface SwipeableTodayItemProps {
  item: BrainItem;
  onComplete: (item: BrainItem) => void;
  onDelete: (id: string) => void;
  onMoveToTomorrow: (item: BrainItem) => void;
  onPin: (item: BrainItem) => void;
}

function SwipeableTodayItem({
  item,
  onComplete,
  onDelete,
  onMoveToTomorrow,
  onPin,
}: SwipeableTodayItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [committing, setCommitting] = useState(false);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);
  const progress = Math.min(1, offsetX / COMMIT_THRESHOLD);

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || startX.current === null) return;
    setOffsetX(Math.max(0, e.clientX - startX.current));
  };
  const handlePointerUp = () => {
    dragging.current = false;
    if (offsetX >= COMMIT_THRESHOLD) {
      setCommitting(true);
      setTimeout(() => {
        onMoveToTomorrow(item);
        setOffsetX(0);
        setCommitting(false);
      }, 220);
    } else setOffsetX(0);
    startX.current = null;
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      data-testid={`item-${item.bucket}-${item.id}`}
    >
      <div
        className="absolute inset-0 flex items-center px-4 rounded-xl"
        style={{
          background: `rgba(59,130,246,${0.08 + progress * 0.18})`,
          borderLeft: `3px solid rgba(59,130,246,${progress})`,
          transition: dragging.current ? "none" : "all 0.25s ease",
        }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{
            opacity: progress,
            transform: `translateX(${progress * 4}px)`,
            transition: dragging.current ? "none" : "all 0.25s ease",
          }}
        >
          <ArrowRight size={13} style={{ color: "#3b82f6" }} />
          <span
            className="text-xs font-semibold"
            style={{ color: "#3b82f6", fontFamily: "'Space Mono', monospace" }}
          >
            Tomorrow
          </span>
        </div>
      </div>
      <div
        className="group relative flex items-start gap-3 px-4 py-3 border border-white/5"
        style={{
          background: committing ? "rgba(59,130,246,0.12)" : "#333333",
          borderRadius: "0.75rem",
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current
            ? "none"
            : "transform 0.3s cubic-bezier(0.34,1.3,0.64,1), background 0.2s ease",
          willChange: "transform",
          touchAction: "pan-y",
          cursor: offsetX > 4 ? "grabbing" : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <button
          className="shrink-0 mt-0.5 rounded-full transition-all active:scale-90 text-white/20 hover:text-green-400 focus:outline-none"
          onClick={() => onComplete(item)}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`button-complete-${item.id}`}
        >
          <CheckCircle2 size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 leading-snug select-none">
            {item.text}
          </p>
          <p className="text-xs text-white/25 mt-0.5">
            {item.date} · {item.timestamp}
          </p>
        </div>
        <button
          className="shrink-0 p-1.5 rounded-lg text-white/15 hover:text-amber-400 hover:bg-amber-400/10 transition-all opacity-0 group-hover:opacity-100"
          onClick={() => onPin(item)}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`button-pin-item-${item.id}`}
        >
          <Pin size={13} />
        </button>
        <button
          className="shrink-0 p-1.5 rounded-lg text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(item.id)}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`button-delete-item-${item.id}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

interface SwipeableTomorrowItemProps {
  item: BrainItem;
  onDelete: (id: string) => void;
  onPromoteToToday: (item: BrainItem) => void;
}
function SwipeableTomorrowItem({
  item,
  onDelete,
  onPromoteToToday,
}: SwipeableTomorrowItemProps) {
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
        onPromoteToToday(item);
        setOffsetX(0);
        setCommitting(false);
      }, 220);
    } else setOffsetX(0);
    startX.current = null;
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      data-testid={`item-${item.bucket}-${item.id}`}
    >
      <div
        className="absolute inset-0 flex items-center justify-end px-4 rounded-xl"
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
      <div
        className="group relative flex items-start gap-3 px-4 py-3 border border-white/5"
        style={{
          background: committing ? "rgba(34,197,94,0.12)" : "#333333",
          borderRadius: "0.75rem",
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current
            ? "none"
            : "transform 0.3s cubic-bezier(0.34,1.3,0.64,1), background 0.2s ease",
          willChange: "transform",
          touchAction: "pan-y",
          cursor: offsetX < -4 ? "grabbing" : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-white/15" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 leading-snug select-none">
            {item.text}
          </p>
          <p className="text-xs text-white/25 mt-0.5">
            {item.date} · {item.timestamp}
          </p>
        </div>
        <button
          className="shrink-0 p-1.5 rounded-lg text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(item.id)}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`button-delete-item-${item.id}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

interface SwipeableSomedayItemProps {
  item: BrainItem;
  onDelete: (id: string) => void;
  onPromoteToToday: (item: BrainItem) => void;
}
function SwipeableSomedayItem({
  item,
  onDelete,
  onPromoteToToday,
}: SwipeableSomedayItemProps) {
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
        onPromoteToToday(item);
        setOffsetX(0);
        setCommitting(false);
      }, 220);
    } else setOffsetX(0);
    startX.current = null;
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      data-testid={`item-${item.bucket}-${item.id}`}
    >
      <div
        className="absolute inset-0 flex items-center justify-end px-4 rounded-xl"
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
      <div
        className="group relative flex items-start gap-3 px-4 py-3 border border-white/5"
        style={{
          background: committing ? "rgba(34,197,94,0.12)" : "#333333",
          borderRadius: "0.75rem",
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current
            ? "none"
            : "transform 0.3s cubic-bezier(0.34,1.3,0.64,1), background 0.2s ease",
          willChange: "transform",
          touchAction: "pan-y",
          cursor: offsetX < -4 ? "grabbing" : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-white/15" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 leading-snug select-none">
            {item.text}
          </p>
          <p className="text-xs text-white/25 mt-0.5">
            {item.date} · {item.timestamp}
          </p>
        </div>
        <button
          className="shrink-0 p-1.5 rounded-lg text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(item.id)}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`button-delete-item-${item.id}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export default function BrainDump() {
  const [, navigate] = useLocation();
  const [ACCENT] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [selectedBucket, setSelectedBucket] = useState<BucketType | null>(null);
  const [oneThing, setOneThing] = useLocalStorage<string>(
    STORAGE_KEYS.ONE_THING,
    "",
  );
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [items, setItems] = useLocalStorage<BrainItem[]>(
    STORAGE_KEYS.BRAIN_DUMP_ITEMS,
    [
      {
        id: "demo-1",
        text: "Follow up with mastering engineer",
        bucket: "today",
        timestamp: "9:15 AM",
        date: todayLabel(),
      },
      {
        id: "demo-2",
        text: "Write chord progression for EP opener",
        bucket: "someday",
        timestamp: "9:20 AM",
        date: todayLabel(),
      },
    ],
  );
  const [inputText, setInputText] = useState("");
  const [undoAction, setUndoAction] = useState<{
    message: string;
    onUndo: () => void;
  } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [retryBlob, setRetryBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const holdStopFiredRef = useRef(false);

  const buckets: {
    key: BucketType;
    label: string;
    emoji: string;
    color: string;
  }[] = [
    { key: "today", label: "Today", emoji: "⚡", color: "#f59e0b" },
    { key: "tomorrow", label: "Tomorrow", emoji: "🌅", color: "#3b82f6" },
    { key: "someday", label: "Someday", emoji: "🌙", color: "#a855f7" },
  ];

  const addItem = (text: string, bucket: BucketType) => {
    const id = Date.now().toString();
    const newItem: BrainItem = {
      id,
      text,
      bucket,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      date: todayLabel(),
    };
    setItems((prev) => [newItem, ...prev]);
    setInputText("");
    const bucketLabel = buckets.find((b) => b.key === bucket)?.label ?? bucket;
    setUndoAction({
      message: `Added to ${bucketLabel}`,
      onUndo: () => setItems((prev) => prev.filter((i) => i.id !== id)),
    });
  };

  const handleTranscribe = useCallback(
    async (blob: Blob) => {
      if (!selectedBucket) return;
      setIsTranscribing(true);
      setRecordingError(null);
      setRetryBlob(null);
      try {
        const transcript = await transcribeAudio(blob);
        if (transcript) addItem(transcript, selectedBucket);
        else setRecordingError("Nothing captured — try again.");
      } catch {
        setRecordingError("Transcription failed — check connection.");
        setRetryBlob(blob);
      } finally {
        setIsTranscribing(false);
      }
    },
    [selectedBucket],
  );

  const handleVoiceHoldStart = useCallback(async () => {
    if (!selectedBucket || isRecording || isTranscribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      setRecordingError(null);
      setRetryBlob(null);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        // 800ms flush delay: Safari delivers dataavailable after onstop (out of spec order).
        setTimeout(() => {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];
          if (blob.size > 0) handleTranscribe(blob);
        }, 800);
      };
      recorder.start(100);
      setIsRecording(true);
    } catch {
      setRecordingError("Microphone permission is blocked or unavailable.");
    }
  }, [selectedBucket, isRecording, isTranscribing, handleTranscribe]);

  const handleVoiceHoldEnd = useCallback(() => {
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    )
      return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  const handleHoldStop = useCallback(() => {
    if (holdStopFiredRef.current) return;
    holdStopFiredRef.current = true;
    handleVoiceHoldEnd();
    setTimeout(() => { holdStopFiredRef.current = false; }, 400);
  }, [handleVoiceHoldEnd]);

  const deleteItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));
  const completeItem = (item: BrainItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setUndoAction({
      message: `"${item.text.length > 32 ? item.text.slice(0, 32) + "…" : item.text}" done ✓`,
      onUndo: () => setItems((prev) => [item, ...prev]),
    });
  };
  const moveToTomorrow = (item: BrainItem) => {
    const moved: BrainItem = { ...item, bucket: "tomorrow" };
    setItems((prev) => prev.map((i) => (i.id === item.id ? moved : i)));
    setUndoAction({
      message: `Moved to Tomorrow`,
      onUndo: () =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i))),
    });
  };
  const pinItem = (item: BrainItem) => {
    const prev = oneThing;
    setOneThing(item.text);
    setPinnedId(item.id);
    setUndoAction({
      message: `"${item.text.length > 28 ? item.text.slice(0, 28) + "…" : item.text}" pinned`,
      onUndo: () => {
        setOneThing(prev);
        setPinnedId(null);
      },
    });
  };
  const promoteToToday = (item: BrainItem) => {
    const promoted: BrainItem = { ...item, bucket: "today" };
    setItems((prev) => prev.map((i) => (i.id === item.id ? promoted : i)));
    setUndoAction({
      message: `Moved to Today`,
      onUndo: () =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i))),
    });
  };
  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedBucket) return;
    addItem(inputText.trim(), selectedBucket);
  };
  const getBucketItems = (bucket: BucketType) =>
    items.filter((i) => i.bucket === bucket);
  const micLabel = isTranscribing
    ? "Transcribing..."
    : isRecording
      ? "Release to send"
      : selectedBucket
        ? "Hold to record"
        : "Select a bucket first";

  return (
    <div
      className="flex flex-col h-full w-full"
      style={{ background: "#232323" }}
    >
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
        <span
          className="text-base font-bold tracking-tight"
          style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}
        >
          Brain Dump
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 130px)",
        }}
      >
        <div className="space-y-3">
          <p className="text-xs text-white/30 uppercase tracking-widest">
            Select a bucket
          </p>
          <div className="flex flex-col gap-3">
            {buckets.map((b) => (
              <button
                key={b.key}
                className="flex items-center justify-between w-full px-5 py-4 rounded-2xl border transition-all duration-200 active:scale-[0.98]"
                style={{
                  background:
                    selectedBucket === b.key ? b.color + "18" : "#333333",
                  borderColor:
                    selectedBucket === b.key
                      ? b.color + "80"
                      : "rgba(255,255,255,0.06)",
                }}
                onClick={() =>
                  setSelectedBucket(b.key === selectedBucket ? null : b.key)
                }
                data-testid={`button-bucket-${b.key}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{b.emoji}</span>
                  <span
                    className="text-base font-semibold"
                    style={{
                      color:
                        selectedBucket === b.key
                          ? b.color
                          : "rgba(255,255,255,0.85)",
                    }}
                  >
                    {b.label}
                  </span>
                </div>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{ background: b.color + "20", color: b.color }}
                >
                  {getBucketItems(b.key).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {selectedBucket && getBucketItems(selectedBucket).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-white/30 uppercase tracking-widest">
              {buckets.find((b) => b.key === selectedBucket)?.label} —{" "}
              {getBucketItems(selectedBucket).length} item
              {getBucketItems(selectedBucket).length !== 1 ? "s" : ""}
            </p>
            {getBucketItems(selectedBucket).map((item) =>
              item.bucket === "today" ? (
                <SwipeableTodayItem
                  key={item.id}
                  item={item}
                  onComplete={completeItem}
                  onDelete={deleteItem}
                  onMoveToTomorrow={moveToTomorrow}
                  onPin={pinItem}
                />
              ) : item.bucket === "someday" ? (
                <SwipeableSomedayItem
                  key={item.id}
                  item={item}
                  onDelete={deleteItem}
                  onPromoteToToday={promoteToToday}
                />
              ) : (
                <SwipeableTomorrowItem
                  key={item.id}
                  item={item}
                  onDelete={deleteItem}
                  onPromoteToToday={promoteToToday}
                />
              ),
            )}
          </div>
        )}

        {selectedBucket && (
          <form onSubmit={handleTextSubmit} className="space-y-2">
            <p className="text-xs text-white/30 uppercase tracking-widest">
              Add a note
            </p>
            <div className="flex gap-2">
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Add to ${selectedBucket}...`}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
                data-testid="input-brain-dump-text"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: ACCENT, color: "#111111" }}
                data-testid="button-add-item"
              >
                Add
              </button>
            </div>
          </form>
        )}
      </div>

      <div
        className="shrink-0 flex flex-col items-center px-4 pt-4 border-t border-white/5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        {isRecording && (
          <div className="flex items-center gap-1 mb-3 h-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="wave-bar w-1 rounded-full"
                style={{
                  height: "16px",
                  background: "#ef4444",
                  animationDelay: `${(i - 1) * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}
        {isTranscribing && (
          <div className="flex items-center gap-2 mb-3">
            <Loader2
              size={14}
              className="animate-spin"
              style={{ color: ACCENT }}
            />
            <span className="text-xs" style={{ color: ACCENT }}>
              Transcribing...
            </span>
          </div>
        )}
        <div className="flex items-center gap-5">
          {/* Existing mic — left side */}
          <button
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${isRecording ? "voice-button-recording" : ""}`}
            style={{
              background: isRecording
                ? "#ef444415"
                : selectedBucket && !isTranscribing
                  ? ACCENT + "15"
                  : "#333333",
              border: `2px solid ${isRecording ? "#ef4444" : selectedBucket && !isTranscribing ? ACCENT + "60" : "rgba(255,255,255,0.08)"}`,
              opacity: !selectedBucket || isTranscribing ? 0.4 : 1,
              cursor:
                !selectedBucket || isTranscribing ? "not-allowed" : "pointer",
            }}
            onPointerDown={handleVoiceHoldStart}
            onPointerUp={handleVoiceHoldEnd}
            onPointerLeave={handleVoiceHoldEnd}
            onTouchEnd={handleVoiceHoldEnd}
            disabled={!selectedBucket || isTranscribing}
            data-testid="button-voice-record"
          >
            {isTranscribing ? (
              <Loader2
                size={22}
                className="animate-spin"
                style={{ color: ACCENT }}
              />
            ) : isRecording ? (
              <MicOff size={22} style={{ color: "#ef4444" }} />
            ) : (
              <Mic
                size={22}
                style={{
                  color: selectedBucket ? ACCENT : "rgba(255,255,255,0.3)",
                }}
              />
            )}
          </button>

          {/* Hold-to-send mic — right thumb position, auto-saves on release */}
          <button
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${isRecording ? "voice-button-recording" : ""}`}
            style={{
              background: isRecording ? "#ef444415" : selectedBucket && !isTranscribing ? "#f59e0b15" : "#333333",
              border: `2px solid ${isRecording ? "#ef4444" : selectedBucket && !isTranscribing ? "#f59e0b60" : "rgba(255,255,255,0.08)"}`,
              opacity: !selectedBucket || isTranscribing ? 0.4 : 1,
              cursor: !selectedBucket || isTranscribing ? "not-allowed" : "pointer",
              marginRight: "12px",
            }}
            onPointerDown={handleVoiceHoldStart}
            onPointerUp={handleHoldStop}
            onPointerLeave={handleHoldStop}
            onTouchEnd={handleHoldStop}
            disabled={!selectedBucket || isTranscribing}
            data-testid="button-voice-hold"
          >
            {isTranscribing ? (
              <Loader2 size={22} className="animate-spin" style={{ color: "#f59e0b" }} />
            ) : isRecording ? (
              <MicOff size={22} style={{ color: "#ef4444" }} />
            ) : (
              <Mic size={22} style={{ color: selectedBucket ? "#f59e0b" : "rgba(255,255,255,0.3)" }} />
            )}
          </button>
        </div>
        <p className="text-xs text-white/25 mt-2">{micLabel}</p>
        {recordingError && (
          <div className="flex items-center gap-2 mt-2">
            <p className="text-xs text-red-400/80">{recordingError}</p>
            {retryBlob && (
              <button
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95"
                style={{ background: ACCENT + "20", color: ACCENT }}
                onClick={() => handleTranscribe(retryBlob)}
              >
                <RotateCcw size={11} /> Retry
              </button>
            )}
          </div>
        )}
      </div>

      {undoAction && (
        <UndoBar
          message={undoAction.message}
          onUndo={undoAction.onUndo}
          onDismiss={() => setUndoAction(null)}
          accentColor={ACCENT}
        />
      )}
    </div>
  );
}
