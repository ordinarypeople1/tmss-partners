import base from "./locales/ko.json";

/**
 * The Korean catalog: `locales/ko.json` plus one fragment per screen under
 * `locales/ko/`. A fragment owns its own key prefix, so two screens never
 * edit the same file. A key defined twice is a test failure.
 */
const fragments = import.meta.glob<Record<string, string>>("./locales/ko/*.json", {
  eager: true,
  import: "default",
});

export const fragmentEntries: [string, Record<string, string>][] = Object.entries(fragments);

export const messages: Record<string, string> = Object.assign(
  {},
  base,
  ...fragmentEntries.map(([, fragment]) => fragment),
);
