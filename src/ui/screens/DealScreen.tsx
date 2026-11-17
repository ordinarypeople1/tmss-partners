import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { money, multiple, percentFromBps } from "../game/format";
import { useGame } from "../game/session";
import type { Agent, DealPage, Terms } from "../game/types";

const INSTRUMENTS = ["buyout", "common", "rcps", "cb_mezz", "senior_loan"] as const;

export function DealScreen({ id }: { id: string }) {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [deal, setDeal] = useState<DealPage["deal"] | null>(null);
  const [sis, setSis] = useState<Agent[]>([]);
  const [form, setForm] = useState<Terms | null>(null);
  const loadedId = useRef("");

  useEffect(() => {
    let cancel = false;
    if (loadedId.current !== id) {
      setDeal(null);
      setForm(null);
    }
    void run({ op: "deal", id }).then((result) => {
      if (cancel || result.page?.kind !== "deal") {
        return;
      }
      const next = result.page.deal;
      setDeal(next);
      if (loadedId.current !== id) {
        loadedId.current = id;
        setForm(next.terms);
      }
    });
    void run({ op: "fund" }).then((result) => {
      if (!cancel && result.page?.kind === "fund") {
        setSis(result.page.sis);
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, id, epoch]);

  if (!deal || !form) {
    return <p>{intl.formatMessage({ id: "company.loading" })}</p>;
  }

  const locked = deal.locked;
  function patch(partial: Partial<Terms>) {
    setForm((current) => (current ? { ...current, ...partial } : current));
  }
  async function submit(op: string) {
    if (!form) {
      return;
    }
    const result = await run({ op, id, ...form });
    if (result.page?.kind === "deal") {
      setDeal(result.page.deal);
    }
  }

  return (
    <div className="workspace">
      <header>
        <p className="eyebrow">{intl.formatMessage({ id: `stage.${deal.stage}` })}</p>
        <h2>{deal.legal_name_ko}</h2>
        <p className="muted">
          {intl.formatMessage({ id: `sector.${deal.sector_id}` })}
          {" · "}
          {intl.formatMessage({ id: `process.${deal.process}` })}
          {" · "}
          {intl.formatMessage({ id: `seller.${deal.seller_kind}` })}
          {" · "}
          {deal.broker_ko || intl.formatMessage({ id: "deal.brokerNone" })}
          {" · "}
          {intl.formatMessage({ id: `status.${deal.status}` })}
        </p>
      </header>
      {locked ? <p className="banner">{intl.formatMessage({ id: "deal.locked" })}</p> : null}
      {deal.conditions ? <p className="banner">{intl.formatMessage({ id: "deal.conditions" })}</p> : null}
      <dl className="facts">
        <div>
          <dt>{intl.formatMessage({ id: "fact.asking" })}</dt>
          <dd>{money(intl, deal.ask_ev)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "deal.size" })}</dt>
          <dd>{money(intl, deal.ask_size)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "deal.weeks" })}</dt>
          <dd className="num">{intl.formatNumber(deal.weeks_left)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "deal.competing" })}</dt>
          <dd>{deal.competing_ev > 0 ? money(intl, deal.competing_ev) : intl.formatMessage({ id: "figure.none" })}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "deal.instrument" })}</dt>
          <dd>{intl.formatMessage({ id: `instrument.${deal.instrument}` })}</dd>
        </div>
      </dl>
      <div className="form-grid">
        <label>
          {intl.formatMessage({ id: "deal.instrument" })}
          <select
            value={form.instrument}
            onChange={(event) => patch({ instrument: event.target.value })}
          >
            {INSTRUMENTS.map((instrument) => (
              <option key={instrument} value={instrument}>
                {intl.formatMessage({ id: `instrument.${instrument}` })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {intl.formatMessage({ id: "deal.bidEv" })}
          <input
            inputMode="numeric"
            value={form.bid_ev}
            aria-label={intl.formatMessage({ id: "deal.bidEv" })}
            onChange={(event) => patch({ bid_ev: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.bidSize" })}
          <input
            inputMode="numeric"
            value={form.bid_size}
            aria-label={intl.formatMessage({ id: "deal.bidSize" })}
            onChange={(event) => patch({ bid_size: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.ownership" })}
          <input
            inputMode="numeric"
            value={form.ownership_bps}
            aria-label={intl.formatMessage({ id: "deal.ownership" })}
            onChange={(event) => patch({ ownership_bps: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.coupon" })}
          <input
            inputMode="numeric"
            value={form.coupon_bps}
            aria-label={intl.formatMessage({ id: "deal.coupon" })}
            onChange={(event) => patch({ coupon_bps: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.board" })}
          <input
            inputMode="numeric"
            value={form.board_seats}
            aria-label={intl.formatMessage({ id: "deal.board" })}
            onChange={(event) => patch({ board_seats: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.earnout" })}
          <input
            inputMode="numeric"
            value={form.earnout}
            aria-label={intl.formatMessage({ id: "deal.earnout" })}
            onChange={(event) => patch({ earnout: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.debt" })}
          <input
            inputMode="numeric"
            value={form.debt}
            aria-label={intl.formatMessage({ id: "deal.debt" })}
            onChange={(event) => patch({ debt: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.debtRate" })}
          <input
            inputMode="numeric"
            value={form.debt_rate_bps}
            aria-label={intl.formatMessage({ id: "deal.debtRate" })}
            onChange={(event) => patch({ debt_rate_bps: numberValue(event.target.value) })}
          />
        </label>
        <label>
          {intl.formatMessage({ id: "deal.si" })}
          <select value={form.si_id} onChange={(event) => patch({ si_id: event.target.value })}>
            <option value="">{intl.formatMessage({ id: "deal.siNone" })}</option>
            {sis.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name_ko}
              </option>
            ))}
          </select>
        </label>
        <label>
          {intl.formatMessage({ id: "deal.siEquity" })}
          <input
            inputMode="numeric"
            value={form.si_equity}
            aria-label={intl.formatMessage({ id: "deal.siEquity" })}
            onChange={(event) => patch({ si_equity: numberValue(event.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.covenants}
            onChange={(event) => patch({ covenants: event.target.checked })}
          />
          {intl.formatMessage({ id: "deal.covenants" })}
        </label>
        <label className="check">
          <input type="checkbox" checked={form.drag} onChange={(event) => patch({ drag: event.target.checked })} />
          {intl.formatMessage({ id: "deal.drag" })}
        </label>
        <label className="check">
          <input type="checkbox" checked={form.tag} onChange={(event) => patch({ tag: event.target.checked })} />
          {intl.formatMessage({ id: "deal.tag" })}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.hundred_day_plan}
            onChange={(event) => patch({ hundred_day_plan: event.target.checked })}
          />
          {intl.formatMessage({ id: "deal.plan" })}
        </label>
      </div>
      <p className="muted">
        {intl.formatMessage({ id: "deal.lev" })} {multiple(intl, form.covenant_lev_millis)}
        {" · "}
        {intl.formatMessage({ id: "deal.cover" })} {multiple(intl, form.covenant_cover_millis)}
        {" · "}
        {percentFromBps(intl, form.coupon_bps)}
      </p>
      <div className="row-actions">
        <button type="button" disabled={locked} onClick={() => void submit("ioi")}>
          {intl.formatMessage({ id: "deal.ioi" })}
        </button>
        <button type="button" disabled={locked} onClick={() => void submit("loi")}>
          {intl.formatMessage({ id: "deal.loi" })}
        </button>
        <button type="button" className="btn-primary" disabled={locked} onClick={() => void submit("ic")}>
          {intl.formatMessage({ id: "deal.ic" })}
        </button>
        <button type="button" className="btn-primary" disabled={locked} onClick={() => void submit("binding")}>
          {intl.formatMessage({ id: "deal.binding" })}
        </button>
        <button type="button" onClick={() => void submit("walk")}>
          {intl.formatMessage({ id: "deal.walk" })}
        </button>
        <a href={`#/company/${deal.company_id}`}>{intl.formatMessage({ id: "deal.openCompany" })}</a>
      </div>
      <section>
        <h3>{intl.formatMessage({ id: "deal.votes" })}</h3>
        <ul className="plain-list">
          {deal.ic.map((vote) => (
            <li key={vote.partner} className={vote.yes ? undefined : "loss"}>
              {intl.formatMessage({ id: `partner.${vote.partner}` })}
              {" · "}
              {intl.formatMessage({ id: vote.yes ? "ic.yes" : "ic.no" })}
              {" · "}
              {intl.formatMessage({ id: vote.reason })}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{intl.formatMessage({ id: "deal.log" })}</h3>
        <ul className="plain-list">
          {deal.log.map((entry, index) => (
            <li key={`${entry.template}-${index}`}>
              {intl.formatMessage({ id: entry.template }, { ev: money(intl, entry.ev) })}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function numberValue(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.trunc(parsed);
}
