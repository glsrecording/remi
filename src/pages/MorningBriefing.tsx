import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Sun, RefreshCw, Calendar, CheckSquare, CreditCard, Sparkles, Mail } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

const CACHE_KEY_DATA = "remi_briefing_data";
const CACHE_KEY_DATE = "remi_briefing_date";

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const today = new Date();
const dateLabel = today.toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric",
});

type CalItem   = { time: string; title: string };
type TaskItem  = { id: string; title: string; url: string };
type BillItem  = { name: string; due: string; auto: boolean };
type EmailItem = { subject: string; sender: string; thread_id: string };
type BriefingData = {
  calendar: CalItem[];
  emails:   EmailItem[];
  tasks: { today: TaskItem[]; tonight: TaskItem[]; tomorrow: TaskItem[] };
  bills: BillItem[];
};

export default function MorningBriefing() {
  const [, navigate] = useLocation();
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const scrollRef = useRef<HTMLDivElement>(null);
  useGutterScroll(scrollRef);
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState<BriefingData | null>(() => {
    const cachedDate = localStorage.getItem(CACHE_KEY_DATE);
    const cachedData = localStorage.getItem(CACHE_KEY_DATA);
    if (cachedDate === todayDateStr() && cachedData) {
      try { return JSON.parse(cachedData); } catch {}
    }
    return null;
  });
  const [error, setError]             = useState<string | null>(null);

  const handleRequest = () => {
    setLoading(true);
    setError(null);
    fetch(`${JARVIS_URL}/morning-briefing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REMI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((payload: BriefingData) => {
        localStorage.setItem(CACHE_KEY_DATE, todayDateStr());
        localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(payload));
        setData(payload);
        setLoading(false);
      })
      .catch(() => {
        setError("Briefing unavailable — tap to retry");
        setLoading(false);
      });
  };

  const handleRefresh = () => {
    localStorage.removeItem(CACHE_KEY_DATE);
    localStorage.removeItem(CACHE_KEY_DATA);
    setData(null);
    setError(null);
    handleRequest();
  };

  const allTasks = [
    ...(data?.tasks.today   ?? []),
    ...(data?.tasks.tonight ?? []),
    ...(data?.tasks.tomorrow ?? []),
  ];

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
          Morning Briefing
        </span>
        {data && (
          <button
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
            onClick={handleRefresh}
            data-testid="button-clear-briefing"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-6 space-y-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        {!data && !error ? (
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
          </div>
        ) : error ? (
          /* Error state */
          <div className="flex flex-col items-center justify-center h-full gap-6 -mt-6">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.1)", border: "1.5px solid rgba(239,68,68,0.2)" }}
            >
              <Sun size={34} className="text-red-400/60" />
            </div>
            <p className="text-sm text-white/50 text-center max-w-xs">{error}</p>
            <button
              className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-semibold transition-all active:scale-[0.97]"
              style={{ background: remiColor, color: "#111111" }}
              onClick={handleRequest}
              disabled={loading}
              data-testid="button-retry-briefing"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Retrying…
                </>
              ) : (
                <>
                  <RefreshCw size={18} />
                  Retry
                </>
              )}
            </button>
          </div>
        ) : (
          /* Live briefing content */
          <div className="space-y-6 overlay-fade-in">
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
              {data!.calendar.length === 0 ? (
                <p className="text-xs text-white/25 px-1">No events today</p>
              ) : (
                data!.calendar.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/5"
                    style={{ background: "var(--t-card)" }}
                    data-testid={`calendar-item-${i}`}
                  >
                    <span
                      className="text-xs font-mono mt-0.5 shrink-0"
                      style={{ color: remiColor, opacity: 0.7 }}
                    >
                      {item.time}
                    </span>
                    <p className="text-sm text-white/85 font-medium leading-snug">{item.title}</p>
                  </div>
                ))
              )}
            </div>

            {/* Emails */}
            {(data!.emails ?? []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail size={13} style={{ color: remiColor }} />
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: remiColor }}>
                    Inbox
                  </p>
                </div>
                {data!.emails.map((item, i) => (
                  <a
                    key={i}
                    href={`https://mail.google.com/mail/u/0/#inbox/${item.thread_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/5 transition-opacity active:opacity-60"
                    style={{ background: "var(--t-card)", display: "flex", textDecoration: "none" }}
                    data-testid={`email-item-${i}`}
                  >
                    <span
                      className="text-xs font-mono mt-0.5 shrink-0 max-w-[72px] truncate"
                      style={{ color: remiColor, opacity: 0.7 }}
                    >
                      {item.sender}
                    </span>
                    <p className="text-sm font-medium leading-snug flex-1 min-w-0" style={{ color: "var(--t-text2)" }}>
                      {item.subject}
                    </p>
                  </a>
                ))}
              </div>
            )}

            {/* Tasks */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckSquare size={13} style={{ color: remiColor }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: remiColor }}>
                  Due Today
                </p>
              </div>
              {allTasks.length === 0 ? (
                <p className="text-xs text-white/25 px-1">No tasks due today</p>
              ) : (
                allTasks.map((task, i) => (
                  <div
                    key={task.id || i}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl border border-white/5"
                    style={{ background: "var(--t-card)" }}
                    data-testid={`task-item-${i}`}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                      style={{ background: "rgba(255,255,255,0.2)" }}
                    />
                    <p className="text-sm text-white/80 leading-snug">{task.title}</p>
                  </div>
                ))
              )}
            </div>

            {/* Bills */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard size={13} style={{ color: remiColor }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: remiColor }}>
                  Bills This Week
                </p>
              </div>
              {data!.bills.length === 0 ? (
                <p className="text-xs text-white/25 px-1">No bills due in the next 14 days</p>
              ) : (
                data!.bills.map((bill, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/5"
                    style={{ background: "var(--t-card)" }}
                    data-testid={`bill-item-${i}`}
                  >
                    <div>
                      <p className="text-sm text-white/80">{bill.name}</p>
                      {bill.auto && (
                        <p className="text-xs text-white/25 mt-0.5">Auto-pay</p>
                      )}
                    </div>
                    <p className="text-xs text-white/40 shrink-0 ml-3">{bill.due}</p>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "var(--t-card)" }}>
              <Sparkles size={13} className="text-white/20 shrink-0" />
              <p className="text-xs text-white/25">Live data from Jarvis</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
