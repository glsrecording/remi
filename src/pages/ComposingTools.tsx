import { useState, useEffect, useMemo, useRef } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import {
  FretboardDiagram, getScalePositions, recognizeChordName, noteName,
  type GuitarTuning, type ChordDot,
} from "@/components/FretboardDiagram";

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

// ── TUNINGS (Session 2) ──────────────────────────────────────────────────────
// strings: 6 semitone values (C=0), low string → high string. ALL neck math
// reads these — never hardcoded E-A-D-G-B-E.
const TUNINGS: GuitarTuning[] = [
  { name: "Standard",          strings: [4, 9, 2, 7, 11, 4] }, // E A D G B E
  { name: "Drop D",            strings: [2, 9, 2, 7, 11, 4] }, // D A D G B E
  { name: "Step & half down",  strings: [1, 6, 11, 4, 8, 1] }, // C# F# B E G# C# (all -3)
  { name: "DADGAD",            strings: [2, 9, 2, 7, 9, 2] },  // D A D G A D
  { name: "Custom",            strings: [4, 9, 2, 7, 11, 4] }, // starts as Standard
];

// ── DIATONIC CHORDS ──────────────────────────────────────────────────────────
type ChordQuality = "major" | "minor" | "diminished";
interface DiatonicChord { name: string; roman: string; quality: ChordQuality; notes: string[]; }

const MAJOR_DEGREES: { roman: string; q: ChordQuality }[] = [
  { roman: "I", q: "major" }, { roman: "ii", q: "minor" }, { roman: "iii", q: "minor" },
  { roman: "IV", q: "major" }, { roman: "V", q: "major" }, { roman: "vi", q: "minor" },
  { roman: "vii°", q: "diminished" },
];
const MINOR_DEGREES: { roman: string; q: ChordQuality }[] = [
  { roman: "i", q: "minor" }, { roman: "ii°", q: "diminished" }, { roman: "III", q: "major" },
  { roman: "iv", q: "minor" }, { roman: "v", q: "minor" }, { roman: "VI", q: "major" },
  { roman: "VII", q: "major" },
];

function triadNotes(rootName: string, quality: ChordQuality): string[] {
  const r = NOTE_INDEX[rootName] ?? 0;
  const iv = quality === "minor" ? [0, 3, 7] : quality === "diminished" ? [0, 3, 6] : [0, 4, 7];
  return iv.map((x) => NOTE_NAMES[(r + x) % 12]);
}

function diatonicChords(root: string, mode: "major" | "minor"): DiatonicChord[] {
  const scale = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const degs = mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES;
  const r = NOTE_INDEX[root] ?? 0;
  return degs.map((d, i) => {
    const chordRoot = NOTE_NAMES[(r + scale[i]) % 12];
    const suffix = d.q === "minor" ? "m" : d.q === "diminished" ? "°" : "";
    return { name: chordRoot + suffix, roman: d.roman, quality: d.q, notes: triadNotes(chordRoot, d.q) };
  });
}

// ── CHORD VOICINGS (standard-tuning fingerings) ───────────────────────────────
// string 0 = low E … 5 = high E in standard tuning. These are real, correct
// open/barre shapes — the diagram must agree with the theory pills.
interface ChordVoicing { name: string; dots: ChordDot[]; startFret: number; openStrings: number[]; mutedStrings: number[]; }
const D = (string: number, fret: number, isRoot?: boolean): ChordDot => ({ string, fret, isRoot });

const VOICINGS: Record<string, ChordVoicing[]> = {
  // Majors
  C: [
    { name: "C", dots: [D(1, 3, true), D(2, 2), D(4, 1, true)], startFret: 1, openStrings: [3, 5], mutedStrings: [0] },
    { name: "C (A-shape)", dots: [D(1, 3, true), D(2, 5), D(3, 5, true), D(4, 5), D(5, 3)], startFret: 3, openStrings: [], mutedStrings: [0] },
  ],
  D: [
    { name: "D", dots: [D(3, 2), D(4, 3, true), D(5, 2)], startFret: 1, openStrings: [2], mutedStrings: [0, 1] },
    { name: "D (A-shape)", dots: [D(1, 5, true), D(2, 7), D(3, 7, true), D(4, 7), D(5, 5)], startFret: 5, openStrings: [], mutedStrings: [0] },
  ],
  E: [
    { name: "E", dots: [D(1, 2), D(2, 2, true), D(3, 1)], startFret: 1, openStrings: [0, 4, 5], mutedStrings: [] },
    { name: "E (A-shape)", dots: [D(1, 7, true), D(2, 9), D(3, 9, true), D(4, 9), D(5, 7)], startFret: 7, openStrings: [], mutedStrings: [0] },
  ],
  F: [
    { name: "F (barre)", dots: [D(0, 1, true), D(1, 3), D(2, 3, true), D(3, 2), D(4, 1), D(5, 1)], startFret: 1, openStrings: [], mutedStrings: [] },
    { name: "F (partial)", dots: [D(2, 3, true), D(3, 2), D(4, 1), D(5, 1)], startFret: 1, openStrings: [], mutedStrings: [0, 1] },
  ],
  G: [
    { name: "G", dots: [D(0, 3, true), D(1, 2), D(5, 3, true)], startFret: 1, openStrings: [2, 3, 4], mutedStrings: [] },
    { name: "G (E-shape)", dots: [D(0, 3, true), D(1, 5), D(2, 5, true), D(3, 4), D(4, 3), D(5, 3, true)], startFret: 3, openStrings: [], mutedStrings: [] },
  ],
  A: [
    { name: "A", dots: [D(2, 2), D(3, 2, true), D(4, 2)], startFret: 1, openStrings: [1, 5], mutedStrings: [0] },
    { name: "A (E-shape)", dots: [D(0, 5, true), D(1, 7), D(2, 7, true), D(3, 6), D(4, 5), D(5, 5)], startFret: 5, openStrings: [], mutedStrings: [] },
  ],
  B: [{ name: "B (barre)", dots: [D(1, 2, true), D(2, 4), D(3, 4, true), D(4, 4), D(5, 2)], startFret: 2, openStrings: [], mutedStrings: [0] }],
  // Minors
  Cm: [{ name: "Cm (barre)", dots: [D(1, 3, true), D(2, 5), D(3, 5, true), D(4, 4), D(5, 3)], startFret: 3, openStrings: [], mutedStrings: [0] }],
  Dm: [
    { name: "Dm", dots: [D(3, 2), D(4, 3, true), D(5, 1)], startFret: 1, openStrings: [2], mutedStrings: [0, 1] },
    { name: "Dm (A-shape)", dots: [D(1, 5, true), D(2, 7), D(3, 7, true), D(4, 6), D(5, 5)], startFret: 5, openStrings: [], mutedStrings: [0] },
  ],
  Em: [
    { name: "Em", dots: [D(1, 2), D(2, 2, true)], startFret: 1, openStrings: [0, 3, 4, 5], mutedStrings: [] },
    { name: "Em (A-shape)", dots: [D(1, 7, true), D(2, 9), D(3, 9, true), D(4, 8), D(5, 7)], startFret: 7, openStrings: [], mutedStrings: [0] },
  ],
  Fm: [{ name: "Fm (barre)", dots: [D(0, 1, true), D(1, 3), D(2, 3, true), D(3, 1), D(4, 1), D(5, 1)], startFret: 1, openStrings: [], mutedStrings: [] }],
  Gm: [{ name: "Gm (barre)", dots: [D(0, 3, true), D(1, 5), D(2, 5, true), D(3, 3), D(4, 3), D(5, 3)], startFret: 3, openStrings: [], mutedStrings: [] }],
  Am: [
    { name: "Am", dots: [D(2, 2), D(3, 2, true), D(4, 1)], startFret: 1, openStrings: [1, 5], mutedStrings: [0] },
    { name: "Am (E-shape)", dots: [D(0, 5, true), D(1, 7), D(2, 7, true), D(3, 5), D(4, 5), D(5, 5)], startFret: 5, openStrings: [], mutedStrings: [] },
  ],
  Bm: [{ name: "Bm (barre)", dots: [D(1, 2, true), D(2, 4), D(3, 4, true), D(4, 3), D(5, 2)], startFret: 2, openStrings: [], mutedStrings: [0] }],
  // 7ths
  Am7: [{ name: "Am7", dots: [D(2, 2), D(4, 1)], startFret: 1, openStrings: [1, 3, 5], mutedStrings: [0] }],
  Dm7: [{ name: "Dm7", dots: [D(3, 2), D(4, 1), D(5, 1)], startFret: 1, openStrings: [2], mutedStrings: [0, 1] }],
  Em7: [{ name: "Em7", dots: [D(1, 2), D(2, 2, true), D(4, 3)], startFret: 1, openStrings: [0, 3, 5], mutedStrings: [] }],
  G7: [{ name: "G7", dots: [D(0, 3, true), D(1, 2), D(5, 1)], startFret: 1, openStrings: [2, 3, 4], mutedStrings: [] }],
  D7: [{ name: "D7", dots: [D(3, 2), D(4, 1), D(5, 2)], startFret: 1, openStrings: [2], mutedStrings: [0, 1] }],
  A7: [{ name: "A7", dots: [D(2, 2), D(4, 2)], startFret: 1, openStrings: [1, 3, 5], mutedStrings: [0] }],
  E7: [{ name: "E7", dots: [D(1, 2), D(3, 1)], startFret: 1, openStrings: [0, 2, 4, 5], mutedStrings: [] }],
  // maj7
  Cmaj7: [{ name: "Cmaj7", dots: [D(1, 3, true), D(2, 2)], startFret: 1, openStrings: [3, 4, 5], mutedStrings: [0] }],
  Gmaj7: [{ name: "Gmaj7", dots: [D(0, 3, true), D(1, 2), D(5, 2)], startFret: 1, openStrings: [2, 3, 4], mutedStrings: [] }],
  Fmaj7: [{ name: "Fmaj7", dots: [D(2, 3, true), D(3, 2), D(4, 1)], startFret: 1, openStrings: [5], mutedStrings: [0, 1] }],
  Dmaj7: [{ name: "Dmaj7", dots: [D(3, 2), D(4, 2), D(5, 2)], startFret: 1, openStrings: [2], mutedStrings: [0, 1] }],
  Amaj7: [{ name: "Amaj7", dots: [D(2, 2), D(3, 1), D(4, 2)], startFret: 1, openStrings: [1, 5], mutedStrings: [0] }],
  // add9 / sus
  Cadd9: [{ name: "Cadd9", dots: [D(1, 3, true), D(2, 2), D(4, 3)], startFret: 1, openStrings: [3, 5], mutedStrings: [0] }],
  Gadd9: [{ name: "Gadd9", dots: [D(0, 3, true), D(3, 2), D(5, 3, true)], startFret: 1, openStrings: [1, 2, 4], mutedStrings: [] }],
  Dsus2: [{ name: "Dsus2", dots: [D(3, 2), D(4, 3, true)], startFret: 1, openStrings: [2, 5], mutedStrings: [0, 1] }],
  Asus2: [{ name: "Asus2", dots: [D(2, 2), D(3, 2, true)], startFret: 1, openStrings: [1, 4, 5], mutedStrings: [0] }],
  Esus4: [{ name: "Esus4", dots: [D(1, 2), D(2, 2, true), D(3, 2)], startFret: 1, openStrings: [0, 4, 5], mutedStrings: [] }],
  Dsus4: [{ name: "Dsus4", dots: [D(3, 2), D(4, 3, true), D(5, 3)], startFret: 1, openStrings: [2], mutedStrings: [0, 1] }],
  Asus4: [{ name: "Asus4", dots: [D(2, 2), D(3, 2, true), D(4, 3)], startFret: 1, openStrings: [1, 5], mutedStrings: [0] }],
};

// Strings that actually sound in a voicing (open + fretted), sorted low → high.
function soundingStrings(v: ChordVoicing): { s: number; fret: number }[] {
  const arr = [
    ...v.openStrings.map((s) => ({ s, fret: 0 })),
    ...v.dots.map((d) => ({ s: d.string, fret: d.fret })),
  ];
  return arr.sort((a, b) => a.s - b.s);
}

// ── TUNING SELECTOR (page level) ──────────────────────────────────────────────
function TuningSelector({
  accent, tuningName, onPickPreset, customStrings, onCustomChange,
}: {
  accent: string;
  tuningName: string;
  onPickPreset: (name: string) => void;
  customStrings: number[];
  onCustomChange: (index: number, semitone: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--t-border)", background: "var(--t-surface)" }}>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-xs shrink-0" style={{ color: "var(--t-text4)", fontFamily: MONO }}>Tuning:</span>
        {TUNINGS.map((t) => {
          const on = tuningName === t.name;
          return (
            <button
              key={t.name}
              onClick={() => onPickPreset(t.name)}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
              style={{
                fontFamily: MONO,
                background: on ? accent : "var(--t-el-low)",
                color: on ? "#111" : "var(--t-text4)",
                border: `1px solid ${on ? accent : "var(--t-border-md)"}`,
              }}
              data-testid={`tuning-${t.name.replace(/[^a-z0-9]/gi, "-")}`}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      {tuningName === "Custom" && (
        <div className="grid grid-cols-3 gap-2 mt-1">
          {customStrings.map((semi, i) => (
            <label key={i} className="flex flex-col gap-1">
              <span className="text-[10px]" style={{ color: "var(--t-text5)", fontFamily: MONO }}>
                String {i + 1} {i === 0 ? "(low)" : i === 5 ? "(high)" : ""}
              </span>
              <select
                value={semi}
                onChange={(e) => onCustomChange(i, parseInt(e.target.value))}
                className="rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                style={{ fontFamily: MONO, background: "var(--t-card)", color: "var(--t-text2)", border: "1px solid var(--t-border-md)" }}
                data-testid={`custom-string-${i}`}
              >
                {NOTE_NAMES.map((n, pc) => <option key={n} value={pc}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TAB 2: CHORD EXPLORER ──────────────────────────────────────────────────────
function ChordExplorer({ accent, tuning }: { accent: string; tuning: GuitarTuning }) {
  const [root, setRoot] = useState("C");
  const [mode, setMode] = useState<"major" | "minor">("major");
  const [instrument, setInstrument] = useState<"guitar" | "piano">("guitar");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [voicingIdx, setVoicingIdx] = useState(0);

  const chords = useMemo(() => diatonicChords(root, mode), [root, mode]);

  // Reset the open panel + voicing when the key changes (chords list changes).
  useEffect(() => { setSelectedIdx(null); setVoicingIdx(0); }, [root, mode]);
  useEffect(() => { setVoicingIdx(0); }, [selectedIdx]);

  const selected = selectedIdx != null ? chords[selectedIdx] : null;
  const voicings = selected ? (VOICINGS[selected.name] || []) : [];
  const activeVoicing = voicings.length ? voicings[Math.min(voicingIdx, voicings.length - 1)] : null;

  const qualityLabel = (q: ChordQuality) => (q === "major" ? "Major" : q === "minor" ? "Minor" : "Diminished");
  const isStandard = tuning.name === "Standard";

  // What the standard-tuning shape actually produces in the current tuning.
  let tuningNotice: { name: string | null; notes: string[]; bass: string } | null = null;
  if (activeVoicing && !isStandard) {
    const sounding = soundingStrings(activeVoicing);
    const pcs = sounding.map((x) => (tuning.strings[x.s] + x.fret) % 12);
    const bassPc = sounding.length ? (tuning.strings[sounding[0].s] + sounding[0].fret) % 12 : 0;
    const seen = new Set<string>();
    const notes: string[] = [];
    for (const pc of pcs) { const nm = noteName(pc); if (!seen.has(nm)) { seen.add(nm); notes.push(nm); } }
    tuningNotice = { name: recognizeChordName(pcs, bassPc), notes, bass: noteName(bassPc) };
  }

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      {/* Key selector */}
      <div className="flex flex-col gap-3">
        <RootPills root={root} onPick={setRoot} accent={accent} />
        <div className="flex gap-1.5">
          {(["major", "minor"] as const).map((m) => {
            const on = mode === m;
            return (
              <button key={m} onClick={() => setMode(m)}
                className="px-4 py-1.5 rounded-xl text-sm font-bold capitalize transition-all active:scale-95"
                style={{ fontFamily: MONO, background: on ? accent : "var(--t-el-low)", color: on ? "#111" : "var(--t-text4)", border: `1px solid ${on ? accent : "var(--t-border-md)"}` }}
                data-testid={`ce-mode-${m}`}>{m}</button>
            );
          })}
        </div>
      </div>

      {/* Instrument toggle */}
      <div className="flex gap-1.5">
        {(["guitar", "piano"] as const).map((ins) => {
          const on = instrument === ins;
          return (
            <button key={ins} onClick={() => setInstrument(ins)}
              className="px-4 py-1.5 rounded-xl text-sm font-bold capitalize transition-all active:scale-95"
              style={{ fontFamily: MONO, background: on ? accent : "var(--t-el-low)", color: on ? "#111" : "var(--t-text4)", border: `1px solid ${on ? accent : "var(--t-border-md)"}` }}
              data-testid={`instrument-${ins}`}>{ins}</button>
          );
        })}
      </div>

      {/* Diatonic chord grid */}
      <div className="grid grid-cols-4 gap-2">
        {chords.map((c, i) => {
          const on = selectedIdx === i;
          return (
            <button key={c.roman} onClick={() => setSelectedIdx(i)}
              className="rounded-xl px-2 py-2 flex flex-col items-center gap-0.5 transition-all active:scale-95"
              style={{ background: "var(--t-card)", border: `1.5px solid ${on ? accent : "var(--t-border)"}` }}
              data-testid={`chord-card-${c.name.replace(/[^a-z0-9]/gi, "-")}`}>
              <span className="text-sm font-bold" style={{ color: on ? accent : "var(--t-text)", fontFamily: MONO }}>{c.name}</span>
              <span className="text-[10px]" style={{ color: "var(--t-text5)", fontFamily: MONO }}>{c.roman}</span>
              <span className="text-[9px]" style={{ color: "var(--t-text6)" }}>{qualityLabel(c.quality)}</span>
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" style={{ background: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <div className="text-xl font-bold" style={{ color: "var(--t-text)", fontFamily: MONO }}>{selected.name}</div>

          <div className="flex flex-wrap gap-2">
            {selected.notes.map((n, i) => (
              <span key={`${n}-${i}`} className="px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{ fontFamily: MONO, background: i === 0 ? accent + "26" : "var(--t-el-med)", color: i === 0 ? accent : "var(--t-text2)", border: i === 0 ? `1.5px solid ${accent}` : "1px solid var(--t-border)" }}>
                {n}
              </span>
            ))}
          </div>

          {instrument === "guitar" ? (
            activeVoicing ? (
              <>
                <FretboardDiagram mode="chord" instrument="guitar" tuning={tuning} accent={accent}
                  chordDots={activeVoicing.dots} startFret={activeVoicing.startFret}
                  openStrings={activeVoicing.openStrings} mutedStrings={activeVoicing.mutedStrings} />
                {voicings.length > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--t-text5)", fontFamily: MONO }}>
                      Voicing {Math.min(voicingIdx, voicings.length - 1) + 1} of {voicings.length}
                    </span>
                    <button onClick={() => setVoicingIdx((voicingIdx + 1) % voicings.length)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                      style={{ fontFamily: MONO, background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
                      data-testid="next-voicing">Next voicing →</button>
                  </div>
                )}
                {tuningNotice && (
                  <div className="rounded-xl px-3 py-2 text-xs leading-relaxed" style={{ background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border)" }} data-testid="tuning-notice">
                    Shapes shown are standard tuning fingerings. In <b>{tuning.name}</b>, this shape produces:{" "}
                    <b style={{ color: accent }}>{tuningNotice.name || "an ambiguous voicing"}</b>
                    <div className="mt-1" style={{ color: "var(--t-text4)" }}>
                      Actual notes in this tuning: {tuningNotice.notes.join(", ")} (bass {tuningNotice.bass})
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs" style={{ color: "var(--t-text5)" }}>Diagram coming soon for this voicing</div>
            )
          ) : (
            <FretboardDiagram mode="chord" instrument="piano" tuning={tuning} accent={accent} chordNotes={selected.notes} />
          )}
        </div>
      )}
    </div>
  );
}

// ── TAB 3: CHORD DRAW (Session 3) ─────────────────────────────────────────────
// Interactive fretboard: tap fret positions → identify the chord in the current
// tuning → show variations. Pure math, no backend. Identification is musically
// correct (the actual notes under the fingers), not forced to a "nice" name.

interface ChordTemplate { name: string; intervals: number[] } // intervals from root, excluding 0
const CHORD_TEMPLATES: ChordTemplate[] = [
  { name: "5",     intervals: [7] },            // power chord (simplest → checked early via size sort)
  { name: "",      intervals: [4, 7] },         // major
  { name: "m",     intervals: [3, 7] },         // minor
  { name: "dim",   intervals: [3, 6] },         // diminished
  { name: "aug",   intervals: [4, 8] },         // augmented
  { name: "sus2",  intervals: [2, 7] },
  { name: "sus4",  intervals: [5, 7] },
  { name: "7",     intervals: [4, 7, 10] },     // dominant 7
  { name: "maj7",  intervals: [4, 7, 11] },
  { name: "m7",    intervals: [3, 7, 10] },
  { name: "dim7",  intervals: [3, 6, 9] },
  { name: "mmaj7", intervals: [3, 7, 11] },
  { name: "7sus4", intervals: [5, 7, 10] },
  { name: "6",     intervals: [4, 7, 9] },
  { name: "m6",    intervals: [3, 7, 9] },
  { name: "add9",  intervals: [4, 7, 2] },      // 2 == 14 mod 12
  { name: "madd9", intervals: [3, 7, 2] },
  { name: "9",     intervals: [4, 7, 10, 2] },
  { name: "maj9",  intervals: [4, 7, 11, 2] },
  { name: "m9",    intervals: [3, 7, 10, 2] },
];

// Identify a chord from a set of pitch classes; prefers the bass (lowest string)
// as root, strong (exact) over partial, and simpler templates over complex.
function identifyChord(pcs: number[], bassPc: number | null): { name: string; confidence: string; root: number } | null {
  const uniq = Array.from(new Set(pcs.map((p) => ((p % 12) + 12) % 12)));
  if (uniq.length < 2) return null;
  const roots = bassPc != null ? [bassPc, ...uniq.filter((p) => p !== bassPc)] : uniq;
  type Cand = { root: number; name: string; strong: boolean; size: number; bassRoot: boolean };
  const cands: Cand[] = [];
  for (const root of roots) {
    const rel = new Set(uniq.map((p) => (p - root + 12) % 12)); // includes 0
    const nonRoot = Array.from(rel).filter((x) => x !== 0);
    for (const t of CHORD_TEMPLATES) {
      const tset = Array.from(new Set(t.intervals.map((i) => ((i % 12) + 12) % 12))).filter((x) => x !== 0);
      const allPresent = tset.every((i) => rel.has(i));
      if (!allPresent) continue;
      const noExtra = nonRoot.every((i) => tset.includes(i));
      // A power chord (1 interval) is defined by having ONLY root+fifth — never
      // report it as a partial match when other notes are present (would mislabel
      // any set containing a fifth). Partials are for triad-or-larger templates.
      if (!noExtra && tset.length < 2) continue;
      cands.push({ root, name: NOTE_NAMES[root] + t.name, strong: noExtra, size: tset.length, bassRoot: root === bassPc });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) =>
    (Number(b.strong) - Number(a.strong)) ||
    (a.size - b.size) ||
    (Number(b.bassRoot) - Number(a.bassRoot)),
  );
  const best = cands[0];
  return { name: best.name, confidence: best.strong ? "Strong match" : "Possible match", root: best.root };
}

function chordNotesFromSuffix(rootName: string, suffix: string): string[] {
  const t = CHORD_TEMPLATES.find((x) => x.name === suffix);
  const r = NOTE_INDEX[rootName] ?? 0;
  const ivals = t ? [0, ...t.intervals] : [0];
  const seen = new Set<string>(); const out: string[] = [];
  for (const i of ivals) { const nm = NOTE_NAMES[(r + i) % 12]; if (!seen.has(nm)) { seen.add(nm); out.push(nm); } }
  return out;
}

function buildVariations(rootName: string, identifiedName: string, minorFamily: boolean): { name: string; suffix: string }[] {
  const major = ["", "maj7", "7", "add9", "sus2", "sus4"];
  const minor = ["m", "m7", "m9", "madd9", "sus2"];
  const fam = minorFamily ? minor : major;
  const list = fam.map((suffix) => ({ suffix, name: rootName + suffix }));
  list.push({ suffix: "5", name: rootName + "5" }); // always offer the power chord
  return list.filter((v) => v.name !== identifiedName).slice(0, 5);
}

const STANDARD_STRINGS = [4, 9, 2, 7, 11, 4];
type DrawString = { kind: "fretted"; fret: number } | { kind: "open" } | { kind: "muted" };

function soundingList(st: Record<number, DrawString>, tStrings: number[]): { s: number; pc: number }[] {
  const out: { s: number; pc: number }[] = [];
  for (let s = 0; s < 6; s++) {
    const v = st[s];
    if (!v || v.kind === "muted") continue;
    const pc = v.kind === "open" ? tStrings[s] % 12 : (tStrings[s] + v.fret) % 12;
    out.push({ s, pc });
  }
  return out; // already low-string → high-string order
}

interface DrawResult { chordName: string; confidence: string; notes: string[]; root: number | null; standardName: string | null; variations: { name: string; suffix: string }[]; }

function computeDrawResult(st: Record<number, DrawString>, tuning: GuitarTuning): DrawResult | null {
  const list = soundingList(st, tuning.strings);
  if (!list.length) return null;
  const pcs = list.map((x) => x.pc);
  const bass = list[0].pc;
  const seen = new Set<string>(); const notes: string[] = [];
  for (const pc of pcs) { const nm = noteName(pc); if (!seen.has(nm)) { seen.add(nm); notes.push(nm); } }
  const id = identifyChord(pcs, bass);
  const stdList = soundingList(st, STANDARD_STRINGS);
  const stdId = stdList.length ? identifyChord(stdList.map((x) => x.pc), stdList[0].pc) : null;
  let variations: { name: string; suffix: string }[] = [];
  if (id) {
    const rootName = NOTE_NAMES[id.root];
    const suffix = id.name.slice(rootName.length);
    const minorFam = suffix.startsWith("m") && !suffix.startsWith("maj");
    variations = buildVariations(rootName, id.name, minorFam);
  }
  return {
    chordName: id ? id.name : "Unknown chord",
    confidence: id ? id.confidence : "Unknown",
    notes,
    root: id ? id.root : null,
    standardName: stdId ? stdId.name : null,
    variations,
  };
}

function ChordDraw({ accent, tuning }: { accent: string; tuning: GuitarTuning }) {
  const [strings, setStrings] = useState<Record<number, DrawString>>({});
  const [windowStart, setWindowStart] = useState(1);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [autoIdentify, setAutoIdentify] = useState(false);
  const [muteMode, setMuteMode] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frets = [0, 1, 2, 3, 4].map((i) => windowStart + i);

  // Auto-identify reruns whenever the shape or tuning changes (when enabled).
  useEffect(() => {
    if (autoIdentify) setResult(computeDrawResult(strings, tuning));
  }, [strings, tuning, autoIdentify]);

  const toggleFret = (s: number, f: number) => {
    setStrings((prev) => {
      const cur = prev[s];
      const next = { ...prev };
      if (cur && cur.kind === "fretted" && cur.fret === f) delete next[s];
      else next[s] = { kind: "fretted", fret: f };
      return next;
    });
  };
  const tapLabel = (s: number) => {
    setStrings((prev) => {
      const cur = prev[s];
      const next = { ...prev };
      if (muteMode) {
        if (cur && cur.kind === "muted") delete next[s]; else next[s] = { kind: "muted" };
      } else {
        if (cur && cur.kind === "open") delete next[s]; else next[s] = { kind: "open" };
      }
      return next;
    });
  };
  const longPressLabel = (s: number) => {
    setStrings((prev) => {
      const cur = prev[s];
      const next = { ...prev };
      if (cur && cur.kind === "muted") delete next[s]; else next[s] = { kind: "muted" };
      return next;
    });
  };

  const clearAll = () => { setStrings({}); setResult(null); setExpanded(null); };
  const identify = () => setResult(computeDrawResult(strings, tuning));

  const cell = 44;
  const labelW = 60;

  // Row order: high string (5) on top, low string (0) on bottom.
  const rows = [5, 4, 3, 2, 1, 0];

  return (
    <div className="px-4 py-5 flex flex-col gap-4">
      <style>{`.cd-cell{background:transparent;} .cd-cell:hover{background:var(--t-el-low);}`}</style>

      {/* A) Tuning reminder */}
      <div className="text-xs" style={{ color: "var(--t-text5)", fontFamily: MONO }} data-testid="chorddraw-tuning">
        Tuning: {tuning.name}
      </div>

      {/* B) Interactive fretboard grid */}
      <div style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
        {/* fret number header */}
        <div className="flex">
          <div style={{ width: labelW }} />
          {frets.map((f) => (
            <div key={`hf-${f}`} className="flex items-center justify-center"
              style={{ flex: 1, minWidth: cell, height: 22, color: "var(--t-text6)", fontFamily: MONO, fontSize: 10 }}>
              {f}
            </div>
          ))}
        </div>

        {rows.map((s) => {
          const st = strings[s];
          const openNote = noteName(tuning.strings[s]);
          return (
            <div key={`row-${s}`} className="flex" style={{ alignItems: "stretch" }}>
              {/* label / open / mute area */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  longPress.current = setTimeout(() => { longPressLabel(s); longPress.current = null; }, 480);
                }}
                onPointerUp={() => { if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; tapLabel(s); } }}
                onPointerLeave={() => { if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; } }}
                className="flex items-center justify-center gap-1"
                style={{ width: labelW, height: cell, borderRight: windowStart === 1 ? "3px solid var(--t-text)" : "1px solid var(--t-border-md)" }}
                data-testid={`cd-label-${s}`}
              >
                <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--t-text4)" }}>{openNote}</span>
                {st?.kind === "open" && <span style={{ color: accent, fontSize: 13 }}>○</span>}
                {st?.kind === "muted" && <span style={{ color: "var(--t-text6)", fontSize: 13 }}>×</span>}
              </button>

              {/* fret cells */}
              {frets.map((f) => {
                const fretted = st?.kind === "fretted" && st.fret === f;
                const pc = (tuning.strings[s] + f) % 12;
                const isRoot = fretted && result?.root != null && pc === result.root;
                return (
                  <div
                    key={`c-${s}-${f}`}
                    onPointerDown={(e) => { e.preventDefault(); toggleFret(s, f); }}
                    className={fretted ? "" : "cd-cell"}
                    style={{
                      flex: 1, minWidth: cell, height: cell,
                      borderBottom: "1px solid var(--t-border)",
                      borderRight: "1px solid var(--t-border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                    }}
                    data-testid={`cd-cell-${s}-${f}`}
                  >
                    {fretted && (
                      <div className="flex items-center justify-center" style={{
                        width: 32, height: 32, borderRadius: 99,
                        background: accent,
                        border: isRoot ? "2px solid var(--t-text)" : "none",
                        boxShadow: isRoot ? `0 0 0 2px ${accent}` : "none",
                      }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "#111" }}>{noteName(pc)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* C) Position selector */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: "var(--t-text3)", fontFamily: MONO }}>
          Position: Frets {windowStart}–{windowStart + 4}
        </span>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setWindowStart((w) => Math.max(1, w - 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95"
            style={{ fontFamily: MONO, background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
            data-testid="cd-down">▼ Down</button>
          <button type="button" onClick={() => setWindowStart((w) => Math.min(17, w + 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95"
            style={{ fontFamily: MONO, background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
            data-testid="cd-up">▲ Up</button>
        </div>
      </div>

      {/* D) Action row */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={identify}
          className="px-4 py-2 rounded-xl text-sm font-bold active:scale-95"
          style={{ fontFamily: MONO, background: accent, color: "#111" }}
          data-testid="cd-identify">Identify chord</button>
        <button type="button" onClick={clearAll}
          className="px-4 py-2 rounded-xl text-sm font-medium active:scale-95"
          style={{ fontFamily: MONO, background: "var(--t-el-low)", color: "var(--t-text4)", border: "1px solid var(--t-border-md)" }}
          data-testid="cd-clear">Clear</button>
        <button type="button" onClick={() => setMuteMode((m) => !m)}
          className="px-4 py-2 rounded-xl text-sm font-medium active:scale-95"
          style={{ fontFamily: MONO, background: muteMode ? accent : "var(--t-el-low)", color: muteMode ? "#111" : "var(--t-text4)", border: `1px solid ${muteMode ? accent : "var(--t-border-md)"}` }}
          data-testid="cd-mute">Mute string</button>
      </div>

      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--t-text4)" }}>
        <input type="checkbox" checked={autoIdentify} onChange={(e) => setAutoIdentify(e.target.checked)} data-testid="cd-auto" />
        Auto-identify as I draw
      </label>

      {/* E) Result panel */}
      {result && (
        <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" style={{ background: "var(--t-card)", border: "1px solid var(--t-border)" }} data-testid="cd-result">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold" style={{ color: "var(--t-text)", fontFamily: MONO }}>{result.chordName}</span>
            <span className="text-xs" style={{ color: result.confidence === "Strong match" ? accent : "var(--t-text5)", fontFamily: MONO }}>{result.confidence}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.notes.map((n, i) => (
              <span key={`${n}-${i}`} className="px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{ fontFamily: MONO, background: "var(--t-el-med)", color: "var(--t-text2)", border: "1px solid var(--t-border)" }}>{n}</span>
            ))}
          </div>
          {result.chordName !== "Unknown chord" && (
            <div className="text-xs" style={{ color: "var(--t-text4)" }}>
              This shape in <b>{tuning.name}</b>: <b style={{ color: accent }}>{result.chordName}</b>
            </div>
          )}
          {tuning.name !== "Standard" && result.standardName && (
            <div className="text-xs" style={{ color: "var(--t-text5)" }}>
              In Standard tuning this shape would be: <b>{result.standardName}</b>
            </div>
          )}

          {/* F) Variations */}
          {result.variations.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--t-text5)", fontFamily: MONO }}>Variations &amp; related chords</div>
              <div className="grid grid-cols-2 gap-2">
                {result.variations.map((v) => {
                  const notes = chordNotesFromSuffix(NOTE_NAMES[result.root ?? 0], v.suffix);
                  const open = expanded === v.name;
                  const voicing = VOICINGS[v.name]?.[0];
                  return (
                    <div key={v.name} className="rounded-xl px-3 py-2 flex flex-col gap-1.5"
                      style={{ background: "var(--t-bg)", border: `1px solid ${open ? accent : "var(--t-border)"}` }}>
                      <button type="button" onClick={() => setExpanded(open ? null : v.name)}
                        className="flex items-center justify-between" data-testid={`cd-var-${v.name.replace(/[^a-z0-9]/gi, "-")}`}>
                        <span className="text-sm font-bold" style={{ color: "var(--t-text)", fontFamily: MONO }}>{v.name}</span>
                        <span style={{ color: "var(--t-text6)", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
                      </button>
                      <div className="flex flex-wrap gap-1">
                        {notes.map((n, i) => (
                          <span key={`${n}-${i}`} className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{ fontFamily: MONO, background: "var(--t-el-med)", color: "var(--t-text3)" }}>{n}</span>
                        ))}
                      </div>
                      {open && (
                        voicing ? (
                          <FretboardDiagram mode="chord" instrument="guitar" tuning={tuning} accent={accent}
                            chordDots={voicing.dots} startFret={voicing.startFret}
                            openStrings={voicing.openStrings} mutedStrings={voicing.mutedStrings} />
                        ) : (
                          <div className="text-[10px]" style={{ color: "var(--t-text6)" }}>Diagram coming soon for this voicing</div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function ComposingTools() {
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [menuOpen, setMenuOpen] = useState(false);
  // Always opens to Key Finder on fresh navigation — tab is NOT persisted.
  const [tab, setTab] = useState<TabId>("key-finder");
  const [toast, setToast] = useState<string | null>(null);

  // Tuning lives at the page level so it persists across Chord Explorer / Scales tabs.
  const [tuningName, setTuningName] = useState("Standard");
  const [customStrings, setCustomStrings] = useState<number[]>([4, 9, 2, 7, 11, 4]);
  const currentTuning: GuitarTuning = tuningName === "Custom"
    ? { name: "Custom", strings: customStrings }
    : (TUNINGS.find((t) => t.name === tuningName) || TUNINGS[0]);
  const showTuning = tab === "chord-explorer" || tab === "scales" || tab === "chord-draw";

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="composing-tools flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>
      {/* Cross-input hardening (Session 2 fix): every control responds cleanly to
          mouse + touch. touch-action: manipulation removes the touch tap-delay;
          cursor: pointer makes the desktop affordance explicit. Selection logic
          is unchanged — buttons already use onClick + state-driven inline styles. */}
      <style>{`
        .composing-tools button { touch-action: manipulation; cursor: pointer; }
        .composing-tools select { touch-action: manipulation; cursor: pointer; }
      `}</style>
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

      {/* Tuning selector — page level, only on guitar-relevant tabs */}
      {showTuning && (
        <TuningSelector
          accent={remiColor}
          tuningName={tuningName}
          onPickPreset={(name) => {
            if (name === "Custom") setCustomStrings([4, 9, 2, 7, 11, 4]);
            setTuningName(name);
          }}
          customStrings={customStrings}
          onCustomChange={(i, semi) => setCustomStrings((prev) => prev.map((v, j) => (j === i ? semi : v)))}
        />
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}>
        {tab === "key-finder"     && <KeyFinder accent={remiColor} />}
        {tab === "chord-explorer" && <ChordExplorer accent={remiColor} tuning={currentTuning} />}
        {tab === "chord-draw"     && <ChordDraw accent={remiColor} tuning={currentTuning} />}
        {tab === "progressions"   && <Progressions accent={remiColor} />}
        {tab === "scales"         && <ScalesModes accent={remiColor} tuning={currentTuning} />}
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
      // X/Y where X = selected notes that fit, Y = total selected. Exact = all fit (N/N);
      // near = all but one fits (N-1/N).
      if (match === total) exactArr.push({ name: key.name, match, total });
      else if (match === total - 1) nearArr.push({ name: key.name, match, total });
    }
    // Exact matches first; ties (all N/N here) keep stable data order (majors before minors).
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
function ScalesModes({ accent, tuning }: { accent: string; tuning: GuitarTuning }) {
  const [root, setRoot] = useState("C");
  const [scaleName, setScaleName] = useState("Major (Ionian)");
  const [view, setView] = useState<"full" | "position">("full");
  const [posIdx, setPosIdx] = useState(0);

  const scale = useMemo(() => {
    for (const g of SCALE_GROUPS) {
      const s = g.scales.find((x) => x.name === scaleName);
      if (s) return s;
    }
    return SCALE_GROUPS[0].scales[0];
  }, [scaleName]);

  const notes = useMemo(() => getScaleNotes(root, scale.intervals), [root, scale]);
  const positions = useMemo(() => getScalePositions(notes, tuning), [notes, tuning]);

  // Keep the position index valid when scale/root/tuning change the position list.
  useEffect(() => { setPosIdx((p) => (p >= positions.length ? 0 : p)); }, [positions.length]);

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

      {/* ── On the guitar (Session 2) ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--t-text5)", fontFamily: MONO }}>On the guitar</div>
          <div className="flex-1" style={{ height: 1, background: "var(--t-border)" }} />
        </div>

        {tuning.name !== "Standard" && (
          <div className="text-xs" style={{ color: accent, fontFamily: MONO }} data-testid="scales-tuning-label">
            Tuning: {tuning.name} — string labels updated
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-1.5">
          {([["full", "Full neck"], ["position", "Position view"]] as const).map(([v, label]) => {
            const on = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                style={{ fontFamily: MONO, background: on ? accent : "var(--t-el-low)", color: on ? "#111" : "var(--t-text4)", border: `1px solid ${on ? accent : "var(--t-border-md)"}` }}
                data-testid={`scale-view-${v}`}>{label}</button>
            );
          })}
        </div>

        <div className="rounded-2xl px-3 py-3" style={{ background: "var(--t-card)", border: "1px solid var(--t-border)" }}>
          <FretboardDiagram
            mode="scale" tuning={tuning} accent={accent}
            scaleNotes={notes} rootNote={root}
            viewType={view} positionIndex={posIdx} onPositionChange={setPosIdx}
          />
        </div>

        {view === "position" && (
          <div className="flex flex-col gap-1">
            <div className="text-xs text-center font-bold" style={{ color: "var(--t-text3)", fontFamily: MONO }}>
              Position {Math.min(posIdx, Math.max(positions.length - 1, 0)) + 1} of {positions.length}
            </div>
            <div className="text-xs text-center" style={{ color: "var(--t-text5)" }}>
              Each position is one hand position on the neck
            </div>
          </div>
        )}
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
