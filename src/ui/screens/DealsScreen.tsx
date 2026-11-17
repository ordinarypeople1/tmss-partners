import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { AtlasMap } from "../AtlasMap";
import { money, shortName } from "../game/format";
import { useGame } from "../game/session";
import type { DealsPage } from "../game/types";
import { Monogram, Pager } from "../widgets";

const SECTORS = [
  "",
  "energy",
  "materials",
  "industrials",
  "discretionary",
  "staples",
  "health",
  "financials",
  "information_technology",
  "communication",
  "utilities",
  "real_estate",
] as const;
const STAGES = ["", "vc", "growth", "buyout", "distressed"] as const;
const PROCESSES = ["", "auction", "bilateral"] as const;

export function DealsScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [process, setProcess] = useState("");
  const [sort, setSort] = useState("weeks");
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
      <div className="section-title">
        <h2>
          {intl.formatMessage(
            { id: "home.section" },
            { label: intl.formatMessage({ id: "nav.deals" }), count: page?.total ?? 0 },
          )}
        </h2>
      </div>
      <div className="pills" aria-label={intl.formatMessage({ id: "deal.filters" })}>
        {SECTORS.map((id) => (
          <button
            key={id || "any"}
            type="button"
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
            aria-pressed={process === id}
            onClick={() => {
              setProcess(id);
              setOffset(0);
            }}
          >
            {intl.formatMessage({ id: id ? `process.${id}` : "deal.any" })}
          </button>
        ))}
        <button type="button" aria-pressed={sort === "weeks"} onClick={() => setSort("weeks")}>
          {intl.formatMessage({ id: "deal.sortWeeks" })}
        </button>
      </div>
      <div className="split">
        <div>
          {rows.length === 0 ? <p>{intl.formatMessage({ id: "deal.empty" })}</p> : null}
          <ol className="card-list">
            {rows.map((row) => {
              const name = shortName(row.name_ko, row.legal_name_ko);
              return (
                <li key={row.id}>
                  <a className="hit-card" href={`#/deal/${row.id}`} aria-current={selected === row.id ? "true" : undefined}>
                    <Monogram name={name} />
                    <span className="grow">
                      <strong>{name}</strong>
                      <span className="muted">
                        {intl.formatMessage({ id: `stage.${row.stage}` })}
                        {" · "}
                        {intl.formatMessage({ id: `process.${row.process}` })}
                        {" · "}
                        {intl.formatMessage({ id: "deal.weeks" })} {intl.formatNumber(row.weeks_left)}
                      </span>
                    </span>
                    <span className="row-side">
                      <span className="num">
                        {intl.formatMessage({ id: "table.revenue" })} {money(intl, row.revenue ?? null)}
                      </span>
                      <span className="badge">{intl.formatMessage({ id: `status.${row.status}` })}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
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
            name: shortName(row.name_ko, row.legal_name_ko),
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

