import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, MicOff, CheckCircle2, Save } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";
import UndoBar from "@/components/UndoBar";

interface WrapSession {
  id: string;
  notes: string;
  timestamp: string;
  date: string;
}

const FAKE_TRANSCRIPTIONS = [
  "Good session today. Got the drop locked in on Midnight Drive, kick is sitting right. Need to revisit the reverb on the vocal in the second chorus tomorrow.",
  "Wrapped up the Kayla EP stems. Everything bounced clean. Marcus wants revisions on the bridge — flagged for tomorrow.",
  "Quick session, only got an hour in. Sorted the mix notes backlog and replied to the venue email about the Northside show.",
];

export default function WrapUp() {
  const [, navigate] = useLocation();
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [userColor] = useLocalStorage<string>(STORAGE_KEYS.USER_COLOR, "#f59e0b");
  const [sessions, setSessions] = useLocalStorage<WrapSession[]>("remi:wrap-sessions", []);

  const [notes, setNotes] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHoldStart = () => {
    holdTimer.current = setTimeout(() => {
      setIsRecording(true);
    }, 300);
  };

  const handleHoldEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      setTimeout(() => {
        const transcription = FAKE_TRANSCRIPTIONS[Math.floor(Math.random() * FAKE_TRANSCRIPTIONS.length)];
        setNotes((prev) => prev ? `${prev}\n\n${transcription}` : transcription);
        setIsTranscribing(false);
      }, 1200);
    }
  };

  const handleSave = () => {
    if (!notes.trim()) return;
    const now = new Date();
    const id = Date.now().toString();
    const session: WrapSession = {
      id,
      notes: notes.trim(),
      timestamp: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    setSessions((prev) => [session, ...prev]);
    setUndoId(id);
    setSaved(true);
    setNotes("");
  };

  const handleUndo = () => {
    if (undoId) {
      setSessions((prev) => prev.filter((s) => s.id !== undoId));
      setUndoId(null);
      setSaved(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#232323" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background: "#1a1a1a",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <button
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1"
          onClick={() => navigate("/")}
          data-testid="button-back"
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="text-base font-bold tracking-tight flex-1"
          style={{ fontFamily: "'Space Mono', monospace", color: remiColor }}
        >
          Wrap Up
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-6 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)" }}
      >
        {/* Session notes field */}
        <div className="space-y-2">
          <p className="text-xs text-white/30 uppercase tracking-widest">Session notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened this session? What's carried over?"
            rows={8}
            className="w-full bg-white/4 border border-white/8 rounded-2xl px-4 py-3.5 text-sm text-white/85 placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors resize-none leading-relaxed"
            data-testid="textarea-session-notes"
          />
        </div>

        {/* Voice record instruction */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "#1e1e1e" }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: remiColor + "15" }}
          >
            <Mic size={14} style={{ color: remiColor }} />
          </div>
          <p className="text-xs text-white/35 leading-relaxed">
            Hold the mic button below to record — it'll transcribe directly into the notes field.
          </p>
        </div>

        {/* Past sessions */}
        {sessions.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-white/25 uppercase tracking-widest">Past sessions</p>
            {sessions.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="px-4 py-3 rounded-xl border border-white/5"
                style={{ background: "#333333" }}
                data-testid={`session-${s.id}`}
              >
                <p className="text-xs text-white/25 mb-1">{s.date} · {s.timestamp}</p>
                <p className="text-sm text-white/65 leading-snug line-clamp-2">{s.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 pt-3 border-t border-white/5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        {/* Voice button */}
        <button
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 shrink-0 ${
            isRecording ? "voice-button-recording" : isTranscribing ? "" : "voice-button-idle"
          }`}
          style={{
            background: isRecording ? "#ef444415" : isTranscribing ? "#33333380" : userColor + "15",
            border: `2px solid ${isRecording ? "#ef4444" : isTranscribing ? "rgba(255,255,255,0.1)" : userColor + "60"}`,
          }}
          onPointerDown={handleHoldStart}
          onPointerUp={handleHoldEnd}
          onPointerLeave={handleHoldEnd}
          data-testid="button-voice-record"
        >
          {isRecording ? (
            <MicOff size={20} style={{ color: "#ef4444" }} />
          ) : isTranscribing ? (
            <div className="flex gap-0.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-1 h-3 rounded-full wave-bar"
                  style={{ background: remiColor, animationDelay: `${(i - 1) * 0.15}s` }}
                />
              ))}
            </div>
          ) : (
            <Mic size={20} style={{ color: userColor }} />
          )}
        </button>

        <div className="flex-1 flex flex-col">
          <p className="text-xs text-white/25">
            {isRecording ? "Recording — release to transcribe" : isTranscribing ? "Transcribing…" : "Hold to record"}
          </p>
        </div>

        {/* Save button */}
        <button
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 shrink-0"
          style={{
            background: notes.trim() ? remiColor : "rgba(255,255,255,0.04)",
            color: notes.trim() ? "#111111" : "rgba(255,255,255,0.2)",
            border: notes.trim() ? "none" : "1px solid rgba(255,255,255,0.08)",
          }}
          onClick={handleSave}
          disabled={!notes.trim()}
          data-testid="button-save-session"
        >
          {saved && !notes.trim() ? (
            <>
              <CheckCircle2 size={16} />
              Saved
            </>
          ) : (
            <>
              <Save size={16} />
              Wrap Up
            </>
          )}
        </button>
      </div>

      {/* Undo bar */}
      {undoId && (
        <UndoBar
          message="Session notes saved"
          onUndo={handleUndo}
          onDismiss={() => setUndoId(null)}
          accentColor={remiColor}
        />
      )}
    </div>
  );
}
