import { ArrowDown, ArrowUp } from "lucide-react";
import { useIntl } from "react-intl";
import type { Dashboard, NewsItem } from "./game/types";
import { money, percentFromBps } from "./game/format";
import { ChoiceBar } from "./widgets";

export function Spark({ values }: { values: number[] }) {
  const points = values.length > 0 ? values : [100];
  const min = Math.min(90, ...points);
  const max = Math.max(110, ...points);
  const width = 240;
  const height = 56;
  const step = points.length === 1 ? 0 : width / (points.length - 1);
  const yOf = (value: number) => height - ((value - min) / (max - min || 1)) * (height - 8) - 4;
  const base = yOf(100);
  const runs = points.slice(1).map((value, index) => {
    const previous = points[index];
    return {
      up: value >= 100 && previous >= 100,
      d: `M ${(index * step).toFixed(1)} ${yOf(previous).toFixed(1)} L ${((index + 1) * step).toFixed(1)} ${yOf(value).toFixed(1)}`,
    };
  });
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line x1="0" x2={width} y1={base} y2={base} className="spark-base" />
      {runs.map((run, index) => (
        <path key={index} d={run.d} className={run.up ? "spark-up" : "spark-down"} />
      ))}
    </svg>
  );
}

function periodLabel(period: string, intl: ReturnType<typeof useIntl>) {
  const match = /^(\d{4})Q([1-4])$/.exec(period);
  if (!match) {
    return intl.formatMessage({ id: "activity.title" });
  }
  return intl.formatMessage(
    { id: "clock.quarter" },
    { year: Number(match[1]), quarter: Number(match[2]) },
  );
}

export function ActivityRail({
  dash,
  filter,
  onFilter,
}: {
  dash: Dashboard;
  filter: string;
  onFilter: (value: string) => void;
}) {
  const intl = useIntl();
  const items = [...(dash.activity ?? []), ...dash.news].filter((item) => {
    if (filter === "deals") {
      return item.lane === "deals" || item.lane === "markets";
    }
    if (filter === "ops") {
      return item.lane === "ops" || item.template.startsWith("activity.");
    }
    return true;
  });
  const groups = new Map<string, NewsItem[]>();
  for (const item of items) {
    const key = item.period || "now";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return (
    <aside className="rail">
      <div className="rail-head">
        <h2>{intl.formatMessage({ id: "activity.title" })}</h2>
        <ChoiceBar
          label={intl.formatMessage({ id: "activity.title" })}
          layoutId="activity-filter"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: intl.formatMessage({ id: "activity.all" }) },
            { value: "deals", label: intl.formatMessage({ id: "activity.deals" }) },
            { value: "ops", label: intl.formatMessage({ id: "activity.ops" }) },
          ]}
        />
      </div>
      <div className="rail-scroll">
        {items.length === 0 ? <p className="muted">{intl.formatMessage({ id: "activity.empty" })}</p> : null}
        {[...groups.entries()].map(([period, rows]) => (
          <section key={period}>
            <h3 className="rail-month">{periodLabel(period, intl)}</h3>
            <ol className="rail-log">
              {rows.map((item) => (
                <li key={`${item.template}-${item.id}`}>
                  {intl.formatMessage({ id: item.template }, { company: item.company_ko, period: item.period })}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <div className="rail-foot">
        <p>
          <span>{intl.formatMessage({ id: "rail.cash" })}</span>
          <strong>{money(intl, dash.fund.cash)}</strong>
        </p>
        <p>
          <span>{intl.formatMessage({ id: "rail.nav" })}</span>
          <strong className="key">{money(intl, dash.fund.nav)}</strong>
        </p>
        <a className="btn-primary" href="#/fund">
          {intl.formatMessage({ id: "rail.profile" })}
        </a>
      </div>
    </aside>
  );
}

export function EconomyRail({
  dash,
  filter,
  onFilter,
}: {
  dash: Dashboard;
  filter: string;
  onFilter: (value: string) => void;
}) {
  const intl = useIntl();
  const economy = dash.economy;
  const news = dash.news.filter((item) => {
    if (filter === "all") {
      return true;
    }
    if (filter === "industries") {
      return item.template.startsWith("news.ebitda");
    }
    if (filter === "markets") {
      return item.lane === "markets" && !item.template.startsWith("news.ebitda");
    }
    return item.lane === filter;
  });
  return (
    <aside className="rail">
      <div className="rail-head">
        <p className="eyebrow">{intl.formatMessage({ id: "economy.index" })}</p>
        <p className="index-figure">{economy ? intl.formatNumber(economy.index) : intl.formatMessage({ id: "figure.none" })}</p>
        <p className="muted">{intl.formatMessage({ id: "economy.normal" })}</p>
        <Spark values={economy?.spark ?? []} />
      </div>
      <div className="stat-strip rail-stats">
        <div className="stat">
          <span>{intl.formatMessage({ id: "economy.rate" })}</span>
          <strong>{percentFromBps(intl, economy?.policy_bps ?? null)}</strong>
        </div>
        <div className="stat">
          <span>{intl.formatMessage({ id: "economy.inflation" })}</span>
          <strong>{percentFromBps(intl, economy?.inflation_bps ?? null)}</strong>
        </div>
      </div>
      <ChoiceBar
        label={intl.formatMessage({ id: "nav.economy" })}
        layoutId="economy-filter"
        value={filter}
        onChange={onFilter}
        options={[
          { value: "all", label: intl.formatMessage({ id: "economy.all" }) },
          { value: "macro", label: intl.formatMessage({ id: "economy.macro" }) },
          { value: "markets", label: intl.formatMessage({ id: "economy.markets" }) },
          { value: "industries", label: intl.formatMessage({ id: "economy.industries" }) },
          { value: "companies", label: intl.formatMessage({ id: "economy.companies" }) },
        ]}
      />
      <ol className="rail-log">
        {news.map((item) => (
          <li key={`news-${item.id}`}>
            <span className={item.tone === "down" ? "loss" : undefined}>
              {item.tone === "down" ? <ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
              {item.tone === "up" ? <ArrowUp size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
              {item.company_ko ? <span className="badge">{item.company_ko}</span> : null}
              {intl.formatMessage({ id: item.template }, { company: item.company_ko, period: item.period })}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
