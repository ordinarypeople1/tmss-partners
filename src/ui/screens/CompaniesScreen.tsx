import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { money, multiple } from "../game/format";
import { useGame } from "../game/session";
import type { CompaniesPage } from "../game/types";
import { DataTable, Pager } from "../widgets";

const SECTORS = ["", "food_manufacturing", "industrial_components", "cold_chain_logistics"] as const;

export function CompaniesScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [sector, setSector] = useState("");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [onMarket, setOnMarket] = useState(false);
  const [sort, setSort] = useState("ebitda");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CompaniesPage | null>(null);
  useEffect(() => {
    let cancel = false;
    void run({
      op: "companies",
      sector,
      q,
      on_market: onMarket,
      sort,
      offset,
      limit: 20,
    }).then((result) => {
      if (!cancel && result.page?.kind === "companies") {
        setPage(result.page);
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, sector, q, onMarket, sort, offset, epoch]);

  const rows = page?.rows ?? [];
  const pages = Math.max(1, Math.ceil((page?.total ?? 0) / 20));

  return (
    <div className="workspace">
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          setOffset(0);
          setQ(draft);
        }}
      >
        <label>
          {intl.formatMessage({ id: "company.search" })}
          <input
            value={draft}
            aria-label={intl.formatMessage({ id: "company.search" })}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="submit">{intl.formatMessage({ id: "deal.search" })}</button>
        {SECTORS.map((id) => (
          <button
            key={id || "any"}
            type="button"
            className={sector === id ? "btn-primary" : undefined}
            aria-pressed={sector === id}
            onClick={() => {
              setSector(id);
              setOffset(0);
            }}
          >
            {intl.formatMessage({ id: id ? `sector.${id}` : "company.all" })}
          </button>
        ))}
        <button type="button" aria-pressed={onMarket} onClick={() => setOnMarket((value) => !value)}>
          {intl.formatMessage({ id: "company.onMarket" })}
        </button>
        <button type="button" aria-pressed={sort === "ebitda"} onClick={() => setSort("ebitda")}>
          {intl.formatMessage({ id: "sort.ebitda" })}
        </button>
        <button type="button" aria-pressed={sort === "name"} onClick={() => setSort("name")}>
          {intl.formatMessage({ id: "sort.name" })}
        </button>
      </form>
      {rows.length === 0 ? <p>{intl.formatMessage({ id: "company.empty" })}</p> : null}
      <DataTable
        columns={[
          { id: "name", label: intl.formatMessage({ id: "table.name" }) },
          { id: "sector", label: intl.formatMessage({ id: "table.sector" }) },
          { id: "revenue", label: intl.formatMessage({ id: "table.revenue" }), numeric: true },
          { id: "ebitda", label: intl.formatMessage({ id: "table.ebitda" }), numeric: true },
          { id: "multiple", label: intl.formatMessage({ id: "table.multiple" }), numeric: true },
          { id: "ev", label: intl.formatMessage({ id: "table.ev" }), numeric: true },
          { id: "approach", label: intl.formatMessage({ id: "company.approach" }) },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          onOpen: () => {
            window.location.hash = `#/company/${row.id}`;
          },
          cells: {
            name: row.legal_name_ko,
            sector: intl.formatMessage({ id: `sector.${row.sector_id}` }),
            revenue: money(intl, row.revenue),
            ebitda: money(intl, row.ebitda),
            multiple: multiple(intl, row.model_multiple_millis),
            ev: money(intl, row.model_ev),
            approach: row.on_market
              ? intl.formatMessage({ id: "company.onMarket" })
              : intl.formatMessage({ id: "company.approach" }),
          },
        }))}
      />
      <div className="row-actions">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={row.on_market || row.held}
            onClick={() => void run({ op: "approach", company_id: row.id })}
          >
            {row.legal_name_ko}
            {" · "}
            {intl.formatMessage({ id: "company.approach" })}
          </button>
        ))}
      </div>
      <Pager
        page={Math.floor(offset / 20)}
        pages={pages}
        onPrev={() => setOffset((value) => Math.max(0, value - 20))}
        onNext={() => setOffset((value) => value + 20)}
      />
    </div>
  );
}
