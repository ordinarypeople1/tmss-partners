const KEY = "deal-atlas-shortlist";

export function readShortlist(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function toggleShortlist(id: string): string[] {
  const current = readShortlist();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("deal-atlas-shortlist"));
  return next;
}

let pendingQuery = "";

export function setSearchQuery(value: string) {
  pendingQuery = value;
  window.dispatchEvent(new CustomEvent("deal-atlas-search", { detail: value }));
}

export function takeSearchQuery(): string {
  const value = pendingQuery;
  pendingQuery = "";
  return value;
}
