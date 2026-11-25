import { useState } from "react";
import { useT } from "../i18n/useT";
import type { Message } from "../sim/types";
import { BankerTalk } from "./BankerTalk";
import { Stat, Tag } from "./charts";
import { useFormat } from "./format";
import { useGame } from "./game";
import { gate } from "./Gate";
import { Icon } from "./icons";
import { EntityLink } from "./Links";
import "./Research.css";

/** How many companies each list shows. */
const SHOWN = 5;

type Note = Extract<Message, { type: "research_note" }>;

/**
 * What the player can do with a bank's research: talk it over with the banker (who may name a
 * sale in that sector), start the fund's own research, or go straight to the companies it is about.
 */
export function ResearchActions({ message }: { message: Note }) {
  const t = useT();
  const f = useFormat();
  const game = useGame();
  const { view } = game;
  const [talking, setTalking] = useState(false);
  const bank = view.advisers[message.adviser];
  if (!bank) {
    return null;
  }
  const sectorIndex = message.sector ? view.economy.sectors.findIndex((sector) => sector.id === message.sector) : -1;
  const sector = sectorIndex >= 0 ? view.economy.sectors[sectorIndex] : null;
  const insight = sectorIndex >= 0 ? (view.insight[sectorIndex] ?? 0) : 0;
  const rows = view.companies.filter((row) => !message.sector || row.sector === message.sector);
  // For sale now, best known first; then owners worth getting to know.
  const forSale = rows.filter((row) => row.sale && !row.held).slice(0, SHOWN);
  // Owners known to be thinking of selling first; with none known yet, the founders the fund knows best.
  const founders = rows.filter((row) => !row.sale && !row.held && row.owner.kind === "founder");
  const willing = founders.filter((row) => row.intent === "open" || row.intent === "eager" || row.intent === "thinking");
  const prospects = (willing.length > 0 ? willing : founders.filter((row) => row.intent !== "closed"))
    .sort((a, b) => b.relationship - a.relationship || b.revenue[1] - a.revenue[1])
    .slice(0, SHOWN);
  const noAttention = view.attention.left < 1;
  const meet = () => {
    if (game.act({ type: "cover_bank", adviser: message.adviser, sector: message.sector })) {
      setTalking(true);
    }
  };
  return (
    <section className="research">
      {talking && view.cover_talk ? <BankerTalk talk={view.cover_talk} onClose={() => setTalking(false)} /> : null}
      {sector ? (
        <div className="research-stats">
          <Stat label={t("research.stat.multiple")} value={f.multiple(sector.multiple_millis)} />
          <Stat label={t("research.stat.forSale")} value={f.integer(sector.for_sale)} />
          <Stat label={t("research.stat.companies")} value={f.integer(sector.companies)} />
        </div>
      ) : (
        <div className="research-stats">
          <Stat label={t("shell.policyRate")} value={f.pct(view.economy.policy_rate_bps, 2)} />
          <Stat label={t("shell.credit")} value={f.pct(view.economy.credit_spread_bps, 2)} />
          <Stat label={t("shell.valuation")} value={String(view.economy.valuation_index)} />
        </div>
      )}
      <div className="research-actions">
        <button {...gate(noAttention && t("gate.attention", { need: 1, left: view.attention.left }))} type="button" className="btn primary" disabled={noAttention} onClick={meet}>
          <Icon name="meet" size={15} />
          {t("research.meet", { banker: bank.banker.name })}
          <span className="journey-cost">
            <Icon name="bolt" size={11} />1
          </span>
        </button>
        {sectorIndex >= 0 ? (
          insight > 0 ? (
            <Tag tone="good" icon={<Icon name="check" size={12} />}>
              {t("market.research.left", { months: insight })}
            </Tag>
          ) : (
            <button
              {...gate(noAttention && t("gate.attention", { need: 1, left: view.attention.left }))}
              type="button"
              className="btn"
              disabled={noAttention}
              onClick={() => game.act({ type: "research_sector", sector: sectorIndex })}
            >
              <Icon name="search" size={15} />
              {t("research.study")}
              <span className="journey-cost">
                <Icon name="bolt" size={11} />1
              </span>
            </button>
          )
        ) : null}
      </div>
      <p className="muted research-hint">
        {t(message.sector ? "research.hint.sector" : "research.hint.market", { coverage: bank.coverage })}
      </p>
      <div className="research-lists">
        <div>
          <h4>{t("research.forSale")}</h4>
          {forSale.length === 0 ? (
            <p className="muted">{t("research.none")}</p>
          ) : (
            <ul>
              {forSale.map((row) => (
                <li key={row.i}>
                  <EntityLink page={{ kind: "company", id: row.i }}>{row.short}</EntityLink>
                  <span className="muted">{row.sale ? t(`stage.${row.sale.stage}`) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4>{t("research.prospects")}</h4>
          {prospects.length === 0 ? (
            <p className="muted">{t("research.prospectsNone")}</p>
          ) : (
            <ul>
              {prospects.map((row) => (
                <li key={row.i}>
                  <EntityLink page={{ kind: "company", id: row.i }}>{row.short}</EntityLink>
                  <span className="muted">{t(`intent.${row.intent ?? "unknown"}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
