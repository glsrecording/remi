export interface Command {
  id: string;
  trigger: string;
  description: string;
  category: string;
}

// Trigger phrases are real, sendable examples (drawn from JARVIS_COMMANDS.md).
// [bracketed] parts are placeholders you fill in. This list is also what MainChat
// fuzzy-matches against for "Did you mean…" suggestions, so keep triggers natural.
export const COMMANDS: Command[] = [
  // ── Tasks ───────────────────────────────────────────────────────────────────
  { id: "1",  trigger: "Export stems for [song]", description: "Captures a task to your Master Tasks list", category: "Tasks" },
  { id: "2",  trigger: "Tonight: [task], [task], [task]", description: "Captures several tasks at once for today", category: "Tasks" },
  { id: "3",  trigger: "Follow up with [name] about [topic]", description: "Logs a follow-up as a communication task", category: "Tasks" },
  { id: "4",  trigger: "Take dad to get labs in July", description: "A task with a future month — scheduled to the 1st, left in Inbox", category: "Tasks" },
  { id: "5",  trigger: "What's on my list today?", description: "Shows today's tasks", category: "Tasks" },
  { id: "6",  trigger: "What's overdue?", description: "Shows everything past due", category: "Tasks" },
  { id: "7",  trigger: "What should I focus on?", description: "Full triage — tasks, studio work, and what matters most", category: "Tasks" },

  // ── Reminders ────────────────────────────────────────────────────────────────
  { id: "8",  trigger: "Remind me to call [name] tomorrow at 3pm", description: "Sets a timed reminder (and a matching task)", category: "Reminders" },
  { id: "9",  trigger: "Remind me to do my review every week", description: "Sets a recurring reminder", category: "Reminders" },
  { id: "10", trigger: "What are my reminders?", description: "Lists your active reminders", category: "Reminders" },
  { id: "11", trigger: "Cancel reminder for [name]", description: "Removes a reminder", category: "Reminders" },

  // ── Studio ───────────────────────────────────────────────────────────────────
  { id: "12", trigger: "Mix note session for [song]", description: "Starts a hands-free mix-note session — then just talk, no trigger needed", category: "Studio" },
  { id: "13", trigger: "Switch to [song]", description: "Points the active mix-note session at a different song", category: "Studio" },
  { id: "14", trigger: "Add a note to [song]: [note]", description: "Saves a session note on a Studio Work song for next time", category: "Studio" },
  { id: "15", trigger: "New song for [artist]: [title]", description: "Creates a new Studio Work song (starts Active / P3)", category: "Studio" },
  { id: "16", trigger: "[song] is done", description: "Updates a song's status to complete", category: "Studio" },
  { id: "17", trigger: "Where are we on [song]?", description: "Full status picture for a song", category: "Studio" },
  { id: "18", trigger: "What's next for [artist]?", description: "Next actions for that artist", category: "Studio" },
  { id: "19", trigger: "What songs need mixing?", description: "Finds songs waiting on a specific stage", category: "Studio" },
  { id: "20", trigger: "What are my studio next actions?", description: "Everything on your plate across all songs", category: "Studio" },

  // ── Clients ──────────────────────────────────────────────────────────────────
  { id: "21", trigger: "Log win with [client] — [what happened]", description: "Adds an entry to that client's log", category: "Clients" },
  { id: "22", trigger: "Just got off the phone with [client]", description: "Logs a call with details and next steps", category: "Clients" },
  { id: "23", trigger: "What have I logged with [client]?", description: "Shows that client's log history", category: "Clients" },
  { id: "24", trigger: "Where do we stand with [client]?", description: "Full synthesis of everything on a client", category: "Clients" },
  { id: "25", trigger: "Who do I need to follow up with?", description: "Lists clients needing a follow-up", category: "Clients" },

  // ── Errands ──────────────────────────────────────────────────────────────────
  { id: "26", trigger: "Pick up [item]", description: "Adds an errand", category: "Errands" },
  { id: "27", trigger: "Add [item] to the Walmart list", description: "Adds an errand tagged to a store", category: "Errands" },
  { id: "28", trigger: "Grabbed everything from Winco", description: "Marks errands done", category: "Errands" },
  { id: "29", trigger: "What errands do I have?", description: "Shows your errand list", category: "Errands" },

  // ── Scorecard ────────────────────────────────────────────────────────────────
  { id: "30", trigger: "Weights done", description: "Logs an activity to your scorecard", category: "Scorecard" },
  { id: "31", trigger: "Jogged 3 miles", description: "Logs running by distance → points", category: "Scorecard" },
  { id: "32", trigger: "Did 8 pull-ups", description: "Logs reps → points", category: "Scorecard" },
  { id: "33", trigger: "How am I doing on my scorecard?", description: "Shows your points and activity", category: "Scorecard" },

  // ── Memory ───────────────────────────────────────────────────────────────────
  { id: "34", trigger: "Remember that [insight]", description: "Saves a memory to your Memory Bank to review later", category: "Memory" },
  { id: "35", trigger: "Make a note of this: [thing]", description: "Saves a personal note to your Memory Bank", category: "Memory" },
  { id: "36", trigger: "Key insight: [insight]", description: "Saves a key insight to review", category: "Memory" },
  { id: "37", trigger: "What have I remembered?", description: "Searches your Memory Bank", category: "Memory" },
  { id: "38", trigger: "Search my memory bank for [topic]", description: "Finds saved memories on a topic", category: "Memory" },

  // ── Gratitude ────────────────────────────────────────────────────────────────
  { id: "39", trigger: "Grateful for [something]", description: "Saves a gratitude note", category: "Gratitude" },
  { id: "40", trigger: "What am I grateful for?", description: "Shows your gratitude notes", category: "Gratitude" },
  { id: "41", trigger: "I'm struggling, remind me", description: "Surfaces something you've been grateful for", category: "Gratitude" },

  // ── Media ────────────────────────────────────────────────────────────────────
  { id: "42", trigger: "[paste a YouTube link]", description: "Saves the video to Watch Later (asks what drew you to it)", category: "Media" },
  { id: "43", trigger: "Add [artist] to my listen list", description: "Saves music or an artist to come back to", category: "Media" },
  { id: "44", trigger: "What did I save about [topic]?", description: "Searches your saved videos", category: "Media" },
  { id: "45", trigger: "What's on my watch later?", description: "Lists everything you've saved", category: "Media" },

  // ── Thinking ─────────────────────────────────────────────────────────────────
  { id: "46", trigger: "Brain dump: [everything on your mind]", description: "Sends to Claude for a structured response — nothing is saved", category: "Thinking" },
  { id: "47", trigger: "Someday I want to [idea]", description: "Adds an idea to your Someday / Maybe list", category: "Thinking" },
  { id: "48", trigger: "Show me my someday list", description: "Shows the ideas you've parked", category: "Thinking" },

  // ── Info ─────────────────────────────────────────────────────────────────────
  { id: "49", trigger: "What's my Stripe link?", description: "Returns a saved personal link (Stripe, Calendly, Google Review…)", category: "Info" },
  { id: "50", trigger: "What's my Calendly link?", description: "Returns your booking link", category: "Info" },
  { id: "51", trigger: "What's my EIN?", description: "Returns saved business info (EIN, UBI…)", category: "Info" },
  { id: "52", trigger: "What bills are due?", description: "Shows upcoming bills", category: "Info" },

  // ── Control ──────────────────────────────────────────────────────────────────
  { id: "53", trigger: "Scratch that", description: "Undoes your last capture", category: "Control" },
  { id: "54", trigger: "That should be a song note", description: "Reroutes the last capture to the right place", category: "Control" },
  { id: "55", trigger: "Mark that done", description: "Marks the last item complete", category: "Control" },
];

export const CATEGORY_COLORS: Record<string, string> = {
  Tasks:     "#f59e0b",
  Reminders: "#a855f7",
  Studio:    "#14b8a6",
  Clients:   "#f43f5e",
  Errands:   "#22c55e",
  Scorecard: "#f97316",
  Memory:    "#8b5cf6",
  Gratitude: "#eab308",
  Media:     "#3b82f6",
  Thinking:  "#ec4899",
  Info:      "#38bdf8",
  Control:   "#94a3b8",
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
