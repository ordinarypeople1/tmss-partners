const KEY = "deal-atlas-theme";

export type ThemeChoice = "light" | "dark" | "system";

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    return "system";
  }
  return "system";
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#12100E" : "#F6F3EE");
  window.dispatchEvent(new Event("deal-atlas-theme"));
}

export function storeTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* private mode */
  }
  applyTheme(choice);
}

export function resolvedTheme(): "light" | "dark" {
  const choice = readTheme();
  if (choice === "light" || choice === "dark") {
    return choice;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
