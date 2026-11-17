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
            <tr
              key={row.id}
              className={row.onOpen ? "hit" : undefined}
              tabIndex={row.onOpen ? 0 : undefined}
              role={row.onOpen ? "link" : undefined}
              onClick={row.onOpen}
              onKeyDown={(event) => {
                if (!row.onOpen) {
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  row.onOpen();
                }
              }}
            >
              {columns.map((column) => (
                <td key={column.id} className={column.numeric ? "num" : undefined}>
                  {row.cells[column.id] ?? ""}
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

export function Monogram({ name }: { name: string }) {
  const letter = Array.from(name)[0] ?? "";
  return (
    <span className="monogram" aria-hidden="true">
      {letter}
    </span>
  );
}

export function SectorMark({ id }: { id: string }) {
  return (
    <svg className="sector-mark" viewBox="0 0 24 24" aria-hidden="true">
      {id === "energy" ? <path d="M12 3 L14 10 H18 L11 21 L12 13 H8 Z" fill="currentColor" /> : null}
      {id === "materials" ? <path d="M4 16 L12 4 L20 16 Z" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "industrials" ? <path d="M3 18 V10 L9 14 V8 L15 12 V6 L21 10 V18 Z" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "discretionary" ? <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "staples" ? <path d="M6 16 C6 8 18 8 18 16 Z" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "health" ? <path d="M10 4 H14 V10 H20 V14 H14 V20 H10 V14 H4 V10 H10 Z" fill="currentColor" /> : null}
      {id === "financials" ? <path d="M4 18 H20 M6 18 V10 H10 V18 M14 18 V6 H18 V18" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "information_technology" ? <path d="M5 6 H19 V15 H5 Z M9 18 H15" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "communication" ? <path d="M5 15 C5 9 19 9 19 15" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "utilities" ? <path d="M12 3 V21 M7 8 H17 M8 16 H16" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id === "real_estate" ? <path d="M4 18 V10 L12 4 L20 10 V18 Z" fill="none" stroke="currentColor" strokeWidth="1.6" /> : null}
      {id !== "energy" &&
      id !== "materials" &&
      id !== "industrials" &&
      id !== "discretionary" &&
      id !== "staples" &&
      id !== "health" &&
      id !== "financials" &&
      id !== "information_technology" &&
      id !== "communication" &&
      id !== "utilities" &&
      id !== "real_estate" ? (
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      ) : null}
    </svg>
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
