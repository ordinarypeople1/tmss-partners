import { applyTheme, currentTheme, type Theme } from "./theme";
import { useState, type ReactNode } from "react";
import { LOCALES, type Locale } from "../i18n/config";
import { useLocale } from "../i18n/LocaleProvider";
import { useT } from "../i18n/useT";
import { Meter, Tag } from "./charts";
import { monthsBetween, useFormat } from "./format";
import { SCREENS, useGame, type Screen } from "./game";
import { Icon } from "./icons";
import { describeMessage } from "./messages";
import { Moments } from "./Moments";
import { NewGame } from "./NewGame";
import { Objectives } from "./Objectives";
import { isMuted, setMuted } from "./sound";

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
        </div>
        <div className="attention" title={t("shell.attentionLeft", view.attention)}>
          <span>{t("shell.attention")}</span>
          <div className="pips" aria-label={t("shell.attentionLeft", view.attention)}>
            {Array.from({ length: view.attention.max }, (_, index) => (
              <i key={index} data-on={index < view.attention.left} />
            ))}
          </div>
        </div>
        <Objectives />
        <Settings onNewGame={onNewGame} />
      </div>
    </aside>
  );
}

/** Language, sound and a new game: the same controls in the sidebar and in the phone's menu. */
function Settings({ onNewGame }: { onNewGame: () => void }) {
  const t = useT();
  const [muted, setMutedState] = useState(isMuted);
  const { locale, setLocale } = useLocale();
  const [theme, setTheme] = useState<Theme>(currentTheme);
  return (
    <div className="settings">
      <select className="language" value={locale} aria-label={t("language.label")} onChange={(event) => setLocale(event.target.value as Locale)}>
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`language.${code}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("shell.theme.label")}
        title={t(`shell.theme.${theme}`)}
        onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          applyTheme(next, true);
          setTheme(next);
        }}
      >
        <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-pressed={muted}
        aria-label={muted ? t("shell.sound.off") : t("shell.sound.on")}
        title={muted ? t("shell.sound.off") : t("shell.sound.on")}
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
      >
        <Icon name={muted ? "mute" : "sound"} size={16} />
      </button>
      <button type="button" className="icon-btn" aria-label={t("shell.newGame")} title={t("shell.newGame")} onClick={onNewGame}>
        <Icon name="restart" size={16} />
      </button>
    </div>
  );
}

/**
 * The turn. Nothing moves until the player closes the month. With decisions
 * still open the button asks first; a second button skips a quiet stretch.
 */
function TurnControls() {
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
      <div className="pips" title={t("shell.turn.attentionLeft", { left: view.attention.left })} aria-label={t("shell.turn.attentionLeft", { left: view.attention.left })}>
        {Array.from({ length: view.attention.max }, (_, index) => (
          <i key={index} data-on={index < view.attention.left} />
        ))}
      </div>
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

/** What the closed turn brought: the player's messages first, market news as a count. */
function TurnSummary() {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { turn, view } = game;
  if (!turn) {
    return null;
  }
  const mine = turn.messages.filter((message) => !message.news);
  const news = turn.messages.length - mine.length;
  const shown = mine.slice(-6).reverse();
  return (
    <section className="turn-summary" aria-live="polite">
      <header>
        <Icon name="clock" size={15} />
        <strong>
          {turn.months > 1
            ? t("shell.turn.reportSpan", { date: f.date(turn.from), months: turn.months })
            : t("shell.turn.report", { date: f.date(turn.from) })}
        </strong>
        <button type="button" className="btn ghost small" aria-label={t("shell.turn.close")} onClick={game.dismissTurn}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {shown.length === 0 ? <p className="muted">{t("shell.turn.quiet")}</p> : null}
      <ul>
        {shown.map((message) => {
          const text = describeMessage(t, f, view, message);
          return (
            <li key={message.id} data-tone={text.tone}>
              <button
                type="button"
                onClick={() => {
                  game.dismissTurn();
                  if (message.company !== null && game.rows.has(message.company)) {
                    game.select(message.company);
                  } else {
                    game.go("inbox");
                  }
                }}
              >
                <Icon name={text.icon} size={15} />
                <span>{text.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer>
        {mine.length > shown.length ? <Tag>{t("shell.turn.more", { count: mine.length - shown.length })}</Tag> : null}
        {news > 0 ? <Tag tone="muted">{t("shell.turn.news", { count: news })}</Tag> : null}
        <button
          type="button"
          className="btn small"
          onClick={() => {
            game.dismissTurn();
            game.go("inbox");
          }}
        >
          {t("shell.turn.open")}
        </button>
      </footer>
    </section>
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
        <strong>{f.date(view.date)}</strong>
        <TurnControls />
      </div>
      <div className="chips">
        <span className="chip" data-phase={economy.phase}>
          <i />
          {t(`phase.${economy.phase}`)}
        </span>
        <span className="chip">
          <small>{t("shell.policyRate")}</small>
          <b>{f.pct(economy.policy_rate_bps, 2)}</b>
        </span>
        <span className="chip">
          <small>{t("shell.valuation")}</small>
          <b>{economy.valuation_index}</b>
        </span>
        <span className="chip">
          <small>{t("shell.credit")}</small>
          <b>{f.pct(economy.credit_spread_bps, 2)}</b>
        </span>
        <span className="chip">
          <Icon name="deals" size={14} />
          {t("shell.forSale", { count: view.market.visible })}
        </span>
      </div>
      <div className="fund-strip">
        <Meter value={fund.uncalled} max={fund.committed} tone="ink" label={t("shell.uncalled")} text={f.money(fund.uncalled)} />
        <Tag tone={fund.investing ? "accent" : "muted"} icon={<Icon name="clock" size={13} />}>
          {fund.investing ? t("shell.investing", { months: monthsLeft }) : t("shell.harvest")}
        </Tag>
      </div>
      <TurnSummary />
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
    game.select(null);
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
  return (
    <div className="shell" data-panel={game.selected === null ? "closed" : "open"}>
      <Sidebar onNewGame={() => setChoosing(true)} />
      <div className="main">
        <Topbar />
        <main className="screen" data-screen={game.screen}>
          {children}
        </main>
      </div>
      {game.selected === null ? null : <aside className="panel">{panel}</aside>}
      <TabBar onNewGame={() => setChoosing(true)} />
      <Toasts />
      <Moments />
      {choosing ? <NewGame onClose={() => setChoosing(false)} /> : null}
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
