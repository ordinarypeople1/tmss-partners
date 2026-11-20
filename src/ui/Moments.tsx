import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n/useT";
import type { Achievement, Message, Rank, View } from "../sim/types";
import { StackBar, Stat, Tag } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import { bidderName } from "./messages";
import { Portrait } from "./Portrait";
import "./Moments.css";

type Of<T extends Message["type"]> = Extract<Message, { type: T }>;

/** What a rank carries. Fixed constants of the sim: crates/sim-core/src/fund.rs (the Career screen shows the same table). */
const RANK_PERKS: Record<Rank, { attention: number; deals: number; initiatives: number; carryBps: number }> = {
  vice_president: { attention: 4, deals: 2, initiatives: 1, carryBps: 100 },
  principal: { attention: 6, deals: 4, initiatives: 2, carryBps: 500 },
  partner: { attention: 8, deals: 6, initiatives: 3, carryBps: 1500 },
  founder: { attention: 10, deals: 8, initiatives: 3, carryBps: 6000 },
};
const RANK_ORDER: Rank[] = ["vice_president", "principal", "partner", "founder"];
const PERKS = ["attention", "deals", "initiatives", "carry"] as const;

const BADGE_MS = 4_000;
const CHAIR = 0;

/** The fund as it stood when the message arrived; the view moves on while a card waits in the queue. */
interface Snapshot {
  house: View["house"];
  fundName: string;
  dpi: number;
  tvpi: number;
  /** The player's row in the league, and how many houses are ranked. */
  rank: number | null;
  houses: number;
  carryPaid: number;
  exits: number;
  bestMoic: number;
}

type Card = { key: number; at: Snapshot } & (
  | { kind: "deal"; message: Of<"deal_closed"> }
  | { kind: "exit"; message: Of<"exit_closed"> }
  | { kind: "promotion"; message: Of<"promotion"> }
  | { kind: "fund"; message: Of<"fund_term_ended">; next: Of<"next_fund"> | null }
  | { kind: "loss"; message: Of<"lenders_took_keys"> }
);

interface Badge {
  key: number;
  achievement: Achievement;
}

function snapshot(view: View): Snapshot {
  return {
    house: view.house,
    fundName: view.fund.name,
    dpi: view.fund.dpi_millis,
    tvpi: view.fund.tvpi_millis,
    rank: view.league.find((row) => row.house === null)?.rank ?? null,
    houses: view.league.length,
    carryPaid: view.career.carry_paid,
    exits: view.career.exits,
    bestMoic: view.records.best_moic_millis,
  };
}

function topId(view: View): number {
  let top = -1;
  for (const message of view.messages) {
    if (message.id > top) {
      top = message.id;
    }
  }
  return top;
}

/** Which of the five verdict lines a multiple earns. */
function moicBand(millis: number): "loss" | "flat" | "fair" | "good" | "great" {
  if (millis < 1000) {
    return "loss";
  }
  if (millis < 1500) {
    return "flat";
  }
  if (millis < 2000) {
    return "fair";
  }
  return millis < 3000 ? "good" : "great";
}

function moicTone(millis: number): "good" | "bad" | undefined {
  return millis >= 2000 ? "good" : millis < 1000 ? "bad" : undefined;
}

/** Full-screen cards for the moments that matter: a close, an exit, a promotion. */
export function Moments() {
  const game = useGame();
  const { view } = game;
  const [queue, setQueue] = useState<Card[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  // The newest message already accounted for, and the game it belongs to.
  const seen = useRef<{ seed: number; month: number; id: number } | null>(null);
  const timers = useRef<number[]>([]);

  // Every redraw passes through here, whichever command caused it.
  useEffect(() => {
    const top = topId(view);
    const mark = seen.current;
    seen.current = { seed: view.seed, month: view.month, id: top };
    if (!mark || mark.seed !== view.seed || view.month < mark.month || top < mark.id) {
      // First sight of this game (a load or a new game): history is not replayed.
      setQueue([]);
      setBadges([]);
      return;
    }
    if (top === mark.id) {
      return;
    }
    const fresh = view.messages.filter((message) => message.id > mark.id).sort((a, b) => a.id - b.id);
    const at = snapshot(view);
    const cards: Card[] = [];
    const earned: Badge[] = [];
    for (const message of fresh) {
      switch (message.type) {
        case "deal_closed":
          cards.push({ kind: "deal", key: message.id, at, message });
          break;
        case "exit_closed":
          cards.push({ kind: "exit", key: message.id, at, message });
          break;
        case "promotion":
          cards.push({ kind: "promotion", key: message.id, at, message });
          break;
        case "lenders_took_keys":
          cards.push({ kind: "loss", key: message.id, at, message });
          break;
        case "fund_term_ended": {
          const next = fresh.find((other): other is Of<"next_fund"> => other.type === "next_fund") ?? null;
          cards.push({ kind: "fund", key: message.id, at, message, next });
          break;
        }
        case "achievement_unlocked":
          earned.push({ key: message.id, achievement: message.achievement });
          break;
        default:
          break;
      }
    }
    if (cards.length > 0) {
      setQueue((list) => [...list, ...cards]);
    }
    if (earned.length > 0) {
      setBadges((list) => [...list, ...earned]);
      for (const badge of earned) {
        timers.current.push(
          window.setTimeout(() => setBadges((list) => list.filter((item) => item.key !== badge.key)), BADGE_MS),
        );
      }
    }
  }, [view]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const dismiss = useCallback(() => setQueue((list) => list.slice(1)), []);
  // Being let go has its own overlay in the shell; nothing is shown over it.
  const card = view.career.fired ? null : (queue[0] ?? null);

  return (
    <>
      {badges.length > 0 ? <Badges badges={badges} onDismiss={(key) => setBadges((list) => list.filter((item) => item.key !== key))} /> : null}
      {card ? <Modal key={card.key} card={card} waiting={queue.length - 1} onDismiss={dismiss} /> : null}
    </>
  );
}

function Badges({ badges, onDismiss }: { badges: Badge[]; onDismiss: (key: number) => void }) {
  const t = useT();
  return (
    <div className="moment-badges" aria-live="polite">
      {badges.map((badge) => (
        <button key={badge.key} type="button" className="moment-badge" aria-label={t("moments.badge.dismiss")} onClick={() => onDismiss(badge.key)}>
          <span className="moment-badge-icon">
            <Icon name="flag" size={18} />
          </span>
          <span className="moment-badge-text">
            <small>{t("moments.badge.label")}</small>
            <b>{t(`achievement.${badge.achievement}`)}</b>
            <span>{t(`achievement.${badge.achievement}.detail`)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Modal({ card, waiting, onDismiss }: { card: Card; waiting: number; onDismiss: () => void }) {
  const game = useGame();
  const t = useT();
  const done = useRef<HTMLButtonElement>(null);
  const titleId = `moment-title-${card.key}`;

  useEffect(() => {
    done.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const company = "message" in card && card.message.company !== null ? card.message.company : null;
  const openCompany =
    card.kind === "deal" && company !== null
      ? () => {
          game.select(company);
          game.go("map");
          onDismiss();
        }
      : null;

  let body: ReactNode;
  switch (card.kind) {
    case "deal":
      body = <Tombstone card={card} titleId={titleId} />;
      break;
    case "exit":
      body = <Scorecard card={card} titleId={titleId} />;
      break;
    case "promotion":
      body = <Promotion card={card} titleId={titleId} />;
      break;
    case "fund":
      body = <FundReport card={card} titleId={titleId} />;
      break;
    default:
      body = <Loss card={card} titleId={titleId} />;
  }

  return (
    <div
      className="moment-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss();
        }
      }}
    >
      <section className="moment" data-kind={card.kind} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {body}
        <footer className="moment-foot">
          {waiting > 0 ? <span className="moment-more">{t("moments.more", { count: waiting })}</span> : null}
          {openCompany ? (
            <button type="button" className="btn" onClick={openCompany}>
              <Icon name="map" size={15} />
              {t("moments.openCompany")}
            </button>
          ) : null}
          <button type="button" className="btn primary" ref={done} onClick={onDismiss}>
            {t("moments.continue")}
          </button>
        </footer>
      </section>
    </div>
  );
}

/** Where the fund stands in the league. */
function LeagueStat({ at }: { at: Snapshot }) {
  const t = useT();
  if (at.rank === null) {
    return null;
  }
  return (
    <Stat
      label={t("moments.league")}
      value={t("moments.leagueValue", { rank: at.rank, houses: at.houses })}
      tone={at.rank <= 3 ? "good" : at.rank > at.houses - 3 ? "bad" : undefined}
    />
  );
}

function Tombstone({ card, titleId }: { card: Extract<Card, { kind: "deal" }>; titleId: string }) {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { message, at } = card;
  const row = message.company === null ? undefined : game.rows.get(message.company);
  const abroad = row !== undefined && row.country !== "US";
  return (
    <div className="tombstone">
      <span className="moment-date">{f.date(message.date)}</span>
      <div className="tombstone-rule" aria-hidden />
      <strong className="tombstone-house">{t(`app.house.${at.house}`)}</strong>
      <span className="tombstone-verb">{t("moments.deal.acquired")}</span>
      <h2 id={titleId} className="tombstone-company">
        {row?.name ?? ""}
      </h2>
      {row ? (
        <div className="tombstone-where">
          <Tag icon={<Icon name={row.sector} size={14} />}>{t(`sector.${row.sector}`)}</Tag>
          <Tag tone="muted">
            {abroad ? `${t(`admin1.${row.admin1}`)} · ${t(`country.${row.country}`)}` : t(`admin1.${row.admin1}`)}
          </Tag>
        </div>
      ) : null}
      <div className="tombstone-rule" aria-hidden />
      <div className="tombstone-value">
        <small>{t("moments.deal.value")}</small>
        <b>{f.money(message.ev)}</b>
      </div>
      <StackBar
        parts={[
          { label: t("term.equity"), value: message.equity, note: f.money(message.equity), color: "var(--accent)" },
          { label: t("term.debt"), value: message.debt, note: f.money(message.debt), color: "var(--ink-soft)" },
        ]}
      />
      <span className="tombstone-fund">{at.fundName}</span>
    </div>
  );
}

function Scorecard({ card, titleId }: { card: Extract<Card, { kind: "exit" }>; titleId: string }) {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { message, at } = card;
  const row = message.company === null ? undefined : game.rows.get(message.company);
  const tone = moicTone(message.moic_millis);
  return (
    <div className="scorecard">
      <header className="moment-head">
        <span className="moment-icon" data-tone={tone ?? "accent"}>
          <Icon name="exit" size={22} />
        </span>
        <div>
          <span className="moment-kicker">{`${t("moments.exit.kicker")} · ${f.date(message.date)}`}</span>
          <h2 id={titleId}>{row?.name ?? ""}</h2>
        </div>
      </header>
      <div className="row">
        <Tag tone="accent">{t(`route.${message.route}`)}</Tag>
        <Tag icon={<Icon name="handshake" size={13} />}>{bidderName(t, game.view, message.buyer)}</Tag>
      </div>
      <div className="scorecard-main">
        <div className="scorecard-moic" data-tone={tone}>
          <small>{t("term.moic")}</small>
          <b>{f.multiple(message.moic_millis, 2)}</b>
        </div>
        <div className="scorecard-side">
          <Stat label={t("moments.exit.proceeds")} value={f.money(message.proceeds)} />
          <Stat
            label={t("term.irr")}
            value={message.irr_bps === null ? t("moments.none") : f.pct(message.irr_bps)}
            tone={message.irr_bps === null ? undefined : message.irr_bps >= 0 ? "good" : "bad"}
          />
        </div>
      </div>
      <p className="moment-verdict" data-tone={tone}>
        {t(`moments.verdict.${moicBand(message.moic_millis)}`)}
      </p>
      <div className="moment-after">
        <span className="moment-kicker">{t("moments.exit.fundAfter", { fund: at.fundName })}</span>
        <div className="moment-tiles">
          <Stat label={t("term.dpi")} value={f.multiple(at.dpi, 2)} />
          <Stat label={t("term.tvpi")} value={f.multiple(at.tvpi, 2)} tone={at.tvpi >= 1000 ? "good" : "bad"} />
          <LeagueStat at={at} />
        </div>
      </div>
    </div>
  );
}

function Promotion({ card, titleId }: { card: Extract<Card, { kind: "promotion" }>; titleId: string }) {
  const t = useT();
  const f = useFormat();
  const { rank } = card.message;
  const now = RANK_PERKS[rank];
  const before = RANK_PERKS[RANK_ORDER[Math.max(RANK_ORDER.indexOf(rank) - 1, 0)]];
  const text = (perks: typeof now, perk: (typeof PERKS)[number]) =>
    perk === "carry" ? f.pct(perks.carryBps, 0) : f.integer(perks[perk]);
  const value = (perks: typeof now, perk: (typeof PERKS)[number]) => (perk === "carry" ? perks.carryBps : perks[perk]);
  return (
    <div className="promotion">
      <header className="moment-head">
        <span className="moment-portrait" style={{ width: 64, height: 64 }}>
          <Portrait partner={CHAIR} mood="for" size={64} />
        </span>
        <div>
          <span className="moment-kicker">{`${t("moments.promotion.kicker")} · ${f.date(card.message.date)}`}</span>
          <h2 id={titleId} className="promotion-rank">
            {t(`rank.${rank}`)}
          </h2>
        </div>
      </header>
      <ul className="promotion-perks">
        {PERKS.map((perk) => {
          const up = value(now, perk) > value(before, perk);
          return (
            <li key={perk} data-up={up ? "true" : undefined}>
              <span>{t(`moments.promotion.${perk}`)}</span>
              <s>{text(before, perk)}</s>
              <Icon name={up ? "up" : "check"} size={14} />
              <b>{text(now, perk)}</b>
            </li>
          );
        })}
      </ul>
      {rank === "principal" ? (
        <p className="promotion-unlock">
          <Icon name="map" size={16} />
          {t("moments.promotion.crossBorder")}
        </p>
      ) : null}
    </div>
  );
}

function FundReport({ card, titleId }: { card: Extract<Card, { kind: "fund" }>; titleId: string }) {
  const t = useT();
  const f = useFormat();
  const { message, next, at } = card;
  const good = message.tvpi_millis >= 1000;
  return (
    <div className="fund-report">
      <header className="moment-head">
        <span className="moment-portrait" style={{ width: 64, height: 64 }}>
          <Portrait partner={CHAIR} mood={good ? "for" : "against"} size={64} />
        </span>
        <div>
          <span className="moment-kicker">{`${t("moments.fund.kicker")} · ${f.date(message.date)}`}</span>
          <h2 id={titleId}>{t("moments.fund.title")}</h2>
        </div>
      </header>
      <div className="scorecard-main">
        <div className="scorecard-moic" data-tone={message.tvpi_millis >= 2000 ? "good" : good ? undefined : "bad"}>
          <small>{t("moments.fund.tvpi")}</small>
          <b>{f.multiple(message.tvpi_millis, 2)}</b>
        </div>
        <div className="scorecard-side">
          <Stat label={t("moments.fund.carryPool")} value={f.money(message.carry)} tone={message.carry > 0 ? "good" : undefined} />
          <Stat label={t("moments.fund.carryPaid")} value={f.money(at.carryPaid)} />
        </div>
      </div>
      <div className="moment-tiles">
        <Stat label={t("moments.fund.exits")} value={f.integer(at.exits)} />
        <Stat label={t("moments.fund.best")} value={at.bestMoic > 0 ? f.multiple(at.bestMoic, 2) : t("moments.none")} tone={at.bestMoic > 0 ? moicTone(at.bestMoic) : undefined} />
        <LeagueStat at={at} />
      </div>
      {next ? (
        <div className="moment-after">
          <span className="moment-kicker">{t("moments.fund.next")}</span>
          <div className="row">
            <b className="fund-report-next">{f.money(next.committed)}</b>
            <Tag tone={next.own_house ? "good" : "accent"}>{t(next.own_house ? "moments.fund.own" : "moments.fund.house")}</Tag>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Loss({ card, titleId }: { card: Extract<Card, { kind: "loss" }>; titleId: string }) {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { message, at } = card;
  const row = message.company === null ? undefined : game.rows.get(message.company);
  return (
    <div className="loss">
      <header className="moment-head">
        <span className="moment-icon" data-tone="bad">
          <Icon name="alert" size={22} />
        </span>
        <div>
          <span className="moment-kicker">{`${t("moments.loss.kicker")} · ${f.date(message.date)}`}</span>
          <h2 id={titleId}>{row?.name ?? ""}</h2>
        </div>
      </header>
      <p className="moment-verdict" data-tone="bad">
        {t("moments.loss.body")}
      </p>
      <div className="moment-tiles">
        <Stat label={t("term.moic")} value={f.multiple(0, 2)} tone="bad" />
        <Stat label={t("term.tvpi")} value={f.multiple(at.tvpi, 2)} tone={at.tvpi >= 1000 ? "good" : "bad"} />
        <LeagueStat at={at} />
      </div>
    </div>
  );
}
