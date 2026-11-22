import { describe, expect, it } from "vitest";
import { messages } from "../i18n/messages";
import { pick, variants } from "./lines";

const count = (prefix: string) => Object.keys(messages).filter((key) => key.startsWith(prefix) && /\.\d+$/.test(key)).length;

describe("spoken lines", () => {
  it("give each meeting thirty lines or more", () => {
    expect(count("cover.")).toBeGreaterThanOrEqual(30);
    expect(count("talk.")).toBeGreaterThanOrEqual(30);
    expect(count("ic.open.") + count("ic.q.") + count("ic.r.") + count("ic.verdict.")).toBeGreaterThanOrEqual(30);
  });

  it("have at least three ways to say each committee question and reaction", () => {
    const bases = new Set(
      Object.keys(messages)
        .filter((key) => /^ic\.(q|r)\..+\.\d+$/.test(key))
        .map((key) => key.replace(/\.\d+$/, "")),
    );
    expect(bases.size).toBeGreaterThan(20);
    for (const base of bases) {
      expect(variants(base), base).toBeGreaterThanOrEqual(3);
    }
  });

  it("pick a variant that exists, whatever the seed", () => {
    for (const seed of [0, 1, 7, 123_456, -5]) {
      expect(messages[pick("talk.meet.closed", seed)]).toBeTruthy();
    }
    expect(pick("no.such.base", 3)).toBe("no.such.base");
  });
});
