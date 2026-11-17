/** Short selection pulse. Skipped when the player asked for less motion. */
export function pulseSelection(reducedMotion: boolean): void {
  if (reducedMotion || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  navigator.vibrate(8);
}
