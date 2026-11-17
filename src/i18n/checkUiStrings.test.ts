import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findHardcodedUiStrings, scanUiTree } from "./checkUiStrings";

describe("hardcoded UI strings", () => {
  it("flags JSX copy and CJK literals", () => {
    const hits = findHardcodedUiStrings(
      "App.tsx",
      `export function A(){ return <p aria-label="지도">안녕</p> }`,
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("allows message ids and tokens", () => {
    const hits = findHardcodedUiStrings(
      "App.tsx",
      `export function A(intl: { formatMessage: (d: { id: string }) => string }) {
        return <p>{intl.formatMessage({ id: "app.title" })}</p>;
      }`,
    );
    expect(hits).toEqual([]);
  });

  it("finds no player-facing literals under src/ui", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "ui");
    expect(scanUiTree(root)).toEqual([]);
  });

  it("keeps the layout from pinning a single line of text", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "styles.css"), "utf8");
    expect(css).not.toMatch(/nowrap/);
    expect(css).not.toMatch(new RegExp("[\\uAC00-\\uD7AF]"));
  });
});
