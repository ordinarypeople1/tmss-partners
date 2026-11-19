import { useT } from "../../i18n/useT";
import type { Rank } from "../../sim/types";
import { Gauge, Meter, Stat, StackBar, Tag } from "../charts";
import { monthsBetween, useFormat } from "../format";
import { useGame } from "../game";
import { Icon } from "../icons";
import "./Career.css";

/**
 * What each rank carries. Fixed sim constants, copied for display only:
 * see `impl Rank` and `Career::promotion` in crates/sim-core/src/fund.rs.
 * Salary is thousand USD a year.
 */
const RANKS: { rank: Rank; attention: number; deals: number; initiatives: number; carryBps: number; salary: number }[] = [
  { rank: "vice_president", attention: 4, deals: 2, initiatives: 1, carryBps: 100, salary: 350 },
  { rank: "principal", attention: 6, deals: 4, initiatives: 2, carryBps: 500, salary: 700 },
  { rank: "partner", attention: 8, deals: 6, initiatives: 3, carryBps: 1500, salary: 1600 },
  { rank: "founder", attention: 10, deals: 8, initiatives: 3, carryBps: 6000, salary: 2500 },
];
/** Promotion and dismissal thresholds, from the same file. */
const RULES = {
  fireBelow: 15,
  weakFundMillis: 1300,
  principal: { deals: 1, reputation: 56, months: 18 },
  partner: { reputation: 68, months: 24, moicMillis: 1800, deals: 3, tvpiMillis: 1350 },
  founder: { reputation: 70 },
};
const MOVES: { id: string; up: boolean }[] = [
  { id: "icApproved", up: true },
  { id: "dealClosed", up: true },
  { id: "strongExit", up: true },
  { id: "icRejected", up: false },
  { id: "weakExit", up: false },
  { id: "covenantBreach", up: false },
  { id: "strike", up: false },
  { id: "hidBadNews", up: false },
  { id: "droppedDeal", up: false },
  { id: "noDeals", up: false },
];
const PARTNERS = [0, 1, 2, 3, 4, 5];

interface Check {
  id: string;
  label: string;
  now: string;
  done: boolean;
  /** 0 to 1. */
  progress: number;
}

export function Career() {
  const t = useT();
  const f = useFormat();
  const { view } = useGame();
  const { career, fund } = view;

  const at = Math.max(RANKS.findIndex((item) => item.rank === career.rank), 0);
  const next = RANKS[at + 1]?.rank ?? null;
  const termLeft = Math.max(monthsBetween(view.date, fund.term_ends), 0);
  const termMonths = Math.max(monthsBetween(fund.started, fund.term_ends), 1);

  const months = (count: number) => t("format.months", { months: count });
  const ratio = (value: number, goal: number) => Math.min(Math.max(value / (goal || 1), 0), 1);

  let checks: Check[] = [];
  let either: Check[] = [];
  let threshold: number | null = null;
  if (career.rank === "vice_president") {
    const rule = RULES.principal;
    threshold = rule.reputation;
    checks = [
      {
        id: "deals",
        label: t("career.need.deals", { count: rule.deals }),
        now: f.integer(career.deals_closed),
        done: career.deals_closed >= rule.deals,
        progress: ratio(career.deals_closed, rule.deals),
      },
      {
        id: "reputation",
        label: t("career.need.reputation", { value: rule.reputation }),
        now: f.integer(career.reputation),
        done: career.reputation >= rule.reputation,
        progress: ratio(career.reputation, rule.reputation),
      },
      {
        id: "months",
        label: t("career.need.months", { months: rule.months }),
        now: months(career.months_at_rank),
        done: career.months_at_rank >= rule.months,
        progress: ratio(career.months_at_rank, rule.months),
      },
    ];
  } else if (career.rank === "principal") {
    const rule = RULES.partner;
    threshold = rule.reputation;
    checks = [
      {
        id: "reputation",
        label: t("career.need.reputation", { value: rule.reputation }),
        now: f.integer(career.reputation),
        done: career.reputation >= rule.reputation,
        progress: ratio(career.reputation, rule.reputation),
      },
      {
        id: "months",
        label: t("career.need.months", { months: rule.months }),
        now: months(career.months_at_rank),
        done: career.months_at_rank >= rule.months,
        progress: ratio(career.months_at_rank, rule.months),
      },
    ];
    either = [
      {
        id: "moic",
        label: t("career.need.moic", { moic: f.multiple(rule.moicMillis) }),
        now: career.exits ? f.multiple(career.best_moic_millis, 2) : t("term.none"),
        done: career.best_moic_millis >= rule.moicMillis,
        progress: ratio(career.best_moic_millis, rule.moicMillis),
      },
      {
        id: "record",
        label: t("career.need.record", { count: rule.deals, tvpi: f.multiple(rule.tvpiMillis, 2) }),
        now: t("career.need.recordNow", { count: career.deals_closed, tvpi: f.multiple(fund.tvpi_millis, 2) }),
        done: career.deals_closed >= rule.deals && fund.tvpi_millis >= rule.tvpiMillis,
        progress: (ratio(career.deals_closed, rule.deals) + ratio(fund.tvpi_millis, rule.tvpiMillis)) / 2,
      },
    ];
  } else if (career.rank === "partner") {
    const rule = RULES.founder;
    threshold = rule.reputation;
    checks = [
      {
        id: "reputation",
        label: t("career.need.reputation", { value: rule.reputation }),
        now: f.integer(career.reputation),
        done: career.reputation >= rule.reputation,
        progress: ratio(career.reputation, rule.reputation),
      },
      {
        id: "term",
        label: t("career.need.term"),
        now: t("career.need.termNow", { months: termLeft }),
        done: termLeft === 0,
        progress: 1 - termLeft / termMonths,
      },
    ];
  }

  const tick = (check: Check) => (
    <li key={check.id} data-done={check.done}>
      <span className="tick">{check.done ? <Icon name="check" size={14} /> : null}</span>
      <span className="tick-label">{check.label}</span>
      <b>{check.now}</b>
      <span className="tick-bar">
        <span style={{ width: `${check.progress * 100}%` }} />
      </span>
    </li>
  );

  const savings = Math.max(career.wealth - career.carry_paid, 0);
  const belowPartner = career.rank === "vice_president" || career.rank === "principal";
  const fundWeak = fund.called > 0 && fund.tvpi_millis < RULES.weakFundMillis;
  const initial = (name: string) =>
    name
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2);

  return (
    <div className="career stack">
      <header className="page-head">
        <div>
          <h1>{t("career.title")}</h1>
          <p>{t("career.lead")}</p>
        </div>
        <div className="row">
          <Tag tone="accent" icon={<Icon name="career" size={14} />}>
            {t(`rank.${career.rank}`)}
          </Tag>
          <Tag>{t(`app.house.${view.house}`)}</Tag>
          {career.fired ? <Tag tone="bad">{t("career.fired")}</Tag> : null}
        </div>
      </header>

      <section className="card stack">
        <h2 className="card-title">
          <Icon name="flag" size={16} />
          {t("career.ladder")}
        </h2>
        <ol className="ladder">
          {RANKS.map((item, index) => (
            <li key={item.rank} data-state={index < at ? "past" : index === at ? "now" : "ahead"}>
              <span className="ladder-node">{index < at ? <Icon name="check" size={14} /> : index + 1}</span>
              <span className="row">
                <strong>{t(`rank.${item.rank}`)}</strong>
                {index === at ? <Tag tone="accent">{t("career.atRank", { months: career.months_at_rank })}</Tag> : null}
              </span>
              <dl className="ladder-perks">
                <div>
                  <dt>{t("career.perk.attention")}</dt>
                  <dd>{f.integer(item.attention)}</dd>
                </div>
                <div>
                  <dt>{t("career.perk.deals")}</dt>
                  <dd>{f.integer(item.deals)}</dd>
                </div>
                <div>
                  <dt>{t("career.perk.initiatives")}</dt>
                  <dd>{f.integer(item.initiatives)}</dd>
                </div>
                <div>
                  <dt>{t("career.perk.carry")}</dt>
                  <dd>{f.pct(item.carryBps, 0)}</dd>
                </div>
                <div>
                  <dt>{t("career.perk.salary")}</dt>
                  <dd>{f.money(item.salary)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid career-mid">
        <div className="card stack">
          <div className="row between">
            <h2 className="card-title">
              <Icon name="up" size={16} />
              {next ? t("career.promotion", { rank: t(`rank.${next}`) }) : t("career.top")}
            </h2>
            {next ? (
              <Tag tone={checks.every((check) => check.done) && (either.length === 0 || either.some((check) => check.done)) ? "good" : "muted"}>
                {t("career.checksDone", {
                  done: checks.filter((check) => check.done).length + (either.some((check) => check.done) ? 1 : 0),
                  total: checks.length + (either.length ? 1 : 0),
                })}
              </Tag>
            ) : null}
          </div>
          {next ? (
            <>
              <ul className="ticks">{checks.map(tick)}</ul>
              {either.length ? (
                <>
                  <p className="muted">{t("career.eitherOf")}</p>
                  <ul className="ticks either">{either.map(tick)}</ul>
                </>
              ) : null}
              {career.rank === "partner" ? <p className="muted">{t("career.founderNote")}</p> : null}
            </>
          ) : (
            <p className="muted">{t("career.topNote")}</p>
          )}
          <div className="fire-lines">
            <h3 className="card-title">
              <Icon name="alert" size={16} />
              {t("career.fireTitle")}
            </h3>
            <ul>
              <li data-risk={career.reputation < RULES.fireBelow + 10}>
                <span>{t("career.fire.reputation", { value: RULES.fireBelow })}</span>
                <Tag tone={career.reputation < RULES.fireBelow + 10 ? "bad" : "good"}>
                  {t("career.reputationNow", { value: career.reputation })}
                </Tag>
              </li>
              <li data-risk={belowPartner && fundWeak}>
                <span>{t("career.fire.fund", { tvpi: f.multiple(RULES.weakFundMillis, 1) })}</span>
                <Tag tone={!belowPartner ? "muted" : fundWeak ? "warn" : "good"}>
                  {belowPartner ? t("career.tvpiNow", { tvpi: f.multiple(fund.tvpi_millis, 2) }) : t("career.fire.exempt")}
                </Tag>
              </li>
            </ul>
          </div>
        </div>

        <div className="card stack">
          <h2 className="card-title">
            <Icon name="eye" size={16} />
            {t("shell.reputation")}
          </h2>
          <div className="reputation">
            <Gauge
              value={career.reputation}
              max={100}
              limit={RULES.fireBelow}
              higherIsWorse={false}
              label={t("shell.reputation")}
              text={f.integer(career.reputation)}
              limitText={t("career.fireLine", { value: RULES.fireBelow })}
            />
            <div className="stack">
              <Meter
                label={threshold === null ? t("shell.reputation") : t("career.nextThreshold", { value: threshold })}
                text={`${f.integer(career.reputation)} / 100`}
                value={career.reputation}
                max={100}
                marker={threshold ?? undefined}
                tone={threshold !== null && career.reputation >= threshold ? "good" : "accent"}
              />
              <p className="muted">{t("career.reputationNote")}</p>
            </div>
          </div>
          <ul className="moves">
            {MOVES.map((move) => (
              <li key={move.id} data-up={move.up}>
                <Icon name={move.up ? "up" : "down"} size={14} />
                {t(`career.move.${move.id}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="stack">
          <div className="card stack">
            <h2 className="card-title">
              <Icon name="table" size={16} />
              {t("career.record")}
            </h2>
            <div className="grid cols-2">
              <Stat label={t("career.dealsClosed")} value={f.integer(career.deals_closed)} tone={career.deals_closed ? "good" : undefined} />
              <Stat label={t("career.exits")} value={f.integer(career.exits)} tone={career.exits ? "good" : undefined} />
              <Stat
                label={t("career.bestMoic")}
                value={career.exits ? f.multiple(career.best_moic_millis, 2) : t("term.none")}
                tone={!career.exits ? undefined : career.best_moic_millis >= 1800 ? "good" : career.best_moic_millis >= 1000 ? "warn" : "bad"}
              />
              <Stat label={t("career.monthsAtRank")} value={months(career.months_at_rank)} />
            </div>
            <dl className="kv">
              <dt>{t("shell.attention")}</dt>
              <dd>
                {f.integer(view.attention.left)} / {f.integer(view.attention.max)}
              </dd>
              <dt>{t("career.perk.deals")}</dt>
              <dd>
                {f.integer(view.deals.length)} / {f.integer(view.limits.deals)}
              </dd>
              <dt>{t("career.perk.initiatives")}</dt>
              <dd>{f.integer(view.limits.initiatives)}</dd>
            </dl>
          </div>

          <div className="card stack">
            <h2 className="card-title">
              <Icon name="fund" size={16} />
              {t("career.wealth")}
            </h2>
            <div className="grid cols-2">
              <Stat label={t("career.savings")} value={f.money(career.wealth)} />
              <Stat label={t("career.salary")} value={f.money(career.salary)} hint={t("career.perYear")} />
            </div>
            <StackBar
              parts={[
                { label: t("career.savingsOwn"), value: savings, note: f.money(savings), color: "var(--s1)" },
                { label: t("career.carryPaid"), value: career.carry_paid, note: f.money(career.carry_paid), color: "var(--good)" },
                { label: t("career.carryAccrued"), value: career.carry_accrued, note: f.money(career.carry_accrued), color: "var(--accent-soft)" },
              ]}
            />
            <p className="muted">{t("career.carryNote", { share: f.pct(career.carry_share_bps, 0) })}</p>
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2 className="card-title">
            <Icon name="handshake" size={16} />
            {t("career.house")}
          </h2>
          <div className="row">
            <Tag tone="accent">{t(`app.house.${view.house}`)}</Tag>
            <Tag>{fund.name}</Tag>
          </div>
        </div>
        <ul className="partners">
          {PARTNERS.map((seat) => (
            <li key={seat}>
              <span className="avatar" data-seat={seat} aria-hidden>
                {initial(t(`partner.${seat}.name`))}
              </span>
              <strong>{t(`partner.${seat}.name`)}</strong>
              <Tag>{t(`partner.${seat}.role`)}</Tag>
              <small>{t(`career.partner.${seat}.trait`)}</small>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
