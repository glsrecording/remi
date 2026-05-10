import { useLocation } from "wouter";
import { X, Sun, Brain, Music, Clock, CheckSquare, BarChart2, MessageCircle, Terminal, Archive, History, Download, Shuffle, Radio, BookOpen } from "lucide-react";
import { useEffect } from "react";

interface HamburgerMenuProps {
  open: boolean;
  onClose: () => void;
}

const menuItems = [
  { label: "Morning Briefing", icon: Sun, path: "/morning-briefing" },
  { label: "Tasks", icon: Brain, path: "/brain-dump" },
  { label: "Session", icon: Radio, path: "/session" },
  { label: "Triage", icon: Shuffle, path: "/triage" },
  { label: "Mix Notes", icon: Music, path: "/mix-notes" },
  { label: "Time Track", icon: Clock, path: "/time-track" },
  { label: "Wrap Up", icon: CheckSquare, path: "/wrap-up" },
  { label: "Scorecard", icon: BarChart2, path: "/scorecard" },
  { label: "Someday Review", icon: Archive, path: "/someday-review" },
  { label: "Journal", icon: BookOpen, path: "/journal" },
  { label: "Session History", icon: History, path: "/session-history" },
  { label: "Export Data", icon: Download, path: "/data-export" },
  { label: "Message to Dad", icon: MessageCircle, path: "/message-to-dad" },
  { label: "Commands", icon: Terminal, path: "/commands" },
];

export default function HamburgerMenu({ open, onClose }: HamburgerMenuProps) {
  const [location, navigate] = useLocation();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleItemClick = (path: string) => {
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
        className="relative z-10 flex flex-col w-72 h-full menu-slide-in"
        style={{ background: "#111111" }}
        data-testid="hamburger-menu"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5 border-b border-white/5"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
        >
          <span
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: "'Space Mono', monospace", color: "#f59e0b" }}
          >
            Remi
          </span>
          <button
            className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            onClick={onClose}
            data-testid="button-close-menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path && item.path !== "/";
            return (
              <button
                key={item.label}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl mb-1 transition-all duration-150 text-left"
                style={{
                  background: isActive ? "rgba(245,158,11,0.08)" : "transparent",
                  color: isActive ? "#f59e0b" : "rgba(255,255,255,0.65)",
                }}
                onClick={() => handleItemClick(item.path)}
                data-testid={`menu-item-${item.label.toLowerCase().replace(/ /g, "-")}`}
              >
                <Icon
                  size={18}
                  className="shrink-0"
                  style={{ color: isActive ? "#f59e0b" : "rgba(255,255,255,0.3)" }}
                />
                <span className="text-sm font-medium tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5">
          <p className="text-xs text-white/20 tracking-widest uppercase">v0.1.0 — prototype</p>
        </div>
      </div>
    </div>
  );
}
