export const SOURCE_LOCALE = "ko" as const;

/** Catalogs that ship. Korean is written first; the others are translated from it. */
export const LOCALES = ["ko", "en", "ja", "zh-Hans"] as const;
export type Locale = (typeof LOCALES)[number];

/** Not translated yet. */
export const PLANNED_LOCALES = ["zh-Hant"] as const;

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** The catalog closest to a browser language tag, or the source locale. */
export function matchLocale(tag: string | undefined): Locale {
  const lower = (tag ?? "").toLowerCase();
  if (lower.startsWith("ko")) {
    return "ko";
  }
  if (lower.startsWith("ja")) {
    return "ja";
  }
  if (lower.startsWith("zh")) {
    return "zh-Hans";
  }
  if (lower.startsWith("en")) {
    return "en";
  }
  return SOURCE_LOCALE;
}
