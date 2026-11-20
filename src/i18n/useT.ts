import { useCallback } from "react";
import { useIntl } from "react-intl";

export type Values = Record<string, string | number | boolean | null | undefined>;
export type Translate = (id: string, values?: Values) => string;

/** Looks a message id up in the Korean catalog and fills its values in. */
export function useT(): Translate {
  const intl = useIntl();
  return useCallback((id, values) => intl.formatMessage({ id }, values as never), [intl]);
}
