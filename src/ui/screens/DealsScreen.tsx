import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { AtlasMap } from "../AtlasMap";
import { money } from "../game/format";
import { useGame } from "../game/session";
import type { DealRow, DealsPage } from "../game/types";
import { DataTable, Pager } from "../widgets";

const SECTORS = ["", "food_manufacturing", "industrial_components", "cold_chain_logistics"] as const;
const STAGES = ["", "vc", "growth", "buyout", "distressed"] as const;
const PROCESSES = ["", "auction", "bilateral"] as const;

export function DealsScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [process, setProcess] = useState("");
  const [sort, setSort] = useState("ask");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DealsPage | null>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let cancel = false;
    void run({ op: "deals", sector, stage, process, sort, offset, limit: 20 }).then((result) => {
      if (!cancel && result.page?.kind === "deals") {
        setPage(result.page);
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, sector, stage, process, sort, offset, epoch]);

  const rows = page?.rows ?? [];
  const pages = Math.max(1, Math.ceil((page?.total ?? 0) / 20));

  return (
    <div className="workspace">
      <div className="filters" aria-label={intl.formatMessage({ id: "deal.filters" })}>
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
            {intl.formatMessage({ id: id ? `sector.${id}` : "deal.any" })}
          </button>
        ))}
        {STAGES.map((id) => (
          <button
            key={`stage-${id || "any"}`}
            type="button"
            className={stage === id ? "btn-primary" : undefined}
            aria-pressed={stage === id}
            onClick={() => {
              setStage(id);
              setOffset(0);
            }}
          >
            {intl.formatMessage({ id: id ? `stage.${id}` : "deal.any" })}
          </button>
        ))}
        {PROCESSES.map((id) => (
          <button
            key={`process-${id || "any"}`}
            type="button"
            className={process === id ? "btn-primary" : undefined}
            aria-pressed={process === id}
            onClick={() => {
              setProcess(id);
              setOffset(0);
            }}
          >
            {intl.formatMessage({ id: id ? `process.${id}` : "deal.any" })}
          </button>
        ))}
        <button type="button" aria-pressed={sort === "ask"} onClick={() => setSort("ask")}>
          {intl.formatMessage({ id: "deal.sortAsk" })}
        </button>
        <button type="button" aria-pressed={sort === "weeks"} onClick={() => setSort("weeks")}>
          {intl.formatMessage({ id: "deal.sortWeeks" })}
        </button>
      </div>
      <div className="split">
        <div>
          {rows.length === 0 ? <p>{intl.formatMessage({ id: "deal.empty" })}</p> : null}
          <DataTable
            columns={[
              { id: "name", label: intl.formatMessage({ id: "table.name" }) },
              { id: "stage", label: intl.formatMessage({ id: "deal.stage" }) },
              { id: "process", label: intl.formatMessage({ id: "deal.process" }) },
              { id: "ask", label: intl.formatMessage({ id: "fact.asking" }), numeric: true },
              { id: "weeks", label: intl.formatMessage({ id: "deal.weeks" }), numeric: true },
            ]}
            rows={rows.map((row) => ({
              id: row.id,
              onOpen: () => {
                window.location.hash = `#/deal/${row.id}`;
              },
              cells: cellsFor(intl, row),
            }))}
          />
          <Pager
            page={Math.floor(offset / 20)}
            pages={pages}
            onPrev={() => setOffset((value) => Math.max(0, value - 20))}
            onNext={() => setOffset((value) => value + 20)}
          />
        </div>
        <AtlasMap
          pins={rows.map((row) => ({
            id: row.id,
            name: row.legal_name_ko,
            lat: row.lat,
            lon: row.lon,
            kind: row.site_kind,
          }))}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id);
            window.location.hash = `#/deal/${id}`;
          }}
        />
      </div>
    </div>
  );
}

function cellsFor(intl: ReturnType<typeof useIntl>, row: DealRow): Record<string, string> {
  return {
    name: row.legal_name_ko,
    stage: intl.formatMessage({ id: `stage.${row.stage}` }),
    process: intl.formatMessage({ id: `process.${row.process}` }),
    ask: money(intl, row.ask_ev),
    weeks: intl.formatNumber(row.weeks_left),
  };
}
