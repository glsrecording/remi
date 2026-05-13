import { useState, useRef, useCallback, useEffect } from "react";
import { Menu, Sparkles, Mic, MicOff, Loader2, X, Lock } from "lucide-react";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };

interface JournalEntry {
  timestamp: string;
  text: string;
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
        justifyContent: "center", minHeight: "100vh", background: "#1a1a1a",
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
              background: i < digits.length ? "#4ade80" : "rgba(255,255,255,0.12)",
              border: "2px solid rgba(255,255,255,0.15)",
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
                color: k === "⌫" ? "rgba(255,255,255,0.35)" : "#e5e5e5",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
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
        <p style={{ marginTop: 28, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Checking…</p>
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

  useEffect(() => {
    if (pin) fetchEntries();
  }, [pin, fetchEntries]);

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
    <div className="flex flex-col min-h-screen" style={{ background: "#1a1a1a", color: "#e5e5e5" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 border-b border-white/5 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: "#4ade80" }}>
          Journal
        </span>
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

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loadingEntries ? (
          <p className="text-sm text-white/25 text-center py-12">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-white/20 text-center py-14">Nothing here yet. Start writing.</p>
        ) : (
          <div className="space-y-5 pb-2">
            {entries.map((e, i) => (
              <div
                key={i}
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 14 }}
              >
                <p className="text-xs font-mono mb-1.5" style={{ color: "rgba(255,255,255,0.22)" }}>
                  {e.timestamp}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
                  {e.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="shrink-0 px-4 pt-3 border-t border-white/5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)", background: "#1a1a1a" }}
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
        <div className="flex gap-2 items-center">
          {/* Text input */}
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !submitting && handleSubmit(text)}
            placeholder="Write something…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
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
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 ${isRecording && !isLocked ? "voice-button-recording" : ""}`}
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

      {/* Analysis overlay — slides up from bottom */}
      {analysis !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={() => setAnalysis(null)}
        >
          <div
            className="rounded-t-3xl overflow-hidden menu-slide-in"
            style={{ background: "#1e1e1e", maxHeight: "82vh" }}
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
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.82)" }}>
                {analysis}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
