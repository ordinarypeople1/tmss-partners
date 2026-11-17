import { useIntl } from "react-intl";
import type { AlertItem, NewsItem } from "./game/types";

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "key" | "loss";
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: { id: string; label: string; numeric?: boolean }[];
  rows: { id: string; cells: Record<string, string>; onOpen?: () => void }[];
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} className={column.numeric ? "num" : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column, index) => (
                <td key={column.id} className={column.numeric ? "num" : undefined}>
                  {index === 0 && row.onOpen ? (
                    <button type="button" className="link" onClick={row.onOpen}>
                      {row.cells[column.id] ?? ""}
                    </button>
                  ) : (
                    (row.cells[column.id] ?? "")
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NewsList({ items }: { items: NewsItem[] }) {
  const intl = useIntl();
  if (items.length === 0) {
    return <p className="muted">{intl.formatMessage({ id: "news.empty" })}</p>;
  }
  return (
    <ol className="news">
      {[...items].reverse().map((item) => (
        <li key={item.id} className={item.tone === "down" ? "loss" : undefined}>
          {intl.formatMessage(
            { id: item.template },
            { company: item.company_ko, period: item.period },
          )}
        </li>
      ))}
    </ol>
  );
}

export function AlertList({
  items,
  onOpen,
}: {
  items: AlertItem[];
  onOpen: (item: AlertItem) => void;
}) {
  const intl = useIntl();
  if (items.length === 0) {
    return <p className="muted">{intl.formatMessage({ id: "alert.empty" })}</p>;
  }
  return (
    <ul className="alerts">
      {items.map((item, index) => (
        <li key={`${item.template}-${item.company_id}-${index}`}>
          <button type="button" onClick={() => onOpen(item)}>
            {intl.formatMessage({ id: item.template }, { company: item.company_ko })}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SiteArt({ kind }: { kind: string }) {
  if (kind === "warehouse") {
    return (
      <svg className="site-art" viewBox="0 0 160 84" aria-hidden="true">
        <rect x="14" y="30" width="132" height="40" />
        <path d="M14 30 H146 M40 30 V70 M80 30 V70" />
        <rect className="site-accent" x="112" y="42" width="18" height="12" />
      </svg>
    );
  }
  if (kind === "store") {
    return (
      <svg className="site-art" viewBox="0 0 160 84" aria-hidden="true">
        <path className="site-accent" d="M36 34 H124 L116 46 H44 Z" />
        <rect x="48" y="46" width="64" height="28" />
        <path d="M74 74 V56 H86 V74" />
      </svg>
    );
  }
  return (
    <svg className="site-art" viewBox="0 0 160 84" aria-hidden="true">
      <path d="M18 44 L48 22 H132 V74 H18 Z" />
      <path d="M132 22 H146 V40 H132" />
      <rect className="site-accent" x="108" y="40" width="14" height="14" />
      <path d="M36 74 V56 H54 V74" />
    </svg>
  );
}

export function AssetCard({
  kind,
  name,
  meta,
}: {
  kind: string;
  name: string;
  meta: string;
}) {
  const intl = useIntl();
  const site = kind === "warehouse" || kind === "store" ? kind : "factory";
  return (
    <article className="asset-card">
      <SiteArt kind={site} />
      <h3>{name}</h3>
      <p>
        {intl.formatMessage({ id: `site.${site}` })}
        {" · "}
        {meta}
      </p>
    </article>
  );
}

export function Pager({
  page,
  pages,
  onPrev,
  onNext,
}: {
  page: number;
  pages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const intl = useIntl();
  return (
    <div className="row-actions">
      <button type="button" onClick={onPrev} disabled={page <= 0}>
        {intl.formatMessage({ id: "deal.prev" })}
      </button>
      <p className="muted">
        {intl.formatMessage({ id: "deal.page" }, { page: page + 1, pages: Math.max(pages, 1) })}
      </p>
      <button type="button" onClick={onNext} disabled={page + 1 >= pages}>
        {intl.formatMessage({ id: "deal.next" })}
      </button>
    </div>
  );
}

export function ClockBar({
  year,
  quarter,
  week,
  paused,
  speed,
  onToggle,
  onSpeed,
}: {
  year: number;
  quarter: number;
  week: number;
  paused: boolean;
  speed: number;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
}) {
  const intl = useIntl();
  return (
    <div className="clock">
      <p className="clock-readout">
        {intl.formatMessage({ id: "clock.when" }, { year, quarter, week })}
      </p>
      <button type="button" onClick={onToggle}>
        {intl.formatMessage({ id: paused ? "clock.play" : "clock.pause" })}
      </button>
      {[1, 2, 4].map((value) => (
        <button
          key={value}
          type="button"
          className={speed === value && !paused ? "btn-primary" : undefined}
          aria-pressed={speed === value}
          onClick={() => onSpeed(value)}
        >
          {intl.formatMessage({ id: "clock.speed" }, { speed: value })}
        </button>
      ))}
    </div>
  );
}
