import type { IntlShape } from "react-intl";

function withSign(value: number, text: string): string {
  return value < 0 ? `-${text}` : text;
}

/**
 * How a locale counts money. Each step is [at least this many thousand USD,
 * divide by this, catalog key suffix]. Korean, Japanese and Chinese count in
 * ten-thousands (만, 억, 조); English counts in thousands (K, M, B).
 */
type Step = [number, number, string];
const MYRIAD: Step[] = [
  [1_000_000_000, 1_000_000_000, "jo"],
  [100_000, 100_000, "eok"],
  [10, 10, "man"],
  [0, 1, "thousand"],
];
const THOUSANDS: Step[] = [
  [1_000_000, 1_000_000, "b"],
  [1_000, 1_000, "m"],
  [0, 1, "k"],
];

function steps(locale: string): Step[] {
  return locale.startsWith("en") ? THOUSANDS : MYRIAD;
}

/**
 * Format an integer amount stored in thousand USD for the active catalog.
 * The catalog owns the words. The `short` family drops the currency word for
 * dense tables whose header names the unit.
 */
export function formatUsdThousand(intl: IntlShape, value: number, family: "usd" | "short" = "usd"): string {
  const absolute = Math.abs(value);
  if (absolute === 0) {
    return intl.formatMessage({ id: `money.${family}.zero` });
  }
  for (const [least, divisor, key] of steps(intl.locale)) {
    if (absolute >= least) {
      return withSign(value, intl.formatMessage({ id: `money.${family}.${key}` }, { value: absolute / divisor }));
    }
  }
  return String(value);
}
