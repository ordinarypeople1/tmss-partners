import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { gate } from "../Gate";
import { useT, type Translate } from "../../i18n/useT";
import type { Choice, Message, SaleView, View } from "../../sim/types";
import { Meter, Ring, Stat, Tag } from "../charts";
import { monthsBetween, useFormat } from "../format";
import { useGame } from "../game";
import { Icon } from "../icons";
import { RichMessage } from "../Links";
import { describeMessage } from "../messages";
import "./Inbox.css";

type Filter = "all" | "decision" | "deals" | "portfolio" | "news" | "decided";
type Category = "deals" | "portfolio" | "news" | "house";
type Tone = "good" | "bad" | "warn" | "accent";

const FILTERS: Filter[] = ["all", "decision", "deals", "portfolio", "news", "decided"];

const DEAL_TYPES = new Set<Message["type"]>([
  "sale_early_notice",
  "sale_started",
  "sale_withdrawn",
  "sale_failed",
  "auction_lost",
  "final_round",
  "regulator_blocked",
  "diligence_report",
  "committee_decision",
  "deal_closed",
  "deal_broken",
]);
const PORTFOLIO_TYPES = new Set<Message["type"]>([
  "initiative_done",
  "issue_surfaced",
  "strike",
  "covenant_breach",
  "lenders_took_keys",
  "refinanced",
  "recap_paid",
  "add_on_closed",
  "exit_offer",
  "exit_pulled",
  "exit_closed",
  "proceeds_received",
]);

/** The choices the catalog has a consequence line for, by message type. */
const CONSEQUENCES: Partial<Record<Message["type"], Choice[]>> = {
  covenant_breach: ["cure", "waiver", "ignore"],
  strike: ["settle", "hold_out"],
  issue_surfaced: ["report_now", "report_later"],
  exit_offer: ["accept", "decline"],
};

const CHOICE_TONE: Partial<Record<Choice, Tone>> = {
  ignore: "bad",
  hold_out: "warn",
  report_later: "warn",
  decline: "warn",
};

/** How much of a decision's time is left, 0 to 1. A decision due this month still shows a sliver. */
function timeLeft(message: Message, view: View): number {
  if (!message.decision) {
    return 0;
  }
  const left = message.decision.due_month - view.month;
  const given = left + monthsBetween(message.date, view.date);
  return (left + 0.5) / (Math.max(given, 1) + 0.5);
}

function categoryOf(message: Message): Category {
  if (message.news) {
    return "news";
  }
  if (message.type === "event") {
    // The co-invest question comes up during a deal; every other event is about a holding.
    return message.event === "co_invest_request" ? "deals" : "portfolio";
  }
  if (DEAL_TYPES.has(message.type)) {
    return "deals";
  }
  if (PORTFOLIO_TYPES.has(message.type)) {
    return "portfolio";
  }
  return "house";
}

/** An event names its own two options; everything else uses the shared choice words. */
function choiceLabel(t: Translate, message: Message, choice: Choice): string {
  return message.type === "event" ? t(`event.${message.event}.${choice}`) : t(`choice.${choice}`);
}

function isOpen(message: Message): boolean {
  return message.decision !== null && message.decision.chosen === null;
}

function matches(filter: Filter, message: Message): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "decision") {
    return isOpen(message);
  }
  if (filter === "decided") {
    return message.decision !== null && message.decision.chosen !== null;
  }
  return categoryOf(message) === filter;
}

const PHONE = "(max-width: 760px)";

/** Whether a media query holds. On a phone the inbox shows the list or one message, never both. */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

function Back({ size = 18 }: { size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function deadlineTone(left: number): "bad" | "warn" | "accent" {
  return left <= 1 ? "bad" : left <= 2 ? "warn" : "accent";
}

export function Inbox() {
  const game = useGame();
  const { view } = game;
  const t = useT();
  const f = useFormat();
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const phone = useMediaQuery(PHONE);
  /** On a phone: whether a message is open over the list. */
  const [opened, setOpened] = useState(false);
  /** Where the list was scrolled to when a message was opened. */
  const listScroll = useRef(0);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, decision: 0, deals: 0, portfolio: 0, news: 0, decided: 0 };
    for (const message of view.messages) {
      for (const id of FILTERS) {
        if (matches(id, message)) {
          result[id] += 1;
        }
      }
    }
    return result;
  }, [view.messages]);
  const unread = view.messages.filter((message) => !message.read).length;

  // Open decisions first, soonest deadline on top; then newest first.
  const list = useMemo(() => {
    const shown = view.messages.filter((message) => matches(filter, message));
    const open = shown.filter(isOpen).sort((a, b) => (a.decision?.due_month ?? 0) - (b.decision?.due_month ?? 0) || b.id - a.id);
    const rest = shown.filter((message) => !isOpen(message)).sort((a, b) => b.id - a.id);
    return [...open, ...rest];
  }, [view.messages, filter]);

  const found = list.find((message) => message.id === picked) ?? null;
  // A desk always has a message in the reading pane; a phone only after a tap.
  const reading = phone && opened && found !== null;
  const current = phone ? (reading ? found : null) : (found ?? list[0] ?? null);
  const currentId = current?.id ?? null;
  const currentUnread = current !== null && !current.read;
  const { act } = game;

  // What is on screen in the reading pane counts as read.
  useEffect(() => {
    if (currentId !== null && currentUnread) {
      act({ type: "mark_read", message: currentId });
    }
  }, [currentId, currentUnread, act]);

  // The reading view starts at its top; going back returns the list to where it was.
  useLayoutEffect(() => {
    if (!phone) {
      return;
    }
    const screen = rootRef.current?.closest(".screen");
    if (screen) {
      screen.scrollTop = reading ? 0 : listScroll.current;
    }
  }, [phone, reading]);

  const openMessage = (id: number) => {
    setPicked(id);
    if (phone) {
      listScroll.current = rootRef.current?.closest(".screen")?.scrollTop ?? 0;
      setOpened(true);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const at = list.findIndex((message) => message.id === currentId);
    const next = list[Math.min(Math.max(at + (event.key === "ArrowDown" ? 1 : -1), 0), list.length - 1)];
    if (!next) {
      return;
    }
    setPicked(next.id);
    const button = listRef.current?.querySelector<HTMLButtonElement>(`[data-message="${next.id}"]`);
    button?.focus();
    button?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="inbox" ref={rootRef} data-view={reading ? "reading" : "list"}>
      <header className="page-head">
        <div>
          <h1>{t("inbox.title")}</h1>
          <p>{f.date(view.date)}</p>
        </div>
        <div className="inbox-strip">
          <div className="inbox-strip-item">
            <span className="stat-label">{t("inbox.strip.attention")}</span>
            <div className="row">
              <span className="inbox-pips" aria-hidden>
                {Array.from({ length: view.attention.max }, (_, index) => (
                  <i key={index} data-on={index < view.attention.left ? "true" : undefined} />
                ))}
              </span>
              <b>{`${view.attention.left}/${view.attention.max}`}</b>
            </div>
          </div>
          <div className="inbox-strip-item" data-tone={counts.decision > 0 ? "bad" : undefined}>
            <span className="stat-label">{t("inbox.strip.decisions")}</span>
            <div className="row">
              <Icon name="alert" size={16} />
              <b>{f.integer(counts.decision)}</b>
            </div>
          </div>
          <div className="inbox-strip-item" data-tone={unread > 0 ? "accent" : undefined}>
            <span className="stat-label">{t("inbox.strip.unread")}</span>
            <div className="row">
              <Icon name="inbox" size={16} />
              <b>{f.integer(unread)}</b>
            </div>
          </div>
        </div>
      </header>

      <div className="inbox-bar">
        <div className="tabs" role="tablist" aria-label={t("inbox.filter.label")}>
          {FILTERS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}>
              {t(`inbox.filter.${id}`)}
              <small className="inbox-count" data-urgent={id === "decision" && counts[id] > 0 ? "true" : undefined}>
                {f.integer(counts[id])}
              </small>
            </button>
          ))}
        </div>
        <button {...gate(unread === 0 && t("gate.noUnread"))} type="button" className="btn small" disabled={unread === 0} onClick={() => act({ type: "mark_all_read" })}>
          <Icon name="check" size={14} />
          {t("inbox.markAllRead")}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          <Icon name="inbox" size={28} />
          <p>{t(filter === "all" ? "inbox.empty.all" : "inbox.empty.filter")}</p>
        </div>
      ) : (
        <div className="inbox-panes">
          <ul className="inbox-list card" ref={listRef} onKeyDown={onKeyDown} aria-label={t("inbox.list.label")}>
            {list.map((message) => {
              const text = describeMessage(t, f, view, message);
              const open = isOpen(message);
              const left = message.decision ? message.decision.due_month - view.month : 0;
              const tone = open ? deadlineTone(left) : text.tone;
              return (
                <li key={message.id}>
                  <button
                    type="button"
                    className="inbox-item"
                    data-message={message.id}
                    data-unread={message.read ? undefined : "true"}
                    data-quiet={message.news ? "true" : undefined}
                    data-pinned={open ? deadlineTone(left) : undefined}
                    aria-current={message.id === currentId ? "true" : undefined}
                    onClick={() => openMessage(message.id)}
                  >
                    <span className="inbox-icon" data-tone={tone}>
                      <Icon name={text.icon} size={16} />
                    </span>
                    <span className="inbox-item-text">
                      <span className="inbox-item-title">{text.title}</span>
                      <span className="inbox-item-sub">
                        {f.shortDate(message.date)}
                        {open ? <Tag tone={deadlineTone(left)}>{t("inbox.needsDecision")}</Tag> : null}
                        {message.decision?.chosen ? <Tag tone="muted">{choiceLabel(t, message, message.decision.chosen)}</Tag> : null}
                      </span>
                    </span>
                    {open ? (
                      <Ring fraction={timeLeft(message, view)} size={26} tone={deadlineTone(left)}>
                        {String(Math.max(left, 0))}
                      </Ring>
                    ) : message.read ? null : (
                      <i className="inbox-dot" aria-label={t("inbox.unread")} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {reading ? (
            <button type="button" className="inbox-back" onClick={() => setOpened(false)}>
              <Back />
              {t("inbox.list.label")}
            </button>
          ) : null}
          {current ? <Reading message={current} /> : null}
        </div>
      )}
    </div>
  );
}

function Reading({ message }: { message: Message }) {
  const game = useGame();
  const { view } = game;
  const t = useT();
  const f = useFormat();
  const text = describeMessage(t, f, view, message);
  const row = message.company === null ? undefined : game.rows.get(message.company);
  const category = categoryOf(message);
  const decision = message.decision;
  const open = isOpen(message);
  const left = decision ? decision.due_month - view.month : 0;

  return (
    <article className="inbox-reading card" data-quiet={message.news ? "true" : undefined}>
      <header className="inbox-reading-head">
        <span className="inbox-icon large" data-tone={open ? deadlineTone(left) : text.tone}>
          <Icon name={text.icon} size={22} />
        </span>
        <div>
          <h2>
            <RichMessage text={text} part="title" />
          </h2>
          <div className="row">
            <span className="muted">{f.date(message.date)}</span>
            <Tag tone={category === "news" ? "muted" : undefined}>{t(`inbox.category.${category}`)}</Tag>
            {open ? <Tag tone={deadlineTone(left)}>{t("inbox.needsDecision")}</Tag> : null}
          </div>
        </div>
      </header>

      {message.type === "achievement_unlocked" ? (
        <div className="inbox-badge">
          <span className="inbox-badge-icon">
            <Icon name="flag" size={22} />
          </span>
          <div>
            <small>{t("inbox.achievement.label")}</small>
            <b>{t(`achievement.${message.achievement}`)}</b>
            <span>{t(`achievement.${message.achievement}.detail`)}</span>
          </div>
        </div>
      ) : (
        <p className="inbox-body">
          <RichMessage text={text} part="body" />
        </p>
      )}

      <Facts message={message} sale={row?.sale ?? null} />

      {message.type === "final_round" && row ? (
        <button type="button" className="btn primary inbox-go" onClick={() => game.select(row.i)}>
          <Icon name="gavel" size={15} />
          {t("inbox.finalRound.open")}
        </button>
      ) : null}

      {row ? (
        <button type="button" className="inbox-company" onClick={() => game.select(row.i)} aria-pressed={game.selected === row.i}>
          <span className="inbox-icon">
            <Icon name={row.sector} size={16} />
          </span>
          <span className="inbox-item-text">
            <b>{row.name}</b>
            <span className="inbox-item-sub">{`${t(`sector.${row.sector}`)} · ${t(`admin1.${row.admin1}`)}`}</span>
          </span>
          {row.held ? <Tag tone="accent">{t("owner.player")}</Tag> : null}
          {row.in_deal ? <Tag tone="accent">{t("inbox.company.inDeal")}</Tag> : null}
          {row.sale ? <Tag>{t(`stage.${row.sale.stage}`)}</Tag> : null}
          <span className="inbox-open">
            {t("action.open")}
            <Icon name="exit" size={14} />
          </span>
        </button>
      ) : null}

      {/* The houses and banks the message names, each a way to its page. */}
      {Object.entries(text.links)
        .filter(([, page]) => page.kind !== "company")
        .filter(([, page], index, list) => list.findIndex(([, other]) => other.kind === page.kind && other.id === page.id && (other.kind !== "person" || (page.kind === "person" && other.role === page.role))) === index)
        .map(([key, page]) => (
          <button key={key} type="button" className="inbox-company" onClick={() => game.open(page)}>
            <span className="inbox-icon">
              <Icon name={page.kind === "house" ? "flag" : page.kind === "person" ? "meet" : "career"} size={16} />
            </span>
            <span className="inbox-item-text">
              <b>{page.kind === "house" ? view.rivals[page.id] : page.kind === "adviser" ? view.advisers[page.id]?.name : text.values[key]}</b>
              <span className="inbox-item-sub">{t(page.kind === "house" ? "entity.house" : page.kind === "adviser" ? "entity.adviser" : "entity.person")}</span>
            </span>
            <span className="inbox-open">
              {t("action.open")}
              <Icon name="exit" size={14} />
            </span>
          </button>
        ))}

      {decision ? (
        <section className="inbox-decision" data-tone={open ? deadlineTone(left) : undefined}>
          <div className="row between">
            <h3>{t(open ? "inbox.decision.title" : "inbox.decision.done")}</h3>
            {open ? (
              <div className="row">
                <Ring fraction={timeLeft(message, view)} size={30} tone={deadlineTone(left)}>
                  {String(Math.max(left, 0))}
                </Ring>
                <span>
                  <b>{t("inbox.decision.left", { months: Math.max(left, 0) })}</b>
                  <small className="inbox-default">
                    {t("inbox.decision.default", { choice: choiceLabel(t, message, decision.options[decision.options.length - 1]) })}
                  </small>
                </span>
              </div>
            ) : null}
          </div>
          <div className="inbox-choices">
            {decision.options.map((option, index) => {
              const values = message.type === "covenant_breach" ? { cure: f.money(message.cure) } : undefined;
              const consequence =
                message.type === "event"
                  ? t(`event.${message.event}.${option}.effect`)
                  : CONSEQUENCES[message.type]?.includes(option)
                    ? t(`inbox.consequence.${message.type}.${option}`, values)
                    : null;
              const chosen = decision.chosen === option;
              return (
                <button key={option} {...gate(!open && t("gate.decided"))}
                  type="button"
                  className="inbox-choice"
                  data-tone={CHOICE_TONE[option]}
                  data-primary={index === 0 ? "true" : undefined}
                  data-chosen={chosen ? "true" : undefined}
                  disabled={!open}
                  onClick={() => game.act({ type: "decide", message: message.id, choice: option })}
                >
                  <strong>
                    {chosen ? <Icon name="check" size={16} /> : null}
                    {choiceLabel(t, message, option)}
                  </strong>
                  {consequence ? <span>{consequence}</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </article>
  );
}

/** The numbers of a message as tiles, where it carries any. */
function Facts({ message, sale }: { message: Message; sale: SaleView | null }) {
  const t = useT();
  const f = useFormat();
  let tiles: ReactNode = null;
  switch (message.type) {
    case "covenant_breach":
      tiles = (
        <>
          <Meter
            value={message.leverage_millis}
            max={Math.max(message.leverage_millis, message.max_leverage_millis) * 1.15}
            marker={message.max_leverage_millis}
            tone={message.leverage_millis > message.max_leverage_millis ? "bad" : "good"}
            label={t("term.leverage")}
            text={`${f.multiple(message.leverage_millis)} / ${f.multiple(message.max_leverage_millis)}`}
          />
          <Stat label={t("term.cover")} value={f.multiple(message.cover_millis)} />
          <Stat label={t("inbox.fact.cure")} value={f.money(message.cure)} tone="warn" />
        </>
      );
      break;
    case "exit_offer":
      tiles = (
        <>
          <Stat label={t("inbox.fact.dealValue")} value={f.money(message.ev)} />
          <Stat label={t("inbox.fact.proceeds")} value={f.money(message.proceeds)} tone="good" />
        </>
      );
      break;
    case "exit_closed":
      tiles = (
        <>
          <Stat label={t("inbox.fact.proceeds")} value={f.money(message.proceeds)} />
          <Stat label={t("term.moic")} value={f.multiple(message.moic_millis, 2)} tone={message.moic_millis >= 1000 ? "good" : "bad"} />
          {message.irr_bps === null ? null : (
            <Stat label={t("term.irr")} value={f.pct(message.irr_bps)} tone={message.irr_bps >= 0 ? "good" : "bad"} />
          )}
        </>
      );
      break;
    case "deal_closed":
      tiles = (
        <>
          <Stat label={t("inbox.fact.dealValue")} value={f.money(message.ev)} />
          <Stat label={t("term.equity")} value={f.money(message.equity)} />
          <Stat label={t("term.debt")} value={f.money(message.debt)} />
        </>
      );
      break;
    case "rival_deal":
    case "auction_lost":
      tiles = <Stat label={t("inbox.fact.dealValue")} value={f.money(message.ev)} />;
      break;
    case "quarter_report":
      tiles = (
        <>
          <Stat label={t("term.nav")} value={f.money(message.nav)} />
          <Stat label={t("term.tvpi")} value={f.multiple(message.tvpi_millis, 2)} tone={message.tvpi_millis >= 1000 ? "good" : "bad"} />
        </>
      );
      break;
    case "rate_changed":
      tiles = (
        <Stat
          label={t("inbox.fact.rate")}
          value={f.pct(message.to_bps, 2)}
          delta={`${f.signedPct(message.to_bps - message.from_bps, 2)}p`}
          tone={message.to_bps > message.from_bps ? "bad" : "good"}
        />
      );
      break;
    case "event":
      if (message.amount === 0) {
        return null;
      }
      tiles = <Stat label={t("inbox.fact.amount")} value={f.money(message.amount)} tone="warn" />;
      break;
    case "final_round":
      tiles = (
        <>
          <Stat
            label={t("inbox.fact.rank")}
            value={t("inbox.fact.rankValue", { rank: message.rank, bidders: message.bidders })}
            tone={message.rank === 1 ? "good" : "warn"}
          />
          {sale?.final_round && sale.my_bid !== null ? (
            <>
              <Stat label={t("inbox.fact.myBid")} value={f.money(sale.my_bid)} />
              {sale.standing ? <Stat label={t("inbox.fact.lead")} value={f.figure(sale.standing.lead)} /> : null}
              {sale.bid_ceiling > 0 ? <Stat label={t("inbox.fact.ceiling")} value={f.money(sale.bid_ceiling)} /> : null}
            </>
          ) : null}
        </>
      );
      break;
    case "objectives_review":
      tiles = (
        <>
          <div className="inbox-met">
            <Ring fraction={message.total > 0 ? message.met / message.total : 0} size={44} tone={message.met === message.total ? "good" : message.met === 0 ? "bad" : "warn"}>
              {`${message.met}/${message.total}`}
            </Ring>
            <span className="stat-label">{t("inbox.fact.met")}</span>
          </div>
          <Stat label={t("inbox.fact.bonus")} value={f.money(message.bonus)} tone={message.bonus > 0 ? "good" : undefined} />
        </>
      );
      break;
    default:
      return null;
  }
  return <div className="inbox-facts">{tiles}</div>;
}
