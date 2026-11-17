import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useIntl } from "react-intl";
import { BuildingMark } from "./BuildingMark";
import { clusterIconExpression, paintBuildings, paintClusters, siteFeatures, type MapSite } from "./buildings";
import { joinBase } from "./publicPath";
import { IconButton, InfoTip } from "./widgets";

interface Label {
  name: string;
  lon: number;
  lat: number;
}

const TIERS = [1, 2, 3, 4, 5] as const;

export function AtlasMap({
  pins,
  selectedId,
  onSelect,
  hud,
}: {
  pins: MapSite[];
  selectedId: string;
  onSelect: (id: string) => void;
  hud?: string;
}) {
  const intl = useIntl();
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const labelsRef = useRef<Label[]>([]);
  const labelMarkers = useRef<maplibregl.Marker[]>([]);
  const pinsRef = useRef(pins);
  const selectedRef = useRef(selectedId);
  const selectRef = useRef(onSelect);
  const boundRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const clusterText = useRef<(count: number) => string>(() => "");
  const [legend, setLegend] = useState(false);
  pinsRef.current = pins;
  selectedRef.current = selectedId;
  selectRef.current = onSelect;
  clusterText.current = (count) => intl.formatMessage({ id: "map.cluster" }, { count });
  const zoomIn = intl.formatMessage({ id: "map.zoomIn" });
  const zoomOut = intl.formatMessage({ id: "map.zoomOut" });

  const syncRef = useRef<() => void>(() => undefined);
  syncRef.current = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    const ink = read("--ink", "#111111");
    const paper = read("--page", "#f6f3ee");
    const accent = read("--accent", "#9b1b30");
    paintBuildings(map, ink, paper, accent);
    paintClusters(map, ink, paper);
    const data = siteFeatures(pinsRef.current, selectedRef.current);
    const existing = map.getSource("sites") as maplibregl.GeoJSONSource | undefined;
    const raiseSites = () => {
      if (map.getLayer("site-clusters")) {
        map.moveLayer("site-clusters");
      }
      if (map.getLayer("site-pins")) {
        map.moveLayer("site-pins");
      }
    };
    if (!existing) {
      map.addSource("sites", {
        type: "geojson",
        data,
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 4,
      });
      map.addLayer({
        id: "site-clusters",
        type: "symbol",
        source: "sites",
        filter: ["has", "point_count"],
        layout: {
          "icon-image": clusterIconExpression() as never,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
      map.addLayer({
        id: "site-pins",
        type: "symbol",
        source: "sites",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": ["concat", "b-", ["to-string", ["get", "tier"]], "-", ["get", "kind"], "-", ["get", "tone"]],
          "icon-size": ["get", "scale"],
          "icon-allow-overlap": ["step", ["zoom"], false, 4, true],
          "icon-ignore-placement": true,
          "icon-padding": 1,
        },
      });
    } else {
      existing.setData(data);
    }
    raiseSites();
    if (boundRef.current || !popupRef.current) {
      return;
    }
    boundRef.current = true;
    const popup = popupRef.current;
    const show = (text: string, lngLat: maplibregl.LngLatLike) => {
      popup.setLngLat(lngLat).setText(text).addTo(map);
    };
    map.on("mouseenter", "site-pins", (event) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }
      show(String(feature.properties?.name ?? ""), event.lngLat);
    });
    map.on("mouseleave", "site-pins", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", "site-pins", (event) => {
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }
      const id = String(feature.properties?.id ?? "");
      show(String(feature.properties?.name ?? ""), event.lngLat);
      if (id) {
        selectRef.current(id);
      }
    });
    map.on("mouseenter", "site-clusters", (event) => {
      map.getCanvas().style.cursor = "pointer";
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }
      show(clusterText.current(Number(feature.properties?.point_count ?? 0)), event.lngLat);
    });
    map.on("mouseleave", "site-clusters", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", "site-clusters", (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") {
        return;
      }
      const clusterId = Number(feature.properties?.cluster_id);
      const center = feature.geometry.coordinates as [number, number];
      show(clusterText.current(Number(feature.properties?.point_count ?? 0)), event.lngLat);
      const source = map.getSource("sites") as maplibregl.GeoJSONSource;
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center, zoom });
      });
    });
  };

  useEffect(() => {
    if (!mapNode.current || mapRef.current) {
      return;
    }
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "paper",
            type: "background",
            paint: { "background-color": "#f6f3ee" },
          },
        ],
      },
      center: [20, 18],
      zoom: 1.15,
      attributionControl: false,
      locale: {
        "NavigationControl.ZoomIn": zoomIn,
        "NavigationControl.ZoomOut": zoomOut,
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      maxWidth: "220px",
    });
    mapRef.current = map;

    const paint = () => {
      const styles = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
      if (!map.getLayer("paper")) {
        return;
      }
      map.setPaintProperty("paper", "background-color", read("--page", "#f6f3ee"));
      if (map.getLayer("land")) {
        map.setPaintProperty("land", "fill-color", read("--surface", "#fffdfb"));
        map.setPaintProperty("coast", "line-color", read("--ink", "#111111"));
      }
      if (map.getLayer("admin")) {
        map.setPaintProperty("admin", "line-color", read("--grey", "#8d847a"));
      }
      if (map.isStyleLoaded()) {
        const ink = read("--ink", "#111111");
        const paper = read("--page", "#f6f3ee");
        paintBuildings(map, ink, paper, read("--accent", "#9b1b30"));
        paintClusters(map, ink, paper);
      }
    };

    const refreshLabels = () => {
      for (const marker of labelMarkers.current) {
        marker.remove();
      }
      labelMarkers.current = [];
      if (map.getZoom() < 3.2) {
        return;
      }
      const bounds = map.getBounds();
      const visible = labelsRef.current.filter((label) => bounds.contains([label.lon, label.lat])).slice(0, 28);
      for (const label of visible) {
        const node = document.createElement("span");
        node.className = "map-label";
        node.textContent = label.name;
        labelMarkers.current.push(
          new maplibregl.Marker({ element: node, anchor: "center" }).setLngLat([label.lon, label.lat]).addTo(map),
        );
      }
    };

    map.on("load", () => {
      void fetch(joinBase(import.meta.env.BASE_URL, "atlas/world.json"))
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { features?: GeoJSON.Feature[]; labels?: Label[] } | null) => {
          if (!body?.features || !mapRef.current) {
            return;
          }
          labelsRef.current = body.labels ?? [];
          map.addSource("world", {
            type: "geojson",
            data: { type: "FeatureCollection", features: body.features },
          });
          map.addLayer({
            id: "land",
            type: "fill",
            source: "world",
            filter: ["==", ["get", "kind"], "land"],
            paint: { "fill-color": "#fffdfb" },
          });
          map.addLayer({
            id: "coast",
            type: "line",
            source: "world",
            filter: ["==", ["get", "kind"], "land"],
            paint: { "line-color": "#111111", "line-width": 0.6 },
          });
          map.addLayer({
            id: "admin",
            type: "line",
            source: "world",
            filter: ["==", ["get", "kind"], "admin"],
            paint: { "line-color": "#8d847a", "line-width": 0.7 },
          });
          paint();
          refreshLabels();
          syncRef.current();
          if (map.getLayer("site-clusters")) {
            map.moveLayer("site-clusters");
          }
          if (map.getLayer("site-pins")) {
            map.moveLayer("site-pins");
          }
        })
        .catch(() => undefined);
      syncRef.current();
    });
    map.on("moveend", refreshLabels);
    window.addEventListener("deal-atlas-theme", paint);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", paint);

    return () => {
      media.removeEventListener("change", paint);
      window.removeEventListener("deal-atlas-theme", paint);
      for (const marker of labelMarkers.current) {
        marker.remove();
      }
      boundRef.current = false;
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [zoomIn, zoomOut]);

  useEffect(() => {
    syncRef.current();
  }, [pins, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const selected = pinsRef.current.find((pin) => pin.id === selectedId);
    if (!map || !selected) {
      return;
    }
    const go = () => {
      map.easeTo({ center: [selected.lon, selected.lat], zoom: Math.max(map.getZoom(), 6) });
    };
    if (map.isStyleLoaded()) {
      go();
    } else {
      map.once("load", go);
    }
    return () => {
      map.off("load", go);
    };
  }, [selectedId]);

  return (
    <section className="map-panel" aria-label={intl.formatMessage({ id: "map.label" })}>
      <div ref={mapNode} className="map" />
      {hud ? <p className="map-hud glass">{hud}</p> : null}
      <div className="map-tip">
        <InfoTip label={intl.formatMessage({ id: "map.note" })} />
      </div>
      <div className="map-legend-btn">
        <IconButton
          label={intl.formatMessage({ id: "map.legend" })}
          pressed={legend}
          onClick={() => setLegend((open) => !open)}
        >
          <Layers size={18} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
      {legend ? (
        <ul className="map-legend dock">
          {TIERS.map((tier) => (
            <li key={tier}>
              <BuildingMark tier={tier} />
              <span>{intl.formatMessage({ id: `map.tier${tier}` })}</span>
            </li>
          ))}
          <li>
            <BuildingMark tier={4} tone="live" />
            <span>{intl.formatMessage({ id: "map.liveMark" })}</span>
          </li>
        </ul>
      ) : null}
      <ul className="sr-only">
        {pins.map((pin) => (
          <li key={pin.id}>
            <button type="button" onClick={() => onSelect(pin.id)}>
              {intl.formatMessage({ id: "pin.select" }, { name: pin.name })}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
