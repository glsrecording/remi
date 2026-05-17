import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Mic,
  MicOff,
  Menu,
  CornerDownRight,
  Pin,
  X,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import HamburgerMenu from "@/components/HamburgerMenu";
import UndoBar from "@/components/UndoBar";
import SundaySweep, { SundaySweepChip } from "@/components/SundaySweep";
import { useLocalStorage } from "@/hooks/use-local-storage";
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

const JARVIS_URL    = "https://jarvis.joshhollandgls.com";
const JARVIS_WS_URL = JARVIS_URL.replace("https://", "wss://").replace("http://", "ws://");
const REMI_API_KEY  = import.meta.env.VITE_REMI_API_KEY as string;

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

function userBubbleStyles(color: string, style: UserBubbleStyle) {
  if (style === "outline")
    return {
      background: "transparent",
      border: `1.5px solid ${color}cc`,
      color: "var(--t-text2)" as const,
    };
  return {
    background: color + "28",
    border: `1.5px solid ${color}30`,
    color: "var(--t-text2)" as const,
  };
}

function remiBubbleStyles(color: string, style: UserBubbleStyle) {
  if (style === "outline")
    return {
      background: "var(--t-bg-deep)",
      border: `1px solid ${color}55`,
      color: "var(--t-text2)" as const,
    };
  return {
    background: color + "18",
    border: `1px solid ${color}35`,
    color: "var(--t-text2)" as const,
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
        style={{ background: "var(--t-card)", border: `1px solid ${accentColor}22` }}
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

export default function MainChat() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(
    STORAGE_KEYS.CHAT_MESSAGES,
    SEED_MESSAGES,
  );
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
  const wsRef = useRef<WebSocket | null>(null);
  const wsPlaybackTimeRef = useRef<number>(0);

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
  const [openPicker, setOpenPicker] = useState<"user" | "remi" | null>(null);
  const [systemOnline] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef(new Date());

  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  // WebSocket lifecycle — open on voice ON, close on voice OFF
  useEffect(() => {
    if (!voiceEnabled) {
      wsRef.current?.close(1000, "voice disabled");
      wsRef.current = null;
      return;
    }
    const ws = new WebSocket(`${JARVIS_WS_URL}/ws/tts?key=${REMI_API_KEY}`);
    ws.binaryType = "arraybuffer";
    ws.onopen  = () => { wsRef.current = ws; console.log("[ws/tts] connected"); };
    ws.onclose = (e) => { if (wsRef.current === ws) wsRef.current = null; console.log("[ws/tts] closed", e.code, e.reason); };
    ws.onerror = (e) => console.warn("[ws/tts] error", e);
    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength === 0) return;
      const actx = audioContextRef.current;
      if (!actx) return;
      // Backend sends a complete WAV file — decode directly
      actx.decodeAudioData(event.data.slice(0)).then((audioBuffer) => {
        if (audioRef.current) { try { audioRef.current.stop(); } catch { /* stopped */ } }
        const source = actx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(actx.destination);
        audioRef.current = source;
        source.onended = () => { setIsSpeaking(false); audioRef.current = null; };
        source.start();
      }).catch((e) => {
        console.warn("[ws/tts] decodeAudioData failed", e);
        setIsSpeaking(false);
      });
    };
    wsRef.current = ws;
    return () => { ws.close(1000, "cleanup"); };
  }, [voiceEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // On mount: pull shared history from server; fall back to localStorage silently
  useEffect(() => {
    fetch(`${JARVIS_URL}/remi/history`, {
      headers: { Authorization: `Bearer ${REMI_API_KEY}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.messages?.length) setMessages(data.messages as ChatMessage[]);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const handleUseSuggestion = useCallback((trigger: string) => {
    setInputText(trigger);
    setSuggestion(null);
    setDismissedTrigger(null);
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    if (!voiceEnabledRef.current || !text.trim()) return;
    if (audioRef.current) { try { audioRef.current.stop(); } catch { /* already stopped */ } audioRef.current = null; }
    // Create lazily — by the time speakResponse runs, the user clicked Send (a real gesture),
    // so resume() succeeds even across the async chain.
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const actx = audioContextRef.current;
    try {
      if (actx.state === "suspended") await actx.resume();
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("[speakResponse] WebSocket not open — state:", ws?.readyState ?? "no ws");
        return;
      }
      setIsSpeaking(true);
      wsPlaybackTimeRef.current = actx.currentTime;
      console.log("[speakResponse] sending", text.length, "chars");
      ws.send(text);
    } catch (e) {
      console.warn("[speakResponse]", (e as Error).message);
      setIsSpeaking(false);
    }
  }, []);

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
      fetch(`${JARVIS_URL}/remi`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REMI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: text.trim(), user_id: "remi" }),
      })
        .then((r) => r.json())
        .then((data) => {
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
            },
          ]);
          speakResponse(_aiText);
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
    [setMessages, recordRecentCommand, navigate, speakResponse],
  );

  // ─── Mic: 150ms hold-to-record ───────────────────────────────────────────
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
            if (blob.size === 0) return;
            transcribeAudio(blob)
              .then((transcript) => {
                if (transcript) {
                  const _vm = transcript.match(/\b(mix(?:ed)?\s*notes?|mixnode)\s*session[\s,;.:]*(.+)/i);
                  if (_vm) {
                    const _rest = _vm[2].trim().replace(/^for[\s,;.]+/i, "").replace(/[.!?]+$/, "").trim();
                    const { artist: _a, song: _s } = _resolveMixArtist(_rest);
                    sessionStorage.setItem("mix_notes_prefill", JSON.stringify({ artist: _a, song: _s }));
                    navigate("/mix-notes");
                    return;
                  }
                  sendMessage(transcript, true);
                } else setRecordingError("Nothing captured — try again.");
              })
              .catch(() => setRecordingError("Transcription failed — check connection."));
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
  // ─────────────────────────────────────────────────────────────────────────

  const togglePicker = (side: "user" | "remi") =>
    setOpenPicker((p) => (p === side ? null : side));
  const restartLabel = mountTimeRef.current.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div style={{ width: "100%", height: "100dvh", overflow: "hidden", position: "relative", background: "var(--t-bg-deep)" }}>
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
    <div
      className="flex flex-col h-full w-full select-none"
      style={{ background: "var(--t-bg-deep)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 border-b border-white/5 shrink-0"
        style={{
          background: "var(--t-surface)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <div className="flex items-center -ml-1">
        <div className="relative">
          <button
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
            onClick={() => {
              setMenuOpen(true);
              setOpenPicker(null);
            }}
            data-testid="button-hamburger-menu"
          >
            <Menu size={20} />
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
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
            onClick={cycleFontSize}
            data-testid="button-font-size"
            title="Font size"
          >
            <span style={{
              fontSize: fontSizeStep === 0 ? "13px" : fontSizeStep === 1 ? "17px" : "21px",
              fontWeight: 700,
              lineHeight: 1,
              display: "block",
              color: "inherit",
            }}>A</span>
          </button>
        </div>
        <span
          className="text-lg font-bold tracking-tighter"
          style={{ fontFamily: "'Space Mono', monospace", color: remiColor }}
          data-testid="logo-remi"
        >
          Remi
        </span>
        <div className="flex items-center gap-3" ref={pickerRef}>
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
          <div className="relative flex flex-col items-center">
            <button
              className="w-5 h-5 flex items-center justify-center rounded-full transition-all active:scale-90"
              onClick={() => setStatusOpen((p) => !p)}
              data-testid="button-status-dot"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: systemOnline ? "#22c55e" : "#ef4444",
                  boxShadow: systemOnline
                    ? "0 0 6px rgba(34,197,94,0.8)"
                    : "0 0 6px rgba(239,68,68,0.8)",
                }}
                data-testid="status-system-dot"
              />
            </button>
            {statusOpen && (
              <div
                className="absolute top-7 right-0 z-30 overlay-fade-in"
                style={{ minWidth: 140 }}
              >
                <div
                  className="rounded-xl border border-white/10 px-3 py-2"
                  style={{
                    background: "var(--t-surface)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                  }}
                >
                  <p
                    className="text-xs font-medium"
                    style={{ color: "#22c55e" }}
                  >
                    ● Online
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    Last restart {restartLabel}
                  </p>
                </div>
              </div>
            )}
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
        className="flex-1 overflow-y-auto p-4"
        data-testid="chat-history"
        style={{ fontSize: FONT_SIZES[fontSizeStep] }}
        onClick={() => {
          setOpenPicker(null);
          setStatusOpen(false);
        }}
      >
        <div className="space-y-3">
        {messages.map((msg) => (
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
                  <div className="prose-dark leading-relaxed whitespace-pre-wrap" style={{ fontSize: "inherit" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {formatAiText(msg.text)}
                    </ReactMarkdown>
                  </div>
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
                              padding: "5px 10px",
                              borderRadius: "7px",
                              background: "var(--t-el-low)",
                              border: "1px solid var(--t-border-md)",
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
                </>
              ) : (
                <p>{msg.text}</p>
              )}
              <p className="text-xs mt-1 opacity-30 text-right">
                {msg.timestamp}
              </p>
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
        {/* Recording / transcribing indicator */}
        {(isRecording || isTranscribing) && !isLocked && (
          <div className="flex items-center justify-center gap-2 mb-2 h-5">
            {isTranscribing
              ? <><Loader2 size={13} className="animate-spin" style={{ color: userColor }} /><span className="text-xs" style={{ color: userColor }}>Transcribing...</span></>
              : <span className="text-xs" style={{ color: "#ef4444" }}>Recording…</span>}
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
                      background: color + "14",
                      border: `1px solid ${color}30`,
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

        {/* Input row: [text input] [Send] [amber mic] */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputText);
          }}
          className="w-full flex gap-2 items-center"
        >
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder='Try "Mix note for [song] — [note]"'
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 md:py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            data-testid="input-text-command"
          />

          <button
            type="submit"
            className="shrink-0 px-4 py-2.5 md:py-3 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={{ background: userColor, color: "#111111" }}
            data-testid="button-send"
          >
            Send
          </button>

          {/* Amber hold-to-send mic: hold 150ms → record, release → transcribe + send */}
          <button
            type="button"
            className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all duration-150"
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
            data-testid="button-voice"
          >
            {isTranscribing
              ? <Loader2 size={16} className="animate-spin" style={{ color: "#f59e0b" }} />
              : isRecording
              ? <MicOff size={16} style={{ color: "#ef4444" }} />
              : <Mic size={16} style={{ color: "#f59e0b" }} />}
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
        onClearSession={() => {
          fetch(`${JARVIS_URL}/remi/reset`, {
            method: "POST",
            headers: { Authorization: `Bearer ${REMI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: "remi" }),
          }).catch(() => {});
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
