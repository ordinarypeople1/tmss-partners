/** Thousandths of a turn. 7200 means 7.200x. The multiply lives in sim-core. */
export function multipleToMillis(multiple: number): number {
  if (!Number.isFinite(multiple) || multiple < 0) {
    throw new Error("multiple must be non-negative");
  }
  return Math.round(multiple * 1000);
}
