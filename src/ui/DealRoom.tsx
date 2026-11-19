import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n/useT";
import {
  DD_STREAMS,
  INITIATIVES,
  type CompanyView,
  type DdStream,
  type InitiativeKind,
  type IssueKind,
  type Offer,
  type Stance,
} from "../sim/types";
import { Bridge, Meter, Ring, StackBar, Stat, Tag, Tower } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import "./DealRoom.css";

type Tone = "good" | "bad" | "warn";

/** Which report an issue shows up in. Display grouping only; the sim decides what is found. */
const ISSUE_STREAM: Record<IssueKind, DdStream> = {
  inventory_overstated: "financial",
  customer_concentration: "commercial",
  deferred_maintenance: "operational",
  key_person: "operational",
  environmental_liability: "legal",
  labor_dispute: "legal",
};
const STREAM_ICON: Record<DdStream, string> = {
  financial: "table",
  commercial: "market",
  operational: "bolt",
  legal: "gavel",
};
const STANCE_TONE: Record<Stance, Tone> = {
  for: "good",
  hold: "warn",
  against: "bad",
};
const OUTCOME_TONE = {
  approved: "good",
  held: "warn",
  rejected: "bad",
} as const;
const MAX_PLAN = 3;
const MAX_ROLLOVER_BPS = 3000;
const TURN_STEP = 100;
const STAGE_MONTHS = 6;
const COLOR = {
  price: "var(--ink-soft)",
  fees: "var(--s3)",
  senior: "var(--s1)",
  mezz: "var(--s4)",
  rollover: "var(--s5)",
  equity: "var(--accent)",
};

const floorTo = (value: number, step: number) =>
  Math.floor(value / step) * step;

function sameOffer(a: Offer, b: Offer | null): boolean {
  return (
    b !== null &&
    a.ev === b.ev &&
    a.senior_millis === b.senior_millis &&
    a.mezz_millis === b.mezz_millis &&
    a.rollover_bps === b.rollover_bps &&
    a.plan.length === b.plan.length &&
    a.plan.every((kind) => b.plan.includes(kind))
  );
}

/** Whether the deal tab has a next step waiting on the player. */
export function dealNeedsAction(company: CompanyView): boolean {
  const deal = company.deal;
  if (!deal || deal.bid_submitted) {
    return false;
  }
  if (!deal.offer || !deal.committee) {
    return true;
  }
  const stage = company.sale?.stage;
  return (
    deal.committee.outcome === "approved" &&
    (stage === "bidding" || stage === "exclusive")
  );
}

function Cost({ points }: { points: number }) {
  return (
    <span className="cost" aria-hidden>
      {Array.from({ length: points }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2);
}

/** The deal file: diligence, the offer, the committee and the bid. */
export function DealRoom({ company }: { company: CompanyView }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const deal = company.deal;
  const fin = company.financials;
  const modelEv = fin?.model_ev ?? company.ev[0];
  const maxSenior = view.economy.max_senior_millis;
  const maxMezz = view.economy.max_mezz_millis;

  const [draft, setDraft] = useState<Offer>(
    () =>
      deal?.offer ?? {
        ev: modelEv,
        senior_millis: floorTo(Math.min(maxSenior, 3500), TURN_STEP),
        mezz_millis: 0,
        rollover_bps: 0,
        plan: [],
      },
  );
  const [confirmDrop, setConfirmDrop] = useState(false);

  // When the saved offer changes under the draft (a save, or the closing), follow it.
  const savedKey = deal?.offer ? JSON.stringify(deal.offer) : null;
  useEffect(() => {
    if (savedKey) {
      setDraft(JSON.parse(savedKey) as Offer);
    }
  }, [savedKey]);

  // Lenders can pull back while a draft sits open; never show more than they offer today.
  const offer: Offer = useMemo(
    () => ({
      ...draft,
      senior_millis: Math.min(draft.senior_millis, maxSenior),
      mezz_millis: Math.min(draft.mezz_millis, maxMezz),
      rollover_bps: deal?.can_roll ? draft.rollover_bps : 0,
    }),
    [draft, maxSenior, maxMezz, deal?.can_roll],
  );
  // `company` changes whenever the sim does, so the preview follows the market.
  const preview = useMemo(
    () => game.previewOffer(company.i, offer),
    [offer, company],
  );

  if (!deal) {
    return null;
  }

  const sale = company.sale;
  const locked = deal.bid_submitted;
  const saved = sameOffer(offer, deal.offer);
  const committee = deal.committee;
  const approved = committee?.outcome === "approved";
  const biddable = sale?.stage === "bidding" || sale?.stage === "exclusive";
  const change = (patch: Partial<Offer>) => setDraft({ ...offer, ...patch });

  const evStep = Math.max(1, Math.round(modelEv / 400));
  const evMin = Math.min(Math.round(modelEv * 0.8), offer.ev);
  const evMax = Math.max(Math.round(modelEv * 1.3), offer.ev);

  const togglePlan = (kind: InitiativeKind) => {
    const on = offer.plan.includes(kind);
    if (!on && offer.plan.length >= MAX_PLAN) {
      return;
    }
    const next = on
      ? offer.plan.filter((item) => item !== kind)
      : [...offer.plan, kind];
    change({ plan: INITIATIVES.filter((item) => next.includes(item)) });
  };

  const steps: { key: string; done: boolean }[] = [
    { key: "diligence", done: deal.streams_done.length > 0 },
    { key: "offer", done: deal.offer !== null },
    { key: "committee", done: approved },
    { key: "bid", done: deal.bid_submitted },
  ];
  const nowStep = steps.findIndex((step) => !step.done);

  const financing = preview?.financing;
  const returns = preview?.returns;
  const priceBps = financing?.price_to_model_bps ?? 10000;
  const priceTone: Tone | undefined =
    priceBps > 11500
      ? "bad"
      : priceBps > 10500
        ? "warn"
        : priceBps < 10000
          ? "good"
          : undefined;
  const leverageTone: Tone =
    (financing?.leverage_millis ?? 0) > 5500
      ? "bad"
      : (financing?.leverage_millis ?? 0) > 4500
        ? "warn"
        : "good";
  const coverTone: Tone =
    (financing?.cover_millis ?? 0) < 1500
      ? "bad"
      : (financing?.cover_millis ?? 0) < 2200
        ? "warn"
        : "good";
  const overLimit = financing
    ? financing.equity > view.fund.concentration_limit
    : false;
  const overFund = financing ? financing.equity > view.fund.uncalled : false;
  const moicTone: Tone =
    (returns?.moic_millis ?? 0) >= 2500
      ? "good"
      : (returns?.moic_millis ?? 0) >= 1800
        ? "warn"
        : "bad";
  const irrTone: Tone =
    (returns?.irr_bps ?? 0) >= 2000
      ? "good"
      : (returns?.irr_bps ?? 0) >= 1200
        ? "warn"
        : "bad";

  const bidBlock = locked
    ? null
    : !deal.offer
      ? "dealroom.bid.needsOffer"
      : !approved
        ? "dealroom.bid.needsApproval"
        : !biddable
          ? "dealroom.bid.notBidding"
          : !saved
            ? "dealroom.bid.unsaved"
            : null;

  return (
    <div className="stack dr">
      <ol className="dr-steps">
        {steps.map((step, index) => (
          <li
            key={step.key}
            data-state={step.done ? "done" : index === nowStep ? "now" : "next"}
          >
            <i>{step.done ? <Icon name="check" size={12} /> : index + 1}</i>
            {t(`dealroom.step.${step.key}`)}
          </li>
        ))}
      </ol>

      {/* ---------- diligence ---------- */}
      <section className="card">
        <h3>
          <Icon name="search" size={14} />
          {t("dealroom.diligence")}
          <span className="dr-aside muted">
            {t("dealroom.diligence.spent", { amount: f.money(deal.costs) })}
          </span>
        </h3>
        <ul className="dr-streams">
          {DD_STREAMS.map((stream) => {
            const done = deal.streams_done.includes(stream);
            const running = deal.streams_running.includes(stream);
            const found = company.issues.filter(
              (issue) => issue.found && ISSUE_STREAM[issue.kind] === stream,
            );
            return (
              <li
                key={stream}
                data-state={done ? "done" : running ? "running" : "idle"}
              >
                <div className="dr-stream-head">
                  <Icon name={STREAM_ICON[stream]} size={16} />
                  <strong>{t(`stream.${stream}`)}</strong>
                  {done ? (
                    <Tag
                      tone={found.length ? "warn" : "good"}
                      icon={<Icon name="check" size={12} />}
                    >
                      {t("dealroom.stream.done")}
                    </Tag>
                  ) : running ? (
                    <Tag tone="accent" icon={<Icon name="clock" size={12} />}>
                      {t("dealroom.stream.running")}
                    </Tag>
                  ) : (
                    <Tag tone="muted">{t("dealroom.stream.idle")}</Tag>
                  )}
                </div>
                {done ? (
                  <div className="dr-found">
                    {found.length ? (
                      found.map((issue) => (
                        <Tag
                          key={issue.kind}
                          tone="bad"
                          icon={<Icon name="alert" size={12} />}
                        >
                          {t(`issue.${issue.kind}`)}
                        </Tag>
                      ))
                    ) : (
                      <span className="muted">
                        {t("dealroom.stream.clean")}
                      </span>
                    )}
                  </div>
                ) : running ? (
                  <span className="muted">{t("dealroom.stream.arrives")}</span>
                ) : (
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      game.act({
                        type: "run_diligence",
                        company: company.i,
                        stream,
                      })
                    }
                  >
                    {t("dealroom.stream.run", {
                      cost: f.money(deal.diligence_cost),
                    })}
                    <Cost points={1} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- offer ---------- */}
      <section className="card">
        <h3>
          <Icon name="layers" size={14} />
          {t("dealroom.offer")}
          {locked ? (
            <Tag tone="good">{t("dealroom.bid.submitted")}</Tag>
          ) : deal.offer ? (
            <Tag tone={saved ? "good" : "warn"}>
              {t(saved ? "dealroom.offer.saved" : "dealroom.offer.changed")}
            </Tag>
          ) : (
            <Tag tone="muted">{t("dealroom.offer.draft")}</Tag>
          )}
        </h3>
        <fieldset className="dr-sliders" disabled={locked}>
          <div className="slider">
            <label htmlFor="dr-ev">{t("dealroom.offer.ev")}</label>
            <output>{f.money(offer.ev)}</output>
            <input
              id="dr-ev"
              type="range"
              min={evMin}
              max={evMax}
              step={evStep}
              value={offer.ev}
              onChange={(event) => change({ ev: Number(event.target.value) })}
            />
            <small className="dr-slider-notes">
              <span>
                {financing
                  ? t("dealroom.offer.evMultiple", {
                      multiple: f.multiple(financing.multiple_millis),
                    })
                  : null}
              </span>
              <b data-tone={priceTone}>
                {t("dealroom.offer.vsModel", { pct: f.pct(priceBps, 0) })}
              </b>
              <button
                type="button"
                className="dr-link"
                onClick={() => change({ ev: modelEv })}
              >
                {t("dealroom.offer.atModel")}
              </button>
            </small>
          </div>
          <div className="slider">
            <label htmlFor="dr-senior">{t("dealroom.offer.senior")}</label>
            <output>
              {f.multiple(offer.senior_millis)}
              {financing ? <small> · {f.money(financing.senior)}</small> : null}
            </output>
            <input
              id="dr-senior"
              type="range"
              min={0}
              max={maxSenior}
              step={TURN_STEP}
              value={offer.senior_millis}
              onChange={(event) =>
                change({ senior_millis: Number(event.target.value) })
              }
            />
            <small>
              {t("dealroom.offer.lenderMax", {
                max: f.multiple(maxSenior),
                rate: f.pct(view.economy.senior_rate_bps, 2),
              })}
            </small>
          </div>
          <div className="slider">
            <label htmlFor="dr-mezz">{t("dealroom.offer.mezz")}</label>
            <output>
              {f.multiple(offer.mezz_millis)}
              {financing ? <small> · {f.money(financing.mezz)}</small> : null}
            </output>
            <input
              id="dr-mezz"
              type="range"
              min={0}
              max={maxMezz}
              step={TURN_STEP}
              value={offer.mezz_millis}
              onChange={(event) =>
                change({ mezz_millis: Number(event.target.value) })
              }
            />
            <small>
              {t("dealroom.offer.lenderMax", {
                max: f.multiple(maxMezz),
                rate: f.pct(view.economy.mezz_rate_bps, 2),
              })}
            </small>
          </div>
          {deal.can_roll ? (
            <div className="slider">
              <label htmlFor="dr-roll">{t("dealroom.offer.rollover")}</label>
              <output>
                {f.pct(offer.rollover_bps, 0)}
                {financing ? (
                  <small> · {f.money(financing.rollover)}</small>
                ) : null}
              </output>
              <input
                id="dr-roll"
                type="range"
                min={0}
                max={MAX_ROLLOVER_BPS}
                step={100}
                value={offer.rollover_bps}
                onChange={(event) =>
                  change({ rollover_bps: Number(event.target.value) })
                }
              />
              <small>{t("dealroom.offer.rolloverHint")}</small>
            </div>
          ) : null}
        </fieldset>

        <div className="dr-plan">
          <div className="dr-plan-head">
            <span>{t("dealroom.plan")}</span>
            <b>{`${offer.plan.length}/${MAX_PLAN}`}</b>
          </div>
          <ul>
            {INITIATIVES.map((kind) => {
              const on = offer.plan.includes(kind);
              return (
                <li key={kind}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={locked || (!on && offer.plan.length >= MAX_PLAN)}
                    onClick={() => togglePlan(kind)}
                  >
                    <i>{on ? <Icon name="check" size={12} /> : null}</i>
                    <span>
                      <b>{t(`initiative.${kind}`)}</b>
                      <small>{t(`initiative.${kind}.effect`)}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ---------- what the draft means ---------- */}
      {financing && returns ? (
        <>
          <section className="card">
            <h3>{t("dealroom.structure")}</h3>
            <div className="dr-structure">
              <div className="stack dr-bars">
                <StackBar
                  title={t("dealroom.uses")}
                  total={f.money(offer.ev + financing.fees)}
                  parts={[
                    {
                      label: t("dealroom.price"),
                      value: offer.ev,
                      note: f.money(offer.ev),
                      color: COLOR.price,
                    },
                    {
                      label: t("dealroom.fees"),
                      value: financing.fees,
                      note: f.money(financing.fees),
                      color: COLOR.fees,
                    },
                  ]}
                />
                <StackBar
                  title={t("dealroom.sources")}
                  total={f.money(
                    financing.debt + financing.rollover + financing.equity,
                  )}
                  parts={[
                    {
                      label: t("dealroom.senior"),
                      value: financing.senior,
                      note: f.money(financing.senior),
                      color: COLOR.senior,
                    },
                    {
                      label: t("dealroom.mezz"),
                      value: financing.mezz,
                      note: f.money(financing.mezz),
                      color: COLOR.mezz,
                    },
                    {
                      label: t("dealroom.rollover"),
                      value: financing.rollover,
                      note: f.money(financing.rollover),
                      color: COLOR.rollover,
                    },
                    {
                      label: t("dealroom.fundEquity"),
                      value: financing.equity,
                      note: f.money(financing.equity),
                      color: COLOR.equity,
                    },
                  ].filter((part) => part.value > 0)}
                />
              </div>
              <Tower
                height={150}
                parts={[
                  {
                    label: t("dealroom.senior"),
                    value: financing.senior,
                    note: f.multiple(offer.senior_millis),
                    color: COLOR.senior,
                  },
                  {
                    label: t("dealroom.mezz"),
                    value: financing.mezz,
                    note: f.multiple(offer.mezz_millis),
                    color: COLOR.mezz,
                  },
                  {
                    label: t("dealroom.rollover"),
                    value: financing.rollover,
                    note: f.pct(offer.rollover_bps, 0),
                    color: COLOR.rollover,
                  },
                  {
                    label: t("dealroom.fundEquity"),
                    value: financing.equity,
                    note: f.pct(financing.ownership_bps, 0),
                    color: COLOR.equity,
                  },
                ]}
              />
            </div>
            <div className="dr-stats">
              <Stat
                label={t("dealroom.entryMultiple")}
                value={f.multiple(financing.multiple_millis)}
                hint={
                  fin
                    ? t("dealroom.modelMultiple", {
                        multiple: f.multiple(fin.multiple_millis),
                      })
                    : undefined
                }
              />
              <Stat
                label={t("dealroom.priceVsModel")}
                value={f.pct(priceBps, 0)}
                tone={priceTone}
              />
              <Stat
                label={t("term.leverage")}
                value={f.multiple(financing.leverage_millis)}
                tone={leverageTone}
              />
              <Stat
                label={t("term.cover")}
                value={f.multiple(financing.cover_millis)}
                tone={coverTone}
                hint={t("dealroom.interest", {
                  amount: f.money(financing.annual_interest),
                })}
              />
            </div>
            <div className="dr-checks">
              <Meter
                label={t("dealroom.vsLimit")}
                text={`${f.money(financing.equity)} / ${f.money(view.fund.concentration_limit)}`}
                value={financing.equity}
                max={view.fund.concentration_limit}
                tone={
                  overLimit
                    ? "bad"
                    : financing.equity > view.fund.concentration_limit * 0.8
                      ? "warn"
                      : "good"
                }
              />
              <Meter
                label={t("dealroom.vsUncalled")}
                text={`${f.money(financing.equity)} / ${f.money(view.fund.uncalled)}`}
                value={financing.equity}
                max={view.fund.uncalled}
                tone={overFund ? "bad" : "ink"}
              />
              {overLimit || overFund ? (
                <div className="row">
                  {overLimit ? (
                    <Tag tone="bad">{t("dealroom.overLimit")}</Tag>
                  ) : null}
                  {overFund ? (
                    <Tag tone="bad">{t("dealroom.overFund")}</Tag>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <section className="card">
            <h3>
              {t("dealroom.baseCase")}
              <span className="dr-aside muted">
                {t("dealroom.baseCase.note")}
              </span>
            </h3>
            <div className="dr-returns">
              <Stat
                label={t("term.moic")}
                value={f.multiple(returns.moic_millis, 2)}
                tone={moicTone}
              />
              <Stat
                label={t("term.irr")}
                value={f.pct(returns.irr_bps)}
                tone={irrTone}
              />
              <Stat
                label={t("dealroom.exitEbitda")}
                value={f.money(returns.exit_ebitda)}
                hint={t("dealroom.fromEbitda", {
                  amount: f.money(financing.ebitda),
                })}
              />
            </div>
            <Bridge
              height={130}
              format={f.money}
              start={{
                label: t("dealroom.bridge.entry"),
                value: financing.equity,
              }}
              steps={[
                {
                  label: t("dealroom.bridge.ebitda"),
                  value: returns.from_ebitda,
                },
                {
                  label: t("dealroom.bridge.multiple"),
                  value: returns.from_multiple,
                },
                { label: t("dealroom.bridge.debt"), value: returns.from_debt },
              ]}
              end={{
                label: t("dealroom.bridge.exit"),
                value: returns.proceeds,
              }}
            />
          </section>
        </>
      ) : (
        <section className="card empty">{t("dealroom.previewNone")}</section>
      )}

      {/* ---------- save and committee ---------- */}
      <section className="card">
        <h3>
          <Icon name="gavel" size={14} />
          {t("dealroom.committee")}
          {committee ? (
            <span className="dr-aside muted">{f.date(committee.date)}</span>
          ) : null}
        </h3>
        {committee ? (
          <>
            <div
              className="dr-outcome"
              data-tone={OUTCOME_TONE[committee.outcome]}
            >
              <strong>{t(`outcome.${committee.outcome}`)}</strong>
              <ul className="dr-tally">
                {(["for", "hold", "against"] as Stance[]).map((stance) => (
                  <li key={stance} data-tone={STANCE_TONE[stance]}>
                    <b>
                      {
                        committee.votes.filter((vote) => vote.stance === stance)
                          .length
                      }
                    </b>
                    {t(`stance.${stance}`)}
                  </li>
                ))}
              </ul>
            </div>
            <ul className="dr-seats">
              {committee.votes.map((vote) => {
                const name = t(`partner.${vote.partner}.name`);
                return (
                  <li key={vote.partner} data-tone={STANCE_TONE[vote.stance]}>
                    <span className="dr-avatar" aria-hidden>
                      {initials(name)}
                    </span>
                    <div className="dr-seat-main">
                      <div className="dr-seat-head">
                        <span>
                          <b>{name}</b>
                          <small>{t(`partner.${vote.partner}.role`)}</small>
                        </span>
                        <Tag tone={STANCE_TONE[vote.stance]}>
                          {t(`stance.${vote.stance}`)}
                        </Tag>
                      </div>
                      {vote.concerns.length ? (
                        <div className="dr-found">
                          {vote.concerns.map((concern) => (
                            <Tag key={concern}>{t(`concern.${concern}`)}</Tag>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted">
            {t(
              deal.offer
                ? "dealroom.committee.none"
                : "dealroom.committee.needsOffer",
            )}
          </p>
        )}
        {locked ? null : (
          <>
            <div className="dr-actions">
              <button
                type="button"
                className={saved ? "btn" : "btn primary"}
                disabled={saved || !preview}
                onClick={() =>
                  game.act({ type: "set_offer", company: company.i, offer })
                }
              >
                {t("dealroom.offer.save")}
              </button>
              <button
                type="button"
                className={saved && !committee ? "btn primary" : "btn"}
                disabled={!saved || Boolean(committee)}
                onClick={() =>
                  game.act({ type: "submit_ic", company: company.i })
                }
              >
                {t("dealroom.committee.submit")}
                <Cost points={1} />
              </button>
            </div>
            <p className="dr-note">
              {t(
                committee && !saved
                  ? "dealroom.committee.willReset"
                  : "dealroom.committee.resetNote",
              )}
            </p>
          </>
        )}
      </section>

      {/* ---------- bid ---------- */}
      <section className="card">
        <h3>
          <Icon name="flag" size={14} />
          {t("dealroom.bid")}
          {locked || sale?.bid_in ? (
            <Tag tone="good">{t("dealroom.bid.submitted")}</Tag>
          ) : null}
        </h3>
        <div className="dr-bid">
          {sale ? (
            <Ring
              fraction={sale.months_left / STAGE_MONTHS}
              size={48}
              tone={sale.months_left <= 1 ? "bad" : "accent"}
            >
              {sale.months_left}
            </Ring>
          ) : null}
          <div className="dr-bid-main">
            {sale ? (
              <div className="row">
                <Tag tone={biddable ? "accent" : undefined}>
                  {t(`stage.${sale.stage}`)}
                </Tag>
                <span className="muted">
                  {t("dealroom.bid.monthsLeft", { months: sale.months_left })}
                </span>
              </div>
            ) : null}
            <span className="muted">
              {t(
                sale?.stage === "exclusive"
                  ? "dealroom.bid.exclusiveNote"
                  : "dealroom.bid.resolves",
              )}
            </span>
          </div>
          <Stat
            label={t("dealroom.bid.certainty")}
            value={`+${f.pct(deal.certainty_bps, 1)}`}
            tone="good"
          />
        </div>
        {locked ? (
          <p className="dr-note" data-tone="good">
            {t("dealroom.bid.waiting", {
              ev: f.money(deal.offer?.ev ?? offer.ev),
            })}
          </p>
        ) : null}
        <div className="dr-actions">
          {locked ? null : (
            <button
              type="button"
              className="btn primary"
              disabled={bidBlock !== null}
              onClick={() =>
                game.act({ type: "submit_bid", company: company.i })
              }
            >
              {t("dealroom.bid.submit")}
            </button>
          )}
          {confirmDrop ? (
            <span className="dr-confirm">
              <span>
                {t(
                  approved
                    ? "dealroom.drop.confirmApproved"
                    : "dealroom.drop.confirm",
                )}
              </span>
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  game.act({ type: "drop_deal", company: company.i })
                }
              >
                {t("action.confirm")}
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => setConfirmDrop(false)}
              >
                {t("action.cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn ghost dr-drop"
              onClick={() => setConfirmDrop(true)}
            >
              {t("dealroom.drop")}
            </button>
          )}
        </div>
        {bidBlock ? (
          <p className="dr-note" data-tone="warn">
            {t(bidBlock)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
