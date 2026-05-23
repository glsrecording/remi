import { useState } from "react";
import { Delete } from "lucide-react";

const STORAGE_KEY   = "remi_unlocked_v1";
const UNLOCK_TS_KEY = "remi_unlock_ts_v1";
const CORRECT_PIN   = import.meta.env.VITE_REMI_PIN as string | undefined;
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

export function isPinUnlocked(): boolean {
  if (!CORRECT_PIN) return true;
  if (localStorage.getItem(STORAGE_KEY) !== CORRECT_PIN) return false;
  const ts = parseInt(localStorage.getItem(UNLOCK_TS_KEY) ?? "0", 10);
  if (!ts || Date.now() - ts > SESSION_TIMEOUT_MS) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(UNLOCK_TS_KEY);
    return false;
  }
  return true;
}

/** Clear PIN session — call when server signals session_expired. */
export function clearPinUnlock(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(UNLOCK_TS_KEY);
}

const ACCENT = "#f59e0b";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export default function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  const pinLength = CORRECT_PIN?.length ?? 6;

  const submit = (next: string) => {
    if (next.length < pinLength) return;
    if (next === CORRECT_PIN) {
      localStorage.setItem(STORAGE_KEY, CORRECT_PIN!);
      localStorage.setItem(UNLOCK_TS_KEY, Date.now().toString());
      onUnlock();
    } else {
      setShaking(true);
      setError(true);
      setTimeout(() => {
        setPin("");
        setShaking(false);
        setError(false);
      }, 600);
    }
  };

  const handleDigit = (d: string) => {
    if (pin.length >= pinLength) return;
    const next = pin + d;
    setPin(next);
    if (next.length === pinLength) submit(next);
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError(false);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center select-none"
      style={{ background: "var(--t-bg)" }}
    >
      {/* Logo */}
      <p
        className="text-3xl font-bold tracking-tighter mb-1"
        style={{ fontFamily: "'Space Mono', monospace", color: ACCENT }}
      >
        Remi
      </p>
      <p className="text-xs tracking-widest uppercase mb-12" style={{ color: "rgba(255,255,255,0.25)" }}>
        Enter PIN to continue
      </p>

      {/* Dots */}
      <div className={`flex gap-5 mb-3 ${shaking ? "pin-shake" : ""}`}>
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full transition-all duration-150"
            style={{
              background: error
                ? "#ef4444"
                : i < pin.length
                  ? ACCENT
                  : "var(--t-el-med)",
              boxShadow:
                i < pin.length && !error
                  ? `0 0 8px ${ACCENT}70`
                  : error && i < pin.length
                    ? "0 0 8px rgba(239,68,68,0.6)"
                    : "none",
            }}
          />
        ))}
      </div>

      {/* Error label */}
      <div className="h-5 mb-8 flex items-center">
        {error && (
          <p className="text-xs tracking-wide" style={{ color: "#ef4444" }}>
            Incorrect PIN — try again
          </p>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3" style={{ width: 264 }}>
        {KEYS.map((k) => {
          if (k === "") {
            return <div key="empty" />;
          }
          if (k === "del") {
            return (
              <button
                key="del"
                className="h-16 rounded-2xl flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                onClick={handleDelete}
              >
                <Delete size={20} style={{ color: "rgba(255,255,255,0.45)" }} />
              </button>
            );
          }
          return (
            <button
              key={k}
              className="h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-90"
              style={{
                background: "var(--t-el-low)",
                border: "1px solid var(--t-border-md)",
                color: "rgba(255,255,255,0.85)",
                fontFamily: "'Space Mono', monospace",
              }}
              onClick={() => handleDigit(k)}
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
