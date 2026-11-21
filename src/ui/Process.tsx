import { useState } from "react";
import { gate } from "./Gate";
import { useT } from "../i18n/useT";
import type { CompanyView, Financing, Offer, SaleView } from "../sim/types";
import { Meter, Tag } from "./charts";
import { sameOffer } from "./DealRoom";
import { useFormat } from "./format";
import { useGame } from "./game";
import { Icon } from "./icons";
import { BankerTalk } from "./BankerTalk";
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

/**
 * Round one: the term sheet that goes to the bank, summed up under the offer it comes from.
 * The bank reads the price and the terms; a sure-looking buyer ranks above a slightly higher
 * price. It is sent from the panel's one action bar, not from here.
 */
export function Indication({ company, offer, financing }: { company: CompanyView; offer: Offer; financing: Financing | null }) {
  const t = useT();
  const f = useFormat();
  const deal = company.deal;
  const sale = company.sale;
  if (!deal || !sale || sale.round !== 1) {
    return null;
  }
  const model = deal.valuation?.mid ?? 0;
  const saved = deal.indication === offer.ev && sameOffer(offer, deal.offer);
  const changed = deal.indication !== null && !saved;
  const cushion = financing ? financing.equity / Math.max(offer.ev, 1) : 0;
  const lender = offer.lender ?? "bank";
  const rate = offer.rate ?? "floating";
  return (
    <section className="card indication" data-done={deal.indication !== null || undefined}>
      <h3>
        <Icon name="flag" size={14} />
        {t("indication.title")}
        {deal.indication === null ? (
          <Tag tone="warn">{t("indication.due", { months: sale.months_left })}</Tag>
        ) : changed ? (
          <Tag tone="warn">{t("indication.changed")}</Tag>
        ) : (
          <Tag tone="good">{t("indication.in")}</Tag>
        )}
      </h3>
      <div className="indication-value">
        <strong>{f.money(offer.ev)}</strong>
        <span className="muted">{t("indication.vsModel", { pct: f.pct((offer.ev / (model || 1)) * 10_000, 0) })}</span>
      </div>
      <dl className="indication-terms">
        <dt>{t("structure.senior")}</dt>
        <dd>
          {t("indication.term.senior", {
            turns: f.multiple(offer.senior_millis),
            lender: t(`structure.lender.${lender}`),
            rate: t(`structure.rate.${rate}`),
            pct: f.pct(financing?.rate_bps ?? 0, 2),
          })}
        </dd>
        {offer.mezz_millis > 0 ? (
          <>
            <dt>{t("structure.mezz")}</dt>
            <dd>{`${f.multiple(offer.mezz_millis)} · ${t(`structure.mezz.${offer.mezz_kind}`)}`}</dd>
          </>
        ) : null}
        {offer.rollover_bps > 0 ? (
          <>
            <dt>{t("structure.rollover")}</dt>
            <dd>{f.pct(offer.rollover_bps, 0)}</dd>
          </>
        ) : null}
        <dt>{t("indication.term.equity")}</dt>
        <dd>{f.pct(cushion * 10_000, 0)}</dd>
      </dl>
      <div className="row indication-signals">
        {lender === "private_credit" ? <Tag tone="good">{t("indication.signal.committed")}</Tag> : null}
        {cushion >= 0.4 ? <Tag tone="good">{t("indication.signal.cushion")}</Tag> : cushion < 0.25 ? <Tag tone="bad">{t("indication.signal.thin")}</Tag> : null}
        {offer.rollover_bps > 0 && deal.can_roll ? <Tag tone="good">{t("indication.signal.alongside")}</Tag> : null}
      </div>
      <p className="muted indication-note">{t("indication.note", { seats: sale.seats })}</p>
    </section>
  );
}

/** The sell-side banks and how well each knows the fund. */
export function Banks() {
  const game = useGame();
  const t = useT();
  const { view } = game;
  const [list, favour, headsUp] = view.coverage_marks;
  const [talking, setTalking] = useState(false);
  const cover = (adviser: number) => {
    if (game.act({ type: "cover_bank", adviser })) {
      setTalking(true);
    }
  };
  return (
    <section className="card banks">
      {talking && view.cover_talk ? <BankerTalk talk={view.cover_talk} onClose={() => setTalking(false)} /> : null}
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
            <button {...gate(view.attention.left < 1 && t("gate.attention", { need: 1, left: view.attention.left }))} type="button" className="btn small" disabled={view.attention.left < 1} onClick={() => cover(index)}>
              <Icon name="meet" size={13} />
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
