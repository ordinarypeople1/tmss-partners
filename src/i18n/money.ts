import type { IntlShape } from "react-intl";

function withSign(value: number, text: string): string {
  return value < 0 ? `-${text}` : text;
}

/**
 * Format an integer amount stored in thousand USD for the active catalog.
 * The catalog owns the scales: Korean reads 만, 억, 조. The `short` family
 * drops the currency word for dense tables whose header names the unit.
 */
export function formatUsdThousand(intl: IntlShape, value: number, family: "usd" | "short" = "usd"): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return withSign(value, intl.formatMessage({ id: `money.${family}.jo` }, { value: absolute / 1_000_000_000 }));
  }
  if (absolute >= 100_000) {
    return withSign(value, intl.formatMessage({ id: `money.${family}.eok` }, { value: absolute / 100_000 }));
  }
  if (absolute >= 10) {
    return withSign(value, intl.formatMessage({ id: `money.${family}.man` }, { value: absolute / 10 }));
  }
  return withSign(value, intl.formatMessage({ id: `money.${family}.thousand` }, { value: absolute }));
}
