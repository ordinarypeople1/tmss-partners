import { Indication, ProcessCard } from "./Process";
import { ValuationCard } from "./Valuation";
import { IcMeetingDialog } from "./IcMeeting";
import { ReportDialog, ReportSummary } from "./DiligenceReport";
import { gate } from "./Gate";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useT } from "../i18n/useT";
import {
  DD_STREAMS,
  INITIATIVES,
  type CompanyView,
  type Concern,
  type DdStream,
  type InitiativeKind,
  type MezzKind,
  type IssueKind,
  type Offer,
  type Stance,
} from "../sim/types";
import { Bridge, Meter, Ring, StackBar, Stat, Tag, Tower } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import { bidderName } from "./messages";
import { Portrait } from "./Portrait";
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
/**
 * How each rival house bids. Mirrors `HOUSE_STYLES` in
 * crates/sim-core/src/market.rs (index = house number): the sign of its bid
 * bias and its focus sector. Shown as a hint; the sim prices the bids.
 */
const HOUSE_STYLES: { aggression: -1 | 0 | 1; focus: string | null }[] = [
  { aggression: -1, focus: "industrial_components" },
  { aggression: 1, focus: "healthcare_services" },
  { aggression: 0, focus: "cold_chain_logistics" },
  { aggression: 1, focus: null },
  { aggression: -1, focus: "building_products" },
  { aggression: 1, focus: "business_services" },
  { aggression: -1, focus: "food_manufacturing" },
  { aggression: 1, focus: null },
];
/** The concerns each seat has a spoken line for in the catalog (`dealroom.say.<seat>.<concern>`). */
const SEAT_LINES: Concern[][] = [
  ["leverage", "price", "interest_cover", "no_financial_dd"],
  ["no_operational_dd", "inventory_days"],
  ["thin_returns", "multiple_reliance", "no_commercial_dd"],
  ["downside", "no_legal_dd", "open_issue"],
  ["no_plan", "no_operational_dd", "layoffs_in_union_shop"],
  ["fund_concentration", "layoffs_in_union_shop", "open_issue"],
];
/** Partner trust marks: a doubt passes at 70, and becomes a no at 30. */
const TRUST_LOW = 30;
const TRUST_HIGH = 70;
/** New shares at most 30% of the price, as in the sim. */
const MAX_PRIMARY_SHARE = 0.3;
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
    (a.mezz_kind ?? "notes") === (b.mezz_kind ?? "notes") &&
    (a.primary ?? 0) === (b.primary ?? 0) &&
    a.plan.length === b.plan.length &&
    a.plan.every((kind) => b.plan.includes(kind))
  );
}

/** Whether the deal tab has a next step waiting on the player. */
export function dealNeedsAction(company: CompanyView): boolean {
  const deal = company.deal;
  if (!deal) {
    return false;
  }
  if (deal.bid_submitted) {
    // The final round: behind, with approval left to raise.
    const sale = company.sale;
    return Boolean(
      sale?.final_round &&
      sale.standing &&
      sale.standing.rank > 1 &&
      sale.my_bid !== null &&
      sale.bid_ceiling > sale.my_bid,
    );
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

/**
 * A range input with a − and a + button at its ends. The buttons show on a
 * phone only (DealRoom.css); each tap moves one step.
 */
export function StepRange({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  onRelease,
}: {
  id: string;
  /** What the slider sets, for the buttons' accessible names. */
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** Called when the thumb is let go, and after each button tap. */
  onRelease?: () => void;
}) {
  const span = max - min;
  const fill = span > 0 ? ((value - min) / span) * 100 : 0;
  const nudge = (direction: number) => {
    const next = Math.min(max, Math.max(min, value + direction * step));
    if (next !== value) {
      onChange(next);
      onRelease?.();
    }
  };
  return (
    <span className="sr">
      <button
        type="button"
        className="sr-btn"
        aria-label={`${label} −`}
        disabled={value <= min}
        onClick={() => nudge(-1)}
      >
        −
      </button>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        onMouseUp={onRelease}
        onTouchEnd={onRelease}
        onKeyUp={onRelease}
        onBlur={onRelease}
      />
      <button
        type="button"
        className="sr-btn"
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => nudge(1)}
      >
        +
      </button>
    </span>
  );
}

/** The deal file: diligence, the offer, the committee and the bid. */
export function DealRoom({ company }: { company: CompanyView }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const deal = company.deal;
  // The fund prices off its own valuation; the model stays inside the sim.
  const modelEv = deal?.valuation?.mid ?? company.ev?.[0] ?? 0;
  // A lock holds the lenders' terms the month it was bought.
  const lock = deal?.lock ?? null;
  const maxSenior = lock?.max_senior_millis ?? view.economy.max_senior_millis;
  const maxMezz = lock?.max_mezz_millis ?? view.economy.max_mezz_millis;
  const seniorRate = lock ? view.economy.policy_rate_bps + lock.spread_bps : view.economy.senior_rate_bps;

  const [draft, setDraft] = useState<Offer>(
    () =>
      deal?.offer ?? {
        ev: modelEv,
        senior_millis: floorTo(Math.min(maxSenior, 3500), TURN_STEP),
        mezz_millis: 0,
        rollover_bps: 0,
        plan: [],
        mezz_kind: "notes",
        primary: 0,
      },
  );
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [raise, setRaise] = useState(0);

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
      mezz_kind: draft.mezz_kind ?? "notes",
      primary: Math.max(0, Math.min(draft.primary ?? 0, Math.floor(draft.ev * MAX_PRIMARY_SHARE))),
    }),
    [draft, maxSenior, maxMezz, deal?.can_roll],
  );
  // `company` changes whenever the sim does, so the preview follows the market.
  const preview = useMemo(
    () => game.previewOffer(company.i, offer),
    [offer, company],
  );

  // The final round: what a higher bid would cost the fund. The sim prices both.
  const myBid = company.sale?.my_bid ?? null;
  const ceiling = company.sale?.bid_ceiling ?? 0;
  const raiseEv =
    myBid === null
      ? 0
      : Math.min(Math.max(raise, myBid), Math.max(ceiling, myBid));
  const raisePreview = useMemo(() => {
    if (!deal?.offer || myBid === null) {
      return null;
    }
    const at = (ev: number) =>
      game.previewOffer(company.i, { ...deal.offer!, ev })?.financing.equity;
    const before = at(myBid);
    const after = at(raiseEv);
    return before === undefined || after === undefined ? null : after - before;
  }, [company, myBid, raiseEv]);

  const meeting = deal?.ic_meeting ?? null;
  const meetingKey = meeting ? `${meeting.date.year}-${meeting.date.month}-${meeting.open}` : "";
  const [meetingShown, setMeetingShown] = useState(false);
  const [reading, setReading] = useState<DdStream | null>(null);
  const [seenMeeting, setSeenMeeting] = useState("");
  // The committee walks in: open the room once, when it sits.
  useEffect(() => {
    if (meeting?.open && seenMeeting !== meetingKey) {
      setSeenMeeting(meetingKey);
      setMeetingShown(true);
    }
  }, [meeting?.open, meetingKey, seenMeeting]);

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
    { key: "value", done: deal.valuation !== null },
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

  const finalRound = Boolean(sale?.final_round);
  const standing = sale?.standing ?? null;
  const rankTone: Tone =
    standing?.rank === 1 ? "good" : standing?.rank === 2 ? "warn" : "bad";
  const canRaise = myBid !== null && ceiling > myBid;
  const raiseStep = Math.max(1, Math.round((myBid ?? 0) * 0.0025));
  const overApprovedBps = deal.approved_ev
    ? Math.round((raiseEv / deal.approved_ev - 1) * 10000)
    : 0;
  const signedPct = (bps: number) => `${bps > 0 ? "+" : ""}${f.pct(bps, 1)}`;

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

  const sendRaise = () => {
    if (game.act({ type: "raise_bid", company: company.i, ev: raiseEv })) {
      setRaise(0);
    }
  };

  /**
   * The one next step, pinned at the bottom of the sheet on a phone. The same
   * buttons stay in their cards; this only saves the scroll.
   */
  let dock: {
    label: string;
    cost?: number;
    disabled: boolean;
    /** What would turn the button on. */
    why?: string | null;
    note: string | null;
    tone?: Tone;
    run: () => void;
  } | null = null;
  const raising = locked && finalRound && myBid !== null && canRaise;
  if (raising) {
    dock = {
      label: t("dealroom.raise.submit"),
      disabled: raiseEv <= (myBid ?? 0),
      why: t("gate.raiseAbove"),
      note: t("dealroom.raise.ceiling", { amount: f.money(ceiling) }),
      run: sendRaise,
    };
  } else if (locked || !deal.valuation) {
    dock = null;
  } else if (!saved) {
    dock = {
      label: t("dealroom.offer.save"),
      disabled: !preview,
      why: t("dealroom.previewNone"),
      note: !preview
        ? t("dealroom.previewNone")
        : committee
          ? t("dealroom.committee.willReset")
          : null,
      tone: "warn",
      run: () => game.act({ type: "set_offer", company: company.i, offer }),
    };
  } else if (meeting?.open) {
    dock = {
      label: t("ic.enter"),
      disabled: false,
      note: null,
      run: () => setMeetingShown(true),
    };
  } else if (meeting) {
    dock = null;
  } else if (!committee) {
    dock = {
      label: t("dealroom.committee.submit"),
      cost: 1,
      disabled: false,
      note: null,
      run: () => game.act({ type: "submit_ic", company: company.i }),
    };
  } else {
    dock = {
      label: t("dealroom.bid.submit"),
      disabled: bidBlock !== null,
      why: bidBlock ? t(bidBlock) : null,
      note: bidBlock ? t(bidBlock) : null,
      tone: "warn",
      run: () => game.act({ type: "submit_bid", company: company.i }),
    };
  }

  const dropControl = confirmDrop ? (
    <span className="dr-confirm">
      <span>{t(approved ? "dealroom.drop.confirmApproved" : "dealroom.drop.confirm")}</span>
      <button type="button" className="btn small" onClick={() => game.act({ type: "drop_deal", company: company.i })}>
        {t("action.confirm")}
      </button>
      <button type="button" className="btn small ghost" onClick={() => setConfirmDrop(false)}>
        {t("action.cancel")}
      </button>
    </span>
  ) : (
    <button type="button" className="btn ghost dr-drop" onClick={() => setConfirmDrop(true)}>
      {t("dealroom.drop")}
    </button>
  );

  return (
    <>
    <div className="stack dr">
      {company.sale ? (
        <section className="card">
          <ProcessCard company={company} />
        </section>
      ) : null}
      <ValuationCard company={company} />
      {deal.valuation ? <Indication company={company} /> : null}
      <ol className="dr-steps">
        {steps.slice(0, nowStep < 0 ? steps.length : nowStep + 1).map((step, index) => (
          <li
            key={step.key}
            data-state={step.done ? "done" : index === nowStep ? "now" : "next"}
          >
            <i>{step.done ? <Icon name="check" size={12} /> : index + 1}</i>
            {t(`dealroom.step.${step.key}`)}
          </li>
        ))}
      </ol>

      {/* ---------- diligence: once the valuation is under way ---------- */}
      {deal.valuation || deal.valuation_order ? (
      <section className="card">
        <h3>
          <Icon name="search" size={14} />
          {t("dealroom.diligence")}
          <span className="dr-aside muted">
            {t("dealroom.diligence.spent", { amount: f.money(deal.costs) })}
          </span>
        </h3>
        <ul className="dr-streams">
          {DD_STREAMS.filter(
            (stream) =>
              deal.open_streams.includes(stream) ||
              deal.streams_done.includes(stream) ||
              deal.streams_running.includes(stream),
          ).map((stream) => {
            const done = deal.streams_done.includes(stream);
            const running = deal.streams_running.includes(stream);
            const found = company.issues.filter(
              (issue) => issue.found && ISSUE_STREAM[issue.kind] === stream,
            );
            const report = deal.reports?.find((item) => item.stream === stream);
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
                  ) : null}
                </div>
                {done ? (
                  <div className="dr-found">
                    {found.map((issue) => (
                      <Tag key={issue.kind} tone="bad" icon={<Icon name="alert" size={12} />}>
                        {t(`issue.${issue.kind}`)}
                      </Tag>
                    ))}
                    {report ? (
                      <>
                        <ReportSummary report={report} />
                        <button type="button" className="btn small ghost" onClick={() => setReading(stream)}>
                          <Icon name="table" size={13} />
                          {t("dd.read")}
                        </button>
                      </>
                    ) : found.length ? null : (
                      <span className="muted">{t("dealroom.stream.clean")}</span>
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

      ) : null}

      {/* ---------- offer, then the committee: once there is a valuation ---------- */}
      {deal.valuation ? (
      <>
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
            <StepRange
              id="dr-ev"
              label={t("dealroom.offer.ev")}
              min={evMin}
              max={evMax}
              step={evStep}
              value={offer.ev}
              onChange={(ev) => change({ ev })}
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
          {/* ---------- how it is paid for ---------- */}
          <h4 className="dr-group">{t("structure.funding")}</h4>
          <div className="dr-lock" data-locked={lock !== null}>
            {lock ? (
              <span>
                <Icon name="lock" size={14} />
                {t("structure.lock.held", { spread: f.pct(lock.spread_bps, 2), until: f.date(lock.expires) })}
              </span>
            ) : (
              <>
                <span className="muted">{t("structure.lock.about")}</span>
                <button
                  type="button"
                  className="btn small"
                  disabled={!deal || deal.lock_fee === null || deal.approved_ev <= 0}
                  title={deal && deal.approved_ev <= 0 ? t("structure.lock.needsCommittee") : undefined}
                  onClick={() => game.act({ type: "lock_financing", company: company.i })}
                >
                  <Icon name="lock" size={14} />
                  {t("structure.lock.buy", { fee: f.money(deal?.lock_fee ?? 0) })}
                </button>
              </>
            )}
          </div>
          <div className="slider">
            <label htmlFor="dr-senior" className="tip" tabIndex={0} data-tip={t("structure.senior.tip")}>
              {t("structure.senior")}
            </label>
            <output>{financing ? f.money(financing.senior) : t("term.none")}</output>
            <StepRange
              id="dr-senior"
              label={t("structure.senior")}
              min={0}
              max={maxSenior}
              step={TURN_STEP}
              value={offer.senior_millis}
              onChange={(senior_millis) => change({ senior_millis })}
            />
            <small>
              {t("structure.debtTerms", {
                turns: f.multiple(offer.senior_millis),
                rate: f.pct(seniorRate, 1),
                max: f.multiple(maxSenior),
              })}
            </small>
          </div>
          <div className="slider">
            <label htmlFor="dr-mezz" className="tip" tabIndex={0} data-tip={t(`structure.mezz.${offer.mezz_kind}.tip`)}>
              {t("structure.mezz")}
            </label>
            <output>{financing ? f.money(financing.mezz) : t("term.none")}</output>
            <div className="segmented dr-kind" role="radiogroup" aria-label={t("structure.mezz")}>
              {(["notes", "convertible"] as MezzKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={offer.mezz_kind === kind}
                  aria-selected={offer.mezz_kind === kind}
                  onClick={() => change({ mezz_kind: kind })}
                >
                  {t(`structure.mezz.${kind}`)}
                </button>
              ))}
            </div>
            <StepRange
              id="dr-mezz"
              label={t("structure.mezz")}
              min={0}
              max={maxMezz}
              step={TURN_STEP}
              value={offer.mezz_millis}
              onChange={(mezz_millis) => change({ mezz_millis })}
            />
            <small>
              {offer.mezz_kind === "convertible"
                ? t("structure.mezz.convertible.terms", {
                    rate: f.pct(seniorRate + 100, 1),
                    pct: f.pct(financing?.converted_bps ?? 0, 1),
                  })
                : t("structure.mezz.notes.terms", { rate: f.pct(view.economy.mezz_rate_bps, 1) })}
            </small>
          </div>
          {deal.can_roll ? (
            <div className="slider">
              <label htmlFor="dr-roll" className="tip" tabIndex={0} data-tip={t("structure.rollover.tip")}>
                {t("structure.rollover")}
              </label>
              <output>{financing ? f.money(financing.rollover) : t("term.none")}</output>
              <StepRange
                id="dr-roll"
                label={t("structure.rollover")}
                min={0}
                max={MAX_ROLLOVER_BPS}
                step={100}
                value={offer.rollover_bps}
                onChange={(rollover_bps) => change({ rollover_bps })}
              />
              <small>{t("structure.rollover.terms", { pct: f.pct(financing?.seller_bps ?? 0, 1) })}</small>
            </div>
          ) : null}

          {/* ---------- what the fund buys ---------- */}
          <h4 className="dr-group">{t("structure.shares")}</h4>
          <div className="slider">
            <span className="tip" tabIndex={0} data-tip={t("structure.secondary.tip")}>
              {t("structure.secondary")}
            </span>
            <output>{financing ? f.money(Math.max(financing.equity - financing.primary, 0)) : t("term.none")}</output>
            <small>{t("structure.secondary.terms")}</small>
          </div>
          <div className="slider">
            <label htmlFor="dr-primary" className="tip" tabIndex={0} data-tip={t("structure.primary.tip")}>
              {t("structure.primary")}
            </label>
            <output>{f.money(offer.primary)}</output>
            <StepRange
              id="dr-primary"
              label={t("structure.primary")}
              min={0}
              max={Math.max(Math.floor(offer.ev * MAX_PRIMARY_SHARE), 0)}
              step={Math.max(Math.round(offer.ev / 100), 1)}
              value={offer.primary}
              onChange={(primary) => change({ primary })}
            />
            <small>{t("structure.primary.terms")}</small>
          </div>
          {financing ? (
            <StackBar
              title={t("structure.cap")}
              parts={[
                { label: t("structure.cap.fund"), value: financing.ownership_bps, note: f.pct(financing.ownership_bps, 1), color: COLOR.equity },
                { label: t("structure.cap.seller"), value: financing.seller_bps, note: f.pct(financing.seller_bps, 1), color: COLOR.rollover },
                { label: t("structure.cap.bonds"), value: financing.converted_bps, note: f.pct(financing.converted_bps, 1), color: COLOR.mezz },
              ].filter((part) => part.value > 0)}
            />
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
                  <button {...gate(locked ? t("block.bid_in") : !on && offer.plan.length >= MAX_PLAN ? t("gate.planFull", { max: MAX_PLAN }) : null)}
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
            <h3>
              {t("dealroom.structure")}
              {deal.coinvest ? (
                <Tag tone="accent" icon={<Icon name="handshake" size={12} />}>
                  {t("dealroom.coinvest")}
                </Tag>
              ) : null}
            </h3>
            <div className="dr-structure">
              <div className="stack dr-bars">
                <StackBar
                  title={t("dealroom.uses")}
                  total={f.money(offer.ev + financing.fees + financing.primary)}
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
                    ...(financing.primary > 0
                      ? [{ label: t("structure.primary"), value: financing.primary, note: f.money(financing.primary), color: COLOR.equity }]
                      : []),
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
                      label: t(`structure.mezz.${offer.mezz_kind}`),
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
                    note: f.money(financing.senior),
                    color: COLOR.senior,
                  },
                  {
                    label: t(`structure.mezz.${offer.mezz_kind}`),
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
                ]}
              />
            </div>
            <div className="dr-stats">
              <Stat
                label={t("dealroom.entryMultiple")}
                value={f.multiple(financing.multiple_millis)}
                hint={
                  deal?.valuation
                    ? t("dealroom.modelMultiple", {
                        multiple: f.multiple(deal.valuation.multiple_millis),
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
            {deal.coinvest ? (
              <p className="dr-note" data-tone="accent">
                {t("dealroom.coinvestNote")}
              </p>
            ) : null}
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
                const trust = Math.min(
                  Math.max(view.partners[vote.partner]?.trust ?? 50, 0),
                  100,
                );
                const lines = SEAT_LINES[vote.partner] ?? [];
                return (
                  <li key={vote.partner} data-tone={STANCE_TONE[vote.stance]}>
                    <div className="dr-seat-side">
                      <span className="dr-portrait" aria-hidden>
                        <Portrait
                          partner={vote.partner}
                          mood={vote.stance}
                          size={52}
                        />
                      </span>
                      <div
                        className="chart meter dr-trust"
                        data-tone={
                          trust >= TRUST_HIGH
                            ? "good"
                            : trust <= TRUST_LOW
                              ? "bad"
                              : "ink"
                        }
                      >
                        <div className="meter-head">
                          <span>{t("dealroom.trust")}</span>
                          <b>{f.integer(trust)}</b>
                        </div>
                        <div className="meter-track">
                          <span style={{ width: `${trust}%` }} />
                          <i style={{ left: `${TRUST_LOW}%` }} />
                          <i style={{ left: `${TRUST_HIGH}%` }} />
                        </div>
                      </div>
                    </div>
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
                        <ul className="dr-says">
                          {vote.concerns.map((concern) => (
                            <li key={concern}>
                              <Tag tone={STANCE_TONE[vote.stance]}>
                                {t(`concern.${concern}`)}
                              </Tag>
                              {lines.includes(concern) ? (
                                <q>
                                  {t(`dealroom.say.${vote.partner}.${concern}`)}
                                </q>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : vote.stance === "for" &&
                        vote.partner < SEAT_LINES.length ? (
                        <q className="dr-say-for">
                          {t(`dealroom.say.${vote.partner}.for`)}
                        </q>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="dr-note">{t("dealroom.trustRule")}</p>
          </>
        ) : meeting ? (
          <div className="dr-meeting">
            <p className="muted">
              {meeting.open
                ? t("ic.sitting")
                : t("ic.booked", { date: f.date(meeting.date) })}
            </p>
            {meeting.open ? (
              <button type="button" className="btn primary" onClick={() => setMeetingShown(true)}>
                <Icon name="gavel" size={15} />
                {t("ic.enter")}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="muted">
            {t(
              deal.offer
                ? "dealroom.committee.none"
                : "dealroom.committee.needsOffer",
            )}
          </p>
        )}
        {committee && deal.ic_record ? (
          <button type="button" className="btn small ghost" onClick={() => setMeetingShown(true)}>
            <Icon name="eye" size={13} />
            {t("ic.minutes")}
          </button>
        ) : null}
        {locked ? null : (
          <>
            <div className="dr-actions">
              <button {...gate(saved ? t("gate.unchanged") : !preview ? t("dealroom.previewNone") : null)}
                type="button"
                className={saved ? "btn" : "btn primary"}
                disabled={saved || !preview}
                onClick={() =>
                  game.act({ type: "set_offer", company: company.i, offer })
                }
              >
                {t("dealroom.offer.save")}
              </button>
              <button {...gate(!saved ? t("gate.needsSave") : committee || meeting ? t("gate.inCommittee") : null)}
                type="button"
                className={saved && !committee && !meeting ? "btn primary" : "btn"}
                disabled={!saved || Boolean(committee) || Boolean(meeting)}
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

      </>
      ) : null}

      {/* ---------- bid: once the committee has approved ---------- */}
      {approved || deal.bid_submitted ? (
      <section className="card" data-final={finalRound || undefined}>
        <h3>
          <Icon name="flag" size={14} />
          {t("dealroom.bid")}
          {locked || sale?.bid_in ? (
            <Tag tone="good">{t("dealroom.bid.submitted")}</Tag>
          ) : null}
        </h3>
        {finalRound && sale ? (
          <div className="dr-final">
            <Ring
              fraction={sale.months_left / STAGE_MONTHS}
              size={44}
              tone="bad"
            >
              {sale.months_left}
            </Ring>
            <div>
              <strong>{t("dealroom.final")}</strong>
              <span>{t("dealroom.finalNote")}</span>
            </div>
          </div>
        ) : null}
        <div className="dr-bid">
          {sale && !finalRound ? (
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
            {finalRound ? null : (
              <span className="muted">
                {t(
                  sale?.stage === "exclusive"
                    ? "dealroom.bid.exclusiveNote"
                    : "dealroom.bid.resolves",
                )}
              </span>
            )}
          </div>
          <Stat
            label={t("dealroom.bid.certainty")}
            value={`+${f.pct(deal.certainty_bps, 1)}`}
            tone="good"
          />
        </div>
        {sale && sale.stage !== "exclusive" ? (
          <div className="dr-rivals">
            <span className="muted">{t("dealroom.rivals")}</span>
            {sale.rivals.length ? (
              sale.rivals.map((rival, index) => {
                const style =
                  rival.kind === "house"
                    ? HOUSE_STYLES[rival.house]
                    : undefined;
                return (
                  <span key={index} className="chip dr-rival">
                    <Icon
                      name={rival.kind === "strategic" ? "layers" : "fund"}
                      size={13}
                    />
                    <b>{bidderName(t, view, rival)}</b>
                    {style && style.aggression !== 0 ? (
                      <small data-tone={style.aggression > 0 ? "bad" : "good"}>
                        {t(
                          style.aggression > 0
                            ? "dealroom.style.aggressive"
                            : "dealroom.style.disciplined",
                        )}
                      </small>
                    ) : null}
                    {style?.focus ? (
                      <small
                        data-tone={
                          style.focus === company.sector ? "warn" : undefined
                        }
                      >
                        {t("dealroom.style.focus", {
                          sector: t(`sector.${style.focus}`),
                        })}
                      </small>
                    ) : null}
                  </span>
                );
              })
            ) : (
              <Tag tone="muted">{t("dealroom.rivalsNone")}</Tag>
            )}
          </div>
        ) : null}
        {sale?.reason === "strategic_review" ? (
          <p className="dr-note" data-tone="warn">
            {t("dealroom.listedNote")}
          </p>
        ) : null}
        {finalRound && sale && !sale.bid_in ? (
          <p className="dr-note" data-tone="bad">
            {t("dealroom.finalNoBid")}
          </p>
        ) : null}
        {finalRound && sale && myBid !== null ? (
          <div className="dr-round">
            <div className="dr-round-stats">
              {standing ? (
                <Stat
                  label={t("dealroom.standing")}
                  value={t("dealroom.standingValue", {
                    rank: standing.rank,
                    bidders: standing.bidders,
                  })}
                  tone={rankTone}
                />
              ) : null}
              {standing ? (
                <Stat
                  label={t("dealroom.lead")}
                  value={f.figure(standing.lead)}
                />
              ) : null}
              <Stat label={t("dealroom.myBid")} value={f.money(myBid)} />
            </div>
            {canRaise ? (
              <div className="dr-raise">
                <div className="slider">
                  <label htmlFor="dr-raise">{t("dealroom.raise")}</label>
                  <output>{f.money(raiseEv)}</output>
                  <StepRange
                    id="dr-raise"
                    label={t("dealroom.raise")}
                    min={myBid}
                    max={ceiling}
                    step={raiseStep}
                    value={raiseEv}
                    onChange={setRaise}
                  />
                  <small className="dr-slider-notes">
                    <b
                      data-tone={
                        raiseEv > deal.approved_ev ? "warn" : undefined
                      }
                    >
                      {t("dealroom.raise.overApproved", {
                        pct: signedPct(overApprovedBps),
                      })}
                    </b>
                    {raisePreview !== null ? (
                      <span>
                        {t("dealroom.raise.equity", {
                          amount: f.money(raisePreview),
                        })}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="dr-link"
                      onClick={() => setRaise(ceiling)}
                    >
                      {t("dealroom.raise.max")}
                    </button>
                  </small>
                  <small>
                    {t("dealroom.raise.ceiling", { amount: f.money(ceiling) })}
                  </small>
                </div>
                <button {...gate(raiseEv <= myBid && t("gate.raiseAbove"))}
                  type="button"
                  className="btn primary"
                  disabled={raiseEv <= myBid}
                  onClick={sendRaise}
                >
                  <Icon name="up" size={16} />
                  {t("dealroom.raise.submit")}
                </button>
              </div>
            ) : (
              <p className="dr-note" data-tone="warn">
                {t("dealroom.raise.exhausted")}
              </p>
            )}
          </div>
        ) : locked ? (
          <p className="dr-note" data-tone="good">
            {t("dealroom.bid.waiting", {
              ev: f.money(deal.offer?.ev ?? offer.ev),
            })}
          </p>
        ) : null}
        <div className="dr-actions">
          {locked ? null : (
            <button {...gate(bidBlock && t(bidBlock))}
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
          {dropControl}
        </div>
        {bidBlock ? (
          <p className="dr-note" data-tone="warn">
            {t(bidBlock)}
          </p>
        ) : null}
      </section>
      ) : (
        <div className="dr-actions">{dropControl}</div>
      )}
    </div>
    {reading && deal.reports?.find((item) => item.stream === reading) ? (
      <ReportDialog report={deal.reports.find((item) => item.stream === reading)!} company={company.short} onClose={() => setReading(null)} />
    ) : null}
    {meetingShown ? <IcMeetingDialog company={company} onClose={() => setMeetingShown(false)} /> : null}
    {dock ? (
      <div className="cp-dock dr-dock">
        {raising && myBid !== null ? (
          <div className="dr-dock-raise">
            <span className="muted">{dock.note}</span>
            <button
              type="button"
              className="sr-btn"
              aria-label={`${t("dealroom.raise")} −`}
              disabled={raiseEv <= myBid}
              onClick={() => setRaise(Math.max(myBid, raiseEv - raiseStep))}
            >
              −
            </button>
            <output htmlFor="dr-raise">{f.money(raiseEv)}</output>
            <button
              type="button"
              className="sr-btn"
              aria-label={`${t("dealroom.raise")} +`}
              disabled={raiseEv >= ceiling}
              onClick={() => setRaise(Math.min(ceiling, raiseEv + raiseStep))}
            >
              +
            </button>
          </div>
        ) : dock.note ? (
          <span className="cp-dock-note" data-tone={dock.tone}>
            {dock.note}
          </span>
        ) : null}
        <button {...gate(dock.disabled && dock.why)}
          type="button"
          className="btn primary"
          disabled={dock.disabled}
          onClick={dock.run}
        >
          {raising ? <Icon name="up" size={16} /> : null}
          {dock.label}
          {dock.cost ? <Cost points={dock.cost} /> : null}
        </button>
      </div>
    ) : null}
    </>
  );
}
