import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { money, percentFromBps } from "../game/format";
import { useGame } from "../game/session";
import type { MarketPage } from "../game/types";
import { Spark } from "../rails";
import { Skeleton, Stat } from "../widgets";

export function MarketScreen() {
  const intl = useIntl();
  const { epoch, run } = useGame();
  const [page, setPage] = useState<MarketPage | null>(null);
  const [sector, setSector] = useState("");
  useEffect(() => {
    let cancel = false;
    void run({ op: "market" }).then((result) => {
      if (!cancel && result.page?.kind === "market") {
        setPage(result.page);
        setSector((current) => current || (result.page?.kind === "market" ? result.page.sectors[0]?.id ?? "" : ""));
      }
    });
    return () => {
      cancel = true;
    };
  }, [run, epoch]);

  if (!page) {
    return <Skeleton label={intl.formatMessage({ id: "company.loading" })} />;
  }
  const chosen = page.sectors.find((item) => item.id === sector) ?? page.sectors[0];

  return (
    <div className="workspace">
      <h2>{intl.formatMessage({ id: "market.title" })}</h2>
      <div className="stat-strip">
        <Stat
          label={intl.formatMessage({ id: "economy.index" })}
          value={intl.formatNumber(page.index)}
          amount={page.index}
          format={(next) => intl.formatNumber(Math.round(next))}
          tone="key"
        />
        <Stat label={intl.formatMessage({ id: "market.ipo" })} value={intl.formatMessage({ id: `market.ipo.${page.ipo}` })} />
        <Stat
          label={intl.formatMessage({ id: "market.ma" })}
          value={intl.formatMessage({ id: "market.live" }, { live: page.live, companies: page.companies })}
        />
        <Stat label={intl.formatMessage({ id: "market.credit" })} value={percentFromBps(intl, page.lbo_bps)} />
      </div>
      <Spark values={page.spark} />
      <section className="card panel">
        <h3>{intl.formatMessage({ id: "market.held" })}</h3>
        {page.held.length === 0 ? <p className="muted">{intl.formatMessage({ id: "market.empty" })}</p> : null}
        <ul className="plain-list">
          {page.held.map((row) => (
            <li key={row.id}>
              <a href={`#/company/${row.id}`}>
                <strong>{row.name}</strong>
                <span className="muted">
                  {intl.formatMessage({ id: `sector.${row.sector_id}` })}
                  {" · "}
                  {intl.formatMessage({ id: "market.rank" })} {intl.formatNumber(row.rank)}/{intl.formatNumber(row.of)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>{intl.formatMessage({ id: "market.industries" })}</h3>
        <ol className="industry-list">
          {page.sectors.map((item) => (
            <li key={item.id}>
              <button type="button" aria-pressed={chosen?.id === item.id} onClick={() => setSector(item.id)}>
                <span>{intl.formatMessage({ id: `sector.${item.id}` })}</span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-normal" />
                  <span className="bar-fill" style={{ transform: `scaleX(${Math.min(item.index, 160) / 160})` }} />
                </span>
                <span className="num">{intl.formatNumber(item.index)}</span>
                <span className="muted num">
                  {money(intl, item.revenue)}
                  {" · "}
                  {percentFromBps(intl, item.growth_bps)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      {chosen ? (
        <section className="card panel">
          <h3>
            {intl.formatMessage({ id: "market.share" })}
            {" · "}
            {intl.formatMessage({ id: `sector.${chosen.id}` })}
          </h3>
          <ol className="share-list">
            {chosen.bars.map((bar) => (
              <li key={bar.id}>
                <span>
                  {bar.name}
                  {bar.held ? <span className="badge key">{intl.formatMessage({ id: "nav.portfolio" })}</span> : null}
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span className="bar-fill" style={{ transform: `scaleX(${bar.bps / 10000})` }} />
                </span>
                <span className="num">{percentFromBps(intl, bar.bps)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
