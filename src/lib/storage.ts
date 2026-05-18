export const STORAGE_KEYS = {
  BRAIN_DUMP_ITEMS: "remi:brain-dump-items",
  MIX_NOTES: "remi:mix-notes",
  CHAT_MESSAGES: "remi:chat-messages",
  ACCENT_COLOR: "remi:accent-color",
  USER_COLOR: "remi:user-color",
  REMI_COLOR: "remi:remi-color",
  USER_BUBBLE_STYLE: "remi:user-bubble-style",
  TIMER_URL: "remi:timer-url",
  RECENT_COMMANDS: "remi:recent-commands",
  SESSION_LOG: "remi:session-log",
  ONE_THING: "remi:one-thing",
  PWA_NUDGE_DISMISSED: "remi:pwa-nudge-dismissed",
} as const;

export interface SessionLog {
  id: string;
  date: string;
  completedItems: string[];
  mixNoteCount: number;
  timestamp: string;
}

export type UserBubbleStyle = "filled" | "outline";

export type BucketType = "today" | "tomorrow" | "someday";

export interface BrainItem {
  id: string;
  text: string;
  bucket: BucketType;
  timestamp: string;
  date: string;
}

export interface MixNote {
  id: string;
  song: string;
  note: string;
  timestamp: string;
  date: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: string;
  isVoice?: boolean;
  pages?: Array<{ title: string; url: string | null }>;
  card?: {
    type: "task_done";
    task_name: string;
    notion_url: string;
    show_undo: boolean;
  };
}

/** Parse "mix note for [song] — [note body]" from a user message. Returns null if not a mix-note command. */
export function parseMixNoteCommand(text: string): { song: string; note: string } | null {
  const lower = text.trim().toLowerCase();
  if (!lower.startsWith("mix note for ")) return null;
  const body = text.trim().slice("mix note for ".length);
  const separators = [" — ", " - ", " – ", ": ", " | "];
  for (const sep of separators) {
    const idx = body.indexOf(sep);
    if (idx > 0) {
      return {
        song: body.slice(0, idx).trim(),
        note: body.slice(idx + sep.length).trim(),
      };
    }
  }
  // No separator — whole thing is the song name, note is empty
  return { song: body.trim(), note: "" };
}

/**
 * Parse "Today: [task]", "Tomorrow: [task]", or "Someday: [task]" from a user message.
 * Returns null if the message doesn't match the pattern.
 */
export function parseQuickAddCommand(text: string): { bucket: BucketType; task: string } | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const buckets: Array<[string, BucketType]> = [
    ["today:", "today"],
    ["tomorrow:", "tomorrow"],
    ["someday:", "someday"],
  ];
  for (const [prefix, bucket] of buckets) {
    if (lower.startsWith(prefix)) {
      const task = trimmed.slice(prefix.length).trim();
      if (task.length === 0) return null;
      return { bucket, task };
    }
  }
  return null;
}

export function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
