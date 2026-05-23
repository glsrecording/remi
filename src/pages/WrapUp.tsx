import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, Loader2, CheckCircle } from "lucide-react";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };

interface SessionData {
  active: boolean;
  artist?: string;
  song?: string;
  start_time?: string;
  notes_count?: number;
}

interface NoteEntry {
  text: string;
  type: "note" | "timestamp";
  ts: string;
}

function fmtDuration(startIso: string): string {
  const startMs = new Date(startIso).getTime();
  if (isNaN(startMs)) return "";
  const totalSecs = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "< 1m";
}

export default function WrapUp() {
  const [, navigate] = useLocation();

  const [session, setSession]           = useState<SessionData | null>(null);
  const [notes, setNotes]               = useState<NoteEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [noteText, setNoteText]         = useState("");
  const [isRecording, setIsRecording]   = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLocked, setIsLocked]         = useState(false);
  const [noteAdded, setNoteAdded]       = useState(false);
  const [ending, setEnding]             = useState(false);

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<BlobPart[]>([]);
  const streamRef         = useRef<MediaStream | null>(null);
  const holdTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef     = useRef(false);
  const pointerStartYRef  = useRef<number>(0);
  const notesEndRef       = useRef<HTMLDivElement>(null);

  // Fetch session state and notes once on mount
  useEffect(() => {
    Promise.all([
      fetch(`${JARVIS_URL}/session`, { headers: AUTH_HEADERS })
        .then(r => r.json())
        .catch(() => ({ active: false })),
      fetch(`${JARVIS_URL}/session_notes`, { headers: AUTH_HEADERS })
        .then(r => r.json())
        .catch(() => ({ notes: [] })),
    ]).then(([sessionData, notesData]) => {
      setSession(sessionData as SessionData);
      setNotes(Array.isArray(notesData.notes) ? notesData.notes : []);
      setLoading(false);
    });
  }, []);

  // Auto-scroll capture log when notes update
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  const sendNote = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      const resp = await fetch(`${JARVIS_URL}/session_note`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ note: text.trim() }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setNotes(prev => [...prev, {
          text: text.trim(),
          type: "note" as const,
          ts: data.timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }]);
        setNoteText("");
        setNoteAdded(true);
        setTimeout(() => setNoteAdded(false), 2000);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const handleNoteSubmit = useCallback(() => {
    if (!noteText.trim()) return;
    sendNote(noteText);
    setNoteText("");
  }, [noteText, sendNote]);

  // ── Mic: 150ms hold-to-record ─────────────────────────────────────────────
  function handleMicDown() {
    if (mediaRecorderRef.current) return;
    holdActiveRef.current = false;
    holdTimerRef.current = setTimeout(async () => {
      holdActiveRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!holdActiveRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          streamRef.current?.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          setIsRecording(false);
          setIsLocked(false);
          setIsTranscribing(true);
          // 800ms flush: Safari delivers dataavailable after onstop
          setTimeout(async () => {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            audioChunksRef.current = [];
            mediaRecorderRef.current = null;
            if (blob.size === 0) { setIsTranscribing(false); return; }
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
              setIsTranscribing(false);
              if (transcript) {
                const SILENCE = ["you", "thanks", "thank you", "thank you.", "thanks.", "bye", "bye."];
                if (transcript.length < 8 && SILENCE.includes(transcript.toLowerCase())) return;
                await sendNote(transcript);
              }
            } catch {
              setIsTranscribing(false);
            }
          }, 800);
        };
        recorder.start(100);
        setIsRecording(true);
      } catch {
        // Mic permission denied — fail silently
        setIsRecording(false);
      }
    }, 150);
  }

  function handleMicUp() {
    if (isLocked) return;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    holdActiveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else if (!mediaRecorderRef.current) {
      setIsRecording(false);
    }
  }

  function handleCancelLocked() {
    setIsLocked(false);
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    holdActiveRef.current = false;
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
    setIsTranscribing(false);
  }

  function handleSendLocked() {
    setIsLocked(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const handleEnd = useCallback(async () => {
    setEnding(true);
    if (session?.active) {
      try {
        await fetch(`${JARVIS_URL}/session_end`, { method: "POST", headers: AUTH_HEADERS });
      } catch {
        // non-fatal
      }
    }
    navigate("/", { replace: true });
  }, [session, navigate]);

  const sessionLabel = session?.artist && session?.song
    ? `${session.artist} — ${session.song}`
    : session?.song || session?.artist || null;

  const duration = session?.start_time ? fmtDuration(session.start_time) : null;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--t-bg)", color: "var(--t-text)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4 border-b border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <button
          onClick={() => navigate("/", { replace: true })}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="text-sm font-semibold tracking-widest uppercase"
          style={{ color: "#f59e0b" }}
        >
          Session Wrap
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 px-5 pt-5 pb-52 space-y-5 overflow-y-auto">

        {/* ── Session summary card ─────────────────────────────────────────── */}
        <div
          className="rounded-2xl px-4 py-4 border"
          style={{
            background: "var(--t-surface)",
            borderColor: session?.active ? "rgba(245,158,11,0.35)" : "var(--t-border)",
          }}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" style={{ color: "#f59e0b" }} />
              <span className="text-sm" style={{ color: "var(--t-text5)" }}>Loading…</span>
            </div>
          ) : session?.active && sessionLabel ? (
            <>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "#f59e0b" }}>
                Active Session
              </p>
              <p className="text-base font-semibold" style={{ color: "var(--t-text)" }}>
                🎵 {sessionLabel}
              </p>
              <div className="flex gap-6 mt-3">
                {duration && (
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "var(--t-text6)" }}>Duration</p>
                    <p className="text-sm font-mono font-semibold" style={{ color: "var(--t-text)" }}>
                      {duration}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs mb-0.5" style={{ color: "var(--t-text6)" }}>Notes</p>
                  <p className="text-sm font-mono font-semibold" style={{ color: "var(--t-text)" }}>
                    {notes.length}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--t-text5)" }}>No active session</p>
          )}
        </div>

        {/* ── Capture log ──────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--t-text6)" }}>
            Capture Log
          </p>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--t-surface)", borderColor: "var(--t-border)" }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--t-text6)" }} />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--t-text6)" }}>
                Nothing captured this session
              </p>
            ) : (
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {notes.map((n, i) => (
                  <div
                    key={i}
                    className="flex gap-3 py-2 px-3 rounded-lg"
                    style={{ background: "var(--t-el-low)" }}
                  >
                    <span
                      className="text-xs font-mono mt-0.5 shrink-0"
                      style={{ color: n.type === "timestamp" ? "#f59e0b" : "#4ade80" }}
                    >
                      {n.ts}
                    </span>
                    <p className="text-sm leading-snug" style={{ color: "var(--t-text3)" }}>
                      {n.text}
                    </p>
                  </div>
                ))}
                <div ref={notesEndRef} />
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Fixed bottom: closing note + end session button ────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--t-bg)",
          zIndex: 10,
          padding: "12px 16px 48px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Lock bar */}
        {isLocked && (
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={handleCancelLocked}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: "#ef444420", border: "1px solid #ef444440", color: "#ef4444" }}
            >
              ✕ Cancel
            </button>
            <span className="text-xs" style={{ color: "#ef4444" }}>🔒 Recording</span>
            <button
              type="button"
              onClick={handleSendLocked}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: "#f59e0b20", border: "1px solid #f59e0b40", color: "#f59e0b" }}
            >
              Send ↑
            </button>
          </div>
        )}

        {/* Closing note input row */}
        <div className="flex gap-2 items-center mb-3">
          {isRecording ? (
            <div
              className="flex-1 flex items-center px-4 rounded-xl record-zone"
              style={{ background: "#f59e0b26", border: "1.5px solid #f59e0b", minHeight: "42px" }}
            >
              <span style={{ color: "#f59e0b", fontSize: "0.875rem", fontStyle: "italic" }}>
                Recording…
              </span>
            </div>
          ) : isTranscribing ? (
            <div
              className="flex-1 flex items-center px-4 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                minHeight: "42px",
              }}
            >
              <Loader2 size={14} className="animate-spin mr-2" style={{ color: "#f59e0b" }} />
              <span style={{ color: "#f59e0b", fontSize: "0.875rem", fontStyle: "italic" }}>
                Transcribing…
              </span>
            </div>
          ) : (
            <input
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNoteSubmit()}
              placeholder="Anything to add before closing out?"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
          )}

          {/* Amber hold-to-record mic */}
          <button
            type="button"
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: isRecording ? "#f59e0b" : "#f59e0b14",
              border: `1.5px solid ${isRecording ? "#f59e0b" : "#f59e0b50"}`,
              transform: isRecording ? "scale(1.15)" : "scale(1)",
              transition: "all 0.1s ease",
              marginRight: "20px",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
              pointerStartYRef.current = e.clientY;
              if (isRecording || isTranscribing) return;
              setIsRecording(true);
              handleMicDown();
            }}
            onPointerMove={(e) => {
              if (!isRecording || isLocked) return;
              if (pointerStartYRef.current - e.clientY > 60) setIsLocked(true);
            }}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
            data-testid="button-voice"
          >
            {isTranscribing
              ? <Loader2 size={16} className="animate-spin" style={{ color: "#f59e0b" }} />
              : <Mic size={16} style={{ color: isRecording ? "#000" : "#f59e0b" }} />
            }
          </button>
        </div>

        {/* "Added" confirmation */}
        {noteAdded && (
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <CheckCircle size={13} style={{ color: "#4ade80" }} />
            <span className="text-xs" style={{ color: "#4ade80" }}>Added</span>
          </div>
        )}

        {/* End Session / Done button */}
        <button
          onClick={handleEnd}
          disabled={ending}
          className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
          style={{
            background: session?.active ? "#f59e0b" : "rgba(245,158,11,0.12)",
            color: session?.active ? "#000" : "#f59e0b",
            border: session?.active ? "none" : "1px solid rgba(245,158,11,0.3)",
          }}
          data-testid="button-end-session"
        >
          {ending ? "Ending…" : session?.active ? "End Session" : "Done"}
        </button>
      </div>
    </div>
  );
}
