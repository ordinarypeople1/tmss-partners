import { describe, expect, it } from "vitest";
import { attributeRating, traitRating } from "./format";

describe("attribute ratings", () => {
  it("centers zero basis points on ten and stays inside one to twenty", () => {
    expect(attributeRating(0)).toBe(10);
    expect(attributeRating(800)).toBe(20);
    expect(attributeRating(-800)).toBe(1);
    expect(attributeRating(null)).toBeNull();
  });

  it("maps a known management trait to a fixed bar", () => {
    expect(traitRating("grower")).toBe(16);
    expect(traitRating("unknown")).toBeNull();
  });
});
