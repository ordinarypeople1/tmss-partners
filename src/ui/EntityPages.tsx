import { useState } from "react";
import { useT } from "../i18n/useT";
import type { CompanyRow, Message } from "../sim/types";
import { BankerTalk } from "./BankerTalk";
import { Meter, Stat, Tag } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { gate } from "./Gate";
import { Icon } from "./icons";
import { EntityLink, RichMessage } from "./Links";
import { describeMessage } from "./messages";
import { Portrait } from "./Portrait";
import "./EntityPages.css";

/** How many recent messages a page lists. */
const NEWS_SHOWN = 8;

/** The page's head: what it is, its name, a close that goes back. */
function PageHead({ kicker, name, children }: { kicker: string; name: string; children?: React.ReactNode }) {
  const t = useT();
  const game = useGame();
  return (
    <header className="ep-head">
      <div className="ep-title">
        <span className="ep-kicker">{kicker}</span>
        <h2>{name}</h2>
      </div>
      <button type="button" className="cp-icon-btn" aria-label={t("action.close")} title={t("action.close")} onClick={() => game.select(null)}>
        <Icon name="close" />
      </button>
      {children ? <div className="ep-tags">{children}</div> : null}
    </header>
  );
}

/** Companies as a list of links, each with a short note. */
function CompanyList({ rows, note, empty }: { rows: CompanyRow[]; note: (row: CompanyRow) => string; empty: string }) {
  const t = useT();
  if (rows.length === 0) {
    return <p className="muted">{empty}</p>;
  }
  return (
    <ul className="ep-list">
      {rows.map((row) => (
        <li key={row.i}>
          <Icon name={row.sector} size={15} />
          <EntityLink page={{ kind: "company", id: row.i }}>{row.short}</EntityLink>
          <span className="muted">{t(`sector.${row.sector}`)}</span>
          <span className="ep-note">{note(row)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The latest messages about this house or bank, names linked. */
function News({ messages }: { messages: Message[] }) {
  const t = useT();
  const f = useFormat();
  const { view } = useGame();
  if (messages.length === 0) {
    return <p className="muted">{t("entity.news.none")}</p>;
  }
  return (
    <ul className="ep-news">
      {messages
        .slice(-NEWS_SHOWN)
        .reverse()
        .map((message) => {
          const text = describeMessage(t, f, view, message);
          return (
            <li key={message.id} data-tone={text.tone}>
              <Icon name={text.icon} size={14} />
              <small className="muted">{f.date(message.date)}</small>
              <span>
                <RichMessage text={text} part="title" />
              </span>
            </li>
          );
        })}
    </ul>
  );
}

const mentions = (message: Message, house: number) =>
  ("house" in message && message.house === house) ||
  ("buyer" in message && message.buyer?.kind === "house" && message.buyer.house === house) ||
  ("winner" in message && message.winner?.kind === "house" && message.winner.house === house);

/** A rival house: how it bids, how it is doing, what it owns and what it is after. */
export function HousePage({ house }: { house: number }) {
  const t = useT();
  const f = useFormat();
  const { view } = useGame();
  const name = view.rivals[house];
  const style = view.houses[house];
  if (!name || !style) {
    return null;
  }
  const rank = view.league.findIndex((row) => row.house === house);
  const row = rank >= 0 ? view.league[rank] : null;
  const owned = view.companies.filter((item) => item.owner.kind === "sponsor" && item.owner.house === house);
  const courting = view.companies.filter(
    (item) =>
      item.suitor?.house === house || item.sale?.rivals.some((bidder) => bidder.kind === "house" && bidder.house === house),
  );
  const band =
    style.max_ebitda === null
      ? t("league.band.from", { min: f.money(style.min_ebitda) })
      : style.min_ebitda === 0
        ? t("league.band.to", { max: f.money(style.max_ebitda) })
        : t("league.band.between", { min: f.money(style.min_ebitda), max: f.money(style.max_ebitda) });
  const bidding = style.aggression_bps >= 150 ? "high" : style.aggression_bps <= -150 ? "low" : "fair";
  return (
    <article className="ep">
      <PageHead kicker={t("entity.house")} name={name}>
        <Tag tone="accent" icon={<Icon name={style.focus ?? "layers"} size={13} />}>
          {style.focus ? t(`sector.${style.focus}`) : t("league.generalist")}
        </Tag>
        <Tag>{band}</Tag>
        <Tag tone={bidding === "high" ? "bad" : bidding === "low" ? "good" : "muted"}>
          {t(`entity.house.bidding.${bidding}`, { pct: f.signedPct(style.aggression_bps) })}
        </Tag>
        {style.mood_months > 0 && style.mood_bps !== 0 ? (
          <Tag tone="warn" icon={<Icon name="clock" size={12} />}>
            {t(style.mood_bps > 0 ? "entity.house.mood.up" : "entity.house.mood.down", { months: style.mood_months })}
          </Tag>
        ) : null}
      </PageHead>
      <div className="ep-body">
        <section className="card">
          <p>{t(`league.house.${house}.style`)}</p>
          {row ? (
            <div className="ep-stats">
              <Stat label={t("league.col.rank")} value={t("league.rankOf", { rank: rank + 1, total: view.league.length })} />
              <Stat label={t("league.col.multiple")} value={row.invested > 0 ? f.multiple(row.multiple_millis, 2) : t("league.noCapital")} />
              <Stat label={t("league.col.deals")} value={f.integer(row.deals)} />
              <Stat label={t("league.col.exits")} value={f.integer(row.exits)} />
              <Stat label={t("league.col.invested")} value={f.money(row.invested)} />
              <Stat label={t("league.col.held")} value={f.money(row.held)} />
            </div>
          ) : null}
        </section>
        <section className="card">
          <h3>
            <Icon name="portfolio" size={14} />
            {t("entity.house.owns", { count: owned.length })}
          </h3>
          <CompanyList
            rows={owned}
            note={(item) => (item.owner.kind === "sponsor" ? t("entity.house.held", { months: item.owner.months_held }) : "")}
            empty={t("entity.house.ownsNone")}
          />
        </section>
        <section className="card">
          <h3>
            <Icon name="flag" size={14} />
            {t("entity.house.after")}
          </h3>
          <CompanyList
            rows={courting}
            note={(item) => (item.suitor?.house === house ? t("entity.house.suitor") : item.sale ? t(`stage.${item.sale.stage}`) : "")}
            empty={t("entity.house.afterNone")}
          />
        </section>
        <section className="card">
          <h3>
            <Icon name="inbox" size={14} />
            {t("entity.news")}
          </h3>
          <News messages={view.messages.filter((message) => mentions(message, house))} />
        </section>
      </div>
    </article>
  );
}

/** A sell-side bank: who covers the fund there, how well it knows the fund, what it is selling. */
export function AdviserPage({ adviser }: { adviser: number }) {
  const t = useT();
  const game = useGame();
  const { view } = game;
  const bank = view.advisers[adviser];
  const [talking, setTalking] = useState(false);
  if (!bank) {
    return null;
  }
  const [list, favour, headsUp] = view.coverage_marks;
  const mandates = view.companies.filter((item) => item.sale?.adviser === adviser);
  const next = [list, favour, headsUp].find((mark) => bank.coverage < mark);
  return (
    <article className="ep">
      {talking && view.cover_talk ? <BankerTalk talk={view.cover_talk} onClose={() => setTalking(false)} /> : null}
      <PageHead kicker={t("entity.adviser")} name={bank.name}>
        <Tag tone="muted">{t(`tier.${bank.tier}`)}</Tag>
        {bank.focus ? (
          <Tag tone="accent" icon={<Icon name={bank.focus} size={13} />}>
            {t(`sector.${bank.focus}`)}
          </Tag>
        ) : (
          <Tag>{t("league.generalist")}</Tag>
        )}
      </PageHead>
      <div className="ep-body">
        <section className="card ep-banker">
          <Portrait seed={bank.banker.name} feminine={bank.banker.feminine} country="US" size={88} />
          <div className="stack">
            <div>
              <b>{bank.banker.name}</b>
              <small className="muted"> {t("cover.role", { bank: bank.name })}</small>
            </div>
            <Meter
              value={bank.coverage}
              max={100}
              markers={[list, favour, headsUp]}
              tone={bank.coverage >= headsUp ? "good" : bank.coverage >= list ? "accent" : "ink"}
              text={String(bank.coverage)}
              label={t("banks.coverage")}
            />
            <small className="muted">
              {next === undefined
                ? t("entity.adviser.top")
                : t("entity.adviser.next", {
                    at: next,
                    what: t(`banks.mark.${next === list ? "list" : next === favour ? "favour" : "headsUp"}`),
                  })}
            </small>
            <button
              {...gate(view.attention.left < 1 && t("gate.attention", { need: 1, left: view.attention.left }))}
              type="button"
              className="btn"
              disabled={view.attention.left < 1}
              onClick={() => {
                if (game.act({ type: "cover_bank", adviser })) {
                  setTalking(true);
                }
              }}
            >
              <Icon name="meet" size={14} />
              {t("banks.call")}
              <span className="journey-cost">
                <Icon name="bolt" size={11} />1
              </span>
            </button>
          </div>
        </section>
        <section className="card">
          <h3>
            <Icon name="deals" size={14} />
            {t("entity.adviser.mandates", { count: mandates.length })}
          </h3>
          <CompanyList
            rows={mandates}
            note={(item) => (item.sale ? t(`stage.${item.sale.stage}`) : "")}
            empty={t("entity.adviser.mandatesNone")}
          />
        </section>
        <section className="card">
          <h3>
            <Icon name="inbox" size={14} />
            {t("entity.news")}
          </h3>
          <News messages={view.messages.filter((message) => "adviser" in message && message.adviser === adviser)} />
        </section>
      </div>
    </article>
  );
}
