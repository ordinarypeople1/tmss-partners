export type Mood = "neutral" | "for" | "hold" | "against";

/**
 * An ink-line portrait with one accent color. `partner` 0–5 draws that
 * committee seat; otherwise `seed` picks the parts, so the same person always
 * looks the same.
 */
export function Portrait(_props: { seed?: string; partner?: number; mood?: Mood; size?: number }) {
  return null;
}
