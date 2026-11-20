import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import geo from "../data/geo/admin1.json";
import { LOCALES, PLANNED_LOCALES, SOURCE_LOCALE } from "./config";
import base from "./locales/ko.json";
import { catalogFiles, fragmentEntries, messages } from "./messages";

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
  it("ships Korean as the source and lists what is translated", () => {
    expect(SOURCE_LOCALE).toBe("ko");
    expect(LOCALES).toEqual(["ko", "en", "ja", "zh-Hans"]);
    expect(PLANNED_LOCALES).toEqual(["zh-Hant"]);
    const present = readdirSync(join(here, "locales")).filter((name) => name.endsWith(".json"));
    for (const name of present) {
      expect(LOCALES.map((locale) => `${locale}.json`), name).toContain(name);
    }
  });

  it("translates every Korean key into every shipped locale", () => {
    for (const locale of LOCALES) {
      const own = new Set(catalogFiles(locale).flatMap(([, entries]) => Object.keys(entries)));
      const missing = Object.keys(messages).filter((key) => !own.has(key));
      expect(missing, locale).toEqual([]);
    }
  });

  it("translates nothing that Korean does not have, and keeps the placeholders", () => {
    const placeholders = (text: string) =>
      // Arguments only: a brace that follows a plural or select keyword opens a branch, not an argument.
      [...new Set([...text.matchAll(/(?<!(?:other|one|two|few|many|zero|=\d+)\s*)\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map((match) => match[1]))]
        .sort()
        .join(",");
    for (const locale of LOCALES) {
      if (locale === SOURCE_LOCALE) {
        continue;
      }
      for (const [file, entries] of catalogFiles(locale)) {
        for (const [key, value] of Object.entries(entries)) {
          expect(messages[key], `${key} in ${file} has no Korean source`).toBeTruthy();
          expect(value.trim(), `${key} in ${file}`).not.toBe("");
          expect(placeholders(value), `${key} in ${file}`).toBe(placeholders(messages[key]));
        }
      }
    }
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
