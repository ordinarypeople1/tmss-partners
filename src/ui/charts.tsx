import type { ReactNode } from "react";

/**
 * The chart kit. Plain SVG, no dependencies. Colors come from CSS variables
 * (see styles.css): --ink, --muted, --line, --accent, --good, --bad, --warn,
 * and the series colors --s1 … --s6. Every chart takes its numbers and labels
 * as props and holds no game rules.
 */

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];

function extent(values: number[]): [number, number] {
  if (values.length === 0) {
    return [0, 1];
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? [low - 1, high + 1] : [low, high];
}

/** A small trend line. `fill` shades the area under it. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "var(--accent)",
  fill = false,
  zero = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  /** Force the scale to include zero. */
  zero?: boolean;
}) {
  if (values.length < 2) {
    return <svg className="chart sparkline" width={width} height={height} aria-hidden />;
  }
  const [rawLow, high] = extent(values);
  const low = zero ? Math.min(0, rawLow) : rawLow;
  const x = (index: number) => 1 + (index / (values.length - 1)) * (width - 2);
  const y = (value: number) => height - 2 - ((value - low) / (high - low || 1)) * (height - 4);
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("");
  return (
    <svg className="chart sparkline" width={width} height={height} aria-hidden>
      {fill ? <path d={`${line}L${x(values.length - 1)},${height}L${x(0)},${height}Z`} fill={color} opacity={0.14} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.2} fill={color} />
    </svg>
  );
}

export interface Series {
  label: string;
  values: number[];
  color?: string;
}

/** Lines on a shared scale, with a legend and the y range labelled. */
export function LineChart({
  series,
  height = 160,
  format = String,
  xLabels,
}: {
  series: Series[];
  height?: number;
  format?: (value: number) => string;
  /** First and last x labels. */
  xLabels?: [string, string];
}) {
  const width = 480;
  const all = series.flatMap((item) => item.values);
  const [low, high] = extent(all.length ? [...all, 0] : [0, 1]);
  const length = Math.max(...series.map((item) => item.values.length), 2);
  const pad = { left: 6, right: 6, top: 8, bottom: 18 };
  const x = (index: number) => pad.left + (index / (length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - low) / (high - low || 1)) * (height - pad.top - pad.bottom);
  return (
    <figure className="chart line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
        {[0, 0.5, 1].map((step) => (
          <line key={step} x1={pad.left} x2={width - pad.right} y1={y(low + (high - low) * step)} y2={y(low + (high - low) * step)} stroke="var(--line)" strokeDasharray={step === 0 ? undefined : "3 4"} />
        ))}
        {low < 0 && high > 0 ? <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--muted)" /> : null}
        {series.map((item, index) => (
          <path
            key={item.label}
            d={item.values.map((value, at) => `${at ? "L" : "M"}${x(at + length - item.values.length).toFixed(1)},${y(value).toFixed(1)}`).join("")}
            fill="none"
            stroke={item.color ?? SERIES[index % SERIES.length]}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <figcaption>
        <span className="chart-range">
          {format(low)} – {format(high)}
        </span>
        {series.map((item, index) => (
          <span key={item.label} className="legend">
            <i style={{ background: item.color ?? SERIES[index % SERIES.length] }} />
            {item.label}
          </span>
        ))}
        {xLabels ? (
          <span className="chart-x">
            {xLabels[0]} → {xLabels[1]}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

export interface Part {
  label: string;
  value: number;
  color?: string;
  /** Shown after the label, e.g. a formatted amount. */
  note?: string;
}

/** One horizontal bar split into parts, with a legend. Sources and uses, capital calls. */
export function StackBar({ parts, title, total }: { parts: Part[]; title?: string; total?: string }) {
  const sum = parts.reduce((acc, part) => acc + Math.max(part.value, 0), 0) || 1;
  return (
    <div className="chart stack-bar">
      {title ? (
        <div className="stack-head">
          <span>{title}</span>
          {total ? <strong>{total}</strong> : null}
        </div>
      ) : null}
      <div className="stack-track">
        {parts.map((part, index) =>
          part.value > 0 ? (
            <span key={part.label} style={{ width: `${(part.value / sum) * 100}%`, background: part.color ?? SERIES[index % SERIES.length] }} title={part.label} />
          ) : null,
        )}
      </div>
      <ul className="stack-legend">
        {parts.map((part, index) => (
          <li key={part.label}>
            <i style={{ background: part.color ?? SERIES[index % SERIES.length] }} />
            <span>{part.label}</span>
            {part.note ? <b>{part.note}</b> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The capital structure as a tower: first part at the bottom. */
export function Tower({ parts, height = 180 }: { parts: Part[]; height?: number }) {
  const sum = parts.reduce((acc, part) => acc + Math.max(part.value, 0), 0) || 1;
  return (
    <div className="chart tower" style={{ height }}>
      {[...parts].reverse().map((part, index) =>
        part.value > 0 ? (
          <div key={part.label} className="tower-layer" style={{ flexGrow: part.value / sum, background: part.color ?? SERIES[(parts.length - 1 - index) % SERIES.length] }}>
            <span>{part.label}</span>
            {part.note ? <b>{part.note}</b> : null}
          </div>
        ) : null,
      )}
    </div>
  );
}

export interface BridgeStep {
  label: string;
  value: number;
}

/** A waterfall from `start` through signed steps to `end`. Value creation, EBITDA walks. */
export function Bridge({
  start,
  steps,
  end,
  format = String,
  height = 170,
}: {
  start: BridgeStep;
  steps: BridgeStep[];
  end: BridgeStep;
  format?: (value: number) => string;
  height?: number;
}) {
  const columns: { label: string; from: number; to: number; kind: "total" | "up" | "down" }[] = [];
  columns.push({ label: start.label, from: 0, to: start.value, kind: "total" });
  let running = start.value;
  for (const step of steps) {
    columns.push({ label: step.label, from: running, to: running + step.value, kind: step.value >= 0 ? "up" : "down" });
    running += step.value;
  }
  columns.push({ label: end.label, from: 0, to: end.value, kind: "total" });
  const values = columns.flatMap((column) => [column.from, column.to]);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const top = 18;
  const plot = height - top - 4;
  const y = (value: number) => top + (1 - (value - low) / (high - low || 1)) * plot;
  const band = 100 / columns.length;
  return (
    <figure className="chart bridge">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" style={{ height }}>
        <line x1={0} x2={100} y1={y(0)} y2={y(0)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
        {columns.map((column, index) => {
          const upper = Math.min(y(column.from), y(column.to));
          const size = Math.max(Math.abs(y(column.from) - y(column.to)), 1.5);
          const fill = column.kind === "total" ? "var(--ink)" : column.kind === "up" ? "var(--good)" : "var(--bad)";
          return <rect key={column.label} x={index * band + band * 0.18} width={band * 0.64} y={upper} height={size} rx={0.8} fill={fill} />;
        })}
      </svg>
      <ol style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((column) => (
          <li key={column.label} data-kind={column.kind}>
            <b>{column.kind === "total" ? format(column.to) : `${column.to - column.from >= 0 ? "+" : ""}${format(column.to - column.from)}`}</b>
            <span>{column.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/**
 * A half dial. `limit` draws the covenant line; `higherIsWorse` says which
 * side of it is trouble (leverage: true, interest cover: false).
 */
export function Gauge({
  value,
  min = 0,
  max,
  limit,
  higherIsWorse = true,
  label,
  text,
  limitText,
}: {
  value: number;
  min?: number;
  max: number;
  limit?: number;
  higherIsWorse?: boolean;
  label: string;
  /** The value, formatted. */
  text: string;
  limitText?: string;
}) {
  const clamp = (input: number) => Math.min(Math.max((input - min) / (max - min || 1), 0), 1);
  const point = (fraction: number, radius: number) => {
    const angle = Math.PI * (1 - fraction);
    return [50 + radius * Math.cos(angle), 50 - radius * Math.sin(angle)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from, 40);
    const [x2, y2] = point(to, 40);
    return `M${x1.toFixed(2)},${y1.toFixed(2)}A40,40 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };
  const at = clamp(value);
  const breached = limit !== undefined && (higherIsWorse ? value > limit : value < limit);
  const near = limit !== undefined && !breached && Math.abs(value - limit) / (Math.abs(limit) || 1) < 0.12;
  const tone = breached ? "var(--bad)" : near ? "var(--warn)" : "var(--good)";
  const [nx, ny] = point(at, 34);
  return (
    <figure className="chart gauge" data-state={breached ? "breach" : near ? "near" : "ok"}>
      <svg viewBox="0 0 100 58" role="img" aria-label={`${label} ${text}`}>
        <path d={arc(0, 1)} fill="none" stroke="var(--line)" strokeWidth={7} strokeLinecap="round" />
        <path d={arc(0, Math.max(at, 0.001))} fill="none" stroke={tone} strokeWidth={7} strokeLinecap="round" />
        {limit !== undefined ? (
          <line x1={point(clamp(limit), 31)[0]} y1={point(clamp(limit), 31)[1]} x2={point(clamp(limit), 49)[0]} y2={point(clamp(limit), 49)[1]} stroke="var(--ink)" strokeWidth={1.6} />
        ) : null}
        <line x1={50} y1={50} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" />
        <circle cx={50} cy={50} r={3} fill="var(--ink)" />
      </svg>
      <figcaption>
        <strong style={{ color: tone }}>{text}</strong>
        <span>{label}</span>
        {limitText ? <small>{limitText}</small> : null}
      </figcaption>
    </figure>
  );
}

/** A filled bar from 0 to `max`, with an optional marker. Commitments, headroom, progress. */
export function Meter({
  value,
  max,
  marker,
  markers,
  tone = "accent",
  label,
  text,
}: {
  value: number;
  max: number;
  marker?: number;
  /** Several thresholds on one bar. */
  markers?: number[];
  tone?: "accent" | "good" | "warn" | "bad" | "ink";
  label?: string;
  text?: string;
}) {
  const share = (input: number) => `${Math.min(Math.max(input / (max || 1), 0), 1) * 100}%`;
  return (
    <div className="chart meter" data-tone={tone}>
      {label || text ? (
        <div className="meter-head">
          <span>{label}</span>
          <b>{text}</b>
        </div>
      ) : null}
      <div className="meter-track">
        <span style={{ width: share(value) }} />
        {marker !== undefined ? <i style={{ left: share(marker) }} /> : null}
        {markers?.map((at, index) => <i key={index} style={{ left: share(at) }} />)}
      </div>
    </div>
  );
}

/** A 1–20 attribute, the way a football manager shows a player. */
export function Rating({ value, max = 20, label }: { value: number | null; max?: number; label: string }) {
  const tone = value === null ? "unknown" : value >= 15 ? "high" : value >= 10 ? "mid" : "low";
  return (
    <div className="chart rating" data-tone={tone}>
      <span>{label}</span>
      <div className="rating-track" aria-hidden>
        {Array.from({ length: max }, (_, index) => (
          <i key={index} data-on={value !== null && index < value} />
        ))}
      </div>
      <b>{value ?? "?"}</b>
    </div>
  );
}

/** A polygon over spokes. Each axis value is 0 to 1. */
export function Radar({ axes, size = 180 }: { axes: { label: string; value: number }[]; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 26;
  const point = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + (index / axes.length) * Math.PI * 2;
    return [center + Math.cos(angle) * radius * scale, center + Math.sin(angle) * radius * scale];
  };
  const ring = (scale: number) => axes.map((_, index) => point(index, scale).map((n) => n.toFixed(1)).join(",")).join(" ");
  return (
    <svg className="chart radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      {[0.33, 0.66, 1].map((scale) => (
        <polygon key={scale} points={ring(scale)} fill="none" stroke="var(--line)" />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = point(index, 1);
        const [lx, ly] = point(index, 1.24);
        return (
          <g key={axis.label}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="var(--line)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">
              {axis.label}
            </text>
          </g>
        );
      })}
      <polygon
        points={axes.map((axis, index) => point(index, Math.min(Math.max(axis.value, 0.04), 1)).map((n) => n.toFixed(1)).join(",")).join(" ")}
        fill="var(--accent)"
        fillOpacity={0.22}
        stroke="var(--accent)"
        strokeWidth={2}
      />
    </svg>
  );
}

/** A ring split into parts, with a slot in the middle. */
export function Donut({ parts, size = 120, children }: { parts: Part[]; size?: number; children?: ReactNode }) {
  const sum = parts.reduce((acc, part) => acc + Math.max(part.value, 0), 0) || 1;
  const radius = 42;
  const length = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="chart donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" role="img">
        <circle cx={50} cy={50} r={radius} fill="none" stroke="var(--line)" strokeWidth={11} />
        {parts.map((part, index) => {
          const share = Math.max(part.value, 0) / sum;
          const dash = `${share * length} ${length}`;
          const node = (
            <circle key={part.label} cx={50} cy={50} r={radius} fill="none" stroke={part.color ?? SERIES[index % SERIES.length]} strokeWidth={11} strokeDasharray={dash} strokeDashoffset={-offset * length} transform="rotate(-90 50 50)" />
          );
          offset += share;
          return node;
        })}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}

/** A ring that empties as a deadline nears. `fraction` is what is left, 0 to 1. */
export function Ring({ fraction, size = 22, tone = "accent", children }: { fraction: number; size?: number; tone?: "accent" | "warn" | "bad" | "good"; children?: ReactNode }) {
  const radius = 9;
  const length = 2 * Math.PI * radius;
  return (
    <span className="chart ring" data-tone={tone} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx={12} cy={12} r={radius} fill="none" stroke="var(--line)" strokeWidth={3} />
        <circle cx={12} cy={12} r={radius} fill="none" strokeWidth={3} strokeDasharray={`${Math.min(Math.max(fraction, 0), 1) * length} ${length}`} transform="rotate(-90 12 12)" strokeLinecap="round" />
      </svg>
      {children ? <b>{children}</b> : null}
    </span>
  );
}

/** The business cycle as a clock face: four quadrants and a hand on the current one. */
export function CycleClock({ phases, current, progress = 0.5, size = 120 }: { phases: { id: string; label: string }[]; current: string; progress?: number; size?: number }) {
  const index = Math.max(phases.findIndex((phase) => phase.id === current), 0);
  const angle = ((index + Math.min(Math.max(progress, 0.05), 0.95)) / phases.length) * Math.PI * 2 - Math.PI / 2;
  return (
    <svg className="chart cycle-clock" width={size} height={size} viewBox="0 0 100 100" role="img">
      {phases.map((phase, at) => {
        const from = (at / phases.length) * Math.PI * 2 - Math.PI / 2;
        const to = ((at + 1) / phases.length) * Math.PI * 2 - Math.PI / 2;
        const middle = (from + to) / 2;
        const p = (a: number, r: number) => `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`;
        return (
          <g key={phase.id} data-phase={phase.id} data-on={at === index}>
            <path d={`M${p(from, 46)}A46,46 0 0 1 ${p(to, 46)}L${p(to, 30)}A30,30 0 0 0 ${p(from, 30)}Z`} />
            <text
              x={50 + Math.cos(middle) * 38}
              y={50 + Math.sin(middle) * 38}
              textAnchor="middle"
              dominantBaseline="middle"
              // A long label ("Expansion") shrinks to stay inside its quadrant.
              style={phase.label.length > 6 ? { fontSize: `${Math.max(42 / phase.label.length, 4.2)}px` } : undefined}
            >
              {phase.label}
            </text>
          </g>
        );
      })}
      <line x1={50} y1={50} x2={50 + Math.cos(angle) * 27} y2={50 + Math.sin(angle) * 27} stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={50} cy={50} r={4} fill="var(--ink)" />
    </svg>
  );
}

/** Rectangles sized by value, largest first. Market share. */
export function Treemap({ items, height = 200, onSelect }: { items: (Part & { id: string | number; active?: boolean })[]; height?: number; onSelect?: (id: string | number) => void }) {
  const sorted = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const boxes: { item: (typeof sorted)[number]; x: number; y: number; w: number; h: number }[] = [];
  let x = 0;
  let y = 0;
  let w = 100;
  let h = 100;
  let rest = sorted.reduce((acc, item) => acc + item.value, 0);
  sorted.forEach((item, index) => {
    const share = rest > 0 ? item.value / rest : 0;
    const last = index === sorted.length - 1;
    if (w >= h) {
      const width = last ? w : w * share;
      boxes.push({ item, x, y, w: width, h });
      x += width;
      w -= width;
    } else {
      const tall = last ? h : h * share;
      boxes.push({ item, x, y, w, h: tall });
      y += tall;
      h -= tall;
    }
    rest -= item.value;
  });
  return (
    <div className="chart treemap" style={{ height }}>
      {boxes.map(({ item, ...box }, index) => (
        <button
          key={item.id}
          type="button"
          data-active={item.active ? "true" : undefined}
          style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, background: item.color ?? SERIES[index % SERIES.length] }}
          title={item.note ? `${item.label} · ${item.note}` : item.label}
          onClick={() => onSelect?.(item.id)}
        >
          {box.w > 9 && box.h > 12 ? (
            <>
              <span>{item.label}</span>
              {item.note && box.h > 22 ? <b>{item.note}</b> : null}
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Stages left to right with a count in each. The deal pipeline. */
export function Funnel({ stages, onSelect, active }: { stages: { id: string; label: string; count: number }[]; onSelect?: (id: string) => void; active?: string }) {
  const most = Math.max(...stages.map((stage) => stage.count), 1);
  return (
    <ol className="chart funnel">
      {stages.map((stage) => (
        <li key={stage.id} data-active={active === stage.id ? "true" : undefined}>
          <button type="button" onClick={() => onSelect?.(stage.id)}>
            <span className="funnel-bar" style={{ height: `${20 + (stage.count / most) * 80}%` }} />
            <b>{stage.count}</b>
            <span>{stage.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A number with a label and an optional direction. The basic stat tile. */
/** `tip` explains the figure on hover instead of a line of small print under it. */
export function Stat({ label, value, delta, tone, hint, tip, children }: { label: string; value: string; delta?: string; tone?: "good" | "bad" | "warn"; hint?: string; tip?: string; children?: ReactNode }) {
  return (
    <div className={tip ? "stat tip" : "stat"} data-tone={tone} data-tip={tip} tabIndex={tip ? 0 : undefined}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {delta ? <span className="stat-delta">{delta}</span> : null}
      {hint ? <small>{hint}</small> : null}
      {children}
    </div>
  );
}

/** A short label with a tone. Used instead of a sentence wherever one would do. */
export function Tag({ tone, children, icon }: { tone?: "good" | "bad" | "warn" | "accent" | "muted"; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="tag" data-tone={tone}>
      {icon}
      {children}
    </span>
  );
}
