import { useT } from "../i18n/useT";
import type { CompanyView } from "../sim/types";
import { Stat, Tag } from "./charts";
import { useFormat } from "./format";
import { gate } from "./Gate";
import { useGame } from "./game";
import { Icon } from "./icons";
import "./Valuation.css";

/**
 * The fund's own view of value. Until one comes in the deal room shows no
 * model value at all: the team values the company itself (attention) or pays
 * an adviser (a fee set by the size of the house) and the report lands when
 * the month closes.
 */
export function ValuationCard({ company }: { company: CompanyView }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const deal = company.deal;
  if (!deal) {
    return null;
  }
  const done = deal.valuation;
  const ordered = deal.valuation_order;
  const order = (kind: "internal" | "adviser") => game.act({ type: "order_valuation", company: company.i, kind });
  const noAttention = view.attention.left < 1;
  const fee = view.valuation_fee;
  const feeTip = t("valuation.feeTip", { committed: f.money(view.fund.committed) });
  return (
    <section className="card valuation" data-state={done ? "done" : ordered ? "running" : "open"}>
      <h3>
        <Icon name="market" size={14} />
        {t("valuation.title")}
        {done ? <Tag tone={done.kind === "adviser" ? "good" : "accent"}>{t(`valuation.kind.${done.kind}`)}</Tag> : null}
        {ordered ? (
          <Tag tone="accent" icon={<Icon name="clock" size={12} />}>
            {t("valuation.running")}
          </Tag>
        ) : null}
      </h3>
      {done ? (
        <>
          <div className="valuation-range">
            <strong>
              {f.money(done.low)} – {f.money(done.high)}
            </strong>
            <span className="muted">{t("valuation.mid", { amount: f.money(done.mid) })}</span>
          </div>
          <div className="grid cols-3">
            <Stat label={t("valuation.multiple")} value={f.multiple(done.multiple_millis)} tip={t("valuation.basis", { ebitda: f.money(done.ebitda) })} />
            {done.sector_multiple_millis > 0 ? (
              <Stat label={t("valuation.comps")} value={f.multiple(done.sector_multiple_millis)} />
            ) : null}
            <Stat label={t("valuation.equity")} value={`${f.money(done.low - done.net_debt)} – ${f.money(done.high - done.net_debt)}`} tip={t("valuation.equityTip", { debt: f.money(done.net_debt) })} />
          </div>
          <p className="muted valuation-note">
            {t("valuation.asOf", { date: f.date(done.date), width: f.pct(done.error_bps, 0) })}
          </p>
          {done.kind === "internal" && !ordered ? (
            <div className="valuation-actions">
              <button type="button" className="btn small" onClick={() => order("adviser")} title={feeTip}>
                <Icon name="career" size={13} />
                {t("valuation.upgrade", { fee: f.money(fee) })}
              </button>
            </div>
          ) : null}
        </>
      ) : ordered ? (
        <p className="muted">{t(`valuation.wait.${ordered}`)}</p>
      ) : (
        <>
          <p className="muted">{t("valuation.why")}</p>
          <div className="valuation-options">
            <button
              type="button"
              className="valuation-option"
              {...gate(noAttention && t("gate.attention", { need: 1, left: view.attention.left }))}
              disabled={noAttention}
              onClick={() => order("internal")}
            >
              <strong>
                <Icon name="table" size={15} />
                {t("valuation.kind.internal")}
              </strong>
              <span>{t("valuation.internal.what")}</span>
              <span className="valuation-price">
                <Icon name="bolt" size={12} />1
              </span>
            </button>
            <button type="button" className="valuation-option" onClick={() => order("adviser")} title={feeTip}>
              <strong>
                <Icon name="career" size={15} />
                {t("valuation.kind.adviser")}
              </strong>
              <span>{t("valuation.adviser.what")}</span>
              <span className="valuation-price">{f.money(fee)}</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
