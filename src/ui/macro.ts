import type { Translate } from "../i18n/useT";
import type { Bloc, CompanyRow, GameDate, MacroEffect, MacroEventView, MacroKind, MacroUnit } from "../sim/types";
import type { Format } from "./format";

/**
 * Display helpers for the macro calendar. No simulation math: the release
 * values, surprises and effects all come from sim-core's view.
 */

/** Germany and France read the euro area. Other countries have no bloc yet. */
export function blocOf(country: string): Bloc | null {
  switch (country) {
    case "US":
      return "us";
    case "DE":
    case "FR":
      return "ez";
    case "CN":
      return "cn";
    default:
      return null;
  }
}

/** The unit each kind reports in. Mirrors `MacroKind::unit` for messages, which carry no unit. */
const UNITS: Record<MacroKind, MacroUnit> = {
  fomc: "rate_bps",
  ecb: "rate_bps",
  cn_lpr: "rate_bps",
  us_payrolls: "jobs_k",
  us_ism: "index_tenths",
  ifo: "index_tenths",
  us_election: "party",
  us_midterm: "party",
  us_cpi: "pct_bps",
  us_gdp: "pct_bps",
  sloos: "pct_bps",
  ez_hicp: "pct_bps",
  cn_activity: "pct_bps",
  cn_trade: "pct_bps",
  cn_npc: "pct_bps",
};

export function macroUnit(kind: MacroKind): MacroUnit {
  return UNITS[kind];
}

/** A value in its unit. `resolved` says whether a party value is a winner or a poll share. */
export function formatMacroValue(t: Translate, f: Format, unit: MacroUnit, value: number, resolved = true): string {
  switch (unit) {
    case "rate_bps":
      return f.pct(value, 2);
    case "pct_bps":
      return f.pct(value, 1);
    case "jobs_k":
      return t("calendar.unit.jobs", { value: f.integer(value) });
    case "index_tenths":
      return f.decimal(value / 10, 1);
    case "party":
      return resolved ? t(`party.${value}`) : t("calendar.unit.poll", { party: t("party.0"), share: f.pct(value, 0) });
  }
}

/** Hundredths of the usual miss as "+1.8σ". */
export function formatSurprise(f: Format, centi: number): string {
  const text = f.decimal(Math.abs(centi) / 100, 1);
  return `${centi > 0 ? "+" : centi < 0 ? "−" : ""}${text}σ`;
}

export function effectText(t: Translate, f: Format, effect: MacroEffect): { label: string; value: string; up: boolean } {
  switch (effect.channel) {
    case "policy_rate":
    case "credit_spread":
      return {
        label: t(`calendar.effect.${effect.channel}`),
        value: `${f.signedPct(effect.delta_bps, 2)}p`,
        up: effect.delta_bps > 0,
      };
    case "bloc_growth":
      return {
        label: t("calendar.effect.bloc_growth", { bloc: t(`bloc.${effect.bloc}`) }),
        value: t("calendar.effect.perMonth", { value: f.signedPct(effect.delta_bps, 2) }),
        up: effect.delta_bps > 0,
      };
    case "bloc_multiple":
      return {
        label: t("calendar.effect.bloc_multiple", { bloc: t(`bloc.${effect.bloc}`) }),
        value: f.signedPct(effect.delta_bps, 2),
        up: effect.delta_bps > 0,
      };
    case "sector_cycle":
      return {
        label: t("calendar.effect.sector_cycle", { sector: t(`sector.${effect.sector}`) }),
        value: f.signedPct(effect.delta_bps, 2),
        up: effect.delta_bps > 0,
      };
    case "uncertainty":
      return {
        label: t("calendar.effect.uncertainty", { bloc: t(`bloc.${effect.bloc}`) }),
        value: `${effect.delta > 0 ? "+" : ""}${f.integer(effect.delta)}`,
        up: effect.delta > 0,
      };
  }
}

/** Is a move in this channel good news for a buyer who holds companies? */
export function effectTone(effect: MacroEffect): "good" | "bad" {
  const delta = effect.channel === "uncertainty" ? effect.delta : effect.delta_bps;
  const higherIsWorse = effect.channel === "policy_rate" || effect.channel === "credit_spread" || effect.channel === "uncertainty";
  return (delta > 0) !== higherIsWorse ? "good" : "bad";
}

/** Companies the player owns, is in a deal for, or watches that a release touches. */
export function exposedTo(event: MacroEventView, rows: CompanyRow[]): CompanyRow[] {
  return rows.filter(
    (row) =>
      (row.owner.kind === "player" || row.in_deal || row.watched) &&
      blocOf(row.country) === event.bloc &&
      (event.sectors.length === 0 || event.sectors.includes(row.sector)),
  );
}

export function sameMonth(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.month === b.month;
}

export function addMonths(date: GameDate, months: number): GameDate {
  const total = date.year * 12 + date.month - 1 + months;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** Sunday is 0. */
export function weekday(date: GameDate, day: number): number {
  return new Date(Date.UTC(date.year, date.month - 1, day)).getUTCDay();
}

export function daysIn(date: GameDate): number {
  return new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();
}
