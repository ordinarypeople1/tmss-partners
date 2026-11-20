/** Light or dark. The choice is kept on this device; without one the system setting decides. */
export type Theme = "light" | "dark";

const KEY = "deal-atlas.theme";

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  return stored() ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

const listeners = new Set<(theme: Theme) => void>();

export function applyTheme(theme: Theme, remember = false): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0f1319" : "#fafafb");
  if (remember) {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      // The theme still applies for this visit.
    }
  }
  listeners.forEach((listener) => listener(theme));
}

export function onTheme(listener: (theme: Theme) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A CSS token as the map and canvas code need it: a plain colour string. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
