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

const TRAIT_RATING: Record<string, number> = {
  operator: 14,
  grower: 16,
  cutter: 12,
};

export function attributeRating(bps: number | null | undefined): number | null {
  if (bps == null || Number.isNaN(bps)) {
    return null;
  }
  return Math.min(20, Math.max(1, Math.round(10 + bps / 80)));
}

export function traitRating(traitId: string): number | null {
  return TRAIT_RATING[traitId] ?? null;
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
