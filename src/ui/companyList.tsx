import { useIntl } from "react-intl";
import type { CompanyCard } from "../data/page";

export function CompanyList({
  cards,
  selectedId,
  onSelect,
}: {
  cards: CompanyCard[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const intl = useIntl();
  return (
    <ol className="company-list">
      {cards.map((card) => (
        <li key={card.id}>
          <button
            type="button"
            className="company-button"
            aria-pressed={card.id === selectedId}
            onClick={() => onSelect(card.id)}
          >
            <span>{card.legal_name_ko}</span>
            <small>
              {intl.formatMessage({ id: `sector.${card.sector_id}` })}
              {" · "}
              {card.region_label_ko}
            </small>
          </button>
        </li>
      ))}
    </ol>
  );
}
