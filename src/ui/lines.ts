import { messages } from "../i18n/messages";

/**
 * Spoken lines come in variants: `base.1`, `base.2`, … in the Korean catalog, which every
 * locale mirrors. A scene picks one by a seed made of what it knows (the company, the month,
 * the relationship), so the same meeting reads the same when reopened and a new one reads
 * differently.
 */
const counts = new Map<string, number>();

export function variants(base: string): number {
  const known = counts.get(base);
  if (known !== undefined) {
    return known;
  }
  let count = 0;
  while (messages[`${base}.${count + 1}`] !== undefined) {
    count += 1;
  }
  counts.set(base, count);
  return count;
}

/** The message id of one variant of `base`. A base without variants is its own id. */
export function pick(base: string, seed: number): string {
  const count = variants(base);
  if (count === 0) {
    return base;
  }
  return `${base}.${(Math.abs(Math.trunc(seed)) % count) + 1}`;
}
