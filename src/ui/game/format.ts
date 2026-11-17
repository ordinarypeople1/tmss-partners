import type { IntlShape } from "react-intl";
import { formatKrwMillion } from "../../i18n/money";

export function money(intl: IntlShape, value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return intl.formatMessage({ id: "figure.none" });
  }
  return formatKrwMillion(intl, value);
}

export function multiple(intl: IntlShape, millis: number | null | undefined): string {
  if (millis == null) {
    return intl.formatMessage({ id: "figure.none" });
  }
  return intl.formatMessage({ id: "fact.multipleValue" }, { multiple: millis / 1000 });
}

export function percentFromBps(intl: IntlShape, bps: number | null | undefined): string {
  if (bps == null) {
    return intl.formatMessage({ id: "figure.none" });
  }
  return intl.formatMessage({ id: "figure.percent" }, { value: bps / 100 });
}

export function lossTone(value: number): "loss" | undefined {
  return value < 0 ? "loss" : undefined;
}

const CORP = String.fromCharCode(0xc8fc, 0xc2dd, 0xd68c, 0xc0ac);

export function shortName(name?: string | null, legal?: string | null): string {
  const source = (name && name.trim()) || legal || "";
  return source
    .replace(new RegExp(`^${CORP}\\s+`), "")
    .replace(new RegExp(`\\s+${CORP}$`), "")
    .replace(new RegExp(`\\(${String.fromCharCode(0xc8fc)}\\)`, "g"), "")
    .trim();
}
