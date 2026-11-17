import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { money, multiple, percentFromBps } from "../game/format";
import { useGame } from "../game/session";
import type { PortfolioPage } from "../game/types";
import { DataTable } from "../widgets";

const ACTIONS = ["cost", "pricing", "capex", "asset_sale"] as const;
const BOARD = ["capex_up", "dividend_up", "dividend_down"] as const;

export function PortfolioScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [page, setPage] = useState<PortfolioPage | null>(null);
  const [selected, setSelected] = useState("");
  const [candidate, setCandidate] = useState("");
  const [payout, setPayout] = useState("1000");
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
    return <p>{intl.formatMessage({ id: "company.loading" })}</p>;
  }
  const holding = page.rows.find((row) => row.company_id === selected) ?? page.rows[0];

  return (
    <div className="workspace">
      {page.rows.length === 0 ? <p>{intl.formatMessage({ id: "company.noneHeld" })}</p> : null}
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
            name: row.legal_name_ko,
            instrument: intl.formatMessage({ id: `instrument.${row.instrument}` }),
            stake: percentFromBps(intl, row.ownership_bps),
            mark: money(intl, row.mark),
            moic: multiple(intl, row.moic_millis),
          },
        }))}
      />
      {holding ? (
        <section className="stack">
          <h2>{holding.legal_name_ko}</h2>
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
