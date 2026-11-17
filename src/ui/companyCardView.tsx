import { motion, useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";
import type { CompanyCard } from "../data/page";
import { formatKrwMillion } from "../i18n/money";
import type { QuotedValue } from "../sim/wasm";

export function CompanyCardView({
  card,
  seed,
  quoted,
  error,
}: {
  card: CompanyCard;
  seed: number;
  quoted: QuotedValue | null;
  error: boolean;
}) {
  const intl = useIntl();
  const reduceMotion = useReducedMotion();
  const netDebt = quoted ? quoted.netDebt : card.debt - card.cash;
  const pending = intl.formatMessage({ id: "fact.pending" });
  const failed = intl.formatMessage({ id: "fact.error" });

  return (
    <motion.article
      key={card.id}
      className="card"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
    >
      <p className="card-kicker">{card.complex_name_ko}</p>
      <h2>{card.legal_name_ko}</h2>
      <p className="card-meta">
        {intl.formatMessage({ id: `sector.${card.sector_id}` })}
        {" · "}
        {intl.formatMessage(
          { id: "company.meta" },
          { year: card.founded_year, employees: card.employees },
        )}
      </p>
      <dl className="facts">
        <div>
          <dt>{intl.formatMessage({ id: "fact.revenue" }, { period: card.period })}</dt>
          <dd>{formatKrwMillion(intl, card.revenue)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "fact.ebitda" })}</dt>
          <dd>{formatKrwMillion(intl, card.ebitda)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "fact.multiple" })}</dt>
          <dd>
            {intl.formatMessage(
              { id: "fact.multipleValue" },
              { multiple: card.model_multiple_millis / 1000 },
            )}
          </dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "fact.modelEv" })}</dt>
          <dd>{error ? failed : quoted ? formatKrwMillion(intl, quoted.enterpriseValue) : pending}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "fact.netDebt" })}</dt>
          <dd>{formatKrwMillion(intl, netDebt)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "fact.modelEquity" })}</dt>
          <dd>{error ? failed : quoted ? formatKrwMillion(intl, quoted.equityValue) : pending}</dd>
        </div>
      </dl>
      <p className="disclaimer">{intl.formatMessage({ id: "card.disclaimer" }, { seed })}</p>
    </motion.article>
  );
}
