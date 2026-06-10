import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Menu, Sparkles, Mic, MicOff, Loader2, X, Lock, ArrowLeft, BookOpen } from "lucide-react";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };

interface JournalEntry {
  timestamp: string;
  text: string;
}

// ── Date parser ───────────────────────────────────────────────────────────────

function parseEntryDate(timestamp: string): string {
  const isoMatch = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
    if (!isNaN(d.getTime()))
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const humanMatch = timestamp.match(/^([A-Za-z]+ \d+)/);
  if (humanMatch) return humanMatch[1];
  return timestamp.slice(0, 10);
}

// ── Date scroll bar (contacts A–Z pattern) ───────────────────────────────────

function DateScrollBar({
  dates,
  listRef,
}: {
  dates: string[];
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [tooltipY, setTooltipY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  if (dates.length < 2) return null;

  function compute(clientY: number) {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const idx = Math.round(ratio * (dates.length - 1));
    setDragIdx(idx);
    setTooltipY(clientY - rect.top);
    const el = listRef.current?.querySelector(
      `[data-date="${dates[idx]}"]`
    ) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "start" });
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        right: 4,
        top: 16,
        bottom: 16,
        width: 32,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        touchAction: "none",
        userSelect: "none",
        cursor: "pointer",
        zIndex: 2,
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        compute(e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0) return;
        compute(e.clientY);
      }}
      onPointerUp={() => {
        setTimeout(() => setDragIdx(null), 1000);
      }}
    >
      {/* Floating tooltip */}
      {dragIdx !== null && (
        <div
          style={{
            position: "absolute",
            right: 36,
            top: Math.max(0, tooltipY - 14),
            background: "rgba(20,20,20,0.96)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--t-text2)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            backdropFilter: "blur(6px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          }}
        >
          {dates[dragIdx]}
        </div>
      )}

      {/* Date labels — day number only to stay compact */}
      {dates.map((d, i) => {
        const dayNum = d.match(/\d+$/)?.[0] ?? d;
        return (
          <span
            key={d}
            style={{
              fontSize: 9,
              lineHeight: 1,
              fontWeight: dragIdx === i ? 700 : 400,
              color: dragIdx === i ? "#f59e0b" : "rgba(255,255,255,0.25)",
              transition: "color 0.1s",
            }}
          >
            {dayNum}
          </span>
        );
      })}
    </div>
  );
}

// ── PIN gate ──────────────────────────────────────────────────────────────────

function PinGate({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const [checking, setChecking] = useState(false);
  const shakeKey = useRef(0);

  const validatePin = useCallback(async (pin: string) => {
    setChecking(true);
    try {
      const res = await fetch(`${JARVIS_URL}/journal_write`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", pin }),
      });
      const data = await res.json();
      if (data.ok) {
        onUnlock(pin);
      } else {
        shakeKey.current += 1;
        setShaking(true);
        setTimeout(() => { setShaking(false); setDigits([]); }, 600);
      }
    } catch {
      shakeKey.current += 1;
      setShaking(true);
      setTimeout(() => { setShaking(false); setDigits([]); }, 600);
    } finally {
      setChecking(false);
    }
  }, [onUnlock]);

  const handleDigit = useCallback((d: string) => {
    if (checking) return;
    setDigits((prev) => {
      if (prev.length >= 4) return prev;
      const next = [...prev, d];
      if (next.length === 4) {
        setTimeout(() => validatePin(next.join("")), 60);
      }
      return next;
    });
  }, [checking, validatePin]);

  const handleDelete = useCallback(() => {
    if (!checking) setDigits((prev) => prev.slice(0, -1));
  }, [checking]);

  const pad = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh", background: "var(--t-bg)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <p style={{ color: "#4ade80", fontSize: 26, fontWeight: 700, marginBottom: 36, letterSpacing: 2 }}>
        Journal
      </p>

      {/* 4 dots */}
      <div
        key={shakeKey.current}
        className={shaking ? "pin-shake" : ""}
        style={{ display: "flex", gap: 18, marginBottom: 48 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: 16, height: 16, borderRadius: "50%",
              background: i < digits.length ? "#4ade80" : "var(--t-el-med)",
              border: "2px solid var(--t-border-lg)",
              transition: "background 0.12s",
            }}
          />
        ))}
      </div>

      {/* Number pad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 76px)", gap: 12 }}>
        {pad.map((k, i) => {
          if (k === "") return <div key={i} />;
          return (
            <button
              key={i}
              onClick={() => k === "⌫" ? handleDelete() : handleDigit(k)}
              disabled={checking}
              style={{
                height: 76, borderRadius: 18,
                fontSize: k === "⌫" ? 20 : 24, fontWeight: 600,
                color: k === "⌫" ? "var(--t-text5)" : "var(--t-text)",
                background: "var(--t-el-low)",
                border: "1px solid var(--t-border-md)",
                cursor: checking ? "not-allowed" : "pointer",
                transition: "background 0.1s",
                opacity: checking ? 0.5 : 1,
              }}
            >
              {k}
            </button>
          );
        })}
      </div>

      {checking && (
        <p style={{ marginTop: 28, color: "var(--t-text6)", fontSize: 13 }}>Checking…</p>
      )}
    </div>
  );
}

// ── Main journal screen ───────────────────────────────────────────────────────

export default function Journal() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  // getUserMedia called once at mount — never inside a touch/pointer handler
  const micStreamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const pointerStartYRef = useRef<number>(0);
  const micStartTimeRef = useRef<number>(0);
  const cancelledRef = useRef(false);
  const entriesListRef = useRef<HTMLDivElement>(null);

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

  const fetchEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      const res = await fetch(`${JARVIS_URL}/journal_entries`, { headers: AUTH_HEADERS });
      const data = await res.json();
      if (Array.isArray(data.entries)) setEntries(data.entries);
    } catch {
      // silent
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  // Fetch entries when pin is first set
  useEffect(() => {
    if (pin) fetchEntries();
  }, [pin, fetchEntries]);

  // Refresh entries whenever the overlay is opened
  useEffect(() => {
    if (showEntries && pin) fetchEntries();
  }, [showEntries, pin, fetchEntries]);

  // Entries sorted oldest-first for the overlay
  const sortedEntries = useMemo(() => [...entries].reverse(), [entries]);

  // Unique dates in oldest-first order for the scroll bar
  const uniqueDates = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of sortedEntries) {
      const d = parseEntryDate(e.timestamp);
      if (!seen.has(d)) { seen.add(d); result.push(d); }
    }
    return result;
  }, [sortedEntries]);

  const handleSubmit = useCallback(async (entryText: string) => {
    if (!entryText.trim() || !pin) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${JARVIS_URL}/journal_write`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ text: entryText.trim(), pin }),
      });
      const data = await res.json();
      if (data.ok) {
        setEntries((prev) => [{ timestamp: data.timestamp, text: entryText.trim() }, ...prev]);
        setText("");
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }, [pin]);

  const handleAnalyze = useCallback(async () => {
    if (!pin || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`${JARVIS_URL}/journal_analyze`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || "No analysis available.");
    } catch {
      setAnalysis("Failed to connect. Check your connection and try again.");
    } finally {
      setAnalyzing(false);
    }
  }, [pin, analyzing]);

  // Start recording from pre-mounted stream — synchronous, no getUserMedia call.
  // Transcript always goes to text input field; user reviews and taps Send.
  function startMediaRecording() {
    if (isRecording) return;
    if (!micStreamRef.current) {
      setRecordingError("Microphone not ready — try again.");
      return;
    }
    setRecordingError(null);
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
          const ext = mimeType.includes("mp4") ? "mp4" : "webm";
          const formData = new FormData();
          formData.append("file", blob, `audio.${ext}`);
          formData.append("model", "whisper-1");
          const resp = await fetch(`${JARVIS_URL}/transcribe`, {
            method: "POST",
            headers: { Authorization: `Bearer ${REMI_API_KEY}` },
            body: formData,
          });
          const json = await resp.json();
          const transcript = (json.text || "").trim();
          if (transcript) {
            setText(transcript);
            inputRef.current?.focus();
          } else {
            setRecordingError("Nothing captured — try again.");
          }
        } catch {
          setRecordingError("Transcription failed — check connection.");
        } finally {
          setIsProcessing(false);
        }
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

  if (!pin) {
    return <PinGate onUnlock={(p) => setPin(p)} />;
  }

  return (
    <div className="flex flex-col" style={{ height: "100dvh", overflow: "hidden", background: "var(--t-bg)", color: "var(--t-text)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Header */}
      <div
        className="flex items-center px-4 py-4 border-b border-white/5 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        {/* Left: hamburger */}
        <div style={{ flex: 1 }}>
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Center: title */}
        <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: "#4ade80" }}>
          Journal
        </span>

        {/* Right: Entries + Find Patterns */}
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEntries(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: "rgba(74,222,128,0.10)",
                color: "#4ade80",
                border: "1px solid rgba(74,222,128,0.18)",
              }}
            >
              <BookOpen size={13} />
              Entries
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing || entries.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: "rgba(74,222,128,0.10)",
                color: (analyzing || entries.length === 0) ? "rgba(74,222,128,0.35)" : "#4ade80",
                border: "1px solid rgba(74,222,128,0.18)",
              }}
            >
              {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {analyzing ? "Analyzing…" : "Find Patterns"}
            </button>
          </div>
        </div>
      </div>

      {/* Main body — clean capture screen, no entries shown */}
      <div className="flex-1" />

      {/* Input bar */}
      <div
        className="shrink-0 px-4 pt-3 border-t border-white/5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 16px)", background: "var(--t-bg)" }}
      >
        {recordingError && (
          <p className="text-xs text-red-400/80 mb-1.5 text-center">{recordingError}</p>
        )}
        {isLocked && (
          <div className="flex items-center justify-between gap-3 mb-2 px-1">
            <button type="button" onClick={handleMicCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
              <X size={12} /> Cancel
            </button>
            <div className="flex items-center gap-1.5">
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="wave-bar w-0.5 rounded-full" style={{ height: "14px", background: "#ef4444", animationDelay: `${(i-1)*0.1}s` }} />
              ))}
              <Lock size={12} className="ml-1" style={{ color: "#f59e0b" }} />
            </div>
            <button type="button" onClick={handleMicSend}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
              style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: "#4ade80" }}>
              Send ↑
            </button>
          </div>
        )}
        {(isRecording && !isLocked) && (
          <div className="flex items-center justify-center gap-2 mb-2 h-5">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="wave-bar w-0.5 rounded-full" style={{ height: "14px", background: "#ef4444", animationDelay: `${(i-1)*0.1}s` }} />
            ))}
            <span className="text-xs ml-1" style={{ color: "#ef4444" }}>Recording</span>
            <span className="text-xs text-white/25 ml-2">↑ slide to lock</span>
          </div>
        )}
        {/* Grid (not flex): minmax(0,1fr) sizes the input track deterministically so it
            shrinks below content width in one layout pass — flexbox left the input at
            intrinsic width at initial paint on mobile Safari, pushing the mic off the
            right edge until a reflow. Same fix as Session/MainChat. */}
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
          {/* Text input */}
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !submitting && handleSubmit(text)}
            placeholder="Write something…"
            className="min-w-0 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
          />

          {/* Send */}
          <button
            type="button"
            onClick={() => handleSubmit(text)}
            disabled={submitting || !text.trim()}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={{
              background: "#4ade80",
              color: "#000",
              opacity: !text.trim() || submitting ? 0.45 : 1,
            }}
          >
            {submitting ? "…" : "Send"}
          </button>

          {/* Right amber mic — hold 150ms to record, release to transcribe+send, slide up to lock */}
          <button
            type="button"
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 ${isRecording && !isLocked ? "voice-button-recording" : ""}`}
            style={{
              background: isRecording ? "#ef444422" : isProcessing ? "#f59e0b18" : "#f59e0b14",
              border: `1.5px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
              marginRight: "20px",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
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
          >
            {isProcessing ? (
              <Loader2 size={16} className="animate-spin" style={{ color: "#f59e0b" }} />
            ) : isRecording && isLocked ? (
              <Lock size={16} style={{ color: "#f59e0b" }} />
            ) : isRecording ? (
              <MicOff size={16} style={{ color: "#ef4444" }} />
            ) : (
              <Mic size={16} style={{ color: "#f59e0b" }} />
            )}
          </button>
        </div>
      </div>

      {/* ── Entries overlay ─────────────────────────────────────────────────── */}
      {showEntries && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 40,
            background: "var(--t-bg)", display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex", alignItems: "center", flexShrink: 0,
              padding: "16px 16px 16px",
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <button
              onClick={() => setShowEntries(false)}
              style={{
                padding: 8, marginRight: 4, borderRadius: 10,
                color: "var(--t-text5)",
                background: "transparent", border: "none", cursor: "pointer",
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <span
              style={{
                flex: 1, textAlign: "center",
                fontSize: 13, fontWeight: 600, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "#4ade80",
              }}
            >
              Journal Entries
            </span>
            {/* Spacer matching back button width */}
            <div style={{ width: 36 }} />
          </div>

          {/* Content area — scroll container + date scroll bar */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {/* Scroll container */}
            <div
              ref={entriesListRef}
              style={{
                position: "absolute", inset: 0,
                overflowY: "auto",
                padding: "16px 44px 32px 16px",
              }}
            >
              {loadingEntries ? (
                <p style={{ textAlign: "center", padding: "48px 0", color: "var(--t-text7)", fontSize: 14 }}>
                  Loading…
                </p>
              ) : sortedEntries.length === 0 ? (
                <p style={{ textAlign: "center", padding: "56px 0", color: "var(--t-text8)", fontSize: 14 }}>
                  Nothing here yet. Start writing.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {sortedEntries.map((e, i) => {
                    const date = parseEntryDate(e.timestamp);
                    const isFirstOfDate =
                      i === 0 || parseEntryDate(sortedEntries[i - 1].timestamp) !== date;
                    return (
                      <div
                        key={i}
                        {...(isFirstOfDate ? { "data-date": date } : {})}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          paddingBottom: 14,
                          marginBottom: 20,
                        }}
                      >
                        {isFirstOfDate && (
                          <p
                            style={{
                              fontSize: 10, fontWeight: 700,
                              color: "var(--t-text8)",
                              marginBottom: 8, letterSpacing: 1,
                              textTransform: "uppercase",
                            }}
                          >
                            {date}
                          </p>
                        )}
                        <p
                          className="font-mono"
                          style={{ fontSize: 11, color: "var(--t-text7)", marginBottom: 6 }}
                        >
                          {e.timestamp}
                        </p>
                        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--t-text2)" }}>
                          {e.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Date scroll bar */}
            <DateScrollBar dates={uniqueDates} listRef={entriesListRef} />
          </div>
        </div>
      )}

      {/* ── Analysis overlay — slides up from bottom ─────────────────────────── */}
      {analysis !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setAnalysis(null)}
        >
          <div
            className="rounded-t-3xl overflow-hidden menu-slide-in"
            style={{ background: "var(--t-card)", maxHeight: "82vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.14)" }} />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
              <span className="text-sm font-semibold tracking-wide" style={{ color: "#4ade80" }}>
                Pattern Analysis
              </span>
              <button
                onClick={() => setAnalysis(null)}
                className="p-1.5 rounded-full text-white/30 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div
              className="overflow-y-auto px-5 py-5"
              style={{ maxHeight: "calc(82vh - 76px)" }}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--t-text2)" }}>
                {analysis}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
