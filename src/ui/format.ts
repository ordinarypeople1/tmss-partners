import { useMemo } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { formatUsdThousand } from "../i18n/money";
import type { Figure, GameDate } from "../sim/types";

/** Number formatting for the screen. Amounts are thousand USD. */
export interface Format {
  money(value: number): string;
  /** With a leading + for gains. */
  signedMoney(value: number): string;
  /** A fogged figure: one amount when known, a range when not. */
  figure(value: Figure): string;
  /** The same without the currency word, for table cells under a header that names it. */
  shortFigure(value: Figure): string;
  shortMoney(value: number): string;
  /** Basis points as a percentage: 1250 → "12.5%". */
  pct(bps: number, digits?: number): string;
  signedPct(bps: number, digits?: number): string;
  /** Thousandths as a multiple: 7200 → "7.2x". */
  multiple(millis: number, digits?: number): string;
  date(date: GameDate): string;
  shortDate(date: GameDate): string;
  integer(value: number): string;
}

export function makeFormat(intl: IntlShape): Format {
  const number = (value: number, digits: number) =>
    intl.formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = (value: number, text: string) => (value > 0 ? `+${text}` : text);
  return {
    money: (value) => formatUsdThousand(intl, value),
    signedMoney: (value) => sign(value, formatUsdThousand(intl, value)),
    figure: ([low, high]) =>
      low === high
        ? formatUsdThousand(intl, low)
        : intl.formatMessage(
            { id: "format.range" },
            { low: formatUsdThousand(intl, low), high: formatUsdThousand(intl, high) },
          ),
    shortMoney: (value) => formatUsdThousand(intl, value, "short"),
    shortFigure: ([low, high]) =>
      low === high
        ? formatUsdThousand(intl, low, "short")
        : intl.formatMessage(
            { id: "format.rangeShort" },
            { low: formatUsdThousand(intl, low, "short"), high: formatUsdThousand(intl, high, "short") },
          ),
    pct: (bps, digits = 1) => `${number(bps / 100, digits)}%`,
    signedPct: (bps, digits = 1) => sign(bps, `${number(bps / 100, digits)}%`),
    multiple: (millis, digits = 1) => `${number(millis / 1000, digits)}x`,
    date: (date) => intl.formatMessage({ id: "format.date" }, { year: date.year, month: date.month }),
    shortDate: (date) =>
      intl.formatMessage({ id: "format.shortDate" }, { year: date.year % 100, month: date.month }),
    integer: (value) => intl.formatNumber(value, { maximumFractionDigits: 0 }),
  };
}

export function useFormat(): Format {
  const intl = useIntl();
  return useMemo(() => makeFormat(intl), [intl]);
}

export function monthsBetween(from: GameDate, to: GameDate): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/** The middle of a figure, for sorting and sizing. */
export function mid(value: Figure): number {
  return (value[0] + value[1]) / 2;
}
