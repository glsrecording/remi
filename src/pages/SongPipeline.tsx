import { useState, useRef, useCallback, useEffect } from "react";
import { RefreshCw, Loader2, ChevronDown, ChevronRight, X, Mic, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

// ── Design-system tokens ─────────────────────────────────────────────────────
// Context accent colors stay vibrant in BOTH light and dark (per design-system.css
// they are intentionally NOT overridden), so referencing them by hex is safe and
// keeps the alpha math simple. Grays use CSS vars so they adapt in light mode.
const C = {
  studio:  "#3dd6b0",            // --color-studio  (teal)
  tasks:   "#f5a623",            // --color-tasks   (amber)
  tonight: "#9b8de8",            // --color-tonight (purple)
  calls:   "#378add",            // --color-calls   (blue)
  done:    "#5bc468",            // --color-done    (green)
  gray:    "var(--text-muted)",
  graySec: "var(--text-secondary)",
};

// color-mix works with both hex and var() colors, so it replaces the old
// `color + "22"` alpha-append (which would produce invalid CSS for var() colors).
const withAlpha = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

const STATUS_CHIPS = [
  "PrePro", "Tracking", "Editing", "Mixing", "Revisions",
  "Mastering", "Stems", "Proofing", "Active", "Waiting", "Outsource", "Archive",
];

const PRIORITY_CHIPS: { label: string; color: string }[] = [
  { label: "P1",   color: C.tasks },
  { label: "P2",   color: C.tonight },
  { label: "P3",   color: C.calls },
  { label: "Warm", color: C.graySec },
];

// Status → accent color, by production stage. The six stages called out in the
// redesign brief map to their named tokens; remaining stages map to the nearest
// context token so every status reads against the same palette.
const STATUS_COLORS: Record<string, string> = {
  Active:    C.studio,    // teal
  Mixing:    C.tonight,   // purple
  Revisions: C.tasks,     // amber
  Tracking:  C.calls,     // blue
  Done:      C.done,      // green
  "On Hold": C.gray,      // gray
  Waiting:   C.gray,
  // remaining production stages → nearest context token
  PrePro:    C.calls,
  Editing:   C.calls,
  Mastering: C.done,
  Stems:     C.studio,
  Proofing:  C.tonight,
  Outsource: C.graySec,
  Archive:   C.gray,
};

// These groups only show songs that have a next_action value
const FILTER_NEXT_ACTION = new Set(["Active", "PrePro"]);

interface Song {
  id: string;
  artist: string;
  song: string;
  status: string;
  priority: string;
  next_action: string;
  notion_url: string;
}

interface Group {
  priority: string;
  songs: Song[];
}

// Section accent by priority: P1 amber (warm/urgent), P2 purple, P3 blue.
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  P1:      { label: "P1 — Priority", color: C.tasks },
  P2:      { label: "P2",            color: C.tonight },
  P3:      { label: "P3",            color: C.calls },
  Active:  { label: "Active",        color: C.studio },
  Waiting: { label: "Waiting",       color: C.graySec },
};

async function fetchPipeline(): Promise<Group[]> {
  const res = await fetch(`${JARVIS_URL}/song_pipeline`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return (data.groups as Group[])
    .map(g =>
      FILTER_NEXT_ACTION.has(g.priority)
        ? { ...g, songs: g.songs.filter(s => s.next_action.trim() !== "") }
        : g
    )
    .filter(g => g.songs.length > 0);
}

async function patchSong(pageId: string, status: string | undefined, nextAction: string | undefined, priority?: string) {
  const body: Record<string, string> = {};
  if (status !== undefined) body.status = status;
  if (nextAction !== undefined) body.next_action = nextAction;
  if (priority !== undefined) body.priority = priority;
  const res = await fetch(`${JARVIS_URL}/song/${encodeURIComponent(pageId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

async function postNewSong(title: string, artist: string, priority: string, status: string, bpm?: number) {
  const body: Record<string, unknown> = { title, artist, priority, status };
  if (bpm !== undefined && bpm > 0) body.bpm = bpm;
  const res = await fetch(`${JARVIS_URL}/song/new`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Status / priority filter pill — Tasks-style treatment ──────────────────────
// Outlined + muted at rest; filled with its own context color when selected.
function FilterPill({
  label,
  selected,
  color,
  fill,
  onClick,
}: {
  label: string;
  selected: boolean;
  color: string;
  fill?: boolean;          // status chips fill solid when selected; priority chips tint
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="font-medium transition-all active:scale-95 whitespace-nowrap"
      style={{
        padding: "4px 12px",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--font-size-sm)",
        background: selected ? (fill ? color : withAlpha(color, 14)) : "transparent",
        color: selected ? (fill ? "#ffffff" : color) : "var(--text-muted)",
        border: `1px solid ${selected ? (fill ? color : withAlpha(color, 45)) : "var(--border-subtle)"}`,
      }}
    >
      {label}
    </button>
  );
}

// ── Add New bottom sheet ───────────────────────────────────────────────────

function AddSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const ACCENT = C.studio;
  const [title,    setTitle]    = useState("");
  const [artist,   setArtist]   = useState("");
  const [priority, setPriority] = useState("P3");
  const [status,   setStatus]   = useState("PrePro");
  const [bpmInput, setBpmInput] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || !artist.trim()) {
      setError("Title and artist are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const bpmVal = bpmInput.trim() ? parseInt(bpmInput.trim(), 10) : undefined;
    try {
      await postNewSong(title.trim(), artist.trim(), priority, status, bpmVal);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 rounded-t-2xl px-5 pt-5 overflow-y-auto"
        style={{
          background: "var(--surface-overlay)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Add Song</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>

        {/* Title */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2" style={{ color: "var(--text-secondary)" }}>Song Title</p>
        <input
          className="w-full px-3 py-2.5 rounded-xl text-sm mb-4"
          style={{ background: "var(--surface-card)", color: "var(--text-primary)", border: "1.5px solid var(--border-default)", outline: "none" }}
          placeholder="Song title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
        />

        {/* Artist */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2" style={{ color: "var(--text-secondary)" }}>Artist</p>
        <input
          className="w-full px-3 py-2.5 rounded-xl text-sm mb-4"
          style={{ background: "var(--surface-card)", color: "var(--text-primary)", border: "1.5px solid var(--border-default)", outline: "none" }}
          placeholder="Artist name…"
          value={artist}
          onChange={e => setArtist(e.target.value)}
        />

        {/* BPM */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2" style={{ color: "var(--text-secondary)" }}>BPM <span style={{ color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>optional</span></p>
        <input
          type="number"
          inputMode="numeric"
          className="w-full px-3 py-2.5 rounded-xl text-sm mb-5"
          style={{ background: "var(--surface-card)", color: "var(--text-primary)", border: "1.5px solid var(--border-default)", outline: "none" }}
          placeholder="e.g. 120"
          value={bpmInput}
          onChange={e => setBpmInput(e.target.value)}
          min={40}
          max={300}
        />

        {/* Priority */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2.5" style={{ color: "var(--text-secondary)" }}>Priority</p>
        <div className="flex gap-2 mb-5">
          {PRIORITY_CHIPS.map(chip => (
            <FilterPill
              key={chip.label}
              label={chip.label}
              color={chip.color}
              selected={priority === chip.label}
              onClick={() => setPriority(chip.label)}
            />
          ))}
        </div>

        {/* Status */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2.5" style={{ color: "var(--text-secondary)" }}>Status</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {STATUS_CHIPS.map(chip => (
            <FilterPill
              key={chip}
              label={chip}
              color={STATUS_COLORS[chip] ?? ACCENT}
              selected={status === chip}
              fill
              onClick={() => setStatus(chip)}
            />
          ))}
        </div>

        {error && <p className="text-xs text-red-400/80 mb-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
          style={{ background: withAlpha(ACCENT, 14), color: ACCENT, border: `1px solid ${withAlpha(ACCENT, 35)}` }}
        >
          {saving ? "Adding…" : "Add Song"}
        </button>
      </div>
    </div>
  );
}

// ── Edit bottom sheet ──────────────────────────────────────────────────────

function EditSheet({
  song,
  color,
  onClose,
  onSaved,
}: {
  song: Song;
  color: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedStatus, setSelectedStatus]     = useState(song.status);
  const [selectedPriority, setSelectedPriority] = useState(song.priority);
  const [nextAction, setNextAction]             = useState(song.next_action);
  const [saving, setSaving]                 = useState(false);
  const [saveError, setSaveError]           = useState<string | null>(null);
  const [isRecording, setIsRecording]       = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<BlobPart[]>([]);
  const holdTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef    = useRef(false);

  function handleMicDown() {
    if (isRecording || isTranscribing) return;
    holdActiveRef.current = false;
    holdTimerRef.current = setTimeout(async () => {
      holdActiveRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const mr = new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        mr.onstart = () => setIsRecording(true);
        mr.start();
      } catch { /* mic denied — silent */ }
    }, 150);
  }

  function handleMicUp() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    holdActiveRef.current = false;
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    mr.onstop = async () => {
      const tracks: MediaStreamTrack[] = (mr as any)?.stream?.getTracks?.() ?? [];
      tracks.forEach(t => t.stop());
      setIsRecording(false);
      if (audioChunksRef.current.length === 0) return;
      setIsTranscribing(true);
      try {
        const mimeType = mr.mimeType || "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const fd = new FormData();
        fd.append("file", blob, `audio.${ext}`);
        fd.append("model", "whisper-1");
        const resp = await fetch(`${JARVIS_URL}/transcribe`, {
          method: "POST",
          headers: { Authorization: `Bearer ${REMI_API_KEY}` },
          body: fd,
        });
        const json = await resp.json();
        const transcript = (json.text || "").trim();
        if (transcript) setNextAction(transcript);
      } catch { /* transcription failed — silent */ }
      finally { setIsTranscribing(false); }
    };
    mr.stop();
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await patchSong(song.id, selectedStatus, nextAction, selectedPriority || undefined);
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  const recording = isRecording || isTranscribing;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 rounded-t-2xl px-5 pt-5 overflow-y-auto"
        style={{
          background: "var(--surface-overlay)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          maxHeight: "85vh",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-medium mb-0.5" style={{ color: "var(--text-secondary)" }}>{song.artist}</p>
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{song.song}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/5 transition-colors mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Priority chips */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2.5" style={{ color: "var(--text-secondary)" }}>
          Priority
        </p>
        <div className="flex gap-2 mb-5">
          {PRIORITY_CHIPS.map(chip => (
            <FilterPill
              key={chip.label}
              label={chip.label}
              color={chip.color}
              selected={selectedPriority === chip.label}
              onClick={() => setSelectedPriority(chip.label)}
            />
          ))}
        </div>

        {/* Status chips */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2.5" style={{ color: "var(--text-secondary)" }}>
          Status
        </p>
        <div className="flex flex-wrap gap-2 mb-5">
          {STATUS_CHIPS.map(chip => (
            <FilterPill
              key={chip}
              label={chip}
              color={STATUS_COLORS[chip] ?? color}
              selected={selectedStatus === chip}
              fill
              onClick={() => setSelectedStatus(chip)}
            />
          ))}
        </div>

        {/* Next action */}
        <p className="text-xs font-medium tracking-widest uppercase mb-2.5" style={{ color: "var(--text-secondary)" }}>
          Next Action
        </p>
        <div className="flex items-center gap-2 mb-5">
          <input
            className="flex-1 px-3 py-2.5 rounded-xl text-sm"
            style={{
              background: "var(--surface-card)",
              color:      "var(--text-primary)",
              border:     "1.5px solid var(--border-default)",
              outline:    "none",
            }}
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            placeholder="Next action…"
          />
          <button
            type="button"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); handleMicDown(); }}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
            className="p-2.5 rounded-xl shrink-0 transition-all"
            style={{
              background: recording ? C.tasks : "transparent",
              color:      recording ? "#ffffff" : "var(--text-muted)",
              border:     `1.5px solid ${recording ? C.tasks : "var(--border-default)"}`,
              touchAction: "none",
            }}
          >
            {isTranscribing
              ? <Loader2 size={16} className="animate-spin" />
              : <Mic size={16} />}
          </button>
        </div>

        {saveError && (
          <p className="text-xs text-red-400/80 mb-3">{saveError}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
          style={{ background: withAlpha(color, 14), color, border: `1px solid ${withAlpha(color, 35)}` }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Song card (tap to open edit sheet) ────────────────────────────────────

function SongCard({
  song,
  color,
  onTap,
}: {
  song: Song;
  color: string;
  onTap: (song: Song) => void;
}) {
  // Accent bar + pill + glow are driven by STATUS (falls back to the section
  // priority color if the status is unmapped).
  const statusColor = STATUS_COLORS[song.status] ?? color;
  return (
    <button
      className="w-full text-left transition-all active:scale-[0.98]"
      style={{ borderRadius: "var(--radius-lg)" }}
      onClick={() => onTap(song)}
    >
      <div
        className="px-4 py-3"
        style={{
          background:    "var(--surface-card)",
          borderRadius:  "var(--radius-lg)",
          borderLeft:    `3px solid ${statusColor}`,
          borderTop:     "1px solid var(--border-subtle)",
          borderRight:   "1px solid var(--border-subtle)",
          borderBottom:  "1px solid var(--border-subtle)",
          // Subtle status-color glow — same bubble treatment as the rest of the app.
          boxShadow:     `0 0 12px ${withAlpha(statusColor, 20)}`,
        }}
      >
        {/* Artist — small, above the title */}
        <p className="text-xs font-medium tracking-wide truncate" style={{ color: "var(--text-secondary)" }}>
          {song.artist}
        </p>
        {/* Song title */}
        <p className="text-sm leading-snug truncate" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          {song.song}
        </p>
        <div className="flex items-center gap-2 mt-1.5 min-w-0">
          {song.status && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
              style={{ background: withAlpha(statusColor, 14), color: statusColor }}
            >
              {song.status}
            </span>
          )}
          {song.next_action && (
            <span className="text-xs leading-snug truncate min-w-0" style={{ color: "var(--text-muted)" }}>
              → {song.next_action}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Group section ─────────────────────────────────────────────────────────

function GroupSection({
  group,
  defaultOpen,
  onSongTap,
}: {
  group: Group;
  defaultOpen: boolean;
  onSongTap: (song: Song, color: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = PRIORITY_META[group.priority] ?? { label: group.priority, color: C.graySec };

  return (
    <div className="space-y-2">
      <div
        className="flex items-center gap-2 py-1.5 px-2 -mx-2 cursor-pointer select-none"
        style={{ borderRadius: "var(--radius-md)", background: withAlpha(meta.color, 8) }}
        onClick={() => setOpen(o => !o)}
        role="button"
        aria-expanded={open}
      >
        {/* Colored priority dot */}
        <span
          className="shrink-0 rounded-full"
          style={{ width: "8px", height: "8px", background: meta.color, boxShadow: `0 0 8px ${withAlpha(meta.color, 60)}` }}
        />
        <span
          className="font-bold uppercase tracking-tight flex-1"
          style={{ color: meta.color, fontFamily: "'Space Mono', monospace", fontSize: "var(--font-size-sm)", letterSpacing: "0.08em" }}
        >
          {meta.label}
        </span>
        {/* Count badge */}
        <span
          className="font-mono rounded-full"
          style={{ background: withAlpha(meta.color, 12), color: meta.color, fontSize: "var(--font-size-xs)", padding: "2px 8px" }}
        >
          {group.songs.length}
        </span>
        {open
          ? <ChevronDown  size={14} style={{ color: meta.color, opacity: 0.6 }} />
          : <ChevronRight size={14} style={{ color: meta.color, opacity: 0.6 }} />}
      </div>

      {open && (
        <div className="space-y-1.5 mx-4">
          {group.songs.map(song => (
            <SongCard key={song.id} song={song} color={meta.color} onTap={s => onSongTap(s, meta.color)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SongPipeline() {
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [groups,      setGroups]      = useState<Group[]>([]);
  const [pulling,     setPulling]     = useState(false);
  const [editing,     setEditing]     = useState<{ song: Song; color: string } | null>(null);
  const [addingNew,   setAddingNew]   = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const scrollRef   = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isAtTop     = useRef(true);

  useGutterScroll(scrollRef);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await fetchPipeline());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalSongs = groups.reduce((n, g) => n + g.songs.length, 0);
  const spinning   = loading || pulling;

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    isAtTop.current = e.currentTarget.scrollTop === 0;
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }

  async function handleTouchEnd(e: React.TouchEvent) {
    if (!isAtTop.current || loading || pulling) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 70) {
      setPulling(true);
      await load();
      setPulling(false);
    }
  }

  function handleSaved() {
    setEditing(null);
    load();
  }

  // Change 1: only P1 and P2 open by default
  function isDefaultOpen(priority: string) {
    return priority === "P1" || priority === "P2";
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--surface-base)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader
        title="Song Pipeline"
        color={C.studio}
        onMenu={() => setMenuOpen(true)}
        right={<>
          {!loading && (
            <span className="text-xs mr-1 font-mono" style={{ color: withAlpha(C.studio, 75) }}>
              {totalSongs} {totalSongs === 1 ? "song" : "songs"}
            </span>
          )}
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: C.studio }}
            onClick={() => setAddingNew(true)}
            title="Add song"
          >
            <Plus size={16} />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: C.studio }}
            onClick={() => load()}
            disabled={spinning}
          >
            <RefreshCw size={16} className={spinning ? "animate-spin" : ""} />
          </button>
        </>}
      />

      {/* Search bar — MainChat pill treatment with teal border + focus glow */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: "var(--surface-card)",
            borderRadius: "var(--radius-pill)",
            border: searchFocused
              ? `1.5px solid ${C.studio}`
              : `1.5px solid ${withAlpha(C.studio, 40)}`,
            boxShadow: searchFocused
              ? `0 0 16px ${withAlpha(C.studio, 30)}, inset 0 0 10px ${withAlpha(C.studio, 14)}`
              : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
        >
          <Search size={14} style={{ color: searchFocused ? C.studio : "var(--text-muted)", flexShrink: 0 }} />
          <input
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: "var(--text-primary)" }}
            placeholder="Search songs or artists…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{ color: "var(--text-muted)" }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {spinning && groups.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16">
            <Loader2 size={18} className="animate-spin" style={{ color: C.studio }} />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading pipeline…</span>
          </div>
        )}

        {!loading && !pulling && error && (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
              Could not load pipeline ({error})
            </p>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
              style={{ background: withAlpha(C.studio, 13), color: C.studio, border: `1px solid ${withAlpha(C.studio, 35)}` }}
              onClick={() => load()}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active songs in pipeline.</p>
          </div>
        )}

        {/* Filtered search results */}
        {searchQuery.trim() && groups.length > 0 && (() => {
          const q = searchQuery.toLowerCase();
          const matches = groups.flatMap(g =>
            g.songs
              .filter(s => s.song.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
              .map(s => ({ song: s, color: (PRIORITY_META[g.priority] ?? { color: C.graySec }).color }))
          );
          if (matches.length === 0) return (
            <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>
              No songs match "{searchQuery}"
            </p>
          );
          return (
            <div className="space-y-1.5">
              {matches.map(({ song, color }) => (
                <SongCard key={song.id} song={song} color={color}
                  onTap={s => setEditing({ song: s, color })} />
              ))}
            </div>
          );
        })()}

        {/* Grouped pipeline (no search active) */}
        {!searchQuery.trim() && groups.length > 0 && (
          <div className="space-y-6">
            {groups.map(group => (
              <GroupSection
                key={group.priority}
                group={group}
                defaultOpen={isDefaultOpen(group.priority)}
                onSongTap={(song, color) => setEditing({ song, color })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit sheet */}
      {editing && (
        <EditSheet
          song={editing.song}
          color={editing.color}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Add sheet */}
      {addingNew && (
        <AddSheet
          onClose={() => setAddingNew(false)}
          onSaved={() => { setAddingNew(false); load(); }}
        />
      )}
    </div>
  );
}
