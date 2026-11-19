import type { IntlShape } from "react-intl";

function withSign(value: number, text: string): string {
  return value < 0 ? `-${text}` : text;
}

/** Format an integer amount stored in million KRW for the active catalog. */
export function formatKrwMillion(intl: IntlShape, value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return withSign(
      value,
      intl.formatMessage({ id: "money.krw.jo" }, { value: absolute / 1_000_000 }),
    );
  }
  if (absolute >= 100) {
    return withSign(value, intl.formatMessage({ id: "money.krw.eok" }, { value: absolute / 100 }));
  }
  return withSign(value, intl.formatMessage({ id: "money.krw.million" }, { value: absolute }));
}

/**
 * USD from million KRW at a caller-supplied rate.
 * The rate is a placeholder until a scenario names one. Wording such as
 * million/billion waits for the later catalogs. See docs/i18n/workflow.md.
 */
export function formatUsdFromKrwMillion(
  intl: IntlShape,
  krwMillion: number,
  krwPerUsd: number,
): string {
  const dollars = (krwMillion * 1_000_000) / krwPerUsd;
  return intl.formatNumber(dollars, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** Format an integer amount stored in thousand USD for the active catalog. */
export function formatUsdThousand(intl: IntlShape, value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return withSign(
      value,
      intl.formatMessage({ id: "money.usd.jo" }, { value: absolute / 1_000_000_000 }),
    );
  }
  if (absolute >= 100_000) {
    return withSign(value, intl.formatMessage({ id: "money.usd.eok" }, { value: absolute / 100_000 }));
  }
  if (absolute >= 10) {
    return withSign(value, intl.formatMessage({ id: "money.usd.man" }, { value: absolute / 10 }));
  }
  return withSign(value, intl.formatMessage({ id: "money.usd.thousand" }, { value: absolute }));
}
