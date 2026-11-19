import { useT } from "../../i18n/useT";
import { ACHIEVEMENTS, type Difficulty, type GameDate, type Perk, type Rank } from "../../sim/types";
import { Gauge, Meter, Stat, StackBar, Tag } from "../charts";
import { monthsBetween, useFormat } from "../format";
import { useGame } from "../game";
import { Icon } from "../icons";
import { Portrait } from "../Portrait";
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
/** The fund multiple below which a VP or principal is let go at term end: `survival_tvpi_millis` in crates/sim-core/src/world.rs. */
const SURVIVAL_MILLIS: Record<Difficulty, number> = { relaxed: 1100, standard: 1300, hard: 1500 };
/** Committee trust lines: at `pass` a hold counts as a yes, at `block` or below as a no (crates/sim-core/src/story.rs). */
const TRUST = { block: 30, pass: 70 };
/** What personal money buys, thousand USD: `Perk::cost` in crates/sim-core/src/fund.rs. */
const PERKS: { perk: Perk; cost: number }[] = [
  { perk: "industry_club", cost: 150 },
  { perk: "conference_circuit", cost: 300 },
];
/** The founder's team, from the same file: `MAX_ASSOCIATES`, `ASSOCIATE_COST` (thousand USD a year). */
const TEAM = { max: 6, cost: 400 };
/** What the December review does to reputation per objective (crates/sim-core/src/story.rs). */
const REVIEW = { met: 2, missed: 1 };
/** The first rank allowed to open deals outside the home country. */
const CROSS_BORDER_RANK: Rank = "principal";

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
  const game = useGame();
  const { view } = game;
  const { career, fund } = view;
  const survival = SURVIVAL_MILLIS[view.options.difficulty];

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

  const trustMeter = (trust: number) => {
    const tone = trust >= TRUST.pass ? "good" : trust <= TRUST.block ? "bad" : "ink";
    return (
      <div className="chart meter trust" data-tone={tone}>
        <div className="meter-head">
          <span>{t("career.trust")}</span>
          <b>
            {f.integer(trust)}
            {tone === "ink" ? "" : ` · ${t(tone === "good" ? "career.trust.high" : "career.trust.low")}`}
          </b>
        </div>
        <div className="meter-track">
          <span style={{ width: `${Math.min(Math.max(trust, 0), 100)}%` }} />
          <i style={{ left: `${TRUST.block}%` }} />
          <i style={{ left: `${TRUST.pass}%` }} />
        </div>
      </div>
    );
  };

  const savings = Math.max(career.wealth - career.carry_paid, 0);
  const belowPartner = career.rank === "vice_president" || career.rank === "principal";
  const fundWeak = fund.called > 0 && fund.tvpi_millis < survival;
  /** A month index (months since the game opened) as a calendar date, from today's date and index. */
  const dateOf = (month: number): GameDate => {
    const total = view.date.year * 12 + (view.date.month - 1) - (view.month - month);
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
  };
  const earned = new Map(view.achievements.map((item) => [item.achievement, item.month]));
  const objectivesMet = view.objectives.filter((item) => item.met).length;
  const records = view.records;
  const founder = career.rank === "founder";
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
                <div>
                  <dt>{t("career.perk.abroad")}</dt>
                  <dd data-on={index >= RANKS.findIndex((rank) => rank.rank === CROSS_BORDER_RANK)}>
                    {index >= RANKS.findIndex((rank) => rank.rank === CROSS_BORDER_RANK) ? (
                      <Icon name="check" size={14} title={t("career.perk.abroadYes")} />
                    ) : (
                      <Icon name="close" size={14} title={t("career.perk.abroadNo")} />
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
        {view.attention.max !== RANKS[at].attention ? (
          <p className="muted">{t("career.attentionNote", { max: view.attention.max })}</p>
        ) : null}
      </section>

      <section className="grid career-year">
        <div className="card stack">
          <div className="row between">
            <h2 className="card-title">
              <Icon name="check" size={16} />
              {t("career.objectives", { year: view.date.year })}
            </h2>
            <Tag tone={view.objectives.length && objectivesMet === view.objectives.length ? "good" : "muted"}>
              {t("career.checksDone", { done: objectivesMet, total: view.objectives.length })}
            </Tag>
          </div>
          {view.objectives.length ? (
            <ul className="ticks">
              {view.objectives.map((item) => {
                const standing = item.kind === "clean_covenants" || item.kind === "no_rejections";
                const money = item.kind === "deploy_capital";
                return (
                  <li key={item.kind} data-done={item.met} data-broken={standing && !item.met}>
                    <span className="tick">{item.met ? <Icon name="check" size={14} /> : null}</span>
                    <span className="tick-label">
                      {t(`objective.${item.kind}`, { target: item.target, amount: f.money(item.target) })}
                    </span>
                    <b>
                      {standing
                        ? t(item.met ? "career.objective.holding" : "career.objective.broken", { count: item.progress })
                        : money
                          ? `${f.money(item.progress)} / ${f.money(item.target)}`
                          : `${f.integer(item.progress)} / ${f.integer(item.target)}`}
                    </b>
                    <span className="tick-bar">
                      <span style={{ width: `${(standing ? (item.met ? 1 : 0) : ratio(item.progress, item.target)) * 100}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty">{t("career.objectives.none")}</p>
          )}
          <p className="muted">{t("career.objectives.stakes", { up: REVIEW.met, down: REVIEW.missed })}</p>
        </div>

        <div className="card stack">
          <h2 className="card-title">
            <Icon name="layers" size={16} />
            {t("career.options")}
          </h2>
          <ul className="option-list">
            <li>
              <Tag tone={view.options.difficulty === "hard" ? "bad" : view.options.difficulty === "relaxed" ? "good" : "accent"}>
                {t("career.options.difficulty", { name: t(`difficulty.${view.options.difficulty}`) })}
              </Tag>
              <small>{t(`difficulty.${view.options.difficulty}.effect`)}</small>
            </li>
            <li>
              <Tag tone="accent">{t("career.options.era", { name: t(`era.${view.options.era}`) })}</Tag>
              <small>{t(`era.${view.options.era}.effect`)}</small>
            </li>
          </ul>
        </div>
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
              {career.rank === "vice_president" ? <p className="muted">{t("career.principalNote")}</p> : null}
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
                <span>{t("career.fire.fund", { tvpi: f.multiple(survival, 1) })}</span>
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

      <section className="grid career-money">
        <div className="card stack">
          <h2 className="card-title">
            <Icon name="flag" size={16} />
            {t("career.records")}
          </h2>
          <div className="grid cols-2">
            <Stat
              label={t("career.bestMoic")}
              value={records.best_moic_millis ? f.multiple(records.best_moic_millis, 2) : t("term.none")}
              tone={records.best_moic_millis >= 2000 ? "good" : undefined}
            />
            <Stat
              label={t("career.records.fastest")}
              value={records.fastest_exit_months ? months(records.fastest_exit_months) : t("term.none")}
              hint={t("career.records.fastestHint")}
            />
            <Stat
              label={t("career.records.largestDeal")}
              value={records.largest_deal_ev ? f.money(records.largest_deal_ev) : t("term.none")}
            />
            <Stat
              label={t("career.records.largestExit")}
              value={records.largest_exit_proceeds ? f.money(records.largest_exit_proceeds) : t("term.none")}
            />
          </div>
          <Stat
            label={t("career.records.totalProceeds")}
            value={records.total_proceeds ? f.money(records.total_proceeds) : t("term.none")}
            tone={records.total_proceeds > 0 ? "good" : undefined}
          />
        </div>

        <div className="card stack">
          <div className="row between">
            <h2 className="card-title">
              <Icon name="fund" size={16} />
              {t("career.spend")}
            </h2>
            <Tag>{t("career.spend.wealth", { amount: f.money(career.wealth) })}</Tag>
          </div>
          <ul className="perk-list">
            {PERKS.map((item) => {
              const owned = career.perks.includes(item.perk);
              return (
                <li key={item.perk} data-owned={owned}>
                  <div>
                    <strong>{t(`perk.${item.perk}`)}</strong>
                    <small>{t(`perk.${item.perk}.effect`)}</small>
                  </div>
                  {owned ? (
                    <Tag tone="good" icon={<Icon name="check" size={14} />}>
                      {t("career.spend.owned")}
                    </Tag>
                  ) : (
                    <button
                      type="button"
                      className="btn small"
                      disabled={career.wealth < item.cost}
                      onClick={() => game.act({ type: "buy_perk", perk: item.perk })}
                    >
                      {t("career.spend.buy", { amount: f.money(item.cost) })}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <dl className="kv">
            <dt>{t("career.spend.gp")}</dt>
            <dd>{f.money(career.gp_commit)}</dd>
          </dl>
          <button type="button" className="btn small ghost" onClick={() => game.go("fund")}>
            {t("career.spend.gpLink")}
            <Icon name="fund" size={14} />
          </button>
        </div>

        <div className="card stack" data-locked={!founder}>
          <div className="row between">
            <h2 className="card-title">
              <Icon name="handshake" size={16} />
              {t("career.team")}
            </h2>
            <Tag tone={founder ? "accent" : "muted"}>
              {founder
                ? t("career.team.count", { count: career.associates, max: TEAM.max })
                : t("career.team.locked")}
            </Tag>
          </div>
          <div className="team-pips" role="img" aria-label={t("career.team.count", { count: career.associates, max: TEAM.max })}>
            {Array.from({ length: TEAM.max }, (_, index) => (
              <i key={index} data-on={index < career.associates} />
            ))}
          </div>
          <div className="grid cols-2">
            <Stat label={t("career.team.attention")} value={`+${f.integer(career.associates)}`} tone={career.associates ? "good" : undefined} />
            <Stat
              label={t("career.team.payroll")}
              value={f.money(career.associates * TEAM.cost)}
              hint={t("career.perYear")}
              tone={career.associates ? "warn" : undefined}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="btn small"
              disabled={!founder || career.associates >= TEAM.max}
              onClick={() => game.act({ type: "hire_associate" })}
            >
              {t("career.team.hire")}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={!founder || career.associates <= 0}
              onClick={() => game.act({ type: "release_associate" })}
            >
              {t("career.team.release")}
            </button>
          </div>
          <p className="muted">
            {founder ? t("career.team.note", { cost: f.money(TEAM.cost) }) : t("career.team.lockedNote", { cost: f.money(TEAM.cost) })}
          </p>
        </div>
      </section>

      <section className="card stack">
        <div className="row between">
          <h2 className="card-title">
            <Icon name="bolt" size={16} />
            {t("career.achievements")}
          </h2>
          <div className="row achievement-count">
            <Tag tone={earned.size ? "good" : "muted"}>
              {t("career.achievements.count", { done: earned.size, total: ACHIEVEMENTS.length })}
            </Tag>
            <Meter value={earned.size} max={ACHIEVEMENTS.length} tone="good" />
          </div>
        </div>
        <ul className="achievements">
          {ACHIEVEMENTS.map((id) => {
            const month = earned.get(id);
            const done = month !== undefined;
            return (
              <li key={id} data-done={done}>
                <span className="achievement-mark">
                  <Icon name={done ? "check" : "flag"} size={14} />
                </span>
                <strong>{t(`achievement.${id}`)}</strong>
                <small>{t(`achievement.${id}.detail`)}</small>
                {done ? <b>{f.shortDate(dateOf(month))}</b> : null}
              </li>
            );
          })}
        </ul>
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
              <span className="avatar" data-seat={seat}>
                <span aria-hidden>{initial(t(`partner.${seat}.name`))}</span>
                <span className="avatar-face">
                  <Portrait partner={seat} size={52} />
                </span>
              </span>
              <strong>{t(`partner.${seat}.name`)}</strong>
              <Tag>{t(`partner.${seat}.role`)}</Tag>
              <small>{t(`career.partner.${seat}.trait`)}</small>
              {trustMeter(view.partners[seat]?.trust ?? 50)}
            </li>
          ))}
        </ul>
        <p className="muted">{t("career.trust.rule", { pass: TRUST.pass, block: TRUST.block })}</p>
      </section>
    </div>
  );
}
