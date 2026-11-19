import { describe, expect, it } from "vitest";
import { PARTNERS, PART_OPTIONS, SKIN, portraitSpec, type Spec } from "./Portrait";

const KEYS = Object.keys(PART_OPTIONS) as (keyof Spec)[];
const SEEDS = Array.from({ length: 500 }, (_, index) => `person ${index}`);
const SPECS = SEEDS.map((seed) => portraitSpec(seed));

const value = (spec: Spec, key: keyof Spec) => Number(spec[key]);

function shares(key: keyof Spec): number[] {
  const counts = new Array<number>(PART_OPTIONS[key]).fill(0);
  for (const spec of SPECS) {
    counts[value(spec, key)] += 1;
  }
  return counts.map((count) => count / SPECS.length);
}

describe("portraitSpec", () => {
  it("gives the same face for the same name", () => {
    for (const seed of ["Dana Whitfield", "오민서", "", "a"]) {
      expect(portraitSpec(seed)).toEqual(portraitSpec(seed));
    }
    expect(SEEDS.map((seed) => portraitSpec(seed))).toEqual(SPECS);
  });

  it("is plain data within the range of each part", () => {
    for (const spec of SPECS) {
      expect(Object.keys(spec).sort()).toEqual([...KEYS].sort());
      for (const key of KEYS) {
        const picked = value(spec, key);
        expect(Number.isInteger(picked), key).toBe(true);
        expect(picked, key).toBeGreaterThanOrEqual(0);
        expect(picked, key).toBeLessThan(PART_OPTIONS[key]);
      }
    }
  });

  it("gives different names different faces", () => {
    const distinct = new Set(SPECS.map((spec) => JSON.stringify(spec)));
    expect(distinct.size).toBeGreaterThan(480);
    expect(portraitSpec("Dana Whitfield")).not.toEqual(portraitSpec("Dana Whitfield "));
  });

  it("uses every option of every part across 500 names", () => {
    for (const key of KEYS) {
      const used = new Set(SPECS.map((spec) => value(spec, key)));
      expect(used.size, key).toBe(PART_OPTIONS[key]);
    }
  });

  it("keeps the crowd mixed: no skin tone dominates, both presentations near half", () => {
    expect(PART_OPTIONS.skin).toBe(SKIN.length);
    const skin = shares("skin");
    expect(Math.max(...skin)).toBeLessThan(0.3);
    expect(Math.min(...skin)).toBeGreaterThan(0.1);
    // The three deeper tones together are a real share of the crowd, not a token.
    expect(skin[3] + skin[4] + skin[5]).toBeGreaterThan(0.38);
    // With two presentations neither can stay under 45%; each stays within 45–55%.
    for (const share of shares("presentation")) {
      expect(share).toBeGreaterThan(0.45);
      expect(share).toBeLessThan(0.55);
    }
  });

  it("only puts the accent on something the face has", () => {
    for (const spec of SPECS) {
      if (spec.accentOn === 1) {
        expect(spec.glasses).toBeGreaterThan(0);
      }
      if (spec.accentOn === 2) {
        expect(spec.earrings).toBeGreaterThan(0);
      }
    }
  });
});

describe("the committee", () => {
  it("has six fixed, distinct designs within range", () => {
    expect(PARTNERS).toHaveLength(6);
    expect(new Set(PARTNERS.map((spec) => JSON.stringify(spec))).size).toBe(6);
    for (const spec of PARTNERS) {
      for (const key of KEYS) {
        expect(value(spec, key), key).toBeLessThan(PART_OPTIONS[key]);
      }
      expect(spec.accent).toBe(0);
    }
  });

  it("matches the approved descriptions", () => {
    // Three women, three men; two Black partners, one Asian partner.
    expect(PARTNERS.map((spec) => spec.presentation)).toEqual([0, 0, 1, 1, 0, 1]);
    expect(PARTNERS[1].skin).toBeGreaterThanOrEqual(4);
    expect(PARTNERS[5].skin).toBeGreaterThanOrEqual(4);
    // The chair wears the accent as a tie, the investor relations partner as earrings.
    expect(PARTNERS[0].accentOn).toBe(0);
    expect(PARTNERS[5].accentOn).toBe(2);
    expect(PARTNERS[5].earrings).toBe(2);
    expect(PARTNERS[2].glasses).toBeGreaterThan(0);
    expect(PARTNERS[1].facialHair).toBe(1);
  });
});
