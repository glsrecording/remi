import { useState, useEffect, useRef } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

type TrackState = "idle" | "running" | "confirming";

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function localISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 19);
}

export default function TimeTrack() {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [menuOpen, setMenuOpen] = useState(false);

  const [state, setState]       = useState<TrackState>("idle");
  const [activity, setActivity] = useState("");
  const [client, setClient]     = useState("");
  const [category, setCategory] = useState("");
  const [elapsed, setElapsed]   = useState(0);
  const [notes, setNotes]       = useState("");
  const [toast, setToast]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  const CATEGORIES = ["Studio", "Build", "Content", "Admin", "Family", "Home", "Friends"];

  const startTimeRef = useRef<string>("");
  const endTimeRef   = useRef<string>("");
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startEpoch   = useRef<number>(0);

  useEffect(() => {
    if (state === "running") {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startEpoch.current) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function handleStart() {
    if (!activity.trim() || !category) return;
    startEpoch.current = Date.now();
    startTimeRef.current = localISO();
    setElapsed(0);
    setState("running");
  }

  function handleStop() {
    endTimeRef.current = localISO();
    setState("confirming");
  }

  async function handleLog() {
    setSaving(true);
    try {
      const res = await fetch(`${JARVIS_URL}/timelog`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REMI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activity: activity.trim(),
          client: client.trim() || undefined,
          category: category || undefined,
          start_iso: startTimeRef.current,
          end_iso: endTimeRef.current,
          duration_seconds: elapsed,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { minutes: number };
      const h = Math.floor(data.minutes / 60);
      const m = data.minutes % 60;
      const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
      setToast(`Logged ${dur} — ${activity.trim()}`);
    } catch {
      setToast("Save failed — try again");
    } finally {
      setSaving(false);
      setState("idle");
      setActivity("");
      setClient("");
      setCategory("");
      setNotes("");
      setElapsed(0);
    }
  }

  function handleDiscard() {
    setState("idle");
    setCategory("");
    setNotes("");
    setElapsed(0);
  }

  const frozenDisplay = fmt(elapsed);

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader title="Time Track" color={remiColor} onMenu={() => setMenuOpen(true)} />

      <div
        className="flex-1 flex flex-col items-center justify-center px-6 gap-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >

        {/* ── IDLE ── */}
        {state === "idle" && (
          <>
            <div className="w-full flex flex-col gap-3">
              {/* Category chips */}
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(category === cat ? "" : cat)}
                    className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                    style={{
                      background: category === cat ? remiColor : "var(--t-el-low)",
                      color: category === cat ? "#111" : "var(--t-text5)",
                      border: `1px solid ${category === cat ? remiColor : "var(--t-border-md)"}`,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <input
                autoFocus
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
                placeholder="What are you working on?"
                className="w-full rounded-2xl px-4 py-4 text-base font-medium focus:outline-none transition-colors"
                style={{
                  background: "var(--t-card)",
                  border: "1.5px solid var(--t-border-md)",
                  color: "var(--t-text2)",
                }}
              />
              <input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
                placeholder="Client / Artist (optional)"
                className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none transition-colors"
                style={{
                  background: "var(--t-card)",
                  border: "1px solid var(--t-border)",
                  color: "var(--t-text3)",
                }}
              />
            </div>

            <button
              className="w-full py-5 rounded-2xl text-base font-bold tracking-wide transition-all active:scale-[0.97]"
              style={{
                background: activity.trim() && category ? remiColor : "rgba(255,255,255,0.06)",
                color: activity.trim() && category ? "#111" : "rgba(255,255,255,0.2)",
                cursor: activity.trim() && category ? "pointer" : "default",
              }}
              onClick={handleStart}
              disabled={!activity.trim() || !category}
            >
              START
            </button>
          </>
        )}

        {/* ── RUNNING ── */}
        {state === "running" && (
          <>
            <div className="flex flex-col items-center gap-2">
              <p
                className="font-bold tabular-nums"
                style={{
                  fontSize: "72px",
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  color: remiColor,
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {fmt(elapsed)}
              </p>
              <p className="text-sm font-medium" style={{ color: "var(--t-text3)" }}>
                {activity.trim()}
              </p>
              {category && (
                <span
                  className="text-xs px-2 py-0.5 rounded-lg font-medium"
                  style={{ background: remiColor + "20", color: remiColor }}
                >
                  {category}
                </span>
              )}
              {client.trim() && (
                <p className="text-xs" style={{ color: "var(--t-text6)" }}>
                  {client.trim()}
                </p>
              )}
            </div>

            <button
              className="w-full py-5 rounded-2xl text-base font-bold tracking-wide transition-all active:scale-[0.97]"
              style={{ background: "rgba(239,68,68,0.15)", color: "rgba(239,68,68,0.9)" }}
              onClick={handleStop}
            >
              STOP
            </button>
          </>
        )}

        {/* ── CONFIRMING ── */}
        {state === "confirming" && (
          <>
            <div className="flex flex-col items-center gap-2">
              <p
                className="font-bold tabular-nums"
                style={{
                  fontSize: "72px",
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  color: "var(--t-text4)",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {frozenDisplay}
              </p>
              <p className="text-sm font-medium" style={{ color: "var(--t-text3)" }}>
                {activity.trim()}
              </p>
              {category && (
                <span
                  className="text-xs px-2 py-0.5 rounded-lg font-medium"
                  style={{ background: remiColor + "20", color: remiColor }}
                >
                  {category}
                </span>
              )}
              {client.trim() && (
                <p className="text-xs" style={{ color: "var(--t-text6)" }}>
                  {client.trim()}
                </p>
              )}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={3}
              className="w-full rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors"
              style={{
                background: "var(--t-card)",
                border: "1px solid var(--t-border)",
                color: "var(--t-text3)",
              }}
            />

            <div className="w-full flex flex-col gap-2">
              <button
                className="w-full py-4 rounded-2xl text-base font-bold tracking-wide transition-all active:scale-[0.97]"
                style={{
                  background: saving ? remiColor + "60" : remiColor,
                  color: "#111",
                }}
                onClick={handleLog}
                disabled={saving}
              >
                {saving ? "Saving…" : "LOG IT"}
              </button>
              <button
                className="w-full py-3 rounded-2xl text-sm font-medium transition-all active:scale-[0.97]"
                style={{ background: "var(--t-el-low)", color: "var(--t-text5)" }}
                onClick={handleDiscard}
                disabled={saving}
              >
                Discard
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg"
          style={{
            background: "var(--t-card)",
            border: "1px solid var(--t-border-md)",
            color: "var(--t-text2)",
            maxWidth: "calc(100vw - 48px)",
            zIndex: 999,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
