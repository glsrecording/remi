import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, MicOff } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

interface SessionNote {
  id: string;
  artist: string;
  song: string;
  note: string;
  timestamp: string;
}

export default function MixNotes() {
  const [, navigate] = useLocation();
  const [ACCENT] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");

  // Pre-fill from deep link (MainChat navigation)
  const [artist, setArtist] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("mix_notes_prefill") || "{}").artist || ""; }
    catch { return ""; }
  });
  const [song, setSong] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("mix_notes_prefill") || "{}").song || ""; }
    catch { return ""; }
  });

  useEffect(() => { sessionStorage.removeItem("mix_notes_prefill"); }, []);

  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Mic state — identical pattern to MainChat.tsx
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const pointerStartYRef = useRef<number>(0);
  const micStartTimeRef = useRef<number>(0);

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

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#1a1a1a" }}>
      {/* Header */}
      <div
        className="px-4 border-b border-white/5 shrink-0"
        style={{ background: "#111111", paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)", paddingBottom: "14px" }}
      >
        <div className="flex items-center gap-3">
          <button
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1"
            onClick={() => navigate("/")}
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-base font-bold tracking-tight flex-1" style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}>
            Mix Notes
          </span>
        </div>
      </div>

      {/* Artist / Song inputs */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex gap-2">
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
          />
          <input
            value={song}
            onChange={(e) => setSong(e.target.value)}
            placeholder="Song"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
      </div>

      {/* Session note history */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ paddingBottom: "120px" }}>
        {sessionNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-sm text-white/30">Hold mic to capture a note</p>
            <p className="text-xs text-white/20">Notes go straight to Notion</p>
          </div>
        ) : (
          sessionNotes.map((n) => (
            <div key={n.id} className="px-4 py-3 rounded-xl border border-white/8" style={{ background: "#262626" }}>
              <p className="text-sm text-white/85 leading-snug">{n.note}</p>
              <p className="text-xs text-white/25 mt-1">
                {n.timestamp}
                {(n.artist || n.song) && " · "}
                {n.artist}{n.artist && n.song ? " / " : ""}{n.song}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Fixed bottom bar */}
      <div
        style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#111111", zIndex: 10, padding: "12px 16px 48px" }}
      >
        {recordingError && (
          <p className="text-xs text-red-400/80 mb-1.5 text-center">{recordingError}</p>
        )}

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
              style={{ background: "#22c55e20", border: "1px solid #22c55e40", color: "#22c55e" }}
            >
              Send ↑
            </button>
          </div>
        )}

        {isRecording && !isLocked && (
          <div className="flex items-center justify-center gap-2 mb-2 h-5">
            <span className="text-xs" style={{ color: "#ef4444" }}>Recording…</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150"
            style={{
              background: isRecording ? "#ef444422" : "#f59e0b14",
              border: `1.5px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
              marginRight: "20px",
              touchAction: "none",
            }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); pointerStartYRef.current = e.clientY; handleMicDown(); }}
            onPointerMove={(e) => { if (!isRecording || isLocked) return; if (pointerStartYRef.current - e.clientY > 60) setIsLocked(true); }}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
          >
            {isRecording
              ? <MicOff size={16} style={{ color: "#ef4444" }} />
              : <Mic size={16} style={{ color: "#f59e0b" }} />}
          </button>
        </div>
      </div>
    </div>
  );
}
