import { describe, expect, it } from "vitest";
import { markerAmount, siteFeatures, sizeTier, tierScale } from "./buildings";

describe("building tiers", () => {
  it("splits revenue into five sizes", () => {
    expect(sizeTier(0)).toBe(1);
    expect(sizeTier(11999)).toBe(1);
    expect(sizeTier(12000)).toBe(2);
    expect(sizeTier(17999)).toBe(2);
    expect(sizeTier(18000)).toBe(3);
    expect(sizeTier(23999)).toBe(3);
    expect(sizeTier(24000)).toBe(4);
    expect(sizeTier(35999)).toBe(4);
    expect(sizeTier(36000)).toBe(5);
    expect(sizeTier(Number.NaN)).toBe(1);
  });

  it("grows the mark with the tier", () => {
    expect(tierScale(1)).toBeLessThan(tierScale(2));
    expect(tierScale(2)).toBeLessThan(tierScale(3));
    expect(tierScale(3)).toBeLessThan(tierScale(4));
    expect(tierScale(4)).toBeLessThan(tierScale(5));
  });

  it("uses revenue, then assets", () => {
    expect(markerAmount(18000, 90000)).toBe(18000);
    expect(markerAmount(0, 24000)).toBe(24000);
    expect(markerAmount(null, null)).toBe(0);
  });

  it("paints live deals and owned sites in the live tone", () => {
    const marks = siteFeatures(
      [
        { id: "live", name: "north", lat: 1, lon: 2, kind: "mill", revenue: 40000, live: true },
        { id: "held", name: "south", lat: 3, lon: 4, kind: "warehouse", assets: 20000, held: true },
        { id: "plain", name: "east", lat: 5, lon: 6, kind: "store", revenue: 8000 },
      ],
      "held",
    );
    const [live, held, plain] = marks.features;
    expect(live?.properties.tone).toBe("live");
    expect(live?.properties.tier).toBe(5);
    expect(live?.properties.kind).toBe("factory");
    expect(held?.properties.tone).toBe("live");
    expect(held?.properties.kind).toBe("warehouse");
    expect(held?.properties.tier).toBe(3);
    expect(held?.properties.scale).toBeGreaterThan(tierScale(3));
    expect(plain?.properties.tone).toBe("ink");
    expect(plain?.properties.kind).toBe("store");
    expect(plain?.properties.tier).toBe(1);
    expect(plain?.properties.scale).toBe(tierScale(1));
  });
});
