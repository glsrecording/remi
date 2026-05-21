import { useState, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";

const REMI_BLUE = "#60a5fa";

interface LinkEntry {
  name: string;
  url: string;
  description: string;
}

interface Category {
  category: string;
  links: LinkEntry[];
}

const LINKS: Category[] = [
  {
    category: "Calendly",
    links: [
      {
        name: "2-4 Hour Session",
        url: "https://calendly.com/glsrecording/2-4-hour-session",
        description: "Standard session booking",
      },
      {
        name: "2-4 Hour Session (Loyalty)",
        url: "https://calendly.com/glsrecording/2-4-hour-session-loyalty",
        description: "Discounted rate for returning clients",
      },
      {
        name: "Day Rate",
        url: "https://calendly.com/glsrecording/day-rate",
        description: "Full day booking",
      },
      {
        name: "Day Rate (Loyalty)",
        url: "https://calendly.com/glsrecording/loyalty-day-rate",
        description: "Discounted day rate for returning clients",
      },
      {
        name: "Strategy Session",
        url: "https://calendly.com/glsrecording/strategy-session",
        description: "30-60 min intro call to assess fit",
      },
      {
        name: "Project Booking",
        url: "https://calendly.com/glsrecording/project-booking-4-hours",
        description: "4 hour block for project rate clients — no additional charge",
      },
      {
        name: "Half-Day / Exploratory",
        url: "https://calendly.com/glsrecording/gls-half-day",
        description: "Half day rate, also used for exploratory sessions",
      },
    ],
  },
];

export default function QuickLinks() {
  const [menuOpen, setMenuOpen]       = useState(false);
  const [activeCategory, setCategory] = useState(LINKS[0].category);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastTimer, setToastTimer]   = useState<ReturnType<typeof setTimeout> | null>(null);

  const visibleLinks = LINKS.find((c) => c.category === activeCategory)?.links ?? [];

  const handleCopy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback for older browsers
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    if (toastTimer) clearTimeout(toastTimer);
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 1800);
    setToastTimer(t);
  }, [toastTimer]);

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--t-bg)", color: "var(--t-text)" }}
    >
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <PageHeader
        title="Links"
        color={REMI_BLUE}
        onMenu={() => setMenuOpen(true)}
      />

      {/* Category chips */}
      <div
        className="flex gap-2 px-4 pt-4 pb-2 overflow-x-auto shrink-0"
        style={{ scrollbarWidth: "none" }}
      >
        {LINKS.map((cat) => {
          const active = cat.category === activeCategory;
          return (
            <button
              key={cat.category}
              onClick={() => setCategory(cat.category)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 active:scale-95"
              style={{
                background: active ? REMI_BLUE + "22" : "var(--t-card)",
                color:      active ? REMI_BLUE        : "var(--t-text5)",
                border:     active ? `1.5px solid ${REMI_BLUE}60` : "1.5px solid var(--t-border-md)",
              }}
            >
              {cat.category}
            </button>
          );
        })}
      </div>

      {/* Link cards */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {visibleLinks.map((link) => (
          <button
            key={link.url}
            onClick={() => handleCopy(link.url)}
            className="w-full text-left px-4 py-4 rounded-2xl transition-all active:scale-[0.98]"
            style={{
              background:  "var(--t-surface)",
              border:      "1px solid var(--t-border-md)",
            }}
          >
            <p
              className="text-sm font-semibold mb-0.5"
              style={{ color: "var(--t-text)" }}
            >
              {link.name}
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--t-text6)" }}
            >
              {link.description}
            </p>
          </button>
        ))}
      </div>

      {/* Toast */}
      {toastVisible && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-sm font-semibold pointer-events-none"
          style={{
            background: REMI_BLUE,
            color:      "#000",
            zIndex:     100,
          }}
        >
          Copied!
        </div>
      )}
    </div>
  );
}
