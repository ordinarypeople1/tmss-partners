import { useEffect, useState } from "react";
import { Bookmark, Check, SlidersHorizontal, X } from "lucide-react";
import { motion, useDragControls } from "motion/react";
import { useIntl } from "react-intl";
import { attributeRating, money, shortName } from "../game/format";
import { useGame } from "../game/session";
import { readShortlist, takeSearchQuery, toggleShortlist } from "../game/shortlist";
import type { CompaniesPage, CompanyRow } from "../game/types";
import { spring } from "../motion";
import { DataTable, IconButton, Pager, Rating, RowMenu } from "../widgets";

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
  const [q, setQ] = useState("");
  const [onMarket, setOnMarket] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("revenue");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CompaniesPage | null>(null);
  const [sheet, setSheet] = useState(false);
  const [bounds, setBounds] = useState<Bounds>(EMPTY_BOUNDS);
  const [applied, setApplied] = useState<Bounds>(EMPTY_BOUNDS);
  const [shortOnly, setShortOnly] = useState(false);
  const [stars, setStars] = useState<string[]>(() => readShortlist());
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const drag = useDragControls();

  useEffect(() => {
    const pending = takeSearchQuery();
    if (pending) {
      setQ(pending);
    }
    const onSearch = (event: Event) => {
      const value = (event as CustomEvent<string>).detail ?? "";
      setQ(value);
      setOffset(0);
    };
    const onStars = () => setStars(readShortlist());
    window.addEventListener("deal-atlas-search", onSearch);
    window.addEventListener("deal-atlas-shortlist", onStars);
    return () => {
      window.removeEventListener("deal-atlas-search", onSearch);
      window.removeEventListener("deal-atlas-shortlist", onStars);
    };
  }, []);

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

  const rows = (page?.rows ?? []).filter((row) => !shortOnly || stars.includes(row.id));
  const pages = Math.max(1, Math.ceil((page?.total ?? 0) / 20));
  const chosen = rows.find((row) => row.id === menu?.id);

  return (
    <div className="workspace">
      <div className="section-title">
        <h2>{intl.formatMessage({ id: "nav.scout" })}</h2>
        <IconButton label={intl.formatMessage({ id: "shortlist.only" })} pressed={shortOnly} onClick={() => setShortOnly((value) => !value)}>
          <Bookmark size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <IconButton label={intl.formatMessage({ id: "filter.open" })} onClick={() => setSheet(true)}>
          <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
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
      {rows.length === 0 ? <p>{intl.formatMessage({ id: "company.empty" })}</p> : null}
      <DataTable
        sort={sort}
        onSort={(id) => {
          if ((SORTS as readonly string[]).includes(id)) {
            setSort(id as (typeof SORTS)[number]);
            setOffset(0);
          }
        }}
        onMenu={(id, x, y) => setMenu({ id, x, y })}
        columns={[
          { id: "name", label: intl.formatMessage({ id: "table.name" }) },
          { id: "sector", label: intl.formatMessage({ id: "table.sector" }) },
          { id: "revenue", label: intl.formatMessage({ id: "table.revenue" }), numeric: true },
          { id: "assets", label: intl.formatMessage({ id: "table.assets" }), numeric: true },
          { id: "growth", label: intl.formatMessage({ id: "rate.growth" }), numeric: true },
        ]}
        rows={rows.map((row) => rowCells(row, intl))}
      />
      <Pager
        page={Math.floor(offset / 20)}
        pages={pages}
        onPrev={() => setOffset((value) => Math.max(0, value - 20))}
        onNext={() => setOffset((value) => value + 20)}
      />
      {sheet ? (
        <>
          <button type="button" className="sheet-back" aria-label={intl.formatMessage({ id: "filter.close" })} onClick={() => setSheet(false)} />
          <motion.form
            className="sheet glass"
            role="dialog"
            aria-label={intl.formatMessage({ id: "filter.title" })}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.y > 96) {
                setSheet(false);
              }
            }}
            transition={spring}
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(bounds);
              setOffset(0);
              setSheet(false);
            }}
          >
            <button
              type="button"
              className="sheet-handle"
              aria-label={intl.formatMessage({ id: "sheet.handle" })}
              onPointerDown={(event) => drag.start(event)}
            />
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
              <IconButton submit label={intl.formatMessage({ id: "filter.apply" })}>
                <Check size={18} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
              <IconButton label={intl.formatMessage({ id: "filter.close" })} onClick={() => setSheet(false)}>
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            </div>
          </motion.form>
        </>
      ) : null}
      {menu && chosen ? (
        <RowMenu
          x={menu.x}
          y={menu.y}
          label={intl.formatMessage({ id: "filter.close" })}
          onClose={() => setMenu(null)}
          items={[
            { id: "open", label: intl.formatMessage({ id: "menu.open" }), onSelect: () => { window.location.hash = `#/company/${chosen.id}`; } },
            {
              id: "star",
              label: intl.formatMessage({ id: stars.includes(chosen.id) ? "menu.unshort" : "menu.short" }),
              onSelect: () => setStars(toggleShortlist(chosen.id)),
            },
            {
              id: "approach",
              label: intl.formatMessage({ id: "menu.approach" }),
              onSelect: () => void run({ op: "approach", company_id: chosen.id }),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

function rowCells(row: CompanyRow, intl: ReturnType<typeof useIntl>) {
  return {
    id: row.id,
    onOpen: () => {
      window.location.hash = `#/company/${row.id}`;
    },
    cells: {
      name: shortName(row.name_ko, row.legal_name_ko),
      sector: intl.formatMessage({ id: `sector.${row.sector_id}` }),
      revenue: money(intl, row.revenue),
      assets: money(intl, row.total_assets ?? null),
      growth: (
        <Rating
          score={attributeRating(row.growth_bps)}
          label={intl.formatMessage({ id: "rate.growth" })}
        />
      ),
    },
  };
}
