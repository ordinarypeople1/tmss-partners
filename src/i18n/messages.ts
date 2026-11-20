import { LOCALES, SOURCE_LOCALE, type Locale } from "./config";

/**
 * One catalog per locale: `locales/<locale>.json` (shared vocabulary) plus one
 * fragment per screen under `locales/<locale>/`. A fragment owns its own key
 * prefix, so two screens never edit the same file. A key defined twice is a
 * test failure. A locale that lacks a key falls back to Korean.
 */
type Catalog = Record<string, string>;

const bases = import.meta.glob<Catalog>("./locales/*.json", { eager: true, import: "default" });
const fragments = import.meta.glob<Catalog>("./locales/*/*.json", { eager: true, import: "default" });

/** Every catalog file of a locale, as [path, entries]. */
export function catalogFiles(locale: Locale): [string, Catalog][] {
  const base = Object.entries(bases).filter(([path]) => path === `./locales/${locale}.json`);
  const parts = Object.entries(fragments).filter(([path]) => path.startsWith(`./locales/${locale}/`));
  return [...base, ...parts];
}

function merge(locale: Locale): Catalog {
  return Object.assign({}, ...catalogFiles(locale).map(([, entries]) => entries));
}

const source = merge(SOURCE_LOCALE);

export const catalogs: Record<Locale, Catalog> = Object.fromEntries(
  LOCALES.map((locale) => [locale, locale === SOURCE_LOCALE ? source : { ...source, ...merge(locale) }]),
) as Record<Locale, Catalog>;

/** The Korean catalog, which is the source of every other. */
export const messages: Catalog = source;

/** Fragment files of the source locale, for the duplicate-key test. */
export const fragmentEntries: [string, Catalog][] = catalogFiles(SOURCE_LOCALE).filter(
  ([path]) => path !== `./locales/${SOURCE_LOCALE}.json`,
);
