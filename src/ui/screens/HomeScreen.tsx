import { motion } from "motion/react";
import { useIntl } from "react-intl";
import { lossTone, money } from "../game/format";
import { useGame } from "../game/session";
import type { AlertItem } from "../game/types";
import { itemVariants, listVariants, useMotionReady } from "../motion";
import { Stat } from "../widgets";

const CHOICES: Record<string, string[]> = {
  fraud: ["report", "hide"],
  strike: ["settle", "replace"],
  antitrust: ["conditions", "walk"],
  down_round: ["follow", "hold"],
  earnout: ["pay", "litigate"],
  poach: ["pay", "let"],
  continuation: ["roll", "cash"],
  stalking: ["bid", "pass"],
  refi: ["extend", "wait"],
  covenant: ["cure", "waive"],
  auction: ["raise", "walk"],
  roadshow: ["extend", "delay"],
};

export function HomeScreen() {
  const intl = useIntl();
  const { dash, run } = useGame();
  const motionReady = useMotionReady();
  if (!dash) {
    return null;
  }
  const fund = dash.fund;
  function openAlert(item: AlertItem) {
    if (item.template === "alert.fund_ii" || item.template === "alert.fee") {
      window.location.hash = "#/fund";
      return;
    }
    if (item.deal_id) {
      window.location.hash = `#/deal/${item.deal_id}`;
      return;
    }
    if (item.company_id) {
      window.location.hash = `#/company/${item.company_id}`;
    }
  }

  const messages = [
    ...dash.alerts.map((item) => ({
      id: `${item.template}-${item.company_id}-${item.deal_id}`,
      text: intl.formatMessage({ id: item.template }, { company: item.company_ko }),
      action: () => openAlert(item),
    })),
    ...dash.news.map((item) => ({
      id: `news-${item.id}`,
      text: intl.formatMessage({ id: item.template }, { company: item.company_ko, period: item.period }),
      action: item.company_id ? () => { window.location.hash = `#/company/${item.company_id}`; } : undefined,
    })),
  ];

  return (
    <div className="workspace">
      <h2>{intl.formatMessage({ id: "nav.inbox" })}</h2>
      <div className="stat-strip">
        <Stat
          label={intl.formatMessage({ id: "fund.nav" })}
          value={money(intl, fund.nav)}
          amount={fund.nav}
          format={(next) => money(intl, Math.round(next))}
          tone="key"
        />
        <Stat
          label={intl.formatMessage({ id: "fund.dryPowder" })}
          value={money(intl, fund.dry_powder)}
          amount={fund.dry_powder}
          format={(next) => money(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.cash" })}
          value={money(intl, fund.cash)}
          amount={fund.cash}
          format={(next) => money(intl, Math.round(next))}
          tone={lossTone(fund.cash)}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.reputation" })}
          value={intl.formatNumber(fund.reputation)}
          amount={fund.reputation}
          format={(next) => intl.formatNumber(Math.round(next))}
          tone="key"
        />
      </div>
      <section>
        <h2>{intl.formatMessage({ id: "home.events" })}</h2>
        {(dash.events ?? []).length === 0 ? <p className="muted">{intl.formatMessage({ id: "alert.empty" })}</p> : null}
        <motion.div className="card-list" initial={motionReady ? "hidden" : false} animate="show" variants={listVariants}>
        {(dash.events ?? []).map((event) => (
          <motion.article key={event.id} className="event-card" variants={motionReady ? itemVariants : undefined}>
            <h3>{intl.formatMessage({ id: `news.${event.kind}` }, { company: event.company_ko, period: "" })}</h3>
            <div className="hero-actions">
              {(CHOICES[event.kind] ?? []).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="btn-primary"
                  onClick={() => void run({ op: "resolve_event", id: event.id, choice })}
                >
                  {intl.formatMessage({ id: `choice.${event.kind}.${choice}` })}
                </button>
              ))}
            </div>
          </motion.article>
        ))}
        </motion.div>
      </section>
      <ul className="inbox">
        {messages.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={item.action} disabled={!item.action}>
              {item.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
