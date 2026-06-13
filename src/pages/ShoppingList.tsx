import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Loader2, Mic, MicOff } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const TEAL            = "#00B4C8";
const DONE_COLOR      = "#22c55e";
const COMMIT_THRESHOLD = 65;

interface ErrandItem {
  id: string;
  name: string;
  store: string;
  who: string;
}

// ── Swipeable card — right swipe only → "Got it" ────────────────────────────

function SwipeableErrandCard({
  item,
  onDone,
  onEdit,
}: {
  item: ErrandItem;
  onDone: () => void;
  onEdit: () => void;
}) {
  const [offsetX, setOffsetX]     = useState(0);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted]   = useState(false);

  const startPos    = useRef<{ x: number; y: number } | null>(null);
  const dragging    = useRef(false);
  const offsetRef   = useRef(0);
  const directionRef = useRef<"undecided" | "swipe" | "scroll">("undecided");

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = true;
    directionRef.current = "undecided";
    offsetRef.current = 0;
    e.stopPropagation();
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current || !startPos.current) return;
    const nx = e.clientX - startPos.current.x;
    const ny = e.clientY - startPos.current.y;
    const mag = Math.sqrt(nx ** 2 + ny ** 2);

    if (directionRef.current === "undecided" && mag >= 8) {
      const ax = Math.abs(nx), ay = Math.abs(ny);
      if (ax >= ay * 1.5 && nx > 0) {
        // horizontal right — commit to swipe
        directionRef.current = "swipe";
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        // vertical or left — let page scroll
        directionRef.current = "scroll";
        dragging.current = false;
        return;
      }
    }

    if (directionRef.current !== "swipe") return;
    const x = Math.max(0, nx);
    offsetRef.current = x;
    setOffsetX(x);
  }

  function handlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;

    if (directionRef.current === "swipe" && offsetRef.current >= COMMIT_THRESHOLD) {
      setCommitting(true);
      setTimeout(() => {
        setCommitted(true);
        onDone();
      }, 200);
      return;
    }

    // Tap (no committed direction → movement stayed under the 8px threshold) → edit.
    if (directionRef.current === "undecided") {
      onEdit();
    }

    directionRef.current = "undecided";
    offsetRef.current = 0;
    setOffsetX(0);
  }

  if (committed) return null;

  const progress = Math.min(1, offsetX / COMMIT_THRESHOLD);

  return (
    <div className="relative rounded-xl" style={{ overflow: "hidden" }}>
      {/* Green hint background */}
      <div
        className="absolute inset-0 rounded-xl flex items-center justify-start px-4"
        style={{
          background: `color-mix(in srgb, ${DONE_COLOR} ${Math.round(progress * 28)}%, transparent)`,
          border: `1.5px solid color-mix(in srgb, ${DONE_COLOR} ${Math.round(progress * 70)}%, transparent)`,
          transition: dragging.current ? "none" : "all 0.25s ease",
        }}
      >
        {offsetX > 8 && (
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{
              color: DONE_COLOR,
              opacity: progress,
              fontFamily: "'Space Mono', monospace",
              transition: dragging.current ? "none" : "opacity 0.15s",
            }}
          >
            Got it
          </span>
        )}
      </div>

      {/* Sliding card */}
      <div
        className="relative px-4 py-3.5 rounded-xl select-none"
        style={{
          background: committing ? `${DONE_COLOR}22` : "var(--t-card)",
          border: "1px solid rgba(255,255,255,0.05)",
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current ? "none" : "transform 0.35s cubic-bezier(0.34,1.3,0.64,1), background 0.2s",
          willChange: "transform",
          cursor: offsetX > 4 ? "grabbing" : "default",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <p className="text-lg text-white/85 leading-snug break-words">{item.name}</p>
      </div>
    </div>
  );
}

// ── Item editor — bottom sheet (tap an item to edit name + store) ───────────

const STORE_OPTIONS = ["Costco", "Walmart", "Fred Meyer", "Amazon", "WinCo", "Other"];

function ErrandEditorSheet({
  item,
  onSave,
  onCancel,
}: {
  item: ErrandItem;
  onSave: (name: string, store: string) => void;
  onCancel: () => void;
}) {
  const [name, setName]   = useState(item.name);
  // Pre-select the saved store if it matches an option; otherwise leave unset.
  const [store, setStore] = useState(STORE_OPTIONS.includes(item.store) ? item.store : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const canSave = name.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onCancel}
      data-testid="errand-editor-overlay"
    >
      <div
        className="w-full rounded-t-2xl"
        style={{
          background: "var(--t-surface)",
          borderTop: "1px solid var(--t-border)",
          padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
          animation: "slide-up 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--t-text6)", fontFamily: "'Space Mono', monospace" }}
        >
          Edit item
        </p>

        {/* Item name */}
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canSave) onSave(name.trim(), store); }}
          placeholder="Item name"
          className="w-full rounded-xl px-3.5 py-3 text-base outline-none mb-4"
          style={{
            background: "var(--t-input-bg)",
            border: "1px solid var(--t-border-md)",
            color: "var(--t-text2)",
          }}
          data-testid="errand-editor-name"
        />

        {/* Store pills */}
        <p className="text-xs mb-2" style={{ color: "var(--t-text5)" }}>Store</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {STORE_OPTIONS.map((s) => {
            const active = store === s;
            return (
              <button
                key={s}
                onClick={() => setStore(active ? "" : s)}
                className="px-3.5 py-2 rounded-full text-sm font-medium transition-all duration-150"
                style={
                  active
                    ? { background: TEAL, color: "#000", border: `1.5px solid ${TEAL}` }
                    : { background: "transparent", color: "var(--t-text4)", border: "1.5px solid rgba(255,255,255,0.15)" }
                }
                data-testid={`errand-editor-store-${s.toLowerCase().replace(/ /g, "-")}`}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={{ background: "var(--t-el-med)", color: "var(--t-text3)" }}
            data-testid="errand-editor-cancel"
          >
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave(name.trim(), store)}
            disabled={!canSave}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={{
              background: canSave ? TEAL : "var(--t-el-low)",
              color: canSave ? "#000" : "var(--t-text6)",
            }}
            data-testid="errand-editor-save"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ShoppingList() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [items, setItems]           = useState<ErrandItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeStore, setActiveStore] = useState("All");
  const [editingItem, setEditingItem] = useState<ErrandItem | null>(null);
  const [input, setInput]           = useState("");
  const [isRecording, setIsRecording]   = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const scrollRef        = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<BlobPart[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const holdTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef    = useRef(false);

  useGutterScroll(scrollRef);

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch(`${JARVIS_URL}/errands`, {
        headers: { Authorization: `Bearer ${REMI_API_KEY}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      setItems((data.items as ErrandItem[]) ?? []);
    } catch (e) {
      console.error("[ShoppingList] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Derived store chips — "All" always first
  const stores = useMemo(() => {
    const s = new Set(items.map((i) => i.store));
    return ["All", ...Array.from(s).sort()];
  }, [items]);

  // Reset chip if selected store disappears from data
  useEffect(() => {
    if (activeStore !== "All" && !stores.includes(activeStore)) {
      setActiveStore("All");
    }
  }, [stores, activeStore]);

  // Filtered + grouped
  const filteredItems = useMemo(
    () => (activeStore === "All" ? items : items.filter((i) => i.store === activeStore)),
    [items, activeStore],
  );

  const groupedByWho = useMemo(() => {
    const groups: Record<string, ErrandItem[]> = {};
    for (const item of filteredItems) {
      const who = item.who || "Me";
      (groups[who] ??= []).push(item);
    }
    return groups;
  }, [filteredItems]);

  const whoOrder = useMemo(
    () =>
      Object.keys(groupedByWho).sort((a, b) => {
        if (a === "Me") return -1;
        if (b === "Me") return 1;
        return a.localeCompare(b);
      }),
    [groupedByWho],
  );

  const multipleWho = whoOrder.length > 1;

  // Mark done — optimistic removal + background PATCH
  const handleDone = useCallback((item: ErrandItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    fetch(`${JARVIS_URL}/errands/${item.id}/done`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${REMI_API_KEY}` },
    }).catch((err) => console.error("[ShoppingList] PATCH done failed:", err));
  }, []);

  // Save an edited item — optimistic local update, then PATCH the fields.
  // NOTE: the backend PATCH /errands/{id} (name/store) endpoint does NOT exist
  // yet — only /errands/{id}/done. The optimistic update shows the change now;
  // it will persist to Notion once that endpoint is added (see report).
  const handleSaveEdit = useCallback((id: string, name: string, store: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name, store } : i)));
    setEditingItem(null);
    fetch(`${JARVIS_URL}/errands/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, store }),
    }).catch((err) => console.error("[ShoppingList] PATCH edit failed:", err));
  }, []);

  // Send text to /remi then refresh
  const sendToRemi = useCallback(
    async (text: string) => {
      try {
        await fetch(`${JARVIS_URL}/remi`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${REMI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: text, user_id: "shopping-list" }),
        });
        await fetchItems();
      } catch (err) {
        console.error("[ShoppingList] /remi send failed:", err);
      }
    },
    [fetchItems],
  );

  // Amber mic — 150ms hold-to-record (matches MainChat pattern)
  function handleMicDown() {
    if (isRecording) return;
    holdActiveRef.current = false;
    holdTimerRef.current = setTimeout(async () => {
      holdActiveRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!holdActiveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
          : "audio/ogg";
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setIsRecording(false);
          setTimeout(async () => {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            audioChunksRef.current = [];
            if (blob.size === 0) return;
            setIsProcessing(true);
            try {
              const fd = new FormData();
              const ext = mimeType.includes("mp4") ? "mp4"
                : mimeType.includes("ogg") ? "ogg" : "webm";
              fd.append("file", blob, `recording.${ext}`);
              fd.append("model", "whisper-1");
              fd.append("language", "en");
              const tr = await fetch(`${JARVIS_URL}/transcribe`, {
                method: "POST",
                headers: { Authorization: `Bearer ${REMI_API_KEY}` },
                body: fd,
              });
              if (!tr.ok) throw new Error(`Transcribe ${tr.status}`);
              const { text } = await tr.json();
              if (text?.trim()) await sendToRemi(text.trim());
            } catch (err) {
              console.error("[ShoppingList] mic transcribe failed:", err);
            } finally {
              setIsProcessing(false);
            }
          }, 800);
        };
        recorder.start(100);
        setIsRecording(true);
      } catch {
        // mic permission denied — silent
      }
    }, 150);
  }

  function handleMicUp() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    holdActiveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }

  async function handleTextSubmit() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setIsProcessing(true);
    try {
      await sendToRemi(text);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg-deep)" }}>

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader
        title="Shopping List"
        color={TEAL}
        onMenu={() => setMenuOpen(true)}
        right={
          <button
            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => { setLoading(true); fetchItems(); }}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} style={{ color: loading ? TEAL : undefined }} />
          </button>
        }
      />

      {/* Store filter chips */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <div
          className="flex gap-2 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {stores.map((store) => {
            const active = activeStore === store;
            return (
              <button
                key={store}
                onClick={() => setActiveStore(store)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150"
                style={
                  active
                    ? { background: TEAL, color: "#000", border: `1.5px solid ${TEAL}` }
                    : {
                        background: "transparent",
                        color: "var(--t-text4)",
                        border: "1.5px solid rgba(255,255,255,0.15)",
                      }
                }
              >
                {store}
              </button>
            );
          })}
        </div>
      </div>

      {/* Swipe hint */}
      <div className="px-4 py-1.5 border-b border-white/5 shrink-0">
        <p className="text-center text-xs" style={{ color: "var(--t-text8)", fontFamily: "'Space Mono', monospace" }}>
          → swipe right to mark done
        </p>
      </div>

      {/* List */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
      >
        {loading && (
          <div className="flex items-center justify-center gap-2 py-14">
            <Loader2 size={18} className="animate-spin" style={{ color: TEAL }} />
            <span className="text-sm text-white/40">Loading…</span>
          </div>
        )}

        {!loading && filteredItems.length === 0 && (
          <p className="text-center text-sm py-14" style={{ color: "var(--t-text6)" }}>
            Nothing here.
          </p>
        )}

        {!loading && whoOrder.length > 0 && (
          <div className="space-y-5">
            {whoOrder.map((who) => (
              <div key={who} className="space-y-1.5">
                {multipleWho && (
                  <p
                    className="text-xs font-medium tracking-widest uppercase px-1 pb-0.5"
                    style={{ color: "var(--t-text6)" }}
                  >
                    {who}
                  </p>
                )}
                <div className="space-y-1.5">
                  {groupedByWho[who].map((item) => (
                    <SwipeableErrandCard
                      key={item.id}
                      item={item}
                      onDone={() => handleDone(item)}
                      onEdit={() => setEditingItem(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="shrink-0 border-t border-white/5 px-4"
        style={{
          background:    "var(--t-surface)",
          paddingTop:    "10px",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
        }}
      >
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTextSubmit(); }}
            placeholder="Add item or ask Jarvis…"
            className="flex-1 bg-transparent outline-none text-base placeholder:text-white/25"
            style={{ color: "var(--t-text2)", border: "none" }}
          />
          {/* Amber mic — single, right side, standard pattern */}
          <button
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150"
            style={{
              background: isRecording ? "#ef444422" : "#f59e0b14",
              border: `1.5px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
              marginRight: "20px",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
              handleMicDown();
            }}
            onPointerUp={handleMicUp}
            onPointerCancel={handleMicUp}
          >
            {isProcessing
              ? <Loader2 size={16} className="animate-spin" style={{ color: "#f59e0b" }} />
              : isRecording
              ? <MicOff size={16} style={{ color: "#ef4444" }} />
              : <Mic size={16} style={{ color: "#f59e0b" }} />}
          </button>
        </div>
      </div>

      {/* Tap-to-edit bottom sheet */}
      {editingItem && (
        <ErrandEditorSheet
          item={editingItem}
          onSave={(name, store) => handleSaveEdit(editingItem.id, name, store)}
          onCancel={() => setEditingItem(null)}
        />
      )}

    </div>
  );
}
