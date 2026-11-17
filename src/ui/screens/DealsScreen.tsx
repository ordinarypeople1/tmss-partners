import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { motion } from "motion/react";
import { useIntl } from "react-intl";
import { AtlasMap } from "../AtlasMap";
import { money, percentFromBps, shortName } from "../game/format";
import { itemVariants, listVariants, press, useMotionReady } from "../motion";
import { useGame } from "../game/session";
import type { DealRow, DealsPage } from "../game/types";
import { ChoiceBar, Monogram } from "../widgets";

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

export function DealsScreen({ room = false }: { room?: boolean }) {
  const intl = useIntl();
  const { dash, epoch, run } = useGame();
  const [sector, setSector] = useState("");
  const [board, setBoard] = useState("public");
  const [reach, setReach] = useState(false);
  const [profit, setProfit] = useState(false);
  const [grid, setGrid] = useState(false);
  const motionReady = useMotionReady();
  const [page, setPage] = useState<DealsPage | null>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let cancel = false;
    void run({ op: "deals", sector, sort: "weeks", offset: 0, limit: 50 }).then((result) => {
      if (!cancel && result.page?.kind === "deals") {
        setPage(result.page);
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, sector, epoch]);

  const purse = (dash?.fund.cash ?? 0) + (dash?.fund.uncalled ?? 0);
  const rows = (page?.rows ?? []).filter((row) => {
    if (row.status === "dead" || row.status === "closed") {
      return false;
    }
    if (room) {
      return row.status !== "listed";
    }
    if (board === "firm" && row.access !== "proprietary") {
      return false;
    }
    if (board === "public" && row.access === "proprietary") {
      return false;
    }
    if (reach && (row.locked || row.ask_size > purse)) {
      return false;
    }
    if (profit && (row.ebit ?? 0) <= 0) {
      return false;
    }
    return true;
  });
  const pool = (page?.rows ?? []).filter((row) => row.status !== "dead" && row.status !== "closed");
  const publicCount = pool.filter((row) => row.access !== "proprietary").length;
  const reached = pool.filter((row) => !row.locked && row.ask_size <= purse).length;

  return (
    <div className="workspace">
      <div className="section-title">
        <h2>
          {intl.formatMessage(
            { id: "home.section" },
            {
              label: intl.formatMessage({ id: room ? "nav.room" : "nav.deals" }),
              count: rows.length,
            },
          )}
        </h2>
        <a href="#/companies">{intl.formatMessage({ id: "nav.companies" })}</a>
      </div>
      {room ? null : (
        <div className="board-tools">
          <ChoiceBar
            label={intl.formatMessage({ id: "nav.deals" })}
            layoutId="deal-board"
            value={board}
            onChange={setBoard}
            options={[
              { value: "public", label: intl.formatMessage({ id: "deal.public" }, { count: publicCount }) },
              { value: "firm", label: intl.formatMessage({ id: "deal.firm" }) },
            ]}
          />
          <label>
            {intl.formatMessage({ id: "table.sector" })}
            <select
              value={sector}
              aria-label={intl.formatMessage({ id: "table.sector" })}
              onChange={(event) => setSector(event.target.value)}
            >
              {SECTORS.map((id) => (
                <option key={id || "any"} value={id}>
                  {intl.formatMessage({ id: id ? `sector.${id}` : "deal.any" })}
                </option>
              ))}
            </select>
          </label>
          <button type="button" aria-pressed={reach} onClick={() => setReach((value) => !value)}>
            {intl.formatMessage({ id: "deal.reach" })}
          </button>
          <button type="button" aria-pressed={profit} onClick={() => setProfit((value) => !value)}>
            {intl.formatMessage({ id: "deal.profit" })}
          </button>
          <div className="segment" role="group" aria-label={intl.formatMessage({ id: "deal.viewList" })}>
            <button type="button" className="icon-btn" aria-label={intl.formatMessage({ id: "deal.viewList" })} aria-pressed={!grid} onClick={() => setGrid(false)}>
              <List size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn" aria-label={intl.formatMessage({ id: "deal.viewGrid" })} aria-pressed={grid} onClick={() => setGrid(true)}>
              <LayoutGrid size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <p className="muted">
        {intl.formatMessage({ id: "deal.reachCount" }, { cash: money(intl, purse), shown: reached, total: pool.length })}
      </p>
      {rows.length === 0 ? <p>{intl.formatMessage({ id: room ? "room.empty" : "deal.empty" })}</p> : null}
      {grid ? <DealGrid rows={rows} motionReady={motionReady} /> : <DealTable rows={rows} />}
      {room ? null : (
        <AtlasMap
          pins={rows.map((row) => ({
            id: row.id,
            name: shortName(row.name_ko, row.legal_name_ko),
            live: true,
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
      )}
    </div>
  );
}

function DealTable({ rows }: { rows: DealRow[] }) {
  const intl = useIntl();
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{intl.formatMessage({ id: "table.name" })}</th>
            <th>{intl.formatMessage({ id: "deal.op" })}</th>
            <th>{intl.formatMessage({ id: "deal.margin" })}</th>
            <th>{intl.formatMessage({ id: "deal.left" })}</th>
            <th>{intl.formatMessage({ id: "deal.ddNeed" })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = shortName(row.name_ko, row.legal_name_ko);
            return (
              <tr key={row.id} className="hit" role="link" tabIndex={0} onClick={() => { window.location.hash = `#/deal/${row.id}`; }} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  window.location.hash = `#/deal/${row.id}`;
                }
              }}>
                <td>
                  <strong>{name}</strong>
                  <span className="meta-line">
                    <span>{intl.formatMessage({ id: `sector.${row.sector_id}` })}</span>
                    <span className="badge">{intl.formatMessage({ id: `motive.${row.motive || "market"}` })}</span>
                  </span>
                </td>
                <td className="num">{money(intl, row.ebit ?? null)}</td>
                <td className="num">{percentFromBps(intl, row.margin_bps ?? null)}</td>
                <td className="num">{intl.formatNumber(row.weeks_left)}</td>
                <td>{row.revealed ? intl.formatMessage({ id: `status.${row.status}` }) : intl.formatMessage({ id: "deal.ddNeed" })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DealGrid({ rows, motionReady }: { rows: DealRow[]; motionReady: boolean }) {
  const intl = useIntl();
  return (
    <motion.ol className="card-list" initial={motionReady ? "hidden" : false} animate="show" variants={listVariants}>
      {rows.map((row) => {
        const name = shortName(row.name_ko, row.legal_name_ko);
        return (
          <motion.li key={row.id} variants={motionReady ? itemVariants : undefined}>
            <motion.a className="hit-card" href={`#/deal/${row.id}`} layoutId={motionReady ? `deal-${row.id}` : undefined} {...(motionReady ? press : {})}>
              <Monogram name={name} />
              <span className="grow">
                <strong className="clamp">{name}</strong>
                <span className="meta-line">
                  <span className="clamp">{intl.formatMessage({ id: `sector.${row.sector_id}` })}</span>
                  <span className="badge">{intl.formatMessage({ id: `motive.${row.motive || "market"}` })}</span>
                </span>
              </span>
              <span className="row-side">
                <span className="num">{money(intl, row.ebit ?? null)}</span>
                <span className="badge">{row.revealed ? intl.formatMessage({ id: `status.${row.status}` }) : intl.formatMessage({ id: "deal.ddNeed" })}</span>
              </span>
            </motion.a>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}
