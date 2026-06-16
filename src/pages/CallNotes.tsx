import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Menu, Mic, MicOff, Loader2, Moon, Sun, Phone, PhoneOff, UserPlus, X } from "lucide-react";
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

  // New lead sheet
  const [showNewLeadSheet, setShowNewLeadSheet] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("");
  const [newLeadSubmitting, setNewLeadSubmitting] = useState(false);
  const [newLeadError, setNewLeadError] = useState<string | null>(null);

  // Call state
  const [callActive, setCallActive] = useState(false);
  const [toggleBlockId, setToggleBlockId] = useState("");
  const [isFirstNote, setIsFirstNote] = useState(true);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Text input state
  const [noteText, setNoteText] = useState("");

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

  // Non-blocking note queue: first note POSTs and resolves toggle_block_id; queued
  // notes fire the moment it resolves; notes 2+ are fire-and-forget.
  const toggleBlockIdRef = useRef("");
  const firstNoteInFlightRef = useRef(false);
  const pendingQueueRef = useRef<string[]>([]);

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
    toggleBlockIdRef.current = "";
    firstNoteInFlightRef.current = false;
    pendingQueueRef.current = [];
  };

  const handleOpenNewLead = () => {
    setNewLeadName(searchText);
    setNewLeadPhone("");
    setNewLeadEmail("");
    setNewLeadSource("");
    setNewLeadError(null);
    setShowNewLeadSheet(true);
  };

  const handleNewLeadSubmit = async () => {
    if (!newLeadName.trim()) return;
    setNewLeadSubmitting(true);
    setNewLeadError(null);
    try {
      const resp = await fetch(`${JARVIS_URL}/new-lead`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLeadName.trim(),
          phone: newLeadPhone.trim(),
          email: newLeadEmail.trim(),
          source_note: newLeadSource.trim(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to create lead");
      const newContact: Contact = { page_id: data.page_id, name: data.name };
      setContacts((prev) => [...prev, newContact].sort((a, b) => a.name.localeCompare(b.name)));
      handleSelectContact(newContact);
      setShowNewLeadSheet(false);
    } catch (err: unknown) {
      setNewLeadError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setNewLeadSubmitting(false);
    }
  };

  const handleEndCall = useCallback(() => {
    setCallActive(false);
    setSelectedContact(null);
    setSearchText("");
    setToggleBlockId("");
    setIsFirstNote(true);
    setNotes([]);
    setElapsed(0);
    toggleBlockIdRef.current = "";
    firstNoteInFlightRef.current = false;
    pendingQueueRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    navigate("/", { replace: true });
  }, [navigate]);

  const sendNote = useCallback(
    (text: string) => {
      if (!text.trim() || !selectedContact) return;
      const noteText = text.trim();

      // First note: POST and capture toggle_block_id, then flush queue
      if (!firstNoteInFlightRef.current && !toggleBlockIdRef.current) {
        firstNoteInFlightRef.current = true;
        fetch(`${JARVIS_URL}/call_note`, {
          method: "POST",
          headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_page_id: selectedContact.page_id,
            note_text: noteText,
            is_first_note: true,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.toggle_block_id) {
              toggleBlockIdRef.current = data.toggle_block_id;
              setToggleBlockId(data.toggle_block_id);
              setIsFirstNote(false);
              setNotes((prev) => [...prev, { text: noteText, ts: data.timestamp || "" }]);
              // Flush any notes queued while first POST was in flight
              const queued = pendingQueueRef.current.splice(0);
              for (const q of queued) {
                fetch(`${JARVIS_URL}/call_note`, {
                  method: "POST",
                  headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    toggle_block_id: data.toggle_block_id,
                    note_text: q,
                    is_first_note: false,
                  }),
                })
                  .then((r) => r.json())
                  .then((d) => {
                    setNotes((prev) => [...prev, { text: q, ts: d.timestamp || "" }]);
                  })
                  .catch(() => {});
              }
            }
          })
          .catch(() => {
            // Reset so caller can retry
            firstNoteInFlightRef.current = false;
            pendingQueueRef.current = [];
          });
        return;
      }

      // toggle_block_id not yet back from first note: queue and return immediately
      if (!toggleBlockIdRef.current) {
        pendingQueueRef.current.push(noteText);
        return;
      }

      // Notes 2+: fire and forget — mic is already free
      const tid = toggleBlockIdRef.current;
      fetch(`${JARVIS_URL}/call_note`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ toggle_block_id: tid, note_text: noteText, is_first_note: false }),
      })
        .then((r) => r.json())
        .then((data) => {
          setNotes((prev) => [...prev, { text: noteText, ts: data.timestamp || "" }]);
        })
        .catch(() => {});
    },
    [selectedContact]
  );

  const handleNoteSubmit = useCallback(() => {
    if (!noteText.trim()) return;
    sendNote(noteText.trim());
    setNoteText("");
  }, [noteText, sendNote]);

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
          setIsTranscribing(true);
          // 800ms flush: Safari delivers dataavailable after onstop
          setTimeout(() => {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            audioChunksRef.current = [];
            if (blob.size === 0) {
              setIsTranscribing(false);
              return;
            }
            const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
            const formData = new FormData();
            formData.append("file", blob, `audio.${ext}`);
            formData.append("model", "whisper-1");
            fetch(`${JARVIS_URL}/transcribe`, {
              method: "POST",
              headers: { Authorization: `Bearer ${REMI_API_KEY}` },
              body: formData,
            })
              .then((r) => r.json())
              .then((json) => {
                const transcript = (json.text || "").trim();
                if (transcript) sendNote(transcript);
                else setRecordingError("Nothing captured — try again.");
              })
              .catch(() => {
                setRecordingError("Transcription failed — check connection.");
              })
              .finally(() => setIsTranscribing(false));
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

      {/* ── Rate compass — quiet, persistent reminder. Display only, sits above
            the form so it's seen before anything is typed. ─────────────────── */}
      <div className="px-4 pt-3">
        <div
          className="rounded-lg px-3.5 py-2.5"
          style={{
            background: "var(--t-surface)",
            borderLeft: "3px solid var(--color-done)",
            borderTop: "1px solid var(--t-border)",
            borderRight: "1px solid var(--t-border)",
            borderBottom: "1px solid var(--t-border)",
          }}
        >
          <p
            style={{
              fontFamily: "'DM Sans', 'Inter', sans-serif",
              fontSize: "13.5px",
              lineHeight: 1.45,
              color: "var(--t-text3)",
            }}
          >
            $100/hr · $1,800/song · One number. No math. No apology.
          </p>
        </div>
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

            <button
              onClick={handleOpenNewLead}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{
                background: "rgba(34,197,94,0.10)",
                color: "#22c55e",
                border: "1px solid rgba(34,197,94,0.25)",
              }}
            >
              <UserPlus size={14} />
              + New Lead
            </button>
          </div>
        </div>
      )}

      {/* ── NEW LEAD SHEET ───────────────────────────────────────────────────── */}
      {showNewLeadSheet && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewLeadSheet(false); }}
        >
          <div
            className="rounded-t-2xl px-5 pt-5 pb-10 space-y-4"
            style={{ background: "var(--t-surface)", borderTop: "1px solid var(--t-border-md)" }}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold" style={{ color: "var(--t-text)" }}>
                New Lead
              </span>
              <button
                onClick={() => setShowNewLeadSheet(false)}
                className="p-1.5 rounded-lg"
                style={{ color: "var(--t-text6)" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs uppercase tracking-widest mb-1 block" style={{ color: "var(--t-text7)" }}>
                Name *
              </label>
              <input
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                placeholder="Full name"
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs uppercase tracking-widest mb-1 block" style={{ color: "var(--t-text7)" }}>
                Phone
              </label>
              <input
                value={newLeadPhone}
                onChange={(e) => setNewLeadPhone(e.target.value)}
                placeholder="Optional"
                type="tel"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs uppercase tracking-widest mb-1 block" style={{ color: "var(--t-text7)" }}>
                Email
              </label>
              <input
                value={newLeadEmail}
                onChange={(e) => setNewLeadEmail(e.target.value)}
                placeholder="Optional"
                type="email"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
              />
            </div>

            {/* Source / notes */}
            <div>
              <label className="text-xs uppercase tracking-widest mb-1 block" style={{ color: "var(--t-text7)" }}>
                Source / Notes
              </label>
              <input
                value={newLeadSource}
                onChange={(e) => setNewLeadSource(e.target.value)}
                placeholder="e.g. met at cannabis shop, does music"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
              />
            </div>

            {newLeadError && (
              <p className="text-xs text-red-400 text-center">{newLeadError}</p>
            )}

            {/* Confirm */}
            <button
              onClick={handleNewLeadSubmit}
              disabled={!newLeadName.trim() || newLeadSubmitting}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              style={{
                background: newLeadName.trim() && !newLeadSubmitting ? "#22c55e" : "rgba(34,197,94,0.15)",
                color: newLeadName.trim() && !newLeadSubmitting ? "#000" : "rgba(34,197,94,0.4)",
              }}
            >
              {newLeadSubmitting ? (
                <><Loader2 size={14} className="animate-spin" /> Creating…</>
              ) : (
                "Create & Select"
              )}
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
                  Type or hold mic — notes save to Notion in real time
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

          {/* Spacer for fixed input+mic bar */}
          <div className="shrink-0" style={{ height: 140 }} />

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
            <div className="flex gap-2 items-center">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNoteSubmit()}
                placeholder="Type a note…"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
              />
              <button
                type="button"
                onClick={handleNoteSubmit}
                className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95"
                style={{ background: "#60a5fa", color: "#000" }}
              >
                Send
              </button>
              <button
                type="button"
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-150"
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
                {isRecording ? (
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
