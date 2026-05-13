import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Download, CheckCircle2, Copy } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS, BrainItem, MixNote, SessionLog } from "@/lib/storage";

function buildExport(
  brainItems: BrainItem[],
  mixNotes: MixNote[],
  sessionLog: SessionLog[]
): string {
  const now = new Date().toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  let out = `REMI — Data Export\n`;
  out += `Generated: ${now}\n`;
  out += `${"=".repeat(50)}\n\n`;

  // Brain Dump
  out += `BRAIN DUMP (${brainItems.length} items)\n`;
  out += `${"-".repeat(30)}\n`;
  const buckets: Array<"today" | "tomorrow" | "someday"> = ["today", "tomorrow", "someday"];
  for (const bucket of buckets) {
    const group = brainItems.filter((i) => i.bucket === bucket);
    if (group.length === 0) continue;
    out += `\n${bucket.toUpperCase()} (${group.length})\n`;
    for (const item of group) {
      out += `  • ${item.text}  [${item.date} ${item.timestamp}]\n`;
    }
  }

  // Mix Notes
  out += `\n\nMIX NOTES (${mixNotes.length} notes)\n`;
  out += `${"-".repeat(30)}\n`;
  const songs = [...new Set(mixNotes.map((n) => n.song))];
  for (const song of songs) {
    const group = mixNotes.filter((n) => n.song === song);
    out += `\n${song} (${group.length} note${group.length !== 1 ? "s" : ""})\n`;
    for (const note of group) {
      out += `  [${note.date} ${note.timestamp}] ${note.note || "(no details)"}\n`;
    }
  }

  // Session Log
  out += `\n\nSESSION HISTORY (${sessionLog.length} sessions)\n`;
  out += `${"-".repeat(30)}\n`;
  for (const entry of sessionLog) {
    out += `\n${entry.date} — wrapped at ${entry.timestamp}\n`;
    out += `  Tasks cleared: ${entry.completedItems.length}  |  Mix notes: ${entry.mixNoteCount}\n`;
    for (const task of entry.completedItems) {
      out += `    ✓ ${task}\n`;
    }
  }

  out += `\n${"=".repeat(50)}\n`;
  out += `End of export.\n`;
  return out;
}

export default function DataExport() {
  const [, navigate] = useLocation();
  const [ACCENT] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");
  const [brainItems] = useLocalStorage<BrainItem[]>(STORAGE_KEYS.BRAIN_DUMP_ITEMS, []);
  const [mixNotes] = useLocalStorage<MixNote[]>(STORAGE_KEYS.MIX_NOTES, []);
  const [sessionLog] = useLocalStorage<SessionLog[]>(STORAGE_KEYS.SESSION_LOG, []);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const exportText = buildExport(brainItems, mixNotes, sessionLog);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `remi-export-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  const stats = [
    { label: "Brain items", value: brainItems.length, color: "#f59e0b" },
    { label: "Mix notes", value: mixNotes.length, color: ACCENT },
    { label: "Sessions", value: sessionLog.length, color: "#14b8a6" },
  ];

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--t-bg)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{ background: "var(--t-surface)", paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)", paddingBottom: "14px" }}
      >
        <button
          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors -ml-1"
          onClick={() => navigate("/")}
          data-testid="button-back"
        >
          <ArrowLeft size={20} />
        </button>
        <Download size={16} className="text-white/30" />
        <span className="text-base font-bold tracking-tight" style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}>
          Export Data
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 pt-5 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl px-3 py-3 text-center" style={{ background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
              <p className="text-xl font-bold" style={{ fontFamily: "'Space Mono', monospace", color: s.color }}>{s.value}</p>
              <p className="text-xs text-white/35 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        <div className="px-1">
          <p className="text-sm text-white/55 leading-relaxed">
            All your data is stored locally on this device. Export a plain-text snapshot you can save, share, or archive any time.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <button
            className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
            style={{ background: ACCENT, color: "#111111" }}
            onClick={handleDownload}
            data-testid="button-download"
          >
            {downloaded ? <CheckCircle2 size={17} /> : <Download size={17} />}
            {downloaded ? "Downloaded!" : "Download .txt file"}
          </button>
          <button
            className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
            style={{ background: "var(--t-card)", color: "var(--t-text3)", border: "1px solid var(--t-border-md)" }}
            onClick={handleCopy}
            data-testid="button-copy"
          >
            {copied ? <CheckCircle2 size={17} style={{ color: "#22c55e" }} /> : <Copy size={17} />}
            {copied ? "Copied to clipboard!" : "Copy to clipboard"}
          </button>
        </div>

        {/* Preview */}
        <div>
          <p className="text-xs text-white/25 uppercase tracking-widest mb-2">Preview</p>
          <pre
            className="text-xs text-white/40 leading-relaxed rounded-xl p-4 overflow-x-auto no-scrollbar"
            style={{ background: "var(--t-surface)", fontFamily: "'Space Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "280px", overflowY: "auto" }}
          >
            {exportText}
          </pre>
        </div>
      </div>
    </div>
  );
}
