import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Sun, RefreshCw, Calendar, CheckSquare, CreditCard, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";

const today = new Date();
const dateLabel = today.toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric",
});

const SAMPLE_BRIEFING = {
  calendar: [
    { time: "10:00 AM", title: "Mix session — Kayla EP", detail: "Studio A · 2 hrs" },
    { time: "1:30 PM", title: "Call with Marcus (management)", detail: "Phone · 30 min" },
    { time: "4:00 PM", title: "Vocal tracking — Midnight Drive", detail: "Home studio · 3 hrs" },
  ],
  tasks: [
    { text: "Send stems to mastering engineer by EOD", priority: "high" },
    { text: "Reply to venue booking email — Northside show", priority: "normal" },
  ],
  bills: [
    { name: "Studio Pro subscription", amount: "$49", due: "in 3 days" },
  ],
};

export default function MorningBriefing() {
  const [, navigate] = useLocation();
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [showBriefing, setShowBriefing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [briefingResponse, setBriefingResponse] = useState<string | null>(null);

  const handleRequest = () => {
    setLoading(true);
    fetch("https://jarvis.joshhollandgls.com/remi", {
      method: "POST",
      headers: {
        "Authorization": "Bearer ea3c450fda7c377d24e0f5de6d0e8f7ebc6dfa9a3ab90f6b5c2bf45ff7a3d411",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "morning briefing", user_id: "remi" }),
    })
      .then((r) => r.json())
      .then((data) => {
        setLoading(false);
        setBriefingResponse(data.response ?? null);
        setShowBriefing(true);
      })
      .catch(() => {
        setLoading(false);
        setBriefingResponse("Sorry, couldn't fetch the morning briefing.");
        setShowBriefing(true);
      });
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#232323" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background: "#1a1a1a",
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
          Morning Briefing
        </span>
        {showBriefing && (
          <button
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
            onClick={() => { setShowBriefing(false); }}
            data-testid="button-clear-briefing"
          >
            <RefreshCw size={12} />
            Reset
          </button>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto px-5 py-6 space-y-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        {!showBriefing ? (
          /* Pre-briefing state */
          <div className="flex flex-col items-center justify-center h-full gap-6 -mt-6">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: remiColor + "15", border: `1.5px solid ${remiColor}25` }}
            >
              <Sun size={34} style={{ color: remiColor }} />
            </div>

            <div className="text-center">
              <p className="text-base font-semibold text-white/80 mb-1">
                {today.toLocaleDateString("en-US", { weekday: "long" })}
              </p>
              <p className="text-sm text-white/35">
                {today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>

            <button
              className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-semibold transition-all active:scale-[0.97]"
              style={{ background: remiColor, color: "#111111" }}
              onClick={handleRequest}
              disabled={loading}
              data-testid="button-request-briefing"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Fetching briefing…
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Request Briefing
                </>
              )}
            </button>

            <p className="text-xs text-white/20 text-center max-w-xs">
              Connects to Jarvis for live data — showing sample layout
            </p>
          </div>
        ) : (
          /* Briefing content */
          <div className="space-y-6 overlay-fade-in">
            {briefingResponse && (
              <div className="p-4 rounded-2xl border border-white/5" style={{ background: "#1e1e1e" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert max-w-none">
                  {briefingResponse}
                </ReactMarkdown>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "#1e1e1e" }}>
              <Sparkles size={13} className="text-white/20 shrink-0" />
              <p className="text-xs text-white/25">Live briefing loaded from Jarvis</p>
            </div>
            {/* Date header */}
            <div
              className="px-4 py-3 rounded-2xl flex items-center gap-3"
              style={{ background: remiColor + "12", border: `1px solid ${remiColor}20` }}
            >
              <Sun size={18} style={{ color: remiColor }} />
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest">Today</p>
                <p className="text-sm font-semibold text-white/90">{dateLabel}</p>
              </div>
            </div>

            {/* Calendar */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar size={13} style={{ color: remiColor }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: remiColor }}>
                  Schedule
                </p>
              </div>
              {SAMPLE_BRIEFING.calendar.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/5"
                  style={{ background: "#333333" }}
                  data-testid={`calendar-item-${i}`}
                >
                  <span
                    className="text-xs font-mono mt-0.5 shrink-0"
                    style={{ color: remiColor, opacity: 0.7 }}
                  >
                    {item.time}
                  </span>
                  <div>
                    <p className="text-sm text-white/85 font-medium leading-snug">{item.title}</p>
                    <p className="text-xs text-white/35 mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tasks due today */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckSquare size={13} style={{ color: remiColor }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: remiColor }}>
                  Due Today
                </p>
              </div>
              {SAMPLE_BRIEFING.tasks.map((task, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/5"
                  style={{ background: "#333333" }}
                  data-testid={`task-item-${i}`}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: task.priority === "high" ? "#ef4444" : "rgba(255,255,255,0.2)" }}
                  />
                  <p className="text-sm text-white/80 leading-snug">{task.text}</p>
                </div>
              ))}
            </div>

            {/* Bills */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard size={13} style={{ color: remiColor }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: remiColor }}>
                  Bills This Week
                </p>
              </div>
              {SAMPLE_BRIEFING.bills.map((bill, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/5"
                  style={{ background: "#333333" }}
                  data-testid={`bill-item-${i}`}
                >
                  <p className="text-sm text-white/80">{bill.name}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold" style={{ color: remiColor }}>{bill.amount}</p>
                    <p className="text-xs text-white/30">{bill.due}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Jarvis note */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "#1e1e1e" }}>
              <Sparkles size={13} className="text-white/20 shrink-0" />
              <p className="text-xs text-white/25">Sample layout — live data from Jarvis coming soon</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
