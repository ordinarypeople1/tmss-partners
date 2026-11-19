import { useEffect, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { SOURCE_LOCALE } from "./config";
import { messages } from "./messages";

export function LocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = SOURCE_LOCALE;
  }, []);
  return (
    <IntlProvider locale={SOURCE_LOCALE} defaultLocale={SOURCE_LOCALE} messages={messages}>
      {children}
    </IntlProvider>
  );
}
