import { useMemo, useState } from "react";
import { useT } from "../i18n/useT";
import type { CompanyView, Offer } from "../sim/types";
import { Tag } from "./charts";
import { Cost, Segmented, StepRange } from "./DealRoom";
import { useFormat } from "./format";
import { useGame } from "./game";
import { gate } from "./Gate";
import { Icon } from "./icons";
import { Overlay } from "./Overlay";
import "./Minority.css";

/** New money at most this share of the price, as in a buyout. */
const MAX_PRIMARY_SHARE = 0.3;

/**
 * A minority stake offered to a founder who keeps the company: how much of it, at what
 * price, how much new money for the business, and in which class of shares. The owner
 * answers in a month or two; a yes opens talks alone on these terms.
 */
export function MinorityCard({ company }: { company: CompanyView }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const minority = company.minority;
  if (!minority.founder || company.sale || company.deal || company.held) {
    return null;
  }
  const short = company.relationship < minority.at;
  const pending = company.pending?.kind === "minority";
  const why = pending
    ? t("minority.pending", { months: company.pending?.months_left ?? 1 })
    : short
      ? t("minority.needs", { at: minority.at, now: company.relationship })
      : company.approach.cooldown > 0
        ? t("minority.cooldown", { months: company.approach.cooldown })
        : !minority.open
          ? t("minority.closed")
          : null;
  return (
    <section className="card minority-card">
      <h3>
        <Icon name="handshake" size={14} />
        {t("minority.title")}
        {pending ? <Tag tone="accent">{t("minority.waiting")}</Tag> : null}
      </h3>
      <p className="muted">{t("minority.lead")}</p>
      <button {...gate(why)} type="button" className="btn" disabled={why !== null} onClick={() => setOpen(true)}>
        <Icon name="handshake" size={15} />
        {t("minority.open")}
      </button>
      {why ? <small className="muted">{why}</small> : null}
      {open ? <MinorityDialog company={company} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

export function MinorityDialog({ company, onClose }: { company: CompanyView; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  // Before an NDA the fund knows only public ranges: the middle of the EBITDA range at the sector's multiple.
  const ebitdaMid = company.ebitda ? (company.ebitda[0] + company.ebitda[1]) / 2 : 0;
  const estimate = company.ev
    ? Math.round((company.ev[0] + company.ev[1]) / 2)
    : Math.round((ebitdaMid * company.sector_multiple_millis) / 1000);
  const [ev, setEv] = useState(estimate);
  const [stake, setStake] = useState(2_000);
  const [primary, setPrimary] = useState(0);
  const [preferred, setPreferred] = useState(false);
  const offer: Offer = useMemo(
    () => ({
      ev,
      senior_millis: 0,
      mezz_millis: 0,
      rollover_bps: 0,
      plan: [],
      mezz_kind: "notes",
      primary: Math.min(primary, Math.floor(ev * MAX_PRIMARY_SHARE)),
      kind: "minority",
      stake_bps: stake,
      preferred,
      lender: "bank",
      rate: "floating",
    }),
    [ev, stake, primary, preferred],
  );
  const preview = useMemo(() => game.previewMinority(company.i, offer), [game, company, offer]);
  const odds = preview?.odds_pct ?? 0;
  const mood = odds >= 60 ? "warm" : odds >= 35 ? "open" : "cool";
  const evStep = Math.max(1, Math.round(estimate / 200));
  const send = () => {
    if (game.act({ type: "propose_minority", company: company.i, offer })) {
      onClose();
    }
  };
  return (
    <Overlay>
      <div className="talk-scrim" role="dialog" aria-modal="true" aria-label={t("minority.title")} onClick={onClose}>
        <div className="talk minority" onClick={(event) => event.stopPropagation()}>
          <header>
            <span className="talk-kicker">{t("minority.title")}</span>
            <span className="muted clip">{company.short}</span>
          </header>
          <p className="muted">{t("minority.dialogLead", { name: company.ceo.name })}</p>
          <div className="minority-fields">
            <div className="slider">
              <label htmlFor="mi-ev" className="tip" tabIndex={0} data-tip={t("minority.ev.tip")}>
                {t("minority.ev")}
              </label>
              <output>{f.money(ev)}</output>
              <StepRange id="mi-ev" label={t("minority.ev")} min={Math.round(estimate * 0.7)} max={Math.round(estimate * 1.4)} step={evStep} value={ev} onChange={setEv} />
              <small>
                {company.ev
                  ? t("minority.ev.range", { range: f.figure(company.ev) })
                  : company.ebitda
                    ? t("minority.ev.basis", { ebitda: f.figure(company.ebitda), multiple: f.multiple(company.sector_multiple_millis) })
                    : null}
              </small>
            </div>
            <div className="slider">
              <label htmlFor="mi-stake" className="tip" tabIndex={0} data-tip={t("structure.stake.tip")}>
                {t("structure.stake")}
              </label>
              <output>{f.pct(stake, 0)}</output>
              <StepRange id="mi-stake" label={t("structure.stake")} min={company.minority.min_stake_bps} max={company.minority.max_stake_bps} step={100} value={stake} onChange={setStake} />
              <small>{t("structure.stake.terms")}</small>
            </div>
            <div className="slider">
              <label htmlFor="mi-primary" className="tip" tabIndex={0} data-tip={t("structure.primary.tip")}>
                {t("structure.primary")}
              </label>
              <output>{f.money(offer.primary)}</output>
              <StepRange id="mi-primary" label={t("structure.primary")} min={0} max={Math.floor(ev * MAX_PRIMARY_SHARE)} step={evStep} value={offer.primary} onChange={setPrimary} />
              <small>{t("minority.primary.terms")}</small>
            </div>
            <div className="slider">
              <span className="tip" tabIndex={0} data-tip={t("structure.class.tip")}>
                {t("structure.class")}
              </span>
              <Segmented
                label={t("structure.class")}
                options={["common", "preferred"]}
                value={preferred ? "preferred" : "common"}
                name={(option) => t(`structure.class.${option}`)}
                onChange={(option) => setPreferred(option === "preferred")}
              />
              <small>{t(preferred ? "structure.class.preferred.terms" : "structure.class.common.terms")}</small>
            </div>
          </div>
          {preview ? (
            <dl className="minority-result">
              <div>
                <dt>{t("minority.check")}</dt>
                <dd>{t("minority.about", { amount: f.money(preview.equity) })}</dd>
              </div>
              <div>
                <dt>{t("dealroom.minority.owns")}</dt>
                <dd>{t("minority.about", { amount: f.pct(preview.ownership_bps, 0) })}</dd>
              </div>
              <div data-mood={mood}>
                <dt>{t("minority.mood")}</dt>
                <dd>{t(`minority.mood.${mood}`, { pct: odds })}</dd>
              </div>
            </dl>
          ) : null}
          <footer className="row minority-actions">
            <button type="button" className="btn" onClick={onClose}>
              {t("action.cancel")}
            </button>
            <button
              {...gate(preview && !preview.valid ? t("minority.invalid") : null)}
              type="button"
              className="btn primary"
              disabled={!preview || !preview.valid}
              onClick={send}
            >
              {t("minority.send")}
              <Cost points={1} />
            </button>
          </footer>
        </div>
      </div>
    </Overlay>
  );
}
