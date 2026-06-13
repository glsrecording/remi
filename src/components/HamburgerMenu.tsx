import { useLocation } from "wouter";
import {
  X, Sun, Moon, Brain, Music, Clock, BarChart2, MessageCircle, MessageSquare,
  Terminal, Shuffle, Radio, BookOpen, RefreshCw, ClipboardCheck, ShoppingCart,
  Layers, Phone, Film, Link2, Bell, Archive, Users, CalendarClock, Dumbbell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/hooks/use-theme";

const JARVIS_URL   = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

interface HamburgerMenuProps {
  open: boolean;
  onClose: () => void;
  onRefreshContext?: () => void;
  onWeeklyReview?: () => void;
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: "tasksToday" | "reminders";   // tasksToday = amber count (Tasks); reminders = tonight/purple count
}

interface MenuSection {
  name: string;
  accent: string;   // section color — icon glyph, label, badge, active tint
  bg: string;       // icon-square fill (dark per-section token)
  items: MenuItem[];
}

// Color-by-context grouping, mirroring the design system (design-system.css).
// Items map to EXISTING routes only — no new routes are created here.
const SECTIONS: MenuSection[] = [
  {
    name: "Overview", accent: "#9b8de8", bg: "var(--color-tonight-bg)",   // --color-tonight
    items: [
      { label: "Morning Briefing", icon: Sun,           path: "/morning-briefing" },
      { label: "Chat",             icon: MessageSquare,  path: "/" },
      { label: "Triage",           icon: Shuffle,        path: "/triage" },
      { label: "Scheduler",        icon: CalendarClock,  path: "/scheduler" },
      { label: "Tasks",            icon: Brain,          path: "/tasks", badge: "tasksToday" },
      { label: "Reminders",        icon: Bell,           path: "/reminders", badge: "reminders" },
    ],
  },
  {
    name: "Studio", accent: "#3dd6b0", bg: "var(--color-studio-bg)",      // --color-studio
    items: [
      { label: "Session",       icon: Radio,   path: "/session" },
      { label: "Song Pipeline", icon: Layers,  path: "/song-pipeline" },
      { label: "Mix Notes",     icon: Music,   path: "/mix-notes" },
      { label: "Wrap Up",       icon: Archive, path: "/wrap-up" },
      { label: "Call Notes",    icon: Phone,   path: "/call-notes" },
    ],
  },
  {
    name: "Growth", accent: "#378add", bg: "var(--color-calls-bg)",       // --color-calls
    items: [
      { label: "Scorecard",     icon: BarChart2,      path: "/scorecard" },
      { label: "Time Track",    icon: Clock,          path: "/time-track" },
      { label: "Exercise",      icon: Dumbbell,       path: "/exercise" },
      { label: "Weekly Review", icon: ClipboardCheck, path: "#weekly-review" },
    ],
  },
  {
    name: "Creative", accent: "#d4537e", bg: "var(--color-personal-bg)",  // --color-personal
    items: [
      { label: "Journal", icon: BookOpen, path: "/journal" },
      { label: "Content", icon: Film,     path: "/content" },
    ],
  },
  {
    name: "Personal", accent: "#d4537e", bg: "var(--color-personal-bg)",  // --color-personal
    items: [
      { label: "Message to Dad", icon: MessageCircle, path: "/message-to-dad" },
      { label: "Shopping List",  icon: ShoppingCart,  path: "/shopping-list" },
    ],
  },
  {
    name: "System", accent: "#888890", bg: "var(--surface-elevated)",     // --text-secondary (readable gray)
    items: [
      { label: "Sanity Check", icon: Users,    path: "/sanity-check" },
      { label: "Links",        icon: Link2,    path: "/links" },
      { label: "Commands",     icon: Terminal, path: "/commands" },
    ],
  },
];

// Today task count from the Tasks page cache (same-day only) — no fetch.
function readTasksTodayCount(): number {
  try {
    const raw = localStorage.getItem("remi_tasks_cache");
    if (!raw) return 0;
    const c = JSON.parse(raw);
    if (c?.date !== new Date().toISOString().slice(0, 10)) return 0;
    return Array.isArray(c?.tasks?.today) ? c.tasks.today.length : 0;
  } catch {
    return 0;
  }
}

export default function HamburgerMenu({ open, onClose, onRefreshContext, onWeeklyReview }: HamburgerMenuProps) {
  const [location, navigate] = useLocation();
  const { isLight, toggleTheme } = useTheme();
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // On open: pull the count of pending (non-fired) reminders for the badge.
  // Same endpoint the Reminders page uses. On failure or 0, no badge is shown.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`${JARVIS_URL}/reminders`, { headers: { Authorization: `Bearer ${REMI_API_KEY}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.reminders) ? data.reminders : [];
        setReminderCount(list.filter((r: { fired?: boolean }) => !r.fired).length);
      })
      .catch(() => { if (!cancelled) setReminderCount(0); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const tasksToday = readTasksTodayCount();

  const handleItemClick = (path: string) => {
    if (path === "#weekly-review") {
      onWeeklyReview?.();
      onClose();
      return;
    }
    navigate(path);
    onClose();
  };

  const renderItem = (item: MenuItem, section: MenuSection) => {
    const Icon = item.icon;
    const isActive = location === item.path;
    const showTasksBadge = item.badge === "tasksToday" && tasksToday > 0;
    const showRemindersBadge = item.badge === "reminders" && reminderCount > 0;
    return (
      <button
        key={item.label}
        className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl mb-0.5 transition-all duration-150 text-left"
        style={{ background: isActive ? section.accent + "1a" : "transparent" }}
        onClick={() => handleItemClick(item.path)}
        data-testid={`menu-item-${item.label.toLowerCase().replace(/ /g, "-")}`}
      >
        {/* Icon square — section bg fill, section-colored glyph */}
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-md)",
            background: section.bg,
            border: `1px solid ${section.accent}33`,
          }}
        >
          <Icon size={15} style={{ color: section.accent }} />
        </div>
        <span
          className="flex-1 truncate"
          style={{
            color: isActive ? section.accent : "var(--text-primary)",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          {item.label}
        </span>
        {showTasksBadge && (
          <span
            className="shrink-0"
            style={{
              background: "var(--color-tasks-bg)",
              color: "var(--color-tasks)",
              fontSize: "10px",
              padding: "1px 7px",
              borderRadius: "var(--radius-pill)",
              fontFamily: "'Space Mono', monospace",
            }}
            data-testid="menu-badge-tasks-today"
          >
            {tasksToday}
          </span>
        )}
        {showRemindersBadge && (
          <span
            className="shrink-0"
            style={{
              background: "var(--color-tonight-bg)",
              color: "var(--color-tonight)",
              fontSize: "10px",
              padding: "1px 7px",
              borderRadius: "var(--radius-pill)",
              fontFamily: "'Space Mono', monospace",
            }}
            data-testid="menu-badge-reminders"
          >
            {reminderCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 overlay-fade-in backdrop-blur-sm"
        data-testid="menu-overlay"
        onClick={onClose}
      />

      {/* Panel — 280px phone, 320px tablet */}
      <div
        className="relative z-10 flex flex-col w-[280px] md:w-[320px] h-full menu-slide-in"
        style={{ background: "var(--surface-base)" }}
        data-testid="hamburger-menu"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-5"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
            borderBottom: "0.5px solid var(--border-subtle)",
          }}
        >
          <button className="text-left" onClick={() => { navigate("/"); onClose(); }}>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                color: "var(--color-tonight)",
                fontSize: "20px",
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              Remi
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "10px", letterSpacing: "0.5px", marginTop: "2px" }}>
              GLS Command Center
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
              style={{ color: "var(--text-secondary)" }}
              title={isLight ? "Switch to dark mode" : "Switch to light mode"}
              data-testid="button-theme-toggle"
            >
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onClick={onClose}
              data-testid="button-close-menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {SECTIONS.map((section, si) => (
            <div
              key={section.name}
              style={si > 0 ? { borderTop: "0.5px solid var(--border-subtle)", marginTop: "8px", paddingTop: "10px" } : undefined}
            >
              <div
                className="px-2.5 pb-1.5"
                style={{
                  fontSize: "9px",
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                  color: section.accent,
                  fontFamily: "'Space Mono', monospace",
                  fontWeight: 700,
                }}
              >
                {section.name}
              </div>
              {section.items.map((item) => renderItem(item, section))}
            </div>
          ))}
        </nav>

        {/* Refresh daily context */}
        {onRefreshContext && (
          <div className="px-2 pb-2 pt-2" style={{ borderTop: "0.5px solid var(--border-subtle)" }}>
            <button
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-150 text-left"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => { onRefreshContext(); onClose(); }}
              data-testid="button-refresh-context"
            >
              <div
                className="shrink-0 flex items-center justify-center"
                style={{ width: "28px", height: "28px", borderRadius: "var(--radius-md)", background: "var(--surface-elevated)", border: "1px solid #88889033" }}
              >
                <RefreshCw size={15} style={{ color: "var(--text-secondary)" }} />
              </div>
              <span style={{ fontSize: "13px", fontWeight: 500 }}>Refresh Daily Context</span>
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3" style={{ borderTop: "0.5px solid var(--border-subtle)" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            v0.1.0 — prototype
          </p>
        </div>
      </div>
    </div>
  );
}
