import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ExternalLink, Clock, Pencil, Check, X } from "lucide-react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/storage";

export default function TimeTrack() {
  const [, navigate] = useLocation();
  const [timerUrl, setTimerUrl] = useLocalStorage<string>(STORAGE_KEYS.TIMER_URL, "");
  const [remiColor] = useLocalStorage<string>(STORAGE_KEYS.REMI_COLOR, "#f59e0b");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(timerUrl);

  const hasUrl = timerUrl.trim().length > 0;

  const handleSave = () => {
    let url = draft.trim();
    if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    setTimerUrl(url);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(timerUrl);
    setEditing(false);
  };

  const handleOpen = () => {
    if (hasUrl) window.open(timerUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "#232323" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{
          background: "#1a1a1a",
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
          Time Track
        </span>
      </div>

      {/* Body */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 gap-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: remiColor + "15", border: `1.5px solid ${remiColor}30` }}
        >
          <Clock size={36} style={{ color: remiColor }} />
        </div>

        {/* Main button */}
        <div className="w-full flex flex-col items-center gap-3">
          <button
            className="w-full py-5 rounded-2xl flex items-center justify-center gap-3 text-base font-semibold transition-all active:scale-[0.97]"
            style={{
              background: hasUrl ? remiColor : "rgba(255,255,255,0.04)",
              color: hasUrl ? "#111111" : "rgba(255,255,255,0.25)",
              border: hasUrl ? "none" : "1.5px dashed rgba(255,255,255,0.12)",
              cursor: hasUrl ? "pointer" : "default",
            }}
            onClick={handleOpen}
            disabled={!hasUrl}
            data-testid="button-open-timer"
          >
            <ExternalLink size={20} />
            Open Session Timer
          </button>

          {!hasUrl && (
            <p className="text-xs text-white/30 text-center">
              Add your timer app URL below to enable this button
            </p>
          )}
        </div>

        {/* URL setting */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-white/30 uppercase tracking-widest">Timer app URL</p>
            {!editing && (
              <button
                className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors"
                onClick={() => { setDraft(timerUrl); setEditing(true); }}
                data-testid="button-edit-url"
              >
                <Pencil size={11} />
                {hasUrl ? "Edit" : "Add"}
              </button>
            )}
          </div>

          {editing ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
                placeholder="https://your-timer-app.com"
                className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                data-testid="input-timer-url"
              />
              <button
                className="p-2.5 rounded-xl text-green-400 hover:bg-green-400/10 transition-colors"
                onClick={handleSave}
                data-testid="button-save-url"
              >
                <Check size={18} />
              </button>
              <button
                className="p-2.5 rounded-xl text-white/30 hover:text-white/60 transition-colors"
                onClick={handleCancel}
                data-testid="button-cancel-url"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div
              className="px-4 py-3 rounded-xl border border-white/5 cursor-pointer"
              style={{ background: "#333333" }}
              onClick={() => { setDraft(timerUrl); setEditing(true); }}
              data-testid="display-timer-url"
            >
              {hasUrl ? (
                <p className="text-sm text-white/60 truncate" style={{ fontFamily: "'Space Mono', monospace" }}>
                  {timerUrl}
                </p>
              ) : (
                <p className="text-sm text-white/20 italic">No URL set — tap to add</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
