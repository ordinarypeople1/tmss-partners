/**
 * Enterprise value at a deal moment.
 * Equity value is enterprise value minus net debt.
 * There is no share price and no price path between deals.
 * Multiples are model inputs. See docs/finance/model-spec.md.
 */

export function enterpriseValue(ebitda: number, multiple: number): number {
  if (!Number.isFinite(ebitda) || !Number.isFinite(multiple)) {
    throw new Error("ebitda and multiple must be finite numbers");
  }
  if (multiple < 0) {
    throw new Error("multiple must be non-negative");
  }
  return Math.round(ebitda * multiple);
}

export function equityValue(ebitda: number, multiple: number, netDebt: number): number {
  if (!Number.isFinite(netDebt)) {
    throw new Error("netDebt must be a finite number");
  }
  return enterpriseValue(ebitda, multiple) - Math.round(netDebt);
}
