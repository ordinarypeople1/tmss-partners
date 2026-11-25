import type { Translate } from "../i18n/useT";
import { BLOCS, type Bloc, type CompanyRow, type GameDate, type MacroEffect, type MacroEventView, type MacroKind, type MacroUnit, type Race } from "../sim/types";
import type { Format } from "./format";

/**
 * Display helpers for the macro calendar. No simulation math: the release
 * values, surprises and effects all come from sim-core's view.
 */

/** Germany and France read the euro area. */
export function blocOf(country: string): Bloc | null {
  switch (country) {
    case "US":
      return "us";
    case "DE":
    case "FR":
      return "ez";
    case "CN":
      return "cn";
    case "GB":
      return "gb";
    case "JP":
      return "jp";
    case "KR":
      return "kr";
    default:
      return null;
  }
}

/** Slot of a bloc in the economy's per-bloc arrays. */
export function blocIndex(bloc: Bloc): number {
  return BLOCS.indexOf(bloc);
}

/** The unit each kind reports in. Mirrors `MacroKind::unit` for messages, which carry no unit. */
const UNITS: Record<MacroKind, MacroUnit> = {
  fomc: "rate_bps",
  ecb: "rate_bps",
  cn_lpr: "rate_bps",
  boe: "rate_bps",
  boj: "rate_bps",
  bok: "rate_bps",
  us_payrolls: "jobs_k",
  us_ism: "index_tenths",
  ifo: "index_tenths",
  tankan: "points",
  us_election: "party",
  us_midterm: "party",
  uk_election: "party",
  de_election: "party",
  fr_election: "party",
  jp_election: "party",
  kr_election: "party",
  kr_general: "party",
  tax_bill: "vote",
  trade_act: "vote",
  regulation_rule: "vote",
  tariff_shock: "severity",
  geopolitics: "severity",
  bank_stress: "severity",
  us_cpi: "pct_bps",
  us_gdp: "pct_bps",
  sloos: "pct_bps",
  ez_hicp: "pct_bps",
  cn_activity: "pct_bps",
  cn_trade: "pct_bps",
  cn_npc: "pct_bps",
  uk_cpi: "pct_bps",
  uk_budget: "pct_bps",
  shunto: "pct_bps",
  kr_exports: "pct_bps",
};

/** The race an election kind belongs to. Mirrors `MacroKind::race`. */
const RACE: Partial<Record<MacroKind, Race>> = {
  us_election: "us",
  us_midterm: "us",
  uk_election: "gb",
  de_election: "de",
  fr_election: "fr",
  jp_election: "jp",
  kr_election: "kr",
  kr_general: "kr",
};

export function macroUnit(kind: MacroKind): MacroUnit {
  return UNITS[kind];
}

export function raceOf(kind: MacroKind): Race | null {
  return RACE[kind] ?? null;
}

export function partyName(t: Translate, race: Race | null, party: number): string {
  return t(`party.${race ?? "us"}.${party}`);
}

/**
 * A value in its unit. `resolved` says whether a party or vote value is an
 * outcome or still a poll or the odds. `race` names the parties.
 */
export function formatMacroValue(t: Translate, f: Format, unit: MacroUnit, value: number, resolved = true, race: Race | null = null): string {
  switch (unit) {
    case "rate_bps":
      return f.pct(value, 2);
    case "pct_bps":
      return f.pct(value, 1);
    case "jobs_k":
      return t("calendar.unit.jobs", { value: f.integer(value) });
    case "index_tenths":
      return f.decimal(value / 10, 1);
    case "points":
      return `${value > 0 ? "+" : ""}${f.integer(value)}`;
    case "party":
      return resolved
        ? partyName(t, race, value)
        : t("calendar.unit.poll", { party: partyName(t, race, 0), share: f.pct(value, 0) });
    case "vote":
      return resolved ? t(value === 1 ? "calendar.vote.passed" : "calendar.vote.failed") : t("calendar.vote.odds", { chance: f.pct(value, 0) });
    case "severity":
      return t(`calendar.severity.${Math.min(Math.max(value, 1), 3)}`);
    default:
      return f.integer(value);
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
    case "trade_drag":
    case "energy_cost":
      return {
        label: t(`calendar.effect.${effect.channel}`),
        value: effect.channel === "policy_rate" || effect.channel === "credit_spread" ? `${f.signedPct(effect.delta_bps, 2)}p` : f.signedPct(effect.delta_bps, 2),
        up: effect.delta_bps > 0,
      };
    case "bloc_growth":
      return {
        label: t("calendar.effect.bloc_growth", { bloc: t(`bloc.${effect.bloc}`) }),
        value: t("calendar.effect.perMonth", { value: f.signedPct(effect.delta_bps, 2) }),
        up: effect.delta_bps > 0,
      };
    case "bloc_multiple":
    case "tax_rate":
    case "approval_drag":
    case "local_rate":
      return {
        label: t(`calendar.effect.${effect.channel}`, { bloc: t(`bloc.${effect.bloc}`) }),
        value:
          effect.channel === "bloc_multiple"
            ? f.signedPct(effect.delta_bps, 2)
            : `${f.signedPct(effect.delta_bps, effect.channel === "local_rate" ? 2 : 1)}p`,
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
  const higherIsWorse =
    effect.channel === "policy_rate" ||
    effect.channel === "local_rate" ||
    effect.channel === "credit_spread" ||
    effect.channel === "uncertainty" ||
    effect.channel === "tax_rate" ||
    effect.channel === "approval_drag" ||
    effect.channel === "trade_drag" ||
    effect.channel === "energy_cost";
  return (delta > 0) !== higherIsWorse ? "good" : "bad";
}

/**
 * Companies an event touches: the holdings sim-core names, and deals or
 * watched companies in the same bloc and sector.
 */
export function exposedTo(event: MacroEventView, rows: CompanyRow[]): CompanyRow[] {
  return rows.filter(
    (row) =>
      event.exposed.includes(row.i) ||
      ((row.in_deal || row.watched) &&
        row.owner.kind !== "player" &&
        blocOf(row.country) === event.bloc &&
        (event.sectors.length === 0 || event.sectors.includes(row.sector))),
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
