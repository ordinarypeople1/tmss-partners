import { describe, expect, it } from "vitest";
import { multipleToMillis } from "./boundary";

describe("multiple millis", () => {
  it("encodes a turn as thousandths", () => {
    expect(multipleToMillis(7.2)).toBe(7200);
    expect(multipleToMillis(7)).toBe(7000);
  });

  it("rejects a negative multiple", () => {
    expect(() => multipleToMillis(-1)).toThrow(/multiple/);
  });
});
