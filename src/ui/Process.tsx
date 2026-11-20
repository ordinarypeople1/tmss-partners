import { useEffect, useState } from "react";
import { gate } from "./Gate";
import { useT } from "../i18n/useT";
import type { CompanyView, SaleView } from "../sim/types";
import { Meter, Tag } from "./charts";
import { StepRange } from "./DealRoom";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import "./Process.css";

/** A bank-run sale, start to finish. Talks the owner holds alone skip to the last two. */
const ROUND_STEPS = ["teaser", "nda", "ioi", "shortlist", "dataroom", "binding", "signing"] as const;

/** Where a sale stands among its steps. The sim owns the stage; this only names the step inside it. */
function at(company: CompanyView, sale: SaleView): number {
  const deal = company.deal;
  if (sale.stage === "preparing") {
    return 0;
  }
  if (sale.round === 2 || sale.stage === "bidding") {
    return sale.bid_in ? 6 : deal?.committee?.outcome === "approved" ? 5 : 4;
  }
  if (!deal) {
    return 1;
  }
  return deal.indication === null ? 2 : 3;
}

/** Who is selling it and how: the bank, the kind of auction, the project name and the timetable. */
export function ProcessCard({ company }: { company: CompanyView }) {
  const t = useT();
  const { view } = useGame();
  const sale = company.sale;
  if (!sale) {
    return null;
  }
  if (sale.adviser === null) {
    return (
      <div className="process" data-kind="direct">
        <Tag tone="good" icon={<Icon name="handshake" size={12} />}>
          {t("process.direct")}
        </Tag>
        <small className="muted">{t("process.direct.note")}</small>
      </div>
    );
  }
  const adviser = view.advisers[sale.adviser];
  const now = at(company, sale);
  return (
    <div className="process">
      <div className="process-head">
        <span className="process-code">{t("process.project", { name: sale.codename })}</span>
        <Tag icon={<Icon name="career" size={12} />}>{adviser?.name ?? ""}</Tag>
        <Tag tone={sale.format === "targeted" ? "warn" : "muted"}>{t(`format.${sale.format}`)}</Tag>
        {sale.invited ? null : (
          <Tag tone="bad" icon={<Icon name="lock" size={11} />}>
            {t("process.notInvited")}
          </Tag>
        )}
        {sale.first_round_closed ? (
          <Tag tone="bad" icon={<Icon name="lock" size={11} />}>
            {t("process.closed")}
          </Tag>
        ) : null}
      </div>
      <ol className="process-steps">
        {ROUND_STEPS.map((step, index) => (
          <li
            key={step}
            className={index === now ? undefined : "tip"}
            tabIndex={index === now ? undefined : 0}
            data-tip={index === now ? undefined : t(`process.step.${step}`)}
            aria-label={t(`process.step.${step}`)}
            data-state={index === now ? "now" : index < now ? "done" : "later"}
            data-round={index < 4 ? 1 : 2}
          >
            <i />
            {index === now ? <span>{t(`process.step.${step}`)}</span> : null}
          </li>
        ))}
      </ol>
      <small className="muted">
        {sale.round === 2 ? t("process.round2", { seats: sale.rivals.length + (sale.shortlisted ? 1 : 0) }) : t("process.round1", { seats: sale.seats, months: sale.months_left })}
      </small>
    </div>
  );
}

/** Round one: a non-binding number, read by the bank against the others. */
export function Indication({ company }: { company: CompanyView }) {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const deal = company.deal;
  const sale = company.sale;
  const model = company.financials?.model_ev ?? company.ev[0];
  const [value, setValue] = useState(deal?.indication ?? model);
  useEffect(() => {
    if (deal?.indication) {
      setValue(deal.indication);
    }
  }, [deal?.indication]);
  if (!deal || !sale || sale.round !== 1) {
    return null;
  }
  const step = Math.max(Math.round(model / 100), 1);
  const saved = deal.indication === value;
  return (
    <section className="card indication" data-done={deal.indication !== null || undefined}>
      <h3>
        <Icon name="flag" size={14} />
        {t("indication.title")}
        {deal.indication === null ? <Tag tone="warn">{t("indication.due", { months: sale.months_left })}</Tag> : <Tag tone="good">{t("indication.in")}</Tag>}
      </h3>
      <div className="indication-value">
        <strong>{f.money(value)}</strong>
        <span className="muted">{t("indication.vsModel", { pct: f.pct((value / (model || 1)) * 10_000, 0) })}</span>
      </div>
      <StepRange id={`ioi-${company.i}`} label={t("indication.title")} min={Math.round(model * 0.7)} max={Math.round(model * 1.4)} step={step} value={value} onChange={setValue} />
      <p className="muted indication-note">{t("indication.note", { seats: sale.seats })}</p>
      <button {...gate(saved && t("gate.unchanged"))} type="button" className="btn primary" disabled={saved} onClick={() => game.act({ type: "submit_indication", company: company.i, ev: value })}>
        <Icon name="flag" size={15} />
        {t(deal.indication === null ? "indication.submit" : "indication.revise")}
      </button>
    </section>
  );
}

/** The sell-side banks and how well each knows the fund. */
export function Banks() {
  const game = useGame();
  const t = useT();
  const { view } = game;
  const [list, favour, headsUp] = view.coverage_marks;
  return (
    <section className="card banks">
      <h2>
        <Icon name="career" size={15} />
        {t("banks.title")}
        <small className="muted">{t("banks.sub")}</small>
      </h2>
      <ul className="banks-marks">
        <li>
          <b>{list}</b>
          {t("banks.mark.list")}
        </li>
        <li>
          <b>{favour}</b>
          {t("banks.mark.favour")}
        </li>
        <li>
          <b>{headsUp}</b>
          {t("banks.mark.headsUp")}
        </li>
      </ul>
      <div className="banks-list">
        {view.advisers.map((adviser, index) => (
          <div key={adviser.name} className="bank">
            <div className="bank-head">
              <strong className="clip">{adviser.name}</strong>
              <Tag tone="muted">{t(`tier.${adviser.tier}`)}</Tag>
              {adviser.focus ? (
                <span className="bank-focus" title={t(`sector.${adviser.focus}`)}>
                  <Icon name={adviser.focus} size={13} />
                </span>
              ) : null}
            </div>
            <Meter value={adviser.coverage} max={100} markers={[list, favour, headsUp]} tone={adviser.coverage >= headsUp ? "good" : adviser.coverage >= list ? "accent" : "ink"} text={String(adviser.coverage)} label={t("banks.coverage")} />
            <button {...gate(view.attention.left < 1 && t("gate.attention", { need: 1, left: view.attention.left }))} type="button" className="btn small" disabled={view.attention.left < 1} onClick={() => game.act({ type: "cover_bank", adviser: index })}>
              <Icon name="handshake" size={13} />
              {t("banks.call")}
              <span className="journey-cost">
                <Icon name="bolt" size={11} />1
              </span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
