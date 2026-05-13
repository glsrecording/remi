import { useLocation } from "wouter";
import { ArrowLeft, BarChart2, Zap, Target, Clock, TrendingUp, Lock } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";

const PREVIEW_ITEMS = [
  {
    icon: Zap,
    label: "Daily Points",
    description: "Points earned across all tasks logged today — sessions, mix notes, brain dumps, and wrap-ups.",
  },
  {
    icon: Target,
    label: "Goal vs. Actual",
    description: "Your daily target vs. what actually got done — by category and total.",
  },
  {
    icon: Clock,
    label: "Studio Hours",
    description: "Tracked time broken down by client, project, or session type from your timer app.",
  },
  {
    icon: TrendingUp,
    label: "Weekly Streak",
    description: "Consecutive days you hit your daily point goal — resets on a missed day.",
  },
];

export default function Scorecard() {
  const [, navigate] = useLocation();
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");

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
          className="text-base font-bold tracking-tight"
          style={{ fontFamily: "'Space Mono', monospace", color: remiColor }}
        >
          Scorecard
        </span>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto px-5 py-8 flex flex-col gap-7"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        {/* Hero badge */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center relative"
            style={{ background: remiColor + "12", border: `1.5px solid ${remiColor}25` }}
          >
            <BarChart2 size={34} style={{ color: remiColor, opacity: 0.5 }} />
            <div
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: "var(--t-bg)", border: `1px solid var(--t-border-md)` }}
            >
              <Lock size={11} className="text-white/30" />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white/80 mb-1">Scorecard connects to Jarvis</h2>
            <p className="text-sm text-white/40 leading-relaxed max-w-xs mx-auto">
              Full scoring, streaks, and daily performance data will live here once the Jarvis integration is live.
            </p>
          </div>

          {/* Coming soon pill */}
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: remiColor + "15", border: `1px solid ${remiColor}30` }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: remiColor }}
            />
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: remiColor }}>
              Coming soon
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-white/5" />

        {/* Preview of what's coming */}
        <div className="space-y-3">
          <p className="text-xs text-white/25 uppercase tracking-widest">What you'll see when live</p>

          {PREVIEW_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex items-start gap-4 px-4 py-4 rounded-2xl border border-white/5"
                style={{ background: "var(--t-card)" }}
                data-testid={`preview-item-${item.label.toLowerCase().replace(/ /g, "-")}`}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: remiColor + "12" }}
                >
                  <Icon size={16} style={{ color: remiColor, opacity: 0.6 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/70 mb-0.5">{item.label}</p>
                  <p className="text-xs text-white/35 leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
