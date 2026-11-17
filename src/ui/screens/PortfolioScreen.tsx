import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { money, multiple, percentFromBps, shortName } from "../game/format";
import { useGame } from "../game/session";
import type { PortfolioPage } from "../game/types";
import { ChoiceBar, DataTable, Skeleton, Stat } from "../widgets";

const ACTIONS = ["cost", "pricing", "capex", "asset_sale"] as const;
const BOARD = ["capex_up", "dividend_up", "dividend_down"] as const;

export function PortfolioScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [page, setPage] = useState<PortfolioPage | null>(null);
  const [selected, setSelected] = useState("");
  const [candidate, setCandidate] = useState("");
  const [payout, setPayout] = useState("1000");
  const [view, setView] = useState("board");
  useEffect(() => {
    let cancel = false;
    void run({ op: "portfolio" }).then((result) => {
      if (!cancel && result.page?.kind === "portfolio") {
        const body = result.page;
        setPage(body);
        setSelected((current) => current || body.rows[0]?.company_id || "");
        setCandidate((current) => current || body.candidates[0]?.id || "");
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, epoch]);

  if (!page) {
    return <Skeleton label={intl.formatMessage({ id: "company.loading" })} />;
  }
  const holding = page.rows.find((row) => row.company_id === selected) ?? page.rows[0];

  const summary = page.summary;
  const span = Math.max(1, ...page.rows.map((row) => Math.abs(row.created ?? row.mark - row.cost)));
  return (
    <div className="workspace">
      {summary ? (
        <div className="stat-strip">
          <Stat label={intl.formatMessage({ id: "port.deployed" })} value={money(intl, summary.deployed)} amount={summary.deployed} format={(next) => money(intl, Math.round(next))} />
          <Stat label={intl.formatMessage({ id: "port.value" })} value={money(intl, summary.value)} amount={summary.value} format={(next) => money(intl, Math.round(next))} tone="key" />
          <Stat label={intl.formatMessage({ id: "port.moic" })} value={multiple(intl, summary.moic_millis)} />
          <Stat label={intl.formatMessage({ id: "port.monthly" })} value={money(intl, summary.monthly)} />
        </div>
      ) : null}
      <ChoiceBar
        label={intl.formatMessage({ id: "port.board" })}
        layoutId="portfolio-view"
        value={view}
        onChange={setView}
        options={[
          { value: "board", label: intl.formatMessage({ id: "port.board" }) },
          { value: "cards", label: intl.formatMessage({ id: "port.cards" }) },
        ]}
      />
      {page.rows.length === 0 ? <p>{intl.formatMessage({ id: "company.noneHeld" })}</p> : null}
      <ol className="created-list">
        {page.rows.map((row) => {
          const created = row.created ?? row.mark - row.cost;
          return (
            <li key={row.company_id}>
              <span className="clamp">{shortName(row.legal_name_ko)}</span>
              <span className="bar-track" aria-hidden="true">
                <span className={created < 0 ? "bar-fill down" : "bar-fill"} style={{ transform: `scaleX(${Math.min(1, Math.abs(created) / span)})` }} />
              </span>
              <span className="num">{money(intl, created)}</span>
            </li>
          );
        })}
      </ol>
      {view === "cards" ? (
        <ol className="card-list">
          {page.rows.map((row) => (
            <li key={row.company_id}>
              <button type="button" className="hit-card" onClick={() => setSelected(row.company_id)}>
                <span className="grow">
                  <strong>{shortName(row.legal_name_ko)}</strong>
                  <span className="meta-line">
                    <span>{intl.formatMessage({ id: "port.entry" }, { week: row.entry_week ?? 0 })}</span>
                    {row.sector_id ? <span>{intl.formatMessage({ id: `sector.${row.sector_id}` })}</span> : null}
                    {row.issue ? <span className="badge">{intl.formatMessage({ id: row.issue === "vacant" ? "port.vacant" : "port.issue" })}</span> : null}
                    <span className="badge">{intl.formatMessage({ id: `port.${row.safety || "healthy"}` })}</span>
                  </span>
                </span>
                <span className="row-side">
                  <span className="num">{money(intl, row.mark)}</span>
                  <span className="num">{money(intl, row.ebit ?? null)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
      <DataTable
        columns={[
          { id: "name", label: intl.formatMessage({ id: "table.name" }) },
          { id: "instrument", label: intl.formatMessage({ id: "deal.instrument" }) },
          { id: "stake", label: intl.formatMessage({ id: "table.stake" }), numeric: true },
          { id: "mark", label: intl.formatMessage({ id: "fact.mark" }), numeric: true },
          { id: "moic", label: intl.formatMessage({ id: "own.moic" }), numeric: true },
        ]}
        rows={page.rows.map((row) => ({
          id: row.company_id,
          onOpen: () => setSelected(row.company_id),
          cells: {
            name: shortName(row.legal_name_ko),
            instrument: intl.formatMessage({ id: `instrument.${row.instrument}` }),
            stake: percentFromBps(intl, row.ownership_bps),
            mark: money(intl, row.mark),
            moic: multiple(intl, row.moic_millis),
          },
        }))}
      />
      )}
      {holding ? (
        <section className="stack">
          <h2>{shortName(holding.legal_name_ko)}</h2>
          <p className="muted">
            {holding.control
              ? intl.formatMessage({ id: "own.control" })
              : intl.formatMessage({ id: "own.minority" })}
            {" · "}
            {intl.formatMessage({ id: "own.seats" })} {intl.formatNumber(holding.board_seats)}
            {holding.breached ? ` · ${intl.formatMessage({ id: "own.breach" })}` : ""}
          </p>
          <p className="muted">{intl.formatMessage({ id: "own.actionOnce" })}</p>
          <div className="row-actions">
            {ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={!holding.control || holding.action_used}
                onClick={() => void run({ op: "action", company_id: holding.company_id, kind: action })}
              >
                {intl.formatMessage({ id: `action.${action}` })}
              </button>
            ))}
          </div>
          <h3>{intl.formatMessage({ id: "own.replace" })}</h3>
          <label>
            {intl.formatMessage({ id: "own.pick" })}
            <select value={candidate} onChange={(event) => setCandidate(event.target.value)}>
              {page.candidates.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name_ko}
                  {" · "}
                  {intl.formatMessage({ id: `trait.${person.trait_id}` })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!holding.control}
            onClick={() =>
              void run({ op: "appoint", company_id: holding.company_id, candidate_id: candidate })
            }
          >
            {intl.formatMessage({ id: "own.replace" })}
          </button>
          <h3>{intl.formatMessage({ id: "board.title" })}</h3>
          <div className="row-actions">
            {BOARD.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => void run({ op: "board", company_id: holding.company_id, choice })}
              >
                {intl.formatMessage({ id: `board.${choice}` })}
              </button>
            ))}
          </div>
          {holding.pending_agm ? (
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void run({
                  op: "agm",
                  company_id: holding.company_id,
                  dividend_payout_bps: Number(payout),
                  director_id: candidate,
                });
              }}
            >
              <h3>{intl.formatMessage({ id: "agm.title" })}</h3>
              <label>
                {intl.formatMessage({ id: "agm.payout" })}
                <input
                  inputMode="numeric"
                  value={payout}
                  aria-label={intl.formatMessage({ id: "agm.payout" })}
                  onChange={(event) => setPayout(event.target.value)}
                />
              </label>
              <button type="submit" className="btn-primary">
                {intl.formatMessage({ id: "agm.approve" })}
              </button>
            </form>
          ) : null}
          <p className="muted">{intl.formatMessage({ id: "exit.note" })}</p>
          <button
            type="button"
            onClick={() => void run({ op: "exit", company_id: holding.company_id })}
          >
            {intl.formatMessage({ id: "exit.sell" })}
          </button>
          <p>
            <a href={`#/company/${holding.company_id}`}>{intl.formatMessage({ id: "deal.openCompany" })}</a>
          </p>
        </section>
      ) : null}
    </div>
  );
}
