import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../i18n/useT";
import { Meter, Tag } from "./charts";
import { monthsBetween, useFormat } from "./format";
import { SCREENS, useGame, type Screen } from "./game";
import { Icon } from "./icons";
import { describeMessage } from "./messages";
import { Moments } from "./Moments";
import { NewGame } from "./NewGame";
import { Objectives } from "./Objectives";
import { Preferences } from "./Preferences";

const NAV_ICON: Record<Screen, string> = {
  map: "map",
  inbox: "inbox",
  deals: "deals",
  portfolio: "portfolio",
  market: "market",
  league: "flag",
  fund: "fund",
  career: "career",
};

function Sidebar({ onNewGame }: { onNewGame: () => void }) {
  const game = useGame();
  const t = useT();
  const { view } = game;
  const unread = view.messages.filter((message) => !message.read && !message.news).length;
  const pending = view.messages.filter((message) => message.decision && message.decision.chosen === null).length;
  const held = view.companies.filter((row) => row.held).length;
  const badges: Partial<Record<Screen, number>> = {
    inbox: unread,
    deals: view.deals.length,
    portfolio: held,
  };
  return (
    <aside className="sidebar">
      <div className="brand">
        <strong>{t("app.title")}</strong>
        <span>
          {t(`app.house.${view.house}`)} · {view.fund.name}
        </span>
      </div>
      <nav aria-label={t("shell.nav")}>
        {SCREENS.map((screen) => (
          <button
            key={screen}
            type="button"
            className="nav-item"
            aria-current={game.screen === screen ? "page" : undefined}
            onClick={() => game.go(screen)}
          >
            <Icon name={NAV_ICON[screen]} />
            <span>{t(`nav.${screen}`)}</span>
            {badges[screen] ? (
              <b className="badge" data-urgent={screen === "inbox" && pending > 0 ? "true" : undefined}>
                {badges[screen]}
              </b>
            ) : null}
          </button>
        ))}
      </nav>
      <section className="sidebar-turn" aria-label={t("shell.turn.label")}>
        <div className="attention" title={t("shell.attentionLeft", view.attention)}>
          <span>{t("shell.attention")}</span>
          <div className="pips" aria-label={t("shell.attentionLeft", view.attention)}>
            {Array.from({ length: view.attention.max }, (_, index) => (
              <i key={index} data-on={index < view.attention.left} />
            ))}
          </div>
        </div>
        <TurnControls pips={false} />
      </section>
      <div className="sidebar-foot">
        <div className="me">
          <Tag tone="accent">{t(`rank.${view.career.rank}`)}</Tag>
          <Meter
            value={view.career.reputation}
            max={100}
            tone={view.career.reputation < 30 ? "bad" : "good"}
            label={t("shell.reputation")}
            text={String(view.career.reputation)}
          />
          <div className="street tip" tabIndex={0} data-tip={t("shell.tip.street")} data-tone={view.career.street > 0 ? "good" : view.career.street < 0 ? "bad" : undefined}>
            <span>{t("shell.street")}</span>
            <span className="street-bar" aria-hidden>
              <i style={{ left: `${50 + Math.min(view.career.street, 0) * 1.25}%`, width: `${Math.abs(view.career.street) * 1.25}%` }} />
            </span>
            <b>{view.career.street > 0 ? `+${view.career.street}` : view.career.street}</b>
          </div>
        </div>
        <Objectives />
        <Settings onNewGame={onNewGame} />
      </div>
    </aside>
  );
}

/** Language, theme, sound, a new game and the way back to the title: the same controls in the sidebar and in the phone's menu. */
function Settings({ onNewGame }: { onNewGame: () => void }) {
  const t = useT();
  const game = useGame();
  return (
    <div className="settings">
      <Preferences />
      <button type="button" className="icon-btn" aria-label={t("shell.newGame")} title={t("shell.newGame")} onClick={onNewGame}>
        <Icon name="restart" size={16} />
      </button>
      <button type="button" className="icon-btn" aria-label={t("shell.toTitle")} title={t("shell.toTitle")} onClick={game.toTitle}>
        <Icon name="exit" size={16} />
      </button>
    </div>
  );
}

/**
 * The turn. Nothing moves until the player closes the month. With decisions
 * still open the button asks first; a second button skips a quiet stretch.
 */
function TurnControls({ pips = true }: { pips?: boolean }) {
  const game = useGame();
  const t = useT();
  const { view } = game;
  const [asking, setAsking] = useState(false);
  const pending = view.messages.filter((message) => message.decision && message.decision.chosen === null).length;
  const close = (skip: boolean) => {
    setAsking(false);
    if (skip) {
      game.skipAhead();
    } else {
      game.nextMonth();
    }
  };
  return (
    <div className="turn">
      {pips ? (
        <div className="pips" title={t("shell.turn.attentionLeft", { left: view.attention.left })} aria-label={t("shell.turn.attentionLeft", { left: view.attention.left })}>
          {Array.from({ length: view.attention.max }, (_, index) => (
            <i key={index} data-on={index < view.attention.left} />
          ))}
        </div>
      ) : null}
      <button type="button" className="btn small skip" title={t("shell.turn.skipHint")} onClick={() => (pending > 0 ? setAsking(true) : close(true))}>
        <Icon name="skip" size={14} />
        <span>{t("shell.turn.skip")}</span>
      </button>
      <button type="button" className="btn primary next" onClick={() => (pending > 0 ? setAsking(true) : close(false))}>
        {t("shell.turn.next")}
        <Icon name="play" size={13} />
      </button>
      {asking ? (
        <div className="turn-ask" role="alertdialog">
          <strong>{t("shell.turn.pending", { count: pending })}</strong>
          <p>{t("shell.turn.pendingHint")}</p>
          <div className="row">
            <button
              type="button"
              className="btn small primary"
              onClick={() => {
                setAsking(false);
                game.go("inbox");
              }}
            >
              {t("shell.turn.toInbox")}
            </button>
            <button type="button" className="btn small" onClick={() => close(false)}>
              {t("shell.turn.anyway")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the closed turn brought, on one line where the market wire runs. It never covers
 * the screen: the player's own news first, market news as a count, the rest in the inbox.
 */
function TurnLine() {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { turn, view } = game;
  if (!turn) {
    return null;
  }
  const mine = turn.messages.filter((message) => !message.news);
  const news = turn.messages.length - mine.length;
  const shown = mine.slice(-2).reverse().map((message) => describeMessage(t, f, view, message));
  const tone = shown.find((text) => text.tone === "bad") ? "bad" : shown[0]?.tone;
  return (
    <div className="turn-line" role="status" aria-live="polite" data-tone={tone}>
      <button
        type="button"
        className="turn-line-main"
        onClick={() => {
          game.dismissTurn();
          game.go("inbox");
        }}
        aria-label={t("shell.turn.open")}
      >
        <span className="turn-line-tag">
          <Icon name="clock" size={13} />
          {turn.months > 1
            ? t("shell.turn.reportSpan", { date: f.date(turn.from), months: turn.months })
            : t("shell.turn.report", { date: f.date(turn.from) })}
        </span>
        <span className="turn-line-items clip">
          {shown.length === 0 ? t("shell.turn.quiet") : shown.map((text) => text.title).join(" · ")}
        </span>
        {mine.length > shown.length ? <small>{t("shell.turn.more", { count: mine.length - shown.length })}</small> : null}
        {news > 0 ? <small className="turn-line-news">{t("shell.turn.news", { count: news })}</small> : null}
      </button>
      <button type="button" className="turn-line-close" aria-label={t("shell.turn.close")} title={t("shell.turn.close")} onClick={game.dismissTurn}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

/** One line of market news, turning over: other houses buy, sell and stumble whether or not the player acts. */
function Wire() {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { view } = game;
  // The fund's own quarterly report is filed as news; the wire is for what others do.
  const news = view.messages.filter((message) => message.news && message.type !== "quarter_report").slice(-8).reverse();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (news.length < 2) {
      return;
    }
    const timer = window.setInterval(() => setIndex((value) => value + 1), 4500);
    return () => window.clearInterval(timer);
  }, [news.length]);
  if (news.length === 0) {
    return null;
  }
  const message = news[index % news.length];
  const text = describeMessage(t, f, view, message);
  return (
    <button type="button" className="wire" onClick={() => game.go("inbox")} aria-label={t("shell.wire")}>
      <span className="wire-tag">
        <i />
        {t("shell.wire")}
      </span>
      <span key={message.id} className="wire-line clip">
        <small>{f.date(message.date)}</small>
        {text.title}
      </span>
    </button>
  );
}

function Topbar() {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { view } = game;
  const { economy, fund } = view;
  const monthsLeft = Math.max(0, monthsBetween(view.date, fund.investment_period_ends));
  return (
    <header className="topbar">
      <div className="clock">
        <nav className="history" aria-label={t("shell.history")}>
          <button type="button" className="icon-btn" aria-label={t("shell.back")} title={t("shell.back")} disabled={!game.canBack} onClick={game.back}>
            <Icon name="back" size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label={t("shell.forward")} title={t("shell.forward")} disabled={!game.canForward} onClick={game.forward}>
            <Icon name="forward" size={16} />
          </button>
        </nav>
        <strong>{f.date(view.date)}</strong>
        <TurnControls />
      </div>
      <div className="chips">
        <span className="chip tip" tabIndex={0} data-tip={t("shell.tip.phase")} data-phase={economy.phase}>
          <i />
          {t(`phase.${economy.phase}`)}
        </span>
        <span className="chip tip" tabIndex={0} data-tip={t("shell.tip.policyRate")}>
          <small>{t("shell.policyRate")}</small>
          <b>{f.pct(economy.policy_rate_bps, 2)}</b>
        </span>
        <span className="chip tip" tabIndex={0} data-tip={t("shell.tip.valuation")}>
          <small>{t("shell.valuation")}</small>
          <b>{economy.valuation_index}</b>
        </span>
        <span className="chip tip" tabIndex={0} data-tip={t("shell.tip.credit")}>
          <small>{t("shell.credit")}</small>
          <b>{f.pct(economy.credit_spread_bps, 2)}</b>
        </span>
        <span className="chip tip" tabIndex={0} data-tip={t("shell.tip.forSale")}>
          <Icon name="deals" size={14} />
          {t("shell.forSale", { count: view.market.visible })}
        </span>
      </div>
      <div className="fund-strip tip" tabIndex={0} data-tip={t("shell.tip.uncalled")}>
        <Meter value={fund.uncalled} max={fund.committed} tone="ink" label={t("shell.uncalled")} text={f.money(fund.uncalled)} />
        <Tag tone={fund.investing ? "accent" : "muted"} icon={<Icon name="clock" size={13} />}>
          {fund.investing ? t("shell.investing", { months: monthsLeft }) : t("shell.harvest")}
        </Tag>
      </div>
      {game.turn ? <TurnLine /> : <Wire />}
    </header>
  );
}

const TABS: Screen[] = ["map", "inbox", "deals", "portfolio"];

/** The phone's navigation: four tabs and a menu for the rest. */
function TabBar({ onNewGame }: { onNewGame: () => void }) {
  const game = useGame();
  const t = useT();
  const [open, setOpen] = useState(false);
  const { view } = game;
  const unread = view.messages.filter((message) => !message.read && !message.news).length;
  const rest = SCREENS.filter((screen) => !TABS.includes(screen));
  const go = (screen: Screen) => {
    setOpen(false);
    game.go(screen);
  };
  return (
    <>
      {open ? (
        <div className="more-sheet">
          <button type="button" className="more-backdrop" aria-label={t("shell.more.close")} onClick={() => setOpen(false)} />
          <div className="more-card">
            <div className="more-grid">
              {rest.map((screen) => (
                <button key={screen} type="button" aria-current={game.screen === screen ? "page" : undefined} onClick={() => go(screen)}>
                  <Icon name={NAV_ICON[screen]} size={22} />
                  <span>{t(`nav.${screen}`)}</span>
                </button>
              ))}
            </div>
            <div className="more-me">
              <Tag tone="accent">{t(`rank.${view.career.rank}`)}</Tag>
              <Meter value={view.career.reputation} max={100} tone={view.career.reputation < 30 ? "bad" : "good"} label={t("shell.reputation")} text={String(view.career.reputation)} />
            </div>
            <Objectives />
            <Settings onNewGame={onNewGame} />
          </div>
        </div>
      ) : null}
      <nav className="tabbar" aria-label={t("shell.nav")}>
        {TABS.map((screen) => (
          <button key={screen} type="button" aria-current={game.screen === screen && !open ? "page" : undefined} onClick={() => go(screen)}>
            <Icon name={NAV_ICON[screen]} size={21} />
            <span>{t(`nav.${screen}`)}</span>
            {screen === "inbox" && unread > 0 ? <b className="badge">{unread}</b> : null}
          </button>
        ))}
        <button type="button" aria-expanded={open} aria-current={rest.includes(game.screen) || open ? "page" : undefined} onClick={() => setOpen((value) => !value)}>
          <Icon name="layers" size={21} />
          <span>{t("shell.more")}</span>
        </button>
      </nav>
    </>
  );
}

function Toasts() {
  const game = useGame();
  const t = useT();
  return (
    <div className="toasts" aria-live="assertive">
      {game.toasts.map((toast) => (
        <button key={toast.id} type="button" className="toast" data-tone={toast.tone} aria-label={t("shell.toast.dismiss")} onClick={() => game.dismissToast(toast.id)}>
          <Icon name={toast.tone === "bad" ? "alert" : "check"} size={16} />
          {t(toast.messageId)}
        </button>
      ))}
    </div>
  );
}

/**
 * The frame every screen sits in. On a desk: menu on the left, the turn and the
 * fund on top, a company panel on the right. On a phone: the turn on top, tabs
 * at the bottom, and the company as a full sheet.
 */
export function Shell({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  const game = useGame();
  const t = useT();
  const [choosing, setChoosing] = useState(false);
  const open = game.selected !== null;
  const { back, forward } = game;
  // Back and forward: Alt+arrows as in a browser, and the mouse's side buttons.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        forward();
      }
    };
    const onMouse = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        back();
      } else if (event.button === 4) {
        event.preventDefault();
        forward();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }, [back, forward]);
  return (
    <div className="shell">
      <Sidebar onNewGame={() => setChoosing(true)} />
      <div className="main">
        <Topbar />
        {/* The screen stays mounted under an open company, so the map keeps its place. */}
        <main className="screen" data-screen={game.screen} hidden={open}>
          {children}
        </main>
        {open ? (
          <main className="screen company-screen" data-screen="company">
            {panel}
          </main>
        ) : null}
      </div>
      <TabBar onNewGame={() => setChoosing(true)} />
      <Toasts />
      <Moments />
      {choosing ? <NewGame onClose={() => setChoosing(false)} onStart={() => game.newGame()} /> : null}
      {game.view.career.fired ? (
        <div className="overlay" role="alertdialog" aria-modal="true">
          <div className="card">
            <h2>{t("shell.fired.title")}</h2>
            <p>{t("shell.fired.body")}</p>
            <button type="button" className="btn primary" onClick={() => setChoosing(true)}>
              {t("shell.newGame")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
