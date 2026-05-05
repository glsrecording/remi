import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Music, Trash2, Plus, Search } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS, MixNote, todayLabel } from "@/lib/storage";
import UndoBar from "@/components/UndoBar";

export default function MixNotes() {
  const [, navigate] = useLocation();
  const [ACCENT] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [notes, setNotes] = useLocalStorage<MixNote[]>(STORAGE_KEYS.MIX_NOTES, []);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newSong, setNewSong] = useState("");
  const [newNote, setNewNote] = useState("");
  const [undoAction, setUndoAction] = useState<{ message: string; onUndo: () => void } | null>(null);

  const filtered = notes.filter(
    (n) => n.song.toLowerCase().includes(search.toLowerCase()) || n.note.toLowerCase().includes(search.toLowerCase())
  );

  const groupedBySong = filtered.reduce<Record<string, MixNote[]>>((acc, n) => {
    if (!acc[n.song]) acc[n.song] = [];
    acc[n.song].push(n);
    return acc;
  }, {});

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSong.trim()) return;
    const id = Date.now().toString();
    const entry: MixNote = {
      id,
      song: newSong.trim(),
      note: newNote.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: todayLabel(),
    };
    setNotes((prev) => [entry, ...prev]);
    setNewSong("");
    setNewNote("");
    setShowAdd(false);
    setUndoAction({
      message: `Mix note for "${entry.song}" saved`,
      onUndo: () => setNotes((prev) => prev.filter((n) => n.id !== id)),
    });
  };

  const deleteNote = (id: string) => setNotes((prev) => prev.filter((n) => n.id !== id));

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#232323" }}>
      {/* Header */}
      <div className="px-4 border-b border-white/5 shrink-0"
        style={{ background: "#1a1a1a", paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)", paddingBottom: "14px" }}>
        <div className="flex items-center gap-3 mb-3">
          <button className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1"
            onClick={() => navigate("/")} data-testid="button-back"><ArrowLeft size={20} /></button>
          <span className="text-base font-bold tracking-tight flex-1"
            style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}>Mix Notes</span>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95"
            style={{ background: ACCENT + "20", color: ACCENT, border: `1px solid ${ACCENT}40` }}
            onClick={() => setShowAdd((p) => !p)} data-testid="button-add-note">
            <Plus size={13} />Add
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAdd}
            className="mb-3 p-3 rounded-xl border border-white/8 space-y-2 overlay-fade-in"
            style={{ background: "#232323" }}>
            <input value={newSong} onChange={(e) => setNewSong(e.target.value)}
              placeholder="Song / project name..." autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
              data-testid="input-song-name" />
            <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)}
              placeholder="Note (kick needs punch, reverb tail too long...)" rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 resize-none"
              data-testid="input-note-body" />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2 rounded-lg text-sm font-medium transition-all active:scale-95"
                style={{ background: ACCENT, color: "#111" }} data-testid="button-save-note">Save Note</button>
              <button type="button" className="px-4 py-2 rounded-lg text-sm text-white/40 hover:text-white transition-colors"
                onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full bg-white/5 border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
            data-testid="input-search-notes" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: ACCENT + "15" }}>
              <Music size={22} style={{ color: ACCENT }} />
            </div>
            <div className="text-center">
              <p className="text-sm text-white/50 font-medium">No mix notes yet</p>
              <p className="text-xs text-white/25 mt-1">Say "Mix note for [song] — [note]" or tap Add</p>
            </div>
          </div>
        ) : Object.keys(groupedBySong).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Search size={22} className="text-white/15" />
            <p className="text-sm text-white/30">No notes match "{search}"</p>
          </div>
        ) : (
          Object.entries(groupedBySong).map(([song, songNotes]) => (
            <div key={song} className="space-y-2">
              <div className="flex items-center gap-2">
                <Music size={13} style={{ color: ACCENT }} className="shrink-0" />
                <p className="text-sm font-semibold tracking-wide" style={{ color: ACCENT }}>{song}</p>
                <span className="text-xs text-white/20 ml-1">({songNotes.length})</span>
              </div>
              {songNotes.map((note) => (
                <div key={note.id}
                  className="group px-4 py-3 rounded-xl border border-white/5 flex items-start gap-3"
                  style={{ background: "#333333" }} data-testid={`mix-note-${note.id}`}>
                  <div className="flex-1 min-w-0">
                    {note.note ? <p className="text-sm text-white/80 leading-snug">{note.note}</p>
                      : <p className="text-sm text-white/30 italic">No details captured</p>}
                    <p className="text-xs text-white/25 mt-1">{note.date} · {note.timestamp}</p>
                  </div>
                  <button
                    className="shrink-0 p-1.5 rounded-lg text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                    onClick={() => deleteNote(note.id)} data-testid={`button-delete-note-${note.id}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>

      {undoAction && (
        <UndoBar
          message={undoAction.message}
          onUndo={undoAction.onUndo}
          onDismiss={() => setUndoAction(null)}
          accentColor={ACCENT}
        />
      )}
    </div>
  );
}
