import { useState, useEffect } from "react";

type Theme = "dark" | "light";

/**
 * useTheme — manages light/dark mode with localStorage persistence.
 *
 * The initial class is applied before React loads via an inline script in
 * index.html, so there is no flash of wrong theme on load. This hook just
 * keeps React state in sync with the DOM class and provides the toggle.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void; isLight: boolean } {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("light-mode") ? "light" : "dark"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("light-mode", theme === "light");
    try {
      localStorage.setItem("remi-theme", theme);
    } catch {
      // storage unavailable — not fatal
    }
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    isLight: theme === "light",
  };
}
