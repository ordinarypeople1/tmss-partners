import { useId, type ReactNode } from "react";
import "./Portrait.css";

/**
 * Ink-line portraits with one accent color, drawn as SVG by code.
 *
 * A face is a `Spec` (plain indices and flags). The six committee partners are
 * fixed specs; everybody else gets a spec from a hash of their name, so the
 * same person always looks the same. Mood only moves the brows, the mouth and
 * the tilt of the head.
 *
 * Geometry: viewBox 0 0 100 120, the face is centred on x = 50, the skull tops
 * out at y = 26, eyes sit on y = 57. Points are written as [dx, y] with dx
 * measured from the centre line, so shapes mirror by negating dx.
 */

export type Mood = "neutral" | "for" | "hold" | "against";

export interface Spec {
  /** 0 masculine, 1 feminine presentation. */
  presentation: number;
  /** Index into SKIN, light to deep. */
  skin: number;
  head: number;
  hair: number;
  /** 0 dark, 1 brown, 2 light, 3 grey. */
  hairTone: number;
  beardTone: number;
  brows: number;
  eyes: number;
  /** 0 none, 1 round, 2 rectangular, 3 browline. */
  glasses: number;
  nose: number;
  mouth: number;
  /** 0 none, 1 short beard, 2 moustache, 3 goatee. */
  facialHair: number;
  /** 0 no lines, 1 light, 2 marked. */
  age: number;
  /** 0 none, 1 studs, 2 drops. */
  earrings: number;
  clothing: number;
  /** Dark cloth for the outer garment. */
  dark: boolean;
  /** Index into ACCENTS. */
  accent: number;
  /** Where the one accent color goes: 0 garment, 1 glasses, 2 earrings, 3 pin. */
  accentOn: number;
}

/** How many options each part has; the tests check that seeds reach all of them. */
export const PART_OPTIONS: Record<keyof Spec, number> = {
  presentation: 2,
  skin: 6,
  head: 6,
  hair: 16,
  hairTone: 4,
  beardTone: 4,
  brows: 3,
  eyes: 3,
  glasses: 4,
  nose: 3,
  mouth: 3,
  facialHair: 4,
  age: 3,
  earrings: 3,
  clothing: 7,
  dark: 2,
  accent: 4,
  accentOn: 4,
};

// ---------------------------------------------------------------------------
// Data tables
// ---------------------------------------------------------------------------

/** Flat skin tints, light to deep. The only fill besides hair, cloth and the accent. */
export const SKIN = ["#f7e4d3", "#f0d5b8", "#e4c09a", "#d0a179", "#aa7852", "#85593e"] as const;

const ACCENTS = ["var(--accent)", "var(--s1)", "var(--s3)", "var(--s4)"] as const;

const INK = "var(--ink)";
const PAPER = "var(--raised)";
const mix = (percent: number) => `color-mix(in srgb, var(--ink) ${percent}%, var(--raised))`;

/** Hair tones stay in the ink family: `fill` for the mass, `strand` for lines drawn on it. */
const HAIR_TONES = [
  { fill: mix(92), strand: PAPER, strandOpacity: 0.5 },
  { fill: mix(60), strand: PAPER, strandOpacity: 0.6 },
  { fill: mix(13), strand: INK, strandOpacity: 0.55 },
  { fill: mix(32), strand: INK, strandOpacity: 0.5 },
] as const;

const CLOTH_DARK = mix(86);

/** Line weights, in viewBox units. */
const W = { contour: 1.9, feature: 1.5, fine: 0.9 } as const;

interface Head {
  /** Half widths at the temple, the cheek and the jaw corner. */
  hw: number;
  cw: number;
  jw: number;
  /** Half width and height of the chin. */
  chin: number;
  cy: number;
}

const HEADS: Head[] = [
  { hw: 19, cw: 18, jw: 13.5, chin: 6, cy: 86 }, // oval
  { hw: 20, cw: 19.8, jw: 15.8, chin: 7.5, cy: 84.5 }, // round
  { hw: 20.5, cw: 20.2, jw: 17.6, chin: 9.5, cy: 85.5 }, // broad
  { hw: 18, cw: 17, jw: 13, chin: 6.5, cy: 88.5 }, // long
  { hw: 19.4, cw: 17.2, jw: 11.8, chin: 4.8, cy: 86 }, // heart
  { hw: 19, cw: 18.5, jw: 16, chin: 7.8, cy: 87 }, // strong jaw
];

const CLOTHING = {
  suit: 0,
  openCollar: 1,
  blouse: 2,
  turtleneck: 3,
  cardigan: 4,
  workJacket: 5,
  tailored: 6,
} as const;

const HAIR = {
  bald: 0,
  receding: 1,
  crop: 2,
  sidePart: 3,
  quiff: 4,
  shortNatural: 5,
  afro: 6,
  locsUp: 7,
  longLocs: 8,
  bob: 9,
  longStraight: 10,
  longWavy: 11,
  bun: 12,
  pixie: 13,
  curly: 14,
  fringe: 15,
} as const;

/** Styles that fall over the ears; earrings are not drawn (or chosen) with these. */
const COVERS_EARS = new Set<number>([
  HAIR.afro,
  HAIR.longLocs,
  HAIR.bob,
  HAIR.longStraight,
  HAIR.longWavy,
  HAIR.curly,
  HAIR.fringe,
]);

/** The six committee seats, in seat order. */
export const PARTNERS: Spec[] = [
  // 0 Richard Calloway: chair, 60s, grey receding hair, dark suit, accent tie.
  {
    presentation: 0, skin: 0, head: 3, hair: HAIR.receding, hairTone: 3, beardTone: 3,
    brows: 2, eyes: 0, glasses: 0, nose: 0, mouth: 2, facialHair: 0, age: 2, earrings: 0,
    clothing: CLOTHING.suit, dark: true, accent: 0, accentOn: 0,
  },
  // 1 Marcus Bell: industrials, 50s, close crop, short greying beard, open collar under a jacket.
  {
    presentation: 0, skin: 5, head: 5, hair: HAIR.crop, hairTone: 0, beardTone: 3,
    brows: 2, eyes: 1, glasses: 0, nose: 1, mouth: 0, facialHair: 1, age: 1, earrings: 0,
    clothing: CLOTHING.openCollar, dark: false, accent: 0, accentOn: 3,
  },
  // 2 Grace Lin: growth, 40s, shoulder-length bob, fine-rimmed glasses, blouse with an accent scarf.
  {
    presentation: 1, skin: 1, head: 0, hair: HAIR.bob, hairTone: 0, beardTone: 0,
    brows: 0, eyes: 2, glasses: 1, nose: 2, mouth: 1, facialHair: 0, age: 0, earrings: 0,
    clothing: CLOTHING.blouse, dark: false, accent: 0, accentOn: 0,
  },
  // 3 Elena Marchetti: special situations, 50s, dark hair pulled back, sharp tailoring.
  {
    presentation: 1, skin: 1, head: 4, hair: HAIR.bun, hairTone: 0, beardTone: 0,
    brows: 1, eyes: 0, glasses: 0, nose: 0, mouth: 2, facialHair: 0, age: 1, earrings: 1,
    clothing: CLOTHING.tailored, dark: true, accent: 0, accentOn: 0,
  },
  // 4 Tom Kowalski: operating partner, 50s, broad face, short hair, no tie, work jacket.
  {
    presentation: 0, skin: 0, head: 2, hair: HAIR.sidePart, hairTone: 2, beardTone: 2,
    brows: 0, eyes: 1, glasses: 0, nose: 1, mouth: 0, facialHair: 0, age: 1, earrings: 0,
    clothing: CLOTHING.workJacket, dark: false, accent: 0, accentOn: 0,
  },
  // 5 Simone Carter: investor relations, 40s, locs worn up, accent statement earrings, tailored jacket.
  {
    presentation: 1, skin: 4, head: 0, hair: HAIR.locsUp, hairTone: 0, beardTone: 0,
    brows: 1, eyes: 0, glasses: 0, nose: 1, mouth: 1, facialHair: 0, age: 0, earrings: 2,
    clothing: CLOTHING.tailored, dark: false, accent: 0, accentOn: 2,
  },
];

// ---------------------------------------------------------------------------
// Seed → spec
// ---------------------------------------------------------------------------

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks an index with the given weights. A weight of 0 is never picked. */
function weighted(random: () => number, weights: number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  let last = 0;
  for (let index = 0; index < weights.length; index += 1) {
    if (weights[index] <= 0) {
      continue;
    }
    last = index;
    roll -= weights[index];
    if (roll < 0) {
      return index;
    }
  }
  return last;
}

/** Weights by hair index, for each presentation and for straight or textured hair. */
function hairWeights(presentation: number, textured: boolean): number[] {
  const weights = new Array<number>(PART_OPTIONS.hair).fill(0);
  const set = (entries: [number, number][]) => {
    for (const [style, weight] of entries) {
      weights[style] = weight;
    }
  };
  if (presentation === 0) {
    set(
      textured
        ? [[HAIR.bald, 14], [HAIR.receding, 8], [HAIR.crop, 34], [HAIR.shortNatural, 26], [HAIR.afro, 8], [HAIR.longLocs, 10]]
        : [[HAIR.bald, 10], [HAIR.receding, 17], [HAIR.crop, 19], [HAIR.sidePart, 30], [HAIR.quiff, 24]],
    );
  } else {
    set(
      textured
        ? [[HAIR.shortNatural, 14], [HAIR.afro, 14], [HAIR.locsUp, 18], [HAIR.longLocs, 18], [HAIR.curly, 14], [HAIR.bun, 10], [HAIR.bob, 12]]
        : [[HAIR.bob, 20], [HAIR.longStraight, 17], [HAIR.longWavy, 17], [HAIR.bun, 14], [HAIR.pixie, 10], [HAIR.curly, 8], [HAIR.fringe, 14]],
    );
  }
  return weights;
}

/** The face for a name. Pure: the same seed always gives the same spec. */
export function portraitSpec(seed: string): Spec {
  const random = generator(hash(seed));
  const presentation = random() < 0.5 ? 0 : 1;
  const skin = weighted(random, [19, 18, 17, 15, 16, 15]);
  const age = weighted(random, [30, 44, 26]);
  const head = weighted(random, presentation === 0 ? [20, 14, 20, 16, 8, 22] : [26, 18, 8, 16, 22, 10]);

  const texturedChance = [0.03, 0.04, 0.14, 0.45, 0.85, 0.9][skin];
  const hair = weighted(random, hairWeights(presentation, random() < texturedChance));
  const greyChance = [0.02, 0.22, 0.72][age];
  const naturalTone = weighted(random, skin <= 1 ? [38, 36, 26] : skin === 2 ? [62, 34, 4] : [88, 12, 0]);
  const hairTone = random() < greyChance ? 3 : naturalTone;
  const beardTone = age === 2 && random() < 0.6 ? 3 : hairTone;

  const brows = weighted(random, presentation === 0 ? [36, 22, 42] : [36, 46, 18]);
  const eyes = weighted(random, skin <= 2 ? [36, 30, 34] : [42, 44, 14]);
  const glasses = weighted(random, age === 0 ? [70, 12, 10, 8] : [56, 14, 16, 14]);
  const nose = weighted(random, [36, 34, 30]);
  const mouth = weighted(random, presentation === 0 ? [46, 20, 34] : [34, 46, 20]);
  const facialHair = presentation === 0 ? weighted(random, [58, 20, 8, 14]) : 0;
  const wantsEarrings = presentation === 1 ? weighted(random, [22, 44, 34]) : 0;
  const earrings = COVERS_EARS.has(hair) ? 0 : wantsEarrings;
  const clothing = weighted(
    random,
    presentation === 0 ? [36, 24, 0, 9, 8, 19, 4] : [0, 10, 24, 12, 14, 12, 28],
  );
  const dark = random() < 0.5;
  const accent = weighted(random, [52, 16, 16, 16]);

  // One accent per portrait: the garment by default, otherwise an accessory the face has.
  const spots = [0];
  if (glasses > 0) {
    spots.push(1);
  }
  if (earrings > 0) {
    spots.push(2);
  }
  if (clothing !== CLOTHING.suit) {
    spots.push(3);
  }
  const accentOn = random() < 0.45 ? 0 : spots[Math.floor(random() * spots.length)];

  return {
    presentation, skin, head, hair, hairTone, beardTone, brows, eyes, glasses, nose, mouth,
    facialHair, age, earrings, clothing, dark, accent, accentOn,
  };
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

type Pt = [number, number];

const n = (value: number) => String(Math.round(value * 10) / 10);
const at = ([dx, y]: Pt) => `${n(50 + dx)},${n(y)}`;

/** A smooth curve through the points (Catmull-Rom), without the leading "M". */
function curve(points: Pt[], closed = false): string {
  const count = points.length;
  const get = (index: number): Pt =>
    closed ? points[(index + count) % count] : points[Math.max(0, Math.min(count - 1, index))];
  let d = at(points[0]);
  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index += 1) {
    const [p0, p1, p2, p3] = [get(index - 1), get(index), get(index + 1), get(index + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${at(c1)} ${at(c2)} ${at(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

/** Small outward bumps between the points: the edge of curly and natural hair. */
function scallop(points: Pt[], bump: number, centre: Pt): string {
  let d = at(points[0]);
  for (let index = 1; index < points.length; index += 1) {
    const [a, b] = [points[index - 1], points[index]];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const out: Pt = [mid[0] - centre[0], mid[1] - centre[1]];
    const length = Math.hypot(out[0], out[1]) || 1;
    d += ` Q${at([mid[0] + (out[0] / length) * bump, mid[1] + (out[1] / length) * bump])} ${at(b)}`;
  }
  return d;
}

/** Points along an ellipse; angles in degrees, counter-clockwise from the right, y up. */
function arc(centre: Pt, rx: number, ry: number, from: number, to: number, steps: number): Pt[] {
  const points: Pt[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = ((from + ((to - from) * index) / steps) * Math.PI) / 180;
    points.push([centre[0] + rx * Math.cos(angle), centre[1] - ry * Math.sin(angle)]);
  }
  return points;
}

/** Adds points so that no two neighbours are further apart than `step`. */
function densify(points: Pt[], step: number): Pt[] {
  const result: Pt[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const [a, b] = [points[index - 1], points[index]];
    const parts = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let part = 1; part <= parts; part += 1) {
      result.push([a[0] + ((b[0] - a[0]) * part) / parts, a[1] + ((b[1] - a[1]) * part) / parts]);
    }
  }
  return result;
}

/** Completes a half (ending on the centre line) with its mirror image. */
function sym(half: Pt[]): Pt[] {
  const mirrored = half
    .slice(0, -1)
    .reverse()
    .map(([dx, y]): Pt => [-dx, y]);
  return [...half, ...mirrored];
}

const flip = (points: Pt[]): Pt[] => points.map(([dx, y]): Pt => [-dx, y]);

function headPath(h: Head): string {
  return curve(
    sym([
      [-h.chin, h.cy - 1.4],
      [-h.jw, 75.5],
      [-h.cw, 65],
      [-(h.hw - 0.2), 54],
      [-h.hw, 43],
      [-h.hw * 0.88, 33.5],
      [-h.hw * 0.52, 27.6],
      [0, 26],
    ]).concat([[0, h.cy]]),
    true,
  );
}

/** The outer edge of short hair, left sideburn over the crown to the right sideburn. */
function cap(h: Head, volume: number, side: number, end: number): Pt[] {
  return sym([
    [-(h.hw + side), end],
    [-(h.hw + side + 0.2), 44],
    [-(h.hw * 0.9 + side * 0.9), 33.6 - volume * 0.35],
    [-(h.hw * 0.55 + side * 0.4), 27.4 - volume * 0.85],
    [0, 26 - volume],
  ]);
}

// ---------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------

interface HairShape {
  /** Filled masses behind the head and neck. */
  back?: string[];
  /** Filled masses over the forehead and temples. */
  front?: string[];
  /** Thin lines drawn on the front masses. */
  strands?: string[];
  /** Dashed lines: braids and locs. */
  braids?: string[];
}

const shape = (outer: Pt[], inner: Pt[]) => `M${curve(outer)} L${curve(inner)} Z`;
const line = (points: Pt[]) => `M${curve(points)}`;

/** A hairline for short hair, right temple to left temple. */
function hairline(h: Head, end: number, temple: number, brow: number): Pt[] {
  return sym([
    [h.hw - 0.6, end],
    [h.hw - 1.8, 47.5],
    [h.hw - 3.4, temple],
    [8, brow + 0.6],
    [0, brow],
  ]);
}

/** Long hair: an outer fall and the two inner edges beside the face. */
function fall(h: Head, length: number, spread: number, crown: number, parting: Pt[]): string {
  const outer = sym([
    [-(h.hw + spread - 2), length],
    [-(h.hw + spread), length - 12],
    [-(h.hw + 5), 50],
    [-(h.hw * 0.9 + 3.2), 33],
    [-(h.hw * 0.55 + 1.2), 26.6 - crown * 0.8],
    [0, 26 - crown],
  ]);
  const inner: Pt[] = [
    [h.hw - 0.4, length],
    [h.hw - 1.6, 72],
    [h.hw - 2.2, 58],
    [h.hw - 3.4, 47],
    ...parting,
    [-(h.hw - 3.4), 47],
    [-(h.hw - 2.2), 58],
    [-(h.hw - 1.6), 72],
    [-(h.hw - 0.4), length],
  ];
  return shape(outer, inner);
}

/** The mass behind the neck for hair that falls below the jaw. */
function behind(h: Head, length: number, spread: number): string {
  return `M${curve([
    [-(h.hw + spread - 2), length],
    [-(h.hw + spread), length - 12],
    [-(h.hw + 4), 46],
    [0, 36],
    [h.hw + 4, 46],
    [h.hw + spread, length - 12],
    [h.hw + spread - 2, length],
  ])} Z`;
}

const HAIR_SHAPES: ((h: Head) => HairShape)[] = [
  // 0 bald: a short fringe above each ear
  (h) => {
    const patch: Pt[] = [[h.hw + 0.9, 57], [h.hw + 1.1, 50], [h.hw - 0.6, 44.5]];
    const inner: Pt[] = [[h.hw - 2.8, 46.5], [h.hw - 2.2, 51.5], [h.hw - 1, 57]];
    return { front: [shape(patch, inner), shape(flip(patch), flip(inner))] };
  },
  // 1 receding: thin on top, back at the temples
  (h) => ({
    front: [
      shape(
        cap(h, 1.5, 0.9, 57),
        sym([[h.hw - 0.6, 57], [h.hw - 1.7, 48], [h.hw - 3, 40.5], [h.hw - 5.6, 33.8], [h.hw - 8.4, 30.4], [5, 32.2], [0, 32.8]]),
      ),
    ],
    strands: [line([[-3, 32], [-4.5, 28.5], [-7, 26.6]]), line([[3.5, 32], [6, 28.6], [9, 27.2]])],
  }),
  // 2 close crop
  (h) => ({
    front: [shape(cap(h, 1, 0.5, 56), sym([[h.hw - 0.7, 56], [h.hw - 1.6, 48], [h.hw - 2.6, 41], [h.hw - 5, 36.6], [8, 35.3], [0, 35]]))],
  }),
  // 3 short with a side part
  (h) => ({
    front: [
      shape(cap(h, 3.4, 1.1, 57), [
        [h.hw - 0.6, 57], [h.hw - 1.8, 48], [h.hw - 3.5, 40.8], [h.hw - 9, 36], [0, 34.4], [-8, 34.6],
        [-(h.hw - 4), 38.6], [-(h.hw - 2), 47.5], [-(h.hw - 0.6), 57],
      ]),
    ],
    strands: [
      line([[-9.5, 34.4], [-10.5, 30], [-9.6, 25.6]]),
      line([[-3, 33.6], [2, 28.6], [9, 26.2]]),
      line([[5, 34.2], [10, 30.4], [15, 30.6]]),
    ],
  }),
  // 4 short with height on top
  (h) => ({
    front: [
      shape(
        [
          [-(h.hw + 0.9), 56], [-(h.hw + 1.1), 44], [-(h.hw * 0.9 + 1.2), 32], [-(h.hw * 0.55 + 1), 23.2], [-3, 19.6],
          [5, 19.8], [h.hw * 0.55 + 2, 22.4], [h.hw * 0.9 + 1.2, 31], [h.hw + 1.1, 44], [h.hw + 0.9, 56],
        ],
        [
          [h.hw - 0.6, 56], [h.hw - 2, 47], [h.hw - 4, 39.6], [7, 35.2], [0, 34.2], [-7, 34.8],
          [-(h.hw - 4), 39.6], [-(h.hw - 2), 47], [-(h.hw - 0.6), 56],
        ],
      ),
    ],
    strands: [
      line([[-8, 34], [-6, 27], [0, 22.6]]),
      line([[-1, 33.4], [2, 27], [8, 23.4]]),
      line([[6, 34.2], [9.5, 29], [14, 27]]),
    ],
  }),
  // 5 short natural hair
  (h) => ({
    front: [
      `M${scallop(arc([0, 43], h.hw + 3, 21, 212, -32, 17), 1.3, [0, 44])} L${curve(hairline(h, 54.2, 39.6, 35.2))} Z`,
    ],
  }),
  // 6 fuller natural hair
  (h) => ({
    front: [
      `M${scallop(arc([0, 44], h.hw + 8, 27, 217, -37, 21), 1.8, [0, 46])} L${curve(hairline(h, 60, 39.6, 35))} Z`,
    ],
  }),
  // 7 locs worn up
  (h) => ({
    back: [curve(arc([0, 17.5], 12.5, 9.8, 0, 340, 17), true)],
    front: [shape(cap(h, 1.7, 0.9, 55), hairline(h, 55, 39.4, 33.8))],
    braids: [
      line([[-13, 35.5], [-10, 29], [-6.5, 25]]),
      line([[-7, 33.6], [-5.5, 28.6], [-3, 24.6]]),
      line([[0, 33], [0, 28.4], [0, 24.4]]),
      line([[7, 33.6], [5.5, 28.6], [3, 24.6]]),
      line([[13, 35.5], [10, 29], [6.5, 25]]),
      line([[-9.5, 18.5], [-3, 12.6], [6, 11.4]]),
      line([[-8, 23], [0, 16.4], [10, 15.6]]),
    ],
  }),
  // 8 long locs or braids
  (h) => ({
    back: [behind(h, 104, 7.5)],
    front: [fall(h, 104, 7.5, 2.6, [[h.hw - 7, 38.4], [2.2, 31.6], [0, 30.8], [-2.2, 31.6], [-(h.hw - 7), 38.4]])],
    braids: [
      line([[-(h.hw + 3.6), 50], [-(h.hw + 4.6), 76], [-(h.hw + 3.6), 102]]),
      line([[-(h.hw + 0.8), 50], [-(h.hw + 1.4), 76], [-(h.hw + 0.8), 102]]),
      line([[h.hw + 3.6, 50], [h.hw + 4.6, 76], [h.hw + 3.6, 102]]),
      line([[h.hw + 0.8, 50], [h.hw + 1.4, 76], [h.hw + 0.8, 102]]),
      line([[-2.6, 30.6], [-9, 32], [-(h.hw - 1), 41]]),
      line([[-4, 26], [-12, 29], [-(h.hw + 1.8), 40]]),
      line([[2.6, 30.6], [9, 32], [h.hw - 1, 41]]),
      line([[4, 26], [12, 29], [h.hw + 1.8, 40]]),
    ],
  }),
  // 9 bob with a side part
  (h) => ({
    back: [behind(h, 90, 5.6)],
    front: [fall(h, 90, 5.6, 3, [[h.hw - 6.4, 39.4], [3, 33.4], [-7, 30.8], [-(h.hw - 6), 37.2]])],
    strands: [line([[-7.4, 30.6], [-8.6, 27], [-8, 23.6]]), line([[-2, 30.4], [8, 31], [h.hw - 2, 40]])],
  }),
  // 10 long and straight, centre part
  (h) => ({
    back: [behind(h, 122, 8.5)],
    front: [fall(h, 122, 8.5, 2.6, [[h.hw - 6.6, 39], [2.4, 31.4], [0, 30.6], [-2.4, 31.4], [-(h.hw - 6.6), 39]])],
    strands: [
      line([[0, 30.4], [0, 26.6], [0, 23.6]]),
      line([[-(h.hw + 3.6), 56], [-(h.hw + 5), 84], [-(h.hw + 5.4), 112]]),
      line([[h.hw + 3.6, 56], [h.hw + 5, 84], [h.hw + 5.4, 112]]),
    ],
  }),
  // 11 long and wavy, side part
  (h) => {
    const outer: Pt[] = [
      [-(h.hw + 5), 110], [-(h.hw + 9), 99], [-(h.hw + 6.4), 87], [-(h.hw + 8.6), 74], [-(h.hw + 5.6), 61],
      [-(h.hw + 6.2), 47], [-(h.hw * 0.9 + 3.6), 33], [-(h.hw * 0.55 + 1.4), 24.4], [0, 22.8],
      [h.hw * 0.55 + 1.4, 24.4], [h.hw * 0.9 + 3.6, 33], [h.hw + 6.2, 47], [h.hw + 5.6, 61], [h.hw + 8.6, 74],
      [h.hw + 6.4, 87], [h.hw + 9, 99], [h.hw + 5, 110],
    ];
    const inner: Pt[] = [
      [h.hw - 0.2, 110], [h.hw + 1.4, 97], [h.hw - 1.6, 84], [h.hw - 0.4, 71], [h.hw - 2.4, 58], [h.hw - 3.4, 47],
      [h.hw - 6.4, 39.4], [-2, 33], [-7.5, 30.8], [-(h.hw - 6), 37.4],
      [-(h.hw - 3.4), 47], [-(h.hw - 2.4), 58], [-(h.hw - 0.4), 71], [-(h.hw - 1.6), 84], [-(h.hw + 1.4), 97], [-(h.hw - 0.2), 110],
    ];
    return {
      back: [behind(h, 110, 8)],
      front: [shape(outer, inner)],
      strands: [
        line([[-7.8, 30.6], [-9, 27], [-8.4, 23.4]]),
        line([[-(h.hw + 3), 58], [-(h.hw + 5.4), 74], [-(h.hw + 3.2), 88], [-(h.hw + 5), 102]]),
        line([[h.hw + 3, 58], [h.hw + 5.4, 74], [h.hw + 3.2, 88], [h.hw + 5, 102]]),
      ],
    };
  },
  // 12 pulled back into a bun
  (h) => ({
    back: [curve(arc([0, 20.5], 9.6, 7.6, 0, 340, 15), true)],
    front: [shape(cap(h, 1.5, 0.7, 55), sym([[h.hw - 0.6, 55], [h.hw - 2, 46.6], [h.hw - 4.4, 39.2], [9, 34.2], [0, 32.8]]))],
    strands: [
      line([[-12, 35.4], [-8, 29.6], [-3.4, 26]]),
      line([[-5, 33.2], [-3, 28.8], [-1, 25.6]]),
      line([[5, 33.2], [3, 28.8], [1, 25.6]]),
      line([[12, 35.4], [8, 29.6], [3.4, 26]]),
    ],
  }),
  // 13 pixie with a swept fringe
  (h) => ({
    front: [
      shape(cap(h, 3.6, 1.5, 59), [
        [h.hw - 1.4, 59.5], [h.hw - 2, 50], [h.hw - 3, 43.4], [6, 41.6], [-4, 37.6], [-(h.hw - 7.4), 34.4],
        [-(h.hw - 4), 39.6], [-(h.hw - 2), 48.5], [-(h.hw - 1.4), 59.5],
      ]),
    ],
    strands: [
      line([[-(h.hw - 7.6), 34], [-10.4, 29.4], [-8.6, 24.6]]),
      line([[-6, 35.4], [3, 34.6], [11, 39.4]]),
      line([[-3, 31], [6, 30], [14, 35]]),
    ],
  }),
  // 14 shoulder-length curls
  (h) => {
    const outline = densify(
      sym([
        [-(h.hw + 4), 96], [-(h.hw + 10), 86], [-(h.hw + 11), 70], [-(h.hw + 8.6), 52], [-(h.hw + 4), 34],
        [-(h.hw - 6), 23], [0, 20.4],
      ]),
      6.4,
    );
    return {
      back: [behind(h, 96, 9)],
      front: [
        `M${scallop(outline, 1.8, [0, 60])} L${curve([
          [h.hw - 0.4, 96], [h.hw - 0.4, 82], [h.hw - 2.6, 70], [h.hw - 1.2, 58], [h.hw - 3.6, 47], [h.hw - 6, 39.6],
          [-2, 33.4], [-7, 31.2], [-(h.hw - 6), 38],
          [-(h.hw - 3.6), 47], [-(h.hw - 1.2), 58], [-(h.hw - 2.6), 70], [-(h.hw - 0.4), 82], [-(h.hw - 0.4), 96],
        ])} Z`,
      ],
      strands: [
        line([[-(h.hw + 4), 60], [-(h.hw + 7), 66], [-(h.hw + 4), 72], [-(h.hw + 7), 78], [-(h.hw + 4), 84]]),
        line([[h.hw + 4, 60], [h.hw + 7, 66], [h.hw + 4, 72], [h.hw + 7, 78], [h.hw + 4, 84]]),
        line([[-6, 30.4], [-2, 26.6], [-6, 23.6]]),
        line([[5, 31.6], [10, 28.6], [8, 24.6]]),
      ],
    };
  },
  // 15 shoulder length with a straight fringe
  (h) => ({
    back: [behind(h, 97, 6.4)],
    front: [fall(h, 97, 6.4, 3, [[h.hw - 5.4, 43], [6, 42], [0, 42.4], [-6, 42], [-(h.hw - 5.4), 43]])],
    strands: [
      line([[-9, 41.6], [-8.4, 36], [-5, 30]]),
      line([[-3, 42], [-2.6, 35], [-1, 29]]),
      line([[3.4, 42], [3, 35], [1.6, 29]]),
      line([[9.4, 41.6], [8.8, 36], [5.6, 30]]),
    ],
  }),
];

function Hair({ spec, h, layer }: { spec: Spec; h: Head; layer: "back" | "front" }) {
  const tone = HAIR_TONES[spec.hairTone] ?? HAIR_TONES[0];
  const hair = (HAIR_SHAPES[spec.hair] ?? HAIR_SHAPES[0])(h);
  if (layer === "back") {
    return (
      <>
        {(hair.back ?? []).map((d) => (
          <path key={d} d={d.startsWith("M") ? d : `M${d}`} fill={tone.fill} stroke={INK} strokeWidth={W.feature} />
        ))}
      </>
    );
  }
  return (
    <>
      {(hair.front ?? []).map((d) => (
        <path key={d} d={d} fill={tone.fill} stroke={INK} strokeWidth={W.feature} />
      ))}
      {(hair.strands ?? []).map((d) => (
        <path key={d} d={d} fill="none" stroke={tone.strand} strokeOpacity={tone.strandOpacity} strokeWidth={W.fine} />
      ))}
      {(hair.braids ?? []).map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={tone.strand}
          strokeOpacity={tone.strandOpacity + 0.15}
          strokeWidth={W.fine}
          strokeDasharray="2.4 1.5"
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------

const EYE_X = 8.7;
const EYE_Y = 57.2;

function Ears({ h, skin }: { h: Head; skin: string }) {
  return (
    <>
      {[-1, 1].map((s) => {
        const x = (dx: number) => n(50 + s * (h.hw + dx));
        return (
          <g key={s}>
            <path
              d={`M${x(-1)},52.6 C${x(4.6)},49.8 ${x(5.2)},60 ${x(2.6)},65.6 C${x(1.6)},67.2 ${x(0)},66.4 ${x(-1)},65`}
              fill={skin}
              stroke={INK}
              strokeWidth={W.feature}
            />
            <path d={`M${x(1.6)},55.4 Q${x(3.2)},58.4 ${x(1.6)},62`} fill="none" stroke={INK} strokeWidth={W.fine} opacity={0.6} />
          </g>
        );
      })}
    </>
  );
}

function Brows({ spec, mood }: { spec: Spec; mood: Mood }) {
  const base = [
    { inner: 50.8, mid: 49.9, outer: 50.6, width: 1.9 },
    { inner: 51.4, mid: 48.4, outer: 50.9, width: 1.6 },
    { inner: 51, mid: 49.6, outer: 50.8, width: 2.7 },
  ][spec.brows] ?? { inner: 50.8, mid: 49.9, outer: 50.6, width: 1.9 };
  const lift = spec.glasses > 0 ? -1 : 0;
  return (
    <>
      {[-1, 1].map((s) => {
        let [inner, mid, outer] = [base.inner + lift, base.mid + lift, base.outer + lift];
        if (mood === "for") {
          [inner, mid, outer] = [inner - 0.9, mid - 1.1, outer - 0.7];
        } else if (mood === "against") {
          [inner, mid, outer] = [inner + 2.2, mid + 0.9, outer - 0.3];
        } else if (mood === "hold") {
          [inner, mid, outer] = s === 1 ? [inner - 1.2, mid - 3, outer - 1.5] : [inner + 1.1, mid + 0.7, outer + 0.2];
        }
        const x = (dx: number) => n(50 + s * dx);
        return (
          <path
            key={s}
            d={`M${x(4.2)},${n(inner)} Q${x(9)},${n(mid * 2 - (inner + outer) / 2)} ${x(13.8)},${n(outer)}`}
            fill="none"
            stroke={INK}
            strokeWidth={base.width}
          />
        );
      })}
    </>
  );
}

function Eyes({ spec, mood }: { spec: Spec; mood: Mood }) {
  const lash = spec.presentation === 1 ? 1.8 : 1.5;
  const squint = mood === "against" ? 0.5 : 0;
  return (
    <>
      {[-1, 1].map((s) => {
        const x = (dx: number) => n(50 + s * (EYE_X + dx));
        const y = (dy: number) => n(EYE_Y + dy);
        const lid =
          spec.eyes === 2
            ? `M${x(-4)},${y(1.1)} Q${x(0.4)},${y(-2.2 + squint)} ${x(4.4)},${y(-0.3)}`
            : spec.eyes === 1
              ? `M${x(-4)},${y(0.9)} Q${x(-0.4)},${y(-3.5 + squint)} ${x(4.3)},${y(0.4)}`
              : `M${x(-4)},${y(0.9)} Q${x(-0.6)},${y(-2.8 + squint)} ${x(4.3)},${y(0.3)}`;
        return (
          <g key={s}>
            <path d={lid} fill="none" stroke={INK} strokeWidth={lash} />
            {spec.eyes === 1 ? (
              <path
                d={`M${x(-3.2)},${y(-2.7)} Q${x(0)},${y(-5)} ${x(3.9)},${y(-2.4)}`}
                fill="none"
                stroke={INK}
                strokeWidth={W.fine}
                opacity={0.6}
              />
            ) : null}
            <circle cx={x(0.1)} cy={y(0.35)} r={spec.eyes === 1 ? 1.7 : 1.55} fill={INK} />
            <path
              d={`M${x(-2.6)},${y(2.6)} Q${x(0.4)},${y(mood === "for" ? 2.7 : 3.2)} ${x(3.2)},${y(2)}`}
              fill="none"
              stroke={INK}
              strokeWidth={W.fine}
              opacity={0.5}
            />
          </g>
        );
      })}
    </>
  );
}

function Nose({ spec }: { spec: Spec }) {
  const paths = [
    ["M48.3,59.4 C48.1,63 46.5,66 46.3,68", "M46.3,68 Q47.7,70.3 50,69.7 Q52.4,70.3 53.7,68.3"],
    ["M45.7,67.1 Q45,69.7 47.5,69.7 Q50,71.1 52.5,69.7 Q55,69.7 54.3,67.1"],
    ["M48.6,62.4 C48.5,64.6 47.4,66.4 47,67.8", "M47,67.8 Q48.2,70 50.2,69.4 Q52,70 53,68.2"],
  ][spec.nose] ?? [];
  return (
    <>
      {paths.map((d) => (
        <path key={d} d={d} fill="none" stroke={INK} strokeWidth={1.3} />
      ))}
    </>
  );
}

function Mouth({ spec, mood }: { spec: Spec; mood: Mood }) {
  const y = 76.6;
  const half = spec.mouth === 2 ? 5.6 : 6.2;
  let d: string;
  let width = 1.6;
  if (mood === "for") {
    d = `M${n(50 - half)},${n(y - 0.9)} Q50,${n(y + 2.6)} ${n(50 + half)},${n(y - 0.9)}`;
  } else if (mood === "against") {
    d = `M${n(50 - half)},${n(y + 1)} Q50,${n(y - 0.9)} ${n(50 + half)},${n(y + 1)}`;
    width = 2;
  } else if (mood === "hold") {
    d = `M${n(50 - half)},${n(y + 0.5)} L${n(50 + half - 0.6)},${n(y - 0.2)} M${n(50 + half - 0.6)},${n(y - 0.2)} l1.4,-1.1`;
  } else {
    d = `M${n(50 - half)},${y} Q50,${n(y + 1.1)} ${n(50 + half)},${y}`;
  }
  return (
    <>
      {spec.mouth === 1 ? (
        <path
          d={`M${n(50 - half + 0.6)},${n(y - 0.4)} Q47.4,${n(y - 2.4)} 50,${n(y - 1.2)} Q52.6,${n(y - 2.4)} ${n(50 + half - 0.6)},${n(y - 0.4)}`}
          fill="none"
          stroke={INK}
          strokeWidth={W.fine}
          opacity={0.75}
        />
      ) : null}
      <path d={d} fill="none" stroke={INK} strokeWidth={width} />
      {spec.mouth !== 2 ? (
        <path
          d={
            spec.mouth === 1
              ? `M46.2,${n(y + 3.5)} Q50,${n(y + 5.4)} 53.8,${n(y + 3.5)}`
              : `M47.4,${n(y + 3.5)} Q50,${n(y + 4.5)} 52.6,${n(y + 3.5)}`
          }
          fill="none"
          stroke={INK}
          strokeWidth={W.fine}
          opacity={0.7}
        />
      ) : null}
    </>
  );
}

function AgeLines({ spec }: { spec: Spec }) {
  if (spec.age === 0) {
    return null;
  }
  const marked = spec.age === 2;
  return (
    <g fill="none" stroke={INK} strokeWidth={0.8} opacity={marked ? 0.75 : 0.55}>
      <path d="M44.4,68.6 Q42.2,72 42.9,75.4" />
      <path d="M55.6,68.6 Q57.8,72 57.1,75.4" />
      {marked ? (
        <>
          <path d="M42.6,41 Q50,39.8 57.4,41" />
          <path d="M44.6,44.4 Q50,43.5 55.4,44.4" />
          <path d="M37.6,61.6 Q40.4,63.4 44,62.4" />
          <path d="M62.4,61.6 Q59.6,63.4 56,62.4" />
          <path d="M35.2,56.4 l-2,-1 M35.4,58.2 l-2.1,0.5" />
          <path d="M64.8,56.4 l2,-1 M64.6,58.2 l2.1,0.5" />
        </>
      ) : null}
    </g>
  );
}

function FacialHair({ spec, h, clip }: { spec: Spec; h: Head; clip: string }) {
  if (spec.facialHair === 0) {
    return null;
  }
  const tone = HAIR_TONES[spec.beardTone] ?? HAIR_TONES[0];
  const moustache = "M43,74.6 Q46.5,71.2 50,72.4 Q53.5,71.2 57,74.6 Q53.4,74.2 50,74.6 Q46.6,74.2 43,74.6 Z";
  if (spec.facialHair === 2) {
    return <path d={moustache} fill={tone.fill} stroke={INK} strokeWidth={W.fine} />;
  }
  if (spec.facialHair === 3) {
    return (
      <>
        <path
          d={`M43.2,74.4 Q46.5,71 50,72.2 Q53.5,71 56.8,74.4 L57.4,80 Q56.6,${n(h.cy + 1)} 50,${n(h.cy + 1.6)} Q43.4,${n(h.cy + 1)} 42.6,80 Z`}
          fill={tone.fill}
          stroke={INK}
          strokeWidth={W.fine}
          clipPath={clip}
        />
        <path d="M45,75.4 Q50,73.8 55,75.4 Q55.6,79.4 50,80.2 Q44.4,79.4 45,75.4 Z" fill={SKIN[spec.skin]} />
      </>
    );
  }
  // A short full beard: everything below a line from the sideburns to above the lip.
  return (
    <>
      <path
        d={`M${n(50 - h.hw - 2)},60 Q${n(50 - h.cw + 4.5)},64 ${n(50 - 10.5)},71.4 Q46,70.6 50,72 Q54,70.6 ${n(50 + 10.5)},71.4 Q${n(50 + h.cw - 4.5)},64 ${n(50 + h.hw + 2)},60 L${n(50 + h.hw + 2)},${n(h.cy + 4)} L${n(50 - h.hw - 2)},${n(h.cy + 4)} Z`}
        fill={tone.fill}
        fillOpacity={0.82}
        stroke={INK}
        strokeWidth={W.fine}
        clipPath={clip}
      />
      <path d="M44.6,75.6 Q50,73.6 55.4,75.6 Q56,80 50,81 Q44,80 44.6,75.6 Z" fill={SKIN[spec.skin]} />
    </>
  );
}

function Glasses({ spec, h, color }: { spec: Spec; h: Head; color: string }) {
  if (spec.glasses === 0) {
    return null;
  }
  const y = EYE_Y + 0.5;
  const lens = (s: number) => {
    const cx = 50 + s * EYE_X;
    if (spec.glasses === 1) {
      return <circle key={s} cx={n(cx)} cy={n(y)} r={5.9} />;
    }
    if (spec.glasses === 2) {
      return <rect key={s} x={n(cx - 6.2)} y={n(y - 4.3)} width={12.4} height={8.6} rx={2.2} />;
    }
    return (
      <g key={s}>
        <path d={`M${n(cx - 6.2)},${n(y - 3.4)} L${n(cx - 5.6)},${n(y + 1.2)} Q${n(cx)},${n(y + 6.6)} ${n(cx + 5.6)},${n(y + 1.2)} L${n(cx + 6.2)},${n(y - 3.4)}`} />
        <path d={`M${n(cx - 6.6)},${n(y - 3.8)} L${n(cx + 6.6)},${n(y - 3.8)}`} strokeWidth={2.4} />
      </g>
    );
  };
  return (
    <g fill="none" stroke={color} strokeWidth={1.3}>
      {lens(-1)}
      {lens(1)}
      <path d={`M${n(50 - EYE_X + 6)},${n(y - 1.2)} Q50,${n(y - 3.2)} ${n(50 + EYE_X - 6)},${n(y - 1.2)}`} />
      <path d={`M${n(50 - EYE_X - 6.1)},${n(y - 1.6)} L${n(50 - h.hw + 0.4)},${n(y - 2.6)}`} />
      <path d={`M${n(50 + EYE_X + 6.1)},${n(y - 1.6)} L${n(50 + h.hw - 0.4)},${n(y - 2.6)}`} />
    </g>
  );
}

function Earrings({ spec, h, color }: { spec: Spec; h: Head; color: string }) {
  if (spec.earrings === 0 || COVERS_EARS.has(spec.hair)) {
    return null;
  }
  return (
    <>
      {[-1, 1].map((s) => {
        const x = 50 + s * (h.hw + 1.9);
        return spec.earrings === 1 ? (
          <circle key={s} cx={n(x)} cy={67.4} r={1.6} fill={color} stroke={INK} strokeWidth={0.7} />
        ) : (
          <path
            key={s}
            d={`M${n(x)},66.6 L${n(x - 2.7)},73 A3.1,3.1 0 1 0 ${n(x + 2.7)},73 Z`}
            fill={color}
            stroke={INK}
            strokeWidth={0.8}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Neck and clothing
// ---------------------------------------------------------------------------

interface Build {
  /** Half width of the neck and of the shoulders. */
  nw: number;
  sw: number;
}

function Neck({ b, h, skin }: { b: Build; h: Head; skin: string }) {
  const [l, r] = [50 - b.nw, 50 + b.nw];
  return (
    <>
      <path d={`M${n(l)},70 L${n(l - 0.6)},92 L${n(l - 3)},99 L${n(r + 3)},99 L${n(r + 0.6)},92 L${n(r)},70 Z`} fill={skin} />
      <path d={`M${n(l)},74 L${n(r)},74 L${n(r)},81.5 Q50,${n(h.cy + 8.5)} ${n(l)},81.5 Z`} fill={INK} opacity={0.14} />
      <path d={`M${n(l)},78 L${n(l - 0.6)},93 M${n(r)},78 L${n(r + 0.6)},93`} fill="none" stroke={INK} strokeWidth={W.feature} />
    </>
  );
}

function bodyPath(b: Build): string {
  const [l, r] = [50 - b.nw, 50 + b.nw];
  return (
    `M${n(50 - b.sw - 5)},123 C${n(50 - b.sw - 4)},110 ${n(50 - b.sw + 3)},104.5 ${n(l - 7)},100.5 ` +
    `Q${n(l - 2.5)},98.6 ${n(l - 1.5)},93.4 L${n(r + 1.5)},93.4 Q${n(r + 2.5)},98.6 ${n(r + 7)},100.5 ` +
    `C${n(50 + b.sw - 3)},104.5 ${n(50 + b.sw + 4)},110 ${n(50 + b.sw + 5)},123 Z`
  );
}

const poly = (points: [number, number][]) => `M${points.map(([x, y]) => `${n(x)},${n(y)}`).join(" L")} Z`;

function Clothing({ spec, b, skin, accent }: { spec: Spec; b: Build; skin: string; accent: string }) {
  const [l, r] = [50 - b.nw, 50 + b.nw];
  const onGarment = spec.accentOn === 0;
  const cloth = spec.dark ? CLOTH_DARK : PAPER;
  const seam = spec.dark ? PAPER : INK;
  const body = (fill: string) => <path d={bodyPath(b)} fill={fill} stroke={INK} strokeWidth={W.contour} />;
  const pin =
    spec.accentOn === 3 ? (
      <circle cx={n(50 - b.nw - 9)} cy={110} r={2} fill={accent} stroke={spec.dark ? PAPER : INK} strokeWidth={0.7} />
    ) : null;
  /** Both lapels of a jacket, from the neck to the hem. */
  const lapels = (notchX: number, notchY: number, foldX: number, foldY: number, hem: number) =>
    [-1, 1].map((s) => (
      <path
        key={s}
        d={poly([
          [50 + s * (b.nw + 2.4), 94],
          [50 + s * notchX, notchY],
          [50 + s * foldX, foldY],
          [50 + s * hem, 123],
          [50 + s * (b.nw + 14), 123],
        ])}
        fill={cloth}
        stroke={seam}
        strokeWidth={spec.dark ? 1 : 1.2}
      />
    ));
  /** A shirt collar: two leaves meeting at `closeY` on the centre line. */
  const collar = (closeX: number, closeY: number, pointX: number, pointY: number) =>
    [-1, 1].map((s) => (
      <path
        key={s}
        d={poly([
          [50 + s * (b.nw + 1.4), 90.6],
          [50 + s * closeX, closeY],
          [50 + s * pointX, pointY],
        ])}
        fill={PAPER}
        stroke={INK}
        strokeWidth={1.2}
      />
    ));

  switch (spec.clothing) {
    case CLOTHING.suit:
      return (
        <>
          {body(cloth)}
          <path d={poly([[l - 2.4, 93], [46.4, 123], [53.6, 123], [r + 2.4, 93]])} fill={PAPER} stroke={INK} strokeWidth={1} />
          <path d={poly([[47.5, 99.8], [52.5, 99.8], [51.9, 104.4], [48.1, 104.4]])} fill={onGarment ? accent : mix(70)} stroke={INK} strokeWidth={0.9} />
          <path d={poly([[48.1, 104.4], [51.9, 104.4], [53.8, 123], [46.2, 123]])} fill={onGarment ? accent : mix(70)} stroke={INK} strokeWidth={0.9} />
          {collar(1.2, 100, 8, 104.6)}
          {lapels(18, 104.6, 14, 107.4, 3.8)}
          {pin}
        </>
      );
    case CLOTHING.openCollar:
      return (
        <>
          {body(cloth)}
          <path d={poly([[l - 2.4, 93], [46.6, 123], [53.4, 123], [r + 2.4, 93]])} fill={onGarment ? accent : PAPER} stroke={INK} strokeWidth={1} />
          <path d={poly([[l + 0.6, 92], [50, 106.4], [r - 0.6, 92]])} fill={skin} />
          <path d="M50,106.4 L50,123" stroke={INK} strokeWidth={0.9} />
          {collar(2.2, 105.4, 10.4, 104)}
          {lapels(18, 104.6, 14, 107.4, 3.6)}
          {pin}
        </>
      );
    case CLOTHING.blouse:
      return (
        <>
          {body(PAPER)}
          <path d={`M${n(l - 1)},93 Q${n(l + 1)},102 50,109.4 Q${n(r - 1)},102 ${n(r + 1)},93 Z`} fill={skin} stroke={INK} strokeWidth={1.2} />
          <path d={`M${n(l - 9)},102 Q${n(l - 6)},111 ${n(l - 8)},122 M${n(r + 9)},102 Q${n(r + 6)},111 ${n(r + 8)},122`} fill="none" stroke={INK} strokeWidth={W.fine} opacity={0.6} />
          <path d="M50,109.4 L50,123" stroke={INK} strokeWidth={W.fine} />
          {onGarment ? (
            <>
              <path
                d={`M${n(l - 1.6)},88.4 Q50,95.4 ${n(r + 1.6)},88.4 L${n(r + 2)},93.6 Q50,101 ${n(l - 2)},93.6 Z`}
                fill={accent}
                stroke={INK}
                strokeWidth={1}
              />
              <path d="M52.6,96 L59.4,105.6 L55.4,107 L51.4,99.8 Z M51.4,97.4 L47.8,107.4 L44.2,105.4 L48.6,96.4 Z" fill={accent} stroke={INK} strokeWidth={1} />
            </>
          ) : null}
          {pin}
        </>
      );
    case CLOTHING.turtleneck:
      return (
        <>
          {body(cloth)}
          <path
            d={`M${n(l - 2.6)},100 L${n(l - 2)},87 Q50,90.6 ${n(r + 2)},87 L${n(r + 2.6)},100 Q50,104.4 ${n(l - 2.6)},100 Z`}
            fill={onGarment ? accent : cloth}
            stroke={INK}
            strokeWidth={1.3}
          />
          <path
            d={`M${n(l + 1.4)},90.4 L${n(l + 1.2)},100.6 M50,91.4 L50,102 M${n(r - 1.4)},90.4 L${n(r - 1.2)},100.6 M${n(l + 5)},91 L${n(l + 5)},101.6 M${n(r - 5)},91 L${n(r - 5)},101.6`}
            stroke={onGarment ? INK : seam}
            strokeWidth={0.7}
            opacity={0.55}
          />
          {pin}
        </>
      );
    case CLOTHING.cardigan:
      return (
        <>
          {body(cloth)}
          <path d={poly([[l - 3, 93], [47, 123], [53, 123], [r + 3, 93]])} fill={onGarment ? accent : PAPER} stroke={INK} strokeWidth={1} />
          <path d={`M${n(l - 0.6)},92 Q50,104.6 ${n(r + 0.6)},92 Z`} fill={skin} stroke={INK} strokeWidth={1.1} />
          <path
            d={`M${n(l - 5.4)},95.4 L44.4,123 M${n(r + 5.4)},95.4 L55.6,123`}
            fill="none"
            stroke={seam}
            strokeWidth={0.9}
            opacity={0.8}
          />
          <circle cx={n(50 - b.nw * 0.42 - 2.6)} cy={113} r={1} fill={seam} />
          {pin}
        </>
      );
    case CLOTHING.workJacket:
      return (
        <>
          {body(spec.dark ? mix(22) : PAPER)}
          <path d={poly([[l - 1, 93], [50, 108.5], [r + 1, 93]])} fill={onGarment ? accent : mix(70)} stroke={INK} strokeWidth={1} />
          <path d={`M${n(l)},91.6 Q50,100.6 ${n(r)},91.6 Z`} fill={skin} stroke={INK} strokeWidth={1} />
          {[-1, 1].map((s) => (
            <path
              key={s}
              d={poly([
                [50 + s * (b.nw + 1.6), 90.4],
                [50 + s * 1.2, 108.6],
                [50 + s * (b.nw + 8.6), 106.8],
                [50 + s * (b.nw + 6), 97.4],
              ])}
              fill={spec.dark ? mix(22) : PAPER}
              stroke={INK}
              strokeWidth={1.3}
            />
          ))}
          <path d="M49.2,108.6 L49.2,123 M50.8,108.6 L50.8,123" stroke={INK} strokeWidth={0.8} />
          <path d={`M${n(r + 6.4)},112.6 L${n(r + 18.6)},112.6 L${n(r + 18.6)},116 L${n(r + 12.5)},117.6 L${n(r + 6.4)},116 Z`} fill="none" stroke={INK} strokeWidth={1} />
          <circle cx={n(r + 12.5)} cy={115} r={0.8} fill={INK} />
          <path d={`M${n(l - 6.4)},112.6 L${n(l - 18.6)},112.6 L${n(l - 18.6)},116 L${n(l - 12.5)},117.6 L${n(l - 6.4)},116 Z`} fill="none" stroke={INK} strokeWidth={1} />
          {spec.accentOn === 3 ? <circle cx={n(l - 12.5)} cy={108.6} r={1.9} fill={accent} stroke={INK} strokeWidth={0.7} /> : null}
        </>
      );
    default:
      return (
        <>
          {body(cloth)}
          <path d={poly([[l - 2.4, 93], [47.6, 123], [52.4, 123], [r + 2.4, 93]])} fill={onGarment ? accent : PAPER} stroke={INK} strokeWidth={1} />
          <path d={`M${n(l - 1)},92 Q50,107.4 ${n(r + 1)},92 Z`} fill={skin} stroke={INK} strokeWidth={1.1} />
          {lapels(19.6, 100.8, 14.2, 105.4, 2.6)}
          {pin}
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const TILT: Record<Mood, number> = { neutral: 0, for: -1.6, hold: 2.6, against: 0 };

function Face({ spec, mood }: { spec: Spec; mood: Mood }) {
  const clipId = `portrait-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const h = HEADS[spec.head] ?? HEADS[0];
  const skin = SKIN[spec.skin] ?? SKIN[0];
  const accent = ACCENTS[spec.accent] ?? ACCENTS[0];
  const b: Build = spec.presentation === 0 ? { nw: 9.4, sw: 38 } : { nw: 7.6, sw: 33 };
  const head = headPath(h);
  const tilt = `rotate(${TILT[mood]} 50 90)`;
  const clip = `url(#${clipId})`;
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={`M${head}`} />
        </clipPath>
      </defs>
      <g transform={tilt}>
        <Hair spec={spec} h={h} layer="back" />
      </g>
      <Neck b={b} h={h} skin={skin} />
      <Clothing spec={spec} b={b} skin={skin} accent={accent} />
      <g transform={tilt}>
        <Ears h={h} skin={skin} />
        <path d={`M${head}`} fill={skin} stroke={INK} strokeWidth={W.contour} />
        <g clipPath={clip} stroke={INK} strokeWidth={0.7} opacity={0.4}>
          {[0, 1, 2, 3].map((index) => (
            <path key={index} d={`M${n(60.5 + index * 2.3)},${n(73.5 - index * 1.6)} l3.4,-6.4`} />
          ))}
        </g>
        <FacialHair spec={spec} h={h} clip={clip} />
        <AgeLines spec={spec} />
        <Nose spec={spec} />
        <Mouth spec={spec} mood={mood} />
        <Eyes spec={spec} mood={mood} />
        <Brows spec={spec} mood={mood} />
        <Hair spec={spec} h={h} layer="front" />
        <Glasses spec={spec} h={h} color={spec.accentOn === 1 ? accent : INK} />
        <Earrings spec={spec} h={h} color={spec.accentOn === 2 ? accent : PAPER} />
      </g>
    </>
  );
}

function Silhouette() {
  const fill = "var(--line)";
  return (
    <>
      <path d={bodyPath({ nw: 8.6, sw: 36 })} fill={fill} />
      <path d="M41.4,70 L40.8,99 L59.2,99 L58.6,70 Z" fill={fill} />
      <path d={`M${headPath(HEADS[0])}`} fill={fill} stroke="var(--raised)" strokeWidth={1.4} />
    </>
  );
}

function resolve(seed: string | undefined, partner: number | undefined): Spec | null {
  if (partner !== undefined && PARTNERS[partner]) {
    return PARTNERS[partner];
  }
  return seed !== undefined && seed !== "" ? portraitSpec(seed) : null;
}

/**
 * An ink-line portrait with one accent color. `partner` 0–5 draws that
 * committee seat; otherwise `seed` picks the parts, so the same person always
 * looks the same. With neither it is a plain silhouette. Decorative: callers
 * show the name beside it.
 */
export function Portrait(props: { seed?: string; partner?: number; mood?: Mood; size?: number }): ReactNode {
  const { seed, partner, mood = "neutral", size = 48 } = props;
  const spec = resolve(seed, partner);
  return (
    <span className="portrait" data-mood={mood} aria-hidden="true" style={{ width: size, height: size * 1.2 }}>
      <svg viewBox="0 0 100 120" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {spec ? <Face spec={spec} mood={mood} /> : <Silhouette />}
      </svg>
    </span>
  );
}
