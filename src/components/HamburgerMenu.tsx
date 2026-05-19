import { useLocation } from "wouter";
import { X, Sun, Moon, Brain, Music, Clock, BarChart2, MessageCircle, Terminal, Shuffle, Radio, BookOpen, RefreshCw, CalendarClock, ClipboardCheck, ShoppingCart, Layers } from "lucide-react";
import { useEffect } from "react";
import { useTheme } from "@/hooks/use-theme";

interface HamburgerMenuProps {
  open: boolean;
  onClose: () => void;
  onRefreshContext?: () => void;
  onWeeklyReview?: () => void;
}

const menuItems = [
  { label: "Morning Briefing", icon: Sun,    path: "/morning-briefing" },
  { label: "Song Pipeline",    icon: Layers, path: "/song-pipeline" },
  { label: "Tasks",            icon: Brain,  path: "/brain-dump" },
  { label: "Session", icon: Radio, path: "/session" },
  { label: "Triage", icon: Shuffle, path: "/triage" },
  { label: "Scheduler", icon: CalendarClock, path: "/scheduler" },
  { label: "Weekly Review", icon: ClipboardCheck, path: "#weekly-review" },
  { label: "Mix Notes", icon: Music, path: "/mix-notes" },
  { label: "Time Track", icon: Clock, path: "/time-track" },
  { label: "Scorecard", icon: BarChart2, path: "/scorecard" },
  { label: "Journal", icon: BookOpen, path: "/journal" },
  { label: "Message to Dad", icon: MessageCircle, path: "/message-to-dad" },
  { label: "Shopping List", icon: ShoppingCart, path: "/shopping-list" },
  { label: "Commands", icon: Terminal, path: "/commands" },
];

export default function HamburgerMenu({ open, onClose, onRefreshContext, onWeeklyReview }: HamburgerMenuProps) {
  const [location, navigate] = useLocation();
  const { isLight, toggleTheme } = useTheme();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleItemClick = (path: string) => {
    if (path === "#weekly-review") {
      onWeeklyReview?.();
      onClose();
      return;
    }
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 overlay-fade-in backdrop-blur-sm"
        data-testid="menu-overlay"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative z-10 flex flex-col w-72 md:w-80 h-full menu-slide-in"
        style={{ background: "var(--t-surface)" }}
        data-testid="hamburger-menu"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-white/5"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
        >
          <button
            className="text-xl font-bold tracking-tight text-left"
            style={{ fontFamily: "'Space Mono', monospace", color: "#f59e0b" }}
            onClick={() => { navigate("/"); onClose(); }}
          >
            Remi
          </button>
          <div className="flex items-center gap-1">
            {/* Light/dark toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
              style={{ color: "var(--t-text6)" }}
              title={isLight ? "Switch to dark mode" : "Switch to light mode"}
              data-testid="button-theme-toggle"
            >
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
              style={{ color: "var(--t-text5)" }}
              onClick={onClose}
              data-testid="button-close-menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path && item.path !== "/";
            return (
              <button
                key={item.label}
                className="w-full flex items-center gap-4 px-4 py-3.5 md:py-4 rounded-xl mb-1 transition-all duration-150 text-left"
                style={{
                  background: isActive ? "rgba(245,158,11,0.08)" : "transparent",
                  color: isActive ? "#f59e0b" : "var(--t-text3)",
                }}
                onClick={() => handleItemClick(item.path)}
                data-testid={`menu-item-${item.label.toLowerCase().replace(/ /g, "-")}`}
              >
                <Icon
                  size={18}
                  className="shrink-0"
                  style={{ color: isActive ? "#f59e0b" : "var(--t-text6)" }}
                />
                <span className="text-sm font-medium tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Refresh daily context */}
        {onRefreshContext && (
          <div className="px-3 pb-2 border-t border-white/5 pt-2">
            <button
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-150 text-left"
              style={{ color: "var(--t-text5)" }}
              onClick={() => { onRefreshContext(); onClose(); }}
              data-testid="button-refresh-context"
            >
              <RefreshCw size={16} className="shrink-0" style={{ color: "var(--t-text6)" }} />
              <span className="text-sm font-medium tracking-wide">Refresh Daily Context</span>
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5">
          <p className="text-xs text-white/20 tracking-widest uppercase">v0.1.0 — prototype</p>
        </div>
      </div>
    </div>
  );
}
