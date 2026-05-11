import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Menu, Square, Coffee, Play, DollarSign, Mic, MicOff, Lock, Loader2, X } from "lucide-react";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };
const HOURLY_RATE_KEY = "remi_session_hourly_rate";
const DAY_RATE_KEY    = "remi_session_day_rate";
const RATE_TYPE_KEY   = "remi_session_rate_type";

type RateType = "hourly" | "day_rate" | "project_rate" | "no_charge";
const RATE_TYPE_LABELS: Record<RateType, string> = {
  hourly: "Hourly",
  day_rate: "Day Rate",
  project_rate: "Project",
  no_charge: "No Charge",
};

interface SessionState {
  active: boolean;
  artist?: string;
  song?: string;
  song_page_id?: string;
}

interface NoteEntry {
  text: string;
  type: "note" | "timestamp";
  ts: string;
}

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Session() {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<SessionState>({ active: false });
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [hourlyRate, setHourlyRate] = useState<number>(() => {
    const saved = localStorage.getItem(HOURLY_RATE_KEY);
    return saved ? parseFloat(saved) : 75;
  });
  const [rateInput, setRateInput] = useState(String(hourlyRate));
  const [editingRate, setEditingRate] = useState(false);
  const [rateType, setRateType] = useState<RateType>(() =>
    (localStorage.getItem(RATE_TYPE_KEY) as RateType) || "hourly"
  );
  const [dayRateAmount, setDayRateAmount] = useState<number>(() => {
    const saved = localStorage.getItem(DAY_RATE_KEY);
    return saved ? parseFloat(saved) : 400;
  });
  const [dayRateInput, setDayRateInput] = useState(() =>
    String(parseFloat(localStorage.getItem(DAY_RATE_KEY) || "400"))
  );
  const [editingDayRate, setEditingDayRate] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [startArtist, setStartArtist] = useState("");
  const [startSong, setStartSong] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  type MatchState = "idle" | "suggest" | "not_found";
  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [suggestionTitle, setSuggestionTitle] = useState("");
  const [suggestionPageId, setSuggestionPageId] = useState("");
  const [notFoundPrompt, setNotFoundPrompt] = useState("");
  const [noteText, setNoteText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const breakAccumRef = useRef<number>(0);
  const breakStartRef = useRef<number>(0);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const micStartTimeRef = useRef<number>(0);
  const touchStartYRef = useRef<number | null>(null);
  const micCancelledRef = useRef(false);
  const touchEndedRef = useRef(false);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const refetchSession = useCallback(() => {
    fetch(`${JARVIS_URL}/session`, { headers: AUTH_HEADERS })
      .then((r) => r.json())
      .then((data: SessionState) => {
        if (!data || !data.active || (!data.artist && !data.song)) {
          setSession({ active: false });
          setStarting(false);
        } else {
          setSession(data);
          setStarting(false);
        }
      })
      .catch(() => {});
  }, []);

  // Regular 10-second session poll
  useEffect(() => {
    refetchSession();
    const id = setInterval(refetchSession, 10000);
    return () => clearInterval(id);
  }, [refetchSession]);

  // Fast 2-second poll while session is starting (stops once active)
  useEffect(() => {
    if (!starting) return;
    const id = setInterval(refetchSession, 2000);
    return () => clearInterval(id);
  }, [starting, refetchSession]);

  // Poll notes every 10 seconds
  useEffect(() => {
    const poll = () => {
      fetch(`${JARVIS_URL}/session_notes`, { headers: AUTH_HEADERS })
        .then((r) => r.json())
        .then((data: { notes: NoteEntry[] }) => {
          if (Array.isArray(data.notes)) setNotes(data.notes);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll notes
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  // Timer tick
  useEffect(() => {
    if (running && !onBreak) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor(Date.now() / 1000 - startTimeRef.current - breakAccumRef.current));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running, onBreak]);

  const handleStart = useCallback(() => {
    startTimeRef.current = Date.now() / 1000;
    breakAccumRef.current = 0;
    setElapsed(0);
    setRunning(true);
    setOnBreak(false);
  }, []);

  const handleBreak = useCallback(() => {
    if (!running) return;
    if (!onBreak) {
      breakStartRef.current = Date.now() / 1000;
      setOnBreak(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      breakAccumRef.current += Date.now() / 1000 - breakStartRef.current;
      setOnBreak(false);
    }
  }, [running, onBreak]);

  const sendNote = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      const resp = await fetch(`${JARVIS_URL}/session_note`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ note: text.trim() }),
      });
      const data = await resp.json();
      if (resp.ok && data.timestamp) {
        setNotes((prev) => [...prev, { text: text.trim(), type: "note" as const, ts: data.timestamp }]);
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

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  const handleMicTouchStart = useCallback(async (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRecording) return;
    touchStartYRef.current = e.touches[0].clientY;
    micCancelledRef.current = false;
    touchEndedRef.current = false;
    setIsLocked(false);
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const duration = Date.now() - micStartTimeRef.current;
        const cancelled = micCancelledRef.current;
        micCancelledRef.current = false;
        setIsRecording(false);
        if (cancelled || duration < 500) return;
        setIsProcessing(true);
        // 800ms flush: Safari delivers dataavailable after onstop (out of spec).
        setTimeout(async () => {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          audioChunksRef.current = [];
          if (blob.size === 0) { setIsProcessing(false); return; }
          try {
            const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
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
            if (transcript) await sendNote(transcript);
            else setRecordingError("Nothing captured — try again.");
          } catch {
            setRecordingError("Transcription failed — check connection.");
          } finally {
            setIsProcessing(false);
          }
        }, 800);
      };
      recorder.start(100);
      micStartTimeRef.current = Date.now();
      if (touchEndedRef.current) {
        micCancelledRef.current = true;
        recorder.stop();
        mediaRecorderRef.current = null;
        return;
      }
      setIsRecording(true);
    } catch {
      setRecordingError("Microphone permission is blocked or unavailable.");
    }
  }, [isRecording, sendNote]);

  const handleMicTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!isRecording || isLocked || touchStartYRef.current === null) return;
    const deltaY = touchStartYRef.current - e.touches[0].clientY;
    if (deltaY > 60) {
      setIsLocked(true);
    } else if (deltaY < -60) {
      micCancelledRef.current = true;
      setIsLocked(false);
      stopRecorder();
    }
  }, [isRecording, isLocked, stopRecorder]);

  const handleMicTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (isLocked) return;
    if (!isRecording) { touchEndedRef.current = true; return; }
    stopRecorder();
  }, [isRecording, isLocked, stopRecorder]);

  const handleMicCancel = useCallback(() => {
    micCancelledRef.current = true;
    setIsLocked(false);
    stopRecorder();
  }, [stopRecorder]);

  const handleMicSend = useCallback(() => {
    setIsLocked(false);
    stopRecorder();
  }, [stopRecorder]);

  // Safety: reset form after 30s if session never activates after a successful start
  useEffect(() => {
    if (!starting) return;
    const t = setTimeout(() => {
      setStarting(false);
      setStartError("Timed out — session may not have started. Try again.");
    }, 30000);
    return () => clearTimeout(t);
  }, [starting]);

  const handleStartSession = useCallback(async () => {
    const artist = startArtist.trim();
    const song   = startSong.trim();
    if (!artist && !song) return;
    setStarting(true);
    setStartError(null);
    try {
      const resp = await fetch(`${JARVIS_URL}/session_start`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ artist, song }),
      });
      const data = await resp.json();
      if (data.status === "suggest") {
        setSuggestionTitle(data.suggestion || "");
        setSuggestionPageId(data.page_id || "");
        setMatchState("suggest");
        setStarting(false);
        return;
      }
      if (data.status === "not_found") {
        setNotFoundPrompt(`No match found for "${data.query}". Create a new page?`);
        setMatchState("not_found");
        setStarting(false);
        return;
      }
      if (!resp.ok || data.error) {
        setStartError(data.error || "Failed to start session");
        setStarting(false);
        return;
      }
      refetchSession();
    } catch {
      setStartError("Connection error — check Jarvis is running");
      setStarting(false);
    }
  }, [startArtist, startSong, refetchSession]);

  const handleConfirmSuggestion = useCallback(async () => {
    setMatchState("idle");
    setStarting(true);
    setStartError(null);
    try {
      const resp = await fetch(`${JARVIS_URL}/session_start`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: suggestionPageId }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStartError(data.error || "Failed to start session");
        setStarting(false);
        return;
      }
      refetchSession();
    } catch {
      setStartError("Connection error — check Jarvis is running");
      setStarting(false);
    }
  }, [suggestionPageId, refetchSession]);

  const handleForceCreate = useCallback(async () => {
    setMatchState("idle");
    setStarting(true);
    setStartError(null);
    try {
      const resp = await fetch(`${JARVIS_URL}/session_start`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ artist: startArtist.trim(), song: startSong.trim(), force_create: true }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setStartError(data.error || "Failed to start session");
        setStarting(false);
        return;
      }
      refetchSession();
    } catch {
      setStartError("Connection error — check Jarvis is running");
      setStarting(false);
    }
  }, [startArtist, startSong, refetchSession]);

  const handleMatchCancel = useCallback(() => {
    setMatchState("idle");
    setSuggestionTitle("");
    setSuggestionPageId("");
    setNotFoundPrompt("");
  }, []);

  const handleEndSession = useCallback(async () => {
    try {
      await fetch(`${JARVIS_URL}/session_end`, {
        method: "POST",
        headers: AUTH_HEADERS,
      });
    } catch {
      // non-fatal
    }
    navigate("/", { replace: true });
  }, [navigate]);

  const handleStop = useCallback(async () => {
    if (!running) return;
    setStopping(true);
    setRunning(false);
    setOnBreak(false);
    if (timerRef.current) clearInterval(timerRef.current);

    const totalMins = Math.round(elapsed / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const durationStr = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;

    const label = session.artist && session.song
      ? `${session.artist} / ${session.song}`
      : session.song || session.artist || "session";

    let logRatePart: string;
    if (rateType === "hourly") {
      const earningsAmt = (elapsed / 3600) * hourlyRate;
      logRatePart = `at hourly: $${hourlyRate}/hr = $${earningsAmt.toFixed(2)}`;
    } else if (rateType === "day_rate") {
      logRatePart = `at day rate: $${dayRateAmount}`;
    } else if (rateType === "project_rate") {
      logRatePart = `at project rate: $0`;
    } else {
      logRatePart = `at no charge: $0`;
    }
    const logMsg = `session log: ${label} — ${durationStr} ${logRatePart}`;

    try {
      await fetch(`${JARVIS_URL}/remi`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ message: logMsg, user_id: "remi" }),
      });
    } catch {
      // non-fatal
    }
    try {
      await fetch(`${JARVIS_URL}/session_end`, {
        method: "POST",
        headers: AUTH_HEADERS,
      });
    } catch {
      // non-fatal
    }
    setStopping(false);
    navigate("/", { replace: true });
  }, [running, elapsed, hourlyRate, rateType, dayRateAmount, session, navigate]);

  const saveRate = useCallback(() => {
    const v = parseFloat(rateInput);
    if (!isNaN(v) && v > 0) {
      setHourlyRate(v);
      localStorage.setItem(HOURLY_RATE_KEY, String(v));
    } else {
      setRateInput(String(hourlyRate));
    }
    setEditingRate(false);
  }, [rateInput, hourlyRate]);

  const saveDayRate = useCallback(() => {
    const v = parseFloat(dayRateInput);
    if (!isNaN(v) && v > 0) {
      setDayRateAmount(v);
      localStorage.setItem(DAY_RATE_KEY, String(v));
    } else {
      setDayRateInput(String(dayRateAmount));
    }
    setEditingDayRate(false);
  }, [dayRateInput, dayRateAmount]);

  const earnings =
    rateType === "hourly" ? (elapsed / 3600) * hourlyRate :
    rateType === "day_rate" ? dayRateAmount : 0;

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "#1a1a1a", color: "#e5e5e5" }}
    >
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 border-b border-white/5"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          data-testid="button-menu"
        >
          <Menu size={20} />
        </button>
        <span
          className="text-sm font-semibold tracking-widest uppercase"
          style={{ color: "#4ade80" }}
        >
          Studio Session
        </span>
        <div style={{ width: 36 }} />
      </div>

      {/* ── IDLE: start form ─────────────────────────────────────────── */}
      {!session.active && (
        <div className="flex-1 flex flex-col items-center justify-center px-6"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 80px), 80px)" }}
        >
          {starting ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={24} className="animate-spin" style={{ color: "#4ade80" }} />
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Starting session…</p>
            </div>
          ) : matchState === "suggest" ? (
            <div className="w-full max-w-xs space-y-3">
              <p className="text-center text-xs uppercase tracking-widest mb-4"
                style={{ color: "rgba(255,255,255,0.25)" }}>
                Song Match
              </p>
              <div
                className="rounded-xl px-4 py-4 text-center border"
                style={{ background: "#111", borderColor: "rgba(74,222,128,0.3)" }}
              >
                <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Did you mean</p>
                <p className="text-sm font-semibold" style={{ color: "#e5e5e5" }}>{suggestionTitle}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmSuggestion}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                  style={{ background: "#4ade80", color: "#000" }}
                >
                  Yes
                </button>
                <button
                  onClick={() => {
                    setNotFoundPrompt(`Create new page for "${startSong.trim()}"?`);
                    setMatchState("not_found");
                  }}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm border transition-all active:scale-95"
                  style={{ background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }}
                >
                  No
                </button>
              </div>
              {startError && (
                <p className="text-xs text-center pt-1" style={{ color: "#ef4444" }}>{startError}</p>
              )}
            </div>
          ) : matchState === "not_found" ? (
            <div className="w-full max-w-xs space-y-3">
              <p className="text-center text-xs uppercase tracking-widest mb-4"
                style={{ color: "rgba(255,255,255,0.25)" }}>
                No Song Found
              </p>
              <div
                className="rounded-xl px-4 py-4 text-center border"
                style={{ background: "#111", borderColor: "rgba(255,255,255,0.1)" }}
              >
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{notFoundPrompt}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleForceCreate}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                  style={{ background: "#4ade80", color: "#000" }}
                >
                  Create
                </button>
                <button
                  onClick={handleMatchCancel}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm border transition-all active:scale-95"
                  style={{ background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" }}
                >
                  Cancel
                </button>
              </div>
              {startError && (
                <p className="text-xs text-center pt-1" style={{ color: "#ef4444" }}>{startError}</p>
              )}
            </div>
          ) : (
            <div className="w-full max-w-xs space-y-3">
              <p className="text-center text-xs uppercase tracking-widest mb-4"
                style={{ color: "rgba(255,255,255,0.25)" }}>
                No active session
              </p>
              <input
                value={startArtist}
                onChange={(e) => setStartArtist(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling as HTMLInputElement).focus()}
                placeholder="Artist name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
              />
              <input
                value={startSong}
                onChange={(e) => setStartSong(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
                placeholder="Song title"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
              />
              <button
                onClick={handleStartSession}
                disabled={!startArtist.trim() && !startSong.trim()}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                style={{
                  background: (startArtist.trim() || startSong.trim()) ? "#4ade80" : "rgba(74,222,128,0.12)",
                  color: (startArtist.trim() || startSong.trim()) ? "#000" : "rgba(74,222,128,0.35)",
                }}
              >
                Start Session
              </button>
              {startError && (
                <p className="text-xs text-center pt-1" style={{ color: "#ef4444" }}>
                  {startError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVE: timer, rate, notes, mic bar ──────────────────────── */}
      {session.active && (
        <>
          {/* Session banner */}
          <div className="px-5 pt-5 pb-2">
            <div
              className="rounded-xl px-4 py-3 border"
              style={{ background: "#111", borderColor: "rgba(74,222,128,0.35)" }}
            >
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#4ade80" }}>
                Active
              </p>
              <p className="text-base font-semibold truncate" style={{ color: "#e5e5e5" }}>
                {session.artist && session.song
                  ? `🎵 ${session.artist} — ${session.song}`
                  : session.song || session.artist
                  ? `🎵 ${session.song || session.artist}`
                  : "🎵 Session active"}
              </p>
            </div>
          </div>

          {/* Timer */}
          <div className="px-5 py-4">
            <div
              className="rounded-2xl px-4 py-6 border text-center"
              style={{ background: "#111", borderColor: "rgba(255,255,255,0.05)" }}
            >
              <p
                className="font-mono text-5xl font-bold tracking-tight mb-1"
                style={{ color: onBreak ? "#f59e0b" : "#4ade80", letterSpacing: "-0.02em" }}
              >
                {fmt(elapsed)}
              </p>
              {onBreak && (
                <p className="text-xs uppercase tracking-widest mt-1" style={{ color: "#f59e0b" }}>
                  On break
                </p>
              )}

              {/* Controls */}
              <div className="flex gap-3 justify-center mt-5">
                {!running ? (
                  <>
                    <button
                      onClick={handleStart}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                      style={{ background: "#4ade80", color: "#000" }}
                    >
                      <Play size={16} />
                      Start
                    </button>
                    <button
                      onClick={handleEndSession}
                      className="px-4 py-2.5 rounded-xl font-semibold text-sm transition-all border"
                      style={{ background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.35)" }}
                    >
                      End Session
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleBreak}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all border"
                      style={{
                        background: onBreak ? "rgba(245,158,11,0.15)" : "transparent",
                        borderColor: "#f59e0b",
                        color: "#f59e0b",
                      }}
                    >
                      <Coffee size={16} />
                      {onBreak ? "Resume" : "Break"}
                    </button>
                    <button
                      onClick={handleStop}
                      disabled={stopping}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                      style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid #ef4444" }}
                    >
                      <Square size={16} />
                      {stopping ? "Logging…" : "Stop"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Rate type + Earnings */}
          <div className="px-5 pb-3">
            <div className="flex gap-1.5 mb-2">
              {(["hourly", "day_rate", "project_rate", "no_charge"] as RateType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setRateType(type);
                    localStorage.setItem(RATE_TYPE_KEY, type);
                    setEditingRate(false);
                    setEditingDayRate(false);
                  }}
                  className="flex-1 py-1.5 text-xs rounded-lg font-medium transition-all"
                  style={{
                    background: rateType === type ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${rateType === type ? "rgba(74,222,128,0.6)" : "rgba(255,255,255,0.08)"}`,
                    color: rateType === type ? "#4ade80" : "rgba(255,255,255,0.35)",
                  }}
                >
                  {RATE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div
              className="rounded-xl px-4 py-3 border flex items-center justify-between"
              style={{ background: "#111", borderColor: "rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center gap-2">
                <DollarSign size={15} style={{ color: "#4ade80" }} />
                <span className="text-sm text-white/50">Earnings</span>
              </div>

              {rateType === "hourly" && (
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold font-mono" style={{ color: "#4ade80" }}>
                    ${earnings.toFixed(2)}
                  </span>
                  <span className="text-xs text-white/30">@</span>
                  {editingRate ? (
                    <input
                      type="number"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      onBlur={saveRate}
                      onKeyDown={(e) => e.key === "Enter" && saveRate()}
                      className="w-16 bg-transparent border-b text-sm text-right outline-none"
                      style={{ borderColor: "#4ade80", color: "#4ade80" }}
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => { setRateInput(String(hourlyRate)); setEditingRate(true); }}
                      className="text-sm text-white/40 hover:text-white/70 transition-colors"
                    >
                      ${hourlyRate}/hr
                    </button>
                  )}
                </div>
              )}

              {rateType === "day_rate" && (
                <div className="flex items-center gap-3">
                  {editingDayRate ? (
                    <input
                      type="number"
                      value={dayRateInput}
                      onChange={(e) => setDayRateInput(e.target.value)}
                      onBlur={saveDayRate}
                      onKeyDown={(e) => e.key === "Enter" && saveDayRate()}
                      className="w-20 bg-transparent border-b text-lg text-right outline-none font-mono font-semibold"
                      style={{ borderColor: "#4ade80", color: "#4ade80" }}
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => { setDayRateInput(String(dayRateAmount)); setEditingDayRate(true); }}
                      className="text-lg font-semibold font-mono"
                      style={{ color: "#4ade80" }}
                    >
                      ${dayRateAmount}
                    </button>
                  )}
                  <span className="text-xs text-white/30">flat</span>
                </div>
              )}

              {(rateType === "project_rate" || rateType === "no_charge") && (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>$0</span>
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {rateType === "project_rate" ? "Project rate" : "No charge"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Session notes */}
          <div className="px-5 mb-3 flex-1 flex flex-col min-h-0">
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
              Session Notes
            </p>
            <div
              className="flex-1 rounded-xl border overflow-y-auto"
              style={{ background: "#111", borderColor: "rgba(255,255,255,0.05)", maxHeight: "200px" }}
            >
              {notes.length === 0 ? (
                <p className="text-sm text-white/25 p-4 text-center">
                  Notes captured via Jarvis or the mic below will appear here
                </p>
              ) : (
                <div className="p-3 space-y-2">
                  {notes.map((n, i) => (
                    <div
                      key={i}
                      className="flex gap-3 py-2 px-3 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.03)" }}
                    >
                      <span
                        className="text-xs font-mono mt-0.5 shrink-0"
                        style={{ color: n.type === "timestamp" ? "#f59e0b" : "#4ade80" }}
                      >
                        {n.ts}
                      </span>
                      <p className="text-sm text-white/70 leading-snug">{n.text}</p>
                    </div>
                  ))}
                  <div ref={notesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Spacer for fixed bottom bar */}
          <div className="shrink-0" style={{ height: 120 }} />

          {/* Mic input bar — fixed to bottom */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#1a1a1a",
              zIndex: 10,
              padding: "12px 16px 48px",
            }}
          >
            {recordingError && (
              <p className="text-xs text-red-400/80 mb-1.5 text-center">{recordingError}</p>
            )}
            {isLocked ? (
              <div className="flex items-center justify-between gap-3 mb-2 px-1">
                <button
                  type="button"
                  onClick={handleMicCancel}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}
                >
                  <X size={12} /> Cancel
                </button>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="wave-bar w-0.5 rounded-full" style={{ height: "14px", background: "#ef4444", animationDelay: `${(i - 1) * 0.1}s` }} />
                  ))}
                  <Lock size={12} className="ml-1" style={{ color: "#f59e0b" }} />
                </div>
                <button
                  type="button"
                  onClick={handleMicSend}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: "#4ade80" }}
                >
                  Send ↑
                </button>
              </div>
            ) : (isRecording || isProcessing) ? (
              <div className="flex items-center justify-center gap-2 mb-2 h-5">
                {isRecording && (
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="wave-bar w-0.5 rounded-full" style={{ height: "14px", background: "#ef4444", animationDelay: `${(i - 1) * 0.1}s` }} />
                    ))}
                    <span className="text-xs ml-1" style={{ color: "#ef4444" }}>Recording</span>
                    <span className="text-xs text-white/25 ml-2">↑ slide to lock</span>
                  </>
                )}
                {isProcessing && (
                  <>
                    <Loader2 size={13} className="animate-spin" style={{ color: "#f59e0b" }} />
                    <span className="text-xs" style={{ color: "#f59e0b" }}>Transcribing...</span>
                  </>
                )}
              </div>
            ) : null}
            <div className="flex gap-2 items-center">
              <input
                ref={noteInputRef}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNoteSubmit()}
                placeholder="Drop a session note…"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
              />

              <button
                type="button"
                onClick={handleNoteSubmit}
                className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: "#4ade80", color: "#000" }}
              >
                Send
              </button>

              {/* Hold-to-record mic: hold=record, slide-up=lock, release=send, swipe-down=cancel */}
              <button
                type="button"
                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 ${isRecording && !isLocked ? "voice-button-recording" : ""}`}
                style={{
                  background: isRecording ? "#ef444422" : isProcessing ? "#f59e0b18" : "#f59e0b14",
                  border: `1.5px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
                  marginRight: "20px",
                  touchAction: "none",
                }}
                onTouchStart={handleMicTouchStart}
                onTouchMove={handleMicTouchMove}
                onTouchEnd={handleMicTouchEnd}
                onTouchCancel={handleMicCancel}
                data-testid="button-voice"
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
        </>
      )}
    </div>
  );
}
