import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, Loader2, CheckCircle } from "lucide-react";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };

// Design-system context colors (mirror design-system.css; hex so the `color + "26"`
// alpha-concat glow pattern works — mode-independent, safe in light + dark).
const TEAL  = "#3dd6b0";  // --color-studio — screen identity / summary / notes
const GREEN = "#5bc468";  // --color-done   — "Added" confirmation
const AMBER = "#f5a623";  // --color-tasks  — mic / voice capture / timestamp
const ALERT = "#ef4444";  // recording cancel (semantic, mode-independent)

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
  const [inputFocused, setInputFocused] = useState(false);  // teal pill glow on focus

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
      style={{ background: "var(--surface-base)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <button
          onClick={() => navigate("/", { replace: true })}
          className="p-2 rounded-xl hover:bg-white/5 transition-colors"
          style={{ color: TEAL }}
          data-testid="button-back"
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color: TEAL, fontFamily: "'Space Mono', monospace" }}
        >
          Wrap Up
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 px-5 pt-5 pb-52 space-y-5 overflow-y-auto">

        {/* ── Session summary card — teal hero ─────────────────────────────── */}
        <div
          className="px-4 py-4"
          style={{
            background: "var(--surface-elevated)",
            borderRadius: "var(--radius-lg)",
            borderLeft: `3px solid ${TEAL}`,
            borderTop: "1px solid var(--border-subtle)",
            borderRight: "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
            boxShadow: session?.active ? `0 0 18px ${TEAL}33` : `0 0 12px ${TEAL}1a`,
          }}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" style={{ color: TEAL }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading…</span>
            </div>
          ) : session?.active && sessionLabel ? (
            <>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: TEAL, fontFamily: "'Space Mono', monospace" }}>
                Active Session
              </p>
              <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                🎵 {sessionLabel}
              </p>
              <div className="flex gap-6 mt-3">
                {duration && (
                  <div>
                    <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Duration</p>
                    <p className="text-sm font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                      {duration}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Notes</p>
                  <p className="text-sm font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                    {notes.length}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No active session</p>
          )}
        </div>

        {/* ── Capture log — notes captured (teal) ──────────────────────────── */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: TEAL, boxShadow: `0 0 8px ${TEAL}66` }} />
            <span
              className="font-bold uppercase flex-1"
              style={{ color: TEAL, fontFamily: "'Space Mono', monospace", fontSize: "var(--font-size-sm)", letterSpacing: "0.08em" }}
            >
              Capture Log
            </span>
            {notes.length > 0 && (
              <span
                className="font-mono rounded-full shrink-0"
                style={{ background: `${TEAL}1f`, color: TEAL, fontSize: "var(--font-size-xs)", padding: "2px 8px" }}
              >
                {notes.length}
              </span>
            )}
          </div>
          <div
            className="overflow-hidden"
            style={{ background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin" style={{ color: TEAL }} />
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
                Nothing captured this session
              </p>
            ) : (
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {notes.map((n, i) => (
                  <div
                    key={i}
                    className="flex gap-3 py-2 px-3"
                    style={{
                      background: "var(--surface-elevated)",
                      borderRadius: "var(--radius-md)",
                      borderLeft: `2px solid ${n.type === "timestamp" ? AMBER : TEAL}`,
                    }}
                  >
                    <span
                      className="text-xs font-mono mt-0.5 shrink-0"
                      style={{ color: n.type === "timestamp" ? AMBER : TEAL }}
                    >
                      {n.ts}
                    </span>
                    <p className="text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
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
        className="remi-panel-bar"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--surface-base)",
          zIndex: 10,
          padding: "12px 16px 48px",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {/* Lock bar */}
        {isLocked && (
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={handleCancelLocked}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: `${ALERT}20`, border: `1px solid ${ALERT}40`, color: ALERT }}
            >
              ✕ Cancel
            </button>
            <span className="text-xs" style={{ color: ALERT }}>🔒 Recording</span>
            <button
              type="button"
              onClick={handleSendLocked}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ background: `${AMBER}20`, border: `1px solid ${AMBER}40`, color: AMBER }}
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
              style={{ background: `${AMBER}26`, border: `1.5px solid ${AMBER}`, minHeight: "42px" }}
            >
              <span style={{ color: AMBER, fontSize: "0.875rem", fontStyle: "italic" }}>
                Recording…
              </span>
            </div>
          ) : isTranscribing ? (
            <div
              className="flex-1 flex items-center px-4 rounded-xl"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border-default)",
                minHeight: "42px",
              }}
            >
              <Loader2 size={14} className="animate-spin mr-2" style={{ color: AMBER }} />
              <span style={{ color: AMBER, fontSize: "0.875rem", fontStyle: "italic" }}>
                Transcribing…
              </span>
            </div>
          ) : (
            <input
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNoteSubmit()}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Anything to add before closing out?"
              className="flex-1 px-4 py-2.5 text-sm outline-none placeholder:opacity-50"
              style={{
                background: "var(--surface-elevated)",
                borderRadius: "var(--radius-pill)",
                color: "var(--text-primary)",
                // Teal pill, brightens + glows on focus (MainChat pattern).
                border: inputFocused ? `1.5px solid ${TEAL}` : `1.5px solid ${TEAL}66`,
                boxShadow: inputFocused ? `0 0 16px ${TEAL}40, inset 0 0 10px ${TEAL}1f` : "none",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
            />
          )}

          {/* Amber hold-to-record mic */}
          <button
            type="button"
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: isRecording ? AMBER : `${AMBER}14`,
              border: `1.5px solid ${isRecording ? AMBER : `${AMBER}50`}`,
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
              ? <Loader2 size={16} className="animate-spin" style={{ color: AMBER }} />
              : <Mic size={16} style={{ color: isRecording ? "#1a1200" : AMBER }} />
            }
          </button>
        </div>

        {/* "Added" confirmation */}
        {noteAdded && (
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <CheckCircle size={13} style={{ color: GREEN }} />
            <span className="text-xs" style={{ color: GREEN }}>Added</span>
          </div>
        )}

        {/* End Session / Done button — teal filled + glow when active */}
        <button
          onClick={handleEnd}
          disabled={ending}
          className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
          style={
            session?.active
              ? { background: TEAL, color: "#08110f", border: "none", boxShadow: `0 0 20px ${TEAL}55` }
              : { background: "transparent", color: TEAL, border: `1.5px solid ${TEAL}80`, boxShadow: "none" }
          }
          data-testid="button-end-session"
        >
          {ending ? "Ending…" : session?.active ? "End Session" : "Done"}
        </button>
      </div>
    </div>
  );
}
