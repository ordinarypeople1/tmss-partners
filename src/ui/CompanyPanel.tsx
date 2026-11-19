import { useEffect, useState } from "react";
import { useT, type Translate } from "../i18n/useT";
import type { CompanyView, Financials, Owner, Stage, View } from "../sim/types";
import {
  LineChart,
  Meter,
  Radar,
  Rating,
  Ring,
  Sparkline,
  Stat,
  Tag,
  SERIES,
} from "./charts";
import { DealRoom, dealNeedsAction } from "./DealRoom";
import { useFormat, type Format } from "./format";
import { useGame, type Game } from "./game";
import { HoldingTab } from "./HoldingTab";
import { Icon } from "./icons";
import { bidderName } from "./messages";
import "./CompanyPanel.css";

type TabId = "overview" | "financials" | "deal" | "operations";
type Tone = "good" | "bad" | "warn";

/** Thresholds the sim uses for the owner relationship. Shown as marks; the sim enforces them. */
const HEARS_EARLY = 40;
const CAN_PROPOSE = 60;
/** The longest a sale stage runs, for the countdown ring. */
const STAGE_MONTHS = 6;
const STAGES: Stage[] = ["preparing", "marketing", "bidding"];

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

function ownerText(t: Translate, view: View, owner: Owner): string {
  if (owner.kind === "founder") {
    return t("owner.founderAge", { age: owner.age });
  }
  if (owner.kind === "sponsor") {
    return t("owner.sponsorHeld", {
      house: view.rivals[owner.house] ?? t("owner.sponsor"),
      months: owner.months_held,
    });
  }
  return t(`owner.${owner.kind}`);
}

function Cost({ points }: { points: number }) {
  return (
    <span className="cost" aria-hidden>
      {Array.from({ length: points }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

function leverageTone(millis: number): Tone {
  return millis > 5500 ? "bad" : millis > 4000 ? "warn" : "good";
}
function coverTone(millis: number): Tone {
  return millis < 1500 ? "bad" : millis < 2500 ? "warn" : "good";
}

/** The right-hand dossier for the selected company. */
export function CompanyPanel() {
  const game = useGame();
  if (!game.company) {
    return null;
  }
  return <Dossier key={game.company.i} game={game} company={game.company} />;
}

function Dossier({ game, company }: { game: Game; company: CompanyView }) {
  const t = useT();
  const f = useFormat();
  const { view } = game;
  const hasDeal = Boolean(company.deal);
  const hasHolding = Boolean(company.holding);
  const [tab, setTab] = useState<TabId>(
    hasHolding ? "operations" : hasDeal ? "deal" : "overview",
  );

  // A deal file or a closing changes what the player came here to do.
  useEffect(() => {
    if (hasHolding) {
      setTab("operations");
    } else if (hasDeal) {
      setTab("deal");
    }
  }, [hasDeal, hasHolding]);

  const tabs: { key: TabId; dot?: boolean }[] = [
    { key: "overview" },
    { key: "financials" },
  ];
  if (company.deal) {
    tabs.push({ key: "deal", dot: dealNeedsAction(company) });
  }
  if (company.holding) {
    tabs.push({ key: "operations" });
  }
  const current = tabs.some((item) => item.key === tab) ? tab : "overview";
  const sale = company.sale;

  return (
    <div className="cp">
      <header className="cp-head">
        <div className="cp-title">
          <span className="cp-sector" data-sector={company.sector}>
            <Icon name={company.sector} size={22} />
          </span>
          <div className="cp-name">
            <h2>{company.name}</h2>
            <span className="muted">{company.site_name}</span>
          </div>
          <button
            type="button"
            className="cp-icon-btn"
            aria-pressed={company.watched}
            aria-label={t(
              company.watched ? "company.unwatch" : "company.watch",
            )}
            title={t(company.watched ? "company.unwatch" : "company.watch")}
            onClick={() =>
              game.act({
                type: "watch",
                company: company.i,
                on: !company.watched,
              })
            }
          >
            <Icon name="eye" />
          </button>
          <button
            type="button"
            className="cp-icon-btn"
            aria-label={t("action.close")}
            title={t("action.close")}
            onClick={() => game.select(null)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="cp-tags">
          <Tag>{t(`sector.${company.sector}`)}</Tag>
          <Tag>{t(`admin1.${company.admin1}`)}</Tag>
          <Tag tone={company.owner.kind === "player" ? "good" : undefined}>
            {ownerText(t, view, company.owner)}
          </Tag>
          {sale ? (
            <Tag
              tone="accent"
              icon={
                <Ring
                  fraction={sale.months_left / STAGE_MONTHS}
                  size={16}
                  tone={sale.months_left <= 1 ? "bad" : "accent"}
                />
              }
            >
              {t("company.saleTag", {
                stage: t(`stage.${sale.stage}`),
                months: sale.months_left,
              })}
            </Tag>
          ) : null}
          {company.in_deal ? (
            <Tag tone="accent">{t("company.inDeal")}</Tag>
          ) : null}
          {company.held ? <Tag tone="good">{t("company.held")}</Tag> : null}
          {company.exiting ? (
            <Tag tone="warn">{t("company.exiting")}</Tag>
          ) : null}
          {company.alert ? (
            <Tag tone="bad" icon={<Icon name="alert" size={12} />}>
              {t("company.alert")}
            </Tag>
          ) : null}
        </div>
        <div className="tabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={current === item.key}
              onClick={() => setTab(item.key)}
            >
              {t(`company.tab.${item.key}`)}
              {item.dot ? <i className="dot" /> : null}
            </button>
          ))}
        </div>
      </header>
      <div className="cp-body" role="tabpanel">
        {current === "overview" ? (
          <Overview game={game} company={company} />
        ) : null}
        {current === "financials" ? (
          <FinancialsTab company={company} t={t} f={f} view={view} />
        ) : null}
        {current === "deal" && company.deal ? (
          <DealRoom company={company} />
        ) : null}
        {current === "operations" && company.holding ? (
          <HoldingTab company={company} />
        ) : null}
      </div>
    </div>
  );
}

function qualityAxes(t: Translate, company: CompanyView, fin: Financials) {
  const axes = [
    { label: t("company.axis.margin"), value: clamp01(fin.margin_bps / 3000) },
    // Structural monthly growth, drawn on a -0.2% to +1.0% a month scale.
    {
      label: t("company.axis.growth"),
      value: clamp01((fin.growth_bps + 20) / 120),
    },
    {
      label: t("company.axis.balance"),
      value: clamp01(1 - fin.leverage_millis / 6000),
    },
    {
      label: t("company.axis.cover"),
      value: clamp01(fin.cover_millis / 10000),
    },
    // 10M to 1B of revenue on a log scale.
    {
      label: t("company.axis.size"),
      value: clamp01((Math.log10(Math.max(fin.ttm_revenue, 1)) - 4) / 2),
    },
  ];
  if (company.management !== null) {
    axes.push({
      label: t("company.axis.management"),
      value: clamp01(company.management / 20),
    });
  }
  return axes;
}

function Overview({ game, company }: { game: Game; company: CompanyView }) {
  const t = useT();
  const f = useFormat();
  const { view } = game;
  const fin = company.financials;
  const sale = company.sale;
  const fogged = !company.revealed;
  const relationship = company.relationship;
  const canAct =
    !company.held &&
    company.owner.kind !== "merged" &&
    company.owner.kind !== "lender";
  const canNda = canAct && Boolean(sale) && !company.in_deal;
  const canExclusive = canAct && sale?.stage === "preparing";
  const found = company.issues.filter(
    (issue) => issue.found || issue.triggered,
  );

  return (
    <div className="stack">
      <section className="card">
        <h3>
          {t("term.ttm")}
          {fogged ? <Tag tone="warn">{t("company.range")}</Tag> : null}
        </h3>
        <div className="cp-figures">
          <Stat label={t("term.revenue")} value={f.figure(company.revenue)}>
            {fin ? (
              <Sparkline
                values={fin.revenue_history}
                width={110}
                color={SERIES[0]}
                fill
              />
            ) : null}
          </Stat>
          <Stat label={t("term.ebitda")} value={f.figure(company.ebitda)}>
            {fin ? (
              <Sparkline
                values={fin.ebitda_history}
                width={110}
                color={SERIES[1]}
                fill
                zero
              />
            ) : null}
          </Stat>
          <Stat
            label={t("term.ev")}
            value={f.figure(company.ev)}
            hint={fin ? f.multiple(fin.multiple_millis) : undefined}
          />
        </div>
        {fogged ? (
          <p className="cp-hint">
            <Icon name="search" size={14} />
            {t("company.rangeHint")}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h3>{t("company.profile")}</h3>
        <dl className="kv">
          <dt>{t("term.founded")}</dt>
          <dd>{t("company.foundedYear", { year: company.founded })}</dd>
          <dt>{t("term.employees")}</dt>
          <dd>{t("company.headcount", { count: company.employees })}</dd>
          <dt>{t("company.site")}</dt>
          <dd>{company.site_name}</dd>
          <dt>{t("term.owner")}</dt>
          <dd>{ownerText(t, view, company.owner)}</dd>
        </dl>
        <div className="cp-meters">
          <Meter
            label={t("company.union")}
            text={f.pct(company.union_strength_bps, 0)}
            value={company.union_strength_bps}
            max={10000}
            tone={
              company.union_strength_bps >= 6000
                ? "bad"
                : company.union_strength_bps >= 3000
                  ? "warn"
                  : "good"
            }
          />
          {company.held ? null : (
            <div className="cp-rel">
              <div className="meter-head">
                <span>{t("term.relationship")}</span>
                <b>{f.integer(relationship)}</b>
              </div>
              <div
                className="meter-track"
                data-level={
                  relationship >= CAN_PROPOSE
                    ? "high"
                    : relationship >= HEARS_EARLY
                      ? "mid"
                      : "low"
                }
              >
                <span
                  style={{ width: `${clamp01(relationship / 100) * 100}%` }}
                />
                <i style={{ left: `${HEARS_EARLY}%` }} />
                <i style={{ left: `${CAN_PROPOSE}%` }} />
              </div>
              <ul className="cp-rel-marks">
                <li data-on={relationship >= HEARS_EARLY}>
                  <b>{HEARS_EARLY}</b>
                  {t("company.rel.early")}
                </li>
                <li data-on={relationship >= CAN_PROPOSE}>
                  <b>{CAN_PROPOSE}</b>
                  {t("company.rel.exclusive")}
                </li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {fin ? (
        <section className="card">
          <h3>{t("company.quality")}</h3>
          <div className="cp-quality">
            <Radar axes={qualityAxes(t, company, fin)} size={190} />
            <div className="cp-quality-side">
              <Rating
                label={t("company.management")}
                value={company.management}
              />
              {company.management === null ? (
                <small className="muted">
                  {t("company.managementUnknown")}
                </small>
              ) : null}
              {company.customer_concentration_bps === null ? (
                <div className="cp-unknown">
                  <span className="muted">{t("company.concentration")}</span>
                  <Tag tone="muted">{t("term.unknown")}</Tag>
                  <small className="muted">
                    {t("company.concentrationUnknown")}
                  </small>
                </div>
              ) : (
                <Meter
                  label={t("company.concentration")}
                  text={f.pct(company.customer_concentration_bps, 0)}
                  value={company.customer_concentration_bps}
                  max={10000}
                  tone={
                    company.customer_concentration_bps >= 4000
                      ? "bad"
                      : company.customer_concentration_bps >= 2500
                        ? "warn"
                        : "good"
                  }
                />
              )}
              <dl className="kv cp-mini">
                <dt>{t("term.margin")}</dt>
                <dd>{f.pct(fin.margin_bps)}</dd>
                <dt>{t("term.leverage")}</dt>
                <dd data-tone={leverageTone(fin.leverage_millis)}>
                  {f.multiple(fin.leverage_millis)}
                </dd>
                <dt>{t("term.cover")}</dt>
                <dd data-tone={coverTone(fin.cover_millis)}>
                  {f.multiple(fin.cover_millis)}
                </dd>
              </dl>
            </div>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h3>{t("company.issues")}</h3>
        {found.length ? (
          <div className="cp-tags">
            {found.map((issue) => (
              <Tag
                key={issue.kind}
                tone={issue.triggered ? "bad" : "warn"}
                icon={<Icon name="alert" size={12} />}
              >
                {t(`issue.${issue.kind}`)}
                <small>
                  {t(
                    issue.triggered
                      ? "company.issue.triggered"
                      : "company.issue.found",
                  )}
                </small>
              </Tag>
            ))}
          </div>
        ) : (
          <span className="muted">
            {t(
              company.revealed ? "company.issuesNone" : "company.issuesHidden",
            )}
          </span>
        )}
      </section>

      {sale ? (
        <section className="card">
          <h3>
            <Icon name="gavel" size={14} />
            {t("company.sale")}
            <Tag>{t(`reason.${sale.reason}`)}</Tag>
            {sale.bid_in ? <Tag tone="good">{t("company.bidIn")}</Tag> : null}
          </h3>
          <div className="cp-sale">
            <Ring
              fraction={sale.months_left / STAGE_MONTHS}
              size={52}
              tone={sale.months_left <= 1 ? "bad" : "accent"}
            >
              {sale.months_left}
            </Ring>
            <div className="cp-sale-main">
              {sale.stage === "exclusive" ? (
                <Tag tone="good" icon={<Icon name="handshake" size={12} />}>
                  {t("stage.exclusive")}
                </Tag>
              ) : (
                <ol className="cp-steps">
                  {STAGES.map((stage, index) => (
                    <li
                      key={stage}
                      data-state={
                        stage === sale.stage
                          ? "now"
                          : index < STAGES.indexOf(sale.stage)
                            ? "done"
                            : "next"
                      }
                      aria-current={stage === sale.stage ? "step" : undefined}
                    >
                      <i />
                      {t(`stage.${stage}`)}
                    </li>
                  ))}
                </ol>
              )}
              <span className="muted">
                {t("company.stageLeft", { months: sale.months_left })}
              </span>
            </div>
          </div>
          <div className="cp-rivals">
            <span className="muted">{t("company.rivals")}</span>
            {sale.rivals.length ? (
              sale.rivals.map((rival, index) => (
                <span key={index} className="chip">
                  <Icon
                    name={rival.kind === "strategic" ? "layers" : "fund"}
                    size={13}
                  />
                  {bidderName(t, view, rival)}
                </span>
              ))
            ) : (
              <Tag tone="muted">
                {t(
                  sale.stage === "exclusive"
                    ? "term.none"
                    : "company.rivalsUnknown",
                )}
              </Tag>
            )}
          </div>
        </section>
      ) : null}

      {canAct ? (
        <section className="card">
          <h3>
            {t("company.actions")}
            <span className="cp-attention muted">
              {t("company.attentionLeft", {
                left: view.attention.left,
                max: view.attention.max,
              })}
            </span>
          </h3>
          <div className="cp-actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                game.act({ type: "meet_owner", company: company.i })
              }
            >
              <Icon name="handshake" size={16} />
              {t("company.act.meet")}
              <Cost points={1} />
            </button>
            {canNda ? (
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  game.act({ type: "sign_nda", company: company.i })
                }
              >
                <Icon name="search" size={16} />
                {t("company.act.nda")}
              </button>
            ) : null}
            {canExclusive ? (
              <button
                type="button"
                className="btn"
                disabled={relationship < CAN_PROPOSE}
                onClick={() =>
                  game.act({ type: "propose_exclusive", company: company.i })
                }
              >
                <Icon name="flag" size={16} />
                {t("company.act.exclusive")}
                <Cost points={1} />
              </button>
            ) : null}
          </div>
          {canExclusive && relationship < CAN_PROPOSE ? (
            <p className="cp-hint">
              {t("company.act.exclusiveNeeds", { need: CAN_PROPOSE })}
            </p>
          ) : null}
          {!sale ? <p className="cp-hint">{t("company.noSale")}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

interface Line {
  key: string;
  value: number;
  /** A subtotal or total row. */
  total?: boolean;
  /** Shown as a deduction. */
  minus?: boolean;
}

function Statement({
  title,
  lines,
  t,
  f,
}: {
  title: string;
  lines: Line[];
  t: Translate;
  f: Format;
}) {
  return (
    <table className="table cp-statement">
      <thead>
        <tr>
          <th scope="col">{title}</th>
          <th scope="col" className="num">
            {t("company.fin.lastMonth")}
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const value = line.minus ? -line.value : line.value;
          return (
            <tr key={line.key} data-total={line.total || undefined}>
              <th scope="row">{t(`company.fin.${line.key}`)}</th>
              <td className="num" data-negative={value < 0 || undefined}>
                {f.money(value)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FinancialsTab({
  company,
  t,
  f,
  view,
}: {
  company: CompanyView;
  t: Translate;
  f: Format;
  view: View;
}) {
  const fin = company.financials;
  if (!fin) {
    return (
      <div className="card empty cp-empty">
        <Icon name="table" size={28} />
        <strong>{t("company.fin.locked")}</strong>
        <span>{t("company.fin.lockedHint")}</span>
      </div>
    );
  }
  const { last, books } = fin;
  const income: Line[] = [
    { key: "revenue", value: last.revenue },
    { key: "cogs", value: last.cogs, minus: true },
    { key: "grossProfit", value: last.revenue - last.cogs, total: true },
    { key: "sga", value: last.sga, minus: true },
    { key: "ebitda", value: last.ebitda, total: true },
    { key: "da", value: last.da, minus: true },
    { key: "interest", value: last.interest, minus: true },
    { key: "tax", value: last.tax, minus: true },
    { key: "netIncome", value: last.net_income, total: true },
  ];
  const cash: Line[] = [
    { key: "openingCash", value: last.opening_cash },
    { key: "netIncome", value: last.net_income },
    { key: "da", value: last.da },
    { key: "nwc", value: last.change_in_nwc, minus: true },
    { key: "capex", value: last.capex, minus: true },
    { key: "debtDraw", value: last.debt_draw },
    { key: "debtRepayment", value: last.debt_repayment, minus: true },
    { key: "dividends", value: last.dividends, minus: true },
    { key: "closingCash", value: last.closing_cash, total: true },
  ];
  const balance: Line[] = [
    { key: "cash", value: books.cash },
    { key: "receivable", value: books.accounts_receivable },
    { key: "inventory", value: books.inventory },
    { key: "netPpe", value: fin.net_ppe },
    { key: "goodwill", value: books.goodwill },
    { key: "totalAssets", value: fin.total_assets, total: true },
    { key: "payable", value: books.accounts_payable },
    { key: "debt", value: books.debt },
    { key: "shareCapital", value: books.share_capital },
    { key: "retained", value: books.retained_earnings },
    { key: "totalEquity", value: fin.total_equity, total: true },
  ];
  const months = fin.revenue_history.length;
  return (
    <div className="stack">
      <section className="card">
        <h3>{t("term.ttm")}</h3>
        <div className="cp-figures">
          <Stat label={t("term.revenue")} value={f.money(fin.ttm_revenue)} />
          <Stat
            label={t("term.ebitda")}
            value={f.money(fin.ttm_ebitda)}
            tone={fin.ttm_ebitda < 0 ? "bad" : undefined}
          />
          <Stat
            label={t("term.margin")}
            value={f.pct(fin.margin_bps)}
            hint={`${t("term.grossMargin")} ${f.pct(fin.gross_margin_bps)}`}
          />
          <Stat
            label={t("term.fcf")}
            value={f.money(fin.ttm_fcf)}
            tone={fin.ttm_fcf < 0 ? "bad" : "good"}
          />
        </div>
      </section>

      <section className="card">
        <h3>{t("company.fin.history")}</h3>
        <div className="cp-charts">
          <LineChart
            height={110}
            format={f.money}
            series={[{ label: t("term.revenue"), values: fin.revenue_history }]}
            xLabels={[
              t("company.fin.monthsAgo", { months }),
              f.shortDate(view.date),
            ]}
          />
          <LineChart
            height={120}
            format={f.money}
            series={[
              {
                label: t("term.ebitda"),
                values: fin.ebitda_history,
                color: SERIES[1],
              },
              {
                label: t("term.fcf"),
                values: fin.fcf_history,
                color: SERIES[2],
              },
            ]}
            xLabels={[
              t("company.fin.monthsAgo", { months }),
              f.shortDate(view.date),
            ]}
          />
        </div>
      </section>

      <section className="card">
        <h3>{t("company.fin.debtAndValue")}</h3>
        <div className="cp-figures">
          <Stat
            label={t("term.netDebt")}
            value={f.money(fin.net_debt)}
            hint={f.pct(fin.interest_rate_bps, 2)}
          />
          <Stat
            label={t("term.leverage")}
            value={f.multiple(fin.leverage_millis)}
            tone={leverageTone(fin.leverage_millis)}
          />
          <Stat
            label={t("term.cover")}
            value={f.multiple(fin.cover_millis)}
            tone={coverTone(fin.cover_millis)}
          />
          <Stat
            label={t("company.fin.modelMultiple")}
            value={f.multiple(fin.multiple_millis)}
            hint={t("company.fin.sectorMultiple", {
              multiple: f.multiple(company.sector_multiple_millis),
            })}
          />
          <Stat label={t("term.ev")} value={f.money(fin.model_ev)} />
          <Stat label={t("term.equity")} value={f.money(fin.model_equity)} />
        </div>
        <p className="cp-hint">{t("term.modelNotPrice")}</p>
      </section>

      <section className="card cp-statements">
        <Statement title={t("company.fin.income")} lines={income} t={t} f={f} />
        <Statement title={t("company.fin.cashFlow")} lines={cash} t={t} f={f} />
        <Statement
          title={t("company.fin.balance")}
          lines={balance}
          t={t}
          f={f}
        />
      </section>
    </div>
  );
}
