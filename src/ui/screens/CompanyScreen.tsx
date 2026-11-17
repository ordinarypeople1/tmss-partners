import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useIntl } from "react-intl";
import { AtlasMap } from "../AtlasMap";
import { money, multiple, percentFromBps, shortName } from "../game/format";
import { useGame } from "../game/session";
import type { Books, CompanyPage } from "../game/types";
import { useMotionReady } from "../motion";
import { joinBase } from "../publicPath";
import { AssetCard, DataTable, Skeleton } from "../widgets";

interface HistQuarter {
  period: string;
  income: Record<string, number>;
  balance: Record<string, number>;
  cashflow: Record<string, number>;
}

interface Line {
  period: string;
  values: Record<string, number>;
}

const IS = ["revenue", "cogs", "gross", "sga", "ebitda", "da", "ebit", "interest", "tax", "ni"] as const;
const BS = ["cash", "ar", "inv", "ppe", "ap", "debt", "equity"] as const;
const CF = ["cfo", "cfi", "cff", "dividend", "net"] as const;

export function CompanyScreen({ id }: { id: string }) {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const motionReady = useMotionReady();
  const [page, setPage] = useState<CompanyPage | null>(null);
  const [history, setHistory] = useState<HistQuarter[]>([]);
  const [tab, setTab] = useState<"is" | "bs" | "cf">("is");
  useEffect(() => {
    let cancel = false;
    void run({ op: "company", company_id: id }).then((result) => {
      if (!cancel && result.page?.kind === "company") {
        setPage(result.page);
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, id, epoch]);

  useEffect(() => {
    if (!page?.company.revealed) {
      return;
    }
    let cancel = false;
    fetch(joinBase(import.meta.env.BASE_URL, `atlas/companies/${id}.json`))
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { quarters?: HistQuarter[] } | null) => {
        if (!cancel) {
          setHistory(body?.quarters ?? []);
        }
      })
      .catch(() => {
        if (!cancel) {
          setHistory([]);
        }
      });
    return () => {
      cancel = true;
    };
  }, [id, page?.company.revealed]);

  if (!page) {
    return <Skeleton label={intl.formatMessage({ id: "company.loading" })} />;
  }
  const company = page.company;
  const lines = page.books ? mergeLines(history, page.generated, page.books).slice(-12) : [];
  const columns = tab === "bs" ? BS : tab === "cf" ? CF : IS;
  const netDebt = company.debt != null && company.cash != null ? company.debt - company.cash : null;
  const waiting = !company.revealed && (company.dd_ready_week ?? 0) > 0;

  return (
    <div className="workspace">
      <motion.header className="hero" layoutId={motionReady ? `company-${id}` : undefined}>
        <p className="eyebrow">{intl.formatMessage({ id: "company.legal" })}</p>
        <h2>{company.legal_name_ko}</h2>
        <p className="muted">{shortName(company.name_ko, company.legal_name_ko)}</p>
        <p className="muted">
          {intl.formatMessage({ id: `sector.${company.sector_id}` })}
          {" · "}
          {intl.formatMessage(
            { id: "company.meta" },
            { year: company.founded_year, employees: company.employees },
          )}
          {" · "}
          {intl.formatMessage({ id: `seller.${page.owner_kind}` })}
        </p>
      </motion.header>
      <dl className="facts">
        <div>
          <dt>{intl.formatMessage({ id: "fact.revenue" }, { period: company.period })}</dt>
          <dd>{money(intl, company.revenue)}</dd>
        </div>
        <div>
          <dt>{intl.formatMessage({ id: "fact.assets" })}</dt>
          <dd>{money(intl, company.total_assets ?? null)}</dd>
        </div>
        {company.revealed ? (
          <>
            <div>
              <dt>{intl.formatMessage({ id: "fact.ebitda" })}</dt>
              <dd>{money(intl, company.ebitda)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "fact.multiple" })}</dt>
              <dd>{multiple(intl, company.model_multiple_millis)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "fact.modelEv" })}</dt>
              <dd>{money(intl, company.model_ev)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "fact.netDebt" })}</dt>
              <dd>{money(intl, netDebt)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "fact.modelEquity" })}</dt>
              <dd>{money(intl, company.model_equity)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {company.revealed ? (
        <p className="disclaimer">{intl.formatMessage({ id: "fund.markNote" })}</p>
      ) : (
        <section className="hero">
          <p>{waiting ? intl.formatMessage({ id: "dd.running" }) : intl.formatMessage({ id: "dd.note" })}</p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={waiting}
              onClick={() => void run({ op: "start_dd", company_id: id })}
            >
              {intl.formatMessage({ id: waiting ? "dd.running" : "dd.start" })}
            </button>
            <button
              type="button"
              disabled={company.on_market || company.held}
              onClick={() => void run({ op: "approach", company_id: id })}
            >
              {intl.formatMessage({ id: "company.approach" })}
            </button>
          </div>
        </section>
      )}
      <div className="split">
        <section>
          <h3>{intl.formatMessage({ id: "company.sites" })}</h3>
          <div className="asset-grid">
            {page.sites.map((site) => (
              <AssetCard
                key={site.id}
                kind={site.kind}
                name={site.name_ko}
                meta={
                  company.revealed
                    ? intl.formatMessage({ id: "site.book" }, { value: money(intl, site.book_value) })
                    : company.region_label_ko
                }
              />
            ))}
          </div>
        </section>
        <AtlasMap
          pins={page.sites.map((site) => ({
            id: site.id,
            name: site.name_ko,
            lat: site.lat,
            lon: site.lon,
            kind: site.kind,
          }))}
          selectedId={page.sites[0]?.id ?? ""}
          onSelect={() => undefined}
        />
      </div>
      <section>
        <h3>{intl.formatMessage({ id: "company.people" })}</h3>
        <DataTable
          columns={[
            { id: "name", label: intl.formatMessage({ id: "table.name" }) },
            { id: "role", label: intl.formatMessage({ id: "table.role" }) },
            { id: "trait", label: intl.formatMessage({ id: "own.pick" }) },
          ]}
          rows={page.management.map((person) => ({
            id: person.id,
            cells: {
              name: person.name_ko,
              role: intl.formatMessage({ id: `role.${person.role}` }),
              trait: intl.formatMessage({ id: `trait.${person.trait_id}` }),
            },
          }))}
        />
      </section>
      {company.revealed ? (
      <section>
        <h3>{intl.formatMessage({ id: "company.cap" })}</h3>
        <DataTable
          columns={[
            { id: "holder", label: intl.formatMessage({ id: "table.holder" }) },
            { id: "kind", label: intl.formatMessage({ id: "table.kind" }) },
            { id: "stake", label: intl.formatMessage({ id: "table.stake" }), numeric: true },
          ]}
          rows={page.cap.map((row, index) => ({
            id: `${row.holder_kind}-${index}`,
            cells: {
              holder: row.holder_ko,
              kind: intl.formatMessage({ id: `holder.${row.holder_kind}` }),
              stake: percentFromBps(intl, row.stake_bps),
            },
          }))}
        />
      </section>
      ) : null}
      {company.revealed && page.books ? (
      <section>
        <h3>{intl.formatMessage({ id: "company.statements" })}</h3>
        <div className="tabs">
          {(["is", "bs", "cf"] as const).map((key) => (
            <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
              {intl.formatMessage({ id: `stmt.${key}` })}
            </button>
          ))}
        </div>
        <DataTable
          columns={[
            { id: "period", label: intl.formatMessage({ id: "table.period" }) },
            ...columns.map((key) => ({
              id: key,
              label: intl.formatMessage({ id: `line.${key}` }),
              numeric: true,
            })),
          ]}
          rows={lines.map((line) => ({
            id: line.period,
            cells: {
              period: line.period,
              ...Object.fromEntries(columns.map((key) => [key, money(intl, line.values[key] ?? 0)])),
            },
          }))}
        />
      </section>
      ) : null}
      {company.revealed ? (
      <>
      <section>
        <h3>{intl.formatMessage({ id: "company.position" })}</h3>
        {page.position ? (
          <dl className="facts">
            <div>
              <dt>{intl.formatMessage({ id: "deal.instrument" })}</dt>
              <dd>{intl.formatMessage({ id: `instrument.${page.position.instrument}` })}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "table.stake" })}</dt>
              <dd>{percentFromBps(intl, page.position.ownership_bps)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "own.cost" })}</dt>
              <dd>{money(intl, page.position.cost)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "fact.mark" })}</dt>
              <dd className="key">{money(intl, page.position.mark)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "own.moic" })}</dt>
              <dd>{multiple(intl, page.position.moic_millis)}</dd>
            </div>
            <div>
              <dt>{intl.formatMessage({ id: "fact.cleared" })}</dt>
              <dd>{money(intl, page.position.entry_ev)}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">{intl.formatMessage({ id: "company.noneHeld" })}</p>
        )}
      </section>
      <section>
        <h3>{intl.formatMessage({ id: "company.history" })}</h3>
        <ul className="plain-list">
          {page.cleared.map((event, index) => (
            <li key={`${event.kind}-${index}`}>
              {intl.formatMessage({ id: `cleared.${event.kind}` })}
              {" · "}
              {intl.formatMessage({ id: "fact.cleared" })}
              {" · "}
              {money(intl, event.ev)}
            </li>
          ))}
        </ul>
      </section>
      </>
      ) : null}
    </div>
  );
}

function fromBooks(books: Books): Line {
  return {
    period: books.period,
    values: {
      revenue: books.revenue,
      cogs: books.cogs,
      gross: books.gross_profit,
      sga: books.sga,
      ebitda: books.ebitda,
      da: books.da,
      ebit: books.ebit,
      interest: books.interest,
      tax: books.tax,
      ni: books.net_income,
      cash: books.cash,
      ar: books.ar,
      inv: books.inv,
      ppe: books.net_ppe,
      ap: books.ap,
      debt: books.debt,
      equity: books.share_capital + books.retained,
      cfo: books.cfo,
      cfi: books.cfi,
      cff: books.cff,
      dividend: books.dividends,
      net: books.net_change,
    },
  };
}

function fromHist(quarter: HistQuarter): Line {
  const income = quarter.income;
  const balance = quarter.balance;
  const cashflow = quarter.cashflow;
  return {
    period: quarter.period,
    values: {
      revenue: income.revenue,
      cogs: income.cogs,
      gross: income.gross_profit,
      sga: income.sga,
      ebitda: income.ebitda,
      da: income.da,
      ebit: income.ebit,
      interest: income.interest_expense,
      tax: income.tax,
      ni: income.net_income,
      cash: balance.cash,
      ar: balance.accounts_receivable,
      inv: balance.inventory,
      ppe: balance.net_ppe,
      ap: balance.accounts_payable,
      debt: balance.debt,
      equity: balance.total_equity,
      cfo: cashflow.cash_from_operations,
      cfi: cashflow.cash_from_investing,
      cff: cashflow.cash_from_financing,
      dividend: cashflow.dividends,
      net: cashflow.net_change_in_cash,
    },
  };
}

function mergeLines(history: HistQuarter[], generated: Books[], latest: Books): Line[] {
  const lines = history.map(fromHist);
  const seen = new Set(lines.map((line) => line.period));
  for (const books of generated) {
    if (!seen.has(books.period)) {
      lines.push(fromBooks(books));
      seen.add(books.period);
    }
  }
  if (!seen.has(latest.period)) {
    lines.push(fromBooks(latest));
  }
  return lines;
}
