import type { Message } from "../sim/types";

/**
 * Short synthesized cues, built from oscillators and gain envelopes with the
 * Web Audio API. No audio files. Everything here is best effort: when the API
 * is missing, the player muted the game, or no gesture has unlocked audio yet,
 * `playSound` silently does nothing.
 */

export type SoundName = "act" | "refuse" | "month" | "good" | "bad" | "decision" | "fanfare";

const STORAGE_KEY = "deal-atlas.sound.muted";
const MASTER_VOLUME = 0.15;

// ---------------------------------------------------------------------------
// Mute preference
// ---------------------------------------------------------------------------

let muted: boolean | null = null;

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function readMuted(): boolean {
  try {
    const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    if (stored === "true" || stored === "false") {
      return stored === "true";
    }
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  // Sound is on by default, except for players who asked their system for less motion.
  return prefersReducedMotion();
}

export function isMuted(): boolean {
  if (muted === null) {
    muted = readMuted();
  }
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(next));
    }
  } catch {
    // The choice still holds for this session.
  }
}

// ---------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------

interface Tone {
  wave: OscillatorType;
  /** Hz. With `glideTo` the pitch slides there over the length of the tone. */
  frequency: number;
  glideTo?: number;
  /** Seconds from the start of the cue. */
  at: number;
  attack: number;
  length: number;
  /** Peak level, 0–1, before the master volume. */
  level: number;
}

interface Noise {
  at: number;
  length: number;
  level: number;
  /** Band-pass centre, Hz, sliding from `from` to `to`. */
  from: number;
  to: number;
}

interface Cue {
  tones: Tone[];
  noise?: Noise;
  /** The same cue cannot start again within this many milliseconds. */
  gap: number;
  /** Message cues of equal or lower rank are dropped while one is sounding. */
  rank: number;
}

const tone = (
  wave: OscillatorType,
  frequency: number,
  at: number,
  length: number,
  level: number,
  extra: Partial<Tone> = {},
): Tone => ({ wave, frequency, at, length, level, attack: 0.008, ...extra });

/** Every cue lasts between 60 and 600 ms. */
export const CUES: Record<SoundName, Cue> = {
  // A soft tick.
  act: { gap: 120, rank: 0, tones: [tone("sine", 940, 0, 0.06, 0.45, { glideTo: 700, attack: 0.003 })] },
  // A low double blip.
  refuse: {
    gap: 200,
    rank: 0,
    tones: [tone("sine", 196, 0, 0.09, 0.7), tone("sine", 165, 0.12, 0.11, 0.7)],
  },
  // A page turning: a breath of filtered noise and a faint tick.
  month: {
    gap: 300,
    rank: 1,
    tones: [tone("sine", 520, 0.1, 0.05, 0.12, { attack: 0.004 })],
    noise: { at: 0, length: 0.16, level: 0.16, from: 2600, to: 1100 },
  },
  // Two notes up: C5, E5.
  good: {
    gap: 400,
    rank: 2,
    tones: [
      tone("sine", 523.25, 0, 0.16, 0.5),
      tone("sine", 659.25, 0.13, 0.24, 0.5),
      tone("triangle", 659.25, 0.13, 0.2, 0.1),
    ],
  },
  // Two notes down: G4, E♭4.
  bad: {
    gap: 400,
    rank: 2,
    tones: [
      tone("sine", 392, 0, 0.18, 0.5),
      tone("sine", 311.13, 0.15, 0.3, 0.5),
      tone("triangle", 311.13, 0.15, 0.24, 0.08),
    ],
  },
  // One clear chime: a fundamental with two quiet partials that die away sooner.
  decision: {
    gap: 500,
    rank: 3,
    tones: [
      tone("sine", 880, 0, 0.55, 0.55, { attack: 0.004 }),
      tone("sine", 1760, 0, 0.3, 0.14, { attack: 0.004 }),
      tone("sine", 2637, 0, 0.16, 0.05, { attack: 0.004 }),
    ],
  },
  // Three notes: C5, E5, G5, the last one held.
  fanfare: {
    gap: 600,
    rank: 3,
    tones: [
      tone("triangle", 523.25, 0, 0.14, 0.34),
      tone("triangle", 659.25, 0.12, 0.14, 0.34),
      tone("triangle", 783.99, 0.24, 0.34, 0.36),
      tone("sine", 1567.98, 0.24, 0.26, 0.08),
    ],
  },
};

/** How long a cue sounds, in seconds. */
export function cueLength(name: SoundName): number {
  const cue = CUES[name];
  const ends = cue.tones.map((part) => part.at + part.length);
  if (cue.noise) {
    ends.push(cue.noise.at + cue.noise.length);
  }
  return Math.max(...ends);
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

type AudioContextClass = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let failed = false;
let unlocked = false;
let listening = false;

const lastStart = new Map<SoundName, number>();
let busyUntil = 0;
let busyRank = 0;

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function contextClass(): AudioContextClass | null {
  if (typeof window === "undefined") {
    return null;
  }
  const scope = window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function ensureContext(): AudioContext | null {
  if (context || failed) {
    return context;
  }
  const Class = contextClass();
  if (!Class) {
    failed = true;
    return null;
  }
  try {
    context = new Class();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);
  } catch {
    context = null;
    master = null;
    failed = true;
  }
  return context;
}

/** Browsers only let audio start after a gesture; the first one unlocks it. */
function unlock(): void {
  unlocked = true;
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchend", unlock, true);
  }
  if (isMuted()) {
    return;
  }
  const audio = ensureContext();
  if (audio && audio.state === "suspended") {
    audio.resume().catch(() => undefined);
  }
}

function listenForGesture(): void {
  if (listening || typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return;
  }
  listening = true;
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchend", unlock, true);
}

listenForGesture();

function hasGesture(): boolean {
  if (unlocked) {
    return true;
  }
  const activation = typeof navigator === "undefined" ? undefined : navigator.userActivation;
  return activation?.hasBeenActive === true;
}

function scheduleTone(audio: AudioContext, out: AudioNode, part: Tone, start: number): void {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const begin = start + part.at;
  const end = begin + part.length;
  oscillator.type = part.wave;
  oscillator.frequency.setValueAtTime(part.frequency, begin);
  if (part.glideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(part.glideTo, end);
  }
  // Fast soft attack, exponential decay to silence: no clicks at either end.
  gain.gain.setValueAtTime(0.0001, begin);
  gain.gain.linearRampToValueAtTime(part.level, begin + part.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(out);
  oscillator.start(begin);
  oscillator.stop(end + 0.02);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

function scheduleNoise(audio: AudioContext, out: AudioNode, part: Noise, start: number): void {
  const frames = Math.max(1, Math.floor(audio.sampleRate * part.length));
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  const begin = start + part.at;
  const end = begin + part.length;
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(part.from, begin);
  filter.frequency.exponentialRampToValueAtTime(part.to, end);
  gain.gain.setValueAtTime(0.0001, begin);
  gain.gain.linearRampToValueAtTime(part.level, begin + part.length * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  source.start(begin);
  source.stop(end + 0.02);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/** Plays a short synthesized cue. Silent when muted or before the first user gesture. */
export function playSound(name: SoundName): void {
  try {
    const cue = CUES[name];
    if (!cue || isMuted() || !hasGesture()) {
      return;
    }
    const time = now();
    // The same cue never stacks: a slider sending many commands ticks at most a few times a second.
    if (time - (lastStart.get(name) ?? -Infinity) < Math.max(80, cue.gap)) {
      return;
    }
    // A month can bring several messages at once: let the most important one speak.
    if (cue.rank > 0 && time < busyUntil && cue.rank <= busyRank) {
      return;
    }
    const audio = ensureContext();
    if (!audio || !master) {
      return;
    }
    if (audio.state === "suspended") {
      audio.resume().catch(() => undefined);
    }
    lastStart.set(name, time);
    if (cue.rank > 0) {
      busyUntil = time + cueLength(name) * 1000;
      busyRank = cue.rank;
    }
    const start = audio.currentTime + 0.01;
    for (const part of cue.tones) {
      scheduleTone(audio, master, part, start);
    }
    if (cue.noise) {
      scheduleNoise(audio, master, cue.noise, start);
    }
  } catch {
    // Sound is decoration; a failed cue must never break a command.
  }
}

// ---------------------------------------------------------------------------
// Messages → cues
// ---------------------------------------------------------------------------

/**
 * The cue for each message type when it is addressed to the player and asks
 * for nothing. A `Record` over the union, so a new message type does not
 * compile until it has been given a cue or an explicit `null`.
 */
export const MESSAGE_SOUNDS: Record<Message["type"], SoundName | null> = {
  welcome: null,
  rate_changed: null,
  phase_changed: null,
  owner_opened: "good",
  owner_declined: "bad",
  sale_early_notice: null,
  sale_started: null,
  sale_withdrawn: null,
  sale_failed: null,
  rival_deal: null,
  auction_lost: "bad",
  final_round: null,
  regulator_blocked: "bad",
  event: null,
  achievement_unlocked: "good",
  objectives_review: null,
  diligence_report: null,
  committee_decision: null,
  deal_closed: "fanfare",
  deal_broken: "bad",
  initiative_done: "good",
  issue_surfaced: "bad",
  strike: "bad",
  covenant_breach: "bad",
  lenders_took_keys: "bad",
  refinanced: null,
  recap_paid: "good",
  add_on_closed: null,
  exit_offer: null,
  exit_pulled: null,
  exit_closed: "fanfare",
  proceeds_received: "good",
  quarter_report: null,
  investment_period_ended: null,
  fund_term_ended: null,
  next_fund: "fanfare",
  promotion: "fanfare",
  fired: "bad",
};

/** The cue a new message deserves, if any. */
export function soundFor(message: Message): SoundName | null {
  if (message.decision && message.decision.chosen === null) {
    return "decision";
  }
  if (message.news) {
    return null;
  }
  return MESSAGE_SOUNDS[message.type] ?? null;
}
