import type { ReactNode } from "react";

/**
 * Isometric buildings, one per sector, drawn from boxes. Each company gets the building of its
 * sector in one of a few liveries picked by its index, so two neighbours in a list rarely match.
 * Colours inside the drawing are fixed; only the ground tile follows the theme.
 */

const U = 5;
const COS = 0.866;

type P = [number, number];
const pt = (x: number, y: number, z: number): P => [(x - y) * COS * U, (x + y) * 0.5 * U - z * U];
const d = (points: P[]) => `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

let key = 0;
const k = () => `s${(key += 1)}`;

/** A quad on the left wall (the plane y = const) of something. */
function onLeft(x0: number, x1: number, z0: number, z1: number, y: number, fill: string): ReactNode {
  return <path key={k()} d={d([pt(x0, y, z0), pt(x1, y, z0), pt(x1, y, z1), pt(x0, y, z1)])} fill={fill} />;
}
/** A quad on the right wall (the plane x = const). */
function onRight(y0: number, y1: number, z0: number, z1: number, x: number, fill: string): ReactNode {
  return <path key={k()} d={d([pt(x, y0, z0), pt(x, y1, z0), pt(x, y1, z1), pt(x, y0, z1)])} fill={fill} />;
}
function onTop(x0: number, x1: number, y0: number, y1: number, z: number, fill: string): ReactNode {
  return <path key={k()} d={d([pt(x0, y0, z), pt(x1, y0, z), pt(x1, y1, z), pt(x0, y1, z)])} fill={fill} />;
}

/** A box standing at (x, y, z) with width w (along x), depth dp (along y) and height h. */
function box(x: number, y: number, z: number, w: number, dp: number, h: number, color: string, top = shade(color, 0.22)): ReactNode[] {
  return [onLeft(x, x + w, z, z + h, y + dp, color), onRight(y, y + dp, z, z + h, x + w, shade(color, -0.2)), onTop(x, x + w, y, y + dp, z + h, top)];
}

/** A pitched roof over a box footprint, ridge along x. */
function gable(x: number, y: number, z: number, w: number, dp: number, h: number, color: string): ReactNode[] {
  const ridge0 = pt(x, y + dp / 2, z + h);
  const ridge1 = pt(x + w, y + dp / 2, z + h);
  return [
    <path key={k()} d={d([pt(x, y, z), pt(x + w, y, z), ridge1, ridge0])} fill={shade(color, 0.1)} />,
    <path key={k()} d={d([pt(x, y + dp, z), pt(x + w, y + dp, z), ridge1, ridge0])} fill={color} />,
    <path key={k()} d={d([pt(x + w, y, z), pt(x + w, y + dp, z), ridge1])} fill={shade(color, -0.25)} />,
  ];
}

/** An upright cylinder: a silo, a tank, a chimney. */
function cylinder(x: number, y: number, z: number, r: number, h: number, color: string): ReactNode[] {
  const [cx, base] = pt(x, y, z);
  const top = base - h * U;
  const rx = r * 1.2247 * U;
  const ry = r * 0.7071 * U;
  return [
    <path key={k()} d={`M${cx - rx} ${top}V${base}A${rx} ${ry} 0 0 0 ${cx + rx} ${base}V${top}Z`} fill={color} />,
    <path key={k()} d={`M${cx} ${top}V${base + ry}A${rx} ${ry} 0 0 0 ${cx + rx} ${base}V${top}Z`} fill={shade(color, -0.18)} />,
    <ellipse key={k()} cx={cx} cy={top} rx={rx} ry={ry} fill={shade(color, 0.25)} />,
  ];
}

/** Rows of windows on a left wall. */
function windowsLeft(x0: number, x1: number, z0: number, z1: number, y: number, cols: number, rows: number, fill: string): ReactNode[] {
  const out: ReactNode[] = [];
  const cw = (x1 - x0) / cols;
  const rh = (z1 - z0) / rows;
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      out.push(onLeft(x0 + c * cw + cw * 0.18, x0 + (c + 1) * cw - cw * 0.18, z0 + r * rh + rh * 0.2, z0 + (r + 1) * rh - rh * 0.2, y, fill));
    }
  }
  return out;
}
function windowsRight(y0: number, y1: number, z0: number, z1: number, x: number, cols: number, rows: number, fill: string): ReactNode[] {
  const out: ReactNode[] = [];
  const cw = (y1 - y0) / cols;
  const rh = (z1 - z0) / rows;
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      out.push(onRight(y0 + c * cw + cw * 0.18, y0 + (c + 1) * cw - cw * 0.18, z0 + r * rh + rh * 0.2, z0 + (r + 1) * rh - rh * 0.2, x, fill));
    }
  }
  return out;
}

function tree(x: number, y: number): ReactNode[] {
  return [...box(x - 0.15, y - 0.15, 0, 0.3, 0.3, 0.8, "#6b727d"), ...cylinder(x, y, 0.8, 0.55, 0.9, "#7f97a8"), ...cylinder(x, y, 1.5, 0.35, 0.6, "#9bb1c0")];
}

function crate(x: number, y: number, s = 0.8): ReactNode[] {
  return box(x, y, 0, s, s, s, BRASS);
}

interface Livery {
  wall: string;
  roof: string;
  trim: string;
}

const GLASS = "#bcd3e4";
const DARK_GLASS = "#2f5f82";
const CARMINE = "#a3122f";
const STEEL = "#3f6f94";
const BRASS = "#c9a24a";
const SLATE = "#4a525e";
const WHITE = "#f4f5f7";
const STONE = "#e4e6ea";

/** Three liveries for every sector: walls stay neutral, the roof and one trim carry the colour. */
const SET: Livery[] = [
  { wall: WHITE, roof: CARMINE, trim: BRASS },
  { wall: STONE, roof: STEEL, trim: CARMINE },
  { wall: WHITE, roof: SLATE, trim: BRASS },
];
const TOWERS: Livery[] = [
  { wall: STEEL, roof: "#2a4d68", trim: "#cfe0ec" },
  { wall: SLATE, roof: "#343b45", trim: "#cfd6de" },
  { wall: CARMINE, roof: "#7c0d23", trim: "#f1cfd6" },
];
const LIVERIES: Record<string, Livery[]> = {
  industrial_components: SET,
  cold_chain_logistics: [SET[1], SET[0], SET[2]],
  food_manufacturing: SET,
  business_services: TOWERS,
  healthcare_services: [SET[1], SET[2], SET[0]],
  building_products: [SET[2], SET[0], SET[1]],
};

function scene(sector: string, l: Livery): ReactNode[] {
  switch (sector) {
    case "industrial_components":
      return [
        // chimneys behind the hall
        ...cylinder(1.2, 1.2, 0, 0.45, 7.2, WHITE),
        ...cylinder(1.2, 1.2, 5.4, 0.46, 0.7, CARMINE),
        ...cylinder(2.8, 1.0, 0, 0.45, 6.2, WHITE),
        ...cylinder(2.8, 1.0, 4.6, 0.46, 0.7, CARMINE),
        ...box(0, 2, 0, 7, 5, 3, l.wall, l.roof),
        // sawtooth roof
        ...[0, 1, 2].flatMap((i) => gable(0.3 + i * 2.2, 2.3, 3, 2, 4.4, 0.9, l.roof)),
        ...windowsLeft(0.4, 4.6, 0.9, 2.3, 7, 4, 1, GLASS),
        onLeft(5.2, 6.5, 0, 2, 7, l.roof),
        ...windowsRight(2.5, 6.5, 1.2, 2.3, 7, 3, 1, GLASS),
        // annex with solar panels
        ...box(7.4, 4.2, 0, 2.6, 2.8, 1.8, shade(l.wall, -0.06), shade(l.wall, 0.1)),
        onTop(7.7, 9.7, 4.5, 5.5, 1.82, DARK_GLASS),
        onTop(7.7, 9.7, 5.8, 6.8, 1.82, DARK_GLASS),
        ...cylinder(-0.9, 5.6, 0, 0.75, 2.4, l.trim),
        ...crate(8.2, 7.6),
      ];
    case "cold_chain_logistics":
      return [
        ...box(0, 1, 0, 8, 6, 3, l.wall),
        ...gable(-0.2, 0.8, 3, 8.4, 6.4, 1.4, l.roof),
        ...[0, 1, 2].flatMap((i) => [onLeft(0.8 + i * 2.5, 2.6 + i * 2.5, 0, 2.1, 7, shade(l.roof, -0.25)), onLeft(0.95 + i * 2.5, 2.45 + i * 2.5, 1.3, 1.9, 7, GLASS)]),
        ...windowsRight(1.6, 6.4, 1.6, 2.5, 8, 4, 1, GLASS),
        // truck
        ...box(1.2, 8.4, 0.3, 2.6, 1.3, 1.5, WHITE),
        ...box(3.9, 8.4, 0.3, 0.9, 1.3, 1.1, l.trim),
        ...crate(6, 8.2),
        ...crate(6.95, 8.3, 0.7),
        ...crate(6.3, 8.25, 0.6).map((node) => <g key={k()} transform={`translate(0 ${-0.8 * U})`}>{node}</g>),
        ...crate(9, 6.2),
      ];
    case "food_manufacturing":
      return [
        ...cylinder(1, 1.6, 0, 1, 5.2, WHITE),
        ...cylinder(3.3, 1.4, 0, 1, 4.4, WHITE),
        ...cylinder(1, 1.6, 3.8, 1.02, 0.35, l.roof),
        ...cylinder(3.3, 1.4, 3.1, 1.02, 0.35, l.roof),
        ...box(0, 3, 0, 7.5, 4.5, 2.8, l.wall, shade(l.wall, -0.08)),
        ...box(-0.2, 2.8, 2.8, 7.9, 4.9, 0.45, l.roof),
        // striped awning over the shop front
        ...[0, 1, 2, 3, 4, 5].map((i) => <path key={k()} d={d([pt(0.5 + i * 0.75, 7.5, 2), pt(1.25 + i * 0.75, 7.5, 2), pt(1.25 + i * 0.75, 8.3, 1.5), pt(0.5 + i * 0.75, 8.3, 1.5)])} fill={i % 2 ? WHITE : l.roof} />),
        ...windowsLeft(0.5, 5, 0.4, 1.5, 7.5, 3, 1, GLASS),
        onLeft(5.6, 6.8, 0, 1.9, 7.5, shade(l.roof, -0.3)),
        ...windowsRight(3.6, 7, 1, 2.1, 7.5, 3, 1, GLASS),
        ...box(8, 4.6, 0, 1.6, 2.4, 1.6, l.trim),
        ...tree(8.8, 8),
        ...tree(-1, 7.4),
      ];
    case "business_services":
      return [
        ...box(0.5, 0.5, 0, 2.6, 2.6, 8.5, l.wall, l.roof),
        ...windowsLeft(0.7, 2.9, 0.6, 8.1, 3.1, 3, 8, l.trim),
        ...windowsRight(0.7, 2.9, 0.6, 8.1, 3.1, 3, 8, shade(l.trim, -0.25)),
        ...box(3.8, 1.6, 0, 2.6, 2.6, 6, shade(l.wall, 0.12), l.roof),
        ...windowsLeft(4, 6.2, 0.6, 5.6, 4.2, 3, 6, l.trim),
        ...windowsRight(1.8, 4, 0.6, 5.6, 6.4, 3, 6, shade(l.trim, -0.25)),
        ...box(0.8, 4.4, 0, 2.6, 2.8, 4.4, shade(l.wall, -0.1), l.roof),
        ...windowsLeft(1, 3.2, 0.6, 4, 7.2, 3, 4, l.trim),
        ...windowsRight(4.6, 7, 0.6, 4, 3.4, 3, 4, shade(l.trim, -0.25)),
        ...box(4.2, 5, 0, 3.4, 2.6, 2.4, shade(l.wall, 0.2), l.roof),
        ...windowsLeft(4.4, 7.4, 0.5, 2, 7.6, 4, 2, l.trim),
        ...windowsRight(5.2, 7.4, 0.5, 2, 7.6, 2, 2, shade(l.trim, -0.25)),
        ...tree(8.6, 8.2),
      ];
    case "healthcare_services":
      return [
        ...box(0.5, 1.5, 0, 4.2, 4.5, 5.4, l.wall, l.roof),
        ...windowsLeft(0.8, 4.4, 0.8, 5, 6, 3, 4, GLASS),
        ...windowsRight(1.9, 5.7, 0.8, 5, 4.7, 3, 4, shade(GLASS, -0.2)),
        // the sign
        ...box(1.6, 3, 5.4, 2, 1.6, 1.5, WHITE),
        onLeft(2.4, 2.8, 5.7, 6.6, 4.6, CARMINE),
        onLeft(2.1, 3.1, 5.98, 6.32, 4.6, CARMINE),
        ...box(4.9, 3, 0, 3.6, 4, 2.6, shade(l.wall, -0.04), l.roof),
        ...windowsLeft(5.2, 8.2, 0.7, 2.1, 7, 3, 1, GLASS),
        ...windowsRight(3.4, 6.6, 0.7, 2.1, 8.5, 2, 1, shade(GLASS, -0.2)),
        onLeft(2, 3.2, 0, 1.7, 6, DARK_GLASS),
        ...tree(0.2, 7.8),
        ...tree(8.9, 8.2),
      ];
    default:
      return [
        // a yard: a framed house, stacked boards and pipes
        ...box(0.5, 1.5, 0, 5.2, 4.2, 2.8, l.wall),
        ...gable(0.2, 1.2, 2.8, 5.8, 4.8, 2, l.roof),
        onLeft(1, 2.2, 0, 2, 5.7, shade(l.roof, -0.3)),
        ...windowsLeft(2.8, 5.2, 0.9, 2.1, 5.7, 2, 1, GLASS),
        ...windowsRight(2.2, 5, 0.9, 2.1, 5.7, 2, 1, shade(GLASS, -0.2)),
        ...box(6.6, 2.4, 0, 2.6, 1.1, 0.5, BRASS),
        ...box(6.7, 2.5, 0.5, 2.4, 0.9, 0.45, "#b08a38"),
        ...box(6.8, 2.6, 0.95, 2.2, 0.7, 0.4, BRASS),
        ...box(6.4, 5, 0, 2.8, 2.6, 1.3, "#b9bec8"),
        ...box(6.4, 5, 1.3, 2.8, 2.6, 0.9, shade("#b9bec8", -0.1)),
        ...cylinder(1.4, 7.6, 0, 0.5, 1, l.trim),
        ...cylinder(2.7, 7.9, 0, 0.5, 1, l.trim),
        ...tree(-0.6, 5.8),
      ];
  }
}

/** The building of a sector. `seed` picks the livery; pass the company index. */
export function Building({ sector, seed = 0, size = 120 }: { sector: string; seed?: number; size?: number }) {
  key = 0;
  const liveries = LIVERIES[sector] ?? LIVERIES.building_products;
  const livery = liveries[Math.abs(seed) % liveries.length];
  return (
    <svg className="building" width={size} height={size * 0.94} viewBox="-52 -54 104 98" aria-hidden>
      <path d={d([pt(-2.2, -0.6, 0), pt(10.6, -0.6, 0), pt(10.6, 10.2, 0), pt(-2.2, 10.2, 0)])} transform="translate(-4 -16)" className="building-ground" />
      <g transform="translate(-4 -16)">{scene(sector, livery)}</g>
    </svg>
  );
}
