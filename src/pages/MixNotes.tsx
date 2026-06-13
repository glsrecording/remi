import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

// Screen identity — Mix Notes is the studio capture tool → --color-studio teal.
// Mics / voice capture use --color-tasks amber; recording/error stay semantic red.
const ACCENT = "#3dd6b0";  // --color-studio (teal) — title, badges, accents, glow
const AMBER  = "#f5a623";  // --color-tasks  — mic / voice capture / jog
const ALERT  = "#ef4444";  // recording / error (semantic, mode-independent)
const DONE   = "#5bc468";  // --color-done   — "saved" flash

interface SessionNote {
  id: string;
  artist: string;
  song: string;
  note: string;
  timestamp: string;
}

interface ViewNote {
  id: string;
  note: string;
  created_time: string;
}

interface ViewGroup {
  artist: string;
  song: string;
  notes: ViewNote[];
}

function SwipeableNote({
  note,
  accent,
  onDismiss,
}: {
  note: ViewNote;
  accent: string;
  onDismiss: (id: string) => void;
}) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX = useRef(0);
  const dragging = useRef(false);

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    dragging.current = true;
    setAnimating(false);
  }

  function onMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setDx(Math.max(0, e.clientX - startX.current));
  }

  function onUp() {
    if (!dragging.current) return;
    dragging.current = false;
    setAnimating(true);
    if (dx > 80) {
      setDx(window.innerWidth);
      onDismiss(note.id);
    } else {
      setDx(0);
    }
  }

  function onCancel() {
    dragging.current = false;
    setAnimating(true);
    setDx(0);
  }

  return (
    <div
      className="px-4 py-3"
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-md)",
        borderLeft: `2px solid ${accent}`,
        borderTop: `1px solid ${dx > 30 ? accent + "60" : "var(--border-subtle)"}`,
        borderRight: `1px solid ${dx > 30 ? accent + "60" : "var(--border-subtle)"}`,
        borderBottom: `1px solid ${dx > 30 ? accent + "60" : "var(--border-subtle)"}`,
        // Lighter glow than task cards — notes are secondary to songs.
        boxShadow: `0 0 8px ${accent}26`,
        touchAction: "pan-y",
        userSelect: "none",
        transform: `translateX(${dx}px)`,
        transition: animating ? "transform 0.25s ease, opacity 0.25s ease" : "none",
        opacity: 1 - Math.min(dx / 180, 0.6),
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      <p className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>{note.note}</p>
      <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>{fmtDateTime(note.created_time)}</p>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${date} · ${time}`;
  } catch { return iso.slice(0, 10); }
}

export default function MixNotes() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "view" | "jog">("new");
  const [noteFocused, setNoteFocused] = useState(false);  // teal pill glow on focus

  // ── Jog Mode feedback (observes the shared capture path, never modifies it) ──
  const [jogFlash, setJogFlash]   = useState<null | "saved" | "error">(null);
  const prevNotesLenRef           = useRef(0);
  const jogFlashTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── New Note state ──────────────────────────────────────────────────────────
  const [artist, setArtist] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("mix_notes_prefill") || "{}").artist || ""; }
    catch { return ""; }
  });
  const [song, setSong] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("mix_notes_prefill") || "{}").song || ""; }
    catch { return ""; }
  });

  useEffect(() => { sessionStorage.removeItem("mix_notes_prefill"); }, []);

  const [sessionNotes, setSessionNotes]     = useState<SessionNote[]>([]);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [noteText, setNoteText]             = useState("");

  // ── View Notes state ────────────────────────────────────────────────────────
  const [viewGroups,  setViewGroups]  = useState<ViewGroup[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError,   setViewError]   = useState<string | null>(null);
  const [pulling,     setPulling]     = useState(false);
  const touchStartY = useRef(0);
  const isAtTop     = useRef(true);

  function handleDismissNote(noteId: string) {
    // Fire archive API immediately (no await — fire and forget)
    fetch(`${JARVIS_URL}/scheduler/update`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: noteId, action: "done" }),
    }).catch(() => {/* no recovery — note is already dismissed in UI */});
    // Delay UI removal to let the slide-out animation finish
    setTimeout(() => {
      setViewGroups((prev) =>
        prev
          .map((g) => ({ ...g, notes: g.notes.filter((n) => n.id !== noteId) }))
          .filter((g) => g.notes.length > 0)
      );
    }, 270);
  }

  const loadViewNotes = useCallback(async () => {
    setViewLoading(true);
    setViewError(null);
    try {
      const r = await fetch(`${JARVIS_URL}/mix_notes`, {
        headers: { Authorization: `Bearer ${REMI_API_KEY}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      setViewGroups(data.groups ?? []);
    } catch (e) {
      setViewError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setViewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "view") loadViewNotes();
  }, [mode, loadViewNotes]);

  // Jog Mode flashes "saved" when a new note lands in the shared list, and
  // "error" if the capture path reports a failure. Pure observation — the
  // recording/transcription/submit path is untouched.
  useEffect(() => {
    if (mode === "jog" && sessionNotes.length > prevNotesLenRef.current) {
      setJogFlash("saved");
      if (jogFlashTimerRef.current) clearTimeout(jogFlashTimerRef.current);
      jogFlashTimerRef.current = setTimeout(() => setJogFlash(null), 1600);
    }
    prevNotesLenRef.current = sessionNotes.length;
  }, [sessionNotes.length, mode]);

  useEffect(() => {
    if (mode !== "jog" || !recordingError) return;
    setJogFlash("error");
    if (jogFlashTimerRef.current) clearTimeout(jogFlashTimerRef.current);
    jogFlashTimerRef.current = setTimeout(() => setJogFlash(null), 2200);
  }, [recordingError, mode]);

  // ── Mic state ───────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked]       = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const holdTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef    = useRef(false);
  const pointerStartYRef = useRef<number>(0);
  const micStartTimeRef  = useRef<number>(0);

  async function postMixNote(noteText: string) {
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setSessionNotes((prev) => [{
      id: Date.now().toString(),
      artist: artist.trim(),
      song: song.trim(),
      note: noteText,
      timestamp: ts,
    }, ...prev]);
    try {
      const resp = await fetch(`${JARVIS_URL}/mix_note`, {
        method: "POST",
        headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ artist: artist.trim(), song: song.trim(), note: noteText }),
      });
      if (!resp.ok) setRecordingError("Notion write failed — note saved locally.");
    } catch {
      setRecordingError("Connection error — note saved locally.");
    }
  }

  function submitTextNote() {
    const t = noteText.trim();
    if (!t) return;
    setNoteText("");
    postMixNote(t);   // same POST /mix_note path the mic uses
  }

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
          if (Date.now() - micStartTimeRef.current < 500) { audioChunksRef.current = []; return; }
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
              if (transcript) await postMixNote(transcript);
              else setRecordingError("Nothing captured — try again.");
            } catch {
              setRecordingError("Transcription failed — check connection.");
            }
          }, 800);
        };
        recorder.start(100);
        micStartTimeRef.current = Date.now();
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

  async function handlePullEnd(e: React.TouchEvent) {
    if (!isAtTop.current || viewLoading || pulling) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 70) {
      setPulling(true);
      await loadViewNotes();
      setPulling(false);
    }
  }

  return (
    <div
      className="flex flex-col h-full w-full"
      style={{
        background: "var(--surface-base)",
        // Jog mode: subtle whole-screen teal glow to signal the different mode.
        boxShadow: mode === "jog" ? `inset 0 0 80px ${ACCENT}1f` : "none",
        transition: "box-shadow 0.3s ease",
      }}
    >
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader title="Mix Notes" color={ACCENT} onMenu={() => setMenuOpen(true)} />

      {/* Mode toggle — pill segmented control, teal active (matches Tasks filters) */}
      <div className="px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div
          className="flex p-0.5"
          style={{ background: "var(--surface-card)", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-default)" }}
        >
          {([
            { label: "New Note",   value: "new"  },
            { label: "View Notes", value: "view" },
            { label: "Jog",        value: "jog"  },
          ] as const).map(({ label, value }) => {
            const isActive = mode === value;
            return (
              <button
                key={value}
                className="flex-1 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: isActive ? `${ACCENT}22` : "transparent",
                  color:      isActive ? ACCENT : "var(--text-muted)",
                  border:     isActive ? `1px solid ${ACCENT}66` : "1px solid transparent",
                  borderRadius: "var(--radius-pill)",
                }}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── NEW NOTE mode ───────────────────────────────────────────────────── */}
      {mode === "new" && (
        <>
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex gap-2">
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist"
                className="flex-1 min-w-0 px-3 py-2 text-sm outline-none placeholder:opacity-60"
                style={{
                  background: "var(--surface-elevated)",
                  border: `1px solid ${ACCENT}40`,
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-primary)",
                }}
              />
              <input
                value={song}
                onChange={(e) => setSong(e.target.value)}
                placeholder="Song"
                className="flex-1 min-w-0 px-3 py-2 text-sm outline-none placeholder:opacity-60"
                style={{
                  background: "var(--surface-elevated)",
                  border: `1px solid ${ACCENT}40`,
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ paddingBottom: "120px" }}>
            {sessionNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Hold mic to capture a note</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Notes go straight to Notion</p>
              </div>
            ) : (
              sessionNotes.map((n) => (
                <div
                  key={n.id}
                  className="px-4 py-3"
                  style={{
                    background: "var(--surface-card)",
                    borderRadius: "var(--radius-md)",
                    borderLeft: `2px solid ${ACCENT}`,
                    borderTop: "1px solid var(--border-subtle)",
                    borderRight: "1px solid var(--border-subtle)",
                    borderBottom: "1px solid var(--border-subtle)",
                    boxShadow: `0 0 8px ${ACCENT}26`,
                  }}
                >
                  <p className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>{n.note}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {n.timestamp}
                    {(n.artist || n.song) && " · "}
                    {n.artist}{n.artist && n.song ? " / " : ""}{n.song}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Fixed bottom mic bar */}
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--surface-base)", zIndex: 10, padding: "12px 16px 48px" }}>
            {recordingError && (
              <p className="text-xs mb-1.5 text-center" style={{ color: ALERT }}>{recordingError}</p>
            )}
            {isLocked && (
              <div className="flex items-center justify-between mb-2 px-1">
                <button type="button" onClick={handleCancelLocked} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: `${ALERT}20`, border: `1px solid ${ALERT}40`, color: ALERT }}>
                  ✕ Cancel
                </button>
                <span className="text-xs" style={{ color: ALERT }}>🔒 Recording</span>
                <button type="button" onClick={handleSendLocked} className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: `${DONE}20`, border: `1px solid ${DONE}40`, color: DONE }}>
                  Send ↑
                </button>
              </div>
            )}
            {isRecording && !isLocked && (
              <div className="flex items-center justify-center gap-2 mb-2 h-5">
                <span className="text-xs" style={{ color: ALERT }}>Recording…</span>
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); submitTextNote(); }}
              className="flex gap-2 items-center"
            >
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onFocus={() => setNoteFocused(true)}
                onBlur={() => setNoteFocused(false)}
                placeholder={
                  artist || song
                    ? `Mix note for ${artist}${artist && song ? " / " : ""}${song}…`
                    : "Type a mix note…"
                }
                className="flex-1 px-4 py-2.5 text-sm outline-none placeholder:opacity-60"
                style={{
                  background: "var(--surface-elevated)",
                  borderRadius: "var(--radius-pill)",
                  color: "var(--text-primary)",
                  // Teal pill, brightens + glows on focus (same idea as MainChat input).
                  border: noteFocused
                    ? `1.5px solid ${ACCENT}`
                    : `1.5px solid ${ACCENT}66`,
                  boxShadow: noteFocused
                    ? `0 0 16px ${ACCENT}40, inset 0 0 10px ${ACCENT}1f`
                    : "none",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                }}
              />
              <button
                type="submit"
                className="shrink-0 px-4 py-2.5 text-sm font-medium transition-all active:scale-95"
                style={
                  noteText.trim()
                    ? { background: ACCENT, color: "#08110f", borderRadius: "var(--radius-pill)", boxShadow: `0 0 16px ${ACCENT}55` }
                    : { background: "transparent", color: "var(--text-secondary)", border: `1.5px solid ${ACCENT}80`, borderRadius: "var(--radius-pill)" }
                }
              >
                Send
              </button>
              <button
                type="button"
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150"
                style={{
                  background: isRecording ? `${ALERT}22` : `${AMBER}14`,
                  border: `1.5px solid ${isRecording ? ALERT : `${AMBER}50`}`,
                  boxShadow: `0 0 12px ${AMBER}3a`,
                  marginRight: "20px",
                  touchAction: "none",
                }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); pointerStartYRef.current = e.clientY; handleMicDown(); }}
                onPointerMove={(e) => { if (!isRecording || isLocked) return; if (pointerStartYRef.current - e.clientY > 60) setIsLocked(true); }}
                onPointerUp={handleMicUp}
                onPointerLeave={handleMicUp}
              >
                {isRecording
                  ? <MicOff size={16} style={{ color: ALERT }} />
                  : <Mic size={16} style={{ color: AMBER }} />}
              </button>
            </form>
          </div>
        </>
      )}

      {/* ── VIEW NOTES mode ─────────────────────────────────────────────────── */}
      {mode === "view" && (
        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          onScroll={(e) => { isAtTop.current = e.currentTarget.scrollTop === 0; }}
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={handlePullEnd}
        >
          {pulling && (
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 size={14} className="animate-spin" style={{ color: ACCENT }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Refreshing…</span>
            </div>
          )}

          {viewLoading && !pulling && (
            <div className="flex items-center justify-center gap-2 py-16">
              <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading notes…</span>
            </div>
          )}

          {!viewLoading && viewError && (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm" style={{ color: ALERT }}>Could not load ({viewError})</p>
              <button
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: `${ACCENT}20`, color: ACCENT }}
                onClick={loadViewNotes}
              >
                Retry
              </button>
            </div>
          )}

          {!viewLoading && !viewError && viewGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No mix notes yet.</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Capture notes in New Note mode</p>
            </div>
          )}

          {!viewLoading && !viewError && viewGroups.map((group) => (
            <div key={`${group.artist}||${group.song}`}>
              <div
                className="flex items-center gap-2 mb-2 px-3 py-2"
                style={{
                  background: "var(--surface-card)",
                  borderRadius: "var(--radius-md)",
                  borderLeft: `3px solid ${ACCENT}`,
                  borderTop: "1px solid var(--border-subtle)",
                  borderRight: "1px solid var(--border-subtle)",
                  borderBottom: "1px solid var(--border-subtle)",
                  boxShadow: `0 0 10px ${ACCENT}26`,
                }}
              >
                <div className="flex-1 min-w-0">
                  {group.artist && group.song ? (
                    <>
                      <p
                        className="text-xs uppercase tracking-wide truncate"
                        style={{ color: "var(--text-secondary)", fontFamily: "'Space Mono', monospace" }}
                      >
                        {group.artist}
                      </p>
                      <p className="text-sm truncate" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {group.song}
                      </p>
                    </>
                  ) : (group.artist || group.song) ? (
                    <p className="text-sm truncate" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      {group.song || group.artist}
                    </p>
                  ) : (
                    <p
                      className="text-sm uppercase tracking-wide"
                      style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}
                    >
                      Untitled
                    </p>
                  )}
                </div>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: `${ACCENT}1f`, color: ACCENT }}
                >
                  {group.notes.length}
                </span>
              </div>

              <div className="space-y-1.5">
                {group.notes.map((n) => (
                  <SwipeableNote
                    key={n.id}
                    note={n}
                    accent={ACCENT}
                    onDismiss={handleDismissNote}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── JOG mode — single large mic, nothing else to mis-tap ──────────────── */}
      {mode === "jog" && (
        <div
          className="flex-1 flex flex-col items-center justify-center px-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {/* Session context — same artist/song as New Note */}
          {(artist || song) && (
            <div className="mb-10 w-full max-w-full text-center px-2">
              {artist && (
                <span
                  className="text-sm font-bold tracking-wide uppercase"
                  style={{ color: ACCENT, fontFamily: "'Space Mono', monospace" }}
                >
                  {artist}
                </span>
              )}
              {song && (
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {artist ? " / " : ""}{song}
                </span>
              )}
            </div>
          )}

          {/* Large centered mic — hold to record, release to send (reuses the
              exact handlers from New Note: handleMicDown / handleMicUp + slide-lock).
              Amber = voice capture, consistent with the New Note mic. */}
          <button
            type="button"
            aria-label="Hold to record mix note"
            className={`rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${isRecording ? "animate-pulse" : ""}`}
            style={{
              width: 120,
              height: 120,
              background: isRecording ? `${ALERT}22` : `${AMBER}1f`,
              border: `3px solid ${isRecording ? ALERT : AMBER}`,
              boxShadow: isRecording ? `0 0 0 10px ${ALERT}12` : `0 0 0 8px ${AMBER}12`,
              touchAction: "none",
              WebkitTapHighlightColor: "transparent",
            }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); pointerStartYRef.current = e.clientY; handleMicDown(); }}
            onPointerMove={(e) => { if (!isRecording || isLocked) return; if (pointerStartYRef.current - e.clientY > 60) setIsLocked(true); }}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
          >
            {isRecording
              ? <MicOff size={48} style={{ color: ALERT }} />
              : <Mic size={48} style={{ color: AMBER }} />}
          </button>

          {/* Status line — saved/error flash, recording prompt, or idle hint */}
          <div className="mt-10 h-6 flex items-center justify-center px-4 text-center">
            {jogFlash === "saved" ? (
              <span className="text-sm font-semibold" style={{ color: DONE }}>✓ Note saved</span>
            ) : jogFlash === "error" ? (
              <span className="text-sm font-medium" style={{ color: ALERT }}>{recordingError || "Error — try again"}</span>
            ) : isRecording ? (
              <span className="text-sm" style={{ color: ALERT }}>Recording… release to send</span>
            ) : (
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Hold to record</span>
            )}
          </div>

          {/* Slide-to-lock controls (same as New Note's locked bar) */}
          {isLocked && (
            <div className="flex items-center gap-4 mt-6">
              <button type="button" onClick={handleCancelLocked} className="text-sm px-4 py-2 rounded-xl"
                style={{ background: `${ALERT}20`, border: `1px solid ${ALERT}40`, color: ALERT }}>
                ✕ Cancel
              </button>
              <button type="button" onClick={handleSendLocked} className="text-sm px-4 py-2 rounded-xl"
                style={{ background: `${DONE}20`, border: `1px solid ${DONE}40`, color: DONE }}>
                Send ↑
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
