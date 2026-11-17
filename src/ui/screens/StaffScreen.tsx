import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { traitRating } from "../game/format";
import { useGame } from "../game/session";
import type { PortfolioPage } from "../game/types";
import { DataTable, Rating, Skeleton } from "../widgets";

export function StaffScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [page, setPage] = useState<PortfolioPage | null>(null);
  useEffect(() => {
    let cancel = false;
    void run({ op: "portfolio" }).then((result) => {
      if (!cancel && result.page?.kind === "portfolio") {
        setPage(result.page);
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, epoch]);
  if (!page) {
    return <Skeleton label={intl.formatMessage({ id: "company.loading" })} />;
  }
  return (
    <div className="workspace">
      <h2>{intl.formatMessage({ id: "nav.staff" })}</h2>
      <DataTable
        columns={[
          { id: "name", label: intl.formatMessage({ id: "table.name" }) },
          { id: "trait", label: intl.formatMessage({ id: "own.pick" }) },
          { id: "lead", label: intl.formatMessage({ id: "rate.lead" }), numeric: true },
        ]}
        rows={page.candidates.map((person) => ({
          id: person.id,
          cells: {
            name: person.name_ko,
            trait: intl.formatMessage({ id: `trait.${person.trait_id}` }),
            lead: (
              <Rating
                score={traitRating(person.trait_id)}
                label={intl.formatMessage({ id: "rate.lead" })}
              />
            ),
          },
        }))}
      />
    </div>
  );
}
