import { useEffect, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import ko from "./locales/ko.json";
import { SOURCE_LOCALE } from "./config";

export function LocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = SOURCE_LOCALE;
  }, []);
  return (
    <IntlProvider locale={SOURCE_LOCALE} defaultLocale={SOURCE_LOCALE} messages={ko}>
      {children}
    </IntlProvider>
  );
}
