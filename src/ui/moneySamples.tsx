import { useIntl } from "react-intl";
import { formatKrwMillion } from "../i18n/money";

const AMOUNTS = [2_549, 18_353, 50, 1_500_000, -2_549] as const;

export function MoneySamples() {
  const intl = useIntl();
  return (
    <ul className="company-list">
      {AMOUNTS.map((amount) => (
        <li key={amount}>{formatKrwMillion(intl, amount)}</li>
      ))}
      <li>{intl.formatMessage({ id: "company.meta" }, { year: 2012, employees: 345 })}</li>
    </ul>
  );
}
