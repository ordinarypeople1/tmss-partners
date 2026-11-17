import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { money, shortName } from "../game/format";
import { useGame } from "../game/session";
import type { CompaniesPage } from "../game/types";
import { Monogram, Pager, SectorMark } from "../widgets";

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

const SORTS = ["revenue", "assets", "name", "employees", "ni", "ebitda"] as const;

interface Bounds {
  min_revenue: string;
  max_revenue: string;
  min_assets: string;
  max_assets: string;
  min_ebitda: string;
  max_ebitda: string;
  min_margin: string;
  max_margin: string;
  min_debt: string;
  max_debt: string;
  min_growth: string;
  max_growth: string;
  min_ni: string;
  max_ni: string;
  min_employees: string;
  max_employees: string;
  region: string;
}

const EMPTY_BOUNDS: Bounds = {
  min_revenue: "",
  max_revenue: "",
  min_assets: "",
  max_assets: "",
  min_ebitda: "",
  max_ebitda: "",
  min_margin: "",
  max_margin: "",
  min_debt: "",
  max_debt: "",
  min_growth: "",
  max_growth: "",
  min_ni: "",
  max_ni: "",
  min_employees: "",
  max_employees: "",
  region: "",
};

function optionalNumber(value: string, scale = 1): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.trunc(parsed * scale);
}

export function CompaniesScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [sector, setSector] = useState("");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [onMarket, setOnMarket] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("revenue");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CompaniesPage | null>(null);
  const [sheet, setSheet] = useState(false);
  const [bounds, setBounds] = useState<Bounds>(EMPTY_BOUNDS);
  const [applied, setApplied] = useState<Bounds>(EMPTY_BOUNDS);

  useEffect(() => {
    let cancel = false;
    const payload: Record<string, string | number | boolean> = {
      op: "companies",
      sector,
      q,
      on_market: onMarket,
      sort,
      offset,
      limit: 20,
    };
    const scaled: [keyof Bounds, number][] = [
      ["min_margin", 100],
      ["max_margin", 100],
      ["min_debt", 100],
      ["max_debt", 100],
      ["min_growth", 100],
      ["max_growth", 100],
    ];
    const scales = Object.fromEntries(scaled) as Partial<Record<keyof Bounds, number>>;
    for (const key of Object.keys(applied) as (keyof Bounds)[]) {
      if (key === "region") {
        if (applied.region.trim()) {
          payload.region = applied.region.trim();
        }
        continue;
      }
      const value = optionalNumber(applied[key], scales[key] ?? 1);
      if (value != null) {
        payload[key] = value;
      }
    }
    void run(payload).then((result) => {
      if (!cancel && result.page?.kind === "companies") {
        setPage(result.page);
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, sector, q, onMarket, sort, offset, epoch, applied]);

  const rows = page?.rows ?? [];
  const pages = Math.max(1, Math.ceil((page?.total ?? 0) / 20));

  return (
    <div className="workspace">
      <div className="section-title">
        <h2>
          {intl.formatMessage(
            { id: "home.section" },
            { label: intl.formatMessage({ id: "nav.companies" }), count: page?.total ?? 0 },
          )}
        </h2>
        <button type="button" aria-label={intl.formatMessage({ id: "filter.open" })} onClick={() => setSheet(true)}>
          {intl.formatMessage({ id: "filter.open" })}
        </button>
      </div>
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
      </form>
      <div className="pills" aria-label={intl.formatMessage({ id: "table.sector" })}>
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
            {intl.formatMessage({ id: id ? `sector.${id}` : "company.all" })}
          </button>
        ))}
        <button type="button" aria-pressed={onMarket} onClick={() => setOnMarket((value) => !value)}>
          {intl.formatMessage({ id: "company.onMarket" })}
        </button>
      </div>
      <div className="pills" aria-label={intl.formatMessage({ id: "sort.name" })}>
        {SORTS.map((id) => (
          <button key={id} type="button" aria-pressed={sort === id} onClick={() => setSort(id)}>
            {intl.formatMessage({ id: `sort.${id}` })}
          </button>
        ))}
      </div>
      {rows.length === 0 ? <p>{intl.formatMessage({ id: "company.empty" })}</p> : null}
      <ol className="card-list">
        {rows.map((row) => {
          const name = shortName(row.name_ko, row.legal_name_ko);
          return (
            <li key={row.id}>
              <a className="hit-card" href={`#/company/${row.id}`}>
                <Monogram name={name} />
                <span className="grow">
                  <strong>{name}</strong>
                  <span className="muted">
                    <SectorMark id={row.sector_id} />
                    {intl.formatMessage({ id: `sector.${row.sector_id}` })}
                    {" · "}
                    {row.region_label_ko}
                  </span>
                </span>
                <span className="row-side">
                  <span className="num">
                    {intl.formatMessage({ id: "table.revenue" })} {money(intl, row.revenue)}
                    <br />
                    {intl.formatMessage({ id: "table.assets" })} {money(intl, row.total_assets ?? null)}
                  </span>
                  {row.on_market ? <span className="badge key">{intl.formatMessage({ id: "company.onMarket" })}</span> : null}
                  {row.held ? <span className="badge">{intl.formatMessage({ id: "nav.portfolio" })}</span> : null}
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
      {sheet ? (
        <>
          <button type="button" className="sheet-back" aria-label={intl.formatMessage({ id: "filter.close" })} onClick={() => setSheet(false)} />
          <form
            className="sheet"
            role="dialog"
            aria-label={intl.formatMessage({ id: "filter.title" })}
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(bounds);
              setOffset(0);
              setSheet(false);
            }}
          >
            <h2>{intl.formatMessage({ id: "filter.title" })}</h2>
            {(
              [
                ["revenue", "min_revenue", "max_revenue"],
                ["assets", "min_assets", "max_assets"],
                ["ebitda", "min_ebitda", "max_ebitda"],
                ["margin", "min_margin", "max_margin"],
                ["debt", "min_debt", "max_debt"],
                ["growth", "min_growth", "max_growth"],
                ["ni", "min_ni", "max_ni"],
                ["employees", "min_employees", "max_employees"],
              ] as const
            ).map(([label, minKey, maxKey]) => (
              <div className="form-grid" key={label}>
                <label>
                  {intl.formatMessage({ id: `filter.${label}` })}
                  {" · "}
                  {intl.formatMessage({ id: "filter.min" })}
                  <input
                    inputMode="decimal"
                    value={bounds[minKey]}
                    aria-label={`${intl.formatMessage({ id: `filter.${label}` })} ${intl.formatMessage({ id: "filter.min" })}`}
                    onChange={(event) => setBounds((current) => ({ ...current, [minKey]: event.target.value }))}
                  />
                </label>
                <label>
                  {intl.formatMessage({ id: "filter.max" })}
                  <input
                    inputMode="decimal"
                    value={bounds[maxKey]}
                    aria-label={`${intl.formatMessage({ id: `filter.${label}` })} ${intl.formatMessage({ id: "filter.max" })}`}
                    onChange={(event) => setBounds((current) => ({ ...current, [maxKey]: event.target.value }))}
                  />
                </label>
              </div>
            ))}
            <label>
              {intl.formatMessage({ id: "filter.region" })}
              <input
                value={bounds.region}
                aria-label={intl.formatMessage({ id: "filter.region" })}
                onChange={(event) => setBounds((current) => ({ ...current, region: event.target.value }))}
              />
            </label>
            <div className="hero-actions">
              <button type="submit" className="btn-primary">
                {intl.formatMessage({ id: "filter.apply" })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBounds(EMPTY_BOUNDS);
                  setApplied(EMPTY_BOUNDS);
                  setSheet(false);
                }}
              >
                {intl.formatMessage({ id: "filter.close" })}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
