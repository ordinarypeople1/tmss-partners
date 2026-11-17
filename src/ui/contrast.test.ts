import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function block(css: string, start: string): string {
  const at = css.indexOf(start);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, index);
      }
    }
  }
  return "";
}

function token(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  return (match?.[1] ?? "").toLowerCase();
}

function channel(hex: string): [number, number, number] {
  const body = hex.slice(1);
  const wide = body.length === 3 ? body.replace(/./g, (digit) => digit + digit) : body;
  return [0, 2, 4].map((offset) => Number.parseInt(wide.slice(offset, offset + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const linear = channel(hex).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function ratio(fore: string, back: string): number {
  const lighter = Math.max(luminance(fore), luminance(back));
  const darker = Math.min(luminance(fore), luminance(back));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("text contrast", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const light = block(css, ":root");
  const dark = block(css, '[data-theme="dark"]');

  it("keeps body and nav near black on beige, and near white in the dark theme", () => {
    expect(token(light, "--ink")).toBe("#111111");
    expect(token(light, "--ink-2")).toBe("#111111");
    expect(token(light, "--on-ink")).toBe("#ffffff");
    expect(token(dark, "--ink")).toBe("#f5f5f5");
    expect(token(dark, "--ink-2")).toBe("#f5f5f5");
    expect(token(dark, "--on-ink")).toBe("#111111");
    expect(ratio(token(light, "--ink"), token(light, "--page"))).toBeGreaterThan(12);
    expect(ratio(token(dark, "--ink"), token(dark, "--page"))).toBeGreaterThan(12);
    expect(ratio(token(light, "--on-ink"), token(light, "--ink"))).toBeGreaterThan(12);
    expect(ratio(token(dark, "--on-ink"), token(dark, "--ink"))).toBeGreaterThan(12);
  });

  it("keeps the only grey text at AA on both the page and the card", () => {
    for (const source of [light, dark]) {
      const muted = token(source, "--muted");
      expect(ratio(muted, token(source, "--page"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(muted, token(source, "--surface"))).toBeGreaterThanOrEqual(4.5);
    }
    expect(token(light, "--muted")).not.toBe("#7a7168");
  });

  it("paints navigation in ink and the selected pill in on-ink", () => {
    expect(css).toMatch(/\.side a \{[^}]*color:\s*var\(--ink\)/s);
    expect(css).toMatch(/\.nav a \{[^}]*color:\s*var\(--ink\)/s);
    expect(css).toMatch(/\.nav button \{[^}]*color:\s*var\(--ink\)/s);
    expect(css).toMatch(/\.side a\[aria-current="page"\] \{[^}]*color:\s*var\(--on-ink\)/s);
    expect(css).toMatch(/\.nav a\[aria-current="page"\] \{[^}]*color:\s*var\(--on-ink\)/s);
    expect(css).toMatch(/button:disabled \{[^}]*color:\s*var\(--muted\)/s);
  });
});
