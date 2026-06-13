import { useState, useRef, type ReactNode } from "react";
import { Sun, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { useGutterScroll } from "@/hooks/useGutterScroll";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;

// Design-system context colors (mirror design-system.css; hex so the `color + "26"`
// alpha-concat glow pattern works). Mode-independent — safe in light + dark.
// Screen identity is amber (planning/overview); each section keys off its content.
const AMBER  = "#f5a623";  // --color-tasks   — identity / date hero / Due Today
const PURPLE = "#9b8de8";  // --color-tonight  — calendar / schedule
const BLUE   = "#378add";  // --color-calls    — inbox / emails
const GREEN  = "#5bc468";  // --color-done     — bills
const ALERT  = "#ef4444";  // error state

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
  calendar:          CalItem[];
  calendar_tomorrow?: CalItem[];
  emails:   EmailItem[];
  tasks: { today: TaskItem[]; tonight: TaskItem[]; tomorrow: TaskItem[] };
  bills: BillItem[];
};

// ── Reusable section primitives (Tasks-style header + glowing accent card) ──────

function SectionCard({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div
      className="px-4 py-3.5"
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        borderLeft: `3px solid ${color}`,
        borderTop: "1px solid var(--border-subtle)",
        borderRight: "1px solid var(--border-subtle)",
        borderBottom: "1px solid var(--border-subtle)",
        boxShadow: `0 0 18px ${color}26`,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ color, label, count }: { color: string; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: color, boxShadow: `0 0 8px ${color}66` }} />
      <span
        className="font-bold uppercase flex-1"
        style={{ color, fontFamily: "'Space Mono', monospace", fontSize: "var(--font-size-sm)", letterSpacing: "0.08em" }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          className="font-mono rounded-full shrink-0"
          style={{ background: `${color}1f`, color, fontSize: "var(--font-size-xs)", padding: "2px 8px" }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// One content row inside a section — elevated surface, 2px accent matching its section.
function ContentRow({ color, href, testid, children }: { color: string; href?: string; testid?: string; children: ReactNode }) {
  const style = {
    background: "var(--surface-elevated)",
    borderRadius: "var(--radius-md)",
    borderLeft: `2px solid ${color}`,
  } as const;
  const cls = "flex items-start gap-3 px-3 py-2.5";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} transition-opacity active:opacity-60`} style={{ ...style, textDecoration: "none" }} data-testid={testid}>
      {children}
    </a>
  ) : (
    <div className={cls} style={style} data-testid={testid}>{children}</div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-xs px-1 py-1" style={{ color: "var(--text-muted)" }}>{text}</p>;
}

export default function MorningBriefing() {
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="flex flex-col h-full w-full" style={{ background: "var(--surface-base)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <PageHeader
        title="Morning Briefing"
        color={AMBER}
        onMenu={() => setMenuOpen(true)}
        right={data ? (
          <button
            className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
            style={{ color: AMBER }}
            onClick={handleRefresh}
            data-testid="button-clear-briefing"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        ) : undefined}
      />

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
              style={{ background: `${AMBER}15`, border: `1.5px solid ${AMBER}25`, boxShadow: `0 0 24px ${AMBER}26` }}
            >
              <Sun size={34} style={{ color: AMBER }} />
            </div>

            <div className="text-center">
              <p className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                {today.toLocaleDateString("en-US", { weekday: "long" })}
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>

            <button
              className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-semibold transition-all active:scale-[0.97]"
              style={{ background: AMBER, color: "#1a1200", boxShadow: `0 0 20px ${AMBER}55` }}
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
              style={{ background: `${ALERT}1a`, border: `1.5px solid ${ALERT}33` }}
            >
              <Sun size={34} style={{ color: ALERT }} />
            </div>
            <p className="text-sm text-center max-w-xs" style={{ color: "var(--text-secondary)" }}>{error}</p>
            <button
              className="flex items-center gap-2.5 px-8 py-4 rounded-2xl text-base font-semibold transition-all active:scale-[0.97]"
              style={{ background: AMBER, color: "#1a1200", boxShadow: `0 0 20px ${AMBER}55` }}
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
            {/* Date header — amber hero */}
            <div
              className="px-4 py-3.5 flex items-center gap-3"
              style={{
                background: "var(--surface-card)",
                borderRadius: "var(--radius-lg)",
                borderLeft: `3px solid ${AMBER}`,
                borderTop: "1px solid var(--border-subtle)",
                borderRight: "1px solid var(--border-subtle)",
                borderBottom: "1px solid var(--border-subtle)",
                boxShadow: `0 0 18px ${AMBER}26`,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${AMBER}1a`, border: `1px solid ${AMBER}33` }}
              >
                <Sun size={18} style={{ color: AMBER }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Today</p>
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{dateLabel}</p>
              </div>
            </div>

            {/* Calendar / Schedule — purple */}
            <SectionCard color={PURPLE}>
              <SectionHeader color={PURPLE} label="Schedule" count={data!.calendar.length} />

              {/* Today subsection */}
              <p className="text-xs font-semibold px-1 mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Today
              </p>
              <div className="space-y-1.5">
                {data!.calendar.length === 0 ? (
                  <EmptyRow text="No events today" />
                ) : (
                  data!.calendar.map((item, i) => (
                    <ContentRow key={i} color={PURPLE} testid={`calendar-item-${i}`}>
                      <span className="text-xs font-mono mt-0.5 shrink-0" style={{ color: PURPLE }}>{item.time}</span>
                      <p className="text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                    </ContentRow>
                  ))
                )}
              </div>

              {/* Tomorrow subsection — only rendered if key exists (backwards compatible) */}
              {data!.calendar_tomorrow !== undefined && (
                <>
                  <p className="text-xs font-semibold px-1 mt-3 mb-1.5" style={{ color: "var(--text-secondary)" }}>
                    Tomorrow
                  </p>
                  <div className="space-y-1.5">
                    {data!.calendar_tomorrow.length === 0 ? (
                      <EmptyRow text="No events tomorrow" />
                    ) : (
                      data!.calendar_tomorrow.map((item, i) => (
                        <ContentRow key={i} color={PURPLE} testid={`calendar-tomorrow-item-${i}`}>
                          <span className="text-xs font-mono mt-0.5 shrink-0" style={{ color: PURPLE }}>{item.time}</span>
                          <p className="text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                        </ContentRow>
                      ))
                    )}
                  </div>
                </>
              )}
            </SectionCard>

            {/* Inbox — blue */}
            {(data!.emails ?? []).length > 0 && (
              <SectionCard color={BLUE}>
                <SectionHeader color={BLUE} label="Inbox" count={data!.emails.length} />
                <div className="space-y-1.5">
                  {data!.emails.map((item, i) => (
                    <ContentRow
                      key={i}
                      color={BLUE}
                      href={`https://mail.google.com/mail/u/0/#inbox/${item.thread_id}`}
                      testid={`email-item-${i}`}
                    >
                      <span className="text-xs font-mono mt-0.5 shrink-0 max-w-[72px] truncate" style={{ color: BLUE }}>
                        {item.sender}
                      </span>
                      <p className="text-sm font-medium leading-snug flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>
                        {item.subject}
                      </p>
                    </ContentRow>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Due Today — amber */}
            <SectionCard color={AMBER}>
              <SectionHeader color={AMBER} label="Due Today" count={allTasks.length} />
              <div className="space-y-1.5">
                {allTasks.length === 0 ? (
                  <EmptyRow text="No tasks due today" />
                ) : (
                  allTasks.map((task, i) => (
                    <ContentRow key={task.id || i} color={AMBER} testid={`task-item-${i}`}>
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: AMBER }} />
                      <p className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>{task.title}</p>
                    </ContentRow>
                  ))
                )}
              </div>
            </SectionCard>

            {/* Bills — green */}
            <SectionCard color={GREEN}>
              <SectionHeader color={GREEN} label="Bills This Week" count={data!.bills.length} />
              <div className="space-y-1.5">
                {data!.bills.length === 0 ? (
                  <EmptyRow text="No bills due in the next 14 days" />
                ) : (
                  data!.bills.map((bill, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2.5"
                      style={{ background: "var(--surface-elevated)", borderRadius: "var(--radius-md)", borderLeft: `2px solid ${GREEN}` }}
                      data-testid={`bill-item-${i}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{bill.name}</p>
                        {bill.auto && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Auto-pay</p>
                        )}
                      </div>
                      <p className="text-xs shrink-0 ml-3" style={{ color: "var(--text-secondary)" }}>{bill.due}</p>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>

            {/* Footer */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ background: "var(--surface-card)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}
            >
              <Sparkles size={13} className="shrink-0" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Live data from Jarvis</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
