import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { isLocale, matchLocale, SOURCE_LOCALE, type Locale } from "./config";
import { catalogs } from "./messages";

const STORE_KEY = "deal-atlas.locale";

interface LocaleState {
  locale: Locale;
  setLocale(locale: Locale): void;
}

const LocaleContext = createContext<LocaleState>({ locale: SOURCE_LOCALE, setLocale: () => undefined });

export function useLocale(): LocaleState {
  return useContext(LocaleContext);
}

function initial(): Locale {
  try {
    const stored = window.localStorage.getItem(STORE_KEY);
    if (isLocale(stored)) {
      return stored;
    }
  } catch {
    // No storage: fall through to the browser's language.
  }
  return typeof navigator === "undefined" ? SOURCE_LOCALE : matchLocale(navigator.language);
}

export function LocaleProvider({ children, locale: fixed }: { children: ReactNode; locale?: Locale }) {
  const [chosen, setChosen] = useState<Locale>(() => fixed ?? initial());
  const locale = fixed ?? chosen;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    setChosen(next);
    try {
      window.localStorage.setItem(STORE_KEY, next);
    } catch {
      // The choice lasts for this visit.
    }
  }, []);
  const state = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return (
    <LocaleContext.Provider value={state}>
      <IntlProvider locale={locale} defaultLocale={SOURCE_LOCALE} messages={catalogs[locale]}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}
