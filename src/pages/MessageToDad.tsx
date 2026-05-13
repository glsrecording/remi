import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, MicOff, MessageCircle, Copy, RefreshCw, Check, Clock } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";

interface DadMessage {
  id: string;
  original: string;
  condensed: string;
  timestamp: string;
  date: string;
}

const FAKE_TRANSCRIPTIONS = [
  "Hey Dad, just wanted to let you know that the studio session went really well today. We got three songs tracked and the producer said the vocals on the second one were the best he'd heard all month. I'm feeling really good about where this project is heading and wanted to share that with you.",
  "Dad I've been thinking about you a lot lately and I just wanted to check in and see how you're doing. I know things have been a bit tough lately but I'm here if you need anything at all, even just to talk.",
  "Hey so I got some exciting news today — I landed a sync deal for one of my tracks. It's going to be used in a TV show pilot. It's not huge money but it's a real credit and it means my music is getting heard by more people which is what I've been working toward.",
];

function todayStr() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MessageToDad() {
  const [, navigate] = useLocation();
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [userColor] = useLocalStorage<string>(STORAGE_KEYS.USER_COLOR, "#f59e0b");
  const [history, setHistory] = useLocalStorage<DadMessage[]>("remi:dad-messages", []);

  const [inputText, setInputText] = useState("");
  const [condensed, setCondensed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHoldStart = () => {
    holdTimer.current = setTimeout(() => setIsRecording(true), 300);
  };

  const handleHoldEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      setTimeout(() => {
        const t = FAKE_TRANSCRIPTIONS[Math.floor(Math.random() * FAKE_TRANSCRIPTIONS.length)];
        setInputText((prev) => prev ? `${prev} ${t}` : t);
        setIsTranscribing(false);
      }, 1000);
    }
  };

  const condense = async () => {
    if (!inputText.trim() || loading) return;
    setLoading(true);
    setError("");
    setCondensed("");

    try {
      const res = await fetch("/api/condense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
      }

      const data = await res.json() as { condensed: string };
      setCondensed(data.condensed);

      const entry: DadMessage = {
        id: Date.now().toString(),
        original: inputText.trim(),
        condensed: data.condensed,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        date: todayStr(),
      };
      setHistory((prev) => [entry, ...prev].slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!condensed) return;
    await navigator.clipboard.writeText(condensed).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const charCount = condensed.length;
  const charOk = charCount > 0 && charCount <= 300;

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background: "var(--t-surface)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <button
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1"
          onClick={() => navigate("/")}
          data-testid="button-back"
        >
          <ArrowLeft size={20} />
        </button>
        <span
          className="text-base font-bold tracking-tight flex-1"
          style={{ fontFamily: "'Space Mono', monospace", color: remiColor }}
        >
          Message to Dad
        </span>
        <button
          className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          onClick={() => setShowHistory((p) => !p)}
          data-testid="button-toggle-history"
        >
          <Clock size={13} />
          {history.length > 0 ? `${history.length}` : ""}
        </button>
      </div>

      {showHistory ? (
        /* History panel */
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
          <p className="text-xs text-white/25 uppercase tracking-widest">Recent messages</p>
          {history.length === 0 ? (
            <p className="text-sm text-white/30 text-center mt-8">No messages yet</p>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="px-4 py-3 rounded-xl border border-white/5 space-y-2 cursor-pointer active:scale-[0.99] transition-all"
                style={{ background: "var(--t-card)" }}
                onClick={() => { setCondensed(item.condensed); setInputText(item.original); setShowHistory(false); }}
                data-testid={`history-item-${item.id}`}
              >
                <p className="text-xs text-white/25">{item.date} · {item.timestamp}</p>
                <p className="text-sm font-medium text-white/85 leading-snug">{item.condensed}</p>
                <p className="text-xs text-white/30 line-clamp-2 italic">{item.original}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Main compose view */
        <div
          className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        >
          {/* Input area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/30 uppercase tracking-widest">What do you want to say?</p>
              {inputText.length > 0 && (
                <button
                  className="text-xs text-white/25 hover:text-white/50 transition-colors"
                  onClick={() => setInputText("")}
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type or hold the mic to speak — don't worry about length, Remi will shorten it for you…"
              rows={6}
              className="w-full bg-white/4 border border-white/8 rounded-2xl px-4 py-3.5 text-sm text-white/85 placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors resize-none leading-relaxed"
              data-testid="textarea-input"
            />

            {/* Voice row */}
            <div className="flex items-center gap-3">
              <button
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 shrink-0 ${isRecording ? "voice-button-recording" : ""}`}
                style={{
                  background: isRecording ? "#ef444415" : isTranscribing ? "#33333380" : userColor + "15",
                  border: `2px solid ${isRecording ? "#ef4444" : isTranscribing ? "rgba(255,255,255,0.08)" : userColor + "50"}`,
                }}
                onPointerDown={handleHoldStart}
                onPointerUp={handleHoldEnd}
                onPointerLeave={handleHoldEnd}
                data-testid="button-voice"
              >
                {isRecording ? (
                  <MicOff size={18} style={{ color: "#ef4444" }} />
                ) : isTranscribing ? (
                  <div className="flex gap-0.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-0.5 h-3 rounded-full wave-bar"
                        style={{ background: remiColor, animationDelay: `${(i - 1) * 0.15}s` }} />
                    ))}
                  </div>
                ) : (
                  <Mic size={18} style={{ color: userColor }} />
                )}
              </button>
              <p className="text-xs text-white/25 leading-snug">
                {isRecording ? "Recording — release to transcribe" : isTranscribing ? "Transcribing…" : "Hold to dictate instead of typing"}
              </p>
            </div>
          </div>

          {/* Condense button */}
          <button
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 text-base font-semibold transition-all active:scale-[0.97]"
            style={{
              background: inputText.trim() && !loading ? remiColor : "rgba(255,255,255,0.04)",
              color: inputText.trim() && !loading ? "#111111" : "rgba(255,255,255,0.2)",
              border: inputText.trim() && !loading ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
            onClick={condense}
            disabled={!inputText.trim() || loading}
            data-testid="button-condense"
          >
            {loading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Condensing…
              </>
            ) : (
              <>
                <MessageCircle size={18} />
                Condense for Dad
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-xl border border-red-400/20 overlay-fade-in"
              style={{ background: "#ef444412" }}>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Result */}
          {condensed && (
            <div className="space-y-3 overlay-fade-in" data-testid="result-area">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/30 uppercase tracking-widest">Ready to send</p>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-full"
                  style={{
                    background: charOk ? "#22c55e18" : "#ef444418",
                    color: charOk ? "#22c55e" : "#ef4444",
                  }}
                >
                  {charCount} chars
                </span>
              </div>

              {/* Result bubble */}
              <div
                className="px-5 py-5 rounded-2xl"
                style={{
                  background: remiColor + "12",
                  border: `1.5px solid ${remiColor}25`,
                }}
                data-testid="condensed-result"
              >
                <p
                  className="text-base leading-relaxed font-medium"
                  style={{ color: "rgba(255,255,255,0.92)", lineHeight: "1.6" }}
                >
                  {condensed}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
                  style={{ background: remiColor, color: "#111111" }}
                  onClick={handleCopy}
                  data-testid="button-copy"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all active:scale-95"
                  style={{ background: "var(--t-card)", color: "var(--t-text3)" }}
                  onClick={condense}
                  disabled={loading}
                  data-testid="button-recondense"
                >
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  Re-condense
                </button>
              </div>

              {!charOk && charCount > 0 && (
                <p className="text-xs text-orange-400/80 text-center">
                  Over 300 chars — try re-condensing for a shorter result
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
