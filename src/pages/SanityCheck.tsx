import { useState, useEffect, useCallback } from "react";
import { Send, Loader2, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const ACCENT       = "#a78bfa";   // sanity-check screen accent (Claude purple)
const RECENT_KEY   = "sanity_check_recent";

// Per-model brand colors (spec).
const MODEL_COLORS: Record<string, string> = {
  Claude:  "#a78bfa",
  ChatGPT: "#4ade80",
  Gemini:  "#60a5fa",
  Grok:    "#fb923c",
};
const MODEL_ORDER = ["Claude", "ChatGPT", "Gemini", "Grok"];

interface ModelResponse {
  name: string;
  response: string;
  error: string | null;
}
interface Synthesis {
  consensus: string;
  disagreements: string;
  blind_spots: string;
  recommended_direction: string;
}
interface SanityResult {
  question: string;
  models: ModelResponse[];
  synthesis: Synthesis;
  timestamp: string;
}
interface RecentEntry {
  question: string;
  timestamp: string;
  synthesis: Synthesis;
}

function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecent(entries: RecentEntry[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, 10)));
  } catch {
    /* localStorage full / unavailable — non-fatal */
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        },
        () => {},
      );
    },
    [text],
  );
  return (
    <button
      onClick={onCopy}
      className="p-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0"
      style={{ color: copied ? "#22c55e" : "var(--t-text6)" }}
      title="Copy"
      data-testid="button-copy"
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

function SynthesisSection({ title, body }: { title: string; body: string }) {
  if (!body || !body.trim()) return null;
  return (
    <div className="mb-4">
      <div
        className="text-xs font-bold tracking-widest uppercase mb-1.5"
        style={{ color: ACCENT }}
      >
        {title}
      </div>
      <p
        className="text-sm leading-relaxed whitespace-pre-wrap"
        style={{ color: "var(--t-text2)" }}
      >
        {body.trim()}
      </p>
    </div>
  );
}

function ModelCard({ model }: { model: ModelResponse }) {
  const [open, setOpen] = useState(false);
  const color = MODEL_COLORS[model.name] || "var(--t-text3)";
  const isError = !!model.error;
  const firstLines = (model.response || "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 2)
    .join("\n");

  return (
    <div
      className="rounded-2xl border mb-3"
      style={{
        background: "var(--t-surface)",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((v) => !v)}
        data-testid={`model-card-${model.name.toLowerCase()}`}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: color, opacity: isError ? 0.4 : 1 }}
        />
        <span
          className="text-sm font-bold tracking-wide flex-1"
          style={{ color, fontFamily: "'Space Mono', monospace" }}
        >
          {model.name}
          {isError && (
            <span className="ml-2 text-xs font-normal" style={{ color: "var(--t-text6)" }}>
              unavailable
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp size={16} style={{ color: "var(--t-text6)" }} />
        ) : (
          <ChevronDown size={16} style={{ color: "var(--t-text6)" }} />
        )}
      </button>

      {!open && (
        <p
          className="px-4 pb-3.5 text-xs leading-relaxed whitespace-pre-wrap line-clamp-2"
          style={{ color: "var(--t-text5)" }}
        >
          {firstLines}
        </p>
      )}

      {open && (
        <div className="px-4 pb-4">
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: isError ? "var(--t-text6)" : "var(--t-text2)" }}
          >
            {model.response}
          </p>
          <div className="flex justify-end mt-2">
            <CopyButton text={model.response} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function SanityCheck() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SanityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const submit = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`${JARVIS_URL}/remi`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REMI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: `sanity check: ${q}`, user_id: "remi", history: [] }),
      });
      const data = await resp.json();
      const card = data.card;
      if (!card || card.type !== "sanity_check") {
        setError("The team didn't return a result. Check Jarvis logs.");
        setLoading(false);
        return;
      }
      const r: SanityResult = {
        question: card.question ?? q,
        models: Array.isArray(card.models) ? card.models : [],
        synthesis: card.synthesis ?? {
          consensus: "",
          disagreements: "",
          blind_spots: "",
          recommended_direction: "",
        },
        timestamp: card.timestamp ?? new Date().toISOString(),
      };
      setResult(r);
      const entry: RecentEntry = {
        question: r.question,
        timestamp: r.timestamp,
        synthesis: r.synthesis,
      };
      const next = [entry, ...loadRecent()].slice(0, 10);
      saveRecent(next);
      setRecent(next);
    } catch {
      setError("Couldn't reach Jarvis. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [question, loading]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  // Order model cards consistently (Claude, ChatGPT, Gemini, Grok), unknowns last.
  const orderedModels = result
    ? [...result.models].sort(
        (a, b) =>
          (MODEL_ORDER.indexOf(a.name) + 1 || 99) - (MODEL_ORDER.indexOf(b.name) + 1 || 99),
      )
    : [];

  return (
    <div className="flex flex-col h-[100dvh]" style={{ background: "var(--t-bg)" }}>
      <PageHeader title="Sanity Check" color={ACCENT} onMenu={() => setMenuOpen(true)} />
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto">
          {/* ── Input ─────────────────────────────────────────────── */}
          <div
            className="rounded-2xl border p-3 mb-5"
            style={{ background: "var(--t-surface)", borderColor: "rgba(255,255,255,0.06)" }}
          >
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What do you want the team to look at?"
              rows={3}
              className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed"
              style={{ color: "var(--t-text2)" }}
              data-testid="input-question"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs" style={{ color: "var(--t-text6)" }}>
                4 models · synthesized
              </span>
              <button
                onClick={submit}
                disabled={loading || !question.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: loading || !question.trim() ? "rgba(167,139,250,0.15)" : ACCENT,
                  color: loading || !question.trim() ? "var(--t-text6)" : "#1a1a1a",
                }}
                data-testid="button-send"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {loading ? "Convening…" : "Send"}
              </button>
            </div>
          </div>

          {/* ── Loading: pulsing model labels ─────────────────────── */}
          {loading && (
            <div className="flex flex-wrap gap-2 mb-5">
              {MODEL_ORDER.map((name, i) => (
                <div
                  key={name}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl animate-pulse"
                  style={{
                    background: "var(--t-surface)",
                    border: `1px solid ${MODEL_COLORS[name]}33`,
                    animationDelay: `${i * 150}ms`,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: MODEL_COLORS[name] }}
                  />
                  <span
                    className="text-xs font-bold tracking-wide"
                    style={{ color: MODEL_COLORS[name], fontFamily: "'Space Mono', monospace" }}
                  >
                    {name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
              data-testid="error-banner"
            >
              {error}
            </div>
          )}

          {/* ── Results: synthesis card + model cards ─────────────── */}
          {result && (
            <div data-testid="results">
              {/* Synthesis — most prominent */}
              <div
                className="rounded-2xl border-2 p-5 mb-5"
                style={{
                  background: "linear-gradient(180deg, rgba(167,139,250,0.06), transparent)",
                  borderColor: `${ACCENT}55`,
                }}
                data-testid="synthesis-card"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div
                      className="text-sm font-bold tracking-widest uppercase"
                      style={{ color: ACCENT, fontFamily: "'Space Mono', monospace" }}
                    >
                      Synthesis
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--t-text5)" }}>
                      {result.question}
                    </p>
                  </div>
                  <CopyButton
                    text={[
                      `CONSENSUS\n${result.synthesis.consensus}`,
                      `DISAGREEMENTS\n${result.synthesis.disagreements}`,
                      `BLIND SPOTS\n${result.synthesis.blind_spots}`,
                      `RECOMMENDED DIRECTION\n${result.synthesis.recommended_direction}`,
                    ].join("\n\n")}
                  />
                </div>
                <SynthesisSection title="Consensus" body={result.synthesis.consensus} />
                <SynthesisSection title="Disagreements" body={result.synthesis.disagreements} />
                <SynthesisSection title="Blind Spots" body={result.synthesis.blind_spots} />
                <SynthesisSection
                  title="Recommended Direction"
                  body={result.synthesis.recommended_direction}
                />
              </div>

              {/* Individual model responses */}
              <div className="text-xs font-bold tracking-widest uppercase mb-2.5 px-1" style={{ color: "var(--t-text6)" }}>
                The Panel
              </div>
              {orderedModels.map((m) => (
                <ModelCard key={m.name} model={m} />
              ))}
            </div>
          )}

          {/* ── Recent ────────────────────────────────────────────── */}
          {!loading && recent.length > 0 && (
            <div className="mt-7">
              <div
                className="text-xs font-bold tracking-widest uppercase mb-2.5 px-1"
                style={{ color: "var(--t-text6)" }}
              >
                Recent
              </div>
              {recent.slice(0, 3).map((r, i) => (
                <button
                  key={`${r.timestamp}-${i}`}
                  onClick={() => setQuestion(r.question)}
                  className="w-full text-left rounded-xl border px-4 py-3 mb-2 transition-colors hover:bg-white/[0.02]"
                  style={{ background: "var(--t-surface)", borderColor: "rgba(255,255,255,0.05)" }}
                  data-testid={`recent-${i}`}
                >
                  <p className="text-sm font-medium line-clamp-1" style={{ color: "var(--t-text3)" }}>
                    {r.question}
                  </p>
                  {r.synthesis?.recommended_direction && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--t-text6)" }}>
                      {r.synthesis.recommended_direction}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
