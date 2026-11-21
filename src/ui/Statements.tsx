import { useState } from "react";
import type { Translate } from "../i18n/useT";
import type { StatementPeriod, Statements as Data } from "../sim/types";
import type { Format } from "./format";
import "./Statements.css";

type Kind = "income" | "balance" | "cashflow";
type Span = "annual" | "quarterly";

interface Row {
  /** Key under `statement.line.`. */
  key: string;
  get: (period: StatementPeriod) => number;
  /** A subtotal: bold, with a rule above. */
  total?: boolean;
  /** A ratio in basis points, not an amount. */
  pct?: boolean;
}

const margin = (numerator: (period: StatementPeriod) => number) => (period: StatementPeriod) =>
  period.income.revenue ? Math.round((numerator(period) / period.income.revenue) * 10_000) : 0;

/** The usual order of a banking model, top to bottom. */
const ROWS: Record<Kind, Row[]> = {
  income: [
    { key: "revenue", get: (p) => p.income.revenue, total: true },
    { key: "cogs", get: (p) => -p.income.cogs },
    { key: "grossProfit", get: (p) => p.income.gross_profit, total: true },
    { key: "grossMargin", get: margin((p) => p.income.gross_profit), pct: true },
    { key: "sga", get: (p) => -p.income.sga },
    { key: "ebitda", get: (p) => p.income.ebitda, total: true },
    { key: "ebitdaMargin", get: margin((p) => p.income.ebitda), pct: true },
    { key: "da", get: (p) => -p.income.da },
    { key: "ebit", get: (p) => p.income.ebit, total: true },
    { key: "ebitMargin", get: margin((p) => p.income.ebit), pct: true },
    { key: "interest", get: (p) => -p.income.interest },
    { key: "ebt", get: (p) => p.income.ebt },
    { key: "tax", get: (p) => -p.income.tax },
    { key: "netIncome", get: (p) => p.income.net_income, total: true },
  ],
  balance: [
    { key: "cash", get: (p) => p.balance.cash },
    { key: "receivables", get: (p) => p.balance.receivables },
    { key: "inventory", get: (p) => p.balance.inventory },
    { key: "netPpe", get: (p) => p.balance.net_ppe },
    { key: "goodwill", get: (p) => p.balance.goodwill },
    { key: "totalAssets", get: (p) => p.balance.total_assets, total: true },
    { key: "payables", get: (p) => p.balance.payables },
    { key: "debt", get: (p) => p.balance.debt },
    { key: "totalLiabilities", get: (p) => p.balance.total_liabilities, total: true },
    { key: "shareCapital", get: (p) => p.balance.share_capital },
    { key: "retained", get: (p) => p.balance.retained_earnings },
    { key: "totalEquity", get: (p) => p.balance.total_equity, total: true },
    { key: "netDebt", get: (p) => p.balance.debt - p.balance.cash },
  ],
  cashflow: [
    { key: "netIncome", get: (p) => p.cashflow.net_income },
    { key: "da", get: (p) => p.cashflow.da },
    { key: "nwc", get: (p) => p.cashflow.change_in_nwc },
    { key: "operating", get: (p) => p.cashflow.operating, total: true },
    { key: "capex", get: (p) => p.cashflow.capex },
    { key: "fcf", get: (p) => p.cashflow.free_cash_flow, total: true },
    { key: "debtNet", get: (p) => p.cashflow.debt_net },
    { key: "dividends", get: (p) => p.cashflow.dividends },
    { key: "other", get: (p) => p.cashflow.other },
    { key: "netChange", get: (p) => p.cashflow.net_change, total: true },
    { key: "closingCash", get: (p) => p.cashflow.closing_cash },
  ],
};

/** Fiscal years shown in the annual table: three, the usual span of a CIM. */
const ANNUAL_YEARS = 3;

function label(t: Translate, period: StatementPeriod, ltm = false): string {
  if (ltm) {
    return t("statement.col.ltm");
  }
  const yy = String(period.year % 100).padStart(2, "0");
  return period.quarter === 0 ? t("statement.col.fy", { yy }) : t("statement.col.quarter", { quarter: period.quarter, yy });
}

/** Five years of revenue and operating income as bars, operating margin as a line. */
export function FiveYearChart({ years, t, f }: { years: StatementPeriod[]; t: Translate; f: Format }) {
  if (years.length === 0) {
    return null;
  }
  const width = 480;
  const height = 220;
  // The margin line runs in its own band above the bars.
  const band = { top: 18, bottom: 58 };
  const pad = { left: 8, right: 8, top: 70, bottom: 26 };
  const high = Math.max(...years.map((year) => year.income.revenue), 1);
  const low = Math.min(0, ...years.map((year) => year.income.ebit));
  const margins = years.map((year) => (year.income.revenue ? year.income.ebit / year.income.revenue : 0));
  const marginHigh = Math.max(...margins.map(Math.abs), 0.05) * 1.25;
  const inner = height - pad.top - pad.bottom;
  const y = (value: number) => pad.top + (1 - (value - low) / (high - low || 1)) * inner;
  const marginLow = Math.min(0, ...margins);
  const ym = (value: number) => band.top + (1 - (value - marginLow) / (marginHigh - marginLow || 1)) * (band.bottom - band.top);
  const slot = (width - pad.left - pad.right) / years.length;
  const bar = Math.min(slot * 0.3, 30);
  const cx = (index: number) => pad.left + slot * (index + 0.5);
  return (
    <figure className="chart five-year">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("statement.chart")}>
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        {years.map((year, index) => (
          <g key={year.year}>
            <rect x={cx(index) - bar - 1} y={y(year.income.revenue)} width={bar} height={Math.max(y(0) - y(year.income.revenue), 0)} fill="var(--s1)" rx={2}>
              <title>{`${t("statement.line.revenue")} ${f.money(year.income.revenue)}`}</title>
            </rect>
            <rect
              x={cx(index) + 1}
              y={Math.min(y(year.income.ebit), y(0))}
              width={bar}
              height={Math.abs(y(0) - y(year.income.ebit))}
              fill={year.income.ebit < 0 ? "var(--bad)" : "var(--s2)"}
              rx={2}
            >
              <title>{`${t("statement.line.ebit")} ${f.money(year.income.ebit)}`}</title>
            </rect>
            <text x={cx(index)} y={height - 8} textAnchor="middle" className="five-year-x">
              {label(t, year)}
            </text>
          </g>
        ))}
        <path
          d={margins.map((value, index) => `${index ? "L" : "M"}${cx(index).toFixed(1)},${ym(value).toFixed(1)}`).join("")}
          fill="none"
          stroke="var(--s3)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {margins.map((value, index) => (
          <g key={index}>
            <circle cx={cx(index)} cy={ym(value)} r={3.5} fill="var(--panel)" stroke="var(--s3)" strokeWidth={2} />
            <text x={cx(index)} y={ym(value) - 8} textAnchor="middle" className="five-year-pct">
              {f.pct(Math.round(value * 10_000))}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span className="legend">
          <i style={{ background: "var(--s1)" }} />
          {t("statement.line.revenue")}
        </span>
        <span className="legend">
          <i style={{ background: "var(--s2)" }} />
          {t("statement.line.ebit")}
        </span>
        <span className="legend">
          <i style={{ background: "var(--s3)" }} />
          {t("statement.line.ebitMargin")}
        </span>
      </figcaption>
    </figure>
  );
}

/** The three statements, annual (three fiscal years and LTM) or the last eight quarters. */
export function StatementTables({ data, t, f }: { data: Data; t: Translate; f: Format }) {
  const [kind, setKind] = useState<Kind>("income");
  const [span, setSpan] = useState<Span>("annual");
  const years = data.years.slice(-ANNUAL_YEARS);
  const lastYear = years[years.length - 1];
  // LTM equals the last fiscal year right after a December close; show it only when it differs.
  const showLtm = data.ltm !== null && lastYear !== undefined && data.quarters[data.quarters.length - 1]?.quarter !== 4;
  const columns: { period: StatementPeriod; ltm?: boolean }[] =
    span === "annual"
      ? [...years.map((period) => ({ period })), ...(showLtm && data.ltm ? [{ period: data.ltm, ltm: true }] : [])]
      : data.quarters.map((period) => ({ period }));
  return (
    <section className="card statements">
      <div className="statements-head">
        <div className="segmented" role="tablist" aria-label={t("statement.kind")}>
          {(["income", "balance", "cashflow"] as Kind[]).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)}>
              {t(`statement.kind.${id}`)}
            </button>
          ))}
        </div>
        <span className="statements-unit">{t("statement.unit")}</span>
        <div className="segmented" role="tablist" aria-label={t("statement.span")}>
          {(["annual", "quarterly"] as Span[]).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={span === id} onClick={() => setSpan(id)}>
              {t(`statement.span.${id}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="statements-scroll">
        <table className="table statement-table">
          <thead>
            <tr>
              <th scope="col">{t(`statement.kind.${kind}`)}</th>
              {columns.map(({ period, ltm }) => (
                <th key={`${period.year}-${period.quarter}-${ltm ? "ltm" : ""}`} scope="col" className="num" data-ltm={ltm || undefined}>
                  {label(t, period, ltm)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS[kind].map((row) => (
              <tr key={row.key} data-total={row.total || undefined} data-pct={row.pct || undefined}>
                <th scope="row">{t(`statement.line.${row.key}`)}</th>
                {columns.map(({ period, ltm }) => {
                  const value = row.get(period);
                  return (
                    <td key={`${period.year}-${period.quarter}-${ltm ? "ltm" : ""}`} className="num" data-negative={value < 0 || undefined} data-ltm={ltm || undefined}>
                      {row.pct ? f.pct(value) : f.millions(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
