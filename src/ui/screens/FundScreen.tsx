import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { money, multiple, percentFromBps } from "../game/format";
import { useGame } from "../game/session";
import type { DistributionPage, FundPage } from "../game/types";
import { DataTable, InfoTip, Skeleton, Stat } from "../widgets";

export function FundScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [page, setPage] = useState<FundPage | null>(null);
  const [split, setSplit] = useState<DistributionPage | null>(null);
  const [callAmount, setCallAmount] = useState("1000");
  const [distAmount, setDistAmount] = useState("0");
  useEffect(() => {
    let cancel = false;
    void run({ op: "fund" }).then((result) => {
      if (!cancel && result.page?.kind === "fund") {
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
  const fund = page.summary;
  const shown = split ?? null;

  return (
    <div className="workspace">
      <div className="section-title">
        <h2>{fund.name_ko}</h2>
        <InfoTip label={intl.formatMessage({ id: "fund.waterfallNote" })} />
      </div>
      <div className="stat-strip">
        <Stat
          label={intl.formatMessage({ id: "fund.nav" })}
          value={money(intl, fund.nav)}
          amount={fund.nav}
          format={(next) => money(intl, Math.round(next))}
          tone="key"
        />
        <Stat
          label={intl.formatMessage({ id: "fund.cash" })}
          value={money(intl, fund.cash)}
          amount={fund.cash}
          format={(next) => money(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.dpi" })}
          value={multiple(intl, fund.dpi_millis)}
          amount={fund.dpi_millis}
          format={(next) => multiple(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.tvpi" })}
          value={multiple(intl, fund.tvpi_millis)}
          amount={fund.tvpi_millis}
          format={(next) => multiple(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.irr" })}
          value={percentFromBps(intl, fund.irr_bps)}
          amount={fund.irr_bps}
          format={(next) => percentFromBps(intl, Math.round(next))}
        />
        <Stat
          label={intl.formatMessage({ id: "fund.reputation" })}
          value={intl.formatNumber(fund.reputation)}
          amount={fund.reputation}
          format={(next) => intl.formatNumber(Math.round(next))}
          tone="key"
        />
      </div>
      <section>
        <h3>{intl.formatMessage({ id: "fund.lps" })}</h3>
        <DataTable
          columns={[
            { id: "name", label: intl.formatMessage({ id: "table.name" }) },
            { id: "kind", label: intl.formatMessage({ id: "fund.lpKind" }) },
            { id: "commitment", label: intl.formatMessage({ id: "fund.commitment" }), numeric: true },
          ]}
          rows={page.lps.map((lp) => ({
            id: lp.id,
            cells: {
              name: lp.name_ko,
              kind: intl.formatMessage({ id: `lp.${lp.subtype}` }),
              commitment: money(intl, lp.commitment),
            },
          }))}
        />
      </section>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void run({ op: "call_capital", amount: Number(callAmount) });
        }}
      >
        <label>
          {intl.formatMessage({ id: "fund.call" })}
          <input
            inputMode="numeric"
            value={callAmount}
            aria-label={intl.formatMessage({ id: "fund.amount" })}
            onChange={(event) => setCallAmount(event.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary">
          {intl.formatMessage({ id: "fund.submitCall" })}
        </button>
      </form>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void run({ op: "distribute", amount: Number(distAmount) }).then((result) => {
            if (result.page?.kind === "distribution") {
              setSplit(result.page);
            }
          });
        }}
      >
        <label>
          {intl.formatMessage({ id: "fund.distribute" })}
          <input
            inputMode="numeric"
            value={distAmount}
            aria-label={intl.formatMessage({ id: "fund.amount" })}
            onChange={(event) => setDistAmount(event.target.value)}
          />
        </label>
        <button type="submit">{intl.formatMessage({ id: "fund.submitDist" })}</button>
      </form>
      <section>
        <h3>{intl.formatMessage({ id: "fund.preview" })}</h3>
        <WaterfallView
          roc={shown ? shown.roc : page.preview.roc}
          pref={shown ? shown.pref : page.preview.pref}
          catchUp={shown ? shown.catch_up_gp : page.preview.catch_up_gp}
          residualLp={shown ? shown.residual_lp : page.preview.residual_lp}
          residualGp={shown ? shown.residual_gp : page.preview.residual_gp}
          lp={shown ? shown.lp : page.preview.lp}
          gp={shown ? shown.gp : page.preview.gp}
        />
      </section>
      <section>
        <h3>{intl.formatMessage({ id: "fund.ii" })}</h3>
        <p className="muted">
          {intl.formatMessage({ id: "fund.active" })}
          {" · "}
          {fund.name_ko}
        </p>
        {(page.parked ?? []).map((parked) => (
          <article key={parked.slot} className="event-card">
            <h3>{parked.name_ko}</h3>
            <p className="muted">{intl.formatMessage({ id: "fund.parked" })}</p>
            <dl className="facts">
              <div>
                <dt>{intl.formatMessage({ id: "fund.commitment" })}</dt>
                <dd>{money(intl, parked.commitments)}</dd>
              </div>
              <div>
                <dt>{intl.formatMessage({ id: "fund.nav" })}</dt>
                <dd>{money(intl, parked.nav)}</dd>
              </div>
              <div>
                <dt>{intl.formatMessage({ id: "fund.cash" })}</dt>
                <dd>{money(intl, parked.cash)}</dd>
              </div>
            </dl>
          </article>
        ))}
        {page.fund_ii_ready ? (
          <button type="button" className="btn-primary" onClick={() => void run({ op: "raise_fund_ii" })}>
            {intl.formatMessage({ id: "fund.iiRaise" })}
          </button>
        ) : (
          <p className="muted">{intl.formatMessage({ id: "fund.iiWait" })}</p>
        )}
      </section>
      <section>
        <h3>{intl.formatMessage({ id: "fund.flows" })}</h3>
        <DataTable
          columns={[
            { id: "week", label: intl.formatMessage({ id: "table.week" }), numeric: true },
            { id: "kind", label: intl.formatMessage({ id: "table.kind" }) },
            { id: "amount", label: intl.formatMessage({ id: "table.amount" }), numeric: true },
          ]}
          rows={page.flows.map((flow) => ({
            id: String(flow.id),
            cells: {
              week: intl.formatNumber(flow.week),
              kind: intl.formatMessage({ id: `flow.${flow.kind}` }),
              amount: money(intl, flow.amount),
            },
          }))}
        />
      </section>
    </div>
  );
}

function WaterfallView({
  roc,
  pref,
  catchUp,
  residualLp,
  residualGp,
  lp,
  gp,
}: {
  roc: number;
  pref: number;
  catchUp: number;
  residualLp: number;
  residualGp: number;
  lp: number;
  gp: number;
}) {
  const intl = useIntl();
  const rows = [
    ["fund.roc", roc],
    ["fund.pref", pref],
    ["fund.catchUp", catchUp],
    ["fund.residualLp", residualLp],
    ["fund.residualGp", residualGp],
    ["fund.lpCash", lp],
    ["fund.gpCash", gp],
  ] as const;
  return (
    <dl className="facts">
      {rows.map(([id, value]) => (
        <div key={id}>
          <dt>{intl.formatMessage({ id })}</dt>
          <dd>{money(intl, value)}</dd>
        </div>
      ))}
    </dl>
  );
}
