import type { Message } from "../sim/types";

export type SoundName = "act" | "refuse" | "month" | "good" | "bad" | "decision" | "fanfare";

export function isMuted(): boolean {
  return true;
}

export function setMuted(_muted: boolean): void {}

/** Plays a short synthesized cue. Silent when muted or before the first user gesture. */
export function playSound(_name: SoundName): void {}

/** The cue a new message deserves, if any. */
export function soundFor(_message: Message): SoundName | null {
  return null;
}
