import { useState } from "react";
import { useT } from "../i18n/useT";
import type { CompanyRow, CompanyView, Concern, Message } from "../sim/types";
import { BankerTalk } from "./BankerTalk";
import { Meter, Stat, Tag } from "./charts";
import { useFormat } from "./format";
import { useGame, type PersonRole } from "./game";
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
              <b>
                <EntityLink page={{ kind: "person", role: "banker", id: adviser }}>{bank.banker.name}</EntityLink>
              </b>
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

/** What each seat on the committee asks about, as in deal.rs `committee_votes`. */
const SEAT_CONCERNS: Concern[][] = [
  ["leverage", "price", "interest_cover", "no_financial_dd", "no_protection"],
  ["no_operational_dd", "inventory_days"],
  ["thin_returns", "multiple_reliance", "no_commercial_dd"],
  ["downside", "no_legal_dd", "open_issue"],
  ["no_plan", "no_operational_dd", "layoffs_in_union_shop"],
  ["fund_concentration", "layoffs_in_union_shop", "open_issue"],
];
const TRUST_HIGH = 70;
const TRUST_LOW = 30;

/** One fact about a person: a label and its value. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ep-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A person's page: who they are, where they sit, and what they mean to the fund. */
export function PersonPage({ role, id }: { role: PersonRole; id: number }) {
  if (role === "partner") {
    return <PartnerPerson seat={id} />;
  }
  if (role === "banker") {
    return <BankerPerson adviser={id} />;
  }
  return <CompanyPerson role={role} company={id} />;
}

function CompanyPerson({ role, company }: { role: "ceo" | "executive"; company: number }) {
  const t = useT();
  const game = useGame();
  const detail: CompanyView | null = game.peek(company);
  if (!detail) {
    return null;
  }
  const link = <EntityLink page={{ kind: "company", id: company }}>{detail.short}</EntityLink>;
  if (role === "executive") {
    const executive = detail.executive;
    return (
      <article className="ep">
        <PageHead kicker={t("entity.person")} name={executive.name}>
          <Tag>{t(`talk.exec.role.${executive.role}`)}</Tag>
        </PageHead>
        <div className="ep-body">
          <section className="card ep-banker">
            <Portrait seed={executive.name} feminine={executive.feminine} country={detail.country} size={88} />
            <dl className="ep-facts">
              <Fact label={t("entity.person.at")}>{link}</Fact>
              <Fact label={t("entity.person.title")}>{t(`talk.exec.role.${executive.role}`)}</Fact>
            </dl>
          </section>
          <p className="muted">{t("entity.person.executive.note", { at: detail.approach.known_at })}</p>
        </div>
      </article>
    );
  }
  const ceo = detail.ceo;
  const founderOwned = detail.owner.kind === "founder";
  return (
    <article className="ep">
      <PageHead kicker={t("entity.person")} name={ceo.name}>
        <Tag>{t(ceo.founder ? "entity.person.founder" : "entity.person.ceo")}</Tag>
        {ceo.style ? <Tag tone="accent">{t(`ceo_style.${ceo.style}`)}</Tag> : null}
        {founderOwned && detail.stance ? <Tag>{t(`seller_stance.${detail.stance}`)}</Tag> : null}
      </PageHead>
      <div className="ep-body">
        <section className="card ep-banker">
          <Portrait seed={ceo.name} feminine={ceo.feminine} country={detail.country} size={88} />
          <div className="stack">
            <dl className="ep-facts">
              <Fact label={t("entity.person.at")}>{link}</Fact>
              <Fact label={t("entity.person.age")}>{t("entity.person.ageValue", { age: ceo.age })}</Fact>
              <Fact label={t("entity.person.tenure")}>{t("entity.person.years", { years: ceo.tenure })}</Fact>
            </dl>
            {ceo.style ? <p>{t(`story.style.${ceo.style}`, { name: ceo.name })}</p> : <p className="muted">{t("entity.person.styleUnknown")}</p>}
          </div>
        </section>
        <section className="card">
          <h3>
            <Icon name="handshake" size={14} />
            {t("entity.person.relationship")}
          </h3>
          <Meter
            value={detail.relationship}
            max={100}
            markers={[detail.approach.known_at, detail.approach.early_notice_at, detail.approach.proposal_at]}
            tone={detail.relationship >= detail.approach.proposal_at ? "good" : "accent"}
            text={String(detail.relationship)}
            label={t(`access.${detail.access}`)}
          />
          <p className="muted">{t("entity.person.meetHint")}</p>
        </section>
      </div>
    </article>
  );
}

function BankerPerson({ adviser }: { adviser: number }) {
  const t = useT();
  const { view } = useGame();
  const bank = view.advisers[adviser];
  if (!bank) {
    return null;
  }
  const [list, favour, headsUp] = view.coverage_marks;
  return (
    <article className="ep">
      <PageHead kicker={t("entity.person")} name={bank.banker.name}>
        <Tag>{t("cover.role", { bank: bank.name })}</Tag>
      </PageHead>
      <div className="ep-body">
        <section className="card ep-banker">
          <Portrait seed={bank.banker.name} feminine={bank.banker.feminine} country="US" size={88} />
          <div className="stack">
            <dl className="ep-facts">
              <Fact label={t("entity.person.at")}>
                <EntityLink page={{ kind: "adviser", id: adviser }}>{bank.name}</EntityLink>
              </Fact>
              <Fact label={t("entity.person.title")}>{t("cover.role", { bank: bank.name })}</Fact>
            </dl>
            <Meter value={bank.coverage} max={100} markers={[list, favour, headsUp]} tone={bank.coverage >= headsUp ? "good" : "accent"} text={String(bank.coverage)} label={t("banks.coverage")} />
            <p className="muted">{t("entity.person.banker.note")}</p>
          </div>
        </section>
      </div>
    </article>
  );
}

function PartnerPerson({ seat }: { seat: number }) {
  const t = useT();
  const game = useGame();
  const { view } = game;
  const trust = view.partners[seat]?.trust ?? 50;
  // Live committees: how this partner voted on each deal the fund is working.
  const votes = view.companies
    .filter((row) => row.in_deal)
    .map((row) => ({ row, vote: game.peek(row.i)?.deal?.committee?.votes.find((item) => item.partner === seat) ?? null }))
    .filter((item) => item.vote !== null);
  return (
    <article className="ep">
      <PageHead kicker={t("entity.partner")} name={t(`partner.${seat}.name`)}>
        <Tag tone="accent">{t(`partner.${seat}.role`)}</Tag>
      </PageHead>
      <div className="ep-body">
        <section className="card ep-banker">
          <Portrait partner={seat} size={88} />
          <div className="stack">
            <p>{t(`partner.${seat}.bio`)}</p>
            <Meter
              value={trust}
              max={100}
              markers={[TRUST_LOW, TRUST_HIGH]}
              tone={trust >= TRUST_HIGH ? "good" : trust <= TRUST_LOW ? "bad" : "ink"}
              text={String(trust)}
              label={t("dealroom.trust")}
            />
            <small className="muted">{t("dealroom.trustRule")}</small>
          </div>
        </section>
        <section className="card">
          <h3>
            <Icon name="gavel" size={14} />
            {t("entity.partner.asks")}
          </h3>
          <div className="ep-tags">
            {SEAT_CONCERNS[seat]?.map((concern) => (
              <Tag key={concern}>{t(`concern.${concern}`)}</Tag>
            ))}
          </div>
        </section>
        <section className="card">
          <h3>
            <Icon name="deals" size={14} />
            {t("entity.partner.votes")}
          </h3>
          {votes.length === 0 ? (
            <p className="muted">{t("entity.partner.votesNone")}</p>
          ) : (
            <ul className="ep-list">
              {votes.map(({ row, vote }) => (
                <li key={row.i}>
                  <EntityLink page={{ kind: "company", id: row.i }}>{row.short}</EntityLink>
                  <Tag tone={vote!.stance === "for" ? "good" : vote!.stance === "against" ? "bad" : "warn"}>{t(`stance.${vote!.stance}`)}</Tag>
                  <span className="ep-note">{vote!.concerns.map((concern) => t(`concern.${concern}`)).join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
