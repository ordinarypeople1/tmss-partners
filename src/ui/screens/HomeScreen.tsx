import { motion } from "motion/react";
import { useIntl } from "react-intl";
import { lossTone, money, multiple, percentFromBps } from "../game/format";
import { useGame } from "../game/session";
import type { AlertItem } from "../game/types";
import { itemVariants, listVariants, useMotionReady } from "../motion";
import { AlertList, NewsList, Stat } from "../widgets";

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

  return (
    <div className="workspace">
      <p className="muted">
        {intl.formatMessage(
          { id: "fund.terms" },
          {
            commitments: money(intl, fund.commitments),
            years: fund.investment_period_years,
            term: fund.term_years,
            fee: percentFromBps(intl, fund.fee_bps),
            hurdle: percentFromBps(intl, fund.hurdle_bps),
            carry: percentFromBps(intl, fund.carry_bps),
          },
        )}
      </p>
      <p className="muted">{intl.formatMessage({ id: "fund.markNote" })}</p>
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
          label={intl.formatMessage({ id: "fund.called" })}
          value={money(intl, fund.paid_in)}
          amount={fund.paid_in}
          format={(next) => money(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.uncalled" })}
          value={money(intl, fund.uncalled)}
          amount={fund.uncalled}
          format={(next) => money(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.irr" })}
          value={percentFromBps(intl, fund.irr_bps)}
          amount={fund.irr_bps}
          format={(next) => percentFromBps(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.moic" })}
          value={multiple(intl, fund.moic_millis)}
          amount={fund.moic_millis}
          format={(next) => multiple(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.dpi" })}
          value={multiple(intl, fund.dpi_millis)}
          amount={fund.dpi_millis}
          format={(next) => multiple(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.tvpi" })}
          value={multiple(intl, fund.tvpi_millis)}
          amount={fund.tvpi_millis}
          format={(next) => multiple(intl, Math.round(next))}
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
      <p className="muted">
        {intl.formatMessage({ id: "home.holdings" }, { count: dash.holdings })}
        {" · "}
        {intl.formatMessage({ id: "home.deals" }, { count: dash.deals })}
      </p>
      <section>
        <h2 className="section-title">
          {intl.formatMessage(
            { id: "home.section" },
            { label: intl.formatMessage({ id: "home.events" }), count: dash.events?.length ?? 0 },
          )}
        </h2>
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
      <div className="split">
        <section>
          <h2 className="section-label">{intl.formatMessage({ id: "home.news" })}</h2>
          <NewsList items={dash.news} />
        </section>
        <section>
          <h2 className="section-label">{intl.formatMessage({ id: "home.alerts" })}</h2>
          <AlertList items={dash.alerts} onOpen={openAlert} />
        </section>
      </div>
    </div>
  );
}
