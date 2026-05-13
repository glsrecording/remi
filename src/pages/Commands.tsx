import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Search, ChevronRight } from "lucide-react";
import { COMMANDS, CATEGORY_COLORS } from "@/lib/commands";

export default function Commands() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const filtered = COMMANDS.filter(
    (cmd) =>
      cmd.trigger.toLowerCase().includes(search.toLowerCase()) ||
      cmd.description.toLowerCase().includes(search.toLowerCase()) ||
      cmd.category.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, typeof COMMANDS>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  const ACCENT = "#f59e0b";

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>
      {/* Header */}
      <div
        className="px-4 border-b border-white/5 shrink-0"
        style={{
          background: "var(--t-surface)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <button
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft size={20} />
          </button>
          <span
            className="text-base font-bold tracking-tight"
            style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}
          >
            Commands
          </span>
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trigger phrases..."
            className="w-full bg-white/5 border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
            data-testid="input-command-search"
          />
        </div>
      </div>

      {/* Command list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Search size={24} className="text-white/15" />
            <p className="text-sm text-white/30">No commands match "{search}"</p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, cmds]) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: CATEGORY_COLORS[category] ?? ACCENT }} />
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: CATEGORY_COLORS[category] ?? ACCENT }}>
                  {category}
                </p>
              </div>

              {cmds.map((cmd) => (
                <div
                  key={cmd.id}
                  className="px-4 py-3.5 rounded-xl border border-white/5 flex items-start gap-3 group active:bg-white/3 transition-colors"
                  style={{ background: "var(--t-card)" }}
                  data-testid={`command-item-${cmd.id}`}
                >
                  <ChevronRight size={14} className="shrink-0 mt-0.5 text-white/20 group-active:text-white/40" />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium leading-snug mb-0.5"
                      style={{ fontFamily: "'Space Mono', monospace", color: "rgba(255,255,255,0.9)" }}
                    >
                      "{cmd.trigger}"
                    </p>
                    <p className="text-xs text-white/40 leading-snug">{cmd.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </div>
  );
}
