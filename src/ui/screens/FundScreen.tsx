import { useMemo, useState } from "react";
import { useT } from "../../i18n/useT";
import type { CompanyView, HoldingView } from "../../sim/types";
import { LineChart, Meter, Stat, StackBar, Tag } from "../charts";
import { monthsBetween, useFormat } from "../format";
import { useGame } from "../game";
import { Icon } from "../icons";
import "./FundScreen.css";

type Held = CompanyView & { holding: HoldingView };

/**
 * What an investor commits to a successor fund, by satisfaction. Display of
 * the thresholds behind `view.next_fund_estimate`: see `next_fund_size` in crates/sim-core/src/story.rs.
 */
const REUP: { from: number; pct: number; tone: "good" | "accent" | "warn" | "bad" }[] = [
  { from: 70, pct: 150, tone: "good" },
  { from: 55, pct: 110, tone: "accent" },
  { from: 40, pct: 70, tone: "warn" },
  { from: 0, pct: 0, tone: "bad" },
];
/** A first fund under the player's own name raises this share of the estimate (same file). */
const OWN_HOUSE_PCT = 60;
const COMMIT_PICKS = [10, 25, 50];
/** Slider step for the personal commitment, thousand USD. */
const COMMIT_STEP = 10;

/** Total marked equity and cost of today's holdings at each quarter a mark was taken. */
function markSeries(holdings: Held[], month: number) {
  const months = [...new Set(holdings.flatMap((item) => item.holding.marks.map((mark) => mark.month)))].sort(
    (a, b) => a - b,
  );
  const points = months.map((at) => {
    let equity = 0;
    let cost = 0;
    for (const item of holdings) {
      const marks = item.holding.marks.filter((mark) => mark.month <= at);
      if (marks.length) {
        equity += marks[marks.length - 1].equity;
        cost += item.holding.cost;
      }
    }
    return { month: at, equity, cost };
  });
  if (holdings.length && (points.length === 0 || points[points.length - 1].month < month)) {
    points.push({
      month,
      equity: holdings.reduce((sum, item) => sum + item.holding.value, 0),
      cost: holdings.reduce((sum, item) => sum + item.holding.cost, 0),
    });
  }
  return points;
}

export function FundScreen() {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const { fund, career } = view;

  const holdings = useMemo(
    () =>
      view.companies
        .filter((row) => row.held)
        .map((row) => game.peek(row.i))
        .filter((item): item is Held => item !== null && item.holding !== undefined),
    // peek reads the same state the view was drawn from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view],
  );
  const cost = holdings.reduce((sum, item) => sum + item.holding.cost, 0);
  const largest = holdings.reduce((most, item) => Math.max(most, item.holding.cost), 0);
  const points = useMemo(() => markSeries(holdings, view.month), [holdings, view.month]);

  const termMonths = Math.max(monthsBetween(fund.started, fund.term_ends), 1);
  const investMonths = monthsBetween(fund.started, fund.investment_period_ends);
  const elapsed = Math.min(Math.max(monthsBetween(fund.started, view.date), 0), termMonths);
  const investLeft = Math.max(monthsBetween(view.date, fund.investment_period_ends), 0);
  const termLeft = Math.max(monthsBetween(view.date, fund.term_ends), 0);
  const share = (months: number) => `${(months / termMonths) * 100}%`;

  /** Called capital no longer in fees, costs or today's holdings: deals that have left the fund. */
  const exitedCost = Math.max(fund.called - fund.fees_paid - fund.deal_costs - fund.invested, 0);
  const totalValue = fund.distributed + fund.nav;
  const scale = Math.max(fund.called, totalValue, 1);
  const capitalBack = Math.min(totalValue, fund.called);
  const toInvestors = Math.max(totalValue - fund.called - fund.carry, 0);
  const capitalDone = fund.called > 0 && totalValue >= fund.called;
  const hurdleDone = fund.carry > 0;

  const report = useMemo(
    () =>
      view.messages
        .filter((message) => message.type === "quarter_report")
        .sort((a, b) => b.id - a.id)[0],
    [view.messages],
  );
  const bestMoic = Math.max(...fund.realized.map((deal) => deal.moic_millis), 3000);

  const [commit, setCommit] = useState(0);
  const commitAmount = Math.min(commit, career.wealth);
  const raiseScale = Math.max(fund.committed, view.next_fund_estimate, 1);
  const raiseShare = Math.round((view.next_fund_estimate / (fund.committed || 1)) * 10000);

  return (
    <div className="fundscreen stack">
      <header className="page-head">
        <div>
          <h1>{fund.name}</h1>
          <p>{t("fundscreen.lead")}</p>
        </div>
        <div className="row">
          <Tag tone={fund.investing ? "good" : "warn"} icon={<Icon name="clock" size={14} />}>
            {fund.investing ? t("fundscreen.investing") : t("fundscreen.harvesting")}
          </Tag>
          <Tag>{t("fundscreen.platforms", { count: holdings.length })}</Tag>
          {fund.pending > 0 ? <Tag tone="accent">{t("fundscreen.pending", { amount: f.money(fund.pending) })}</Tag> : null}
        </div>
      </header>

      <section className="card fund-stats">
        <Stat label={t("fundscreen.committed")} value={f.money(fund.committed)} />
        <Stat
          label={t("fundscreen.called")}
          value={f.money(fund.called)}
          hint={f.pct(Math.round((fund.called / (fund.committed || 1)) * 10000), 0)}
        />
        <Stat
          label={t("fundscreen.uncalled")}
          value={f.money(fund.uncalled)}
          tone={fund.uncalled < fund.committed / 10 ? "warn" : undefined}
          hint={t("fundscreen.dryPowder")}
        />
        <Stat label={t("fundscreen.distributed")} value={f.money(fund.distributed)} tone={fund.distributed > 0 ? "good" : undefined} />
        <Stat label={t("term.nav")} value={f.money(fund.nav)} hint={t("fundscreen.navHint")} />
        <Stat label={t("term.dpi")} value={f.multiple(fund.dpi_millis, 2)} tone={fund.dpi_millis >= 1000 ? "good" : undefined} />
        <Stat
          label={t("term.tvpi")}
          value={f.multiple(fund.tvpi_millis, 2)}
          tone={fund.called === 0 ? undefined : fund.tvpi_millis >= 1000 ? "good" : "warn"}
        />
        <Stat
          label={t("fundscreen.netIrr")}
          value={fund.irr_bps === null ? t("term.none") : f.pct(fund.irr_bps)}
          tone={fund.irr_bps === null ? undefined : fund.irr_bps >= 800 ? "good" : fund.irr_bps >= 0 ? "warn" : "bad"}
        />
      </section>

      <section className="grid cols-2">
        <div className="card stack">
          <h2 className="card-title">
            <Icon name="layers" size={16} />
            {t("fundscreen.capital")}
          </h2>
          <StackBar
            title={t("fundscreen.capitalTitle")}
            total={f.money(fund.committed)}
            parts={[
              { label: t("fundscreen.fees"), value: fund.fees_paid, note: f.money(fund.fees_paid), color: "var(--s5)" },
              { label: t("fundscreen.dealCosts"), value: fund.deal_costs, note: f.money(fund.deal_costs), color: "var(--s3)" },
              { label: t("fundscreen.invested"), value: fund.invested, note: f.money(fund.invested), color: "var(--s1)" },
              { label: t("fundscreen.exitedCost"), value: exitedCost, note: f.money(exitedCost), color: "var(--s6)" },
              { label: t("fundscreen.uncalled"), value: fund.uncalled, note: f.money(fund.uncalled), color: "var(--line)" },
            ]}
          />
          <Meter
            label={t("fundscreen.concentration")}
            text={t("fundscreen.concentrationText", {
              largest: f.money(largest),
              limit: f.money(fund.concentration_limit),
            })}
            value={largest}
            max={fund.concentration_limit}
            tone={largest > fund.concentration_limit * 0.9 ? "warn" : "ink"}
          />
          <p className="muted">{t("fundscreen.concentrationNote")}</p>
        </div>

        <div className="card stack">
          <div className="row between">
            <h2 className="card-title">
              <Icon name="clock" size={16} />
              {t("fundscreen.clock")}
            </h2>
            <div className="row">
              <Tag tone={fund.investing ? "good" : "muted"}>
                {t("fundscreen.investLeft", { months: investLeft })}
              </Tag>
              <Tag tone={termLeft <= 24 ? "warn" : "muted"}>{t("fundscreen.termLeft", { months: termLeft })}</Tag>
            </div>
          </div>
          <div className="fund-clock" role="img" aria-label={t("fundscreen.clock")}>
            <div className="clock-track">
              <span className="clock-invest" style={{ width: share(investMonths) }} />
              <span className="clock-elapsed" style={{ width: share(elapsed) }} />
              {Array.from({ length: Math.floor(termMonths / 12) - 1 }, (_, index) => (
                <i key={index} className="clock-tick" style={{ left: share((index + 1) * 12) }} />
              ))}
              <i className="clock-now" style={{ left: share(elapsed) }} />
            </div>
            <div className="clock-today" style={{ paddingLeft: `min(${share(elapsed)}, calc(100% - 110px))` }}>
              <b>{t("fundscreen.today", { date: f.shortDate(view.date) })}</b>
            </div>
            <div className="clock-labels">
              <span>
                <small>{t("fundscreen.started")}</small>
                <b>{f.shortDate(fund.started)}</b>
              </span>
              <span>
                <small>{t("fundscreen.investEnds")}</small>
                <b>{f.shortDate(fund.investment_period_ends)}</b>
              </span>
              <span>
                <small>{t("fundscreen.termEnds")}</small>
                <b>{f.shortDate(fund.term_ends)}</b>
              </span>
            </div>
          </div>
          <ul className="clock-legend">
            <li>
              <i data-kind="invest" />
              {t("fundscreen.investPeriod")}
            </li>
            <li>
              <i data-kind="harvest" />
              {t("fundscreen.harvestPeriod")}
            </li>
          </ul>
        </div>
      </section>

      <section className="grid fund-investors">
        <div className="card stack">
          <div className="row between">
            <h2 className="card-title">
              <Icon name="handshake" size={16} />
              {t("fundscreen.lps")}
            </h2>
            <ul className="reup-legend">
              {REUP.map((step) => (
                <li key={step.from} data-tone={step.tone}>
                  <i />
                  {step.pct > 0
                    ? t("fundscreen.reup.rule", { from: step.from, pct: step.pct })
                    : t("fundscreen.reup.ruleNone", { below: REUP[REUP.length - 2].from })}
                </li>
              ))}
            </ul>
          </div>
          <ul className="lp-list">
            {view.lps.map((lp) => {
              const step = REUP.find((item) => lp.satisfaction >= item.from) ?? REUP[REUP.length - 1];
              return (
                <li key={lp.kind}>
                  <div className="lp-who">
                    <strong>{t(`lp.${lp.kind}`)}</strong>
                    <small>{t(`lp.${lp.kind}.cares`)}</small>
                  </div>
                  <div className="lp-share">
                    <b>{f.pct(lp.share_bps, 0)}</b>
                    <small>{f.money(Math.round((fund.committed * lp.share_bps) / 10000))}</small>
                  </div>
                  <div className="chart meter lp-mood" data-tone={step.tone}>
                    <div className="meter-head">
                      <span>{t("fundscreen.satisfaction")}</span>
                      <b>{f.integer(lp.satisfaction)}</b>
                    </div>
                    <div className="meter-track">
                      <span style={{ width: `${Math.min(Math.max(lp.satisfaction, 0), 100)}%` }} />
                      {REUP.slice(0, -1).map((item) => (
                        <i key={item.from} style={{ left: `${item.from}%` }} />
                      ))}
                    </div>
                  </div>
                  <Tag tone={step.tone}>
                    {step.pct > 0 ? t("fundscreen.reup", { pct: step.pct }) : t("fundscreen.reup.none")}
                  </Tag>
                </li>
              );
            })}
          </ul>
          <div className="stack next-fund">
            <Meter
              label={t("fundscreen.thisFund")}
              text={f.money(fund.committed)}
              value={fund.committed}
              max={raiseScale}
              tone="ink"
            />
            <Meter
              label={t("fundscreen.nextFund")}
              text={`${f.money(view.next_fund_estimate)} · ${f.pct(raiseShare, 0)}`}
              value={view.next_fund_estimate}
              max={raiseScale}
              marker={fund.committed}
              tone={view.next_fund_estimate >= fund.committed ? "good" : "warn"}
            />
          </div>
          <p className="muted">{t("fundscreen.nextFundNote", { pct: OWN_HOUSE_PCT })}</p>
        </div>

        <div className="card stack">
          <div className="row between">
            <h2 className="card-title">
              <Icon name="fund" size={16} />
              {t("fundscreen.gp")}
            </h2>
            <Tag tone={fund.investing ? "good" : "muted"}>
              {fund.investing ? t("fundscreen.gp.open") : t("fundscreen.gp.closed")}
            </Tag>
          </div>
          <div className="grid cols-2">
            <Stat
              label={t("fundscreen.gp.committed")}
              value={f.money(career.gp_commit)}
              tone={career.gp_commit > 0 ? "good" : undefined}
              hint={t("fundscreen.gp.atMultiple", { tvpi: f.multiple(fund.tvpi_millis, 2) })}
            />
            <Stat label={t("fundscreen.gp.wealth")} value={f.money(career.wealth)} />
          </div>
          <div className="slider">
            <label htmlFor="gp-commit">{t("fundscreen.gp.amount")}</label>
            <output htmlFor="gp-commit">{f.money(commitAmount)}</output>
            <input
              id="gp-commit"
              type="range"
              min={0}
              max={Math.max(career.wealth, 0)}
              step={COMMIT_STEP}
              value={commitAmount}
              disabled={!fund.investing || career.wealth <= 0}
              onChange={(event) => setCommit(Number(event.target.value))}
            />
          </div>
          <div className="row gp-picks">
            {COMMIT_PICKS.map((pct) => (
              <button
                key={pct}
                type="button"
                className="btn small"
                disabled={!fund.investing || career.wealth <= 0}
                onClick={() => setCommit(Math.floor((career.wealth * pct) / 100))}
              >
                {`${pct}%`}
              </button>
            ))}
            <button
              type="button"
              className="btn primary"
              disabled={!fund.investing || commitAmount <= 0}
              onClick={() => {
                if (game.act({ type: "commit_personal", amount: commitAmount })) {
                  setCommit(0);
                }
              }}
            >
              {t("fundscreen.gp.commit")}
            </button>
          </div>
          <p className="muted">{t("fundscreen.gp.note")}</p>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="card stack">
          <h2 className="card-title">
            <Icon name="market" size={16} />
            {t("fundscreen.jcurve")}
          </h2>
          <div className="stack flow-bars">
            <Meter label={t("fundscreen.called")} text={f.money(fund.called)} value={fund.called} max={scale} tone="ink" />
            <Meter
              label={t("fundscreen.distributed")}
              text={f.money(fund.distributed)}
              value={fund.distributed}
              max={scale}
              tone="good"
            />
            <Meter label={t("term.nav")} text={f.money(fund.nav)} value={fund.nav} max={scale} tone="accent" />
            <Meter
              label={t("fundscreen.totalValue")}
              text={f.money(totalValue)}
              value={totalValue}
              max={scale}
              marker={fund.called}
              tone={totalValue >= fund.called ? "good" : "warn"}
            />
          </div>
          {points.length > 1 ? (
            <LineChart
              height={150}
              format={(value) => f.money(Math.round(value))}
              xLabels={[
                t("fundscreen.monthIndex", { month: points[0].month }),
                t("fundscreen.monthIndex", { month: points[points.length - 1].month }),
              ]}
              series={[
                { label: t("fundscreen.markedEquity"), values: points.map((point) => point.equity), color: "var(--accent)" },
                { label: t("fundscreen.costBasis"), values: points.map((point) => point.cost), color: "var(--ink)" },
              ]}
            />
          ) : (
            <p className="empty">{t("fundscreen.noMarks")}</p>
          )}
          <p className="muted">{t("fundscreen.marksNote")}</p>
        </div>

        <div className="card stack">
          <h2 className="card-title">
            <Icon name="fund" size={16} />
            {t("fundscreen.waterfall")}
          </h2>
          <StackBar
            title={t("fundscreen.totalValue")}
            total={f.money(totalValue)}
            parts={[
              { label: t("fundscreen.capitalBack"), value: capitalBack, note: f.money(capitalBack), color: "var(--ink)" },
              { label: t("fundscreen.toInvestors"), value: toInvestors, note: f.money(toInvestors), color: "var(--s1)" },
              { label: t("fundscreen.carry"), value: fund.carry, note: f.money(fund.carry), color: "var(--accent)" },
            ]}
          />
          <ol className="waterfall">
            <li data-done={capitalDone}>
              <span className="step-mark">{capitalDone ? <Icon name="check" size={14} /> : 1}</span>
              <strong>{t("fundscreen.step.capital")}</strong>
              <b>{f.money(fund.called)}</b>
              <small>{t("fundscreen.step.capitalNote", { value: f.money(totalValue) })}</small>
            </li>
            <li data-done={hurdleDone}>
              <span className="step-mark">{hurdleDone ? <Icon name="check" size={14} /> : 2}</span>
              <strong>{t("fundscreen.step.hurdle")}</strong>
              <b>{t("fundscreen.step.hurdleRate")}</b>
              <small>{t(hurdleDone ? "fundscreen.step.hurdleMet" : "fundscreen.step.hurdleOpen")}</small>
            </li>
            <li data-done={hurdleDone}>
              <span className="step-mark">{hurdleDone ? <Icon name="check" size={14} /> : 3}</span>
              <strong>{t("fundscreen.step.carry")}</strong>
              <b>{f.money(fund.carry)}</b>
              <small>{t("fundscreen.step.carryNote")}</small>
            </li>
          </ol>
          <div className="grid cols-3 carry-mine">
            <Stat label={t("fundscreen.myShare")} value={f.pct(career.carry_share_bps, 0)} hint={t(`rank.${career.rank}`)} />
            <Stat
              label={t("fundscreen.myAccrued")}
              value={f.money(career.carry_accrued)}
              tone={career.carry_accrued > 0 ? "good" : undefined}
              hint={t("fundscreen.atMarks")}
            />
            <Stat
              label={t("fundscreen.myPaid")}
              value={f.money(career.carry_paid)}
              tone={career.carry_paid > 0 ? "good" : undefined}
            />
          </div>
          <p className="muted">{t("fundscreen.waterfallNote")}</p>
        </div>
      </section>

      <section className="grid fund-bottom">
        <div className="card stack">
          <div className="row between">
            <h2 className="card-title">
              <Icon name="exit" size={16} />
              {t("fundscreen.realized")}
            </h2>
            {fund.pending > 0 ? <Tag tone="accent">{t("fundscreen.pending", { amount: f.money(fund.pending) })}</Tag> : null}
          </div>
          {fund.realized.length ? (
            <table className="table realized-table">
              <thead>
                <tr>
                  <th>{t("fundscreen.company")}</th>
                  <th>{t("fundscreen.held")}</th>
                  <th>{t("fundscreen.route")}</th>
                  <th className="num">{t("fundscreen.cost")}</th>
                  <th className="num">{t("fundscreen.proceeds")}</th>
                  <th>{t("term.moic")}</th>
                  <th className="num">{t("term.irr")}</th>
                </tr>
              </thead>
              <tbody>
                {fund.realized.map((deal, index) => (
                  <tr key={`${deal.company}-${index}`}>
                    <td className="name">{deal.company}</td>
                    <td>
                      {f.shortDate(deal.acquired)} → {f.shortDate(deal.exited)}
                      <span className="sub">
                        {t("format.months", { months: monthsBetween(deal.acquired, deal.exited) })}
                      </span>
                    </td>
                    <td>
                      <Tag tone={deal.route === null ? "bad" : "muted"}>
                        {deal.route === null ? t("fundscreen.route.lender") : t(`route.${deal.route}`)}
                      </Tag>
                    </td>
                    <td className="num">{f.money(deal.cost)}</td>
                    <td className="num">{f.money(deal.proceeds)}</td>
                    <td>
                      <Meter
                        value={deal.moic_millis}
                        max={bestMoic}
                        marker={1000}
                        tone={deal.moic_millis >= 2000 ? "good" : deal.moic_millis >= 1000 ? "warn" : "bad"}
                        text={f.multiple(deal.moic_millis, 2)}
                      />
                    </td>
                    <td className="num">{deal.irr_bps === null ? t("term.none") : f.pct(deal.irr_bps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">{t("fundscreen.noRealized")}</p>
          )}
          {holdings.length ? (
            <>
              <h3 className="card-title">
                <Icon name="portfolio" size={16} />
                {t("fundscreen.unrealized")}
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("fundscreen.company")}</th>
                    <th>{t("fundscreen.acquired")}</th>
                    <th className="num">{t("fundscreen.cost")}</th>
                    <th className="num">{t("fundscreen.mark")}</th>
                    <th>{t("term.moic")}</th>
                    <th className="num">{t("term.irr")}</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((item) => (
                    <tr key={item.i} aria-selected={item.i === game.selected} onClick={() => game.select(item.i)}>
                      <td className="name">
                        <button type="button" className="row-link" onClick={() => game.select(item.i)}>
                          {item.name}
                        </button>
                        <span className="sub">{t(`sector.${item.sector}`)}</span>
                      </td>
                      <td>
                        {f.shortDate(item.holding.acquired)}
                        <span className="sub">{t("format.months", { months: item.holding.months_held })}</span>
                      </td>
                      <td className="num">{f.money(item.holding.cost)}</td>
                      <td className="num">{f.money(item.holding.value)}</td>
                      <td>
                        <Meter
                          value={item.holding.moic_millis}
                          max={bestMoic}
                          marker={1000}
                          tone={
                            item.holding.moic_millis >= 2000 ? "good" : item.holding.moic_millis >= 1000 ? "warn" : "bad"
                          }
                          text={f.multiple(item.holding.moic_millis, 2)}
                        />
                      </td>
                      <td className="num">
                        {item.holding.irr_bps === null ? t("term.none") : f.pct(item.holding.irr_bps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>

        <div className="card stack lp-report">
          <h2 className="card-title">
            <Icon name="inbox" size={16} />
            {t("fundscreen.lpReport")}
          </h2>
          {report && report.type === "quarter_report" ? (
            <div className="grid cols-2">
              <Stat label={t("term.nav")} value={f.money(report.nav)} hint={f.date(report.date)} />
              <Stat
                label={t("term.tvpi")}
                value={f.multiple(report.tvpi_millis, 2)}
                tone={report.tvpi_millis >= 1000 ? "good" : "warn"}
                hint={t("fundscreen.lastQuarter")}
              />
            </div>
          ) : (
            <p className="muted">{t("fundscreen.noReport")}</p>
          )}
          <dl className="kv">
            <dt>{t("fundscreen.fact.platforms")}</dt>
            <dd>{f.integer(holdings.length)}</dd>
            <dt>{t("fundscreen.fact.deployed")}</dt>
            <dd>{f.pct(Math.round((fund.invested / (fund.committed || 1)) * 10000), 0)}</dd>
            <dt>{t("fundscreen.fact.costHeld")}</dt>
            <dd>{f.money(cost)}</dd>
            <dt>{t("fundscreen.fact.realized")}</dt>
            <dd>{f.integer(fund.realized.length)}</dd>
            <dt>{t("fundscreen.fact.investLeft")}</dt>
            <dd>{t("format.months", { months: investLeft })}</dd>
            <dt>{t("fundscreen.fact.termLeft")}</dt>
            <dd>{t("format.months", { months: termLeft })}</dd>
          </dl>
          <Meter
            label={t("fundscreen.fact.deployed")}
            text={`${f.money(fund.invested)} / ${f.money(fund.committed)}`}
            value={fund.invested}
            max={fund.committed}
            tone="ink"
          />
        </div>
      </section>
    </div>
  );
}
