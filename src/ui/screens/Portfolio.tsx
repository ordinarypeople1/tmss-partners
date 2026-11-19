import { useState, type KeyboardEvent } from "react";
import "./Portfolio.css";
import { useT, type Translate } from "../../i18n/useT";
import type { CompanyView, Financials, HoldingView } from "../../sim/types";
import { Meter, Ring, SERIES, StackBar, Stat, Tag } from "../charts";
import { useFormat, type Format } from "../format";
import { useGame } from "../game";
import { Icon } from "../icons";

type Tone = "good" | "bad" | "warn" | "accent" | "muted";

interface Item {
  company: CompanyView;
  holding: HoldingView;
  financials: Financials | undefined;
  /** Mark plus dividends received, less cost. */
  gain: number;
}

interface Alert {
  key: string;
  tone: Tone;
  text: string;
  icon: string;
}

function alertsOf(t: Translate, holding: HoldingView): Alert[] {
  const alerts: Alert[] = [];
  if (holding.breaches > 0) {
    alerts.push({ key: "breach", tone: "bad", text: t("portfolio.alert.breach", { count: holding.breaches }), icon: "alert" });
  }
  if (holding.waiver_quarters > 0) {
    alerts.push({ key: "waiver", tone: "warn", text: t("portfolio.alert.waiver"), icon: "gavel" });
  }
  if (holding.strike) {
    alerts.push({ key: "strike", tone: "bad", text: t("portfolio.alert.strike"), icon: "alert" });
  }
  if (holding.shortfall) {
    alerts.push({ key: "shortfall", tone: "bad", text: t("portfolio.alert.shortfall"), icon: "alert" });
  }
  if (holding.exit) {
    const route = t(`route.${holding.exit.route}`);
    alerts.push(
      holding.exit.offer_ev !== null
        ? { key: "exit", tone: "good", text: t("portfolio.alert.offer", { route }), icon: "inbox" }
        : { key: "exit", tone: "accent", text: t("portfolio.alert.exiting", { route, months: holding.exit.months_left }), icon: "exit" },
    );
  }
  return alerts;
}

function moicTone(millis: number): "good" | "bad" | undefined {
  return millis > 1000 ? "good" : millis < 1000 ? "bad" : undefined;
}

/** Traffic light against a ceiling (leverage) or a floor (interest cover). */
function limitTone(value: number, limit: number, higherIsWorse: boolean): "good" | "warn" | "bad" {
  const breached = higherIsWorse ? value > limit : value < limit;
  if (breached) {
    return "bad";
  }
  return Math.abs(value - limit) / (Math.abs(limit) || 1) < 0.12 ? "warn" : "good";
}

function signTone(value: number): "good" | "bad" | undefined {
  return value > 0 ? "good" : value < 0 ? "bad" : undefined;
}

function HoldingCard({ item, active, onOpen }: { item: Item; active: boolean; onOpen: () => void }) {
  const t = useT();
  const f = useFormat();
  const { company, holding, financials } = item;
  const alerts = alertsOf(t, holding);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  const bridge = [
    { key: "ebitda", label: t("portfolio.bridge.ebitda"), value: holding.bridge.ebitda },
    { key: "multiple", label: t("portfolio.bridge.multiple"), value: holding.bridge.multiple },
    { key: "debt", label: t("portfolio.bridge.debt"), value: holding.bridge.debt },
  ];
  const span = Math.max(...bridge.map((part) => Math.abs(part.value)), 1);
  return (
    <article
      className="card pf-card"
      role="button"
      tabIndex={0}
      aria-label={t("portfolio.card.open", { name: company.name })}
      aria-pressed={active}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <header className="pf-card-head">
        <span className="pf-sector">
          <Icon name={company.sector} size={20} />
        </span>
        <div className="pf-card-name">
          <strong>{company.name}</strong>
          <span className="muted">
            {t(`sector.${company.sector}`)} · {t(`admin1.${company.admin1}`)}
          </span>
        </div>
        <Tag tone={moicTone(holding.moic_millis)}>
          {t("term.moic")} {f.multiple(holding.moic_millis, 2)}
        </Tag>
      </header>

      <div className="pf-money">
        <div className="pf-flow">
          <span className="muted">{f.money(holding.cost)}</span>
          <Icon name={item.gain >= 0 ? "up" : "down"} size={14} />
          <strong data-tone={signTone(item.gain)}>{f.money(holding.value)}</strong>
        </div>
        <div className="row pf-meta">
          <Tag icon={<Icon name="clock" size={12} />}>{t("portfolio.card.held", { months: holding.months_held })}</Tag>
          <Tag tone={holding.irr_bps === null ? "muted" : signTone(holding.irr_bps)}>
            {t("term.irr")} {holding.irr_bps === null ? "–" : f.pct(holding.irr_bps)}
          </Tag>
        </div>
      </div>

      <ul className="pf-bridge">
        {bridge.map((part) => (
          <li key={part.key} data-tone={signTone(part.value)}>
            <span className="muted">{part.label}</span>
            <b>{f.signedMoney(part.value)}</b>
            <span className="pf-bar" aria-hidden>
              <i style={{ width: `${(Math.abs(part.value) / span) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>

      {financials ? (
        <div className="pf-limits">
          <Meter
            value={financials.leverage_millis}
            max={holding.max_leverage_millis * 1.3}
            marker={holding.max_leverage_millis}
            tone={limitTone(financials.leverage_millis, holding.max_leverage_millis, true)}
            label={t("term.leverage")}
            text={t("portfolio.limit.max", { value: f.multiple(financials.leverage_millis), limit: f.multiple(holding.max_leverage_millis) })}
          />
          <Meter
            value={financials.cover_millis}
            max={holding.min_cover_millis * 3}
            marker={holding.min_cover_millis}
            tone={limitTone(financials.cover_millis, holding.min_cover_millis, false)}
            label={t("term.cover")}
            text={t("portfolio.limit.min", { value: f.multiple(financials.cover_millis), limit: f.multiple(holding.min_cover_millis) })}
          />
        </div>
      ) : null}

      {holding.initiatives.length > 0 || alerts.length > 0 ? (
        <div className="row pf-tags">
          {alerts.map((alert) => (
            <Tag key={alert.key} tone={alert.tone} icon={<Icon name={alert.icon} size={12} />}>
              {alert.text}
            </Tag>
          ))}
          {holding.initiatives.map((initiative) => (
            <Tag key={initiative.kind} icon={<Ring fraction={initiative.months_left / 6} size={14} />}>
              {t("portfolio.init.left", { name: t(`initiative.${initiative.kind}`), months: initiative.months_left })}
            </Tag>
          ))}
        </div>
      ) : null}
    </article>
  );
}

type SortKey = "company" | "sector" | "held" | "cost" | "value" | "moic" | "irr" | "ebitda" | "leverage" | "alerts";

interface Column {
  key: SortKey;
  label: string;
  numeric: boolean;
  sort: (item: Item, t: Translate) => number | string;
}

const COLUMNS: Column[] = [
  { key: "company", label: "portfolio.col.company", numeric: false, sort: (item) => item.company.name },
  { key: "sector", label: "term.sector", numeric: false, sort: (item, t) => t(`sector.${item.company.sector}`) },
  { key: "held", label: "portfolio.col.held", numeric: true, sort: (item) => item.holding.months_held },
  { key: "cost", label: "portfolio.col.cost", numeric: true, sort: (item) => item.holding.cost },
  { key: "value", label: "portfolio.col.value", numeric: true, sort: (item) => item.holding.value },
  { key: "moic", label: "term.moic", numeric: true, sort: (item) => item.holding.moic_millis },
  { key: "irr", label: "term.irr", numeric: true, sort: (item) => item.holding.irr_bps ?? Number.NEGATIVE_INFINITY },
  { key: "ebitda", label: "portfolio.col.ebitda", numeric: true, sort: (item) => (item.financials?.ttm_ebitda ?? 0) - item.holding.entry_ebitda },
  { key: "leverage", label: "portfolio.col.leverage", numeric: true, sort: (item) => (item.financials?.leverage_millis ?? 0) / (item.holding.max_leverage_millis || 1) },
  {
    key: "alerts",
    label: "portfolio.col.alerts",
    numeric: false,
    sort: (item) => item.holding.breaches * 4 + (item.holding.strike ? 2 : 0) + (item.holding.shortfall ? 2 : 0) + (item.holding.exit ? 1 : 0),
  },
];

function HoldingsTable({ items, selected, onOpen }: { items: Item[]; selected: number | null; onOpen: (index: number) => void }) {
  const t = useT();
  const f = useFormat();
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: "value", down: true });
  const column = COLUMNS.find((item) => item.key === sort.key) ?? COLUMNS[0];
  const sorted = [...items].sort((a, b) => {
    const left = column.sort(a, t);
    const right = column.sort(b, t);
    const order = typeof left === "string" || typeof right === "string" ? String(left).localeCompare(String(right)) : left - right;
    return sort.down ? -order : order;
  });
  const pick = (key: SortKey, numeric: boolean) => setSort((current) => (current.key === key ? { key, down: !current.down } : { key, down: numeric }));
  return (
    <div className="card pf-table-card">
      <table className="table pf-table">
        <thead>
          <tr>
            {COLUMNS.map((item) => (
              <th key={item.key} scope="col" className={item.numeric ? "num" : undefined} aria-sort={sort.key === item.key ? (sort.down ? "descending" : "ascending") : undefined}>
                <button type="button" title={t("portfolio.col.sort", { column: t(item.label) })} onClick={() => pick(item.key, item.numeric)}>
                  {t(item.label)}
                  {sort.key === item.key ? <Icon name={sort.down ? "down" : "up"} size={12} /> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ company, holding, financials }) => {
            const alerts = alertsOf(t, holding);
            const ebitda = financials?.ttm_ebitda;
            const growth = ebitda !== undefined && holding.entry_ebitda > 0 ? Math.round(((ebitda - holding.entry_ebitda) * 10000) / holding.entry_ebitda) : null;
            return (
              <tr key={company.i} aria-selected={selected === company.i} onClick={() => onOpen(company.i)}>
                <td className="name">
                  <button type="button" className="pf-link" onClick={() => onOpen(company.i)}>
                    {company.name}
                  </button>
                  <span className="sub">{t(`admin1.${company.admin1}`)}</span>
                </td>
                <td>
                  <span className="pf-cell-sector">
                    <Icon name={company.sector} size={14} />
                    {t(`sector.${company.sector}`)}
                  </span>
                </td>
                <td className="num">{t("format.months", { months: holding.months_held })}</td>
                <td className="num">{f.money(holding.cost)}</td>
                <td className="num">
                  <b>{f.money(holding.value)}</b>
                </td>
                <td className="num">
                  <Tag tone={moicTone(holding.moic_millis)}>{f.multiple(holding.moic_millis, 2)}</Tag>
                </td>
                <td className="num" data-tone={holding.irr_bps === null ? undefined : signTone(holding.irr_bps)}>
                  {holding.irr_bps === null ? "–" : f.pct(holding.irr_bps)}
                </td>
                <td className="num">
                  {ebitda === undefined ? "–" : f.money(ebitda)}
                  <span className="sub">
                    {f.money(holding.entry_ebitda)}
                    {growth !== null ? <b data-tone={signTone(growth)}> {f.signedPct(growth)}</b> : null}
                  </span>
                </td>
                <td className="num" data-tone={financials ? limitTone(financials.leverage_millis, holding.max_leverage_millis, true) : undefined}>
                  {financials ? f.multiple(financials.leverage_millis) : "–"}
                  <span className="sub">{f.multiple(holding.max_leverage_millis)}</span>
                </td>
                <td>
                  <span className="row pf-cell-alerts">
                    {alerts.length === 0 ? (
                      <span className="muted">–</span>
                    ) : (
                      alerts.map((alert) => (
                        <Tag key={alert.key} tone={alert.tone}>
                          {alert.text}
                        </Tag>
                      ))
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RealizedTable({ f, t }: { f: Format; t: Translate }) {
  const { view } = useGame();
  const realized = view.fund.realized;
  return (
    <section className="card pf-realized">
      <h2>
        <Icon name="exit" size={15} />
        {t("portfolio.realized.title")}
      </h2>
      {realized.length === 0 ? (
        <p className="muted">{t("portfolio.realized.empty")}</p>
      ) : (
        <div className="pf-scroll">
          <table className="table pf-static">
            <thead>
              <tr>
                <th scope="col">{t("portfolio.col.company")}</th>
                <th scope="col">{t("portfolio.realized.acquired")}</th>
                <th scope="col">{t("portfolio.realized.exited")}</th>
                <th scope="col">{t("portfolio.realized.route")}</th>
                <th scope="col" className="num">
                  {t("portfolio.col.cost")}
                </th>
                <th scope="col" className="num">
                  {t("portfolio.realized.proceeds")}
                </th>
                <th scope="col" className="num">
                  {t("term.moic")}
                </th>
                <th scope="col" className="num">
                  {t("term.irr")}
                </th>
              </tr>
            </thead>
            <tbody>
              {realized.map((exit, index) => (
                <tr key={`${exit.company}-${index}`}>
                  <td className="name">{exit.company}</td>
                  <td>{f.shortDate(exit.acquired)}</td>
                  <td>{f.shortDate(exit.exited)}</td>
                  <td>{exit.route ? <Tag>{t(`route.${exit.route}`)}</Tag> : <Tag tone="bad">{t("portfolio.realized.lender")}</Tag>}</td>
                  <td className="num">{f.money(exit.cost)}</td>
                  <td className="num">
                    <b>{f.money(exit.proceeds)}</b>
                  </td>
                  <td className="num">
                    <Tag tone={moicTone(exit.moic_millis)}>{f.multiple(exit.moic_millis, 2)}</Tag>
                  </td>
                  <td className="num" data-tone={exit.irr_bps === null ? undefined : signTone(exit.irr_bps)}>
                    {exit.irr_bps === null ? "–" : f.pct(exit.irr_bps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Every company the fund owns, side by side. */
export function Portfolio() {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const [mode, setMode] = useState<"cards" | "table">("cards");

  const items: Item[] = [];
  for (const row of view.companies) {
    if (!row.held) {
      continue;
    }
    const company = game.peek(row.i);
    if (company?.holding) {
      items.push({ company, holding: company.holding, financials: company.financials, gain: company.holding.value + company.holding.dividends - company.holding.cost });
    }
  }

  const cost = items.reduce((sum, item) => sum + item.holding.cost, 0);
  const worth = items.reduce((sum, item) => sum + item.holding.value + item.holding.dividends, 0);
  const gain = worth - cost;
  const blended = cost > 0 ? Math.round((worth * 1000) / cost) : null;

  return (
    <div className="portfolio stack">
      <header className="page-head">
        <div>
          <h1>{t("portfolio.title")}</h1>
          <p>{t("portfolio.subtitle")}</p>
        </div>
        {items.length > 0 ? (
          <div className="tabs pf-toggle" role="tablist" aria-label={t("portfolio.view.label")}>
            <button type="button" role="tab" aria-selected={mode === "cards"} onClick={() => setMode("cards")}>
              <Icon name="layers" size={14} /> {t("portfolio.view.cards")}
            </button>
            <button type="button" role="tab" aria-selected={mode === "table"} onClick={() => setMode("table")}>
              <Icon name="table" size={14} /> {t("portfolio.view.table")}
            </button>
          </div>
        ) : null}
      </header>

      <section className="card pf-summary">
        <Stat label={t("portfolio.stat.holdings")} value={t("portfolio.stat.count", { count: items.length })} />
        <Stat label={t("portfolio.stat.invested")} value={f.money(view.fund.invested)} />
        <Stat label={t("term.nav")} value={f.money(view.fund.nav)} />
        <Stat label={t("portfolio.stat.gain")} value={f.signedMoney(gain)} tone={signTone(gain)} />
        <Stat label={t("portfolio.stat.moic")} value={blended === null ? "–" : f.multiple(blended, 2)} tone={blended === null ? undefined : moicTone(blended)} />
        <Stat label={t("portfolio.stat.distributed")} value={f.money(view.fund.distributed)} tone={view.fund.distributed > 0 ? "good" : undefined} />
      </section>

      {items.length === 0 ? (
        <section className="card empty pf-empty">
          <Icon name="portfolio" size={36} />
          <strong>{t("portfolio.empty.title")}</strong>
          <p>{t("portfolio.empty.body")}</p>
          <button type="button" className="btn primary" onClick={() => game.go("map")}>
            <Icon name="map" size={16} />
            {t("portfolio.empty.action")}
          </button>
        </section>
      ) : (
        <>
          <section className="card">
            <StackBar
              title={t("portfolio.created.title")}
              total={f.signedMoney(gain)}
              parts={items.map((item, index) => ({
                label: item.company.name,
                value: item.gain,
                note: f.signedMoney(item.gain),
                color: SERIES[index % SERIES.length],
              }))}
            />
          </section>
          {mode === "cards" ? (
            <div className="pf-cards">
              {items.map((item) => (
                <HoldingCard key={item.company.i} item={item} active={game.selected === item.company.i} onOpen={() => game.select(item.company.i)} />
              ))}
            </div>
          ) : (
            <HoldingsTable items={items} selected={game.selected} onOpen={game.select} />
          )}
        </>
      )}

      <RealizedTable f={f} t={t} />
    </div>
  );
}
