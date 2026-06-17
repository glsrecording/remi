import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Menu, Square, Coffee, Play, DollarSign, Mic, MicOff, Loader2, X, Moon, Sun, Check, ArrowLeftRight, SlidersHorizontal, ChevronDown, ChevronRight } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import HamburgerMenu from "@/components/HamburgerMenu";
import MixRevisionPanel, { MIX_REV_COLOR } from "@/components/MixRevisionPanel";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };
const HOURLY_RATE_KEY = "remi_session_hourly_rate";
const DAY_RATE_KEY    = "remi_session_day_rate";
const RATE_TYPE_KEY   = "remi_session_rate_type";
const SESSION_START_KEY = "remi_session_start";  // ms epoch backup for timer rehydration
// Last active session's song — persisted so its tasks remain reachable (read-only)
// after the session is closed and the page reopened (GET /session then has no song).
const LAST_SESSION_KEY  = "remi_last_session_song";

interface LastSession {
  artist: string;
  song: string;
  song_page_id: string;
}

// Design-system context colors (mirror design-system.css; kept as hex so the
// `color + "33"` alpha-concat glow pattern works — same approach as Tasks.tsx).
// These accent hues are mode-independent (not overridden in light mode), so
// they're safe in both themes; surfaces/borders/text use tokens that flip.
const STUDIO  = "#3dd6b0";  // --color-studio  — screen identity (teal) — notes
const TONIGHT = "#9b8de8";  // --color-tonight — session tasks (purple), distinct from notes
const AMBER   = "#f5a623";  // --color-tasks   — break state / add-task button
const DONE    = "#5bc468";  // --color-done    — earnings
const BLUE    = "#378add";  // --color-calls   — switch song
const ALERT   = "#ef4444";  // semantic stop / error (mode-independent)

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
  start_time?: string;  // ISO string, already returned by GET /session
}

interface NoteEntry {
  text: string;
  type: "note" | "timestamp";
  ts: string;
}

interface SessionTask {
  block_id: string;
  text: string;
  checked: boolean;
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
  const { isLight, toggleTheme } = useTheme();
  const [session, setSession] = useState<SessionState>({ active: false });
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [sessionTasks, setSessionTasks] = useState<SessionTask[]>([]);
  // Populated from localStorage when there's no active session — lets the page
  // show the last session's tasks (read-only) on reopen.
  const [lastSession, setLastSession] = useState<LastSession | null>(null);
  const [taskInput, setTaskInput] = useState("");
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  // Switch Song (mid-session) — picker overlay + request state
  const [switching, setSwitching]         = useState(false);
  const [switchInput, setSwitchInput]     = useState("");
  const [switchBusy, setSwitchBusy]       = useState(false);
  const [switchError, setSwitchError]     = useState<string | null>(null);
  const [switchConfirm, setSwitchConfirm] = useState<string | null>(null);
  // Mix Revision — overlay panel for working client mix-feedback notes
  const [mixRevOpen, setMixRevOpen] = useState(false);
  // Previous-sessions history (notes from prior session toggles for this song).
  // Collapsed by default; loaded lazily on first expand, reset when the song changes.
  const [showHistory, setShowHistory]         = useState(false);
  const [history, setHistory]                 = useState<{ label: string; notes: NoteEntry[] }[]>([]);
  const [historyLoaded, setHistoryLoaded]     = useState(false);
  const [historyLoading, setHistoryLoading]   = useState(false);
  // Completed session tasks collapse below the active (unchecked) ones so active
  // work is never buried. Collapsed by default.
  const [showCompleted, setShowCompleted]     = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const rehydratedRef = useRef(false);  // guards one-time timer rehydration per mount
  const breakAccumRef = useRef<number>(0);
  const breakStartRef = useRef<number>(0);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);
  const pointerStartYRef = useRef<number>(0);
  const noteInputRef = useRef<HTMLInputElement>(null);
  // Set true on a song switch to suppress the /session_notes poll until the new
  // song's own notes propagate from Notion — otherwise the poll refills the
  // freshly-cleared panel with the OLD song's notes. Suppression lifts on the
  // first non-empty response for the new song, or after a 30s hard timeout (so a
  // song that genuinely has no notes yet doesn't stay suppressed forever).
  const justSwitchedRef = useRef(false);
  const switchTimeRef = useRef<number>(0);  // Date.now() at the moment of the last switch

  const refetchSession = useCallback(() => {
    fetch(`${JARVIS_URL}/session`, { headers: AUTH_HEADERS })
      .then((r) => r.json())
      .then((data: SessionState) => {
        if (!data || !data.active || (!data.artist && !data.song)) {
          setSession({ active: false });
          setStarting(false);
          // Inactive: surface the last session's song (if any) so its tasks load.
          try {
            const raw = localStorage.getItem(LAST_SESSION_KEY);
            setLastSession(raw ? (JSON.parse(raw) as LastSession) : null);
          } catch { setLastSession(null); }
        } else {
          setSession(data);
          setStarting(false);
          setLastSession(null);  // active session — no fallback needed
          // Persist the current song so its tasks survive close → reopen. This
          // also handles "new session on a different song" — it overwrites.
          if (data.artist && data.song && data.song_page_id) {
            try {
              localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({
                artist: data.artist, song: data.song, song_page_id: data.song_page_id,
              }));
            } catch { /* storage full — non-fatal */ }
          }
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
          if (!Array.isArray(data.notes)) return;
          // Post-switch suppression: hold the panel clear until Notion serves the
          // NEW song's notes. Decide against the actual response so a slow toggle
          // can't flash the old song's data back in.
          if (justSwitchedRef.current) {
            const hasNotes = data.notes.length > 0;
            const timedOut = Date.now() - switchTimeRef.current > 30000;
            if (!hasNotes && !timedOut) return;  // still empty & within 30s — keep suppressing
            justSwitchedRef.current = false;      // first real data (or 30s hard timeout) — lift suppression
          }
          setNotes(data.notes);
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

  // Fetch session sub-tasks (page-body to_do blocks). Uses the active song when a
  // session is running, else the last session's song (read-only on reopen).
  const refetchSessionTasks = useCallback(() => {
    const song = session.song || (!session.active ? lastSession?.song : undefined);
    if (!song) {
      setSessionTasks([]);
      return;
    }
    fetch(`${JARVIS_URL}/session-tasks?song=${encodeURIComponent(song)}`, { headers: AUTH_HEADERS })
      .then((r) => r.json())
      .then((data: { tasks?: SessionTask[] }) => {
        if (Array.isArray(data.tasks)) setSessionTasks(data.tasks);
      })
      .catch(() => {});
  }, [session.song, session.active, lastSession]);

  // Poll session sub-tasks every 10 seconds
  useEffect(() => {
    refetchSessionTasks();
    if (!session.song) return;
    const id = setInterval(refetchSessionTasks, 10000);
    return () => clearInterval(id);
  }, [refetchSessionTasks, session.song]);

  // Reset the previous-sessions view whenever the active song changes (switch
  // song / new session) so history reloads for the correct song.
  useEffect(() => {
    setShowHistory(false);
    setHistory([]);
    setHistoryLoaded(false);
  }, [session.song]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch(`${JARVIS_URL}/session_history`, { headers: AUTH_HEADERS });
      const data = await r.json();
      if (Array.isArray(data.sessions)) setHistory(data.sessions);
      setHistoryLoaded(true);
    } catch {
      // non-fatal — leave collapsed
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const toggleHistory = useCallback(() => {
    setShowHistory((prev) => {
      const next = !prev;
      if (next && !historyLoaded && !historyLoading) loadHistory();
      return next;
    });
  }, [historyLoaded, historyLoading, loadHistory]);

  // Add a session sub-task by typing — reuses the voice handler path (/remi
  // trigger phrase), then refreshes the list. UI-only; no backend changes.
  const addTask = useCallback(async () => {
    const text = taskInput.trim();
    const song = session.song;
    if (!text || !song) return;
    try {
      await fetch(`${JARVIS_URL}/remi`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `add session task for ${song}: ${text}`,
          user_id: "remi-session",
        }),
      });
      setTaskInput("");
      refetchSessionTasks();
    } catch {
      // non-fatal — leave the text so the user can retry
    }
  }, [taskInput, session.song, refetchSessionTasks]);

  const toggleTask = useCallback(async (blockId: string, checked: boolean) => {
    setSessionTasks((prev) =>
      prev.map((t) => (t.block_id === blockId ? { ...t, checked } : t))
    );
    try {
      await fetch(`${JARVIS_URL}/session-tasks/toggle`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ block_id: blockId, checked }),
      });
    } catch {
      // Revert optimistic update on failure
      setSessionTasks((prev) =>
        prev.map((t) => (t.block_id === blockId ? { ...t, checked: !checked } : t))
      );
    }
  }, []);

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

  // Rehydrate the timer after a remount (PIN unlock / full reload). The server's
  // start_time (returned by /session) is authoritative; fall back to the
  // localStorage backup if it's missing/invalid. Runs once per mount, and only
  // when the server says the session is active and the local timer isn't already
  // running — so we never auto-start a timer for a session that isn't active
  // server-side, and never override a freshly-started or live timer.
  useEffect(() => {
    if (rehydratedRef.current) return;
    if (!session.active || running) return;
    let startMs = 0;
    if (session.start_time) {
      const parsed = new Date(session.start_time).getTime();
      if (!isNaN(parsed)) startMs = parsed;
    }
    if (!startMs) {
      const backup = localStorage.getItem(SESSION_START_KEY);
      if (backup) { const n = parseInt(backup, 10); if (!isNaN(n)) startMs = n; }
    }
    if (!startMs) return;  // nothing authoritative to restore from — leave timer idle
    rehydratedRef.current = true;
    const restoredElapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    startTimeRef.current = startMs / 1000;  // startTimeRef is kept in SECONDS (see handleStart)
    breakAccumRef.current = 0;
    localStorage.setItem(SESSION_START_KEY, String(startMs));  // keep backup in sync
    setElapsed(restoredElapsed);
    setOnBreak(false);
    setRunning(true);
  }, [session.active, session.start_time, running]);

  const handleStart = useCallback(() => {
    startTimeRef.current = Date.now() / 1000;
    breakAccumRef.current = 0;
    rehydratedRef.current = true;  // manual start owns the timer; don't let rehydration override
    localStorage.setItem(SESSION_START_KEY, Date.now().toString());  // backup for reload
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

  // ─── Mic: 150ms hold-to-record ───────────────────────────────────────────
  function handleMicDown() {
    if (isRecording) return;
    holdActiveRef.current = false;
    setRecordingError(null);
    holdTimerRef.current = setTimeout(async () => {
      holdActiveRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!holdActiveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
        recorder.onstop = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setIsRecording(false);
          setIsLocked(false);
          // 800ms flush: Safari delivers dataavailable after onstop.
          setTimeout(async () => {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            audioChunksRef.current = [];
            if (blob.size === 0) return;
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
            }
          }, 800);
        };
        recorder.start(100);
        setIsRecording(true);
      } catch {
        setRecordingError("Microphone permission is blocked or unavailable.");
      }
    }, 150);
  }

  function handleMicUp() {
    if (isLocked) return;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    holdActiveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
  }

  function handleSendLocked() {
    setIsLocked(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

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
    localStorage.removeItem(SESSION_START_KEY);
    navigate("/", { replace: true });
  }, [navigate]);

  // Switch the active song mid-session. Backend resolves {artist, song} → page_id
  // (no session reset) and redirects notes to a fresh toggle on the new page.
  // Timer is NOT touched. On failure the UI stays on the current song.
  const handleSwitchSong = useCallback(async () => {
    const song = switchInput.trim();
    if (!song) return;
    setSwitchBusy(true);
    setSwitchError(null);
    try {
      const resp = await fetch(`${JARVIS_URL}/session_switch`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ artist: session.artist || "", song }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.status === "switched") {
        // Part 3 — reflect the new song immediately (timer untouched).
        setSession((prev) => ({ ...prev, song: data.song, artist: data.artist || prev.artist }));
        // Clear the previous song's display so the panels show fresh for the new
        // song — notes are wiped (the poll repopulates from the new toggle) and the
        // old task list is dropped, then re-fetched immediately for the new song.
        setNotes([]);
        justSwitchedRef.current = true;     // suppress notes poll until new song's notes arrive
        switchTimeRef.current = Date.now();  // start the 30s hard-timeout clock
        setSessionTasks([]);
        if (data.song) {
          fetch(`${JARVIS_URL}/session-tasks?song=${encodeURIComponent(data.song)}`, { headers: AUTH_HEADERS })
            .then((r) => r.json())
            .then((d: { tasks?: SessionTask[] }) => { if (Array.isArray(d.tasks)) setSessionTasks(d.tasks); })
            .catch(() => {});
        }
        setSwitchConfirm(`Now on: ${data.song}`);
        setTimeout(() => setSwitchConfirm(null), 4000);
        setSwitching(false);
        setSwitchInput("");
      } else if (resp.status === 404) {
        setSwitchError(`No match for "${song}" — try the full title.`);
      } else {
        // 500 (toggle creation failed) or other — stay on current song, no UI update.
        setSwitchError(`Couldn't switch — notes still going to ${session.song || "the current song"}.`);
      }
    } catch {
      setSwitchError("Connection error — try again.");
    } finally {
      setSwitchBusy(false);
    }
  }, [switchInput, session.artist, session.song]);

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
    localStorage.removeItem(SESSION_START_KEY);
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

  // Session-task partition: active (unchecked) tasks render first + always; the
  // completed ones collapse below. Same toggleTask behaviour either way.
  const activeTasks    = sessionTasks.filter((t) => !t.checked);
  const completedTasks = sessionTasks.filter((t) => t.checked);

  const renderTaskRow = (t: SessionTask, readOnly = false) => (
    <button
      key={t.block_id}
      type="button"
      onClick={readOnly ? undefined : () => toggleTask(t.block_id, !t.checked)}
      className={`w-full flex items-center gap-3 py-2.5 px-3 text-left transition-all ${readOnly ? "" : "active:scale-[0.99]"}`}
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-md)",
        cursor: readOnly ? "default" : "pointer",
        // Purple (tonight) accent — visually distinct from teal notes.
        borderLeft: `3px solid ${TONIGHT}`,
        borderTop: "1px solid var(--border-subtle)",
        borderRight: "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span
        className="shrink-0 grid place-content-center"
        style={{
          width: 22,
          height: 22,
          borderRadius: "var(--radius-sm)",
          border: `1.5px solid ${t.checked ? TONIGHT : "var(--border-strong)"}`,
          background: t.checked ? TONIGHT : "var(--color-tonight-bg)",
        }}
      >
        {t.checked && <Check className="h-3.5 w-3.5" style={{ color: "#1a1430" }} />}
      </span>
      <span
        className="text-sm leading-snug"
        style={{
          color: t.checked ? "var(--text-muted)" : "var(--text-primary)",
          textDecoration: t.checked ? "line-through" : "none",
        }}
      >
        {t.text}
      </span>
    </button>
  );

  // CHANGE 3 (dismiss): forget the last session + its tasks for this device.
  const clearLastSession = () => {
    try { localStorage.removeItem(LAST_SESSION_KEY); } catch { /* ignore */ }
    setLastSession(null);
    setSessionTasks([]);
  };

  // Show the read-only last-session tasks only in the plain idle state (not mid
  // start / song-match flow) and only when that song actually has tasks.
  const showLastSessionTasks =
    !session.active && !!lastSession && !starting && matchState === "idle" && sessionTasks.length > 0;

  return (
    <div
      className="flex flex-col h-[100dvh] overflow-hidden"
      style={{
        background: "var(--surface-base)",
        color: "var(--text-primary)",
        // Mix-revision mode: whole-screen teal tint + inset glow ring so it's
        // visibly a different mode. transition keeps the shift soft, not harsh.
        boxShadow: mixRevOpen ? `inset 0 0 80px ${STUDIO}1f` : "none",
        transition: "box-shadow 0.3s ease",
      }}
    >
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 shrink-0"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 rounded-xl hover:bg-white/5 transition-colors"
          style={{ color: STUDIO }}
          data-testid="button-menu"
        >
          <Menu size={20} />
        </button>
        <span
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color: STUDIO, fontFamily: "'Space Mono', monospace" }}
        >
          Session
        </span>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
          style={{ color: "var(--text-muted)" }}
          title={isLight ? "Switch to dark mode" : "Switch to light mode"}
          data-testid="button-theme-toggle"
        >
          {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      {/* ── IDLE: start form ─────────────────────────────────────────── */}
      {!session.active && (
        <div
          className={`flex-1 flex flex-col items-center px-6 ${showLastSessionTasks ? "overflow-y-auto justify-start pt-10" : "justify-center"}`}
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 80px), 80px)" }}
        >
          {starting ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={24} className="animate-spin" style={{ color: STUDIO }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Starting session…</p>
            </div>
          ) : matchState === "suggest" ? (
            <div className="w-full max-w-xs space-y-3">
              <p className="text-center text-xs uppercase tracking-widest mb-4"
                style={{ color: "var(--text-muted)" }}>
                Song Match
              </p>
              <div
                className="px-4 py-4 text-center"
                style={{
                  background: "var(--surface-elevated)",
                  borderRadius: "var(--radius-lg)",
                  border: `1px solid ${STUDIO}4d`,
                  boxShadow: `0 0 16px ${STUDIO}26`,
                }}
              >
                <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>Did you mean</p>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{suggestionTitle}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmSuggestion}
                  className="flex-1 py-3 font-semibold text-sm transition-all active:scale-95"
                  style={{ background: STUDIO, color: "#08110f", borderRadius: "var(--radius-pill)", boxShadow: `0 0 16px ${STUDIO}55` }}
                >
                  Yes
                </button>
                <button
                  onClick={() => {
                    setNotFoundPrompt(`Create new page for "${startSong.trim()}"?`);
                    setMatchState("not_found");
                  }}
                  className="flex-1 py-3 font-semibold text-sm transition-all active:scale-95"
                  style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: "var(--radius-pill)" }}
                >
                  No
                </button>
              </div>
              {startError && (
                <p className="text-xs text-center pt-1" style={{ color: ALERT }}>{startError}</p>
              )}
            </div>
          ) : matchState === "not_found" ? (
            <div className="w-full max-w-xs space-y-3">
              <p className="text-center text-xs uppercase tracking-widest mb-4"
                style={{ color: "var(--text-muted)" }}>
                No Song Found
              </p>
              <div
                className="px-4 py-4 text-center"
                style={{ background: "var(--surface-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)" }}
              >
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{notFoundPrompt}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleForceCreate}
                  className="flex-1 py-3 font-semibold text-sm transition-all active:scale-95"
                  style={{ background: STUDIO, color: "#08110f", borderRadius: "var(--radius-pill)", boxShadow: `0 0 16px ${STUDIO}55` }}
                >
                  Create
                </button>
                <button
                  onClick={handleMatchCancel}
                  className="flex-1 py-3 font-semibold text-sm transition-all active:scale-95"
                  style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: "var(--radius-pill)" }}
                >
                  Cancel
                </button>
              </div>
              {startError && (
                <p className="text-xs text-center pt-1" style={{ color: ALERT }}>{startError}</p>
              )}
            </div>
          ) : (
            <div className="w-full max-w-xs space-y-3">
              <p className="text-center text-xs uppercase tracking-widest mb-4"
                style={{ color: "var(--text-muted)" }}>
                No active session
              </p>
              <input
                value={startArtist}
                onChange={(e) => setStartArtist(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling as HTMLInputElement).focus()}
                placeholder="Artist name"
                className="remi-chat-input w-full px-4 py-3 text-sm"
                style={{ color: "var(--text-primary)" }}
              />
              <input
                value={startSong}
                onChange={(e) => setStartSong(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
                placeholder="Song title"
                className="remi-chat-input w-full px-4 py-3 text-sm"
                style={{ color: "var(--text-primary)" }}
              />
              <button
                onClick={handleStartSession}
                disabled={!startArtist.trim() && !startSong.trim()}
                className="w-full py-3 font-semibold text-sm transition-all active:scale-95"
                style={
                  (startArtist.trim() || startSong.trim())
                    ? { background: STUDIO, color: "#08110f", borderRadius: "var(--radius-pill)", boxShadow: `0 0 16px ${STUDIO}55` }
                    : { background: "var(--surface-elevated)", color: "var(--text-muted)", borderRadius: "var(--radius-pill)" }
                }
              >
                Start Session
              </button>
              {startError && (
                <p className="text-xs text-center pt-1" style={{ color: ALERT }}>
                  {startError}
                </p>
              )}
            </div>
          )}

          {/* CHANGE 2 — last session's tasks (read-only) when nothing is active.
              Lets the captured to-dos stay reachable after close → reopen. */}
          {showLastSessionTasks && lastSession && (
            <div className="w-full max-w-xs mt-8">
              <div className="flex items-center gap-2 mb-3 px-1">
                <p
                  className="text-xs uppercase tracking-widest flex-1 truncate"
                  style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}
                >
                  Last session — {lastSession.song || lastSession.artist}
                </p>
                <button
                  type="button"
                  onClick={clearLastSession}
                  aria-label="Clear last session tasks"
                  className="shrink-0 p-1 rounded-md hover:bg-white/5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-1.5">
                {sessionTasks.map((t) => renderTaskRow(t, true))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVE: timer, rate, notes, mic bar ──────────────────────── */}
      {session.active && (
        <>
          {/* Scrollable content region — header stays fixed, this scrolls. The
              app shell (#root) is overflow:hidden, so the page needs its own
              scroll container or content below the fold is unreachable. */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 140px)" }}
          >
          {/* Current song / active session card — the hero element */}
          <div className="px-5 pt-5 pb-2">
            <div
              className="px-4 py-4"
              style={{
                background: "var(--surface-elevated)",
                borderRadius: "var(--radius-lg)",
                borderLeft: `3px solid ${STUDIO}`,
                borderTop: `1px solid ${STUDIO}40`,
                borderRight: `1px solid ${STUDIO}40`,
                borderBottom: `1px solid ${STUDIO}40`,
                boxShadow: `0 0 18px ${STUDIO}33`,
              }}
            >
              <p
                className="text-xs uppercase tracking-widest mb-1.5"
                style={{ color: STUDIO, fontFamily: "'Space Mono', monospace" }}
              >
                Active Session
              </p>
              <p className="text-xl font-bold leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                {session.artist && session.song
                  ? `${session.artist}: ${session.song}`
                  : session.song || session.artist || "Session active"}
              </p>
            </div>
          </div>

          {switchConfirm && (
            <div className="px-5 -mt-1 pb-1">
              <p className="text-xs text-center font-medium" style={{ color: STUDIO }}>{switchConfirm}</p>
            </div>
          )}

          {/* Timer */}
          <div className="px-5 py-4">
            <div
              className="px-4 py-6 text-center"
              style={{
                background: "var(--surface-card)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <p
                className="font-mono text-5xl font-bold tracking-tight mb-1"
                style={{
                  color: onBreak ? AMBER : STUDIO,
                  letterSpacing: "-0.02em",
                  textShadow: `0 0 18px ${onBreak ? AMBER : STUDIO}66`,
                }}
              >
                {fmt(elapsed)}
              </p>
              {onBreak && (
                <p className="text-xs uppercase tracking-widest mt-1" style={{ color: AMBER }}>
                  On break
                </p>
              )}

              {/* Controls — pill-shaped, colored by state */}
              <div className="flex flex-wrap gap-3 justify-center mt-5">
                {!running ? (
                  <>
                    <button
                      onClick={handleStart}
                      className="flex items-center gap-2 px-5 py-2.5 font-semibold text-sm transition-all active:scale-95"
                      style={{ background: STUDIO, color: "#08110f", borderRadius: "var(--radius-pill)", boxShadow: `0 0 16px ${STUDIO}55` }}
                    >
                      <Play size={16} />
                      Start
                    </button>
                    <button
                      onClick={handleEndSession}
                      className="px-4 py-2.5 font-semibold text-sm transition-all active:scale-95"
                      style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: "var(--radius-pill)" }}
                    >
                      End Session
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleBreak}
                      className="flex items-center gap-2 px-4 py-2.5 font-semibold text-sm transition-all active:scale-95"
                      style={
                        onBreak
                          ? { background: AMBER, color: "#1a1200", borderRadius: "var(--radius-pill)", boxShadow: `0 0 16px ${AMBER}55` }
                          : { background: "var(--surface-elevated)", border: `1px solid ${AMBER}66`, color: AMBER, borderRadius: "var(--radius-pill)" }
                      }
                    >
                      <Coffee size={16} />
                      {onBreak ? "Resume" : "Break"}
                    </button>
                    <button
                      onClick={handleStop}
                      disabled={stopping}
                      className="flex items-center gap-2 px-4 py-2.5 font-semibold text-sm transition-all active:scale-95"
                      style={{ background: `${ALERT}1f`, color: ALERT, border: `1px solid ${ALERT}`, borderRadius: "var(--radius-pill)" }}
                    >
                      <Square size={16} />
                      {stopping ? "Logging…" : "Stop"}
                    </button>
                    <button
                      onClick={() => { setSwitchInput(""); setSwitchError(null); setSwitching(true); }}
                      className="flex items-center gap-2 px-4 py-2.5 font-semibold text-sm transition-all active:scale-95"
                      style={{ background: "var(--surface-elevated)", border: `1px solid ${BLUE}66`, color: BLUE, borderRadius: "var(--radius-pill)" }}
                    >
                      <ArrowLeftRight size={16} />
                      Switch
                    </button>
                    <button
                      onClick={() => setMixRevOpen(true)}
                      className="flex items-center gap-2 px-4 py-2.5 font-semibold text-sm transition-all active:scale-95"
                      style={{ background: `${MIX_REV_COLOR}1a`, border: `1px solid ${MIX_REV_COLOR}66`, color: MIX_REV_COLOR, borderRadius: "var(--radius-pill)" }}
                    >
                      <SlidersHorizontal size={16} />
                      Mix Revision
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
                  className="flex-1 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: rateType === type ? `${DONE}1f` : "var(--surface-elevated)",
                    border: `1px solid ${rateType === type ? `${DONE}99` : "var(--border-subtle)"}`,
                    color: rateType === type ? DONE : "var(--text-muted)",
                    borderRadius: "var(--radius-pill)",
                  }}
                >
                  {RATE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <DollarSign size={15} style={{ color: DONE }} />
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Earnings</span>
              </div>

              {rateType === "hourly" && (
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold font-mono" style={{ color: DONE }}>
                    ${earnings.toFixed(2)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>@</span>
                  {editingRate ? (
                    <input
                      type="number"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      onBlur={saveRate}
                      onKeyDown={(e) => e.key === "Enter" && saveRate()}
                      className="w-16 bg-transparent border-b text-sm text-right outline-none"
                      style={{ borderColor: DONE, color: DONE }}
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => { setRateInput(String(hourlyRate)); setEditingRate(true); }}
                      className="text-sm transition-colors"
                      style={{ color: "var(--text-secondary)" }}
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
                      style={{ borderColor: DONE, color: DONE }}
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => { setDayRateInput(String(dayRateAmount)); setEditingDayRate(true); }}
                      className="text-lg font-semibold font-mono"
                      style={{ color: DONE }}
                    >
                      ${dayRateAmount}
                    </button>
                  )}
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>flat</span>
                </div>
              )}

              {(rateType === "project_rate" || rateType === "no_charge") && (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold font-mono" style={{ color: "var(--text-muted)" }}>$0</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {rateType === "project_rate" ? "Project rate" : "No charge"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Session sub-tasks — active (unchecked) tasks sit ABOVE notes and are
              always rendered, so active work is never buried under the growing
              notes log; completed tasks collapse below. */}
          {session.song && (
            <div className="px-5 mb-3">
              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
                Session Tasks
              </p>

              {/* Active (unchecked) — always visible, never capped */}
              {activeTasks.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  {activeTasks.map((t) => renderTaskRow(t))}
                </div>
              )}

              {/* Completed — collapsed below the active ones */}
              {completedTasks.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCompleted((v) => !v)}
                    className="mb-2 w-full flex items-center gap-1.5 py-1.5 text-xs font-medium transition-all active:scale-[0.99]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {showCompleted ? "Hide completed" : `Show completed (${completedTasks.length})`}
                  </button>
                  {showCompleted && (
                    <div className="mb-2 space-y-1.5">
                      {completedTasks.map((t) => renderTaskRow(t))}
                    </div>
                  )}
                </>
              )}

              {/* Add-task input — always visible */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  enterKeyHint="done"
                  onKeyDown={(e) => {
                    // Plain Enter submits (same as the Add button); Shift+Enter does not.
                    // Catch numeric keyCode/which too — some tablet soft keyboards send
                    // those instead of the "Enter" key name.
                    const isEnter = e.key === "Enter" || e.keyCode === 13 || e.which === 13;
                    if (isEnter && !e.shiftKey && taskInput.trim()) {
                      e.preventDefault();
                      addTask();
                    }
                  }}
                  onKeyPress={(e) => {
                    // Tablet soft keyboards may fire keypress (not keydown) for Enter.
                    // Mirrors onKeyDown; a canceled keydown suppresses keypress on PC,
                    // so this only fires when keydown didn't — no double-submit.
                    const isEnter = e.key === "Enter" || e.keyCode === 13 || e.which === 13;
                    if (isEnter && !e.shiftKey && taskInput.trim()) {
                      e.preventDefault();
                      addTask();
                    }
                  }}
                  placeholder="Add session task..."
                  className="flex-1 px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  type="button"
                  onClick={addTask}
                  disabled={!taskInput.trim()}
                  className="px-4 text-sm font-semibold disabled:opacity-40"
                  style={{ background: AMBER, color: "#1a1200", borderRadius: "var(--radius-md)" }}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Session notes */}
          <div className="px-5 mb-3">
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
              Session Notes
            </p>
            <div
              style={{ background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}
            >
              {notes.length === 0 ? (
                <p className="text-sm p-4 text-center" style={{ color: "var(--text-muted)" }}>
                  Notes captured via Jarvis or the mic below will appear here
                </p>
              ) : (
                <div className="p-3 space-y-2">
                  {notes.map((n, i) => (
                    <div
                      key={i}
                      className="flex gap-3 py-2 px-3"
                      style={{
                        background: "var(--surface-elevated)",
                        borderRadius: "var(--radius-md)",
                        borderLeft: `2px solid ${n.type === "timestamp" ? AMBER : STUDIO}`,
                      }}
                    >
                      <span
                        className="text-xs font-mono mt-0.5 shrink-0"
                        style={{ color: n.type === "timestamp" ? AMBER : STUDIO }}
                      >
                        {n.ts}
                      </span>
                      <p className="text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>{n.text}</p>
                    </div>
                  ))}
                  <div ref={notesEndRef} />
                </div>
              )}
            </div>

            {/* Show previous sessions — collapsed by default, loaded on first tap */}
            <button
              type="button"
              onClick={toggleHistory}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all active:scale-[0.99]"
              style={{ color: STUDIO }}
            >
              {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showHistory ? "Hide previous sessions" : "Show previous sessions"}
            </button>

            {showHistory && (
              <div className="mt-1 space-y-3">
                {historyLoading ? (
                  <div className="flex justify-center py-3">
                    <Loader2 size={16} className="animate-spin" style={{ color: STUDIO }} />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs text-center py-2" style={{ color: "var(--text-muted)" }}>
                    No previous sessions for this song.
                  </p>
                ) : (
                  history.map((sess, si) => (
                    <div key={si}>
                      <p className="text-xs font-mono mb-1.5 px-1" style={{ color: "var(--text-muted)" }}>
                        {sess.label}
                      </p>
                      <div style={{ background: "var(--surface-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)" }}>
                        <div className="p-3 space-y-2">
                          {sess.notes.map((n, ni) => (
                            <div
                              key={ni}
                              className="flex gap-3 py-2 px-3"
                              style={{
                                background: "var(--surface-elevated)",
                                borderRadius: "var(--radius-md)",
                                borderLeft: `2px solid ${STUDIO}`,
                                opacity: 0.75,
                              }}
                            >
                              <span className="text-xs font-mono mt-0.5 shrink-0" style={{ color: STUDIO }}>{n.ts}</span>
                              <p className="text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>{n.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          </div>
          {/* end scrollable content region */}

          {/* Mic input bar — fixed to bottom */}
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
            }}
          >
            {recordingError && (
              <p className="text-xs mb-1.5 text-center" style={{ color: ALERT }}>{recordingError}</p>
            )}
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
                  style={{ background: `${STUDIO}20`, border: `1px solid ${STUDIO}40`, color: STUDIO }}
                >
                  Send ↑
                </button>
              </div>
            )}
            {(isRecording || isTranscribing) && !isLocked && (
              <div className="flex items-center justify-center gap-2 mb-2 h-5">
                {isTranscribing
                  ? <><Loader2 size={13} className="animate-spin" style={{ color: AMBER }} /><span className="text-xs" style={{ color: AMBER }}>Transcribing...</span></>
                  : <span className="text-xs" style={{ color: ALERT }}>Recording…</span>}
              </div>
            )}
            {/* Grid (not flex): minmax(0,1fr) sizes the input track deterministically
                in one layout pass so it shrinks below its content width. Flexbox left
                the input at intrinsic width at initial paint on mobile Safari (min-w-0
                wasn't honored until a reflow), pushing Send + mic — and the mic past
                the content box — off the right edge until recording forced a reflow. */}
            <div className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
              <input
                ref={noteInputRef}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNoteSubmit()}
                placeholder="Drop a session note…"
                className="remi-chat-input min-w-0 w-full px-4 py-2.5 text-sm"
                style={{ color: "var(--text-primary)" }}
              />

              <button
                type="button"
                onClick={handleNoteSubmit}
                className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: STUDIO, color: "#08110f", boxShadow: `0 0 16px ${STUDIO}55` }}
              >
                Send
              </button>

              {/* Amber hold-to-send mic: hold 150ms → record, release → transcribe + send */}
              <button
                type="button"
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: isRecording ? `${ALERT}22` : `${AMBER}14`,
                  border: `1.5px solid ${isRecording ? ALERT : `${AMBER}50`}`,
                  boxShadow: `0 0 12px ${AMBER}3a`,
                  // Mobile fix: transition COLOR only — never "all". transition-all
                  // animated the button's layout/position through mobile viewport
                  // reflows (URL bar, keyboard), parking it clipped at the right edge
                  // at rest until a tap forced a re-layout. Matches MainChat's mic.
                  transition: "background 0.1s ease, border-color 0.1s ease",
                  marginRight: "20px",
                  touchAction: "none",
                }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); pointerStartYRef.current = e.clientY; handleMicDown(); }}
                onPointerMove={(e) => { if (!isRecording || isLocked) return; if (pointerStartYRef.current - e.clientY > 60) setIsLocked(true); }}
                onPointerUp={handleMicUp}
                onPointerLeave={handleMicUp}
                data-testid="button-voice"
              >
                {isTranscribing
                  ? <Loader2 size={16} className="animate-spin" style={{ color: AMBER }} />
                  : isRecording
                  ? <MicOff size={16} style={{ color: ALERT }} />
                  : <Mic size={16} style={{ color: AMBER }} />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Switch Song picker — opens over the active session */}
      {switching && session.active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6 remi-panel-overlay"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setSwitching(false)}
        >
          <div
            className="w-full max-w-xs p-5 space-y-3"
            style={{ background: "var(--surface-elevated)", borderRadius: "var(--radius-xl)", border: `1px solid ${BLUE}40`, boxShadow: `0 0 24px ${BLUE}26` }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
              Switch Song
            </p>
            {session.artist && (
              <p className="text-center text-xs" style={{ color: "var(--text-secondary)" }}>
                {session.artist} · currently {session.song || "—"}
              </p>
            )}
            <input
              value={switchInput}
              onChange={(e) => setSwitchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSwitchSong()}
              placeholder="New song title"
              autoFocus
              className="remi-chat-input w-full px-4 py-3 text-sm"
              style={{ color: "var(--text-primary)" }}
            />
            {switchError && (
              <p className="text-xs text-center" style={{ color: ALERT }}>{switchError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleSwitchSong}
                disabled={!switchInput.trim() || switchBusy}
                className="flex-1 py-3 font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                style={
                  (switchInput.trim() && !switchBusy)
                    ? { background: BLUE, color: "#06101c", borderRadius: "var(--radius-pill)", boxShadow: `0 0 16px ${BLUE}55` }
                    : { background: "var(--surface-card)", color: "var(--text-muted)", borderRadius: "var(--radius-pill)" }
                }
              >
                {switchBusy && <Loader2 size={15} className="animate-spin" />}
                Switch
              </button>
              <button
                onClick={() => setSwitching(false)}
                className="flex-1 py-3 font-semibold text-sm transition-all active:scale-95"
                style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: "var(--radius-pill)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mix Revision overlay — works client mix-feedback notes for the active song */}
      {mixRevOpen && session.active && session.song_page_id && (
        <MixRevisionPanel
          pageId={session.song_page_id}
          songLabel={session.artist && session.song
            ? `${session.artist} — ${session.song}`
            : session.song || session.artist || undefined}
          onClose={() => setMixRevOpen(false)}
        />
      )}
    </div>
  );
}
