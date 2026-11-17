import { describe, expect, it } from "vitest";
import { enterpriseValue, equityValue } from "./valuation";

describe("valuation", () => {
  it("prices a company as ebitda times a multiple", () => {
    expect(enterpriseValue(10_000, 7)).toBe(70_000);
    expect(enterpriseValue(2_549, 7.2)).toBe(18_353);
  });

  it("subtracts net debt to reach equity value", () => {
    expect(equityValue(10_000, 7, 12_000)).toBe(58_000);
  });

  it("rejects a negative multiple", () => {
    expect(() => enterpriseValue(100, -1)).toThrow(/multiple/);
  });
});
