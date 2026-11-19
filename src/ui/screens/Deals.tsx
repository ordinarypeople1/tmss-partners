import { useMemo, useState } from "react";
import { useT, type Translate } from "../../i18n/useT";
import { DD_STREAMS, type CompanyRow, type DealView, type Stage, type View } from "../../sim/types";
import { Funnel, Meter, Ring, Stat, Tag } from "../charts";
import { mid, monthsBetween, useFormat } from "../format";
import { useGame } from "../game";
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
    return { id: "wait_result", tone: "muted" };
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
  }, [forSale, sector, stages, reach, limit, query, funnel, stageOf, sort, t]);

  const funnelStages = FUNNEL.map((id) => ({
    id,
    label: t(`deals.funnel.${id}`),
    count: id === "watch" ? watching.length : mine.filter((item) => item.stage === id).length,
  }));
  const slotsFull = view.deals.length >= view.limits.deals;
  const periodLeft = Math.max(monthsBetween(view.date, view.fund.investment_period_ends), 0);
  const filtered = sector !== "" || stages.length > 0 || reach || query.trim() !== "" || funnel !== null;

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
                <div key={stage} className="deals-column" data-dim={dim ? "true" : undefined}>
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

      <section className="card">
        <h2>
          <Icon name="table" size={15} />
          {t("deals.board.title")}
          <small className="muted">{filtered ? `${shown.length}/${forSale.length}` : f.integer(forSale.length)}</small>
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
          <button type="button" className="deals-chip" aria-pressed={reach} onClick={() => setReach(!reach)} title={t("deals.filter.reachHint")}>
            <Icon name="fund" size={13} />
            {t("deals.filter.reach")}
          </button>
          <small className="muted">{t("deals.filter.reachHint")}</small>
        </div>
        {forSale.length === 0 ? (
          <div className="empty">
            <Icon name="search" size={26} />
            <p>{t("deals.board.empty")}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p>{t("deals.board.noMatch")}</p>
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
                  return (
                    <tr key={row.i} aria-selected={game.selected === row.i} onClick={() => game.select(row.i)}>
                      <td>
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
                        {row.name}
                        <span className="sub">{t(`admin1.${row.admin1}`)}</span>
                      </td>
                      <td>
                        <span className="deals-sector">
                          <Icon name={row.sector} size={14} />
                          {t(`sector.${row.sector}`)}
                        </span>
                      </td>
                      <td>{ownerText(t, view, row)}</td>
                      <td>
                        <Tag tone={sale.reason === "distress" ? "bad" : "muted"}>{t(`reason.${sale.reason}`)}</Tag>
                      </td>
                      <td>
                        <span className="deals-stage">
                          <Ring fraction={sale.months_left / STAGE_MONTHS} size={24} tone={monthsTone(sale.months_left)}>
                            {String(sale.months_left)}
                          </Ring>
                          <span>
                            {t(`stage.${sale.stage}`)}
                            <span className="sub">{t("format.months", { months: sale.months_left })}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <Rivals row={row} />
                      </td>
                      <td className="num">{f.figure(row.revenue)}</td>
                      <td className="num">{f.figure(row.ebitda)}</td>
                      <td className="num">
                        {f.figure(row.ev)}
                        {withinReach(row) ? null : <span className="sub">{t("deals.outOfReach")}</span>}
                      </td>
                      <td className="deals-rel">
                        <Meter
                          value={row.relationship}
                          max={100}
                          tone={row.relationship >= 60 ? "good" : row.relationship >= 40 ? "accent" : "ink"}
                          text={f.integer(row.relationship)}
                        />
                      </td>
                      <td className="num">
                        {mineStage ? (
                          <Tag tone="accent">{t(`deals.column.${mineStage}`)}</Tag>
                        ) : (
                          <button
                            type="button"
                            className="btn small"
                            disabled={slotsFull}
                            title={slotsFull ? t("error.too_many_deals") : undefined}
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

  return (
    <button
      type="button"
      className="deals-card"
      aria-pressed={game.selected === row.i}
      data-urgent={sale && sale.months_left <= 1 ? "true" : undefined}
      onClick={() => game.select(row.i)}
    >
      <span className="deals-card-head">
        <span className="deals-card-icon">
          <Icon name={row.sector} size={16} />
        </span>
        <span className="deals-card-name">
          <b>{row.name}</b>
          <small>{`${t(`sector.${row.sector}`)} · ${t(`admin1.${row.admin1}`)}`}</small>
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
        <Tag tone="muted" icon={<Icon name="flag" size={12} />}>
          {t("deals.card.rivals", { count: sale?.rivals.length ?? 0 })}
        </Tag>
      </span>

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
