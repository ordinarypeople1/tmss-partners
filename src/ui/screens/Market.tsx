import { useMemo, useState } from "react";
import { gate } from "../Gate";
import { useT } from "../../i18n/useT";
import type { CompanyRow, GameDate, Message, Owner } from "../../sim/types";
import { CycleClock, LineChart, Ring, Stat, StackBar, Tag } from "../charts";
import { mid, useFormat } from "../format";
import { useGame } from "../game";
import { Icon } from "../icons";
import { bidderName } from "../messages";
import "./Market.css";

type OwnerKind = Owner["kind"];

const OWNER_KINDS: OwnerKind[] = ["founder", "sponsor", "corporate", "public", "player", "lender"];
const OWNER_COLOR: Record<OwnerKind, string> = {
  founder: "var(--s3)",
  sponsor: "var(--s4)",
  corporate: "var(--s1)",
  public: "var(--s6)",
  player: "var(--accent)",
  lender: "var(--s5)",
  merged: "var(--muted)",
};
const PHASES = ["expansion", "slowdown", "recession", "recovery"] as const;
const STAGE_TONE = { preparing: "muted", marketing: "warn", bidding: "accent", exclusive: "good" } as const;
const HOME = "US";
/** How long sector research lasts, for the ring. */
const INSIGHT_MONTHS = 12;

function Lock({ size = 13 }: { size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

interface Box {
  id: number;
  label: string;
  note: string;
  value: number;
  color: string;
  active: boolean;
}
interface Placed {
  box: Box;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A squarified treemap. The kit's Treemap slices in a spiral, which turns a
 * sector of fifty similar companies into slivers; this keeps boxes near square.
 * It draws the kit's `.chart.treemap` markup, so the shared styles apply.
 */
function layout(boxes: Box[], width: number, height: number): Placed[] {
  const items = boxes.filter((box) => box.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, box) => sum + box.value, 0);
  const placed: Placed[] = [];
  if (total <= 0) {
    return placed;
  }
  const unit = (width * height) / total;
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let at = 0;
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((acc, area) => acc + area, 0);
    return Math.max(...row.map((area) => Math.max((side * side * area) / (sum * sum), (sum * sum) / (side * side * area))));
  };
  while (at < items.length) {
    const side = Math.min(w, h);
    const row = [items[at].value * unit];
    let end = at + 1;
    while (end < items.length && worst([...row, items[end].value * unit], side) <= worst(row, side)) {
      row.push(items[end].value * unit);
      end += 1;
    }
    const sum = row.reduce((acc, area) => acc + area, 0);
    const thick = sum / side;
    let offset = 0;
    row.forEach((area, index) => {
      const long = area / thick;
      placed.push(
        w >= h
          ? { box: items[at + index], x, y: y + offset, w: thick, h: long }
          : { box: items[at + index], x: x + offset, y, w: long, h: thick },
      );
      offset += long;
    });
    if (w >= h) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
    at = end;
  }
  return placed;
}

const MAP_WIDTH = 100;
const MAP_HEIGHT = 76;

function ShareMap({ boxes, onSelect }: { boxes: Box[]; onSelect(id: number): void }) {
  return (
    <div className="chart treemap share-map">
      {layout(boxes, MAP_WIDTH, MAP_HEIGHT).map(({ box, x, y, w, h }) => (
        <button
          key={box.id}
          type="button"
          data-active={box.active ? "true" : undefined}
          data-big={w > 15 && h > 11 ? "true" : undefined}
          style={{
            left: `${(x / MAP_WIDTH) * 100}%`,
            top: `${(y / MAP_HEIGHT) * 100}%`,
            width: `${(w / MAP_WIDTH) * 100}%`,
            height: `${(h / MAP_HEIGHT) * 100}%`,
            background: box.color,
          }}
          title={`${box.label} · ${box.note}`}
          onClick={() => onSelect(box.id)}
        >
          {w > 9 && h > 7 ? (
            <>
              <span>{box.label}</span>
              {h > 11 ? <b>{box.note}</b> : null}
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function monthsBack(date: GameDate, months: number): GameDate {
  const index = date.year * 12 + (date.month - 1) - months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** A bar that grows left or right of a centre line. */
function SignedBar({ value, span }: { value: number; span: number }) {
  const share = Math.min(Math.abs(value) / (span || 1), 1) * 50;
  return (
    <div className="signed-bar" data-sign={value >= 0 ? "up" : "down"} aria-hidden>
      <span style={value >= 0 ? { left: "50%", width: `${share}%` } : { right: "50%", width: `${share}%` }} />
      <i />
    </div>
  );
}

export function Market() {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const { economy } = view;

  const alive = useMemo(() => view.companies.filter((row) => row.owner.kind !== "merged"), [view.companies]);
  const largest = useMemo(
    () => [...economy.sectors].sort((a, b) => b.revenue - a.revenue)[0]?.id ?? "",
    [economy.sectors],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const sectorId = picked ?? largest;
  /** "" is every country. */
  const [country, setCountry] = useState("");
  const abroadOpen = view.career.rank !== "vice_president";

  const countries = useMemo(() => {
    const byCode = new Map<string, { code: string; count: number; forSale: number; revenue: number }>();
    for (const row of alive) {
      const entry = byCode.get(row.country) ?? { code: row.country, count: 0, forSale: 0, revenue: 0 };
      entry.count += 1;
      entry.forSale += row.sale ? 1 : 0;
      entry.revenue += mid(row.revenue);
      byCode.set(row.country, entry);
    }
    return [...byCode.values()].sort((a, b) => Number(b.code === HOME) - Number(a.code === HOME) || b.count - a.count || a.code.localeCompare(b.code));
  }, [alive]);
  const mostInCountry = Math.max(...countries.map((item) => item.count), 1);

  const inSector = useMemo(
    () =>
      alive
        .filter((row) => row.sector === sectorId && (country === "" || row.country === country))
        .sort((a, b) => mid(b.revenue) - mid(a.revenue)),
    [alive, sectorId, country],
  );
  const sectorRevenue = inSector.reduce((sum, row) => sum + mid(row.revenue), 0) || 1;
  const topShare = inSector.length ? mid(inSector[0].revenue) / sectorRevenue : 1;

  const ownerLabel = (row: CompanyRow) =>
    row.owner.kind === "sponsor"
      ? (view.rivals[row.owner.house] ?? t("owner.sponsor"))
      : row.owner.kind === "founder"
        ? t("owner.founderAge", { age: row.owner.age })
        : t(`owner.${row.owner.kind}`);

  const history = economy.history;
  const xLabels: [string, string] | undefined =
    history.length > 1 ? [f.shortDate(monthsBack(view.date, history.length - 1)), f.shortDate(view.date)] : undefined;
  const spreadAverage = history.length
    ? history.reduce((sum, item) => sum + item.credit_spread_bps, 0) / history.length
    : economy.credit_spread_bps;
  const rateGap = economy.policy_rate_bps - economy.neutral_rate_bps;
  // The kit's LineChart always scales from zero. Rates are drawn above a floor
  // and the index around 100, and the axis labels add the offset back.
  const rateFloor =
    Math.floor(Math.min(...history.flatMap((item) => [item.policy_rate_bps, item.credit_spread_bps]), 0x7fffffff) / 100) * 100;

  const rivals = useMemo(
    () =>
      view.rivals.map((name, house) => {
        const owned = alive.filter((row) => row.owner.kind === "sponsor" && row.owner.house === house);
        const deals = view.messages
          .filter((message) => {
            const buyer =
              message.type === "rival_deal" || message.type === "exit_closed"
                ? message.buyer
                : message.type === "auction_lost"
                  ? message.winner
                  : null;
            return buyer !== null && buyer.kind === "house" && buyer.house === house;
          })
          .sort((a, b) => b.id - a.id);
        return {
          house,
          name,
          standing: view.league.find((entry) => entry.house === house) ?? null,
          owned,
          ev: owned.reduce((sum, row) => sum + mid(row.ev), 0),
          deals,
        };
      }),
    [alive, view.messages, view.rivals, view.league],
  );
  const mostOwned = Math.max(...rivals.map((rival) => rival.owned.length), 1);

  const mix = OWNER_KINDS.map((kind) => ({
    kind,
    count: alive.filter((row) => row.owner.kind === kind).length,
  }));
  const states = useMemo(() => {
    const counts = new Map<string, { admin1: string; country: string; count: number; revenue: number }>();
    for (const row of alive) {
      const key = `${row.country}:${row.admin1}`;
      const entry = counts.get(key) ?? { admin1: row.admin1, country: row.country, count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += mid(row.revenue);
      counts.set(key, entry);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].revenue - a[1].revenue).slice(0, 8);
  }, [alive]);
  const mostInState = states[0]?.[1].count ?? 1;

  const dealEv = (message: Message) =>
    message.type === "rival_deal" || message.type === "auction_lost" || message.type === "exit_closed" ? message.ev : 0;

  return (
    <div className="market stack">
      <header className="page-head">
        <div>
          <h1>{t("market.title")}</h1>
          <p>{t("market.lead")}</p>
        </div>
        <div className="row">
          <Tag>{t("market.universe", { count: alive.length })}</Tag>
          <Tag tone="accent">{t("shell.forSale", { count: view.market.live })}</Tag>
        </div>
      </header>

      <section className="card market-economy">
        <div className="economy-clock">
          <CycleClock
            phases={PHASES.map((id) => ({ id, label: t(`phase.${id}`) }))}
            current={economy.phase}
            progress={Math.min(economy.phase_months / 36, 0.95)}
            size={168}
          />
          <div className="row">
            <Tag tone="accent" icon={<Icon name="clock" size={14} />}>
              {t(`phase.${economy.phase}`)}
            </Tag>
            <span className="muted">{t("market.phaseMonths", { months: economy.phase_months })}</span>
          </div>
        </div>

        <div className="stack">
          <h2 className="card-title">
            <Icon name="market" size={16} />
            {t("market.economy")}
          </h2>
          <div className="grid cols-3">
            <Stat
              label={t("market.policyRate")}
              value={f.pct(economy.policy_rate_bps, 2)}
              delta={t("market.vsNeutral", { gap: f.signedPct(rateGap, 2) })}
              tone={rateGap > 0 ? "warn" : "good"}
              hint={t("market.neutralRate", { rate: f.pct(economy.neutral_rate_bps, 2) })}
            />
            <Stat
              label={t("market.creditSpread")}
              value={f.pct(economy.credit_spread_bps, 2)}
              tone={economy.credit_spread_bps > spreadAverage ? "warn" : "good"}
              hint={t("market.spreadAverage", { rate: f.pct(Math.round(spreadAverage), 2) })}
            />
            <Stat
              label={t("market.valuation")}
              value={f.integer(economy.valuation_index)}
              delta={t(economy.valuation_index >= 100 ? "market.sellersMarket" : "market.buyersMarket")}
              tone={economy.valuation_index >= 100 ? "good" : "warn"}
              hint={t("market.valuationHint")}
            />
          </div>
          <div className="lenders">
            <h3 className="card-title">
              <Icon name="layers" size={16} />
              {t("market.lenders")}
            </h3>
            <div className="grid cols-4">
              <Stat label={t("market.maxSenior")} value={f.multiple(economy.max_senior_millis)} tip={t("market.turns")} />
              <Stat label={t("market.seniorRate")} value={f.pct(economy.senior_rate_bps, 2)} tip={t("market.allIn")} />
              <Stat label={t("market.maxMezz")} value={f.multiple(economy.max_mezz_millis)} tip={t("market.turns")} />
              <Stat label={t("market.mezzRate")} value={f.pct(economy.mezz_rate_bps, 2)} tip={t("market.allIn")} />
            </div>
          </div>
        </div>

        <div className="economy-charts">
          {history.length > 1 ? (
            <>
              <LineChart
                height={120}
                format={(value) => f.pct(value + rateFloor, 1)}
                xLabels={xLabels}
                series={[
                  { label: t("market.policyRate"), values: history.map((item) => item.policy_rate_bps - rateFloor), color: "var(--s1)" },
                  { label: t("market.creditSpread"), values: history.map((item) => item.credit_spread_bps - rateFloor), color: "var(--s2)" },
                ]}
              />
              <LineChart
                height={120}
                format={(value) => f.integer(value + 100)}
                xLabels={xLabels}
                series={[
                  { label: t("market.valuation"), values: history.map((item) => item.valuation_index - 100), color: "var(--s3)" },
                  { label: t("market.normal"), values: history.map(() => 0), color: "var(--muted)" },
                ]}
              />
            </>
          ) : (
            <p className="empty">{t("market.noHistory")}</p>
          )}
        </div>
      </section>

      <section className="stack">
        <h2 className="section-title">
          <Icon name="layers" size={16} />
          {t("market.sectors")}
        </h2>
        <p className="research-hint">
          <Icon name="search" size={14} />
          <span>{t("market.research.hint")}</span>
        </p>
        <div className="sector-grid">
          {economy.sectors.map((sector, index) => {
            const insight = view.insight[index] ?? 0;
            return (
              <div key={sector.id} className="card sector-card" data-active={sector.id === sectorId ? "true" : undefined}>
                <button type="button" className="sector-pick" aria-pressed={sector.id === sectorId} onClick={() => setPicked(sector.id)}>
                  <span className="sector-head">
                    <Icon name={sector.id} size={20} />
                    <strong>{t(`sector.${sector.id}`)}</strong>
                    {sector.for_sale > 0 ? <Tag tone="accent">{t("shell.forSale", { count: sector.for_sale })}</Tag> : null}
                  </span>
                  <span className="sector-cycle" title={`${f.signedPct(-sector.amplitude_bps, 0)} – ${f.signedPct(sector.amplitude_bps, 0)}`}>
                    <span className="row between">
                      <span className="muted">{t("market.sectorCycle")}</span>
                      <b data-tone={sector.cycle_bps >= 0 ? "good" : "bad"}>{f.signedPct(sector.cycle_bps)}</b>
                    </span>
                    <SignedBar value={sector.cycle_bps} span={sector.amplitude_bps} />
                  </span>
                  <span className="sector-stats">
                    <span>
                      <small>{t("market.medianMultiple")}</small>
                      <b>{f.multiple(sector.multiple_millis)}</b>
                    </span>
                    <span>
                      <small>{t("market.companies")}</small>
                      <b>{f.integer(sector.companies)}</b>
                    </span>
                    <span>
                      <small>{t("market.sectorRevenue")}</small>
                      <b>{f.money(sector.revenue)}</b>
                    </span>
                  </span>
                </button>
                <div className="sector-research" data-on={insight > 0 ? "true" : undefined}>
                  {insight > 0 ? (
                    <>
                      <Ring fraction={insight / INSIGHT_MONTHS} size={30} tone="good">
                        {String(insight)}
                      </Ring>
                      <span className="sector-research-text tip" tabIndex={0} data-tip={t("market.research.effect")}>
                        <b>{t("market.research.left", { months: insight })}</b>
                      </span>
                    </>
                  ) : (
                    <>
                      <button {...gate(view.attention.left < 1 && t("gate.attention", { need: 1, left: view.attention.left }))}
                        type="button"
                        className="btn small"
                        disabled={view.attention.left < 1}
                        title={view.attention.left < 1 ? undefined : t("market.research.effect")}
                        onClick={() => game.act({ type: "research_sector", sector: index })}
                      >
                        <Icon name="search" size={13} />
                        {t("market.research.start")}
                        <span className="cost">
                          <i />
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2 className="card-title">
            <Icon name="map" size={16} />
            {t("market.countries")}
          </h2>
          <Tag tone={abroadOpen ? "good" : "warn"} icon={abroadOpen ? <Icon name="check" size={12} /> : <Lock size={12} />}>
            {abroadOpen ? t("market.country.abroadOpen") : t("country.locked")}
          </Tag>
        </div>
        <div className="country-grid">
          {countries.map((item) => {
            const open = item.code === HOME || abroadOpen;
            return (
              <button
                key={item.code}
                type="button"
                className="country-card"
                aria-pressed={country === item.code}
                data-locked={open ? undefined : "true"}
                onClick={() => setCountry(country === item.code ? "" : item.code)}
              >
                <span className="country-head">
                  <strong>{t(`country.${item.code}`)}</strong>
                  {item.code === HOME ? (
                    <Tag tone="accent">{t("market.country.home")}</Tag>
                  ) : open ? (
                    <Tag tone="good">{t("market.country.open")}</Tag>
                  ) : (
                    <Tag tone="muted" icon={<Lock size={11} />}>
                      {t("market.country.closed")}
                    </Tag>
                  )}
                </span>
                <span className="share-bar">
                  <span style={{ width: `${(item.count / mostInCountry) * 100}%` }} />
                </span>
                <span className="country-stats">
                  <span>
                    <small>{t("market.companies")}</small>
                    <b>{f.integer(item.count)}</b>
                  </span>
                  <span>
                    <small>{t("market.sale")}</small>
                    <b data-tone={item.forSale > 0 ? "accent" : undefined}>{f.integer(item.forSale)}</b>
                  </span>
                  <span>
                    <small>{t("term.revenue")}</small>
                    <b>{f.money(Math.round(item.revenue))}</b>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="muted">{t("market.country.note")}</p>
      </section>

      <section className="card stack">
        <div className="row between holders-head">
          <h2 className="card-title">
            <Icon name={sectorId} size={16} />
            {t("market.holders", { sector: t(`sector.${sectorId}`) })}
          </h2>
          <select className="country-filter" value={country} onChange={(event) => setCountry(event.target.value)} aria-label={t("market.country.filter")}>
            <option value="">{t("market.country.all")}</option>
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code === HOME ? t("market.country.homeOption", { country: t(`country.${item.code}`) }) : t(`country.${item.code}`)}
              </option>
            ))}
          </select>
          <ul className="owner-legend">
            {OWNER_KINDS.map((kind) => (
              <li key={kind}>
                <i style={{ background: OWNER_COLOR[kind] }} />
                {t(`owner.${kind}`)}
              </li>
            ))}
          </ul>
        </div>
        {inSector.length === 0 ? <p className="empty">{t("market.country.empty")}</p> : null}
        <div className="holders" hidden={inSector.length === 0}>
          <div className="stack">
            <ShareMap
              boxes={inSector.map((row) => ({
                id: row.i,
                label: row.name,
                value: mid(row.revenue),
                note: f.pct(Math.round((mid(row.revenue) / sectorRevenue) * 10000)),
                color: OWNER_COLOR[row.owner.kind],
                active: row.i === game.selected,
              }))}
              onSelect={game.select}
            />
            <p className="muted">
              {t("market.treemapNote", { count: inSector.length })}
            </p>
          </div>
          <div className="holders-table">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">{t("market.rank")}</th>
                  <th>{t("market.company")}</th>
                  <th>{t("term.owner")}</th>
                  <th className="num">{t("term.revenue")}</th>
                  <th>{t("market.share")}</th>
                  <th>{t("market.sale")}</th>
                </tr>
              </thead>
              <tbody>
                {inSector.map((row, index) => {
                  const share = mid(row.revenue) / sectorRevenue;
                  return (
                    <tr
                      key={row.i}
                      aria-selected={row.i === game.selected}
                      data-own={row.held ? "true" : undefined}
                      onClick={() => game.select(row.i)}
                    >
                      <td className="num muted holder-rank">{index + 1}</td>
                      <td className="name">
                        <button type="button" className="row-link" onClick={() => game.select(row.i)}>
                          {row.name}
                        </button>
                        <span className="sub">
                          {row.country === HOME ? t(`admin1.${row.admin1}`) : `${t(`admin1.${row.admin1}`)} · ${t(`country.${row.country}`)}`}
                        </span>
                      </td>
                      <td className="holder-owner">
                        <span className="owner-cell">
                          <i style={{ background: OWNER_COLOR[row.owner.kind] }} />
                          {ownerLabel(row)}
                        </span>
                      </td>
                      <td className="num holder-revenue">{f.figure(row.revenue)}</td>
                      <td className="holder-share">
                        <span className="share-cell">
                          <span className="share-bar">
                            <span
                              style={{ width: `${(share / topShare) * 100}%`, background: OWNER_COLOR[row.owner.kind] }}
                            />
                          </span>
                          <b>{f.pct(Math.round(share * 10000))}</b>
                        </span>
                      </td>
                      <td className="holder-sale">
                        {row.sale ? (
                          <Tag tone={STAGE_TONE[row.sale.stage]}>{t(`stage.${row.sale.stage}`)}</Tag>
                        ) : row.exiting ? (
                          <Tag tone="accent">{t("market.exiting")}</Tag>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2 className="card-title">
            <Icon name="gavel" size={16} />
            {t("market.rivals")}
          </h2>
          <button type="button" className="btn small" onClick={() => game.go("league")}>
            <Icon name="flag" size={13} />
            {t("market.toLeague")}
          </button>
        </div>
        <table className="table rivals-table">
          <thead>
            <tr>
              <th className="num">{t("market.rank")}</th>
              <th>{t("market.house")}</th>
              <th>{t("market.holdings")}</th>
              <th className="num">{t("market.holdingsEv")}</th>
              <th className="num">{t("market.grossMultiple")}</th>
              <th>{t("market.lastDeal")}</th>
            </tr>
          </thead>
          <tbody>
            {[...rivals]
              .sort((a, b) => (a.standing?.rank ?? 99) - (b.standing?.rank ?? 99))
              .map((rival) => {
              const last = rival.deals[0];
              return (
                <tr key={rival.house}>
                  <td className="num muted rival-rank">{rival.standing ? f.integer(rival.standing.rank) : "–"}</td>
                  <td className="name">{rival.name}</td>
                  <td className="rival-holdings" data-label={t("market.holdings")}>
                    <span className="share-cell">
                      <span className="share-bar">
                        <span style={{ width: `${(rival.owned.length / mostOwned) * 100}%`, background: OWNER_COLOR.sponsor }} />
                      </span>
                      <b>{f.integer(rival.owned.length)}</b>
                    </span>
                  </td>
                  <td className="num rival-ev" data-label={t("market.holdingsEv")}>{rival.owned.length ? f.money(Math.round(rival.ev)) : t("term.none")}</td>
                  <td className="num rival-multiple" data-label={t("market.grossMultiple")}>
                    {rival.standing && rival.standing.invested > 0 ? (
                      <b data-tone={rival.standing.multiple_millis >= 1000 ? "good" : "bad"}>{f.multiple(rival.standing.multiple_millis, 2)}</b>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="rival-last" data-label={t("market.lastDeal")}>
                    {last ? (
                      <button type="button" className="deal-chip" onClick={() => last.company !== null && game.select(last.company)}>
                        <Icon name={last.type === "auction_lost" ? "alert" : "gavel"} size={13} />
                        <span>{last.company === null ? "" : (game.rows.get(last.company)?.name ?? "")}</span>
                        <b>{f.money(dealEv(last))}</b>
                        <small>{f.shortDate(last.date)}</small>
                      </button>
                    ) : (
                      <span className="muted">{t("term.none")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">{t("market.rivalsNote", { us: bidderName(t, view, { kind: "player" }) })}</p>
      </section>

      <section className="grid cols-2">
        <div className="card stack">
          <h2 className="card-title">
            <Icon name="handshake" size={16} />
            {t("market.ownership")}
          </h2>
          <StackBar
            title={t("market.ownershipTitle")}
            total={t("market.universe", { count: alive.length })}
            parts={mix.map((item) => ({
              label: t(`owner.${item.kind}`),
              value: item.count,
              color: OWNER_COLOR[item.kind],
              note: f.integer(item.count),
            }))}
          />
          <div className="grid auto">
            {mix.map((item) => (
              <Stat
                key={item.kind}
                label={t(`owner.${item.kind}`)}
                value={f.pct(Math.round((item.count / (alive.length || 1)) * 10000), 0)}
              />
            ))}
          </div>
        </div>
        <div className="card stack">
          <h2 className="card-title">
            <Icon name="map" size={16} />
            {t("market.states")}
          </h2>
          <ol className="state-rank">
            {states.map(([key, entry], index) => (
              <li key={key}>
                <span className="muted">{index + 1}</span>
                <span>
                  {t(`admin1.${entry.admin1}`)}
                  {entry.country === HOME ? null : <small className="muted">{` · ${t(`country.${entry.country}`)}`}</small>}
                </span>
                <span className="share-bar">
                  <span style={{ width: `${(entry.count / mostInState) * 100}%` }} />
                </span>
                <b>{f.integer(entry.count)}</b>
                <small className="muted">{f.money(Math.round(entry.revenue))}</small>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
