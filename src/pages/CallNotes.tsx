import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Menu, Mic, MicOff, Loader2, Moon, Sun, Phone, PhoneOff } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };

interface Contact {
  page_id: string;
  name: string;
}

interface NoteEntry {
  text: string;
  ts: string;
}

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CallNotes() {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isLight, toggleTheme } = useTheme();

  // Contact search
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Call state
  const [callActive, setCallActive] = useState(false);
  const [toggleBlockId, setToggleBlockId] = useState("");
  const [isFirstNote, setIsFirstNote] = useState(true);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Mic state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const pointerStartYRef = useRef<number>(0);
  const notesEndRef = useRef<HTMLDivElement>(null);

  // Ghost-load CRM contacts in background
  useEffect(() => {
    fetch(`${JARVIS_URL}/crm_contacts`, { headers: AUTH_HEADERS })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.contacts)) setContacts(data.contacts);
      })
      .catch(() => {})
      .finally(() => setContactsLoading(false));
  }, []);

  // Timer — starts when call activates
  useEffect(() => {
    if (!callActive) return;
    startTimeRef.current = Date.now() / 1000;
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor(Date.now() / 1000 - startTimeRef.current));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callActive]);

  // Auto-scroll notes
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes]);

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSearchText(contact.name);
    setShowDropdown(false);
  };

  const handleStartCall = () => {
    if (!selectedContact) return;
    setCallActive(true);
    setIsFirstNote(true);
    setNotes([]);
    setToggleBlockId("");
  };

  const handleEndCall = useCallback(() => {
    setCallActive(false);
    setSelectedContact(null);
    setSearchText("");
    setToggleBlockId("");
    setIsFirstNote(true);
    setNotes([]);
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    navigate("/", { replace: true });
  }, [navigate]);

  const sendNote = useCallback(
    async (text: string) => {
      if (!text.trim() || !selectedContact) return;
      try {
        const body = isFirstNote
          ? {
              contact_page_id: selectedContact.page_id,
              note_text: text.trim(),
              is_first_note: true,
            }
          : {
              toggle_block_id: toggleBlockId,
              note_text: text.trim(),
              is_first_note: false,
            };
        const resp = await fetch(`${JARVIS_URL}/call_note`, {
          method: "POST",
          headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (resp.ok) {
          if (isFirstNote && data.toggle_block_id) {
            setToggleBlockId(data.toggle_block_id);
            setIsFirstNote(false);
          }
          setNotes((prev) => [
            ...prev,
            { text: text.trim(), ts: data.timestamp || "" },
          ]);
        }
      } catch {
        // non-fatal
      }
    },
    [isFirstNote, toggleBlockId, selectedContact]
  );

  // ─── Mic: 150ms hold-to-record (same pattern as Session.tsx) ─────────────
  function handleMicDown() {
    if (isRecording) return;
    holdActiveRef.current = false;
    setRecordingError(null);
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
        const mimeType = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setIsRecording(false);
          setIsLocked(false);
          // 800ms flush: Safari delivers dataavailable after onstop
          setTimeout(async () => {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            audioChunksRef.current = [];
            if (blob.size === 0) return;
            try {
              setIsTranscribing(true);
              const ext = mimeType.includes("mp4")
                ? "mp4"
                : mimeType.includes("ogg")
                ? "ogg"
                : "webm";
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
              setIsTranscribing(false);
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
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdActiveRef.current = false;
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }

  function handleCancelLocked() {
    setIsLocked(false);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdActiveRef.current = false;
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== "inactive")
        mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
  }

  function handleSendLocked() {
    setIsLocked(false);
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--t-bg)", color: "var(--t-text)" }}
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
        >
          <Menu size={20} />
        </button>
        <span
          className="text-sm font-semibold tracking-widest uppercase"
          style={{ color: "#60a5fa" }}
        >
          Call Notes
        </span>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
          style={{ color: "var(--t-text6)" }}
        >
          {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      {/* ── IDLE: contact search ─────────────────────────────────────────────── */}
      {!callActive && (
        <div
          className="flex-1 flex flex-col items-center justify-center px-6"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 80px), 80px)" }}
        >
          <div className="w-full max-w-xs space-y-3">
            <p
              className="text-center text-xs uppercase tracking-widest mb-4"
              style={{ color: "var(--t-text7)" }}
            >
              Select Contact
            </p>

            <div className="relative">
              <input
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setSelectedContact(null);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder={contactsLoading ? "Loading contacts…" : "Type to search…"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
              />
              {contactsLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2
                    size={14}
                    className="animate-spin"
                    style={{ color: "var(--t-text6)" }}
                  />
                </div>
              )}

              {showDropdown && searchText && filteredContacts.length > 0 && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 rounded-xl border overflow-hidden z-10"
                  style={{
                    background: "var(--t-surface)",
                    borderColor: "var(--t-border-md)",
                  }}
                >
                  {filteredContacts.slice(0, 8).map((c) => (
                    <button
                      key={c.page_id}
                      className="w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/5"
                      style={{
                        color: "var(--t-text3)",
                        borderBottom: "1px solid var(--t-border-md)",
                      }}
                      onMouseDown={() => handleSelectContact(c)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedContact && (
              <div
                className="rounded-xl px-4 py-3 border text-center"
                style={{
                  background: "var(--t-surface)",
                  borderColor: "rgba(96,165,250,0.35)",
                }}
              >
                <p
                  className="text-xs mb-1"
                  style={{ color: "rgba(96,165,250,0.7)" }}
                >
                  Selected
                </p>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--t-text)" }}
                >
                  {selectedContact.name}
                </p>
              </div>
            )}

            <button
              onClick={handleStartCall}
              disabled={!selectedContact}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{
                background: selectedContact
                  ? "#60a5fa"
                  : "rgba(96,165,250,0.12)",
                color: selectedContact ? "#000" : "rgba(96,165,250,0.35)",
              }}
            >
              <Phone size={15} />
              Start Call
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE CALL ──────────────────────────────────────────────────────── */}
      {callActive && selectedContact && (
        <>
          {/* Contact banner */}
          <div className="px-5 pt-5 pb-2">
            <div
              className="rounded-xl px-4 py-3 border"
              style={{
                background: "var(--t-surface)",
                borderColor: "rgba(96,165,250,0.35)",
              }}
            >
              <p
                className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "#60a5fa" }}
              >
                Active Call
              </p>
              <p
                className="text-base font-semibold truncate"
                style={{ color: "var(--t-text)" }}
              >
                📞 {selectedContact.name}
              </p>
            </div>
          </div>

          {/* Timer + End Call */}
          <div className="px-5 py-4">
            <div
              className="rounded-2xl px-4 py-5 border text-center"
              style={{
                background: "var(--t-surface)",
                borderColor: "var(--t-border)",
              }}
            >
              <p
                className="font-mono text-4xl font-bold tracking-tight mb-4"
                style={{ color: "#60a5fa", letterSpacing: "-0.02em" }}
              >
                {fmt(elapsed)}
              </p>
              <button
                onClick={handleEndCall}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm mx-auto transition-all active:scale-95"
                style={{
                  background: "rgba(239,68,68,0.15)",
                  color: "#ef4444",
                  border: "1px solid #ef4444",
                }}
              >
                <PhoneOff size={15} />
                End Call
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="px-5 mb-3 flex-1 flex flex-col min-h-0">
            <p
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--t-text6)" }}
            >
              Call Notes
            </p>
            <div
              className="flex-1 rounded-xl border overflow-y-auto"
              style={{
                background: "var(--t-surface)",
                borderColor: "var(--t-border)",
                maxHeight: "220px",
              }}
            >
              {notes.length === 0 ? (
                <p className="text-sm text-white/25 p-4 text-center">
                  Hold mic to speak — notes save to Notion in real time
                </p>
              ) : (
                <div className="p-3 space-y-2">
                  {notes.map((n, i) => (
                    <div
                      key={i}
                      className="flex gap-3 py-2 px-3 rounded-lg"
                      style={{ background: "var(--t-el-low)" }}
                    >
                      <span
                        className="text-xs font-mono mt-0.5 shrink-0"
                        style={{ color: "#60a5fa" }}
                      >
                        {n.ts}
                      </span>
                      <p className="text-sm text-white/70 leading-snug">
                        {n.text}
                      </p>
                    </div>
                  ))}
                  <div ref={notesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Spacer for fixed mic bar */}
          <div className="shrink-0" style={{ height: 100 }} />

          {/* Mic bar — fixed to bottom */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "var(--t-bg)",
              zIndex: 10,
              padding: "12px 16px 48px",
            }}
          >
            {recordingError && (
              <p className="text-xs text-red-400/80 mb-1.5 text-center">
                {recordingError}
              </p>
            )}
            {isLocked && (
              <div className="flex items-center justify-between mb-2 px-1">
                <button
                  type="button"
                  onClick={handleCancelLocked}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: "#ef444420",
                    border: "1px solid #ef444440",
                    color: "#ef4444",
                  }}
                >
                  ✕ Cancel
                </button>
                <span className="text-xs" style={{ color: "#ef4444" }}>
                  🔒 Recording
                </span>
                <button
                  type="button"
                  onClick={handleSendLocked}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: "#22c55e20",
                    border: "1px solid #22c55e40",
                    color: "#22c55e",
                  }}
                >
                  Send ↑
                </button>
              </div>
            )}
            {(isRecording || isTranscribing) && !isLocked && (
              <div className="flex items-center justify-center gap-2 mb-2 h-5">
                {isTranscribing ? (
                  <>
                    <Loader2
                      size={13}
                      className="animate-spin"
                      style={{ color: "#f59e0b" }}
                    />
                    <span className="text-xs" style={{ color: "#f59e0b" }}>
                      Transcribing...
                    </span>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: "#ef4444" }}>
                    Recording…
                  </span>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150"
                style={{
                  background: isRecording ? "#ef444422" : "#f59e0b14",
                  border: `1.5px solid ${isRecording ? "#ef4444" : "#f59e0b50"}`,
                  marginRight: "20px",
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.preventDefault();
                  pointerStartYRef.current = e.clientY;
                  handleMicDown();
                }}
                onPointerMove={(e) => {
                  if (!isRecording || isLocked) return;
                  if (pointerStartYRef.current - e.clientY > 60)
                    setIsLocked(true);
                }}
                onPointerUp={handleMicUp}
                onPointerLeave={handleMicUp}
                data-testid="button-voice"
              >
                {isTranscribing ? (
                  <Loader2
                    size={18}
                    className="animate-spin"
                    style={{ color: "#f59e0b" }}
                  />
                ) : isRecording ? (
                  <MicOff size={18} style={{ color: "#ef4444" }} />
                ) : (
                  <Mic size={18} style={{ color: "#f59e0b" }} />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
