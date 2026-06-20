/* ──────────────────────────────────────────────────────────────────────────
   FretboardDiagram — reusable SVG fretboard / piano for Composing Tools.
   Session 2 of 3. Used by Chord Explorer and Scales & Modes (and Chord Draw
   in Session 3). Pure rendering + math — no fetch, no state ownership beyond
   internal layout. All neck math uses the passed-in tuning; nothing about the
   string notes is hardcoded.
   ────────────────────────────────────────────────────────────────────────── */

import { useId } from "react";

const MONO = "'Space Mono', monospace";
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Lighten a #rrggbb hex by `amount` per channel (Part 2 dot gradients).
function lightenColor(hex: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex; // pass through CSS vars / non-hex
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export interface GuitarTuning {
  name: string;
  strings: number[]; // 6 semitone values (C=0), index 0 = lowest string … 5 = highest
}

export interface ChordDot {
  string: number; // 0 = lowest string in the current tuning, 5 = highest
  fret: number;   // 0 = open
  isRoot?: boolean;
}

export interface FretboardDiagramProps {
  mode: "scale" | "chord";
  tuning: GuitarTuning;
  accent?: string;               // root-note / chord-root color (default green)
  characteristicColor?: string;  // modal "key"-note color (default amber)

  // scale mode
  scaleNotes?: string[];
  rootNote?: string;
  characteristicNotes?: string[]; // modal "key" notes
  viewType?: "full" | "position";
  positionIndex?: number;
  onPositionChange?: (index: number) => void;

  // chord mode
  chordDots?: ChordDot[];
  startFret?: number;
  openStrings?: number[];
  mutedStrings?: number[];
  instrument?: "guitar" | "piano";
  chordNotes?: string[];
}

// ── shared math ───────────────────────────────────────────────────────────────
export function noteName(semitone: number): string {
  return NOTE_NAMES[((semitone % 12) + 12) % 12];
}

// 5 hand positions for a scale in a given tuning: top-5 densest 5-fret windows.
export function getScalePositions(scaleNotes: string[], tuning: GuitarTuning): number[] {
  const counts: { start: number; c: number }[] = [];
  for (let start = 0; start <= 8; start++) {
    let c = 0;
    for (let s = 0; s < 6; s++) {
      for (let f = start; f <= start + 4; f++) {
        if (scaleNotes.includes(noteName(tuning.strings[s] + f))) c++;
      }
    }
    counts.push({ start, c });
  }
  counts.sort((a, b) => b.c - a.c || a.start - b.start);
  return counts.slice(0, 5).map((x) => x.start).sort((a, b) => a - b);
}

// Chord templates (interval set from root) for recognising what a shape produces.
const CHORD_TEMPLATES: { ivals: number[]; suffix: string }[] = [
  { ivals: [0, 4, 7], suffix: "" },
  { ivals: [0, 3, 7], suffix: "m" },
  { ivals: [0, 3, 6], suffix: "°" },
  { ivals: [0, 4, 8], suffix: "+" },
  { ivals: [0, 2, 7], suffix: "sus2" },
  { ivals: [0, 5, 7], suffix: "sus4" },
  { ivals: [0, 4, 7, 11], suffix: "maj7" },
  { ivals: [0, 3, 7, 10], suffix: "m7" },
  { ivals: [0, 4, 7, 10], suffix: "7" },
  { ivals: [0, 3, 6, 10], suffix: "m7b5" },
  { ivals: [0, 3, 6, 9], suffix: "dim7" },
  { ivals: [0, 4, 7, 9], suffix: "6" },
  { ivals: [0, 3, 7, 9], suffix: "m6" },
  { ivals: [0, 2, 4, 7], suffix: "add9" },
];

// Best chord name for a set of pitch classes; prefers a root that is the bass.
export function recognizeChordName(pcs: number[], bassPc: number): string | null {
  const set = Array.from(new Set(pcs.map((p) => ((p % 12) + 12) % 12))).sort((a, b) => a - b);
  const matches: { root: number; suffix: string }[] = [];
  for (const root of set) {
    const ivals = set.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    for (const t of CHORD_TEMPLATES) {
      if (ivals.length === t.ivals.length && ivals.every((v, i) => v === t.ivals[i])) {
        matches.push({ root, suffix: t.suffix });
      }
    }
  }
  if (!matches.length) return null;
  const best = matches.find((m) => m.root === bassPc) || matches[0];
  return noteName(best.root) + best.suffix;
}

// ════════════════════════════════════════════════════════════════════════════
export function FretboardDiagram(props: FretboardDiagramProps) {
  if (props.mode === "chord" && props.instrument === "piano") return <PianoBoard {...props} />;
  if (props.mode === "chord") return <ChordBoard {...props} />;
  return <ScaleBoard {...props} />;
}

// ── SCALE NECK (horizontal) ─────────────────────────────────────────────────
function ScaleBoard(props: FretboardDiagramProps) {
  const { tuning, accent = "#22c55e", scaleNotes = [], rootNote, characteristicNotes = [], viewType = "full" } = props;
  const CHAR_COLOR = props.characteristicColor ?? "#f59e0b"; // modal characteristic ("key") note color
  const uid = useId().replace(/:/g, ""); // unique gradient/filter ids per instance
  const positions = viewType === "position" ? getScalePositions(scaleNotes, tuning) : [];
  const posLen = positions.length || 1;
  const idx = Math.min(Math.max(props.positionIndex ?? 0, 0), posLen - 1);
  const start = viewType === "position" ? (positions[idx] ?? 0) : 0;

  const frets: number[] = [];
  if (viewType === "full") {
    for (let f = 0; f <= 24; f++) frets.push(f); // full 24-fret neck
  } else {
    for (let f = start; f <= start + 4; f++) frets.push(f);
  }

  const big = viewType === "position";
  const labelW = 22;
  const colW = big ? 46 : 26; // full neck compressed to fit all 24 frets
  const rowH = big ? 24 : 20;
  const topPad = 26; // headroom so fret-number labels sit above the neck, clear of dots
  const dotR = big ? 10 : 8;
  const boardLeft = labelW;
  const boardTop = topPad;
  const nCols = frets.length;
  const vbW = boardLeft + nCols * colW + 8;
  const vbH = boardTop + 5 * rowH + 14;

  const colIndex = (f: number) => frets.indexOf(f);
  const cx = (f: number) => boardLeft + (colIndex(f) + 0.5) * colW;
  const cy = (s: number) => boardTop + (5 - s) * rowH; // high string on top
  const hasOpenCol = frets[0] === 0;

  const dots: { s: number; f: number; root: boolean; char: boolean; name: string }[] = [];
  for (let s = 0; s < 6; s++) {
    for (const f of frets) {
      const nm = noteName(tuning.strings[s] + f);
      if (!scaleNotes.includes(nm)) continue;
      const root = !!rootNote && nm === rootNote;
      // Root treatment wins if a note is both root and characteristic.
      const char = !root && characteristicNotes.includes(nm);
      dots.push({ s, f, root, char, name: nm });
    }
  }

  // Standard guitar inlays across a 24-fret neck (13–24 mirror 1–12).
  const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
  const DOUBLE_INLAYS = [12, 24];
  // At compressed full-neck spacing, only label inlay frets to avoid crowding.
  const FRET_LABELS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto no-scrollbar" style={{ width: "100%" }}>
        {/* width:100% fills the container; minWidth keeps a 1:1 floor so note dots
            never shrink below ~13px — all 24 frets show at once on wide screens,
            and the neck scrolls horizontally on narrow phones (Option A→B fallback). */}
        <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%"
          style={{ display: "block", height: "auto", minWidth: viewType === "full" ? vbW : undefined }}>
        <defs>
          <radialGradient id={`rootGrad-${uid}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor={lightenColor(accent, 30)} />
            <stop offset="100%" stopColor={accent} />
          </radialGradient>
          <radialGradient id={`charGrad-${uid}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor={lightenColor(CHAR_COLOR, 30)} />
            <stop offset="100%" stopColor={CHAR_COLOR} />
          </radialGradient>
          <filter id={`rootGlow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`charGlow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* fret numbers — own row above the neck, high contrast (inlay frets brightest) */}
        {frets.map((f) =>
          f >= 1 && (viewType !== "full" || FRET_LABELS.includes(f)) ? (
            <text key={`fn-${f}`} x={cx(f)} y={topPad - 14} textAnchor="middle"
              fontFamily={MONO} fontSize="9" fontWeight="700"
              fill={SINGLE_INLAYS.includes(f) || DOUBLE_INLAYS.includes(f) ? "var(--t-text)" : "var(--t-text2)"}>{f}</text>
          ) : null,
        )}
        {/* inlay dots */}
        {frets.map((f) =>
          DOUBLE_INLAYS.includes(f) ? (
            <g key={`in-${f}`}>
              <circle cx={cx(f)} cy={boardTop + 1.5 * rowH} r="2.5" fill="var(--t-border-lg)" />
              <circle cx={cx(f)} cy={boardTop + 3.5 * rowH} r="2.5" fill="var(--t-border-lg)" />
            </g>
          ) : SINGLE_INLAYS.includes(f) ? (
            <circle key={`in-${f}`} cx={cx(f)} cy={boardTop + 2.5 * rowH} r="2.5" fill="var(--t-border-lg)" />
          ) : null,
        )}
        {/* strings */}
        {Array.from({ length: 6 }).map((_, s) => (
          <line key={`str-${s}`} x1={boardLeft} y1={cy(s)} x2={boardLeft + nCols * colW} y2={cy(s)}
            stroke="var(--t-border)" strokeWidth="1" />
        ))}
        {/* string labels */}
        {Array.from({ length: 6 }).map((_, s) => (
          <text key={`lbl-${s}`} x={boardLeft - 4} y={cy(s) + 3} textAnchor="end"
            fontFamily={MONO} fontSize="9" fill="var(--t-text5)">{noteName(tuning.strings[s])}</text>
        ))}
        {/* fret lines */}
        {Array.from({ length: nCols + 1 }).map((_, i) => {
          const x = boardLeft + i * colW;
          const isNut = hasOpenCol && i === 1;
          return <line key={`fl-${i}`} x1={x} y1={boardTop} x2={x} y2={boardTop + 5 * rowH}
            stroke={isNut ? "var(--t-text)" : "var(--t-border)"} strokeWidth={isNut ? 3 : 1} />;
        })}
        {/* start fret label when not showing the nut */}
        {!hasOpenCol && (
          <text x={boardLeft + colW * 0.5} y={boardTop + 5 * rowH + 11} textAnchor="middle"
            fontFamily={MONO} fontSize="8" fill="var(--t-text5)">{start}fr</text>
        )}
        {/* note dots — root (accent gradient + glow) > characteristic (amber gradient + soft glow) > other (flat gray) */}
        {dots.map((d, i) => {
          const fill = d.root ? `url(#rootGrad-${uid})` : d.char ? `url(#charGrad-${uid})` : "var(--t-text2)";
          const stroke = d.root ? accent : d.char ? CHAR_COLOR : "var(--t-border-lg)";
          const filter = d.root ? `url(#rootGlow-${uid})` : d.char ? `url(#charGlow-${uid})` : undefined;
          return (
            <g key={`d-${i}`}>
              <circle cx={cx(d.f)} cy={cy(d.s)} r={d.root ? dotR : dotR - 1.5}
                fill={fill} stroke={stroke} strokeWidth="1" filter={filter} />
              <text x={cx(d.f)} y={cy(d.s) + 3} textAnchor="middle" fontFamily={MONO}
                fontSize="9" fontWeight="700" fill="#111">{d.name}</text>
            </g>
          );
        })}
        </svg>
      </div>

      {viewType === "position" && (
        <div className="flex items-center justify-between">
          <button onClick={() => props.onPositionChange?.((idx + posLen - 1) % posLen)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
            style={{ fontFamily: MONO, background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
            data-testid="fb-prev">← Prev</button>
          <div className="flex items-center gap-1.5">
            {positions.map((_, i) => (
              <span key={i} style={{
                width: 7, height: 7, borderRadius: 99,
                background: i === idx ? accent : "var(--t-border-lg)",
              }} />
            ))}
          </div>
          <button onClick={() => props.onPositionChange?.((idx + 1) % posLen)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
            style={{ fontFamily: MONO, background: "var(--t-el-low)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
            data-testid="fb-next">Next →</button>
        </div>
      )}
      {viewType === "position" && (
        <div className="text-xs text-center" style={{ color: "var(--t-text5)", fontFamily: MONO }}>
          Frets {start}–{start + 4}
        </div>
      )}
    </div>
  );
}

// ── CHORD VOICING (vertical chart) ──────────────────────────────────────────
function ChordBoard(props: FretboardDiagramProps) {
  const { tuning, accent = "#22c55e", chordDots = [], startFret = 1, openStrings = [], mutedStrings = [] } = props;
  const stringGap = 24;
  const leftPad = 24;
  const rightPad = 14;
  const topPad = 24;
  const fretRows = 5;
  const fretRowH = 26;
  const vbW = leftPad + 5 * stringGap + rightPad;
  const boardTop = topPad;
  const vbH = boardTop + fretRows * fretRowH + 18;
  const stringX = (s: number) => leftPad + s * stringGap;
  const showNut = startFret <= 1;
  const uid = useId().replace(/:/g, "");

  // group dots by fret for barre detection
  const byFret = new Map<number, ChordDot[]>();
  for (const d of chordDots) {
    const arr = byFret.get(d.fret) || [];
    arr.push(d);
    byFret.set(d.fret, arr);
  }

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" style={{ display: "block", height: "auto", maxWidth: 220, margin: "0 auto" }}>
      <defs>
        <radialGradient id={`cRootGrad-${uid}`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor={lightenColor(accent, 30)} />
          <stop offset="100%" stopColor={accent} />
        </radialGradient>
        <radialGradient id={`cLitGrad-${uid}`} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--t-text)" stopOpacity="1" />
        </radialGradient>
        <filter id={`cRootGlow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* strings */}
      {Array.from({ length: 6 }).map((_, s) => (
        <line key={`cs-${s}`} x1={stringX(s)} y1={boardTop} x2={stringX(s)} y2={boardTop + fretRows * fretRowH}
          stroke="var(--t-border)" strokeWidth="1" />
      ))}
      {/* frets */}
      {Array.from({ length: fretRows + 1 }).map((_, j) => {
        const y = boardTop + j * fretRowH;
        const isNut = showNut && j === 0;
        return <line key={`cf-${j}`} x1={stringX(0)} y1={y} x2={stringX(5)} y2={y}
          stroke={isNut ? "var(--t-text)" : "var(--t-border)"} strokeWidth={isNut ? 3 : 1} />;
      })}
      {/* start fret label */}
      {!showNut && (
        <text x={stringX(0) - 8} y={boardTop + 0.5 * fretRowH + 3} textAnchor="end"
          fontFamily={MONO} fontSize="9" fill="var(--t-text5)">{startFret}fr</text>
      )}
      {/* open / muted markers */}
      {Array.from({ length: 6 }).map((_, s) => {
        if (openStrings.includes(s)) {
          return <text key={`o-${s}`} x={stringX(s)} y={topPad - 8} textAnchor="middle"
            fontFamily={MONO} fontSize="11" fill="var(--t-text4)">O</text>;
        }
        if (mutedStrings.includes(s)) {
          return <text key={`x-${s}`} x={stringX(s)} y={topPad - 8} textAnchor="middle"
            fontFamily={MONO} fontSize="11" fill="var(--t-text6)">×</text>;
        }
        return null;
      })}
      {/* barres — a true barre only: 3+ dots on CONSECUTIVE strings at the same,
          non-open fret. Two dots, or 3+ on non-adjacent strings, render as plain dots. */}
      {Array.from(byFret.entries()).map(([fret, arr]) => {
        if (fret === 0 || arr.length < 3) return null;
        const ss = arr.map((d) => d.string).sort((a, b) => a - b);
        const consecutive = ss.every((s, i) => i === 0 || s === ss[i - 1] + 1);
        if (!consecutive) return null;
        const lo = ss[0], hi = ss[ss.length - 1];
        const rowIdx = fret - startFret;
        const y = boardTop + (rowIdx + 0.5) * fretRowH;
        return <rect key={`bar-${fret}`} x={stringX(lo) - 7} y={y - 7} width={stringX(hi) - stringX(lo) + 14}
          height="14" rx="7" fill={accent} opacity="0.85" />;
      })}
      {/* dots — root: gradient + glow; others: subtle lit gradient (no glow) */}
      {chordDots.map((d, i) => {
        const rowIdx = d.fret - startFret;
        const y = boardTop + (rowIdx + 0.5) * fretRowH;
        return <circle key={`cd-${i}`} cx={stringX(d.string)} cy={y} r="9"
          fill={d.isRoot ? `url(#cRootGrad-${uid})` : `url(#cLitGrad-${uid})`}
          stroke="var(--t-bg)" strokeWidth="1" filter={d.isRoot ? `url(#cRootGlow-${uid})` : undefined} />;
      })}
      {/* open-note label per string (reflects current tuning) */}
      {Array.from({ length: 6 }).map((_, s) => (
        <text key={`sl-${s}`} x={stringX(s)} y={boardTop + fretRows * fretRowH + 12} textAnchor="middle"
          fontFamily={MONO} fontSize="8" fill="var(--t-text5)">{noteName(tuning.strings[s])}</text>
      ))}
    </svg>
  );
}

// ── PIANO KEYBOARD (tuning-independent) ─────────────────────────────────────
function PianoBoard(props: FretboardDiagramProps) {
  const { accent = "#22c55e", chordNotes = [] } = props;
  const notePcs = chordNotes.map((n) => NOTE_NAMES.indexOf(n)).filter((x) => x >= 0);
  const rootPc = notePcs.length ? notePcs[0] : -1;
  const litSet = new Set(notePcs);
  const uid = useId().replace(/:/g, "");

  // White keys C3 … E4
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const BLACK_AFTER: Record<number, number> = { 0: 1, 2: 3, 5: 6, 7: 8, 9: 10 }; // pc -> black pc

  type Key = { pc: number; x: number; black: boolean };
  const whites: Key[] = [];
  const blacks: Key[] = [];
  const ww = 22, wh = 92, bw = 13, bh = 56;
  let wi = 0;
  // build C3..B3 then C4..E4
  const seq: number[] = [...WHITE_PCS, 0, 2, 4]; // C3-B3, C4 D4 E4
  for (let k = 0; k < seq.length; k++) {
    const pc = seq[k];
    const x = wi * ww;
    whites.push({ pc, x, black: false });
    // black to the right, unless it's the last key in range
    if (BLACK_AFTER[pc] !== undefined && k < seq.length - 1) {
      blacks.push({ pc: BLACK_AFTER[pc], x: x + ww - bw / 2, black: true });
    }
    wi++;
  }
  const vbW = whites.length * ww;
  const vbH = wh + 4;

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} width="100%" style={{ display: "block", height: "auto", maxWidth: 360 }}>
      <defs>
        <linearGradient id={`pKey-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lightenColor(accent, 45)} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
        <linearGradient id={`pRoot-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lightenColor(accent, 75)} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      </defs>
      {whites.map((k, i) => {
        const lit = litSet.has(k.pc);
        return (
          <g key={`w-${i}`}>
            <rect x={k.x + 0.5} y={0.5} width={ww - 1} height={wh} rx="3"
              fill={lit ? (k.pc === rootPc ? `url(#pRoot-${uid})` : `url(#pKey-${uid})`) : "var(--t-card)"} stroke="var(--t-border-lg)" strokeWidth="1" />
            {lit && k.pc === rootPc && (
              <rect x={k.x + 1.5} y={1.5} width={ww - 3} height={wh - 2} rx="3"
                fill="none" stroke="#111" strokeWidth="2" />
            )}
            {lit && (
              <text x={k.x + ww / 2} y={wh - 8} textAnchor="middle" fontFamily={MONO}
                fontSize="9" fontWeight="700" fill="#111">{noteName(k.pc)}</text>
            )}
          </g>
        );
      })}
      {blacks.map((k, i) => {
        const lit = litSet.has(k.pc);
        return (
          <g key={`b-${i}`}>
            <rect x={k.x} y={0} width={bw} height={bh} rx="2"
              fill={lit ? (k.pc === rootPc ? `url(#pRoot-${uid})` : `url(#pKey-${uid})`) : "var(--t-text)"} stroke="var(--t-bg)" strokeWidth="1" />
            {lit && k.pc === rootPc && (
              <rect x={k.x + 1} y={1} width={bw - 2} height={bh - 2} rx="2"
                fill="none" stroke="#111" strokeWidth="2" />
            )}
            {lit && (
              <text x={k.x + bw / 2} y={bh - 6} textAnchor="middle" fontFamily={MONO}
                fontSize="7" fontWeight="700" fill="#111">{noteName(k.pc)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
