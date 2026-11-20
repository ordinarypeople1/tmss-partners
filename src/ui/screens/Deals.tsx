import { Banks } from "../Process";
import { Building } from "../Building";
import { useMemo, useState } from "react";
import { useT, type Translate } from "../../i18n/useT";
import { DD_STREAMS, type CompanyRow, type DealView, type Stage, type View } from "../../sim/types";
import { Funnel, Meter, Ring, Stat, Tag } from "../charts";
import { mid, monthsBetween, useFormat } from "../format";
import { useGame } from "../game";
import { AccessPips, IntentTag, StepChip } from "../Journey";
import { Icon } from "../icons";
import { bidderName } from "../messages";
import "./Deals.css";

type DealStage = "nda" | "diligence" | "ic" | "bid";
type FunnelStage = "watch" | DealStage;
type Tone = "good" | "bad" | "warn" | "accent" | "muted";
type SortKey = "name" | "sector" | "stage" | "rivals" | "revenue" | "ebitda" | "ev" | "relationship";

const DEAL_STAGES: DealStage[] = ["nda", "diligence", "ic", "bid"];
const FUNNEL: FunnelStage[] = ["watch", ...DEAL_STAGES];
const SALE_STAGES: Stage[] = ["preparing", "marketing", "bidding", "exclusive"];
const STAGE_ORDER: Record<Stage, number> = { exclusive: 0, bidding: 1, marketing: 2, preparing: 3 };
/** The longest a sale stage runs, for the countdown ring. */
const STAGE_MONTHS = 4;
/** Rough share of a purchase the fund pays in equity. A guide for the "within reach" filter only. */
const EQUITY_SHARE = 0.5;
const HOME = "US";
type CountryFilter = "" | "home" | "abroad";
const COUNTRY_FILTERS: CountryFilter[] = ["", "home", "abroad"];

function Lock({ size = 13 }: { size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

/** Region, with the country for companies abroad. */
function placeText(t: Translate, row: CompanyRow): string {
  return row.country === HOME ? t(`admin1.${row.admin1}`) : `${t(`admin1.${row.admin1}`)} · ${t(`country.${row.country}`)}`;
}

/** Second or worse in the final round, with room under the approved ceiling. */
function canRaise(row: CompanyRow): boolean {
  const sale = row.sale;
  return Boolean(sale && sale.final_round && sale.standing && sale.standing.rank > 1 && sale.my_bid !== null && sale.bid_ceiling > sale.my_bid);
}

interface MyDeal {
  row: CompanyRow;
  deal: DealView;
  stage: DealStage;
}

function dealStage(deal: DealView): DealStage {
  if (deal.bid_submitted) {
    return "bid";
  }
  if (deal.committee?.outcome === "approved") {
    return "ic";
  }
  if (deal.streams_done.length + deal.streams_running.length > 0 || deal.offer) {
    return "diligence";
  }
  return "nda";
}

/** The one thing to do next on a deal file. */
function nextAction(row: CompanyRow, deal: DealView): { id: string; tone: Tone } {
  if (deal.bid_submitted) {
    return canRaise(row) ? { id: "raise_bid", tone: "warn" } : { id: "wait_result", tone: "muted" };
  }
  if (deal.committee?.outcome === "approved") {
    const biddable = row.sale?.stage === "bidding" || row.sale?.stage === "exclusive";
    return biddable ? { id: "submit_bid", tone: "accent" } : { id: "wait_bidding", tone: "muted" };
  }
  if (deal.committee) {
    return { id: "revise_offer", tone: "warn" };
  }
  if (deal.offer) {
    return { id: "submit_ic", tone: "accent" };
  }
  if (deal.streams_done.length === 0 && deal.streams_running.length === 0) {
    return { id: "run_diligence", tone: "accent" };
  }
  if (deal.streams_done.length === 0) {
    return { id: "wait_report", tone: "muted" };
  }
  return { id: "set_offer", tone: "accent" };
}

function monthsTone(months: number): "bad" | "warn" | "accent" {
  return months <= 1 ? "bad" : months <= 2 ? "warn" : "accent";
}

function ownerText(t: Translate, view: View, row: CompanyRow): string {
  if (row.owner.kind === "founder") {
    return t("owner.founderAge", { age: row.owner.age });
  }
  if (row.owner.kind === "sponsor") {
    return t("owner.sponsorHeld", { house: view.rivals[row.owner.house] ?? t("owner.sponsor"), months: row.owner.months_held });
  }
  return t(`owner.${row.owner.kind}`);
}

export function Deals() {
  const game = useGame();
  const { view, peek } = game;
  const t = useT();
  const f = useFormat();
  const [funnel, setFunnel] = useState<FunnelStage | null>(null);
  const [sector, setSector] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [reach, setReach] = useState(false);
  const [country, setCountry] = useState<CountryFilter>("");
  const [finalOnly, setFinalOnly] = useState(false);
  const [board, setBoard] = useState<"cards" | "table">("cards");
  /** Deals abroad open at the rank of principal. */
  const abroadLocked = view.career.rank === "vice_president";
  const insightOf = (id: string) => view.insight[view.economy.sectors.findIndex((item) => item.id === id)] ?? 0;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: "stage", down: false });

  const mine = useMemo<MyDeal[]>(() => {
    const list: MyDeal[] = [];
    for (const index of view.deals) {
      const company = peek(index);
      if (company?.deal) {
        list.push({ row: company, deal: company.deal, stage: dealStage(company.deal) });
      }
    }
    return list;
  }, [view, peek]);
  const stageOf = useMemo(() => new Map(mine.map((item) => [item.row.i, item.stage])), [mine]);

  const forSale = useMemo(() => view.companies.filter((row) => row.sale && !row.held), [view.companies]);
  /** Owners the player has met whose company is not for sale: the pipeline behind the pipeline. */
  const courting = useMemo(
    () =>
      view.companies
        .filter((row) => row.relationship > 0 && !row.sale && !row.held && !row.in_deal && row.owner.kind !== "merged" && row.owner.kind !== "lender")
        .sort((a, b) => b.relationship - a.relationship)
        .slice(0, 12),
    [view.companies],
  );
  const watching = forSale.filter((row) => row.watched && !row.in_deal);
  const limit = view.fund.concentration_limit;
  const withinReach = (row: CompanyRow) => row.ev[0] * EQUITY_SHARE <= limit;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = forSale.filter((row) => {
      if (sector && row.sector !== sector) {
        return false;
      }
      if (stages.length > 0 && !(row.sale && stages.includes(row.sale.stage))) {
        return false;
      }
      if (reach && row.ev[0] * EQUITY_SHARE > limit) {
        return false;
      }
      if (country !== "" && (row.country === HOME) !== (country === "home")) {
        return false;
      }
      if (finalOnly && !row.sale?.final_round) {
        return false;
      }
      if (needle && !row.name.toLowerCase().includes(needle)) {
        return false;
      }
      if (funnel === "watch") {
        return row.watched && !row.in_deal;
      }
      if (funnel) {
        return stageOf.get(row.i) === funnel;
      }
      return true;
    });
    const value = (row: CompanyRow): number | string => {
      switch (sort.key) {
        case "name":
          return row.name;
        case "sector":
          return t(`sector.${row.sector}`);
        case "stage":
          return row.sale ? STAGE_ORDER[row.sale.stage] * 10 + row.sale.months_left : 99;
        case "rivals":
          return row.sale?.rivals.length ?? 0;
        case "revenue":
          return mid(row.revenue);
        case "ebitda":
          return mid(row.ebitda);
        case "ev":
          return mid(row.ev);
        default:
          return row.relationship;
      }
    };
    return list.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const order = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
      return (sort.down ? -order : order) || a.i - b.i;
    });
  }, [forSale, sector, stages, reach, country, finalOnly, limit, query, funnel, stageOf, sort, t]);

  const funnelStages = FUNNEL.map((id) => ({
    id,
    label: t(`deals.funnel.${id}`),
    count: id === "watch" ? watching.length : mine.filter((item) => item.stage === id).length,
  }));
  const slotsFull = view.deals.length >= view.limits.deals;
  const periodLeft = Math.max(monthsBetween(view.date, view.fund.investment_period_ends), 0);
  const filtered = sector !== "" || stages.length > 0 || reach || country !== "" || finalOnly || query.trim() !== "" || funnel !== null;
  const abroadCount = forSale.filter((row) => row.country !== HOME).length;
  const finalCount = forSale.filter((row) => row.sale?.final_round).length;
  const myFinal = mine.filter((item) => item.row.sale?.final_round).length;

  const header = (key: SortKey, label: string, numeric = false) => (
    <th className={numeric ? "num" : undefined} aria-sort={sort.key === key ? (sort.down ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        onClick={() => setSort((now) => ({ key, down: now.key === key ? !now.down : numeric }))}
      >
        {label}
        {sort.key === key ? <Icon name={sort.down ? "down" : "up"} size={11} /> : null}
      </button>
    </th>
  );

  return (
    <div className="deals">
      <header className="page-head">
        <div>
          <h1>{t("deals.title")}</h1>
          <p>{t("deals.subtitle")}</p>
        </div>
        {funnel ? (
          <button type="button" className="btn small" onClick={() => setFunnel(null)}>
            <Icon name="close" size={13} />
            {t("deals.funnel.clear", { stage: t(`deals.funnel.${funnel}`) })}
          </button>
        ) : null}
      </header>

      <div className="deals-top">
        <section className="card">
          <h2>
            <Icon name="deals" size={15} />
            {t("deals.funnel.title")}
          </h2>
          <Funnel stages={funnelStages} active={funnel ?? undefined} onSelect={(id) => setFunnel(funnel === id ? null : (id as FunnelStage))} />
          {myFinal > 0 ? (
            <div className="row deals-funnel-note">
              <Tag tone="bad" icon={<Icon name="gavel" size={12} />}>
                {t("deals.final.mine", { count: myFinal })}
              </Tag>
            </div>
          ) : null}
        </section>
        <section className="card deals-capacity">
          <div className="deals-slots">
            <span className="stat-label">{t("deals.slots")}</span>
            <div className="row">
              <span className="deals-pips" aria-hidden>
                {Array.from({ length: view.limits.deals }, (_, index) => (
                  <i key={index} data-on={index < view.deals.length ? "true" : undefined} />
                ))}
              </span>
              <b data-tone={slotsFull ? "warn" : undefined}>{`${view.deals.length}/${view.limits.deals}`}</b>
              {slotsFull ? <Tag tone="warn">{t("deals.slotsFull")}</Tag> : null}
            </div>
          </div>
          <div className="deals-slots">
            <span className="stat-label">{t("deals.attention")}</span>
            <div className="row">
              <span className="deals-pips" data-kind="attention" aria-hidden>
                {Array.from({ length: view.attention.max }, (_, index) => (
                  <i key={index} data-on={index < view.attention.left ? "true" : undefined} />
                ))}
              </span>
              <b>{`${view.attention.left}/${view.attention.max}`}</b>
            </div>
          </div>
          <Stat
            label={t("deals.market")}
            value={f.integer(view.market.visible)}
            hint={t("deals.marketOf", { count: view.market.companies })}
          />
          <div className="deals-powder">
            <Meter
              value={view.fund.uncalled}
              max={view.fund.committed}
              tone={view.fund.uncalled < limit ? "warn" : "good"}
              label={t("deals.dryPowder")}
              text={`${f.money(view.fund.uncalled)} / ${f.money(view.fund.committed)}`}
            />
            <div className="row">
              <Tag tone={view.fund.investing ? "accent" : "bad"} icon={<Icon name="clock" size={13} />}>
                {view.fund.investing ? t("deals.investing", { months: periodLeft }) : t("deals.investingOver")}
              </Tag>
              <Tag tone="muted">{t("deals.perDeal", { amount: f.money(limit) })}</Tag>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>
          <Icon name="handshake" size={15} />
          {t("deals.courting.title")}
          <small className="muted">{courting.length}</small>
        </h2>
        {courting.length === 0 ? (
          <p className="muted">{t("deals.courting.empty")}</p>
        ) : (
          <div className="rel-list">
            {courting.map((row) => (
              <button key={row.i} type="button" className="rel-item" onClick={() => game.select(row.i)}>
                <span className="rel-head">
                  <strong className="clip" title={row.name}>{row.short}</strong>
                  <Building sector={row.sector} seed={row.i} size={60} />
                </span>
                <Meter value={row.relationship} max={100} markers={[20, 40, 60]} tone={row.relationship >= 60 ? "good" : row.relationship >= 40 ? "accent" : "ink"} label={t(`access.${row.access}`)} text={f.integer(row.relationship)} />
                <span className="row">
                  <IntentTag intent={row.intent} />
                  <StepChip row={row} />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>
          <Icon name="layers" size={15} />
          {t("deals.mine.title")}
          <small className="muted">{`${mine.length}/${view.limits.deals}`}</small>
        </h2>
        {mine.length === 0 ? (
          <div className="empty">
            <Icon name="handshake" size={26} />
            <p>{t("deals.mine.empty")}</p>
          </div>
        ) : (
          <div className="deals-board">
            {DEAL_STAGES.map((stage) => {
              const cards = mine.filter((item) => item.stage === stage);
              const dim = funnel !== null && funnel !== stage;
              return (
                <div key={stage} className="deals-column" data-dim={dim ? "true" : undefined} data-empty={cards.length === 0 ? "true" : undefined}>
                  <h3>
                    {t(`deals.column.${stage}`)}
                    <b>{cards.length}</b>
                  </h3>
                  {cards.length === 0 ? <div className="deals-slot" /> : null}
                  {cards.map((item) => (
                    <DealCard key={item.row.i} item={item} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Banks />

      <section className="card">
        <h2>
          <Icon name="table" size={15} />
          {t("deals.board.title")}
          <small className="muted">{filtered ? `${shown.length}/${forSale.length}` : f.integer(forSale.length)}</small>
          <span className="deals-view" role="group">
            <button type="button" aria-pressed={board === "cards"} aria-label={t("deals.view.cards")} title={t("deals.view.cards")} onClick={() => setBoard("cards")}>
              <Icon name="layers" size={14} />
            </button>
            <button type="button" aria-pressed={board === "table"} aria-label={t("deals.view.table")} title={t("deals.view.table")} onClick={() => setBoard("table")}>
              <Icon name="table" size={14} />
            </button>
          </span>
        </h2>
        <div className="deals-filters">
          <label className="deals-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("deals.filter.search")}
              aria-label={t("deals.filter.search")}
            />
          </label>
          <div className="deals-filter-row">
            <select value={sector} onChange={(event) => setSector(event.target.value)} aria-label={t("term.sector")}>
              <option value="">{t("deals.filter.allSectors")}</option>
              {view.economy.sectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(`sector.${item.id}`)}
                </option>
              ))}
            </select>
            <div className="deals-chips" role="group" aria-label={t("deals.col.stage")}>
              {SALE_STAGES.map((stage) => {
                const on = stages.includes(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    className="deals-chip"
                    aria-pressed={on}
                    onClick={() => setStages(on ? stages.filter((item) => item !== stage) : [...stages, stage])}
                  >
                    {t(`stage.${stage}`)}
                    <small>{forSale.filter((row) => row.sale?.stage === stage).length}</small>
                  </button>
                );
              })}
            </div>
            <div className="deals-chips" role="group" aria-label={t("deals.filter.country")}>
              {COUNTRY_FILTERS.map((item) => (
                <button key={item || "all"} type="button" className="deals-chip" aria-pressed={country === item} onClick={() => setCountry(item)}>
                  {item === "abroad" && abroadLocked ? <Lock size={12} /> : null}
                  {t(`deals.filter.country.${item || "all"}`)}
                  <small>{item === "" ? forSale.length : item === "home" ? forSale.length - abroadCount : abroadCount}</small>
                </button>
              ))}
            </div>
            <button type="button" className="deals-chip" data-kind="final" aria-pressed={finalOnly} onClick={() => setFinalOnly(!finalOnly)}>
              <Icon name="gavel" size={13} />
              {t("deals.final.tag")}
              <small>{finalCount}</small>
            </button>
            <button type="button" className="deals-chip" aria-pressed={reach} onClick={() => setReach(!reach)} title={t("deals.filter.reachHint")}>
              <Icon name="fund" size={13} />
              {t("deals.filter.reach")}
            </button>
          </div>
          <small className="muted">{t("deals.filter.reachHint")}</small>
          <small className="muted">{t("deals.unit", { unit: t("term.usd") })}</small>
        </div>
        {abroadLocked && abroadCount > 0 && country !== "home" ? (
          <p className="deals-lock-note">
            <Lock size={13} />
            <span>{t("country.locked")}</span>
          </p>
        ) : null}
        {forSale.length === 0 ? (
          <div className="empty">
            <Icon name="search" size={26} />
            <p>{t("deals.board.empty")}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p>{t("deals.board.noMatch")}</p>
          </div>
        ) : board === "cards" ? (
          <div className="sale-cards">
            {shown.map((row) => (
              <SaleCard key={row.i} row={row} locked={row.country !== HOME && abroadLocked} reach={withinReach(row)} />
            ))}
          </div>
        ) : (
          <div className="deals-table">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <Icon name="eye" size={14} title={t("deals.col.watch")} />
                  </th>
                  {header("name", t("deals.col.company"))}
                  <th>{t("deals.col.country")}</th>
                  {header("sector", t("term.sector"))}
                  <th>{t("term.owner")}</th>
                  <th>{t("deals.col.reason")}</th>
                  {header("stage", t("deals.col.stage"))}
                  {header("rivals", t("deals.col.rivals"))}
                  {header("revenue", t("term.revenue"), true)}
                  {header("ebitda", t("term.ebitda"), true)}
                  {header("ev", t("term.ev"), true)}
                  {header("relationship", t("term.relationship"), true)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const sale = row.sale;
                  if (!sale) {
                    return null;
                  }
                  const mineStage = stageOf.get(row.i);
                  const abroad = row.country !== HOME;
                  const locked = abroad && abroadLocked;
                  const insight = insightOf(row.sector);
                  const listed = sale.reason === "strategic_review";
                  return (
                    <tr key={row.i} aria-selected={game.selected === row.i} data-locked={locked ? "true" : undefined} onClick={() => game.select(row.i)}>
                      <td className="deals-cell-watch">
                        <button
                          type="button"
                          className="deals-watch"
                          aria-pressed={row.watched}
                          aria-label={t(row.watched ? "deals.unwatch" : "deals.watch")}
                          title={t(row.watched ? "deals.unwatch" : "deals.watch")}
                          onClick={(event) => {
                            event.stopPropagation();
                            game.act({ type: "watch", company: row.i, on: !row.watched });
                          }}
                        >
                          <Icon name="eye" size={15} />
                        </button>
                      </td>
                      <td className="name">
                        {row.short}
                        <span className="sub">{t(`admin1.${row.admin1}`)}</span>
                      </td>
                      <td className="deals-cell-country" data-home={abroad ? undefined : "true"}>
                        {abroad ? (
                          <span className="deals-country" data-locked={locked ? "true" : undefined} title={locked ? t("country.locked") : undefined}>
                            {locked ? <Lock size={12} /> : null}
                            {t(`country.${row.country}`)}
                          </span>
                        ) : (
                          <span className="muted">{t(`country.${row.country}`)}</span>
                        )}
                      </td>
                      <td className="deals-cell-sector">
                        <span className="deals-sector">
                          <Icon name={row.sector} size={14} />
                          {t(`sector.${row.sector}`)}
                          {insight > 0 ? (
                            <span className="deals-insight" title={t("deals.insight", { months: insight })}>
                              <Icon name="search" size={11} title={t("deals.insight", { months: insight })} />
                              {insight}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="deals-cell-owner">{ownerText(t, view, row)}</td>
                      <td className="deals-cell-reason">
                        {listed ? (
                          <span className="deals-reason">
                            <Tag tone="warn">{t("reason.strategic_review")}</Tag>
                            <span className="sub">{t("deals.listed.premium")}</span>
                          </span>
                        ) : (
                          <Tag tone={sale.reason === "distress" ? "bad" : "muted"}>{t(`reason.${sale.reason}`)}</Tag>
                        )}
                      </td>
                      <td className="deals-cell-stage">
                        <span className="deals-stage">
                          <Ring fraction={sale.months_left / STAGE_MONTHS} size={24} tone={monthsTone(sale.months_left)}>
                            {String(sale.months_left)}
                          </Ring>
                          <span>
                            {t(`stage.${sale.stage}`)}
                            <span className="sub">{t("format.months", { months: sale.months_left })}</span>
                            {sale.final_round ? (
                              <span className="deals-final">
                                <Icon name="gavel" size={11} />
                                {t("deals.final.tag")}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="deals-cell-rivals" data-label={t("deals.col.rivals")}>
                        <Rivals row={row} />
                      </td>
                      <td className="num deals-cell-figure" data-label={t("term.revenue")}>
                        {f.shortFigure(row.revenue)}
                      </td>
                      <td className="num deals-cell-figure" data-label={t("term.ebitda")}>
                        {f.shortFigure(row.ebitda)}
                      </td>
                      <td className="num deals-cell-figure" data-label={t("term.ev")}>
                        {f.shortFigure(row.ev)}
                        {withinReach(row) ? null : <span className="sub">{t("deals.outOfReach")}</span>}
                      </td>
                      <td className="deals-rel" data-label={t("term.relationship")}>
                        <Meter
                          value={row.relationship}
                          max={100}
                          tone={row.relationship >= 60 ? "good" : row.relationship >= 40 ? "accent" : "ink"}
                          text={f.integer(row.relationship)}
                        />
                      </td>
                      <td className="num deals-cell-action">
                        {mineStage ? (
                          <Tag tone="accent">{t(`deals.column.${mineStage}`)}</Tag>
                        ) : locked ? (
                          <span className="deals-locked">
                            <button type="button" className="btn small" disabled title={t("country.locked")}>
                              <Lock size={12} />
                              {t("deals.nda")}
                            </button>
                            <span className="sub">{t("deals.lockedShort")}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn small"
                            disabled={slotsFull || !sale.invited || sale.first_round_closed}
                            title={slotsFull ? t("error.too_many_deals") : !sale.invited ? t("block.not_invited") : sale.first_round_closed ? t("block.first_round_closed") : undefined}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (game.act({ type: "sign_nda", company: row.i })) {
                                game.select(row.i);
                              }
                            }}
                          >
                            {t("deals.nda")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** A company for sale as a card: the building, the clock, three figures and the step to take. */
function SaleCard({ row, locked, reach }: { row: CompanyRow; locked: boolean; reach: boolean }) {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const sale = row.sale;
  if (!sale) {
    return null;
  }
  const tone = sale.months_left <= 1 ? "bad" : sale.stage === "bidding" ? "warn" : sale.stage === "exclusive" ? "good" : "muted";
  return (
    <button type="button" className="sale-card" data-tone={tone} data-locked={locked ? "true" : undefined} aria-pressed={game.selected === row.i} onClick={() => game.select(row.i)}>
      <span className="sale-card-top">
        <span className="sale-card-status">
          <i />
          {t(`stage.${sale.stage}`)}
          <Ring fraction={sale.months_left / STAGE_MONTHS} size={24} tone={monthsTone(sale.months_left)}>
            {String(sale.months_left)}
          </Ring>
        </span>
        <Building sector={row.sector} seed={row.i} size={112} />
      </span>
      <span className="sale-card-name">
        <b className="clip" title={row.name}>{row.short}</b>
        <small className="clip">{`${t(`sector.${row.sector}`)} · ${placeText(t, row)}`}</small>
      </span>
      <span className="sale-card-tags">
        <Tag tone="muted">{t(`reason.${sale.reason}`)}</Tag>
        {sale.adviser === null ? null : <Tag tone={sale.format === "targeted" ? "warn" : "muted"}>{t(`format.${sale.format}`)}</Tag>}
        {sale.invited ? null : (
          <Tag tone="bad" icon={<Lock size={11} />}>
            {t("process.notInvited")}
          </Tag>
        )}
        {sale.first_round_closed ? (
          <Tag tone="bad" icon={<Lock size={11} />}>
            {t("process.closed")}
          </Tag>
        ) : null}
        {sale.final_round ? (
          <Tag tone="bad" icon={<Icon name="gavel" size={12} />}>
            {t("deals.final.tag")}
          </Tag>
        ) : null}
        {locked ? <Tag tone="warn" icon={<Lock size={11} />}>{t("deals.lockedShort")}</Tag> : null}
        {reach ? null : <Tag tone="muted">{t("deals.outOfReach")}</Tag>}
        <Rivals row={row} />
      </span>
      <span className="sale-card-stats">
        <span>
          <small>{t("term.revenue")}</small>
          <b>{f.shortFigure(row.revenue)}</b>
        </span>
        <span>
          <small>{t("term.ebitda")}</small>
          <b>{f.shortFigure(row.ebitda)}</b>
        </span>
        <span>
          <small>{t("term.evShort")}</small>
          <b>{f.shortFigure(row.ev)}</b>
        </span>
      </span>
      <span className="sale-card-foot">
        <AccessPips row={row} />
        <StepChip row={row} />
      </span>
    </button>
  );
}

/** One flag per rival: houses, then strategic buyers. */
function Rivals({ row }: { row: CompanyRow }) {
  const { view } = useGame();
  const t = useT();
  const rivals = row.sale?.rivals ?? [];
  if (rivals.length === 0) {
    return <span className="muted">{"–"}</span>;
  }
  return (
    <span className="deals-rivals" title={rivals.map((rival) => bidderName(t, view, rival)).join(", ")}>
      {rivals.map((rival, index) => (
        <i key={index} data-kind={rival.kind} />
      ))}
      <b>{rivals.length}</b>
    </span>
  );
}

function DealCard({ item }: { item: MyDeal }) {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { row, deal } = item;
  const sale = row.sale;
  const action = nextAction(row, deal);
  const financing = deal.offer ? deal.preview?.financing : undefined;
  const premium = financing ? financing.price_to_model_bps - 10_000 : 0;
  const outcome = deal.committee?.outcome;
  const standing = sale?.standing ?? null;
  const raise = canRaise(row);

  return (
    <button
      type="button"
      className="deals-card"
      aria-pressed={game.selected === row.i}
      data-urgent={sale && sale.months_left <= 1 ? "true" : undefined}
      data-final={sale?.final_round ? "true" : undefined}
      onClick={() => game.select(row.i)}
    >
      <span className="deals-card-head">
        <span className="deals-card-art">
          <Building sector={row.sector} seed={row.i} size={64} />
        </span>
        <span className="deals-card-name">
          <b className="clip" title={row.name}>{row.short}</b>
          <small>{`${t(`sector.${row.sector}`)} · ${placeText(t, row)}`}</small>
        </span>
        {sale ? (
          <Ring fraction={sale.months_left / STAGE_MONTHS} size={28} tone={monthsTone(sale.months_left)}>
            {String(sale.months_left)}
          </Ring>
        ) : null}
      </span>

      <span className="deals-card-row">
        {sale ? (
          <Tag tone={sale.months_left <= 1 ? "bad" : sale.stage === "bidding" || sale.stage === "exclusive" ? "accent" : undefined}>
            {`${t(`stage.${sale.stage}`)} · ${t("format.months", { months: sale.months_left })}`}
          </Tag>
        ) : (
          <Tag tone="muted">{t("deals.card.noSale")}</Tag>
        )}
        {sale?.final_round ? (
          <span className="deals-final" data-size="card">
            <Icon name="gavel" size={12} />
            {t("deals.final.tag")}
          </span>
        ) : null}
        <Tag tone="muted" icon={<Icon name="flag" size={12} />}>
          {t("deals.card.rivals", { count: sale?.rivals.length ?? 0 })}
        </Tag>
      </span>

      {row.country !== HOME || sale?.reason === "strategic_review" || deal.coinvest ? (
        <span className="deals-card-row">
          {row.country !== HOME ? <Tag icon={<Icon name="map" size={12} />}>{t(`country.${row.country}`)}</Tag> : null}
          {sale?.reason === "strategic_review" ? <Tag tone="warn">{`${t("owner.public")} · ${t("deals.listed.premium")}`}</Tag> : null}
          {deal.coinvest ? (
            <Tag tone="accent" icon={<Icon name="handshake" size={12} />}>
              {t("deals.card.coinvest")}
            </Tag>
          ) : null}
        </span>
      ) : null}

      {standing ? (
        <span className="deals-standing" data-tone={standing.rank === 1 ? "good" : standing.rank === 2 ? "warn" : "bad"}>
          <b>{t("deals.standing", { rank: standing.rank, bidders: standing.bidders })}</b>
          <span>
            <small>{t("deals.standing.lead")}</small>
            {f.figure(standing.lead)}
          </span>
          {sale && sale.my_bid !== null ? (
            <span>
              <small>{t("deals.standing.mine")}</small>
              {f.money(sale.my_bid)}
            </span>
          ) : null}
          {raise && sale ? (
            <span>
              <small>{t("deals.standing.ceiling")}</small>
              {f.money(sale.bid_ceiling)}
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="deals-card-row">
        <span className="deals-streams">
          {DD_STREAMS.map((stream) => {
            const state = deal.streams_done.includes(stream) ? "done" : deal.streams_running.includes(stream) ? "running" : "none";
            return (
              <i key={stream} data-state={state} title={`${t(`stream.${stream}`)} · ${t(`deals.stream.${state}`)}`}>
                {t(`deals.streamShort.${stream}`)}
              </i>
            );
          })}
        </span>
        {outcome ? (
          <Tag tone={outcome === "approved" ? "good" : outcome === "held" ? "warn" : "bad"} icon={<Icon name="gavel" size={12} />}>
            {`${t("deals.card.ic")} ${t(`outcome.${outcome}`)}`}
          </Tag>
        ) : null}
      </span>

      {deal.offer ? (
        <span className="deals-card-offer">
          <span>
            <small>{t("deals.card.offer")}</small>
            <b>{f.money(deal.offer.ev)}</b>
          </span>
          {financing ? (
            <span data-tone={premium > 1_500 ? "bad" : premium > 800 ? "warn" : premium < 0 ? "good" : undefined}>
              <small>{t("deals.card.vsModel")}</small>
              <b>{f.signedPct(premium)}</b>
            </span>
          ) : null}
          {financing ? (
            <span>
              <small>{t("term.leverage")}</small>
              <b>{f.multiple(financing.leverage_millis)}</b>
            </span>
          ) : null}
        </span>
      ) : (
        <span className="deals-card-offer">
          <span>
            <small>{t("term.ev")}</small>
            <b>{f.figure(row.ev)}</b>
          </span>
        </span>
      )}

      <span className="deals-card-next">
        <Tag tone={action.tone} icon={<Icon name={action.tone === "muted" ? "clock" : "bolt"} size={12} />}>
          {t(`deals.next.${action.id}`)}
        </Tag>
      </span>
    </button>
  );
}
