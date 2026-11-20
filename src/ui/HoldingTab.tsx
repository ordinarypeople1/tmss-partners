import { useEffect, useRef, useState, type ReactNode } from "react";
import "./HoldingTab.css";
import { useT } from "../i18n/useT";
import type { Budget, CompanyView, ExitRoute, Financials, HoldingView, InitiativeKind, Trait } from "../sim/types";
import { Bridge, Donut, Gauge, LineChart, Meter, Rating, Ring, SERIES, Stat, Tag } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import { describeMessage } from "./messages";
import { Portrait } from "./Portrait";

const ROUTES: ExitRoute[] = ["strategic", "secondary", "ipo"];
const HOME = "US";
/** Traits that change what an initiative does. The rules are sim-core's; this only points at the lever. */
const LEVER_TRAIT: Partial<Record<InitiativeKind, { trait: Trait; tone: "good" | "bad" }>> = {
  pricing_review: { trait: "brand_strength", tone: "good" },
  sales_expansion: { trait: "underinvested_sales", tone: "good" },
  headcount_reduction: { trait: "family_workforce", tone: "bad" },
};

/** A tag on a lever that one of the company's traits changes. */
function LeverMark({ company, kind }: { company: CompanyView; kind: InitiativeKind }) {
  const t = useT();
  const lever = LEVER_TRAIT[kind];
  if (!lever || !company.traits.includes(lever.trait)) {
    return null;
  }
  return (
    <Tag tone={lever.tone} icon={<Icon name={lever.tone === "bad" ? "alert" : "up"} size={12} />}>
      {t(`holding.lever.${lever.trait}`)}
    </Tag>
  );
}

interface SectionProps {
  company: CompanyView;
  holding: HoldingView;
  financials: Financials;
}

function Cost({ points }: { points: number }) {
  const t = useT();
  if (points <= 0) {
    return null;
  }
  return (
    <span className="cost" title={t("holding.attentionCost", { cost: points })}>
      {Array.from({ length: points }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

/** A button that asks once more before it sends anything. */
function ConfirmButton({
  label,
  confirmText,
  cost = 0,
  disabled = false,
  primary = false,
  onConfirm,
}: {
  label: ReactNode;
  /** What is about to happen, shown beside the confirm button. */
  confirmText?: string;
  cost?: number;
  disabled?: boolean;
  primary?: boolean;
  onConfirm: () => void;
}) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="hd-confirm">
        {confirmText ? <span className="muted">{confirmText}</span> : null}
        <button
          type="button"
          className="btn primary small"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
        >
          {t("action.confirm")}
          <Cost points={cost} />
        </button>
        <button type="button" className="btn small" onClick={() => setArmed(false)}>
          {t("action.cancel")}
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={primary ? "btn primary small" : "btn small"} disabled={disabled} onClick={() => setArmed(true)}>
      {label}
      <Cost points={cost} />
    </button>
  );
}

/** An amount typed in hundreds of thousands of dollars (`holding.unit`); the value is thousand USD. */
function AmountField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  const t = useT();
  const f = useFormat();
  const unit = 100;
  return (
    <div className="hd-amount">
      <label htmlFor={id}>{label}</label>
      <span className="hd-amount-input">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={10}
          value={Math.round(value / unit)}
          onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)) * unit)}
        />
        <small>{t("holding.unit")}</small>
      </span>
      <b>{f.money(value)}</b>
    </div>
  );
}

/** Decisions about this company that still wait in the inbox. */
function PendingBanner({ company }: { company: CompanyView }) {
  const t = useT();
  const f = useFormat();
  const { view, go } = useGame();
  const pending = view.messages.filter((message) => message.company === company.i && message.decision !== null && message.decision.chosen === null);
  if (pending.length === 0) {
    return null;
  }
  return (
    <section className="hd-pending" role="status">
      <Icon name="alert" size={18} />
      <ul>
        {pending.map((message) => {
          const left = message.decision ? message.decision.due_month - view.month : 0;
          return (
            <li key={message.id}>
              <b>{describeMessage(t, f, view, message).title}</b>
              <Tag tone={left <= 1 ? "bad" : "warn"} icon={<Icon name="clock" size={12} />}>
                {t("holding.pending.due", { months: Math.max(left, 0) })}
              </Tag>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn primary small" onClick={() => go("inbox")}>
        <Icon name="inbox" size={14} />
        {t("holding.pending.inbox")}
      </button>
    </section>
  );
}

/** Who runs the company and what kind of company it is. */
function PeopleCard({ company }: SectionProps) {
  const t = useT();
  const { ceo } = company;
  return (
    <section className="card hd-card">
      <h2>
        <Icon name="career" size={15} />
        <span>{t("holding.people.title")}</span>
        {company.country !== HOME ? <Tag icon={<Icon name="map" size={12} />}>{t(`country.${company.country}`)}</Tag> : null}
      </h2>
      <div className="hd-ceo">
        <span className="hd-portrait">
          <i aria-hidden>{ceo.name.slice(0, 1)}</i>
          <Portrait seed={ceo.name} feminine={ceo.feminine} size={48} />
        </span>
        <div className="hd-ceo-main">
          <b>{ceo.name}</b>
          <span className="row hd-ceo-tags">
            <Tag tone="accent">{ceo.style ? t(`ceo_style.${ceo.style}`) : t("term.unknown")}</Tag>
            {ceo.founder ? <Tag>{t("owner.founder")}</Tag> : null}
            <Tag tone="muted">{t("holding.people.age", { age: ceo.age })}</Tag>
            <Tag tone="muted" icon={<Icon name="clock" size={12} />}>
              {t("holding.people.tenure", { years: ceo.tenure })}
            </Tag>
          </span>
        </div>
      </div>
      <Rating value={company.management} label={t("holding.people.management")} />
      {company.management === null ? <p className="hd-note muted">{t("holding.people.managementUnknown")}</p> : null}
      <h3 className="hd-sub">{t("holding.people.traits")}</h3>
      {company.traits.length === 0 ? (
        <p className="muted">{t("term.none")}</p>
      ) : (
        <ul className="hd-traits">
          {company.traits.map((trait) => (
            <li key={trait}>
              <Tag>{t(`trait.${trait}`)}</Tag>
              <span className="muted">{t(`trait.${trait}.effect`)}</span>
            </li>
          ))}
          {company.traits_hidden > 0 ? (
            <li>
              <Tag tone="muted">{t("holding.people.hidden", { count: company.traits_hidden })}</Tag>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function ValueCard({ holding }: SectionProps) {
  const t = useT();
  const f = useFormat();
  const moicTone = holding.moic_millis > 1000 ? "good" : holding.moic_millis < 1000 ? "bad" : undefined;
  const irrTone = holding.irr_bps === null ? undefined : holding.irr_bps > 0 ? "good" : holding.irr_bps < 0 ? "bad" : undefined;
  const gain = holding.value + holding.dividends - holding.cost;
  return (
    <section className="card hd-card">
      <h2>
        <Icon name="portfolio" size={15} />
        <span>{t("holding.value.title")}</span>
        <Tag tone="muted">{t("holding.value.markTag")}</Tag>
        <span className="hd-push muted">{t("holding.value.since", { date: f.date(holding.acquired) })}</span>
      </h2>
      <div className="hd-stats">
        <Stat label={t("holding.value.mark")} value={f.money(holding.value)} delta={f.signedMoney(gain)} tone={gain > 0 ? "good" : gain < 0 ? "bad" : undefined} />
        <Stat label={t("holding.value.cost")} value={f.money(holding.cost)} />
        <Stat label={t("term.moic")} value={f.multiple(holding.moic_millis, 2)} tone={moicTone} />
        <Stat label={t("term.irr")} value={holding.irr_bps === null ? "–" : f.pct(holding.irr_bps)} tone={irrTone} />
        <Stat label={t("holding.value.held")} value={t("format.months", { months: holding.months_held })} />
        {holding.dividends > 0 ? <Stat label={t("holding.value.dividends")} value={f.money(holding.dividends)} tone="good" /> : null}
      </div>
      <div className="hd-ownership">
        <Meter
          value={holding.ownership_bps}
          max={10_000}
          tone={holding.ownership_bps >= 10_000 ? "good" : "accent"}
          label={t("holding.value.ownership")}
          text={t("holding.own.split", { fund: f.pct(holding.ownership_bps), others: f.pct(10_000 - holding.ownership_bps) })}
        />
        <p className="hd-note muted">{t(holding.ownership_bps >= 10_000 ? "holding.own.full" : "holding.own.shared")}</p>
      </div>
      <h3 className="hd-sub">{t("holding.bridge.title")}</h3>
      <Bridge
        height={120}
        format={f.money}
        start={{ label: t("holding.bridge.entry"), value: holding.entry_equity }}
        steps={[
          { label: t("holding.bridge.ebitda"), value: holding.bridge.ebitda },
          { label: t("holding.bridge.multiple"), value: holding.bridge.multiple },
          { label: t("holding.bridge.debt"), value: holding.bridge.debt },
        ]}
        end={{ label: t("holding.bridge.today"), value: holding.value }}
      />
      <h3 className="hd-sub">{t("holding.marks.title")}</h3>
      {holding.marks.length >= 2 ? (
        <LineChart
          height={110}
          format={f.money}
          series={[
            { label: t("holding.marks.equity"), values: holding.marks.map((mark) => mark.equity) },
            { label: t("holding.marks.ebitda"), values: holding.marks.map((mark) => mark.ebitda) },
          ]}
        />
      ) : (
        <p className="muted">{t("holding.marks.empty")}</p>
      )}
      <p className="hd-note muted">{t("term.modelNotPrice")}</p>
    </section>
  );
}

function CovenantCard({ company, holding, financials }: SectionProps) {
  const t = useT();
  const f = useFormat();
  const { act } = useGame();
  const [typed, setTyped] = useState<number | null>(null);
  useEffect(() => setTyped(null), [company.i]);

  const leverage = financials.leverage_millis;
  const cover = financials.cover_millis;
  const overLeverage = leverage > holding.max_leverage_millis;
  const underCover = cover < holding.min_cover_millis;
  /** Net debt above what the leverage limit allows on trailing EBITDA, rounded up to $100k. */
  const gap = financials.net_debt - Math.floor((Math.max(financials.ttm_ebitda, 0) * holding.max_leverage_millis) / 1000);
  const suggested = gap > 0 ? Math.ceil(gap / 100) * 100 : 0;
  const amount = typed ?? suggested;

  return (
    <section className="card hd-card">
      <h2>
        <Icon name="gavel" size={15} />
        <span>{t("holding.cov.title")}</span>
        <Tag tone={holding.breaches >= 2 ? "bad" : holding.breaches === 1 ? "warn" : "good"}>{t("holding.cov.breaches", { count: holding.breaches })}</Tag>
      </h2>
      <div className="hd-gauges">
        <Gauge
          value={leverage}
          max={Math.max(holding.max_leverage_millis * 1.4, leverage * 1.05)}
          limit={holding.max_leverage_millis}
          higherIsWorse
          label={t("term.leverage")}
          text={f.multiple(leverage)}
          limitText={t("holding.cov.max", { limit: f.multiple(holding.max_leverage_millis) })}
        />
        <Gauge
          value={cover}
          max={Math.max(holding.min_cover_millis * 3, cover * 1.05)}
          limit={holding.min_cover_millis}
          higherIsWorse={false}
          label={t("term.cover")}
          text={f.multiple(cover)}
          limitText={t("holding.cov.min", { limit: f.multiple(holding.min_cover_millis) })}
        />
      </div>
      <div className="row hd-tags">
        {!overLeverage && !underCover && holding.breaches === 0 ? (
          <Tag tone="good" icon={<Icon name="check" size={12} />}>
            {t("holding.cov.ok")}
          </Tag>
        ) : null}
        {holding.waiver_quarters > 0 ? <Tag tone="warn">{t("holding.cov.waiver", { quarters: holding.waiver_quarters })}</Tag> : null}
        {holding.strike ? (
          <Tag tone="bad" icon={<Icon name="alert" size={12} />}>
            {t("holding.cov.strike")}
          </Tag>
        ) : null}
        {holding.shortfall ? (
          <Tag tone="bad" icon={<Icon name="alert" size={12} />}>
            {t("holding.cov.shortfall")}
          </Tag>
        ) : null}
        <Tag icon={<Icon name="clock" size={12} />}>{t("holding.cov.maturity", { date: f.date(holding.maturity) })}</Tag>
        <Tag>{t("holding.cov.rate", { rate: f.pct(financials.interest_rate_bps) })}</Tag>
        <Tag>
          {t("term.netDebt")} {f.money(financials.net_debt)}
        </Tag>
      </div>
      {holding.breaches > 0 ? <p className="hd-note muted">{t("holding.cov.breachHint")}</p> : null}
      <div className="hd-action">
        <div className="row between">
          <h3 className="hd-sub">{t("holding.cure.title")}</h3>
          <Tag tone={suggested > 0 ? "warn" : "muted"}>{suggested > 0 ? t("holding.cure.suggested", { amount: f.money(suggested) }) : t("holding.cure.notNeeded")}</Tag>
        </div>
        <p className="muted">{t("holding.cure.hint")}</p>
        <div className="hd-action-row">
          <AmountField id={`cure-${company.i}`} label={t("holding.cure.amount")} value={amount} onChange={setTyped} />
          <ConfirmButton
            label={t("holding.cure.submit")}
            confirmText={f.money(amount)}
            disabled={amount <= 0}
            onConfirm={() => {
              if (act({ type: "equity_cure", company: company.i, amount })) {
                setTyped(null);
              }
            }}
          />
        </div>
      </div>
    </section>
  );
}

type BudgetKey = keyof Budget;

const SLIDERS: { key: BudgetKey; max: number; step: number; label: string }[] = [
  { key: "growth_bps", max: 500, step: 25, label: "holding.budget.growth" },
  { key: "efficiency_bps", max: 300, step: 25, label: "holding.budget.efficiency" },
  { key: "sweep_pct", max: 100, step: 10, label: "holding.budget.sweep" },
  { key: "dividend_pct", max: 100, step: 10, label: "holding.budget.dividend" },
];

function sameBudget(a: Budget, b: Budget): boolean {
  return a.growth_bps === b.growth_bps && a.efficiency_bps === b.efficiency_bps && a.sweep_pct === b.sweep_pct && a.dividend_pct === b.dividend_pct;
}

function BudgetCard({ company, holding, financials }: SectionProps) {
  const t = useT();
  const f = useFormat();
  const { act } = useGame();
  const sent = holding.budget;
  const [draft, setDraft] = useState<Budget>(sent);
  /** The newest draft, readable from the release handler before React has redrawn. */
  const latest = useRef<Budget>(sent);
  useEffect(() => {
    latest.current = sent;
    setDraft(sent);
    // The view hands a fresh object every redraw; only the numbers matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.i, sent.growth_bps, sent.efficiency_bps, sent.sweep_pct, sent.dividend_pct]);

  const change = (key: BudgetKey, value: number) => {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setDraft(next);
  };
  /** Sends the budget once, when the slider is let go. */
  const commit = () => {
    const next = latest.current;
    if (sameBudget(next, sent)) {
      return;
    }
    if (!act({ type: "set_budget", company: company.i, budget: next })) {
      latest.current = sent;
      setDraft(sent);
    }
  };

  const last = financials.last;
  const fcf = last.net_income + last.da - last.change_in_nwc - last.capex;
  const retained = Math.max(last.closing_cash - last.opening_cash, 0);
  const uses = [
    { label: t("holding.budget.capex"), value: last.capex, color: SERIES[0] },
    { label: t("holding.budget.repaid"), value: last.debt_repayment, color: SERIES[3] },
    { label: t("holding.budget.paid"), value: last.dividends, color: SERIES[2] },
    { label: t("holding.budget.retained"), value: retained, color: SERIES[5] },
  ];

  return (
    <section className="card hd-card">
      <h2>
        <Icon name="layers" size={15} />
        <span>{t("holding.budget.title")}</span>
      </h2>
      <div className="hd-sliders">
        {SLIDERS.map((slider) => {
          const value = draft[slider.key];
          const id = `budget-${company.i}-${slider.key}`;
          const ofRevenue = slider.key === "growth_bps" || slider.key === "efficiency_bps";
          return (
            <div className="slider" key={slider.key}>
              <label htmlFor={id}>{t(slider.label)}</label>
              <output htmlFor={id}>
                {ofRevenue
                  ? t("holding.budget.ofRevenue", { pct: f.pct(value, 2), amount: f.money(Math.round((last.revenue * value) / 10000)) })
                  : t("holding.budget.share", { pct: value })}
              </output>
              <input
                id={id}
                type="range"
                min={0}
                max={slider.max}
                step={slider.step}
                value={value}
                onChange={(event) => change(slider.key, Number(event.target.value))}
                onMouseUp={commit}
                onTouchEnd={commit}
                onKeyUp={commit}
                onBlur={commit}
              />
              <small>{t(`${slider.label}.hint`)}</small>
            </div>
          );
        })}
      </div>
      {company.traits.includes("aging_equipment") || company.traits.includes("single_plant") ? (
        <div className="row hd-tags">
          {company.traits.includes("aging_equipment") ? (
            <Tag tone="warn" icon={<Icon name="alert" size={12} />}>
              {t("holding.lever.aging_equipment")}
            </Tag>
          ) : null}
          {company.traits.includes("single_plant") ? (
            <Tag tone="warn" icon={<Icon name="alert" size={12} />}>
              {t("holding.lever.single_plant")}
            </Tag>
          ) : null}
        </div>
      ) : null}
      <h3 className="hd-sub">{t("holding.budget.lastMonth")}</h3>
      <div className="hd-cash">
        <Donut parts={uses} size={104}>
          <small className="muted">{t("term.fcf")}</small>
          <b className={fcf < 0 ? "hd-bad" : undefined}>{f.money(fcf)}</b>
        </Donut>
        <div className="hd-cash-side">
          <div className="hd-stats">
            <Stat label={t("holding.budget.fcf")} value={f.money(fcf)} tone={fcf > 0 ? "good" : fcf < 0 ? "bad" : undefined} />
            <Stat label={t("holding.budget.repaid")} value={f.money(last.debt_repayment)} />
            <Stat label={t("holding.budget.paid")} value={f.money(last.dividends)} tone={last.dividends > 0 ? "good" : undefined} />
          </div>
          <ul className="stack-legend" aria-label={t("holding.budget.cashUse")}>
            {uses.map((part) => (
              <li key={part.label}>
                <i style={{ background: part.color }} />
                <span>{part.label}</span>
                <b>{f.money(part.value)}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function InitiativesCard({ company, holding }: SectionProps) {
  const t = useT();
  const f = useFormat();
  const { act, view } = useGame();
  const limit = view.limits.initiatives;
  const full = holding.initiatives.length >= limit;
  return (
    <section className="card hd-card">
      <h2>
        <Icon name="bolt" size={15} />
        <span>{t("holding.init.title")}</span>
        <Tag tone={full ? "warn" : "muted"}>{t("holding.init.limit", { running: holding.initiatives.length, limit })}</Tag>
      </h2>
      <h3 className="hd-sub">{t("holding.init.running")}</h3>
      {holding.initiatives.length === 0 ? (
        <p className="muted">{t("holding.init.none")}</p>
      ) : (
        <ul className="hd-list">
          {holding.initiatives.map((item) => (
            <li key={item.kind} className="hd-item">
              <Ring fraction={item.months_left / item.months} size={30}>
                {item.months_left}
              </Ring>
              <div className="hd-item-main">
                <b>{t(`initiative.${item.kind}`)}</b>
                <span className="muted">{t(`initiative.${item.kind}.effect`)}</span>
                <span className="row hd-item-meta">
                  <LeverMark company={company} kind={item.kind} />
                </span>
              </div>
              <Tag tone="accent">{t("holding.init.left", { months: item.months_left })}</Tag>
            </li>
          ))}
        </ul>
      )}
      <h3 className="hd-sub">{t("holding.init.available")}</h3>
      {holding.available.length === 0 ? (
        <p className="muted">{t("holding.init.noneLeft")}</p>
      ) : (
        <ul className="hd-list">
          {holding.available.map((item) => (
            <li key={item.kind} className="hd-item">
              <div className="hd-item-main">
                <span className="row hd-item-name">
                  <b>{t(`initiative.${item.kind}`)}</b>
                  {item.planned ? <Tag tone="good">{t("holding.init.planned")}</Tag> : null}
                </span>
                <span className="muted">{t(`initiative.${item.kind}.effect`)}</span>
                <span className="row hd-item-meta">
                  <Tag>{t("holding.init.cost", { amount: f.money(item.cost) })}</Tag>
                  <Tag icon={<Icon name="clock" size={12} />}>{t("format.months", { months: item.months })}</Tag>
                  <LeverMark company={company} kind={item.kind} />
                </span>
              </div>
              <button type="button" className="btn small" disabled={full} onClick={() => act({ type: "start_initiative", company: company.i, kind: item.kind })}>
                {t("holding.init.start")}
                <Cost points={item.planned ? 0 : 1} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {holding.done.length > 0 ? (
        <>
          <h3 className="hd-sub">{t("holding.init.done")}</h3>
          <div className="row hd-tags">
            {holding.done.map((kind, index) => (
              <Tag key={`${kind}-${index}`} tone="good" icon={<Icon name="check" size={12} />}>
                {t(`initiative.${kind}`)}
              </Tag>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function AddOnCard({ company, holding }: SectionProps) {
  const t = useT();
  const f = useFormat();
  const { act, rows, select } = useGame();
  const targets = holding.add_on_targets.map((index) => rows.get(index)).filter((row) => row !== undefined);
  return (
    <section className="card hd-card">
      <h2>
        <Icon name="link" size={15} />
        <span>{t("holding.addon.title")}</span>
        <Tag tone={holding.add_ons > 0 ? "good" : "muted"}>{t("holding.addon.count", { count: holding.add_ons })}</Tag>
        {company.traits.includes("fragmented_market") ? (
          <Tag tone="good" icon={<Icon name="up" size={12} />}>
            {t("holding.lever.fragmented_market")}
          </Tag>
        ) : null}
      </h2>
      {targets.length === 0 ? (
        <p className="muted">{t("holding.addon.empty")}</p>
      ) : (
        <>
          <div className="hd-scroll">
            <table className="table hd-table">
              <thead>
                <tr>
                  <th scope="col">{t("holding.addon.company")}</th>
                  <th scope="col" className="num">
                    {t("term.ebitda")}
                  </th>
                  <th scope="col" className="num">
                    {t("term.ev")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {targets.map((row) => (
                  <tr key={row.i}>
                    <td className="name">
                      {row.name}
                      <span className="sub">
                        {row.country === HOME ? t(`admin1.${row.admin1}`) : `${t(`admin1.${row.admin1}`)} · ${t(`country.${row.country}`)}`}
                      </span>
                      <span className="hd-row-actions">
                        <button type="button" className="btn small ghost" title={t("holding.addon.open", { name: row.name })} onClick={() => select(row.i)}>
                          <Icon name="eye" size={14} />
                          {t("action.open")}
                        </button>
                        <ConfirmButton
                          label={t("holding.addon.buy")}
                          confirmText={t("holding.addon.confirm", { name: row.name })}
                          cost={2}
                          onConfirm={() => act({ type: "add_on", platform: company.i, target: row.i })}
                        />
                      </span>
                    </td>
                    <td className="num">{f.figure(row.ebitda)}</td>
                    <td className="num">{f.figure(row.ev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hd-note muted">{t("holding.addon.funding")}</p>
        </>
      )}
    </section>
  );
}

function RecapCard({ company, holding, financials }: SectionProps) {
  const t = useT();
  const f = useFormat();
  const { act } = useGame();
  const ebitda = Math.max(financials.ttm_ebitda, 0);
  const picks = [500, 1000];
  const [amount, setAmount] = useState(() => Math.round(ebitda / 2 / 100) * 100);
  useEffect(() => setAmount(Math.round(ebitda / 2 / 100) * 100), [company.i]); // eslint-disable-line react-hooks/exhaustive-deps
  const heldEnough = holding.months_held >= 12;
  /** What leverage would read after borrowing the amount: display arithmetic only; the lenders decide. */
  const after = ebitda > 0 ? Math.round(((financials.net_debt + amount) * 1000) / ebitda) : 0;
  const tone = after > holding.max_leverage_millis ? "bad" : after > holding.max_leverage_millis * 0.88 ? "warn" : "good";
  return (
    <section className="card hd-card">
      <h2>
        <Icon name="fund" size={15} />
        <span>{t("holding.recap.title")}</span>
        <Tag tone={heldEnough ? "good" : "warn"}>{heldEnough ? t("holding.recap.holdOk") : t("holding.recap.needsHold")}</Tag>
      </h2>
      <p className="muted">{t("holding.recap.hint")}</p>
      <div className="row hd-picks">
        {picks.map((millis) => (
          <button key={millis} type="button" className="btn small" onClick={() => setAmount(Math.round((ebitda * millis) / 1000 / 10) * 10)}>
            {t("holding.recap.pick", { multiple: f.multiple(millis) })}
          </button>
        ))}
      </div>
      <Meter
        value={after}
        max={holding.max_leverage_millis * 1.3}
        marker={holding.max_leverage_millis}
        tone={tone}
        label={t("holding.recap.after")}
        text={`${f.multiple(financials.leverage_millis)} → ${f.multiple(after)}`}
      />
      <p className="hd-note muted">{t("holding.recap.room")}</p>
      <div className="hd-action-row">
        <AmountField id={`recap-${company.i}`} label={t("holding.recap.amount")} value={amount} onChange={setAmount} />
        <ConfirmButton
          label={t("holding.recap.submit")}
          confirmText={f.money(amount)}
          cost={2}
          disabled={amount <= 0}
          onConfirm={() => act({ type: "dividend_recap", company: company.i, amount })}
        />
      </div>
    </section>
  );
}

function ExitCard({ company, holding }: SectionProps) {
  const t = useT();
  const f = useFormat();
  const { act, go } = useGame();
  const exit = holding.exit;
  return (
    <section className="card hd-card">
      <h2>
        <Icon name="exit" size={15} />
        <span>{t("holding.exit.title")}</span>
        {exit ? <Tag tone="accent">{t("holding.exit.running")}</Tag> : holding.months_held < 12 ? <Tag tone="warn">{t("holding.exit.needsHold")}</Tag> : null}
      </h2>
      {exit ? (
        <div className="hd-item">
          <Ring fraction={exit.months_left / exit.months} size={36} tone={exit.offer_ev !== null ? "good" : "accent"}>
            {exit.months_left}
          </Ring>
          <div className="hd-item-main">
            <b>{t(`route.${exit.route}`)}</b>
            <span className="muted">{t(`holding.exit.${exit.route}`)}</span>
            {exit.offer_ev !== null ? (
              <span className="row hd-item-meta">
                <Tag tone="good" icon={<Icon name="inbox" size={12} />}>
                  {t("holding.exit.offer")}
                </Tag>
                <Tag>{t("holding.exit.offerEv", { amount: f.money(exit.offer_ev) })}</Tag>
              </span>
            ) : (
              <span className="row hd-item-meta">
                <Tag tone="accent">{t("holding.exit.left", { months: exit.months_left })}</Tag>
              </span>
            )}
          </div>
          {exit.offer_ev !== null ? (
            <button type="button" className="btn primary small" onClick={() => go("inbox")}>
              <Icon name="inbox" size={14} />
              {t("holding.exit.inbox")}
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="hd-list">
          {ROUTES.map((route) => (
            <li key={route} className="hd-item">
              <div className="hd-item-main">
                <b>{t(`route.${route}`)}</b>
                <span className="muted">{t(`holding.exit.${route}`)}</span>
              </div>
              <ConfirmButton
                label={t("holding.exit.start")}
                confirmText={t("holding.exit.confirm", { route: t(`route.${route}`) })}
                cost={2}
                onConfirm={() => act({ type: "start_exit", company: company.i, route })}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The operations tab for a company the fund owns. */
export function HoldingTab(props: { company: CompanyView }) {
  const { company } = props;
  const { holding, financials } = company;
  if (!holding || !financials) {
    return null;
  }
  const section = { company, holding, financials };
  return (
    <div className="holding-tab stack">
      <PendingBanner company={company} />
      <PeopleCard {...section} />
      <ValueCard {...section} />
      <CovenantCard {...section} />
      <BudgetCard {...section} />
      <InitiativesCard {...section} />
      <AddOnCard {...section} />
      <RecapCard {...section} />
      <ExitCard {...section} />
    </div>
  );
}
