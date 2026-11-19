import { useMemo } from "react";
import { useT } from "../../i18n/useT";
import type { Message } from "../../sim/types";
import { Meter, Stat, Tag } from "../charts";
import { mid, useFormat } from "../format";
import { useGame } from "../game";
import { Icon } from "../icons";
import { bidderName } from "../messages";
import "./League.css";

/**
 * How each rival house bids. Fixed sim constants, copied for display only:
 * see `HOUSE_STYLES` in crates/sim-core/src/market.rs (index = house number).
 * EBITDA bounds are thousand USD; `maxEbitda` null means no ceiling.
 */
const HOUSE_STYLES: { aggressionBps: number; focus: string | null; minEbitda: number; maxEbitda: number | null }[] = [
  { aggressionBps: -150, focus: "industrial_components", minEbitda: 12_000, maxEbitda: null },
  { aggressionBps: 150, focus: "healthcare_services", minEbitda: 6_000, maxEbitda: null },
  { aggressionBps: 0, focus: "cold_chain_logistics", minEbitda: 3_000, maxEbitda: 40_000 },
  { aggressionBps: 350, focus: null, minEbitda: 8_000, maxEbitda: null },
  { aggressionBps: -300, focus: "building_products", minEbitda: 0, maxEbitda: 15_000 },
  { aggressionBps: 200, focus: "business_services", minEbitda: 3_000, maxEbitda: 30_000 },
  { aggressionBps: -50, focus: "food_manufacturing", minEbitda: 4_000, maxEbitda: 50_000 },
  { aggressionBps: 50, focus: null, minEbitda: 0, maxEbitda: 12_000 },
];
/** The bid bias in a focus sector, from the same file. */
const FOCUS_BPS = 350;
/** Half-width of the aggression meter. */
const AGGRESSION_SPAN = 400;
const DEALS_SHOWN = 4;

type Band = "top" | "mid" | "bottom";
type DealKind = "bought" | "beat_us" | "bought_ours";

interface HouseDeal {
  message: Message;
  kind: DealKind;
  ev: number;
}

function bandOf(rank: number, houses: number): Band {
  const quarter = Math.max(Math.floor(houses / 4), 1);
  return rank <= quarter ? "top" : rank > houses - quarter ? "bottom" : "mid";
}

/** The house a message credits with a purchase, if any. */
function houseDeal(message: Message): { house: number; deal: HouseDeal } | null {
  if (message.type === "rival_deal" && message.buyer.kind === "house") {
    return { house: message.buyer.house, deal: { message, kind: "bought", ev: message.ev } };
  }
  if (message.type === "auction_lost" && message.winner.kind === "house") {
    return { house: message.winner.house, deal: { message, kind: "beat_us", ev: message.ev } };
  }
  if (message.type === "exit_closed" && message.buyer.kind === "house") {
    return { house: message.buyer.house, deal: { message, kind: "bought_ours", ev: message.ev } };
  }
  return null;
}

export function League() {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;

  const houses = view.league.length;
  const mine = view.league.find((row) => row.house === null) ?? null;
  const myBand = mine ? bandOf(mine.rank, houses) : "mid";
  const best = Math.max(...view.league.map((row) => row.multiple_millis), 2000);
  const bandTone = (band: Band) => (band === "top" ? "good" : band === "bottom" ? "bad" : "muted");

  const books = useMemo(() => {
    const list = view.rivals.map(() => ({ count: 0, ev: 0 }));
    for (const row of view.companies) {
      if (row.owner.kind === "sponsor" && list[row.owner.house]) {
        list[row.owner.house].count += 1;
        list[row.owner.house].ev += mid(row.ev);
      }
    }
    return list;
  }, [view.companies, view.rivals]);

  const deals = useMemo(() => {
    const list: HouseDeal[][] = view.rivals.map(() => []);
    for (const message of [...view.messages].sort((a, b) => b.id - a.id)) {
      const hit = houseDeal(message);
      if (hit && list[hit.house]) {
        list[hit.house].push(hit.deal);
      }
    }
    return list;
  }, [view.messages, view.rivals]);

  const losses = useMemo(() => {
    const lost = view.messages.filter(
      (message): message is Extract<Message, { type: "auction_lost" }> => message.type === "auction_lost",
    );
    const byWinner = new Map<string, { name: string; house: number | null; count: number; ev: number }>();
    for (const message of lost) {
      const key = message.winner.kind === "house" ? `house-${message.winner.house}` : message.winner.kind;
      const entry = byWinner.get(key) ?? {
        name: bidderName(t, view, message.winner),
        house: message.winner.kind === "house" ? message.winner.house : null,
        count: 0,
        ev: 0,
      };
      entry.count += 1;
      entry.ev += message.ev;
      byWinner.set(key, entry);
    }
    return { total: lost.length, rows: [...byWinner.values()].sort((a, b) => b.count - a.count) };
  }, [view, t]);
  const mostLost = Math.max(...losses.rows.map((row) => row.count), 1);

  const rankOf = (house: number) => view.league.find((row) => row.house === house) ?? null;
  const band = (style: (typeof HOUSE_STYLES)[number]) =>
    style.maxEbitda === null
      ? t("league.band.from", { min: f.money(style.minEbitda) })
      : style.minEbitda === 0
        ? t("league.band.to", { max: f.money(style.maxEbitda) })
        : t("league.band.between", { min: f.money(style.minEbitda), max: f.money(style.maxEbitda) });
  const companyName = (message: Message) =>
    message.company === null ? "" : (game.rows.get(message.company)?.name ?? "");

  return (
    <div className="league stack">
      <header className="page-head">
        <div>
          <h1>{t("league.title")}</h1>
          <p>{t("league.lead")}</p>
        </div>
        {mine ? (
          <div className="league-standing" data-band={myBand}>
            <strong>{t("league.rankOf", { rank: mine.rank, total: houses })}</strong>
            <span>{t(`league.band.${myBand}`)}</span>
          </div>
        ) : null}
      </header>

      <section className="card stack">
        <div className="row between">
          <h2 className="card-title">
            <Icon name="table" size={16} />
            {t("league.table")}
          </h2>
          <ul className="league-legend">
            <li>
              <i data-band="top" />
              {t("league.band.top")}
            </li>
            <li>
              <i data-band="bottom" />
              {t("league.band.bottom")}
            </li>
            <li>
              <i data-kind="par" />
              {t("league.par")}
            </li>
          </ul>
        </div>
        <table className="table league-table">
          <thead>
            <tr>
              <th>{t("league.col.rank")}</th>
              <th>{t("league.col.house")}</th>
              <th className="league-multiple">{t("league.col.multiple")}</th>
              <th className="num">{t("league.col.invested")}</th>
              <th className="num">{t("league.col.returned")}</th>
              <th className="num">{t("league.col.held")}</th>
              <th className="num">{t("league.col.deals")}</th>
              <th className="num">{t("league.col.exits")}</th>
            </tr>
          </thead>
          <tbody>
            {view.league.map((row) => {
              const me = row.house === null;
              const style = row.house === null ? null : HOUSE_STYLES[row.house];
              return (
                <tr key={row.house ?? "me"} data-band={bandOf(row.rank, houses)} data-me={me}>
                  <td>
                    <span className="medal" data-rank={row.rank <= 3 ? row.rank : undefined}>
                      {f.integer(row.rank)}
                    </span>
                  </td>
                  <td className="name">
                    {me ? t(`app.house.${view.house}`) : (view.rivals[row.house ?? 0] ?? "")}
                    {me ? (
                      <Tag tone="accent">{t("league.me")}</Tag>
                    ) : style?.focus ? (
                      <span className="sub">{t(`sector.${style.focus}`)}</span>
                    ) : (
                      <span className="sub">{t("league.generalist")}</span>
                    )}
                  </td>
                  <td className="league-multiple">
                    {row.invested > 0 ? (
                      <Meter
                        value={row.multiple_millis}
                        max={best}
                        marker={1000}
                        tone={me ? "accent" : row.multiple_millis >= 1000 ? "ink" : "bad"}
                        text={f.multiple(row.multiple_millis, 2)}
                      />
                    ) : (
                      <span className="muted">{t("league.noCapital")}</span>
                    )}
                  </td>
                  <td className="num">{f.money(row.invested)}</td>
                  <td className="num">{f.money(row.returned)}</td>
                  <td className="num">{f.money(row.held)}</td>
                  <td className="num">{f.integer(row.deals)}</td>
                  <td className="num">{f.integer(row.exits)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">{t("league.measure")}</p>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2 className="card-title">
            <Icon name="gavel" size={16} />
            {t("league.h2h")}
          </h2>
          <Tag tone={losses.total ? "warn" : "muted"}>{t("league.h2h.total", { count: losses.total })}</Tag>
        </div>
        {losses.rows.length ? (
          <ul className="h2h">
            {losses.rows.map((row) => (
              <li key={row.name}>
                <Meter
                  label={row.name}
                  text={t("league.h2h.count", { count: row.count })}
                  value={row.count}
                  max={mostLost}
                  tone="bad"
                />
                <small>{t("league.h2h.ev", { amount: f.money(row.ev) })}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("league.h2h.none")}</p>
        )}
      </section>

      <section className="stack">
        <h2 className="card-title">
          <Icon name="flag" size={16} />
          {t("league.houses")}
        </h2>
        <div className="league-houses">
          {view.rivals.map((name, house) => {
            const style = HOUSE_STYLES[house];
            if (!style) {
              return null;
            }
            const standing = rankOf(house);
            const book = books[house];
            const list = deals[house].slice(0, DEALS_SHOWN);
            const tone = style.aggressionBps >= 150 ? "bad" : style.aggressionBps <= -150 ? "good" : "muted";
            const half = (Math.min(Math.abs(style.aggressionBps), AGGRESSION_SPAN) / AGGRESSION_SPAN) * 50;
            return (
              <article key={name} className="card stack house-card">
                <div className="row between">
                  <h3>{name}</h3>
                  {standing ? (
                    <Tag tone={bandTone(bandOf(standing.rank, houses))}>
                      {t("league.rankTag", { rank: standing.rank })}
                      {standing.invested > 0 ? ` · ${f.multiple(standing.multiple_millis, 2)}` : ""}
                    </Tag>
                  ) : null}
                </div>
                <p className="house-style">{t(`league.house.${house}.style`)}</p>
                <div className="row">
                  <Tag tone="accent" icon={<Icon name={style.focus ?? "layers"} size={14} />}>
                    {style.focus ? t(`sector.${style.focus}`) : t("league.generalist")}
                  </Tag>
                  <Tag>{band(style)}</Tag>
                </div>
                <div className="aggression" data-tone={tone}>
                  <div className="meter-head">
                    <span>{t("league.aggression")}</span>
                    <b>{f.signedPct(style.aggressionBps)}</b>
                  </div>
                  <div className="aggression-track" aria-hidden>
                    <span
                      style={
                        style.aggressionBps >= 0 ? { left: "50%", width: `${half}%` } : { right: "50%", width: `${half}%` }
                      }
                    />
                    <i />
                  </div>
                  <div className="aggression-ends">
                    <small>{t("league.aggression.low")}</small>
                    <small>
                      {style.focus ? t("league.focusBonus", { bonus: f.signedPct(FOCUS_BPS) }) : t("league.aggression.note")}
                    </small>
                    <small>{t("league.aggression.high")}</small>
                  </div>
                </div>
                <div className="grid cols-2">
                  <Stat label={t("league.holds")} value={t("league.holdsCount", { count: book.count })} />
                  <Stat label={t("term.ev")} value={t("league.about", { amount: f.money(Math.round(book.ev)) })} />
                </div>
                <div className="stack house-deals">
                  <span className="muted">{t("league.recent")}</span>
                  {list.length ? (
                    <ul>
                      {list.map((deal) => {
                        const company = companyName(deal.message);
                        const body = (
                          <>
                            <Icon name={deal.kind === "bought_ours" ? "exit" : "gavel"} size={14} />
                            <b>{company || t(`league.deal.${deal.kind}`)}</b>
                            <span>{f.money(deal.ev)}</span>
                            <small>
                              {f.shortDate(deal.message.date)}
                              {deal.kind === "bought" ? "" : ` · ${t(`league.deal.${deal.kind}`)}`}
                            </small>
                          </>
                        );
                        return (
                          <li key={deal.message.id}>
                            {deal.message.company !== null ? (
                              <button
                                type="button"
                                className="deal-chip"
                                data-kind={deal.kind}
                                onClick={() => game.select(deal.message.company)}
                              >
                                {body}
                              </button>
                            ) : (
                              <span className="deal-chip" data-kind={deal.kind}>
                                {body}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="muted">{t("league.noDeals")}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
