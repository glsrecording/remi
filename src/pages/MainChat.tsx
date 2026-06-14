import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Mic,
  Menu,
  CornerDownRight,
  Pin,
  X,
  Loader2,
  Volume2,
  VolumeX,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import HamburgerMenu from "@/components/HamburgerMenu";
import UndoBar from "@/components/UndoBar";
import { clearPinUnlock } from "@/components/PinLock";
import SundaySweep, { SundaySweepChip } from "@/components/SundaySweep";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import {
  STORAGE_KEYS,
  ChatMessage,
  MixNote,
  BrainItem,
  BucketType,
  UserBubbleStyle,
  SessionLog,
  parseMixNoteCommand,
  parseQuickAddCommand,
  todayLabel,
} from "@/lib/storage";
import { findBestMatch, CATEGORY_COLORS, COMMANDS } from "@/lib/commands";
import type { Command } from "@/lib/commands";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

// Notion page URLs in confirmation text → rendered as a tappable chip, not raw text.
const NOTION_URL_RE = /https?:\/\/(?:app\.notion\.com|(?:www\.)?notion\.so)\/\S+/g;

const ACCENT_COLORS = [
  { name: "green", value: "#22c55e" },
  { name: "blue", value: "#3b82f6" },
  { name: "purple", value: "#a855f7" },
  { name: "gold", value: "#f59e0b" },
  { name: "rose", value: "#f43f5e" },
  { name: "teal", value: "#14b8a6" },
  { name: "orange", value: "#f97316" },
  { name: "ice", value: "#bae6fd" },
];

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: "seed-1",
    role: "user",
    text: "Mix note for Midnight Drive — the kick needs more punch in the 80–120Hz range",
    timestamp: "10:41 AM",
  },
  {
    id: "seed-2",
    role: "ai",
    text: "**Mix Note logged** for *Midnight Drive*\n\n- Kick: boost +3dB around 100Hz, narrow Q\n- Consider high-pass on competing elements\n- Added to **Mix Notes Buffer**\n\n_Logged at 10:41 AM_",
    timestamp: "10:41 AM",
  },
  {
    id: "seed-3",
    role: "user",
    text: "What's my scorecard?",
    timestamp: "10:43 AM",
  },
  {
    id: "seed-4",
    role: "ai",
    text: "**Today's Scorecard** — May 2\n\n| Task | Points |\n|------|--------|\n| Morning briefing | ✅ 10 |\n| Mix session logged | ✅ 15 |\n| Brain dump cleared | ⬜ 0 |\n\n**Total: 25 / 40 pts** — solid start.",
    timestamp: "10:43 AM",
  },
];


function buildMixNoteReply(song: string, note: string): string {
  return `**Mix Note logged** for *${song}*\n\n${note ? `> ${note}\n\n` : ""}Added to **Mix Notes Buffer** ✓\n\n_Saved to device · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}_`;
}

const BUCKET_LABELS: Record<BucketType, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  someday: "Someday",
};

function buildQuickAddReply(bucket: BucketType, task: string): string {
  return `**Added to ${BUCKET_LABELS[bucket]}** ✓\n\n> ${task}\n\n_Saved to Brain Dump · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}_`;
}

function buildMorningBriefingReply(
  todayItems: BrainItem[],
  somedayItems: BrainItem[],
  latestMixNote: MixNote | null,
): string {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  let out = `**Good morning.** Here's your briefing — *${dateStr}*\n\n---\n\n`;
  if (todayItems.length === 0) {
    out += `**⚡ Today** — nothing queued yet. Clean slate.\n\n`;
  } else {
    out += `**⚡ Today** — ${todayItems.length} item${todayItems.length !== 1 ? "s" : ""} on deck\n\n`;
    todayItems.slice(0, 5).forEach((i) => {
      out += `- ${i.text}\n`;
    });
    if (todayItems.length > 5)
      out += `- _…and ${todayItems.length - 5} more_\n`;
    out += "\n";
  }
  if (somedayItems.length > 0) {
    out += `**🌙 Someday spotlight** — ${somedayItems.length} idea${somedayItems.length !== 1 ? "s" : ""} waiting\n\n`;
    somedayItems.slice(0, 3).forEach((i) => {
      out += `- ${i.text}\n`;
    });
    if (somedayItems.length > 3)
      out += `- _…and ${somedayItems.length - 3} more_\n`;
    out += "\n";
  }
  if (latestMixNote) {
    out += `**🎛 Last mix note** — *${latestMixNote.song}*\n\n`;
    if (latestMixNote.note) out += `> ${latestMixNote.note}\n\n`;
    out += `_Logged ${latestMixNote.timestamp}_\n\n`;
  }
  out += `---\n\n_Let's get it. — Remi_`;
  return out;
}

function isMorningBriefingCommand(text: string): boolean {
  return /^(morning briefing|good morning|briefing)$/i.test(text.trim());
}

function buildWrapUpReply(
  completed: BrainItem[],
  tomorrowItems: BrainItem[],
  todayMixCount: number,
): string {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  let out = `**Session wrapped.** Good work today — *${dateStr}*\n\n---\n\n`;
  if (completed.length === 0) {
    out += `**✅ Completed** — nothing was in Today. Fresh start tomorrow.\n\n`;
  } else {
    out += `**✅ Completed** — ${completed.length} item${completed.length !== 1 ? "s" : ""} cleared\n\n`;
    completed.slice(0, 6).forEach((i) => {
      out += `- ~~${i.text}~~\n`;
    });
    if (completed.length > 6) out += `- _…and ${completed.length - 6} more_\n`;
    out += "\n";
  }
  if (todayMixCount > 0)
    out += `**🎛 Mix notes logged today** — ${todayMixCount}\n\n`;
  if (tomorrowItems.length > 0) {
    out += `**📅 Rolling to Tomorrow** — ${tomorrowItems.length} item${tomorrowItems.length !== 1 ? "s" : ""} queued\n\n`;
    tomorrowItems.slice(0, 3).forEach((i) => {
      out += `- ${i.text}\n`;
    });
    if (tomorrowItems.length > 3)
      out += `- _…and ${tomorrowItems.length - 3} more_\n`;
    out += "\n";
  }
  out += `---\n\n_Rest up. — Remi_`;
  return out;
}

function isWrapUpCommand(text: string): boolean {
  return /^(wrap up|end session|wrap it up|good night|night|session done|done for today)$/i.test(
    text.trim(),
  );
}

// Bubble fills/borders are driven by the picked color (color-picker behavior,
// unchanged). The subtle box-shadow glow + slightly-brighter luminous border are
// the redesign's "lit from within" treatment, keyed off the same picked color.
function userBubbleStyles(color: string, style: UserBubbleStyle) {
  // Neon-edge glow: centered (0 0) so it haloes all sides, ~0.45 opacity, 16px blur.
  if (style === "outline")
    return {
      background: "transparent",
      border: `1.5px solid ${color}cc`,
      color: "var(--t-text2)" as const,
      boxShadow: `0 0 16px ${color}73`,
    };
  return {
    background: color + "28",
    border: `1.5px solid ${color}99`,
    color: "var(--t-text2)" as const,
    boxShadow: `0 0 16px ${color}73`,
  };
}

function remiBubbleStyles(color: string, style: UserBubbleStyle) {
  // Neon-edge glow: centered (0 0), ~0.35 opacity, 14px blur; border ~0.5.
  if (style === "outline")
    return {
      background: "var(--t-bg-deep)",
      border: `1px solid ${color}80`,
      color: "var(--t-text2)" as const,
      boxShadow: `0 0 14px ${color}59`,
    };
  return {
    background: color + "18",
    border: `1px solid ${color}80`,
    color: "var(--t-text2)" as const,
    boxShadow: `0 0 14px ${color}59`,
  };
}

function formatAiText(text: string): string {
  return text.replace(/•\s*/g, "• ").replace(/\n{3,}/g, "\n\n");
}

interface ColorPickerPanelProps {
  current: string;
  onSelect: (v: string) => void;
  side: "user" | "remi";
  bubbleStyle?: UserBubbleStyle;
  onStyleChange?: (s: UserBubbleStyle) => void;
}
function ColorPickerPanel({
  current,
  onSelect,
  side,
  bubbleStyle,
  onStyleChange,
}: ColorPickerPanelProps) {
  return (
    <div
      className="absolute top-8 right-0 z-30 rounded-2xl border border-white/10 p-3 overlay-fade-in"
      style={{
        background: "var(--t-surface)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        minWidth: 180,
      }}
    >
      <p className="text-xs text-white/30 uppercase tracking-widest mb-2 pl-0.5">
        {side === "user" ? "Your bubbles" : "Remi's side"}
      </p>
      <div className="flex flex-wrap gap-2 mb-1">
        {ACCENT_COLORS.map((c) => (
          <button
            key={c.name}
            className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 active:scale-95"
            style={{
              background: c.value,
              borderColor: current === c.value ? "white" : "transparent",
              boxShadow: current === c.value ? `0 0 0 1px ${c.value}` : "none",
            }}
            onClick={() => onSelect(c.value)}
            title={c.name}
            data-testid={`color-option-${side}-${c.name}`}
          />
        ))}
      </div>
      {side === "user" && onStyleChange && bubbleStyle && (
        <>
          <div className="w-full h-px bg-white/8 my-3" />
          <p className="text-xs text-white/30 uppercase tracking-widest mb-2 pl-0.5">
            Style
          </p>
          <div className="flex gap-2">
            {(["filled", "outline"] as UserBubbleStyle[]).map((s) => (
              <button
                key={s}
                className="flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all"
                style={{
                  background:
                    bubbleStyle === s ? current + "18" : "transparent",
                  borderColor:
                    bubbleStyle === s
                      ? current + "80"
                      : "rgba(255,255,255,0.1)",
                }}
                onClick={() => onStyleChange(s)}
                data-testid={`style-option-${s}`}
              >
                <div
                  className="w-10 h-5 rounded-full"
                  style={
                    s === "filled"
                      ? {
                          background: current + "40",
                          border: `1.5px solid ${current}50`,
                        }
                      : {
                          background: "transparent",
                          border: `1.5px solid ${current}cc`,
                        }
                  }
                />
                <span
                  className="text-xs font-medium capitalize"
                  style={{
                    color:
                      bubbleStyle === s ? current : "rgba(255,255,255,0.4)",
                  }}
                >
                  {s}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface SuggestionBarProps {
  command: Command;
  onUse: (trigger: string) => void;
  onDismiss: () => void;
}
function SuggestionBar({ command, onUse, onDismiss }: SuggestionBarProps) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const accentColor = CATEGORY_COLORS[command.category] ?? "#f59e0b";
  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    isDragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || startX.current === null) return;
    setOffsetX(Math.min(0, e.clientX - startX.current));
  };
  const handlePointerUp = () => {
    isDragging.current = false;
    if (offsetX < -60) onDismiss();
    else setOffsetX(0);
    startX.current = null;
  };
  const opacity = Math.max(0, 1 + offsetX / 140);
  return (
    <div
      className="w-full suggest-in overflow-hidden"
      style={{
        transform: `translateX(${offsetX}px)`,
        opacity,
        transition: isDragging.current
          ? "none"
          : "transform 0.25s ease, opacity 0.2s ease",
        willChange: "transform",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      data-testid="suggestion-bar"
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{
          background: "var(--surface-elevated)",
          border: `1px solid ${accentColor}3a`,
          boxShadow: `0 0 14px ${accentColor}24`,
        }}
      >
        <div
          className="w-0.5 h-7 rounded-full shrink-0"
          style={{ background: accentColor + "70" }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/35 leading-none mb-0.5">
            Did you mean
          </p>
          <p
            className="text-xs font-medium truncate leading-snug"
            style={{
              color: "var(--t-text2)",
              fontFamily: "'Space Mono', monospace",
            }}
            data-testid="suggestion-trigger"
          >
            "{command.trigger}"
          </p>
        </div>
        <button
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all active:scale-95"
          style={{ background: accentColor + "20", color: accentColor }}
          onClick={() => onUse(command.trigger)}
          data-testid="button-use-suggestion"
        >
          <CornerDownRight size={11} />
          Use it
        </button>
        <button
          className="p-1 rounded-lg text-white/20 hover:text-white/50 transition-colors shrink-0"
          onClick={onDismiss}
          data-testid="button-dismiss-suggestion"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Whisper transcription ────────────────────────────────────────────────────
async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  // Use the correct extension so OpenAI can detect the format
  const blobType = audioBlob.type || "";
  const ext = blobType.includes("mp4") || blobType.includes("m4a") ? "mp4"
    : blobType.includes("ogg") ? "ogg"
    : "webm";
  formData.append("file", audioBlob, `recording.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "en");
  const response = await fetch(`${JARVIS_URL}/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REMI_API_KEY}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`Whisper error ${response.status}`);
  const data = await response.json();
  return (data.text ?? "").trim();
}

// ─── Mix note deep-link helpers ───────────────────────────────────────────────
// Mirrors telegram_bot.py _ARTIST_ALIASES (sorted longest-first for prefix match)
const _MIX_ALIASES: [string, string][] = ([
  ["all but denied",      "All But Denied"],
  ["allbutdenied",        "All But Denied"],
  ["abd",                 "All But Denied"],
  ["ophidian breeze",     "Ophidian Breeze"],
  ["phidian breeze",      "Ophidian Breeze"],
  ["offidian breeze",     "Ophidian Breeze"],
  ["opidian breeze",      "Ophidian Breeze"],
  ["aphidia breeze",      "Ophidian Breeze"],
  ["aphidian breeze",     "Ophidian Breeze"],
  ["aphidia and breeze",  "Ophidian Breeze"],
  ["aphidian and breeze", "Ophidian Breeze"],
  ["a fit and breeze",    "Ophidian Breeze"],
  ["a fit in breeze",     "Ophidian Breeze"],
  ["a feed and breeze",   "Ophidian Breeze"],
  ["affinity and breeze", "Ophidian Breeze"],
  ["affinity breeze",     "Ophidian Breeze"],
  ["affinity in breeze",  "Ophidian Breeze"],
  ["fideon breeze",       "Ophidian Breeze"],
  ["fidian breeze",       "Ophidian Breeze"],
  ["fidean breeze",       "Ophidian Breeze"],
  ["fideo and breeze",    "Ophidian Breeze"],
  ["ophidian",            "Ophidian Breeze"],
  ["phidian",             "Ophidian Breeze"],
  ["offidian",            "Ophidian Breeze"],
  ["opidian",             "Ophidian Breeze"],
  ["aphidia",             "Ophidian Breeze"],
  ["aphidian",            "Ophidian Breeze"],
  ["chasing wind",        "Chasing Wind"],
  ["chasing win",         "Chasing Wind"],
  ["jen lindstrom",       "Jim Lindstrom"],
  ["gym lindstrom",       "Jim Lindstrom"],
  ["jen marcotte",        "Jim Marcotte"],
  ["gym marcotte",        "Jim Marcotte"],
  ["j michaels",          "J. Michaels"],
  ["j. michaels",         "J. Michaels"],
  ["jmichaels",           "J. Michaels"],
  ["cw",                  "Chasing Wind"],
  ["spades",              "Spades"],
  ["cynthia",             "Cynthia"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

function _resolveMixArtist(rest: string): { artist: string; song: string } {
  const lower = rest.toLowerCase();
  for (const [alias, full] of _MIX_ALIASES) {
    // Boundary: alias must be followed by end-of-string or a non-letter (space, comma, etc.)
    if (lower.startsWith(alias) && (lower.length === alias.length || !/[a-z]/i.test(lower[alias.length]))) {
      const song = rest.slice(alias.length).replace(/^[\s,.:;]+/, "").trim();
      return { artist: full, song };
    }
  }
  const tokens = rest.split(/\s+/);
  return { artist: tokens[0] || "", song: tokens.slice(1).join(" ") };
}
// ─────────────────────────────────────────────────────────────────────────────

// Renders an AI message body: pulls any Notion page URLs out of the markdown
// text and shows them as compact "↗ Notion" chips below, instead of raw URLs.
function AiText({ text }: { text: string }) {
  const urls = text.match(NOTION_URL_RE) ?? [];
  const cleaned = urls.length
    ? text.replace(NOTION_URL_RE, "").replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, "\n").trim()
    : text;
  return (
    <>
      <div className="prose-dark leading-relaxed whitespace-pre-wrap" style={{ fontSize: "inherit" }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatAiText(cleaned)}</ReactMarkdown>
      </div>
      {urls.length > 0 && (
        <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {urls.map((url, i) => (
            <button
              key={i}
              onClick={() => window.open(url, "_blank")}
              data-testid="notion-chip"
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                padding: "4px 10px", borderRadius: "6px",
                background: "#3dd6b01f", border: "1px solid #3dd6b045",
                color: "#3dd6b0", fontSize: "0.78em", lineHeight: 1, cursor: "pointer",
              }}
            >
              <ExternalLink size={11} /> Notion
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function MainChat() {
  const [, navigate] = useLocation();
  // Chat history is server-owned (see the sync effect below) — never persisted
  // to localStorage, which caused per-device divergence. React state only.
  // Starts empty (NOT SEED_MESSAGES) so a failed/empty mount fetch can never
  // leave stale seed messages on screen; a skeleton covers the initial load.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [mixNotes, setMixNotes] = useLocalStorage<MixNote[]>(
    STORAGE_KEYS.MIX_NOTES,
    [],
  );
  const [brainItems, setBrainItems] = useLocalStorage<BrainItem[]>(
    STORAGE_KEYS.BRAIN_DUMP_ITEMS,
    [],
  );
  const [sessionLog, setSessionLog] = useLocalStorage<SessionLog[]>(
    STORAGE_KEYS.SESSION_LOG,
    [],
  );
  const [oneThing, setOneThing] = useLocalStorage<string>(
    STORAGE_KEYS.ONE_THING,
    "",
  );
  const [pwaNudgeDismissed, setPwaNudgeDismissed] = useLocalStorage<boolean>(
    STORAGE_KEYS.PWA_NUDGE_DISMISSED,
    false,
  );
  const [userColor, setUserColor] = useLocalStorage<string>(
    STORAGE_KEYS.USER_COLOR,
    "#f59e0b",
  );
  const [remiColor, setRemiColor] = useLocalStorage<string>(
    STORAGE_KEYS.REMI_COLOR,
    "#f59e0b",
  );
  // Drives the input's border/glow color from userColor (the picked bubble color).
  // Tracked in JS because :focus styling can't be done inline.
  const [inputFocused, setInputFocused] = useState(false);
  const [bubbleStyle, setBubbleStyle] = useLocalStorage<UserBubbleStyle>(
    STORAGE_KEYS.USER_BUBBLE_STYLE,
    "filled",
  );

  // Mic state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isJarvisLoading, setIsJarvisLoading] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);
  const pointerStartYRef = useRef<number>(0);

  // Voice mode
  const [voiceEnabled, setVoiceEnabled] = useLocalStorage<boolean>("remi_voice_enabled", false);
  const voiceEnabledRef = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // WebSocket TTS streaming refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsActiveSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const wsStreamDoneRef = useRef<boolean>(false);
  // Accumulates raw PCM (header-stripped) across all stream frames; decoded once at end.
  const wsRawPcmRef = useRef<Uint8Array[]>([]);

  // Font size toggle: 0=Normal(16px), 1=Large(20px), 2=Larger(24px)
  const FONT_SIZES = [16, 20, 24] as const;
  const [fontSizeStep, setFontSizeStep] = useState<number>(() => {
    const s = parseInt(localStorage.getItem("remi_font_size") ?? "0", 10);
    return [0, 1, 2].includes(s) ? s : 0;
  });
  function cycleFontSize() {
    const next = (fontSizeStep + 1) % 3;
    setFontSizeStep(next);
    localStorage.setItem("remi_font_size", String(next));
  }

  const [menuOpen,  setMenuOpen]  = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);
  const { toast } = useToast();
  const [openPicker, setOpenPicker] = useState<"user" | "remi" | null>(null);
  const [systemOnline] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [inputText, setInputText] = useState("");
  const [recentCommands, setRecentCommands] = useLocalStorage<string[]>(
    STORAGE_KEYS.RECENT_COMMANDS,
    [],
  );
  const [suggestion, setSuggestion] = useState<Command | null>(null);
  const [dismissedTrigger, setDismissedTrigger] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<{
    message: string;
    onUndo: () => void;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [deadlineCount, setDeadlineCount] = useState<number>(0);
  const [deadlineDismissed, setDeadlineDismissed] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef(new Date());
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Cleanup typewriter on unmount
  useEffect(() => () => { if (typewriterRef.current) clearInterval(typewriterRef.current); }, []);

  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  // Mirror the in-flight send flag into a ref so the background sync (visibility +
  // polling) can skip a refresh mid-send without resubscribing its listeners.
  const isSendingRef = useRef(false);
  useEffect(() => { isSendingRef.current = isJarvisLoading; }, [isJarvisLoading]);

  useEffect(() => {
    document.documentElement.style.setProperty("--remi-accent", remiColor);
  }, [remiColor]);
  useEffect(() => {
    if (!openPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setOpenPicker(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openPicker]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isJarvisLoading]);
  // Chat history sync — the server (/remi/history) is the single source of truth.
  // Clear any stale localStorage from older builds, load on mount, and keep fresh
  // via a visibilitychange re-sync (switching back to Remi) + a 60s background
  // poll. All silent (no spinner). Skips while a send is in flight so the next
  // sync can't clobber the optimistic append before the server has stored it.
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEYS.CHAT_MESSAGES); } catch { /* ignore */ }

    const sync = (onlyIfDifferent: boolean) => {
      if (isSendingRef.current) return;
      fetch(`${JARVIS_URL}/remi/history?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${REMI_API_KEY}` },
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const msgs = data?.messages;
          if (!Array.isArray(msgs) || !msgs.length) return;
          setMessages((prev) =>
            onlyIfDifferent && msgs.length === prev.length ? prev : (msgs as ChatMessage[]),
          );
        })
        .catch(() => {});
    };

    // Initial load — distinct from the background sync: SEED must never show, so
    // an empty or failed history resolves to [] (not seeds), and the loading
    // skeleton is always cleared once the request settles.
    fetch(`${JARVIS_URL}/remi/history?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${REMI_API_KEY}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const msgs = data?.messages;
        setMessages(Array.isArray(msgs) && msgs.length ? (msgs as ChatMessage[]) : []);
      })
      .catch(() => { setMessages([]); })
      .finally(() => { setHistoryLoading(false); });

    const onVisible = () => { if (document.visibilityState === "visible") sync(false); };
    document.addEventListener("visibilitychange", onVisible);
    const pollId = setInterval(() => sync(true), 60000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(pollId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // On mount: check for upcoming deadlines — show banner in background, don't block chat
  useEffect(() => {
    if (sessionStorage.getItem("deadline_banner_dismissed") === "1") return;
    fetch(`${JARVIS_URL}/deadlines/check`, {
      headers: { Authorization: `Bearer ${REMI_API_KEY}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.has_upcoming && d.count > 0) setDeadlineCount(d.count);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Auto-dismiss deadline banner after 10 seconds; cleanup on unmount
  useEffect(() => {
    if (!deadlineCount || deadlineDismissed) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem("deadline_banner_dismissed", "1");
      setDeadlineDismissed(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [deadlineCount, deadlineDismissed]);
  useEffect(() => {
    if (inputText.length < 3) {
      setSuggestion(null);
      return;
    }
    if (parseMixNoteCommand(inputText)) {
      setSuggestion(null);
      return;
    }
    const timer = setTimeout(() => {
      const match = findBestMatch(inputText);
      if (match && match.command.trigger !== dismissedTrigger)
        setSuggestion(match.command);
      else setSuggestion(null);
    }, 280);
    return () => clearTimeout(timer);
  }, [inputText, dismissedTrigger]);

  const copyMessage = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    }).catch(() => {});
  }, []);

  const handleScrollCheck = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 100);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const recordRecentCommand = useCallback(
    (trigger: string) => {
      setRecentCommands((prev) => {
        const deduped = prev.filter((t) => t !== trigger);
        return [trigger, ...deduped].slice(0, 3);
      });
    },
    [setRecentCommands],
  );

  const handleDismissSuggestion = useCallback(() => {
    if (suggestion) setDismissedTrigger(suggestion.trigger);
    setSuggestion(null);
  }, [suggestion]);
  const handleDismissDeadlineBanner = useCallback(() => {
    sessionStorage.setItem("deadline_banner_dismissed", "1");
    setDeadlineDismissed(true);
  }, []);
  const handleUseSuggestion = useCallback((trigger: string) => {
    setInputText(trigger);
    setSuggestion(null);
    setDismissedTrigger(null);
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    if (!voiceEnabledRef.current || !text.trim()) return;

    // Stop any ongoing playback (REST or WS)
    if (audioRef.current) { try { audioRef.current.stop(); } catch { /* already stopped */ } audioRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    wsActiveSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    wsActiveSourcesRef.current = [];
    wsStreamDoneRef.current = false;
    wsRawPcmRef.current = [];

    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const actx = audioContextRef.current;
    try { if (actx.state === "suspended") await actx.resume(); } catch {}

    const ttsText = text
      .replace(/_"[^"]*"_/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[*_`]/g, "")
      .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{27BF}️]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!ttsText) return;

    setIsSpeaking(true);

    // REST fallback — used if WS fails to open within 3s or errors pre-stream
    const _restFallback = async () => {
      try {
        const resp = await fetch(`${JARVIS_URL}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${REMI_API_KEY}` },
          body: JSON.stringify({ text: ttsText }),
        });
        if (!resp.ok) throw new Error(`TTS ${resp.status}`);
        const buf = await resp.arrayBuffer();
        const audioBuffer = await actx.decodeAudioData(buf);
        const source = actx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(actx.destination);
        audioRef.current = source;
        source.onended = () => { setIsSpeaking(false); audioRef.current = null; };
        source.start();
      } catch (e) {
        console.warn("[speakResponse/rest]", (e as Error).message);
        setIsSpeaking(false);
      }
    };

    // WebSocket path — backend streams WAV frames (44-byte RIFF header + raw PCM,
    // 24kHz Int16 LE mono) per ElevenLabs chunk. Auth via query param (browsers
    // can't set headers on the WebSocket constructor).
    //
    // Single-buffer decode: strip the 44-byte header off every frame, accumulate
    // the raw PCM, and decode the ENTIRE stream as one AudioBuffer when the empty
    // end-frame arrives. This avoids the per-batch resampling seams and the 16-bit
    // sample misalignment that produced loud static — ElevenLabs chunk boundaries
    // are not sample-aligned. Replaces the old BATCH_SIZE=8 pipeline.
    const WAV_HEADER_SIZE = 44;

    const finalizeAndPlay = () => {
      const chunks = wsRawPcmRef.current;
      wsRawPcmRef.current = [];
      let totalPcm = chunks.reduce((sum, c) => sum + c.byteLength, 0);
      // Drop a trailing odd byte so every 16-bit sample stays aligned.
      if (totalPcm % 2 !== 0) totalPcm -= 1;
      if (totalPcm <= 0) { setIsSpeaking(false); return; }

      // One valid WAV envelope around the complete PCM stream.
      const wav = new ArrayBuffer(WAV_HEADER_SIZE + totalPcm);
      const view = new DataView(wav);
      const SR = 24000;
      view.setUint32(0, 0x52494646, false);    // "RIFF"
      view.setUint32(4, 36 + totalPcm, true);  // RIFF chunk size
      view.setUint32(8, 0x57415645, false);    // "WAVE"
      view.setUint32(12, 0x666d7420, false);   // "fmt "
      view.setUint32(16, 16, true);            // fmt chunk size (PCM)
      view.setUint16(20, 1, true);             // audio format = PCM
      view.setUint16(22, 1, true);             // channels = mono
      view.setUint32(24, SR, true);            // sample rate
      view.setUint32(28, SR * 2, true);        // byte rate = SR * channels * bytesPerSample
      view.setUint16(32, 2, true);             // block align
      view.setUint16(34, 16, true);            // bits per sample
      view.setUint32(36, 0x64617461, false);   // "data"
      view.setUint32(40, totalPcm, true);      // data chunk size

      const out = new Uint8Array(wav, WAV_HEADER_SIZE);
      let offset = 0;
      for (const c of chunks) {
        const remaining = totalPcm - offset;
        if (remaining <= 0) break;
        const slice = c.byteLength <= remaining ? c : c.subarray(0, remaining);
        out.set(slice, offset);
        offset += slice.byteLength;
      }

      // Single decode → single AudioBuffer → single scheduled source. No seams.
      actx.decodeAudioData(wav)
        .then((audioBuffer) => {
          const source = actx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(actx.destination);
          wsActiveSourcesRef.current.push(source);
          source.onended = () => {
            wsActiveSourcesRef.current = wsActiveSourcesRef.current.filter(s => s !== source);
            if (wsActiveSourcesRef.current.length === 0 && wsStreamDoneRef.current) {
              setIsSpeaking(false);
            }
          };
          source.start();
        })
        .catch((e) => {
          console.warn("[speakResponse/ws] decode:", e);
          setIsSpeaking(false);
        });
    };

    const JARVIS_WS_URL = JARVIS_URL.replace("https://", "wss://").replace("http://", "ws://");
    let settled = false;    // true once WS opened OR fallback fired
    let fallbackFired = false;

    const fallbackTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        fallbackFired = true;
        if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
        _restFallback();
      }
    }, 3000);

    const ws = new WebSocket(`${JARVIS_WS_URL}/ws/tts?key=${encodeURIComponent(REMI_API_KEY)}`);
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";
    wsRawPcmRef.current = [];

    ws.onopen = () => {
      clearTimeout(fallbackTimer);
      settled = true;
      ws.send(ttsText);
    };

    ws.onmessage = (event) => {
      if (fallbackFired || !(event.data instanceof ArrayBuffer)) return;
      // Empty frame (or a header-only/short frame) = end of stream.
      // Decode the whole accumulated PCM stream as a single buffer.
      if (event.data.byteLength <= WAV_HEADER_SIZE) {
        wsStreamDoneRef.current = true;
        if (wsRef.current === ws) wsRef.current = null;
        finalizeAndPlay();
        return;
      }
      // Strip this frame's 44-byte WAV header; keep only the raw PCM bytes.
      wsRawPcmRef.current.push(new Uint8Array(event.data.slice(WAV_HEADER_SIZE)));
    };

    ws.onerror = () => {
      clearTimeout(fallbackTimer);
      if (!fallbackFired) {
        fallbackFired = true;
        settled = true;
        if (wsRef.current === ws) wsRef.current = null;
        _restFallback();
      }
    };

    ws.onclose = () => {
      clearTimeout(fallbackTimer);
      if (wsRef.current === ws) wsRef.current = null;
      // Closed without end frame and no fallback — clear speaking if nothing queued
      if (!wsStreamDoneRef.current && !fallbackFired && wsActiveSourcesRef.current.length === 0) {
        setIsSpeaking(false);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(
    (text: string, isVoice = false) => {
      if (!text.trim()) return;
      // Deep link: "mix note[s] session [for] [artist] [song]" → navigate only, never send to Jarvis
      const _mixMatch = text.match(/\b(mix(?:ed)?\s*notes?|mixnode)\s*session[\s,;.:]*(.+)/i);
      if (_mixMatch) {
        const _rest = _mixMatch[2].trim().replace(/^for[\s,;.]+/i, "").replace(/[.!?]+$/, "").trim();
        const { artist: _artist, song: _song } = _resolveMixArtist(_rest);
        sessionStorage.setItem("mix_notes_prefill", JSON.stringify({ artist: _artist, song: _song }));
        setInputText("");
        navigate("/mix-notes");
        return; // do not fall through — Jarvis never sees this message
      }
      setSuggestion(null);
      setDismissedTrigger(null);
      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        text: text.trim(),
        timestamp: now,
        ...(isVoice && { isVoice: true }),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputText("");
      const match = findBestMatch(text.trim(), 0.3);
      if (match) recordRecentCommand(match.command.trigger);
      setIsJarvisLoading(true);
      const history = messages.slice(-8).map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      }));
      fetch(`${JARVIS_URL}/remi`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REMI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: text.trim(), user_id: "remi", history }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error === "session_expired") {
            clearPinUnlock();
            window.location.reload();
            return;
          }
          setIsJarvisLoading(false);
          if (data.type === "triage_redirect" && Array.isArray(data.items)) {
            sessionStorage.setItem("triage_preload", JSON.stringify(data.items));
            navigate("/triage");
            return;
          }
          if (data.type === "session_redirect") {
            navigate("/session");
            return;
          }
          const _aiText = data.response
            ? (data.response as string).replace(/•/g, "\n•")
            : "Didn't land. Try again.";
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 2).toString(),
              role: "ai",
              text: _aiText,
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              ...(Array.isArray(data.pages) && data.pages.length > 0
                ? { pages: data.pages as Array<{ title: string; url: string | null }> }
                : {}),
              ...(data.card ? { card: data.card } : {}),
            },
          ]);
          // Prefer the backend's clean tts string when present (e.g. reminder
          // confirmations); only fall back to "marked complete" for a task_done
          // card with no tts (the voice mark-done flow).
          const _ttsText = typeof data.tts === "string" && data.tts
            ? data.tts
            : data.card?.type === "task_done"
            ? `${data.card.task_name} marked complete`
            : _aiText;
          speakResponse(_ttsText);
        })
        .catch(() => {
          setIsJarvisLoading(false);
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 2).toString(),
              role: "ai",
              text: "Didn't land. Try again.",
              timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);
        });
    },
    [messages, setMessages, recordRecentCommand, navigate, speakResponse],
  );

  // ─── Mic: 150ms hold-to-record ───────────────────────────────────────────
  function handleMicDown() {
    if (mediaRecorderRef.current) return; // already recording
    holdActiveRef.current = false;
    setRecordingError(null);
    holdTimerRef.current = setTimeout(async () => {
      holdActiveRef.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!holdActiveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/ogg";
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
        recorder.onstop = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setIsRecording(false);
          setIsLocked(false);
          // 800ms flush: Safari delivers dataavailable after onstop.
          setTimeout(() => {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            audioChunksRef.current = [];
            if (blob.size === 0) { setIsTranscribing(false); return; }
            transcribeAudio(blob)
              .then((transcript) => {
                setIsTranscribing(false);
                if (transcript) {
                  // Discard Whisper silence artifacts (common hallucinations on short/silent recordings)
                  const SILENCE_ARTIFACTS = ["you", "thanks", "thank you", "thank you.", "thanks.", "bye", "bye.", ""];
                  const cleaned = transcript.trim().toLowerCase();
                  if (cleaned.length < 8 && SILENCE_ARTIFACTS.includes(cleaned)) {
                    return; // discard silently — isTranscribing and isRecording already cleared above
                  }
                  const _vm = transcript.match(/\b(mix(?:ed)?\s*notes?|mixnode)\s*session[\s,;.:]*(.+)/i);
                  if (_vm) {
                    const _rest = _vm[2].trim().replace(/^for[\s,;.]+/i, "").replace(/[.!?]+$/, "").trim();
                    const { artist: _a, song: _s } = _resolveMixArtist(_rest);
                    sessionStorage.setItem("mix_notes_prefill", JSON.stringify({ artist: _a, song: _s }));
                    navigate("/mix-notes");
                    return;
                  }
                  // FIX 4: typewriter reveal — 18ms/char, then auto-send
                  let i = 0;
                  setInputText("");
                  if (typewriterRef.current) clearInterval(typewriterRef.current);
                  typewriterRef.current = setInterval(() => {
                    i++;
                    setInputText(transcript.slice(0, i));
                    if (i >= transcript.length) {
                      clearInterval(typewriterRef.current!);
                      typewriterRef.current = null;
                      sendMessage(transcript, true);
                    }
                  }, 18);
                } else setRecordingError("Nothing captured — try again.");
              })
              .catch(() => {
                setIsTranscribing(false);
                setRecordingError("Transcription failed — check connection.");
              });
          }, 800);
        };
        recorder.start(100);
      } catch {
        setIsRecording(false);
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
      setIsTranscribing(true); // FIX 3: immediate transcribing feedback on release
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
      setIsTranscribing(true); // FIX 3: show transcribing on locked send too
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const togglePicker = (side: "user" | "remi") =>
    setOpenPicker((p) => (p === side ? null : side));
  const restartLabel = mountTimeRef.current.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // In-app refresh — re-pull conversation history (and the deadline banner) from
  // Jarvis WITHOUT a full document reload. window.location.reload() used to tear
  // down the PWA WebView and break the header layout; this keeps the header,
  // layout, and all component state intact, reloading only the data. Mirrors the
  // two mount-time fetches above; minSpin keeps the icon's single rotation visible
  // even when the fetch returns instantly.
  const refreshData = useCallback(async () => {
    setSyncing(true);
    const minSpin = new Promise<void>((resolve) => setTimeout(resolve, 450));
    // cache: "no-store" + cache-busting param: /remi/history sends no
    // Cache-Control header, so the PWA/WebView HTTP cache was serving a stale
    // body on refresh — setMessages got the same old array and the list never
    // visibly changed. Force the network so refresh always pulls fresh data.
    const loadHistory = fetch(`${JARVIS_URL}/remi/history?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${REMI_API_KEY}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const msgs = data?.messages;
        if (Array.isArray(msgs) && msgs.length) setMessages(msgs as ChatMessage[]);
      })
      .catch(() => {});
    const loadDeadlines = sessionStorage.getItem("deadline_banner_dismissed") === "1"
      ? Promise.resolve()
      : fetch(`${JARVIS_URL}/deadlines/check?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${REMI_API_KEY}` },
          cache: "no-store",
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d?.has_upcoming && d.count > 0) setDeadlineCount(d.count); })
          .catch(() => {});
    await Promise.all([loadHistory, loadDeadlines, minSpin]);
    setSyncing(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: "100%", height: "100dvh", overflow: "hidden", position: "relative", background: "var(--t-bg-deep)" }}>
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
    <div
      className="flex flex-col h-full w-full select-none"
      style={{ background: "var(--t-bg-deep)" }}
    >
      {/* Header */}
      <div
        className="flex items-center px-4 border-b border-white/5 shrink-0"
        style={{
          background: "var(--t-surface)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <div className="flex items-center flex-1 -ml-1">
        <div className="relative">
          <button
            className="p-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors"
            onClick={() => {
              setMenuOpen(true);
              setOpenPicker(null);
            }}
            data-testid="button-hamburger-menu"
          >
            <Menu size={20} style={{ color: "var(--color-tonight)", filter: "drop-shadow(0 0 4px #9b8de866)" }} />
          </button>
          {brainItems.filter((i) => i.bucket === "today").length > 0 && (
            <div
              className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center pointer-events-none"
              style={{
                background: "#22c55e",
                boxShadow: "0 0 6px rgba(34,197,94,0.7)",
              }}
              data-testid="badge-today-count"
            >
              <span
                className="text-[9px] font-bold leading-none"
                style={{
                  color: "#111111",
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {brainItems.filter((i) => i.bucket === "today").length}
              </span>
            </div>
          )}
        </div>
          <button
            className="p-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors"
            onClick={cycleFontSize}
            data-testid="button-font-size"
            title="Font size"
          >
            <span style={{
              fontSize: fontSizeStep === 0 ? "13px" : fontSizeStep === 1 ? "17px" : "21px",
              fontWeight: 700,
              lineHeight: 1,
              display: "block",
              color: "var(--color-tasks)",
              filter: "drop-shadow(0 0 4px #f5a62366)",
            }}>A</span>
          </button>
          <button
            className="p-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors"
            onClick={() => { if (!syncing) refreshData(); }}
            data-testid="button-sync-refresh"
            title="Sync / refresh"
            aria-label="Sync and refresh"
          >
            <RefreshCw
              size={18}
              style={{
                color: "var(--color-studio)",
                filter: "drop-shadow(0 0 4px #3dd6b066)",
                transition: "transform 400ms ease",
                transform: syncing ? "rotate(360deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </div>
        <div className="flex items-center justify-center shrink-0">
          <span
            className="text-lg font-bold tracking-tighter"
            style={{ fontFamily: "'Space Mono', monospace", color: remiColor }}
            data-testid="logo-remi"
          >
            Remi
          </span>
        </div>
        <div className="flex items-center justify-end flex-1 gap-3" ref={pickerRef}>
          <div className="flex items-center gap-0">
            <div className="relative flex flex-col items-center">
              <button
                className="w-4 h-4 rounded-full border-2 transition-all hover:scale-110 active:scale-95"
                style={{
                  background:
                    bubbleStyle === "outline"
                      ? "transparent"
                      : userColor + "cc",
                  borderColor: userColor,
                  boxShadow:
                    openPicker === "user" ? `0 0 0 2px ${userColor}55` : "none",
                }}
                onClick={() => togglePicker("user")}
                data-testid="button-color-picker-user"
              />
              <span className="text-[8px] text-white/25 mt-0.5 leading-none tracking-wider">
                you
              </span>
              {openPicker === "user" && (
                <ColorPickerPanel
                  current={userColor}
                  onSelect={setUserColor}
                  side="user"
                  bubbleStyle={bubbleStyle}
                  onStyleChange={setBubbleStyle}
                />
              )}
            </div>
            <div className="w-px h-3 bg-white/10 mx-2" />
            <div className="relative flex flex-col items-center">
              <button
                className="w-4 h-4 rounded-full border-2 transition-all hover:scale-110 active:scale-95"
                style={{
                  background: remiColor,
                  borderColor: remiColor,
                  boxShadow:
                    openPicker === "remi" ? `0 0 0 2px ${remiColor}55` : "none",
                }}
                onClick={() => togglePicker("remi")}
                data-testid="button-color-picker-remi"
              />
              <span className="text-[8px] text-white/25 mt-0.5 leading-none tracking-wider">
                remi
              </span>
              {openPicker === "remi" && (
                <ColorPickerPanel
                  current={remiColor}
                  onSelect={setRemiColor}
                  side="remi"
                />
              )}
            </div>
          </div>
          <button
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: voiceEnabled ? remiColor : "rgba(255,255,255,0.25)" }}
            onClick={() => {
              if (voiceEnabled) {
                if (audioRef.current) {
                  try { audioRef.current.stop(); } catch { /* already stopped */ }
                  audioRef.current = null;
                }
                if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
                wsActiveSourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
                wsActiveSourcesRef.current = [];
                setIsSpeaking(false);
              } else {
                if (!audioContextRef.current) {
                  audioContextRef.current = new AudioContext();
                } else if (audioContextRef.current.state === "suspended") {
                  audioContextRef.current.resume().catch(() => {});
                }
              }
              setVoiceEnabled((p) => !p);
            }}
            data-testid="button-voice-toggle"
            title={voiceEnabled ? "Voice on — tap to mute" : "Voice off"}
          >
            {voiceEnabled
              ? <Volume2 size={16} className={isSpeaking ? "animate-pulse" : ""} />
              : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      <SundaySweepChip onOpen={() => setSweepOpen(true)} />

      {!pwaNudgeDismissed && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 suggest-in"
          style={{ background: "var(--t-card)" }}
        >
          <span className="text-xs text-white/50 flex-1 leading-snug">
            📲 Add Remi to your home screen for the full experience
          </span>
          <button
            className="text-xs px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-all active:scale-95"
            style={{ background: remiColor + "22", color: remiColor }}
            onClick={() => setPwaNudgeDismissed(true)}
          >
            Got it
          </button>
          <button
            className="p-1 rounded-lg text-white/20 hover:text-white/50 transition-colors shrink-0"
            onClick={() => setPwaNudgeDismissed(true)}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {deadlineCount > 0 && !deadlineDismissed && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b border-amber-500/20"
          style={{ background: "#f59e0b1a" }}
        >
          <span
            className="text-xs flex-1 leading-snug font-medium"
            style={{ color: "#f59e0b" }}
          >
            You have {deadlineCount} upcoming deadline{deadlineCount !== 1 ? "s" : ""} — check your briefing
          </span>
          <button
            className="p-1 rounded-lg text-white/20 hover:text-white/50 transition-colors shrink-0"
            onClick={handleDismissDeadlineBanner}
            aria-label="Dismiss deadline banner"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {oneThing && (
        <div
          className="flex items-center gap-2.5 px-4 py-2 border-b border-white/5"
          style={{ background: `${remiColor}0d` }}
        >
          <Pin size={12} className="shrink-0" style={{ color: remiColor }} />
          <p
            className="text-xs flex-1 leading-snug"
            style={{
              color: "var(--t-text3)",
              fontFamily: "'Space Mono', monospace",
            }}
          >
            {oneThing}
          </p>
          <button
            className="p-1 rounded-lg text-white/20 hover:text-white/50 transition-colors shrink-0"
            onClick={() => setOneThing("")}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4"
        data-testid="chat-history"
        style={{ fontSize: FONT_SIZES[fontSizeStep] }}
        onScroll={handleScrollCheck}
        onClick={() => {
          setOpenPicker(null);
          setStatusOpen(false);
        }}
      >
        <div className="space-y-3">
        {historyLoading && messages.length === 0 ? (
          <div className="space-y-3 pt-2" data-testid="chat-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                <div
                  className="animate-pulse rounded-2xl"
                  style={{
                    width: i % 2 ? "55%" : "70%",
                    height: 44,
                    background: "var(--t-card)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                />
              </div>
            ))}
          </div>
        ) : messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} bubble-in`}
            data-testid={`message-${msg.role}-${msg.id}`}
          >
            <div
              className="max-w-[75%] px-3.5 py-2.5 leading-relaxed"
              style={
                msg.role === "user"
                  ? {
                      ...userBubbleStyles(userColor, bubbleStyle),
                      borderRadius: "1rem 1rem 0.25rem 1rem",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                      fontSize: "inherit",
                    }
                  : {
                      ...remiBubbleStyles(remiColor, bubbleStyle),
                      borderRadius: "1rem 1rem 1rem 0.25rem",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                      fontSize: "inherit",
                    }
              }
            >
              {msg.role === "ai" ? (
                <>
                  <AiText text={msg.text} />
                  {msg.pages && msg.pages.length > 0 && (
                    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "5px" }}>
                      {msg.pages.map((page, i) =>
                        page.url ? (
                          <a
                            key={i}
                            href={page.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "block",
                              padding: "6px 10px",
                              borderRadius: "8px",
                              background: "var(--surface-elevated)",
                              borderLeft: "2px solid #3dd6b0",
                              borderTop: "1px solid #3dd6b026",
                              borderRight: "1px solid #3dd6b026",
                              borderBottom: "1px solid #3dd6b026",
                              boxShadow: "0 0 12px #3dd6b01f",
                              color: "var(--t-text3)",
                              fontSize: "0.78em",
                              textDecoration: "none",
                              lineHeight: 1.3,
                            }}
                          >
                            {page.title}
                          </a>
                        ) : (
                          <div
                            key={i}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "7px",
                              background: "rgba(255,60,0,0.08)",
                              border: "1px solid rgba(255,60,0,0.2)",
                              color: "var(--t-text5)",
                              fontSize: "0.78em",
                              lineHeight: 1.3,
                            }}
                          >
                            ⚠️ {page.title}
                          </div>
                        )
                      )}
                    </div>
                  )}
                  {msg.card?.type === "task_done" && (
                    // Capture card: 3px left accent + category-color glow on an
                    // elevated surface. Done (✓) → studio teal; reminder (⏰) → tonight purple.
                    <div style={{
                      marginTop: "10px", padding: "10px 12px",
                      borderRadius: "10px",
                      background: "var(--surface-elevated)",
                      borderLeft: `3px solid ${msg.card.show_undo ? "#3dd6b0" : "#9b8de8"}`,
                      borderTop: `1px solid ${msg.card.show_undo ? "#3dd6b0" : "#9b8de8"}2e`,
                      borderRight: `1px solid ${msg.card.show_undo ? "#3dd6b0" : "#9b8de8"}2e`,
                      borderBottom: `1px solid ${msg.card.show_undo ? "#3dd6b0" : "#9b8de8"}2e`,
                      boxShadow: `0 0 16px ${msg.card.show_undo ? "#3dd6b0" : "#9b8de8"}33`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "9px" }}>
                        <span style={{ color: msg.card.show_undo ? "#3dd6b0" : "#9b8de8", fontSize: "1em", lineHeight: 1 }}>{msg.card.show_undo ? "✓" : "⏰"}</span>
                        <span style={{ color: "var(--text-primary)", fontSize: "0.85em", fontWeight: 500, lineHeight: 1.3 }}>{msg.card.task_name}</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <a
                          href={msg.card.notion_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", background: `${msg.card.show_undo ? "#3dd6b0" : "#9b8de8"}1f`, border: `1px solid ${msg.card.show_undo ? "#3dd6b0" : "#9b8de8"}45`, color: msg.card.show_undo ? "#3dd6b0" : "#9b8de8", fontSize: "0.78em", textDecoration: "none", lineHeight: 1 }}
                        >
                          <ExternalLink size={11} />
                          View in Notion
                        </a>
                        {msg.card.show_undo && (
                          <button
                            onClick={() => sendMessage("undo that")}
                            style={{ padding: "4px 10px", borderRadius: "6px", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)", fontSize: "0.78em", cursor: "pointer", lineHeight: 1 }}
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p>{msg.text}</p>
              )}
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <p className="text-xs opacity-30">{msg.timestamp}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyMessage(msg.id, msg.text); }}
                  className="transition-colors shrink-0 active:scale-90"
                  style={{
                    color: copiedId === msg.id
                      ? (msg.role === "user" ? userColor : remiColor)
                      : "rgba(255,255,255,0.25)",
                    padding: "2px",
                  }}
                  aria-label="Copy message"
                >
                  {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          </div>
        ))}
        {isJarvisLoading && (
          <div className="flex justify-start bubble-in">
            <div
              className="px-4 py-3"
              style={{
                ...remiBubbleStyles(remiColor, bubbleStyle),
                borderRadius: "1rem 1rem 1rem 0.25rem",
              }}
            >
              <div className="flex gap-1.5 items-end" style={{ height: "16px" }}>
                <div className="rounded-full animate-bounce" style={{ width: "6px", height: "6px", background: "var(--t-text4)", animationDelay: "0ms" }} />
                <div className="rounded-full animate-bounce" style={{ width: "6px", height: "6px", background: "var(--t-text4)", animationDelay: "150ms" }} />
                <div className="rounded-full animate-bounce" style={{ width: "6px", height: "6px", background: "var(--t-text4)", animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div style={{ height: 160 }} />
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll-to-bottom button — appears when scrolled > 100px from bottom */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          className="active:scale-90 transition-transform"
          style={{
            position: "fixed",
            bottom: 110,
            right: 20,
            zIndex: 9,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--t-surface)",
            border: "1px solid var(--t-border)",
            color: "var(--t-text4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            cursor: "pointer",
          }}
        >
          <ChevronDown size={18} />
        </button>
      )}

      <div
        className="remi-chat-input-bar"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--t-bg-deep)",
          zIndex: 10,
          padding: "8px 16px 48px",
        }}
      >
        {/* Lock bar: visible when user slides up to lock recording */}
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

        {recordingError && (
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-xs text-red-400/80 flex-1">{recordingError}</p>
          </div>
        )}

        {recentCommands.length > 0 && (
          <div className="w-full mb-2 suggest-in">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {recentCommands.map((trigger) => {
                const cmd = COMMANDS.find((c) => c.trigger === trigger);
                const color = cmd
                  ? (CATEGORY_COLORS[cmd.category] ?? "#f59e0b")
                  : "#f59e0b";
                const label = trigger.replace(/\s*\[.*?\]/g, "").trim();
                return (
                  <button
                    key={trigger}
                    className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95"
                    style={{
                      background: color + "1a",
                      border: `1px solid ${color}40`,
                      boxShadow: `0 0 10px ${color}24`,
                      color: "var(--t-text3)",
                    }}
                    onClick={() => handleUseSuggestion(trigger)}
                    data-testid={`chip-recent-${trigger}`}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span style={{ fontFamily: "'Space Mono', monospace" }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Input row: [text input or transcribing zone] [Send] [mic] */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputText);
          }}
          // Grid (not flex): minmax(0,1fr) sizes the input track deterministically so
          // it shrinks below content width in one layout pass. Flexbox left the input
          // at intrinsic width at initial paint on mobile Safari, pushing the mic past
          // the content box off the right edge until a reflow. Same fix as Session.
          className="w-full grid items-center gap-2"
          style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}
        >
          {isRecording ? (
            <div
              className="flex-1 flex items-center px-4 rounded-xl record-zone"
              style={{
                background: `${userColor}26`,
                border: `1.5px solid ${userColor}`,
                minHeight: "42px",
              }}
            >
              <span style={{ color: userColor, fontSize: "0.875rem", fontStyle: "italic" }}>
                Recording…
              </span>
            </div>
          ) : isTranscribing ? (
            <div
              className="flex-1 flex items-center px-4 rounded-xl"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                minHeight: "42px",
              }}
            >
              <span style={{ color: userColor, fontSize: "0.875rem", fontStyle: "italic" }}>
                Transcribing…
              </span>
            </div>
          ) : (
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder='Try "Mix note for [song] — [note]"'
              className="remi-chat-input min-w-0 w-full px-4 py-2.5 md:py-3 text-sm"
              style={{
                color: "var(--text-primary)",
                // Border + glow follow the picked user color. Inline beats the
                // shared .remi-chat-input class (which other pages keep on tonight).
                border: inputFocused
                  ? `1.5px solid ${userColor}`
                  : `1.5px solid color-mix(in srgb, ${userColor} 60%, transparent)`,
                boxShadow: inputFocused
                  ? `0 0 20px color-mix(in srgb, ${userColor} 35%, transparent), inset 0 0 12px color-mix(in srgb, ${userColor} 25%, transparent)`
                  : "none",
              }}
              data-testid="input-text-command"
            />
          )}

          <button
            type="submit"
            className="shrink-0 px-4 py-2.5 md:py-3 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={
              inputText.trim()
                ? {
                    // Picked user color, darkened ~15% (mix toward black) so it's
                    // richer/not washed out while white text + glow stay crisp.
                    background: `color-mix(in srgb, ${userColor} 85%, #000)`,
                    color: "#ffffff",
                    boxShadow: `0 0 16px color-mix(in srgb, ${userColor} 50%, transparent)`,
                  }
                : {
                    // Outlined in the user color when empty — still clearly "your color".
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: `1.5px solid color-mix(in srgb, ${userColor} 50%, transparent)`,
                    boxShadow: "none",
                  }
            }
            data-testid="button-send"
          >
            Send
          </button>

          {/* Mic — haptic first line, button color-change on recording */}
          <button
            type="button"
            className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center"
            style={{
              // Outlined at rest, filled when actively recording — matches the
              // bubble pattern. Idle: transparent bg, remiColor border + icon,
              // subtle glow. Recording: solid remiColor fill, white icon, stronger glow.
              background: isRecording ? remiColor : "transparent",
              border: `1.5px solid ${remiColor}`,
              boxShadow: isRecording
                ? `0 0 16px color-mix(in srgb, ${remiColor} 50%, transparent)`
                : `0 0 10px color-mix(in srgb, ${remiColor} 30%, transparent)`,
              // No scale on recording — a size change shifted the button under the
              // user's finger. Recording feedback is the bg/border/icon-color change.
              // Fixed dimensions (w-10 h-10 / md:w-12 h-12) keep position identical.
              transition: "background 0.1s ease, border-color 0.1s ease, box-shadow 0.1s ease",
              marginRight: "20px",
              touchAction: "none",
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
              pointerStartYRef.current = e.clientY;
              if (isRecording || isTranscribing) return; // busy guard
              setIsRecording(true); // immediate visual — fires same frame as press
              handleMicDown();
            }}
            onPointerMove={(e) => {
              if (!isRecording || isLocked) return;
              if (pointerStartYRef.current - e.clientY > 60) setIsLocked(true);
            }}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
            data-testid="button-voice"
          >
            {isTranscribing ? (
              <Loader2 size={16} className="animate-spin" style={{ color: isRecording ? "#ffffff" : remiColor }} />
            ) : (
              <Mic size={16} style={{ color: isRecording ? "#ffffff" : remiColor }} />
            )}
          </button>

        </form>

        {suggestion && (
          <div className="w-full mt-2">
            <SuggestionBar
              command={suggestion}
              onUse={handleUseSuggestion}
              onDismiss={handleDismissSuggestion}
            />
          </div>
        )}
      </div>

      <HamburgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onWeeklyReview={() => setSweepOpen(true)}
        onRefreshContext={() => {
          fetch(`${JARVIS_URL}/refresh-context`, {
            method: "POST",
            headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
          })
            .then((r) => r.json())
            .then(() => toast({ description: "Context refreshed", duration: 2500 }))
            .catch(() => toast({ description: "Context refresh failed", duration: 2500 }));
        }}
      />
      {sweepOpen && <SundaySweep onClose={() => setSweepOpen(false)} />}

      {undoAction && (
        <UndoBar
          message={undoAction.message}
          onUndo={undoAction.onUndo}
          onDismiss={() => setUndoAction(null)}
          accentColor={remiColor}
        />
      )}
    </div>
      </div>
    </div>
  );
}
