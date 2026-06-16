// Shared Master Tasks "Category" constants — the single source of truth for the
// category select options and their color-by-context identity. Imported by
// Tasks.tsx (cards + list), Scheduler.tsx, and SundaySweep.tsx so the values
// never drift between surfaces.

// Assignable work-mode categories (no "All"). Must match the backend
// _ALLOWED_TASK_CATEGORIES set exactly.
export const CATEGORY_OPTIONS = [
  "Communication", "Filming", "Admin", "Writing", "Family", "Studio", "General",
] as const;

// Per-category colors — color-by-context identity from the redesign. Hex values
// mirror the design-system.css context tokens (--color-studio etc.); kept as hex
// so the `color + "33"` alpha-concat pattern works.
export const CATEGORY_COLORS: Record<string, string> = {
  Studio:        "#3dd6b0",  // --color-studio   (teal)
  Communication: "#9b8de8",  // --color-tonight  (purple)
  Admin:         "#378add",  // --color-calls    (blue)
  Writing:       "#d4537e",  // --color-personal (pink)
  Family:        "#9b8de8",  // --color-tonight  (purple)
  Filming:       "#e8831a",  // orange (no token)
  General:       "#888890",  // --text-secondary (gray, readable)
};

// Muted gray for the "uncategorized" affordance and the Unsorted group.
export const CATEGORY_EMPTY = "#888890";  // --text-secondary
