import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Menu, Square, Coffee, Play, DollarSign } from "lucide-react";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

const HOURLY_RATE_KEY = "remi_session_hourly_rate";

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
  const [stopping, setStopping] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const breakAccumRef = useRef<number>(0);
  const breakStartRef = useRef<number>(0);
  const notesEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = {
    Authorization: `Bearer ${REMI_API_KEY}`,
  };

  // Fetch session state on mount
  useEffect(() => {
    fetch(`${JARVIS_URL}/session`, { headers: authHeaders })
      .then((r) => r.json())
      .then((data: SessionState) => setSession(data))
      .catch(() => {});
  }, []);

  // Poll notes every 10 seconds
  useEffect(() => {
    const poll = () => {
      fetch(`${JARVIS_URL}/session_notes`, { headers: authHeaders })
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

  const handleStop = useCallback(async () => {
    if (!running) return;
    setStopping(true);
    setRunning(false);
    setOnBreak(false);
    if (timerRef.current) clearInterval(timerRef.current);

    const hours = elapsed / 3600;
    const earnings = hours * hourlyRate;
    const label = session.artist && session.song
      ? `${session.artist} / ${session.song}`
      : session.song || session.artist || "session";
    const logMsg = `session log: ${label} — ${fmt(elapsed)} at $${hourlyRate}/hr = $${earnings.toFixed(2)}`;

    try {
      await fetch(`${JARVIS_URL}/remi`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ message: logMsg, user_id: "remi" }),
      });
    } catch {
      // non-fatal
    }
    setStopping(false);
    navigate("/");
  }, [running, elapsed, hourlyRate, session, navigate]);

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

  const earnings = (elapsed / 3600) * hourlyRate;

  const banner = session.artist && session.song
    ? `${session.artist} / ${session.song}`
    : session.song || session.artist || "No active session";

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

      {/* Session banner */}
      <div className="px-5 pt-5 pb-2">
        <div
          className="rounded-xl px-4 py-3 border"
          style={{ background: "#111", borderColor: "rgba(74,222,128,0.2)" }}
        >
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: "#4ade80" }}>
            {session.active ? "Active" : "Idle"}
          </p>
          <p className="text-base font-semibold truncate">{banner}</p>
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
              <button
                onClick={handleStart}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{ background: "#4ade80", color: "#000" }}
              >
                <Play size={16} />
                Start
              </button>
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

      {/* Earnings */}
      <div className="px-5 pb-3">
        <div
          className="rounded-xl px-4 py-3 border flex items-center justify-between"
          style={{ background: "#111", borderColor: "rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center gap-2">
            <DollarSign size={15} style={{ color: "#4ade80" }} />
            <span className="text-sm text-white/50">Earnings</span>
          </div>
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
        </div>
      </div>

      {/* Capture log */}
      <div className="px-5 flex-1 flex flex-col min-h-0">
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
          Session Notes
        </p>
        <div
          className="flex-1 rounded-xl border overflow-y-auto"
          style={{ background: "#111", borderColor: "rgba(255,255,255,0.05)", maxHeight: "280px" }}
        >
          {notes.length === 0 ? (
            <p className="text-sm text-white/25 p-4 text-center">
              Notes captured via Jarvis will appear here
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

      <div style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }} />
    </div>
  );
}
