import type { IntlShape } from "react-intl";

function withSign(value: number, text: string): string {
  return value < 0 ? `-${text}` : text;
}

/**
 * Format an integer amount stored in thousand USD for the active catalog.
 * The catalog owns the scales: Korean reads 만, 억, 조.
 */
export function formatUsdThousand(intl: IntlShape, value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return withSign(value, intl.formatMessage({ id: "money.usd.jo" }, { value: absolute / 1_000_000_000 }));
  }
  if (absolute >= 100_000) {
    return withSign(value, intl.formatMessage({ id: "money.usd.eok" }, { value: absolute / 100_000 }));
  }
  if (absolute >= 10) {
    return withSign(value, intl.formatMessage({ id: "money.usd.man" }, { value: absolute / 10 }));
  }
  return withSign(value, intl.formatMessage({ id: "money.usd.thousand" }, { value: absolute }));
}
