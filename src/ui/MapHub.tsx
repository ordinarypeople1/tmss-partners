import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry, Position } from "geojson";
import { useT } from "../i18n/useT";
import type { CompanyRow, Owner, Stage } from "../sim/types";
import { Meter, Ring, Tag } from "./charts";
import { mid, useFormat } from "./format";
import { useGame } from "./game";
import { Guide } from "./Guide";
import { IntentTag, StepChip } from "./Journey";
import { Icon } from "./icons";
import { publicUrl } from "./publicPath";
import "./MapHub.css";

type Layer = "deals" | "portfolio" | "sectors" | "owners" | "economy";
const LAYERS: { id: Layer; icon: string }[] = [
  { id: "deals", icon: "deals" },
  { id: "portfolio", icon: "portfolio" },
  { id: "sectors", icon: "layers" },
  { id: "owners", icon: "flag" },
  { id: "economy", icon: "market" },
];

/** Hex copies of the tokens in styles.css: MapLibre paint cannot read CSS variables. */
const C = {
  sea: "#dfe8e4",
  land: "#efe9dc",
  home: "#f7f2e6",
  locked: "#e6dfd0",
  border: "#cdbfa3",
  ink: "#24302c",
  muted: "#8a958d",
  accent: "#c4552d",
  good: "#2f7d5b",
  bad: "#b3382c",
  warn: "#c08a1e",
  held: "#1f2925",
};
const SERIES = ["#2f6f73", "#c4552d", "#c08a1e", "#5b6aa8", "#8a5a83", "#6f8f3f"];
const HOUSES = ["#5b6aa8", "#8a5a83", "#2f6f73", "#6f8f3f", "#a8683a", "#3f6f9a", "#9a4f6a", "#58705a"];
const HEAT = ["#f1ead9", "#ecd9b9", "#e6c191", "#dda06a", "#d07c47", "#c4552d"];
const STAGE_COLOR: Record<Stage, string> = {
  preparing: C.good,
  marketing: C.warn,
  bidding: C.accent,
  exclusive: C.good,
};
const HOME_BOUNDS: [[number, number], [number, number]] = [
  [-125, 24.5],
  [-66.5, 49.5],
];
/** Rough frames for the countries abroad, west-south to east-north. */
const COUNTRY_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  GB: [
    [-8, 49.8],
    [2, 59],
  ],
  DE: [
    [5.5, 47],
    [15.5, 55.2],
  ],
  FR: [
    [-5, 42],
    [8.5, 51.3],
  ],
  KR: [
    [125.5, 33.8],
    [130, 38.8],
  ],
  JP: [
    [129, 31],
    [146, 45.5],
  ],
  CN: [
    [97, 20],
    [125, 42],
  ],
};

function ownerColor(owner: Owner): string {
  switch (owner.kind) {
    case "founder":
      return SERIES[0];
    case "sponsor":
      return HOUSES[owner.house % HOUSES.length];
    case "corporate":
      return SERIES[2];
    case "player":
      return C.accent;
    default:
      return C.bad;
  }
}

function bounds(geometry: Geometry): [[number, number], [number, number]] | null {
  const rings: Position[][] =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.type === "MultiPolygon"
        ? // The largest outline: keeps Alaska's far islands from stretching the frame.
          [[...geometry.coordinates].sort((a, b) => b[0].length - a[0].length)[0][0]]
        : [];
  const points = rings.flat();
  if (points.length === 0) {
    return null;
  }
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

interface Hover {
  x: number;
  y: number;
  text: string;
}

type SortKey = "name" | "sector" | "admin1" | "sale" | "revenue" | "ebitda" | "ev" | "relationship";

export function MapHub() {
  const game = useGame();
  const t = useT();
  const f = useFormat();
  const { view } = game;
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const stateBounds = useRef(new Map<string, [[number, number], [number, number]]>());
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<Layer>("deals");
  const [region, setRegion] = useState<string | null>(null);
  const [sector, setSector] = useState("");
  const [country, setCountry] = useState("");
  const [query, setQuery] = useState("");
  const [onlySale, setOnlySale] = useState(false);
  const [onlyWatched, setOnlyWatched] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [drawer, setDrawer] = useState(true);
  const [hover, setHover] = useState<Hover | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: "ev", down: true });
  const selectRef = useRef(game.select);
  selectRef.current = game.select;
  const regionRef = useRef(setRegion);
  regionRef.current = setRegion;

  const sectorIds = useMemo(() => view.economy.sectors.map((item) => item.id), [view.economy.sectors]);
  const zoomIn = t("map.zoomIn");
  const zoomOut = t("map.zoomOut");

  // The map itself: built once.
  useEffect(() => {
    if (!node.current || mapRef.current) {
      return;
    }
    const base = import.meta.env.BASE_URL;
    const map = new maplibregl.Map({
      container: node.current,
      style: {
        version: 8,
        sources: {
          world: { type: "geojson", data: publicUrl(base, "geo/world.json") },
          states: { type: "geojson", data: publicUrl(base, "geo/us-states.json") },
          companies: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
          links: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        },
        layers: [
          { id: "sea", type: "background", paint: { "background-color": C.sea } },
          {
            id: "land",
            type: "fill",
            source: "world",
            paint: {
              "fill-color": ["case", ["==", ["get", "country"], "US"], C.home, ["has", "country"], C.locked, C.land],
              "fill-outline-color": C.border,
            },
          },
          { id: "state-fill", type: "fill", source: "states", paint: { "fill-color": C.home, "fill-opacity": 0.92 } },
          { id: "state-line", type: "line", source: "states", paint: { "line-color": C.border, "line-width": 0.8 } },
          {
            id: "state-on",
            type: "line",
            source: "states",
            filter: ["==", ["get", "code"], ""],
            paint: { "line-color": C.ink, "line-width": 2.2 },
          },
          {
            id: "links",
            type: "line",
            source: "links",
            paint: { "line-color": C.accent, "line-width": 1.4, "line-dasharray": [2, 2], "line-opacity": 0.8 },
          },
          {
            id: "dots",
            type: "circle",
            source: "companies",
            paint: {
              "circle-radius": ["get", "radius"],
              "circle-color": ["get", "fill"],
              "circle-opacity": ["get", "opacity"],
              "circle-stroke-color": ["get", "stroke"],
              "circle-stroke-width": ["get", "strokeWidth"],
              "circle-stroke-opacity": ["get", "opacity"],
            },
          },
        ],
      },
      bounds: HOME_BOUNDS,
      fitBoundsOptions: { padding: 30 },
      minZoom: 1,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      locale: { "NavigationControl.ZoomIn": zoomIn, "NavigationControl.ZoomOut": zoomOut },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      fetch(publicUrl(base, "geo/us-states.json"))
        .then((response) => response.json() as Promise<FeatureCollection>)
        .then((collection) => {
          for (const feature of collection.features) {
            const box = bounds(feature.geometry);
            const code = feature.properties?.code as string | undefined;
            if (box && code) {
              stateBounds.current.set(code, box);
            }
          }
        })
        .catch(() => undefined);
      setReady(true);
    });
    map.on("click", "dots", (event) => {
      const index = event.features?.[0]?.properties?.i;
      if (typeof index === "number") {
        selectRef.current(index);
      }
    });
    map.on("click", "state-fill", (event) => {
      if (map.queryRenderedFeatures(event.point, { layers: ["dots"] }).length > 0) {
        return;
      }
      const code = event.features?.[0]?.properties?.code;
      if (typeof code === "string") {
        regionRef.current((current) => (current === code ? null : code));
      }
    });
    map.on("mouseenter", "dots", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "dots", () => {
      map.getCanvas().style.cursor = "";
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      for (const marker of markers.current.values()) {
        marker.remove();
      }
      markers.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [zoomIn, zoomOut]);

  const perState = useMemo(() => {
    const stats = new Map<string, { count: number; sale: number; revenue: number }>();
    for (const row of view.companies) {
      if (sector && row.sector !== sector) {
        continue;
      }
      const entry = stats.get(row.admin1) ?? { count: 0, sale: 0, revenue: 0 };
      entry.count += 1;
      entry.sale += row.sale ? 1 : 0;
      entry.revenue += mid(row.revenue);
      stats.set(row.admin1, entry);
    }
    return stats;
  }, [view.companies, sector]);

  // Hover text needs the catalog, so it lives outside the build-once effect.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    const move = (event: maplibregl.MapMouseEvent) => {
      const dot = map.queryRenderedFeatures(event.point, { layers: ["dots"] })[0];
      if (dot) {
        const row = game.rows.get(dot.properties?.i as number);
        if (row) {
          setHover({ x: event.point.x, y: event.point.y, text: `${t("map.tooltip.company", { name: row.name, sector: t(`sector.${row.sector}`) })} · ${t(`step.${row.next.step}`)}` });
          return;
        }
      }
      const state = map.queryRenderedFeatures(event.point, { layers: ["state-fill"] })[0];
      const code = state?.properties?.code as string | undefined;
      if (code) {
        const stats = perState.get(code);
        setHover({ x: event.point.x, y: event.point.y, text: t("map.tooltip.state", { name: t(`admin1.${code}`), count: stats?.count ?? 0, sale: stats?.sale ?? 0 }) });
        return;
      }
      const land = map.queryRenderedFeatures(event.point, { layers: ["land"] })[0];
      const country = land?.properties?.country as string | undefined;
      const locked = view.career.rank === "vice_president";
      setHover(
        country && country !== "US"
          ? { x: event.point.x, y: event.point.y, text: locked ? `${t(`country.${country}`)} · ${t("country.locked")}` : t(`country.${country}`) }
          : null,
      );
    };
    const leave = () => setHover(null);
    map.on("mousemove", move);
    map.on("mouseout", leave);
    return () => {
      map.off("mousemove", move);
      map.off("mouseout", leave);
    };
  }, [ready, game.rows, perState, t, view.career.rank]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return view.companies.filter(
      (row) =>
        (!region || row.admin1 === region) &&
        (!country || row.country === country) &&
        (!sector || row.sector === sector) &&
        (!onlySale || row.sale !== null) &&
        (!onlyWatched || row.watched) &&
        (!onlyMine || row.held || row.in_deal) &&
        (!needle || row.name.toLowerCase().includes(needle)),
    );
  }, [view.companies, region, country, sector, onlySale, onlyWatched, onlyMine, query]);

  const addOnLinks = useMemo(() => {
    if (layer !== "portfolio") {
      return [] as { from: CompanyRow; to: CompanyRow }[];
    }
    const links: { from: CompanyRow; to: CompanyRow }[] = [];
    for (const row of view.companies) {
      if (!row.held) {
        continue;
      }
      for (const target of game.peek(row.i)?.holding?.add_on_targets ?? []) {
        const to = game.rows.get(target);
        if (to) {
          links.push({ from: row, to });
        }
      }
    }
    return links;
    // Bolt-on candidates change with the month, not with every redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, view.month, view.companies.length]);

  // Dots, state shading and connection lines follow the layer and the filters.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    const shown = new Set(visible.map((row) => row.i));
    const candidates = new Set(addOnLinks.map((link) => link.to.i));
    const features = view.companies.map((row) => {
      const inScope = shown.has(row.i);
      let fill = C.muted;
      let emphasis = false;
      switch (layer) {
        case "deals":
          fill = row.sale ? STAGE_COLOR[row.sale.stage] : row.watched ? C.ink : C.muted;
          emphasis = row.sale !== null || row.watched;
          break;
        case "portfolio":
          fill = row.held ? C.accent : candidates.has(row.i) ? C.good : C.muted;
          emphasis = row.held || candidates.has(row.i);
          break;
        case "sectors":
        case "economy":
          fill = SERIES[Math.max(sectorIds.indexOf(row.sector), 0) % SERIES.length];
          emphasis = true;
          break;
        case "owners":
          fill = ownerColor(row.owner);
          emphasis = true;
          break;
      }
      const size = Math.min(Math.max(Math.sqrt(mid(row.ev)) / 55, 3), 9);
      const selected = row.i === game.selected;
      // Until an NDA the figure is a range, and the dot is hollow.
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [row.lon, row.lat] },
        properties: {
          i: row.i,
          radius: selected ? size + 2 : size,
          fill: row.revealed ? fill : C.home,
          stroke: selected ? C.ink : fill,
          strokeWidth: selected ? 3 : row.revealed ? 1 : 1.8,
          opacity: !inScope ? 0.12 : emphasis ? 0.95 : 0.45,
        },
      };
    });
    (map.getSource("companies") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features });
    (map.getSource("links") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: addOnLinks.map((link) => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [link.from.lon, link.from.lat],
            [link.to.lon, link.to.lat],
          ],
        },
        properties: {},
      })),
    });

    const heat = layer === "sectors" || layer === "economy";
    if (heat && perState.size > 0) {
      const value = (code: string) => (layer === "economy" ? (perState.get(code)?.revenue ?? 0) : (perState.get(code)?.count ?? 0));
      const most = Math.max(...[...perState.keys()].map(value), 1);
      const match: unknown[] = ["match", ["get", "code"]];
      for (const code of perState.keys()) {
        match.push(code, HEAT[Math.min(Math.ceil((value(code) / most) * (HEAT.length - 1)), HEAT.length - 1)]);
      }
      match.push(HEAT[0]);
      map.setPaintProperty("state-fill", "fill-color", match as maplibregl.ExpressionSpecification);
    } else {
      map.setPaintProperty("state-fill", "fill-color", C.home);
    }
    map.setFilter("state-on", ["==", ["get", "code"], region ?? ""]);
  }, [ready, view.companies, visible, layer, sectorIds, game.selected, addOnLinks, perState, region]);

  // Sales, the fund's companies, and this month's news get real pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    const shown = new Set(visible.map((row) => row.i));
    const wanted = new Map<string, { row: CompanyRow; kind: "sale" | "held" | "ping"; tone?: string }>();
    for (const row of view.companies) {
      if (!shown.has(row.i)) {
        continue;
      }
      if (row.held) {
        wanted.set(`held-${row.i}-${row.alert}-${row.exiting}`, { row, kind: "held" });
      } else if (row.sale && (layer === "deals" || row.in_deal)) {
        const sale = row.sale;
        wanted.set(`sale-${row.i}-${sale.stage}-${sale.months_left}-${sale.rivals.length}-${row.in_deal}-${sale.bid_in}`, { row, kind: "sale" });
      }
    }
    for (const message of view.messages) {
      const recent = (view.date.year - message.date.year) * 12 + view.date.month - message.date.month <= 1;
      const row = message.company === null ? undefined : game.rows.get(message.company);
      if (recent && row && !message.read && !row.held && !row.sale && shown.has(row.i)) {
        wanted.set(`ping-${message.id}`, { row, kind: "ping" });
      }
    }
    for (const [key, marker] of markers.current) {
      if (!wanted.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    }
    for (const [key, { row, kind }] of wanted) {
      if (markers.current.has(key)) {
        continue;
      }
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "map-pin";
      pin.dataset.kind = kind;
      pin.setAttribute("aria-label", row.name);
      pin.addEventListener("click", (event) => {
        event.stopPropagation();
        selectRef.current(row.i);
      });
      if (kind === "sale" && row.sale) {
        pin.dataset.stage = row.sale.stage;
        pin.dataset.deal = String(row.in_deal);
        pin.dataset.urgent = String(row.sale.stage === "bidding" && row.sale.months_left <= 1);
        // The ring empties as the stage runs out. Stages last two to four months.
        pin.style.setProperty("--left", String(Math.min(row.sale.months_left / 4, 1)));
        const count = document.createElement("b");
        count.textContent = String(row.sale.months_left);
        pin.append(count);
        if (row.sale.rivals.length > 0) {
          const flags = document.createElement("i");
          flags.textContent = String(row.sale.rivals.length);
          pin.append(flags);
        }
      }
      if (kind === "held") {
        pin.dataset.alert = String(row.alert);
        pin.dataset.exiting = String(row.exiting);
      }
      // MapLibre positions the marker element itself, so the pin sits inside a bare host.
      const host = document.createElement("div");
      host.append(pin);
      const marker = new maplibregl.Marker({ element: host, anchor: "center" }).setLngLat([row.lon, row.lat]).addTo(map);
      markers.current.set(key, marker);
    }
  }, [ready, view.companies, view.messages, view.date, visible, layer, game.rows]);

  // Selecting a state frames it; clearing returns home.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    const box = region ? stateBounds.current.get(region) : null;
    if (box) {
      map.fitBounds(box, { padding: 60, maxZoom: 7, duration: 600 });
    }
  }, [region, ready]);

  // A company chosen elsewhere is brought into view.
  useEffect(() => {
    const map = mapRef.current;
    const row = game.selected === null ? undefined : game.rows.get(game.selected);
    if (!map || !ready || !row) {
      return;
    }
    if (!map.getBounds().contains([row.lon, row.lat])) {
      map.easeTo({ center: [row.lon, row.lat], duration: 500 });
    }
    // Only when the selection changes, not on every redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.selected, ready]);

  const sorted = useMemo(() => {
    const stageRank = (row: CompanyRow) => (row.sale ? { bidding: 3, exclusive: 3, marketing: 2, preparing: 1 }[row.sale.stage] : 0);
    const value = (row: CompanyRow): number | string => {
      switch (sort.key) {
        case "name":
          return row.name;
        case "sector":
          return row.sector;
        case "admin1":
          return row.admin1;
        case "sale":
          return stageRank(row) * 10 - (row.sale?.months_left ?? 0);
        case "revenue":
          return mid(row.revenue);
        case "ebitda":
          return mid(row.ebitda);
        case "ev":
          return mid(row.ev);
        case "relationship":
          return row.relationship;
      }
    };
    return [...visible].sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      const order = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return sort.down ? -order : order;
    });
  }, [visible, sort]);

  const header = (key: SortKey, label: string, numeric = false) => (
    <th className={numeric ? "num" : undefined} aria-sort={sort.key === key ? (sort.down ? "descending" : "ascending") : undefined}>
      <button type="button" onClick={() => setSort((current) => ({ key, down: current.key === key ? !current.down : numeric }))}>
        {label}
        {sort.key === key ? <Icon name={sort.down ? "down" : "up"} size={11} /> : null}
      </button>
    </th>
  );

  const fly = (target: string) => {
    setRegion(null);
    setCountry(target === "world" ? "" : target === "home" ? "US" : target);
    const map = mapRef.current;
    if (COUNTRY_BOUNDS[target]) {
      map?.fitBounds(COUNTRY_BOUNDS[target], { padding: 40, duration: 600 });
    } else if (target === "home") {
      map?.fitBounds(HOME_BOUNDS, { padding: 30, duration: 600 });
    } else {
      map?.easeTo({ center: [25, 32], zoom: 1.15, duration: 600 });
    }
  };

  return (
    <div className="map-hub" data-drawer={drawer ? "open" : "closed"}>
      <section className="map-stage" aria-label={t("map.label")}>
        <div ref={node} className="map-canvas" />
        <div className="map-layers" role="group" aria-label={t("map.layers")}>
          {LAYERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={layer === item.id} onClick={() => setLayer(item.id)}>
              <Icon name={item.icon} size={16} />
              <span>{t(`map.layer.${item.id}`)}</span>
            </button>
          ))}
        </div>
        <div className="map-zoom">
          <button type="button" className="btn small" onClick={() => fly("world")}>
            {t("map.zoom.world")}
          </button>
          <button type="button" className="btn small" aria-pressed={country === "US"} onClick={() => fly("home")}>
            {t("country.US")}
          </button>
          {Object.keys(COUNTRY_BOUNDS).map((code) => (
            <button key={code} type="button" className="btn small" aria-pressed={country === code} onClick={() => fly(code)}>
              {t(`country.${code}`)}
            </button>
          ))}
          {region ? (
            <button type="button" className="btn small primary" aria-label={t("map.region.clear")} onClick={() => fly("home")}>
              {t(`admin1.${region}`)}
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </div>
        <div className="map-legend">
          {layer === "deals" ? (
            <>
              {(["preparing", "marketing", "bidding"] as Stage[]).map((stage) => (
                <span key={stage}>
                  <i style={{ background: STAGE_COLOR[stage] }} />
                  {t(`map.legend.sale.${stage}`)}
                </span>
              ))}
              <span>
                <i data-shape="ring" />
                {t("map.legend.inDeal")}
              </span>
              <span>{t("map.legend.rivals")}</span>
            </>
          ) : null}
          {layer === "portfolio" ? (
            <>
              <span>
                <i style={{ background: C.accent }} />
                {t("map.legend.held")}
              </span>
              <span>
                <i style={{ background: C.good }} />
                {t("map.legend.addOn")}
              </span>
            </>
          ) : null}
          {layer === "sectors" || layer === "economy" ? (
            <>
              {sectorIds.map((id, index) => (
                <button key={id} type="button" aria-pressed={sector === id} onClick={() => setSector((current) => (current === id ? "" : id))}>
                  <i style={{ background: SERIES[index % SERIES.length] }} />
                  {t(`sector.${id}`)}
                </button>
              ))}
              <span className="heat">
                {t(layer === "economy" ? "map.legend.revenue" : "map.legend.count")}
                <em>{t("map.legend.low")}</em>
                {HEAT.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
                <em>{t("map.legend.high")}</em>
              </span>
            </>
          ) : null}
          {layer === "owners" ? (
            <>
              <span>
                <i style={{ background: SERIES[0] }} />
                {t("owner.founder")}
              </span>
              <span>
                <i style={{ background: SERIES[2] }} />
                {t("owner.corporate")}
              </span>
              {view.rivals.map((name, index) => (
                <span key={name}>
                  <i style={{ background: HOUSES[index % HOUSES.length] }} />
                  {name}
                </span>
              ))}
              <span>
                <i style={{ background: C.accent }} />
                {t("owner.player")}
              </span>
            </>
          ) : null}
          <span className="fog">
            <i data-shape="hollow" />
            {t("map.legend.fog")}
          </span>
        </div>
        <Guide />
        {hover ? (
          <div className="map-tip" style={{ left: hover.x, top: hover.y }}>
            {hover.text}
          </div>
        ) : null}
      </section>

      <section className="map-drawer">
        <div className="drawer-bar">
          <button type="button" className="btn small ghost" aria-expanded={drawer} onClick={() => setDrawer((open) => !open)}>
            <Icon name="table" size={15} />
            {drawer ? t("map.drawer.close") : t("map.drawer.open")}
          </button>
          <Tag>{t("map.drawer.count", { count: sorted.length })}</Tag>
          {region ? <Tag tone="accent">{t(`admin1.${region}`)}</Tag> : null}
          <label className="search">
            <Icon name="search" size={14} />
            <input type="search" value={query} placeholder={t("map.filter.search")} aria-label={t("map.filter.search")} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select value={sector} aria-label={t("map.filter.sector")} onChange={(event) => setSector(event.target.value)}>
            <option value="">{t("map.filter.allSectors")}</option>
            {sectorIds.map((id) => (
              <option key={id} value={id}>
                {t(`sector.${id}`)}
              </option>
            ))}
          </select>
          <button type="button" className="btn small" aria-pressed={onlySale} onClick={() => setOnlySale((on) => !on)}>
            {t("map.filter.forSale")}
          </button>
          <button type="button" className="btn small" aria-pressed={onlyWatched} onClick={() => setOnlyWatched((on) => !on)}>
            <Icon name="eye" size={13} />
            {t("map.filter.watched")}
          </button>
          <button type="button" className="btn small" aria-pressed={onlyMine} onClick={() => setOnlyMine((on) => !on)}>
            {t("map.filter.mine")}
          </button>
        </div>
        {drawer ? (
          <div className="drawer-table">
            {sorted.length === 0 ? (
              <p className="empty">{t("map.empty")}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    {header("name", t("map.col.company"))}
                    <th>{t("journey.next")}</th>
                    {header("sector", t("term.sector"))}
                    {header("admin1", t("term.region"))}
                    <th>{t("term.owner")}</th>
                    {header("sale", t("map.col.sale"))}
                    {header("revenue", `${t("term.revenue")} (${t("term.usd")})`, true)}
                    {header("ebitda", `${t("term.ebitda")} (${t("term.usd")})`, true)}
                    {header("ev", `${t("term.ev")} (${t("term.usd")})`, true)}
                    {header("relationship", t("term.relationship"), true)}
                    <th>{t("journey.intent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.i} aria-selected={row.i === game.selected} onClick={() => game.select(row.i)}>
                      <td className="name">
                        <span className="name-cell">
                          {row.name}
                          {row.held ? <Tag tone="accent">{t("map.legend.held")}</Tag> : null}
                          {row.in_deal ? <Tag tone="good">{t("map.legend.inDeal")}</Tag> : null}
                        </span>
                      </td>
                      <td>{row.held ? null : <StepChip row={row} />}</td>
                      <td>
                        <span className="sector-cell">
                          <Icon name={row.sector} size={14} />
                          {t(`sector.${row.sector}`)}
                        </span>
                      </td>
                      <td>
                        {t(`admin1.${row.admin1}`)}
                        {row.country === "US" ? null : <span className="sub">{t(`country.${row.country}`)}</span>}
                      </td>
                      <td>
                        {row.owner.kind === "sponsor"
                          ? (view.rivals[row.owner.house] ?? "")
                          : row.owner.kind === "founder"
                            ? t("owner.founderAge", { age: row.owner.age })
                            : t(`owner.${row.owner.kind}`)}
                      </td>
                      <td>
                        {row.sale ? (
                          <span className="sale-cell" data-stage={row.sale.stage}>
                            <Ring fraction={Math.min(row.sale.months_left / 4, 1)} size={18} tone={row.sale.stage === "bidding" ? "bad" : "warn"} />
                            {t(`stage.${row.sale.stage}`)} · {t("map.col.monthsLeft", { months: row.sale.months_left })}
                          </span>
                        ) : null}
                      </td>
                      <td className="num">{f.shortFigure(row.revenue)}</td>
                      <td className="num">{f.shortFigure(row.ebitda)}</td>
                      <td className="num">{f.shortFigure(row.ev)}</td>
                      <td className="num rel">{row.relationship > 0 ? <Meter value={row.relationship} max={100} tone="good" /> : null}</td>
                      <td>{row.held || row.relationship === 0 ? null : <IntentTag intent={row.intent} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
