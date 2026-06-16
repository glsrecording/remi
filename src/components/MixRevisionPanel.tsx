import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, X, Check, List as ListIcon, Square as CardIcon } from "lucide-react";

// Self-contained Mix Revision overlay. Reads/writes the song page's
// "Mix Revision — [date]" toggle on Notion via the /mix_revision endpoints.
// Notion is the source of truth; this panel holds working state for the session.
// Rendered over the active Studio Session — it never navigates away.

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };

export const MIX_REV_COLOR = "#8b5cf6"; // purple — distinct from amber/green/blue/red

interface MixNote {
  client: string;
  josh: string;
}

interface Props {
  pageId: string;
  songLabel?: string;
  onClose: () => void;
}

function todayLabel(): string {
  // "June 9, 2026" — matches the backend's %B %#d, %Y toggle label format.
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function MixRevisionPanel({ pageId, songLabel, onClose }: Props) {
  const [date] = useState(todayLabel);            // stable for this session
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<"open" | "finished">("open");
  const [notes, setNotes] = useState<MixNote[]>([]);
  const [hasRevision, setHasRevision] = useState(false);  // false → show paste field
  const [pasteText, setPasteText] = useState("");
  const [view, setView] = useState<"card" | "list">("card");
  const [current, setCurrent] = useState(0);
  const [joshInput, setJoshInput] = useState("");
  const [saving, setSaving] = useState(false);
  // True once the user answers the last note in card view — shows a clear
  // "all answered" end state with a prominent Finished button instead of
  // silently parking on the last card.
  const [atEnd, setAtEnd] = useState(false);

  // ── Load existing revision on open ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setAtEnd(false);
    fetch(
      `${JARVIS_URL}/mix_revision?page_id=${encodeURIComponent(pageId)}&date=${encodeURIComponent(date)}`,
      { headers: AUTH_HEADERS },
    )
      .then((r) => r.json())
      .then((data: { exists?: boolean; status?: string; notes?: MixNote[] }) => {
        if (cancelled) return;
        if (data && data.exists) {
          const loaded = Array.isArray(data.notes) ? data.notes : [];
          setHasRevision(true);
          setStatus(data.status === "finished" ? "finished" : "open");
          setNotes(loaded);
          const firstUnanswered = loaded.findIndex((n) => !(n.josh || "").trim());
          setCurrent(firstUnanswered >= 0 ? firstUnanswered : 0);
        } else {
          setHasRevision(false);
          setNotes([]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Couldn't load this revision — check the connection.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, date]);

  // Keep the josh input in sync with whichever card is active.
  useEffect(() => {
    setJoshInput(notes[current]?.josh || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // ── Persist to Notion (serialized, coalesced) ─────────────────────────────
  // Saves are SERIALIZED: only one POST is ever in flight, and rapid saves
  // collapse to the latest full state. Two overlapping rewrites used to corrupt
  // the toggle mid-write and made reopens read partial data (Bug MR-READ).
  const savingRef = useRef(false);
  const pendingRef = useRef<{ notes: MixNote[]; status: "open" | "finished" } | null>(null);

  const flushSave = useCallback(async () => {
    if (savingRef.current) return;          // a save is already running
    const job = pendingRef.current;
    if (!job) return;
    pendingRef.current = null;              // claim the latest queued state
    savingRef.current = true;
    setSaving(true);
    try {
      await fetch(`${JARVIS_URL}/mix_revision`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: pageId,
          notes: job.notes,
          status: job.status,
          date,
        }),
      });
    } catch {
      // non-fatal — local state is retained, user can retry
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingRef.current) flushSave();  // newer state queued while we saved
    }
  }, [pageId, date]);

  const save = useCallback(
    (nextNotes: MixNote[], nextStatus: "open" | "finished") => {
      pendingRef.current = { notes: nextNotes, status: nextStatus };  // coalesce
      flushSave();
    },
    [flushSave],
  );

  // ── Paste + parse: one client note per non-blank line ─────────────────────
  const handlePasteSubmit = useCallback(() => {
    const parsed: MixNote[] = pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => ({ client: line, josh: "" }));
    if (!parsed.length) return;
    setNotes(parsed);
    setHasRevision(true);
    setStatus("open");
    setCurrent(0);
    setView("card");
    setAtEnd(false);
    setPasteText("");
    save(parsed, "open");
  }, [pasteText, save]);

  // ── Advance to next unanswered note (card view) ───────────────────────────
  const advance = useCallback(
    (arr: MixNote[], from: number) => {
      const after = arr.findIndex((n, i) => i > from && !(n.josh || "").trim());
      if (after >= 0) {
        setCurrent(after);
        return;
      }
      const any = arr.findIndex((n) => !(n.josh || "").trim());
      if (any >= 0) {
        setCurrent(any);
        return;
      }
      setCurrent(Math.min(from + 1, arr.length - 1)); // all answered — stay near end
    },
    [],
  );

  const submitResponse = useCallback(() => {
    const val = joshInput.trim();
    const next = notes.map((n, i) => (i === current ? { ...n, josh: val } : n));
    setNotes(next);
    setJoshInput("");
    save(next, "open");
    // If that was the last unanswered note, surface a clear end state instead of
    // silently advancing/parking — otherwise the only "done" signal is the
    // Mark Finished button at the bottom, which Josh kept missing.
    if (next.length > 0 && next.every((n) => (n.josh || "").trim())) {
      setAtEnd(true);
    } else {
      advance(next, current);
    }
  }, [joshInput, notes, current, save, advance]);

  // ── List view edits ───────────────────────────────────────────────────────
  const updateNoteJosh = useCallback((i: number, val: string) => {
    setNotes((prev) => prev.map((n, idx) => (idx === i ? { ...n, josh: val } : n)));
  }, []);

  const persistList = useCallback(() => {
    save(notes, status === "finished" ? "finished" : "open");
  }, [notes, status, save]);

  // ── Finished / Reopen ─────────────────────────────────────────────────────
  const handleFinish = useCallback(() => {
    setStatus("finished");
    save(notes, "finished");
  }, [notes, save]);

  const handleReopen = useCallback(() => {
    setStatus("open");
    setView("card");
    setAtEnd(false);
    const fu = notes.findIndex((n) => !(n.josh || "").trim());
    setCurrent(fu >= 0 ? fu : 0);
    save(notes, "open");
  }, [notes, save]);

  // ── Mic: 150ms hold-to-record → transcript fills the Josh input ───────────
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);

  function handleMicDown() {
    if (isRecording) return;
    holdActiveRef.current = false;
    setMicError(null);
    holdTimerRef.current = setTimeout(async () => {
      holdActiveRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!holdActiveRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
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
            setIsTranscribing(true);
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
              if (transcript) {
                setJoshInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
              } else {
                setMicError("Nothing captured — try again.");
              }
            } catch {
              setMicError("Transcription failed — check connection.");
            } finally {
              setIsTranscribing(false);
            }
          }, 800);
        };
        recorder.start(100);
        setIsRecording(true);
      } catch {
        setMicError("Microphone permission is blocked or unavailable.");
      }
    }, 150);
  }

  function handleMicUp() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdActiveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }

  // Stop any in-flight recording if the panel unmounts.
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const answeredCount = notes.filter((n) => (n.josh || "").trim()).length;
  const allAnswered = notes.length > 0 && answeredCount === notes.length;
  const cardNote = notes[current];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col remi-panel-overlay"
      style={{ background: "var(--t-bg)", color: "var(--t-text)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 border-b border-white/5 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Close mix revision"
        >
          <X size={20} />
        </button>
        <span
          className="text-sm font-semibold tracking-widest uppercase"
          style={{ color: MIX_REV_COLOR }}
        >
          Mix Revision
        </span>
        {hasRevision && status === "open" ? (
          <button
            onClick={() => setView((v) => (v === "card" ? "list" : "card"))}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1"
            aria-label="Toggle view"
          >
            {view === "card" ? <ListIcon size={18} /> : <CardIcon size={18} />}
          </button>
        ) : (
          <span style={{ width: 36 }} />
        )}
      </div>

      {/* Song + date strip */}
      <div className="px-5 pt-3 pb-1 shrink-0">
        <p className="text-base font-semibold truncate" style={{ color: "var(--t-text)" }}>
          {songLabel ? `🎚️ ${songLabel}` : "🎚️ Mix Revision"}
        </p>
        <p className="text-xs" style={{ color: "var(--t-text6)" }}>
          {date}
          {saving && <span style={{ color: MIX_REV_COLOR }}> · saving…</span>}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 pt-20">
            <Loader2 size={24} className="animate-spin" style={{ color: MIX_REV_COLOR }} />
            <p className="text-sm" style={{ color: "var(--t-text5)" }}>Loading revision…</p>
          </div>
        ) : loadError ? (
          <div className="pt-20 text-center">
            <p className="text-sm" style={{ color: "#ef4444" }}>{loadError}</p>
          </div>
        ) : !hasRevision ? (
          /* ── Paste field — no revision yet for today ── */
          <div className="pt-4 space-y-3">
            <p className="text-xs uppercase tracking-widest" style={{ color: "var(--t-text7)" }}>
              Paste client notes
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Paste client notes here — one per line"}
              rows={10}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
            />
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
              style={{
                background: pasteText.trim() ? MIX_REV_COLOR : "rgba(139,92,246,0.15)",
                color: pasteText.trim() ? "#fff" : "rgba(139,92,246,0.4)",
              }}
            >
              Submit
            </button>
          </div>
        ) : status === "finished" ? (
          /* ── Finished: read-only + Reopen ── */
          <div className="pt-4 space-y-3">
            <div
              className="rounded-xl px-3 py-2 text-center text-xs font-semibold uppercase tracking-widest"
              style={{ background: "rgba(139,92,246,0.12)", color: MIX_REV_COLOR }}
            >
              ✓ Revision finished
            </div>
            {notes.map((n, i) => (
              <div
                key={i}
                className="rounded-xl border p-3 space-y-1.5"
                style={{ background: "var(--t-surface)", borderColor: "var(--t-border)" }}
              >
                <p className="text-sm" style={{ color: "var(--t-text)" }}>
                  <span style={{ color: MIX_REV_COLOR }}>Client:</span> {n.client}
                </p>
                <p className="text-sm" style={{ color: "var(--t-text3)" }}>
                  <span style={{ color: "#4ade80" }}>Josh:</span> {n.josh || "—"}
                </p>
              </div>
            ))}
            <button
              onClick={handleReopen}
              className="w-full py-3 rounded-xl font-semibold text-sm border transition-all active:scale-95"
              style={{ background: "transparent", borderColor: MIX_REV_COLOR, color: MIX_REV_COLOR }}
            >
              Reopen
            </button>
          </div>
        ) : view === "list" ? (
          /* ── List view — all notes, editable josh fields ── */
          <div className="pt-4 space-y-3">
            <p className="text-xs uppercase tracking-widest" style={{ color: "var(--t-text7)" }}>
              {answeredCount} / {notes.length} answered
            </p>
            {notes.map((n, i) => (
              <div
                key={i}
                className="rounded-xl border p-3 space-y-2"
                style={{ background: "var(--t-surface)", borderColor: "var(--t-border)" }}
              >
                <p className="text-sm" style={{ color: "var(--t-text)" }}>
                  <span style={{ color: MIX_REV_COLOR }}>{i + 1}.</span> {n.client}
                </p>
                <input
                  value={n.josh}
                  onChange={(e) => updateNoteJosh(i, e.target.value)}
                  onBlur={persistList}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  placeholder="Josh's response…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            ))}
            <button
              onClick={handleFinish}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
              style={{ background: MIX_REV_COLOR, color: "#fff" }}
            >
              {allAnswered ? "Finished" : "Mark Finished"}
            </button>
          </div>
        ) : atEnd && allAnswered ? (
          /* ── End state — all notes answered, prompt to finish ── */
          <div className="pt-16 flex flex-col items-center gap-6 px-2">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.12)" }}
              >
                <Check className="h-8 w-8" style={{ color: MIX_REV_COLOR }} />
              </div>
              <p className="text-lg font-semibold text-center" style={{ color: "var(--t-text)" }}>
                All notes answered — Mark Finished?
              </p>
              <p className="text-xs" style={{ color: "var(--t-text6)" }}>
                {notes.length} / {notes.length} answered
              </p>
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-4 rounded-xl font-semibold text-base transition-all active:scale-95"
              style={{ background: MIX_REV_COLOR, color: "#fff" }}
            >
              Finished
            </button>
          </div>
        ) : (
          /* ── Card view — one note at a time ── */
          <div className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest" style={{ color: "var(--t-text7)" }}>
                Note {notes.length ? current + 1 : 0} / {notes.length}
              </p>
              <p className="text-xs" style={{ color: "var(--t-text6)" }}>
                {answeredCount} answered
              </p>
            </div>

            {cardNote && (
              <>
                {/* Client note (read-only) */}
                <div
                  className="rounded-xl border p-4"
                  style={{ background: "var(--t-surface)", borderColor: "rgba(139,92,246,0.35)" }}
                >
                  <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: MIX_REV_COLOR }}>
                    Client
                  </p>
                  <p className="text-base leading-snug" style={{ color: "var(--t-text)" }}>
                    {cardNote.client}
                  </p>
                </div>

                {micError && <p className="text-xs text-red-400/80 text-center">{micError}</p>}
                {(isRecording || isTranscribing) && (
                  <div className="flex items-center justify-center gap-2 h-5">
                    {isTranscribing ? (
                      <>
                        <Loader2 size={13} className="animate-spin" style={{ color: MIX_REV_COLOR }} />
                        <span className="text-xs" style={{ color: MIX_REV_COLOR }}>Transcribing…</span>
                      </>
                    ) : (
                      <span className="text-xs" style={{ color: "#ef4444" }}>Recording…</span>
                    )}
                  </div>
                )}

                {/* Josh response input + mic */}
                <div className="flex gap-2 items-center">
                  <input
                    value={joshInput}
                    onChange={(e) => setJoshInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitResponse()}
                    placeholder="Josh's response…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                  />
                  <button
                    type="button"
                    className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150"
                    style={{
                      background: isRecording ? "#ef444422" : "rgba(139,92,246,0.08)",
                      border: `1.5px solid ${isRecording ? "#ef4444" : "rgba(139,92,246,0.5)"}`,
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      e.preventDefault();
                      handleMicDown();
                    }}
                    onPointerUp={handleMicUp}
                    onPointerLeave={handleMicUp}
                    aria-label="Hold to record response"
                  >
                    {isTranscribing ? (
                      <Loader2 size={16} className="animate-spin" style={{ color: MIX_REV_COLOR }} />
                    ) : isRecording ? (
                      <MicOff size={16} style={{ color: "#ef4444" }} />
                    ) : (
                      <Mic size={16} style={{ color: MIX_REV_COLOR }} />
                    )}
                  </button>
                </div>

                {/* Next */}
                <button
                  onClick={submitResponse}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                  style={{ background: MIX_REV_COLOR, color: "#fff" }}
                >
                  Next
                </button>
              </>
            )}

            {/* Answered notes for reference */}
            {answeredCount > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--t-text7)" }}>
                  Answered
                </p>
                {notes.map((n, i) =>
                  (n.josh || "").trim() ? (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      className="w-full text-left rounded-lg p-3 space-y-1"
                      style={{ background: "var(--t-el-low)" }}
                    >
                      <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--t-text3)" }}>
                        <Check className="h-3 w-3" style={{ color: "#4ade80" }} />
                        {n.client}
                      </p>
                      <p className="text-xs pl-5" style={{ color: "var(--t-text5)" }}>
                        {n.josh}
                      </p>
                    </button>
                  ) : null,
                )}
              </div>
            )}

            {/* Finished — always available while open */}
            {notes.length > 0 && (
              <button
                onClick={handleFinish}
                className="w-full py-3 rounded-xl font-semibold text-sm border transition-all active:scale-95"
                style={{
                  background: allAnswered ? MIX_REV_COLOR : "transparent",
                  borderColor: MIX_REV_COLOR,
                  color: allAnswered ? "#fff" : MIX_REV_COLOR,
                }}
              >
                {allAnswered ? "Finished" : "Mark Finished"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
