import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import HamburgerMenu from "@/components/HamburgerMenu";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";

const JARVIS_URL = "https://jarvis.joshhollandgls.com";
const REMI_API_KEY = import.meta.env.VITE_REMI_API_KEY as string;
const AUTH_HEADERS = { Authorization: `Bearer ${REMI_API_KEY}` };
const ACCENT = "#10b981";

// ─── types ──────────────────────────────────────────────────────────────────

interface Field {
  key: string;
  label: string;
  type: "number" | "text";
  decimal?: boolean;
  required?: boolean;
}

interface ChipDef {
  key: string;
  label: string;
  color: string;
  category: "Health" | "Wellness";
  fields: Field[];
}

interface ChipState {
  checked: boolean;
  fields: Record<string, string>;
}

type ExerciseState = Record<string, ChipState>;

interface WeekEntry {
  date: string;
  activities: { activity: string; hours: number | null; notes: string }[];
}

interface History {
  streaks: Record<string, number>;
  last_values: Record<string, Record<string, number>>;
  other_names: string[];
  weekly: WeekEntry[];
}

// ─── chip definitions ────────────────────────────────────────────────────────

const CHIPS: ChipDef[] = [
  {
    key: "weights", label: "Weights", color: "#3b82f6", category: "Health",
    fields: [{ key: "lbs", label: "lbs", type: "number" }],
  },
  {
    key: "squats", label: "Squats", color: "#a855f7", category: "Wellness",
    fields: [{ key: "reps", label: "reps", type: "number" }],
  },
  {
    key: "push_ups", label: "Push-ups", color: "#14b8a6", category: "Health",
    fields: [{ key: "reps", label: "reps", type: "number" }],
  },
  {
    key: "pull_ups", label: "Pull-ups", color: "#22c55e", category: "Wellness",
    fields: [{ key: "reps", label: "reps", type: "number" }],
  },
  {
    key: "run", label: "Run", color: "#10b981", category: "Health",
    fields: [{ key: "miles", label: "miles", type: "number", decimal: true }],
  },
  {
    key: "farmers_walk", label: "Farmers Walk", color: "#6366f1", category: "Health",
    fields: [
      { key: "laps", label: "laps", type: "number" },
      { key: "lbs",  label: "lbs",  type: "number" },
    ],
  },
  {
    key: "yoga", label: "Yoga", color: "#8b5cf6", category: "Wellness",
    fields: [{ key: "minutes", label: "min", type: "number" }],
  },
  {
    key: "meditation", label: "Meditation", color: "#f43f5e", category: "Wellness",
    fields: [{ key: "minutes", label: "min", type: "number" }],
  },
  {
    key: "other", label: "Other", color: "#f59e0b", category: "Health",
    fields: [
      { key: "name",  label: "activity name", type: "text", required: true },
      { key: "notes", label: "notes (optional)", type: "text" },
    ],
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

const LS_DATE  = "exercise_date";
const LS_STATE = "exercise_state";
const LS_LAST  = "exercise_last_values";

function exerciseDateStr(): string {
  const now = new Date();
  const d = now.getHours() < 9
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    : now;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function buildPayload(chip: ChipDef, fields: Record<string, string>, dateIso: string) {
  const isOther = chip.key === "other";
  const activity = isOther
    ? `Other — ${(fields["name"] || "").trim()}`
    : chip.label;
  const firstField = chip.fields[0];
  const rawVal = firstField ? fields[firstField.key] : "";
  const value  = rawVal !== "" && rawVal != null ? parseFloat(rawVal) || null : null;
  let   value2: number | null = null;
  if (chip.key === "farmers_walk" && fields["lbs"] !== "") {
    value2 = parseFloat(fields["lbs"]) || null;
  }
  return {
    activity,
    category: chip.category,
    value:    chip.key === "farmers_walk" ? (parseFloat(fields["laps"]) || null) : value,
    value2,
    notes:    isOther ? (fields["notes"] || "") : "",
    date:     dateIso,
  };
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Exercise() {
  const [menuOpen, setMenuOpen]       = useState(false);
  const [weeklyView, setWeeklyView]   = useState(false);
  const [state, setStateRaw]          = useState<ExerciseState>({});
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [history, setHistory]         = useState<History | null>(null);
  const [otherSuggestions, setOtherSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions]   = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [saving, setSaving]           = useState<Record<string, boolean>>({});
  const dateRef = useRef(exerciseDateStr());

  // ── day reset on mount ────────────────────────────────────────────────────
  useEffect(() => {
    const today = dateRef.current;
    const storedDate = localStorage.getItem(LS_DATE);
    if (storedDate !== today) {
      setStateRaw({});
      localStorage.setItem(LS_DATE, today);
      localStorage.removeItem(LS_STATE);
    } else {
      try {
        const raw = localStorage.getItem(LS_STATE);
        if (raw) setStateRaw(JSON.parse(raw));
      } catch {}
    }
  }, []);

  // ── fetch history ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${JARVIS_URL}/exercise-history`, { headers: AUTH_HEADERS })
      .then(r => r.json())
      .then((data: History) => {
        setHistory(data);
        setOtherSuggestions(data.other_names || []);
        // Pre-fill last values into initial state (merge without overwriting today's state)
        setStateRaw(prev => {
          const next = { ...prev };
          for (const chip of CHIPS) {
            if (chip.key === "other") continue;
            const lv = data.last_values?.[chip.label];
            if (lv && !next[chip.key]) {
              const fieldMap: Record<string, string> = {};
              for (const [k, v] of Object.entries(lv)) {
                fieldMap[k] = String(v);
              }
              next[chip.key] = { checked: false, fields: fieldMap };
            }
          }
          return next;
        });
      })
      .catch(() => {});
  }, []);

  // ── persist state changes ─────────────────────────────────────────────────
  const setState = useCallback((updater: (prev: ExerciseState) => ExerciseState) => {
    setStateRaw(prev => {
      const next = updater(prev);
      localStorage.setItem(LS_STATE, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── chip tap ──────────────────────────────────────────────────────────────
  const handleChipTap = useCallback((chip: ChipDef) => {
    const current = state[chip.key];
    const nowChecked = !current?.checked;
    setState(prev => ({
      ...prev,
      [chip.key]: { checked: nowChecked, fields: prev[chip.key]?.fields ?? {} },
    }));
    if (nowChecked) {
      setExpanded(chip.key);
      // Fire POST with current pre-fill values
      const fields = state[chip.key]?.fields ?? {};
      const payload = buildPayload(chip, fields, dateRef.current);
      if (chip.key === "other" && !fields["name"]) return; // need name
      setSaving(s => ({ ...s, [chip.key]: true }));
      fetch(`${JARVIS_URL}/exercise-log`, {
        method: "POST",
        headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(() => setSaving(s => ({ ...s, [chip.key]: false })))
        .catch(() => setSaving(s => ({ ...s, [chip.key]: false })));
    } else {
      if (expanded === chip.key) setExpanded(null);
    }
  }, [state, expanded, setState]);

  // ── field change + re-log ─────────────────────────────────────────────────
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleFieldChange = useCallback((chip: ChipDef, fieldKey: string, value: string) => {
    setState(prev => ({
      ...prev,
      [chip.key]: {
        checked: prev[chip.key]?.checked ?? false,
        fields:  { ...(prev[chip.key]?.fields ?? {}), [fieldKey]: value },
      },
    }));
    // Re-POST with updated values after 800ms idle, if chip is checked
    clearTimeout(debounceRefs.current[chip.key]);
    debounceRefs.current[chip.key] = setTimeout(() => {
      setStateRaw(current => {
        const cs = current[chip.key];
        if (!cs?.checked) return current;
        const payload = buildPayload(chip, cs.fields, dateRef.current);
        if (chip.key === "other" && !(cs.fields["name"] || "").trim()) return current;
        fetch(`${JARVIS_URL}/exercise-log`, {
          method: "POST",
          headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});
        return current;
      });
    }, 800);
  }, [setState]);

  // ── other autocomplete filter ─────────────────────────────────────────────
  const otherName = state["other"]?.fields?.["name"] ?? "";
  const filteredSuggestions = otherName.trim()
    ? otherSuggestions.filter(s => s.toLowerCase().includes(otherName.toLowerCase()))
    : otherSuggestions;

  const streak = (label: string) => history?.streaks?.[label] ?? 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--t-bg)", color: "var(--t-text)" }}>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <PageHeader
        title="Exercise"
        color={ACCENT}
        onMenu={() => setMenuOpen(true)}
        right={
          <button
            onClick={() => setWeeklyView(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: weeklyView ? ACCENT + "20" : "var(--t-card)",
              color:      weeklyView ? ACCENT     : "var(--t-text5)",
              border:     weeklyView ? `1.5px solid ${ACCENT}50` : "1.5px solid var(--t-border-md)",
            }}
          >
            <Calendar size={12} />
            Week
          </button>
        }
      />

      {/* ── Today view ────────────────────────────────────────────────── */}
      {!weeklyView && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)" }}>

          <p className="text-xs uppercase tracking-widest mb-3"
            style={{ color: "var(--t-text6)" }}>
            {fmtDate(dateRef.current)}
          </p>

          {CHIPS.map(chip => {
            const cs      = state[chip.key];
            const checked = cs?.checked ?? false;
            const isExp   = expanded === chip.key;
            const str     = streak(chip.label);
            return (
              <div key={chip.key}>
                {/* Chip row */}
                <button
                  onClick={() => handleChipTap(chip)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
                  style={{
                    background: checked ? chip.color + "18" : "var(--t-surface)",
                    border:     checked ? `1.5px solid ${chip.color}55` : "1.5px solid var(--t-border-md)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Color dot */}
                    <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-colors"
                      style={{ background: checked ? chip.color : "var(--t-text6)" }} />
                    <span className="text-sm font-semibold"
                      style={{ color: checked ? chip.color : "var(--t-text)" }}>
                      {chip.label}
                    </span>
                    {str >= 2 && (
                      <span className="text-xs font-bold" style={{ color: chip.color }}>
                        🔥{str}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {saving[chip.key] && (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: chip.color + "66", borderTopColor: "transparent" }} />
                    )}
                    {checked && (
                      isExp
                        ? <ChevronUp size={14} style={{ color: "var(--t-text6)" }} />
                        : <ChevronDown size={14} style={{ color: "var(--t-text6)" }} />
                    )}
                  </div>
                </button>

                {/* Expand: optional fields */}
                {checked && isExp && (
                  <div className="mt-1 px-4 py-3 rounded-2xl space-y-2"
                    style={{ background: "var(--t-card)", border: "1px solid var(--t-border-md)" }}>

                    {chip.key === "other" ? (
                      <>
                        {/* Name field with autocomplete */}
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Activity name (required)"
                            value={cs?.fields?.["name"] ?? ""}
                            onChange={e => {
                              handleFieldChange(chip, "name", e.target.value);
                              setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            className="w-full text-sm px-3 py-2 rounded-xl outline-none"
                            style={{
                              background: "var(--t-surface)",
                              color:      "var(--t-text)",
                              border:     "1px solid var(--t-border-md)",
                            }}
                          />
                          {showSuggestions && filteredSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden z-10"
                              style={{ background: "var(--t-surface)", border: "1px solid var(--t-border-md)" }}>
                              {filteredSuggestions.slice(0, 5).map(s => (
                                <button
                                  key={s}
                                  onMouseDown={() => {
                                    handleFieldChange(chip, "name", s);
                                    setShowSuggestions(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-white/5"
                                  style={{ color: "var(--t-text3)" }}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Notes (optional)"
                          value={cs?.fields?.["notes"] ?? ""}
                          onChange={e => handleFieldChange(chip, "notes", e.target.value)}
                          className="w-full text-sm px-3 py-2 rounded-xl outline-none"
                          style={{
                            background: "var(--t-surface)",
                            color:      "var(--t-text)",
                            border:     "1px solid var(--t-border-md)",
                          }}
                        />
                        {/* Save button for Other since name is required */}
                        <button
                          onClick={() => {
                            const fields = cs?.fields ?? {};
                            if (!(fields["name"] || "").trim()) return;
                            const payload = buildPayload(chip, fields, dateRef.current);
                            setSaving(s => ({ ...s, [chip.key]: true }));
                            fetch(`${JARVIS_URL}/exercise-log`, {
                              method: "POST",
                              headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
                              body: JSON.stringify(payload),
                            })
                              .then(() => setSaving(s => ({ ...s, [chip.key]: false })))
                              .catch(() => setSaving(s => ({ ...s, [chip.key]: false })));
                          }}
                          className="w-full py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
                          style={{ background: chip.color + "20", color: chip.color }}
                        >
                          Log
                        </button>
                      </>
                    ) : (
                      <div className={`grid gap-2 ${chip.fields.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {chip.fields.map(f => (
                          <div key={f.key} className="flex items-center gap-2">
                            <input
                              inputMode={f.type === "number" ? (f.decimal ? "decimal" : "numeric") : "text"}
                              placeholder={f.label}
                              value={cs?.fields?.[f.key] ?? ""}
                              onChange={e => handleFieldChange(chip, f.key, e.target.value)}
                              className="flex-1 text-sm px-3 py-2 rounded-xl outline-none text-center"
                              style={{
                                background: "var(--t-surface)",
                                color:      "var(--t-text)",
                                border:     "1px solid var(--t-border-md)",
                              }}
                            />
                            <span className="text-xs shrink-0"
                              style={{ color: "var(--t-text6)" }}>
                              {f.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Weekly view ───────────────────────────────────────────────── */}
      {weeklyView && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)" }}>

          <p className="text-xs uppercase tracking-widest mb-3"
            style={{ color: "var(--t-text6)" }}>
            Last 7 exercise days
          </p>

          {(!history?.weekly || history.weekly.length === 0) && (
            <p className="text-sm text-center py-8" style={{ color: "var(--t-text6)" }}>
              No exercise history yet.
            </p>
          )}

          {history?.weekly?.map(day => {
            const isOpen = expandedDay === day.date;
            return (
              <div key={day.date} className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid var(--t-border-md)" }}>
                <button
                  onClick={() => setExpandedDay(isOpen ? null : day.date)}
                  className="w-full flex items-center justify-between px-4 py-3.5 transition-all"
                  style={{ background: "var(--t-surface)" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold" style={{ color: "var(--t-text)" }}>
                      {fmtDate(day.date)}
                    </span>
                    {/* Activity dots */}
                    <div className="flex gap-1">
                      {day.activities.slice(0, 6).map((a, i) => {
                        const def = CHIPS.find(c => c.label === a.activity ||
                          a.activity.startsWith("Other"));
                        return (
                          <div key={i} className="w-2 h-2 rounded-full"
                            style={{ background: def?.color ?? "#f59e0b" }} />
                        );
                      })}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={14} style={{ color: "var(--t-text6)" }} />
                           : <ChevronDown size={14} style={{ color: "var(--t-text6)" }} />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 pt-1 space-y-1"
                    style={{ background: "var(--t-card)" }}>
                    {day.activities.map((a, i) => {
                      const def = CHIPS.find(c => c.label === a.activity);
                      const color = a.activity.startsWith("Other") ? "#f59e0b" : (def?.color ?? "var(--t-text5)");
                      const valField = def?.fields[0]?.label ?? "";
                      const val = a.hours != null ? `${a.hours} ${valField}` : "";
                      return (
                        <div key={i} className="flex items-center gap-2 py-1">
                          <div className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: color }} />
                          <span className="text-sm" style={{ color: "var(--t-text3)" }}>
                            {a.activity}
                          </span>
                          {(val || a.notes) && (
                            <span className="text-xs ml-auto" style={{ color: "var(--t-text6)" }}>
                              {[val, a.notes].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
