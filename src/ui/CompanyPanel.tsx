import { ProcessCard } from "./Process";
import { useEffect, useState } from "react";
import { useT, type Translate } from "../i18n/useT";
import type { CompanyView, Financials, Owner, Stage, View } from "../sim/types";
import {
  Meter,
  Radar,
  Rating,
  Ring,
  Sparkline,
  Stat,
  Tag,
  SERIES,
} from "./charts";
import { Building } from "./Building";
import { DealRoom, dealNeedsAction } from "./DealRoom";
import { useFormat, type Format } from "./format";
import { useGame, type Game } from "./game";
import { HoldingTab } from "./HoldingTab";
import { Icon } from "./icons";
import { ActionBar, Journey } from "./Journey";
import { bidderName } from "./messages";
import { Portrait } from "./Portrait";
import "./CompanyPanel.css";
import { FiveYearChart, StatementTables } from "./Statements";

type TabId = "overview" | "financials" | "deal" | "operations";
type Tone = "good" | "bad" | "warn";

/** The longest a sale stage runs, for the countdown ring. */
const STAGE_MONTHS = 6;
const STAGES: Stage[] = ["preparing", "marketing", "bidding"];
const HOME = "US";

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
  /** Companies the fund could still buy show the road to a deal and the step to take. */
  const sourcing = !company.held && company.owner.kind !== "merged" && company.owner.kind !== "lender";

  return (
    <div className="cp">
      <header className="cp-head">
        <div className="cp-title">
          <span className="cp-art">
            <Building sector={company.sector} seed={company.i} size={76} />
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
          {company.country !== HOME ? (
            <Tag
              tone="accent"
              icon={<span className="cp-flag">{company.country}</span>}
            >
              {t(`country.${company.country}`)}
            </Tag>
          ) : null}
          <Tag
            tone={
              company.owner.kind === "player"
                ? "good"
                : company.owner.kind === "public"
                  ? "accent"
                  : undefined
            }
          >
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
        <p className="cp-story">
          {t("company.story", {
            year: company.founded,
            abroad: company.country !== HOME ? "yes" : "no",
            country: t(`country.${company.country}`),
            region: t(`admin1.${company.admin1}`),
            site: company.site_name,
            product: t(`product.${company.sector}.${company.product}`),
            count: company.employees,
          })}
        </p>
        {current === "overview" ? (
          <Overview game={game} company={company} />
        ) : null}
        {current === "financials" ? (
          <FinancialsTab company={company} t={t} f={f} />
        ) : null}
        {current === "deal" && company.deal ? (
          <DealRoom company={company} />
        ) : null}
        {current === "operations" && company.holding ? (
          <HoldingTab company={company} />
        ) : null}
        {current === "overview" && sourcing ? <Journey company={company} /> : null}
      </div>
      {sourcing ? <ActionBar company={company} onOpenDeal={() => setTab("deal")} /> : null}
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
  const found = company.issues.filter(
    (issue) => issue.found || issue.triggered,
  );
  const research =
    view.insight[
      view.economy.sectors.findIndex((sector) => sector.id === company.sector)
    ] ?? 0;
  const founderLeaves =
    !company.held && sale?.reason === "retirement" && company.ceo.founder;


  return (
    <div className="stack">
      <section className="card">
        <h3>
          {t("term.ttm")}
          {fogged ? <Tag tone="warn">{t("company.range")}</Tag> : null}
          {research > 0 ? (
            <Tag tone="good" icon={<Icon name="search" size={12} />}>
              {t("company.research", { months: research })}
            </Tag>
          ) : null}
        </h3>
        <div className={fogged ? "cp-figures cp-three cp-fogged" : "cp-figures cp-three"}>
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
            label={t(company.held ? "term.ev" : "valuation.label")}
            value={company.ev ? f.figure(company.ev) : t("valuation.none")}
            hint={
              company.deal?.valuation
                ? f.multiple(company.deal.valuation.multiple_millis)
                : fin?.multiple_millis != null
                  ? f.multiple(fin.multiple_millis)
                  : undefined
            }
          />
        </div>
        {fogged ? (
          <p className="cp-hint">
            <Icon name="search" size={14} />
            {t("company.rangeHint")}
            {research > 0 ? ` ${t("company.researchHint")}` : null}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h3>
          {t("company.traits")}
          {company.traits_hidden > 0 ? (
            <span className="cp-hidden">
              {t("company.traitsHidden", { count: company.traits_hidden })}
            </span>
          ) : null}
        </h3>
        {company.traits.length ? (
          <ul className="cp-traits">
            {company.traits.map((trait) => (
              <li key={trait}>
                <Tag>{t(`trait.${trait}`)}</Tag>
                <span>{t(`trait.${trait}.effect`)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">{t("term.none")}</span>
        )}
      </section>

      <section className="card">
        <h3>{t("company.people")}</h3>
        <div className="cp-ceo">
          <span className="cp-portrait" aria-hidden>
            <Portrait seed={company.ceo.name} feminine={company.ceo.feminine} country={company.country} size={56} />
          </span>
          <div className="cp-ceo-main">
            <div className="cp-ceo-name">
              <b>{company.ceo.name}</b>
              <small className="muted">{t("company.ceo")}</small>
            </div>
            <div className="cp-tags">
              <Tag>{t("company.ceoAge", { age: company.ceo.age })}</Tag>
              <Tag>{t("company.ceoTenure", { years: company.ceo.tenure })}</Tag>
              {company.ceo.founder ? (
                <Tag tone="accent">{t("company.ceoFounder")}</Tag>
              ) : null}
              {company.ceo.style ? (
                <Tag tone="good">{t(`ceo_style.${company.ceo.style}`)}</Tag>
              ) : (
                <Tag tone="muted">{t("company.ceoStyleUnknown")}</Tag>
              )}
            </div>
          </div>
        </div>
        <div className="cp-people-rating">
          <Rating label={t("company.management")} value={company.management} />
          {company.management === null ? (
            <small className="muted">{t("company.managementUnknown")}</small>
          ) : null}
        </div>
        {company.held ? null : (
          <div className="cp-stance">
            <span className="muted">{t("company.ownerStance")}</span>
            {company.stance ? (
              <>
                <Tag tone="accent">{t(`seller_stance.${company.stance}`)}</Tag>
                <small>{t(`seller_stance.${company.stance}.effect`)}</small>
              </>
            ) : (
              <>
                <Tag tone="muted">{t("term.unknown")}</Tag>
                <small className="muted">
                  {t("company.stanceHint", { need: company.approach.early_notice_at })}
                </small>
              </>
            )}
          </div>
        )}
        {founderLeaves ? (
          <div className="cp-warn">
            <Tag tone="warn" icon={<Icon name="alert" size={12} />}>
              {t("company.founderLeaves")}
            </Tag>
            <small>{t("company.founderLeavesNote")}</small>
          </div>
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
        {company.owner.kind === "public" ? (
          <p className="cp-hint">
            <Icon name="market" size={14} />
            {t("company.publicNote")}
          </p>
        ) : null}
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
        </div>
      </section>

      {fin ? (
        <section className="card">
          <h3>{t("company.quality")}</h3>
          <div className="cp-quality">
            <Radar axes={qualityAxes(t, company, fin)} size={190} />
            <div className="cp-quality-side">
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
          <ProcessCard company={company} />
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

    </div>
  );
}

function FinancialsTab({
  company,
  t,
  f,
}: {
  company: CompanyView;
  t: Translate;
  f: Format;
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
  return (
    <div className="stack">
      <section className="card">
        <h3>{t("statement.chartTitle", { years: fin.statements.years.length })}</h3>
        <FiveYearChart years={fin.statements.years} t={t} f={f} />
      </section>

      <StatementTables data={fin.statements} t={t} f={f} />

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
          {fin.multiple_millis != null && fin.model_ev != null && fin.model_equity != null ? (
            <>
              <Stat
                label={t("company.fin.modelMultiple")}
                value={f.multiple(fin.multiple_millis)}
                hint={t("company.fin.sectorMultiple", {
                  multiple: f.multiple(company.sector_multiple_millis),
                })}
              />
              <Stat label={t("term.ev")} value={f.money(fin.model_ev)} />
              <Stat label={t("term.equity")} value={f.money(fin.model_equity)} />
            </>
          ) : null}
        </div>
        {fin.model_ev != null ? <p className="cp-hint">{t("term.modelNotPrice")}</p> : null}
      </section>

    </div>
  );
}
