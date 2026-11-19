import { useState, type ReactNode } from "react";
import { useT } from "../i18n/useT";
import { Meter, Ring, Tag } from "./charts";
import { monthsBetween, useFormat } from "./format";
import { DAYS_PER_MONTH, SCREENS, useGame, type Screen, type Speed } from "./game";
import { Icon } from "./icons";
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
  const [muted, setMutedState] = useState(isMuted);
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
        <div className="row">
          <button type="button" className="btn ghost small" onClick={onNewGame}>
            {t("shell.newGame")}
          </button>
          <button
            type="button"
            className="btn ghost small"
            aria-pressed={muted}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? t("shell.sound.off") : t("shell.sound.on")}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { view } = game;
  const { economy, fund } = view;
  const monthsLeft = Math.max(0, monthsBetween(view.date, fund.investment_period_ends));
  const speeds: Speed[] = [1, 2, 3];
  return (
    <header className="topbar">
      <div className="clock">
        <Ring fraction={game.day / DAYS_PER_MONTH} size={34} />
        <div>
          <strong>{f.date(view.date)}</strong>
          <span>{t("shell.day", { day: game.day })}</span>
        </div>
        <div className="speed" role="group">
          <button type="button" aria-pressed={game.speed === 0} aria-label={t("shell.speed.pause")} title={t("shell.speed.pause")} onClick={() => game.setSpeed(0)}>
            <Icon name="pause" size={15} />
          </button>
          {speeds.map((speed) => (
            <button key={speed} type="button" aria-pressed={game.speed === speed} aria-label={t("shell.speed.play", { speed })} title={t("shell.speed.play", { speed })} onClick={() => game.setSpeed(speed)}>
              {`${speed}×`}
            </button>
          ))}
          <button type="button" className="next" aria-label={t("shell.speed.next")} title={t("shell.speed.next")} onClick={() => game.nextMonth()}>
            <Icon name="skip" size={15} />
          </button>
        </div>
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
    </header>
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

/** The frame every screen sits in: menu on the left, time and fund on top, a company panel on the right. */
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
