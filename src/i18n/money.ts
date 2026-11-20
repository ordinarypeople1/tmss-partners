import type { IntlShape } from "react-intl";

function withSign(value: number, text: string): string {
  return value < 0 ? `-${text}` : text;
}

/**
 * Every locale counts money the American way: K, M, B, T. Each step is
 * [at least this many thousand USD, divide by this, catalog key suffix].
 */
const STEPS: [number, number, string][] = [
  [1_000_000_000, 1_000_000_000, "t"],
  [1_000_000, 1_000_000, "b"],
  [1_000, 1_000, "m"],
  [0, 1, "k"],
];

/**
 * Format an integer amount stored in thousand USD: $750M, $1.2B. The `short`
 * family drops the $ for dense tables whose header names the unit.
 */
export function formatUsdThousand(intl: IntlShape, value: number, family: "usd" | "short" = "usd"): string {
  const absolute = Math.abs(value);
  if (absolute === 0) {
    return intl.formatMessage({ id: `money.${family}.zero` });
  }
  for (const [least, divisor, key] of STEPS) {
    if (absolute >= least) {
      return withSign(value, intl.formatMessage({ id: `money.${family}.${key}` }, { value: absolute / divisor }));
    }
  }
  return String(value);
}
