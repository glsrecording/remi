import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, RefreshCw, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

interface Song {
  id: string;
  artist: string;
  song: string;
  status: string;
  next_action: string;
  notion_url: string;
}

interface Group {
  priority: string;
  songs: Song[];
}

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  P1:      { label: "P1 — Priority",  color: "#4ade80" },
  P2:      { label: "P2",             color: "#c084fc" },
  P3:      { label: "P3",             color: "#60a5fa" },
  Active:  { label: "Active",         color: "#2dd4bf" },
  Waiting: { label: "Waiting",        color: "#94a3b8" },
};

async function fetchPipeline(): Promise<Group[]> {
  const res = await fetch(`${JARVIS_URL}/song_pipeline`, {
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return data.groups as Group[];
}

function SongCard({ song, color }: { song: Song; color: string }) {
  return (
    <a
      href={song.notion_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl transition-all active:scale-[0.98]"
      style={{ textDecoration: "none" }}
    >
      <div
        className="px-4 py-3 rounded-xl"
        style={{
          background: "var(--t-card)",
          borderLeft: `3px solid ${color}70`,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-xs font-medium tracking-wide shrink-0"
            style={{ color: "var(--t-text5)" }}
          >
            {song.artist}
          </span>
          <span
            className="text-sm font-semibold leading-snug min-w-0"
            style={{ color: "var(--t-text)" }}
          >
            {song.song}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {song.status && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
              style={{ background: color + "1a", color }}
            >
              {song.status}
            </span>
          )}
          {song.next_action && (
            <span
              className="text-xs leading-snug"
              style={{ color: "var(--t-text5)" }}
            >
              → {song.next_action}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

function GroupSection({
  group,
  defaultOpen,
}: {
  group: Group;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = PRIORITY_META[group.priority] ?? {
    label: group.priority,
    color: "#94a3b8",
  };

  return (
    <div className="space-y-2">
      <div
        className="flex items-center gap-2 py-1 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        <span
          className="text-sm font-bold tracking-tight flex-1"
          style={{ color: meta.color, fontFamily: "'Space Mono', monospace" }}
        >
          {meta.label}
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded-full"
          style={{ background: meta.color + "20", color: meta.color }}
        >
          {group.songs.length}
        </span>
        {open
          ? <ChevronDown  size={14} style={{ color: meta.color, opacity: 0.6 }} />
          : <ChevronRight size={14} style={{ color: meta.color, opacity: 0.6 }} />}
      </div>

      {open && (
        <div className="space-y-1.5 mx-4">
          {group.songs.map((song) => (
            <SongCard key={song.id} song={song} color={meta.color} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SongPipeline() {
  const [, navigate] = useLocation();
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [groups,  setGroups]    = useState<Group[]>([]);
  const [pulling, setPulling]   = useState(false);

  const scrollRef    = useRef<HTMLDivElement>(null);
  const touchStartY  = useRef(0);
  const isAtTop      = useRef(true);

  useGutterScroll(scrollRef);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPipeline();
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalSongs = groups.reduce((n, g) => n + g.songs.length, 0);

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

  const spinning = loading || pulling;

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg-deep)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background:    "var(--t-surface)",
          paddingTop:    "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <button
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors -ml-1"
          style={{ color: "var(--t-text5)" }}
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="text-base font-bold tracking-tight flex-1"
          style={{ fontFamily: "'Space Mono', monospace", color: "#2dd4bf" }}
        >
          Song Pipeline
        </span>
        {!loading && (
          <span className="text-xs mr-2" style={{ color: "var(--t-text6)" }}>
            {totalSongs} {totalSongs === 1 ? "song" : "songs"}
          </span>
        )}
        <button
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: "var(--t-text5)" }}
          onClick={() => load()}
          disabled={spinning}
        >
          <RefreshCw size={16} className={spinning ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {spinning && groups.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16">
            <Loader2 size={18} className="animate-spin" style={{ color: "#2dd4bf" }} />
            <span className="text-sm" style={{ color: "var(--t-text5)" }}>
              Loading pipeline…
            </span>
          </div>
        )}

        {!loading && !pulling && error && (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-center" style={{ color: "var(--t-text4)" }}>
              Could not load pipeline ({error})
            </p>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
              style={{ background: "#2dd4bf20", color: "#2dd4bf" }}
              onClick={() => load()}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm" style={{ color: "var(--t-text6)" }}>
              No active songs in pipeline.
            </p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-6">
            {groups.map((group) => (
              <GroupSection
                key={group.priority}
                group={group}
                defaultOpen={group.priority !== "Waiting"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
