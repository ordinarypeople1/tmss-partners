import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import geo from "../data/geo/admin1.json";
import { PLANNED_LOCALES, SOURCE_LOCALE } from "./config";
import base from "./locales/ko.json";
import { fragmentEntries, messages } from "./messages";

const here = dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "pkg" && entry !== "locales") {
        files.push(...sources(path));
      }
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("ko catalog", () => {
  it("is the only locale", () => {
    expect(readdirSync(join(here, "locales")).sort()).toEqual(["ko", "ko.json"]);
    expect(SOURCE_LOCALE).toBe("ko");
    expect(PLANNED_LOCALES).toEqual(["en", "ja", "zh-Hans", "zh-Hant"]);
  });

  it("defines each key once across the base file and the fragments", () => {
    const seen = new Map<string, string>(Object.keys(base).map((key) => [key, "ko.json"]));
    for (const [file, fragment] of fragmentEntries) {
      for (const key of Object.keys(fragment)) {
        expect(seen.get(key), `${key} in ${file}`).toBeUndefined();
        seen.set(key, file);
      }
    }
  });

  it("has no empty message", () => {
    for (const [key, value] of Object.entries(messages)) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("has every id the screens ask for", () => {
    const literal = /\bt\(\s*"([a-zA-Z0-9_.]+)"/g;
    // Message ids always carry a dot; a bare `id: "deals"` is a tab or a layer, not a message.
    const formatted = /\bid:\s*"([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)"/g;
    for (const file of sources(join(here, ".."))) {
      const text = readFileSync(file, "utf8");
      for (const pattern of [literal, formatted]) {
        for (const match of text.matchAll(pattern)) {
          expect(messages[match[1]], `${match[1]} used in ${file}`).toBeTruthy();
        }
      }
    }
  });

  it("names every country and region on the map", () => {
    for (const country of geo.countries) {
      expect(messages[`country.${country.code}`], country.code).toBeTruthy();
    }
    expect(geo.admin1).toHaveLength(187);
    for (const unit of geo.admin1) {
      expect(messages[`admin1.${unit.code}`], unit.code).toBeTruthy();
    }
  });

  it("keeps years ungrouped", () => {
    expect(messages["format.date"]).toContain("group-off");
  });
});
