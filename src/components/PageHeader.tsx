import { Menu, Moon, Sun, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useTheme } from "@/hooks/use-theme";

interface PageHeaderProps {
  title: string;
  color: string;
  onMenu: () => void;
  right?: React.ReactNode;
}

export function PageHeader({ title, color, onMenu, right }: PageHeaderProps) {
  const [, navigate] = useLocation();
  const { isLight, toggleTheme } = useTheme();

  return (
    <div
      className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
      style={{
        background:    "var(--t-surface)",
        paddingTop:    "calc(env(safe-area-inset-top, 0px) + 14px)",
        paddingBottom: "14px",
      }}
    >
      <button
        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors -ml-1"
        style={{ color: "var(--t-text5)" }}
        onClick={onMenu}
        data-testid="button-menu"
      >
        <Menu size={20} />
      </button>
      <button
        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
        style={{ color: "var(--t-text5)" }}
        onClick={() => navigate("/")}
        data-testid="button-back"
      >
        <ArrowLeft size={20} />
      </button>
      <span
        className="text-base font-bold tracking-tight flex-1"
        style={{ fontFamily: "'Space Mono', monospace", color }}
      >
        {title}
      </span>
      {right}
      <button
        className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
        style={{ color: "var(--t-text6)" }}
        onClick={toggleTheme}
        title={isLight ? "Switch to dark mode" : "Switch to light mode"}
        data-testid="button-theme-toggle"
      >
        {isLight ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </div>
  );
}
