export interface Command {
  id: string;
  trigger: string;
  description: string;
  category: string;
}

export const COMMANDS: Command[] = [
  { id: "1", trigger: "Mix note for [song]", description: "Logs a note to the Mix Notes Buffer for a specific track", category: "Studio" },
  { id: "2", trigger: "What's next for [artist]", description: "Returns the next action item for that project or artist", category: "Projects" },
  { id: "3", trigger: "Log a session with [client]", description: "Starts time tracking and opens a session log for the client", category: "Time" },
  { id: "4", trigger: "Remind me to [task] at [time]", description: "Sets a reminder that fires at the specified time", category: "Reminders" },
  { id: "5", trigger: "Brain dump", description: "Opens the Brain Dump screen to capture tasks into Today / Tomorrow / Someday", category: "Capture" },
  { id: "6", trigger: "What's my scorecard?", description: "Returns your daily points and task completion summary", category: "Scorecard" },
  { id: "7", trigger: "Call log. Just got off the phone with [client]", description: "Logs a CRM entry with call details and next steps", category: "CRM" },
  { id: "8", trigger: "What's coming up?", description: "Returns the next 3 days of bills, sessions, and scheduled tasks", category: "Planning" },
  { id: "9", trigger: "Wrap up", description: "Ends the current session, logs time, and triggers the wrap-up summary", category: "Time" },
  { id: "10", trigger: "Note to self", description: "Captures a personal note or memo immediately to your vault", category: "Capture" },
];

export const CATEGORY_COLORS: Record<string, string> = {
  Studio: "#f59e0b",
  Projects: "#3b82f6",
  Time: "#14b8a6",
  Reminders: "#a855f7",
  Capture: "#22c55e",
  Scorecard: "#f97316",
  CRM: "#f43f5e",
  Planning: "#bae6fd",
};

// --- Fuzzy matching ---

/** Normalise a string for comparison */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[.*?\]/g, "") // strip [placeholders]
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice-coefficient bigram similarity, 0–1 */
function diceSim(a: string, b: string): number {
  if (!a || !b) return 0;
  const bigrams = (str: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < str.length - 1; i++) out.push(str.slice(i, i + 2));
    return out;
  };
  const ab = bigrams(a);
  const bb = bigrams(b);
  if (ab.length === 0 && bb.length === 0) return 1;
  if (ab.length === 0 || bb.length === 0) return 0;
  const bSet = new Set(bb);
  const matches = ab.filter((bg) => bSet.has(bg)).length;
  return (2 * matches) / (ab.length + bb.length);
}

/** Word-overlap Jaccard similarity, 0–1 */
function wordSim(a: string, b: string): number {
  const STOPWORDS = new Set(["a", "an", "the", "to", "is", "my", "me", "for", "at", "in", "on", "of"]);
  const words = (s: string) => new Set(s.split(" ").filter((w) => w.length > 1 && !STOPWORDS.has(w)));
  const aw = words(a);
  const bw = words(b);
  if (aw.size === 0 || bw.size === 0) return 0;
  let inter = 0;
  for (const w of aw) {
    if (bw.has(w)) { inter++; continue; }
    // partial: one contains the other
    for (const bww of bw) if (bww.includes(w) || w.includes(bww)) { inter += 0.5; break; }
  }
  return inter / (aw.size + bw.size - inter);
}

/** Combined score for a query vs a command trigger */
function score(query: string, trigger: string): number {
  const q = norm(query);
  const t = norm(trigger);
  return diceSim(q, t) * 0.45 + wordSim(q, t) * 0.55;
}

export interface MatchResult {
  command: Command;
  score: number;
}

/**
 * Returns the best-matching command for the given input, or null if
 * no match clears the threshold.
 */
export function findBestMatch(input: string, threshold = 0.18): MatchResult | null {
  if (input.trim().length < 3) return null;
  let best: MatchResult | null = null;
  for (const cmd of COMMANDS) {
    const s = score(input, cmd.trigger);
    if (!best || s > best.score) best = { command: cmd, score: s };
  }
  if (!best || best.score < threshold) return null;
  return best;
}
