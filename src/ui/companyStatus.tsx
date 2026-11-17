import { useIntl } from "react-intl";

const IDS = {
  loading: "company.loading",
  empty: "company.empty",
  error: "company.loadError",
} as const;

export function CompanyStatus({ state }: { state: keyof typeof IDS }) {
  const intl = useIntl();
  return <p>{intl.formatMessage({ id: IDS[state] })}</p>;
}
