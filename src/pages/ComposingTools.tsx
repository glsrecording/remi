import { useState, useEffect, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";

/* ──────────────────────────────────────────────────────────────────────────
   Composing Tools — Session 1 of 3
   Pure-frontend music utilities. No fetch, no Notion, no bot interaction.
   Accent uses the app-wide selectable color (remiColor) — the codebase has no
   --t-accent token; remiColor (amber #f59e0b default) is the real accent.
   ────────────────────────────────────────────────────────────────────────── */

const MONO = "'Space Mono', monospace";

// Canonical chromatic names (sharps only) — used for all internal math + output.
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_INDEX: Record<string, number> = NOTE_NAMES.reduce(
  (acc, n, i) => { acc[n] = i; return acc; },
  {} as Record<string, number>,
);

type TabId = "key-finder" | "chord-explorer" | "chord-draw" | "progressions" | "scales" | "delay";

const TABS: { id: TabId; label: string }[] = [
  { id: "key-finder",     label: "Key Finder" },
  { id: "chord-explorer", label: "Chord Explorer" },
  { id: "chord-draw",     label: "Chord Draw" },
  { id: "progressions",   label: "Progressions" },
  { id: "scales",         label: "Scales & Modes" },
  { id: "delay",          label: "Delay Calc" },
];

// ── KEY FINDER DATA ─────────────────────────────────────────────────────────
// 12 note buttons — display label (with enharmonics) → canonical sharp name.
const NOTE_BUTTONS: { label: string; value: string }[] = [
  { label: "C",     value: "C"  },
  { label: "C#/Db", value: "C#" },
  { label: "D",     value: "D"  },
  { label: "D#/Eb", value: "D#" },
  { label: "E",     value: "E"  },
  { label: "F",     value: "F"  },
  { label: "F#/Gb", value: "F#" },
  { label: "G",     value: "G"  },
  { label: "G#/Ab", value: "G#" },
  { label: "A",     value: "A"  },
  { label: "A#/Bb", value: "A#" },
  { label: "B",     value: "B"  },
];

// All 24 keys, scales spelled in canonical sharps (verbatim from spec).
const KEYS: { name: string; notes: string[] }[] = [
  // Major
  { name: "C Major",  notes: ["C", "D", "E", "F", "G", "A", "B"] },
  { name: "G Major",  notes: ["G", "A", "B", "C", "D", "E", "F#"] },
  { name: "D Major",  notes: ["D", "E", "F#", "G", "A", "B", "C#"] },
  { name: "A Major",  notes: ["A", "B", "C#", "D", "E", "F#", "G#"] },
  { name: "E Major",  notes: ["E", "F#", "G#", "A", "B", "C#", "D#"] },
  { name: "B Major",  notes: ["B", "C#", "D#", "E", "F#", "G#", "A#"] },
  { name: "F# Major", notes: ["F#", "G#", "A#", "B", "C#", "D#", "F"] },
  { name: "Db Major", notes: ["C#", "D#", "F", "F#", "G#", "A#", "C"] },
  { name: "Ab Major", notes: ["G#", "A#", "C", "C#", "D#", "F", "G"] },
  { name: "Eb Major", notes: ["D#", "F", "G", "G#", "A#", "C", "D"] },
  { name: "Bb Major", notes: ["A#", "C", "D", "D#", "F", "G", "A"] },
  { name: "F Major",  notes: ["F", "G", "A", "A#", "C", "D", "E"] },
  // Minor (natural)
  { name: "A Minor",  notes: ["A", "B", "C", "D", "E", "F", "G"] },
  { name: "E Minor",  notes: ["E", "F#", "G", "A", "B", "C", "D"] },
  { name: "B Minor",  notes: ["B", "C#", "D", "E", "F#", "G", "A"] },
  { name: "F# Minor", notes: ["F#", "G#", "A", "B", "C#", "D", "E"] },
  { name: "C# Minor", notes: ["C#", "D#", "E", "F#", "G#", "A", "B"] },
  { name: "G# Minor", notes: ["G#", "A#", "B", "C#", "D#", "E", "F#"] },
  { name: "D# Minor", notes: ["D#", "F", "F#", "G#", "A#", "B", "C#"] },
  { name: "Bb Minor", notes: ["A#", "C", "C#", "D#", "F", "F#", "G#"] },
  { name: "F Minor",  notes: ["F", "G", "G#", "A#", "C", "C#", "D#"] },
  { name: "C Minor",  notes: ["C", "D", "D#", "F", "G", "G#", "A#"] },
  { name: "G Minor",  notes: ["G", "A", "A#", "C", "D", "D#", "F"] },
  { name: "D Minor",  notes: ["D", "E", "F", "G", "A", "A#", "C"] },
];

// ── PROGRESSIONS DATA ───────────────────────────────────────────────────────
interface Progression { numerals: string; chords: string[]; desc: string; }
const PROGRESSION_SECTIONS: { name: string; items: Progression[] }[] = [
  {
    name: "Uplifting / Anthemic",
    items: [
      { numerals: "I–V–vi–IV", chords: ["I", "V", "vi", "IV"],
        desc: "The most common pop progression. Hopeful and forward-moving. Used in thousands of hits across every genre." },
      { numerals: "I–IV–V–I", chords: ["I", "IV", "V", "I"],
        desc: "Classic resolution. Satisfying and complete. The foundation of rock, blues, and country." },
      { numerals: "I–IV–I–V", chords: ["I", "IV", "I", "V"],
        desc: "Driving and urgent. Simple but powerful. Classic rock staple." },
      { numerals: "I–V–IV–I", chords: ["I", "V", "IV", "I"],
        desc: "Open and spacious. Slightly less resolved than I–IV–V. Classic blues." },
    ],
  },
  {
    name: "Dark / Emotional",
    items: [
      { numerals: "vi–IV–I–V", chords: ["vi", "IV", "I", "V"],
        desc: "Starts in the minor feel, lifts to resolution. Bittersweet and emotional. Huge in pop and alt-rock." },
      { numerals: "i–VII–VI–VII", chords: ["i", "VII", "VI", "VII"],
        desc: "Minor key momentum. Builds tension without fully resolving. Cinematic and driving." },
      { numerals: "i–iv–VII–III", chords: ["i", "iv", "VII", "III"],
        desc: "Deep minor. Heavy and serious. Common in metal and dark pop." },
      { numerals: "i–VI–III–VII", chords: ["i", "VI", "III", "VII"],
        desc: "The minor loop — think Linkin Park, Evanescence. Tense and driving. Doesn't fully resolve, keeps pushing forward." },
    ],
  },
  {
    name: "Tense / Unresolved",
    items: [
      { numerals: "I–V–ii–IV", chords: ["I", "V", "ii", "IV"],
        desc: "Slightly unresolved. Creates forward pull without landing. Good for verses that need to keep moving." },
      { numerals: "ii–V–I", chords: ["ii", "V", "I"],
        desc: "The jazz resolution. The most common movement in jazz — strong gravitational pull back to home." },
      { numerals: "I–iii–IV–V", chords: ["I", "iii", "IV", "V"],
        desc: "Ascending tension. Builds anticipation. Ideal for a pre-chorus that needs to push into the chorus." },
      { numerals: "I–ii–IV–I", chords: ["I", "ii", "IV", "I"],
        desc: "Subtle and questioning. Gentle tension, gentle release." },
    ],
  },
  {
    name: "Nostalgic / Melancholy",
    items: [
      { numerals: "I–V–vi–iii–IV", chords: ["I", "V", "vi", "iii", "IV"],
        desc: "The Canon progression. Lush, descending, timeless. Feels instantly nostalgic regardless of tempo." },
      { numerals: "vi–ii–V–I", chords: ["vi", "ii", "V", "I"],
        desc: "Reflective and inward. Descending feel. Ballads and slow songs." },
      { numerals: "I–vi–IV–V", chords: ["I", "vi", "IV", "V"],
        desc: "The 50s progression. Warm, circular, and familiar. Nostalgic without being heavy." },
      { numerals: "vi–IV–V–I", chords: ["vi", "IV", "V", "I"],
        desc: "Similar warmth to the 50s progression but with a different starting emotional center — begins introspective, ends resolved." },
    ],
  },
  {
    name: "Cinematic / Epic",
    items: [
      { numerals: "I–VI–III–VII", chords: ["I", "VI", "III", "VII"],
        desc: "Grand and sweeping. Film score energy. Feels like something big is about to happen." },
      { numerals: "i–III–VII–IV", chords: ["i", "III", "VII", "IV"],
        desc: "Minor epic. Builds scale and drama. Good for something that needs weight." },
      { numerals: "I–V–vi–IV–I–V–IV–V", chords: ["I", "V", "vi", "IV", "I", "V", "IV", "V"],
        desc: "Extended anthem loop. Big room energy. Built for repetition — each pass feels larger." },
    ],
  },
];

const ROMAN_TO_DEGREE: Record<string, number> = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };

// Roman numeral → chord name in a given root + mode.
function romanToChords(root: string, mode: "major" | "minor", numerals: string[]): string[] {
  const intervals = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const rootIdx = NOTE_INDEX[root] ?? 0;
  return numerals.map((num) => {
    const dim = num.includes("°");
    const core = num.replace(/°/g, "");
    const degree = ROMAN_TO_DEGREE[core.toLowerCase()] ?? 0;
    const noteIdx = (rootIdx + intervals[degree]) % 12;
    const note = NOTE_NAMES[noteIdx];
    if (dim) return note + "°";
    // Uppercase = major (no suffix); lowercase = minor (m suffix).
    return core === core.toUpperCase() ? note : note + "m";
  });
}

// ── SCALES & MODES DATA ─────────────────────────────────────────────────────
// Intervals in semitone steps. W = 2, H = 1, WH (minor third) = 3.
interface ScaleDef { name: string; intervals: number[]; formula: string; feel: string; examples: string; }
const SCALE_GROUPS: { group: string; scales: ScaleDef[] }[] = [
  {
    group: "Essential",
    scales: [
      { name: "Major (Ionian)", intervals: [2, 2, 1, 2, 2, 2, 1], formula: "W W H W W W H",
        feel: "Bright, happy, resolved. The default 'neutral' sound in Western music. Sounds complete and stable.",
        examples: "Most pop, country, and classic rock. 'Let It Be,' 'Sweet Home Alabama.'" },
      { name: "Natural Minor (Aeolian)", intervals: [2, 1, 2, 2, 1, 2, 2], formula: "W H W W H W W",
        feel: "Dark, emotional, introspective. The default minor sound. Melancholy without being aggressive.",
        examples: "'Stairway to Heaven' (verse), 'Creep,' most ballads in a minor key." },
      { name: "Pentatonic Major", intervals: [2, 2, 3, 2, 3], formula: "W W WH W WH",
        feel: "Open, friendly, country. Remove the two tension notes from major — what's left is universally pleasing and hard to play wrong.",
        examples: "Country leads, blues solos played 'happy,' classic rock riffs. 'My Girl,' 'Brown Eyed Girl.'" },
      { name: "Pentatonic Minor", intervals: [3, 2, 2, 3, 2], formula: "WH W W WH W",
        feel: "The rock and blues default. Aggressive, soulful, instantly familiar. The most-used scale in rock guitar.",
        examples: "Virtually every rock and blues solo ever. 'Smoke on the Water,' AC/DC, Hendrix, SRV." },
      { name: "Blues Scale", intervals: [3, 2, 1, 1, 3, 2], formula: "WH W H H WH W",
        feel: "Pentatonic minor with a 'blue note' added. That note creates the characteristic tension and grit. More expressive than pentatonic alone.",
        examples: "BB King, Stevie Ray Vaughan, Gary Moore. Any blues solo that has that extra sting." },
    ],
  },
  {
    group: "Modes",
    scales: [
      { name: "Dorian", intervals: [2, 1, 2, 2, 2, 1, 2], formula: "W H W W W H W",
        feel: "Minor but cooler. One note raised from natural minor gives it a sophisticated, slightly jazzy quality. Darker than major, more colorful than straight minor.",
        examples: "'Oye Como Va' (Santana), 'Scarborough Fair,' most funk bass lines, 'Smoke on the Water' main riff." },
      { name: "Mixolydian", intervals: [2, 2, 1, 2, 2, 1, 2], formula: "W W H W W H W",
        feel: "Major but with a blues edge. The flat 7th gives it an unresolved, open quality. Sounds like classic rock — bright but not quite settled.",
        examples: "Most classic rock and southern rock. 'Sweet Home Alabama,' 'Norwegian Wood,' Grateful Dead, most rock improvisation over dominant chords." },
      { name: "Lydian", intervals: [2, 2, 2, 1, 2, 2, 1], formula: "W W W H W W H",
        feel: "Major but dreamy and floating. The raised 4th creates a sense of suspension — like something magical is about to happen. Cinematic.",
        examples: "John Williams film scores, Joe Satriani 'Flying in a Blue Dream,' dream pop, ambient music. The 'wonder' sound." },
      { name: "Phrygian", intervals: [1, 2, 2, 2, 1, 2, 2], formula: "H W W W H W W",
        feel: "Dark, Spanish, flamenco. The flat 2nd gives it an exotic, tense quality. Instantly evocative.",
        examples: "Flamenco guitar, Metallica heavy sections ('Wherever I May Roam'), Spanish and Middle Eastern-influenced music." },
      { name: "Locrian", intervals: [1, 2, 2, 1, 2, 2, 2], formula: "H W W H W W W",
        feel: "The unstable one. Diminished and tense — the root chord itself doesn't feel resolved. Rarely used as a home key but interesting over specific chords for a tense, angular sound.",
        examples: "Metal and progressive rock. Björk. Used more as a color over chords than as a full key center." },
      { name: "Phrygian Dominant", intervals: [1, 3, 1, 2, 1, 2, 2], formula: "H WH H W H W W",
        feel: "Phrygian's more dramatic cousin — add a major third and you get the Spanish/Flamenco/Middle Eastern sound at maximum intensity. Mysterious and powerful.",
        examples: "Flamenco, Arabic music, Carlos Santana, Dio. The 'epic villain' sound in film scores." },
    ],
  },
  {
    group: "Less Common but Useful",
    scales: [
      { name: "Harmonic Minor", intervals: [2, 1, 2, 2, 1, 3, 1], formula: "W H W W H WH H",
        feel: "Natural minor with a raised 7th. Creates a stronger pull back to the root. That augmented second between scale degrees 6 and 7 is the 'classical minor' sound — slightly dramatic.",
        examples: "Classical music, neo-classical metal (Yngwie Malmsteen), Middle Eastern music. 'Smooth Criminal' (chorus)." },
      { name: "Melodic Minor", intervals: [2, 1, 2, 2, 2, 2, 1], formula: "W H W W W W H",
        feel: "Minor going up, natural minor going down (classical). Going up it sounds smooth and jazzy. Used ascending over minor chords in jazz and film music for a sophisticated, bittersweet quality.",
        examples: "Jazz improvisation over minor chords, film scores. The 'sad but beautiful' sound." },
      { name: "Whole Tone", intervals: [2, 2, 2, 2, 2, 2], formula: "W W W W W W",
        feel: "Completely ambiguous and floating — no tension, no resolution. Dreamlike and slightly unsettling because nothing wants to move anywhere.",
        examples: "Debussy, impressionist classical, used in jazz over augmented chords. The 'mysterious shimmer' sound." },
    ],
  },
];

// Build scale notes from a root + semitone-step intervals. Uses sharps for output.
function getScaleNotes(root: string, intervals: number[]): string[] {
  const out = [root];
  let cur = NOTE_INDEX[root] ?? 0;
  for (let i = 0; i < intervals.length - 1; i++) {
    cur = (cur + intervals[i]) % 12;
    out.push(NOTE_NAMES[cur]);
  }
  return out;
}

// ── DELAY CALCULATOR DATA ───────────────────────────────────────────────────
const SUBDIVISIONS: { name: string; mult: number }[] = [
  { name: "Whole note",            mult: 4 },
  { name: "Dotted half note",      mult: 3 },
  { name: "Half note",             mult: 2 },
  { name: "Dotted quarter note",   mult: 1.5 },
  { name: "Quarter note",          mult: 1 },     // highlighted
  { name: "Dotted eighth note",    mult: 0.75 },
  { name: "Eighth note",           mult: 0.5 },
  { name: "Dotted sixteenth note", mult: 0.375 },
  { name: "Sixteenth note",        mult: 0.25 },
  { name: "Thirty-second note",    mult: 0.125 },
];

// ════════════════════════════════════════════════════════════════════════════
export default function ComposingTools() {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [menuOpen, setMenuOpen] = useState(false);
  // Always opens to Key Finder on fresh navigation — tab is NOT persisted.
  const [tab, setTab] = useState<TabId>("key-finder");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader title="Composing Tools" color={remiColor} onMenu={() => setMenuOpen(true)} />

      {/* Tab bar — horizontal scroll, no scrollbar */}
      <div
        className="flex items-stretch gap-1 px-3 overflow-x-auto no-scrollbar shrink-0"
        style={{ background: "var(--t-surface)", borderBottom: "1px solid var(--t-border)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors shrink-0"
              style={{
                fontFamily: MONO,
                color: active ? remiColor : "var(--t-text4)",
                borderBottom: `2px solid ${active ? remiColor : "transparent"}`,
              }}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}>
        {tab === "key-finder"     && <KeyFinder accent={remiColor} />}
        {tab === "chord-explorer" && <Placeholder icon="🎸" title="Chord Explorer"
          subtitle="Coming soon — pick a key and see every chord that lives in it, with guitar and piano diagrams." />}
        {tab === "chord-draw"     && <Placeholder icon="✏️" title="Chord Draw"
          subtitle="Coming soon — draw your finger positions on a fretboard to find out what chord you're playing, then explore variations." />}
        {tab === "progressions"   && <Progressions accent={remiColor} />}
        {tab === "scales"         && <ScalesModes accent={remiColor} />}
        {tab === "delay"          && <DelayCalc accent={remiColor} onCopy={(ms) => { copyText(ms); setToast("Copied!"); }} />}
      </div>

      {/* Toast — bottom center, above nav bar */}
      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-medium shadow-lg"
          style={{
            background: "var(--t-card)",
            border: "1px solid var(--t-border-md)",
            color: "var(--t-text2)",
            zIndex: 999,
          }}
          data-testid="composing-toast"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// Clipboard helper with a legacy fallback for non-secure contexts.
function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch { /* no-op */ }
}

// ── PLACEHOLDER TAB ──────────────────────────────────────────────────────────
function Placeholder({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center" style={{ minHeight: "60vh" }}>
      <div
        className="flex flex-col items-center gap-3 rounded-2xl px-8 py-10"
        style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", maxWidth: "420px" }}
      >
        <div style={{ fontSize: "44px", lineHeight: 1 }}>{icon}</div>
        <div className="text-lg font-bold" style={{ fontFamily: MONO, color: "var(--t-text)" }}>{title}</div>
        <div className="text-sm leading-relaxed" style={{ color: "var(--t-text4)" }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── TAB 1: KEY FINDER ─────────────────────────────────────────────────────────
function KeyFinder({ accent }: { accent: string }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (value: string) =>
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const { exact, near } = useMemo(() => {
    const total = selected.length;
    const exactArr: { name: string; match: number; total: number }[] = [];
    const nearArr: { name: string; match: number; total: number }[] = [];
    if (total === 0) return { exact: exactArr, near: nearArr };
    for (const key of KEYS) {
      const match = selected.filter((n) => key.notes.includes(n)).length;
      if (match === total) exactArr.push({ name: key.name, match: key.notes.length, total: key.notes.length });
      else if (match === total - 1) nearArr.push({ name: key.name, match, total });
    }
    // Exact: more notes in scale first (here all 7-note scales tie, kept stable by data order).
    exactArr.sort((a, b) => b.match - a.match);
    return { exact: exactArr, near: nearArr };
  }, [selected]);

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      <div className="text-sm font-bold" style={{ fontFamily: MONO, color: "var(--t-text2)" }}>
        Tap the notes you can identify
      </div>

      {/* 4×3 note grid */}
      <div className="grid grid-cols-4 gap-2">
        {NOTE_BUTTONS.map((n) => {
          const on = selected.includes(n.value);
          return (
            <button
              key={n.value}
              onClick={() => toggle(n.value)}
              className="rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center"
              style={{
                minHeight: "48px",
                fontFamily: MONO,
                background: on ? accent : "var(--t-card)",
                color: on ? "#111" : "var(--t-text3)",
                border: `1px solid ${on ? accent : "var(--t-border-md)"}`,
              }}
              data-testid={`note-${n.value}`}
            >
              {n.label}
            </button>
          );
        })}
      </div>

      {/* Possible keys */}
      <div className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-wider" style={{ color: "var(--t-text5)", fontFamily: MONO }}>
          Possible keys
        </div>

        {selected.length === 0 && (
          <div className="text-sm py-4" style={{ color: "var(--t-text5)" }}>
            Tap notes above to find matching keys
          </div>
        )}

        {exact.map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: "var(--t-card)", border: "1px solid var(--t-border)" }}
            data-testid={`key-result-${r.name.replace(/[^a-z0-9]/gi, "-")}`}
          >
            <span className="text-sm font-bold" style={{ color: "var(--t-text)", fontFamily: MONO }}>{r.name}</span>
            <span className="text-xs" style={{ color: accent, fontFamily: MONO }}>{r.match}/{r.total} notes match</span>
          </div>
        ))}

        {near.map((r) => (
          <div
            key={r.name}
            className="flex flex-col rounded-xl px-4 py-3"
            style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", opacity: 0.6 }}
            data-testid={`key-near-${r.name.replace(/[^a-z0-9]/gi, "-")}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: "var(--t-text)", fontFamily: MONO }}>{r.name}</span>
              <span className="text-xs" style={{ color: "var(--t-text3)", fontFamily: MONO }}>{r.match}/{r.total} notes match</span>
            </div>
            <span className="text-xs mt-0.5" style={{ color: "var(--t-text5)" }}>possible with 1 outside note</span>
          </div>
        ))}

        {selected.length > 0 && exact.length === 0 && near.length === 0 && (
          <div className="text-sm py-4" style={{ color: "var(--t-text5)" }}>
            No keys match those notes together.
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <button
          onClick={() => setSelected([])}
          className="self-start px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
          style={{ background: "var(--t-el-low)", color: "var(--t-text4)", border: "1px solid var(--t-border-md)" }}
          data-testid="key-finder-clear"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Shared root-note pill row ─────────────────────────────────────────────────
function RootPills({ root, onPick, accent }: { root: string; onPick: (r: string) => void; accent: string }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      {NOTE_NAMES.map((n) => {
        const on = root === n;
        return (
          <button
            key={n}
            onClick={() => onPick(n)}
            className="shrink-0 px-3 py-1.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{
              fontFamily: MONO,
              background: on ? accent : "var(--t-el-low)",
              color: on ? "#111" : "var(--t-text4)",
              border: `1px solid ${on ? accent : "var(--t-border-md)"}`,
            }}
            data-testid={`root-${n}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// ── TAB 4: PROGRESSIONS ────────────────────────────────────────────────────────
function Progressions({ accent }: { accent: string }) {
  const [root, setRoot] = useState("C");
  const [mode, setMode] = useState<"major" | "minor">("major");

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      {/* Key selector */}
      <div className="flex flex-col gap-3">
        <RootPills root={root} onPick={setRoot} accent={accent} />
        <div className="flex gap-1.5">
          {(["major", "minor"] as const).map((m) => {
            const on = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-4 py-1.5 rounded-xl text-sm font-bold capitalize transition-all active:scale-95"
                style={{
                  fontFamily: MONO,
                  background: on ? accent : "var(--t-el-low)",
                  color: on ? "#111" : "var(--t-text4)",
                  border: `1px solid ${on ? accent : "var(--t-border-md)"}`,
                }}
                data-testid={`mode-${m}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Progression sections */}
      {PROGRESSION_SECTIONS.map((section) => (
        <div key={section.name} className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--t-text5)", fontFamily: MONO }}>
            {section.name}
          </div>
          {section.items.map((prog) => {
            const chords = romanToChords(root, mode, prog.chords);
            return (
              <div
                key={prog.numerals}
                className="rounded-xl px-4 py-3 flex flex-col gap-1"
                style={{ background: "var(--t-card)", border: "1px solid var(--t-border)" }}
              >
                <div className="text-xs" style={{ color: "var(--t-text5)", fontFamily: MONO }}>{prog.numerals}</div>
                <div className="text-base font-bold" style={{ color: "var(--t-text)", fontFamily: MONO }}>
                  {chords.join(" – ")}
                </div>
                <div className="text-xs italic leading-relaxed" style={{ color: "var(--t-text2)" }}>{prog.desc}</div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── TAB 5: SCALES & MODES ────────────────────────────────────────────────────
function ScalesModes({ accent }: { accent: string }) {
  const [root, setRoot] = useState("C");
  const [scaleName, setScaleName] = useState("Major (Ionian)");

  const scale = useMemo(() => {
    for (const g of SCALE_GROUPS) {
      const s = g.scales.find((x) => x.name === scaleName);
      if (s) return s;
    }
    return SCALE_GROUPS[0].scales[0];
  }, [scaleName]);

  const notes = useMemo(() => getScaleNotes(root, scale.intervals), [root, scale]);

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      <RootPills root={root} onPick={setRoot} accent={accent} />

      {/* Scale type selector */}
      <div className="flex flex-col gap-3">
        {SCALE_GROUPS.map((g) => (
          <div key={g.group} className="flex flex-col gap-2">
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--t-text5)", fontFamily: MONO }}>
              {g.group}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.scales.map((s) => {
                const on = scaleName === s.name;
                return (
                  <button
                    key={s.name}
                    onClick={() => setScaleName(s.name)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95"
                    style={{
                      fontFamily: MONO,
                      background: on ? accent : "var(--t-el-low)",
                      color: on ? "#111" : "var(--t-text4)",
                      border: `1px solid ${on ? accent : "var(--t-border-md)"}`,
                    }}
                    data-testid={`scale-${s.name.replace(/[^a-z0-9]/gi, "-")}`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Result card */}
      <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" style={{ background: "var(--t-card)", border: "1px solid var(--t-border)" }}>
        <div className="text-lg font-bold" style={{ color: "var(--t-text)", fontFamily: MONO }}>{scale.name}</div>

        <div className="flex flex-wrap gap-2">
          {notes.map((n, i) => {
            const isRoot = i === 0;
            return (
              <span
                key={`${n}-${i}`}
                className="px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{
                  fontFamily: MONO,
                  background: isRoot ? accent + "26" : "var(--t-el-med)",
                  color: isRoot ? accent : "var(--t-text2)",
                  border: isRoot ? `1.5px solid ${accent}` : "1px solid var(--t-border)",
                }}
                data-testid={`scale-note-${n}`}
              >
                {n}
              </span>
            );
          })}
        </div>

        <div className="text-sm leading-relaxed" style={{ color: "var(--t-text2)" }}>{scale.feel}</div>
        <div className="text-xs leading-relaxed" style={{ color: "var(--t-text4)" }}>
          <span style={{ color: "var(--t-text5)", fontFamily: MONO }}>Sounds like: </span>{scale.examples}
        </div>
        <div className="text-xs" style={{ color: "var(--t-text6)", fontFamily: MONO }}>{scale.formula}</div>
      </div>
    </div>
  );
}

// ── TAB 6: DELAY CALCULATOR ────────────────────────────────────────────────────
function DelayCalc({ accent, onCopy }: { accent: string; onCopy: (ms: string) => void }) {
  const [bpm, setBpm] = useState(120);
  const [editing, setEditing] = useState(false);

  const clamp = (n: number) => Math.max(40, Math.min(300, n));
  const setBpmClamped = (n: number) => setBpm(clamp(n));

  const quarter = 60000 / bpm;

  return (
    <div className="px-4 py-6 flex flex-col gap-6">
      {/* BPM control */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-5">
          <button
            onClick={() => setBpmClamped(bpm - 1)}
            className="w-11 h-11 rounded-full text-2xl font-bold transition-all active:scale-90 flex items-center justify-center"
            style={{ background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
            data-testid="bpm-minus"
          >
            −
          </button>

          {editing ? (
            <input
              autoFocus
              type="number"
              defaultValue={bpm}
              onBlur={(e) => { setBpmClamped(parseInt(e.target.value) || 120); setEditing(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { setBpmClamped(parseInt((e.target as HTMLInputElement).value) || 120); setEditing(false); }
              }}
              className="text-center bg-transparent focus:outline-none"
              style={{ fontFamily: MONO, fontSize: "48px", fontWeight: 700, color: accent, width: "160px" }}
              data-testid="bpm-input"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="tabular-nums"
              style={{ fontFamily: MONO, fontSize: "48px", fontWeight: 700, color: accent, minWidth: "120px" }}
              data-testid="bpm-value"
            >
              {bpm}
            </button>
          )}

          <button
            onClick={() => setBpmClamped(bpm + 1)}
            className="w-11 h-11 rounded-full text-2xl font-bold transition-all active:scale-90 flex items-center justify-center"
            style={{ background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
            data-testid="bpm-plus"
          >
            +
          </button>
        </div>
        <div className="text-xs uppercase tracking-widest" style={{ color: "var(--t-text5)", fontFamily: MONO }}>BPM</div>
      </div>

      {/* Results table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--t-border)" }}>
        {SUBDIVISIONS.map((sub, i) => {
          const ms = quarter * sub.mult;
          const hz = 1000 / ms;
          const isQuarter = sub.name === "Quarter note";
          const zebra = i % 2 === 0 ? "var(--t-card)" : "var(--t-bg)";
          const msStr = ms.toFixed(1);
          return (
            <button
              key={sub.name}
              onClick={() => onCopy(msStr)}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors active:opacity-80"
              style={{
                background: isQuarter ? accent + "1a" : zebra,
                borderLeft: isQuarter ? `3px solid ${accent}` : "3px solid transparent",
                borderTop: i === 0 ? "none" : "1px solid var(--t-border)",
              }}
              data-testid={`delay-row-${sub.name.replace(/[^a-z0-9]/gi, "-")}`}
            >
              <span className="text-sm font-medium" style={{ color: isQuarter ? accent : "var(--t-text2)" }}>
                {sub.name}
              </span>
              <span className="flex items-baseline gap-3" style={{ fontFamily: MONO }}>
                <span className="text-sm font-bold" style={{ color: isQuarter ? accent : "var(--t-text)" }}>{msStr} ms</span>
                <span className="text-xs" style={{ color: "var(--t-text5)", minWidth: "62px", textAlign: "right" }}>{hz.toFixed(2)} Hz</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
