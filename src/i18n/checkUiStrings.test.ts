import { mkdtempSync, readdirSync, statSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("skips story modules so catalog-backed stories can sit beside components", () => {
    const dir = mkdtempSync(join(tmpdir(), "deal-atlas-ui-"));
    try {
      writeFileSync(join(dir, "Card.stories.tsx"), "export const A = () => <p>안녕</p>;\n");
      writeFileSync(join(dir, "Card.tsx"), "export const A = () => <p>{id}</p>;\n");
      expect(scanUiTree(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds no player-facing literals under src/ui", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "ui");
    expect(scanUiTree(root)).toEqual([]);
  });

  it("keeps the layout from pinning a single line of text", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "ui");
    const sheets: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (entry.endsWith(".css")) {
          sheets.push(path);
        }
      }
    };
    walk(root);
    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      const css = readFileSync(sheet, "utf8");
      // Single-line text is declared once, in the shared sheet, together with its ellipsis.
      if (!sheet.endsWith("styles.css")) {
        expect(css, sheet).not.toMatch(/nowrap/);
      }
      expect(css, sheet).not.toMatch(new RegExp("[\\uAC00-\\uD7AF]"));
    }
  });
});
