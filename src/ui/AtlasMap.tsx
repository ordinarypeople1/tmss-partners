import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useIntl } from "react-intl";
import { joinBase } from "./publicPath";
import { mountMapPin } from "./mapPin";
import { InfoTip } from "./widgets";

interface Label {
  name: string;
  lon: number;
  lat: number;
}

export function AtlasMap({
  pins,
  selectedId,
  onSelect,
  hud,
}: {
  pins: { id: string; name: string; lat: number; lon: number; kind: string; live?: boolean }[];
  selectedId: string;
  onSelect: (id: string) => void;
  hud?: string;
}) {
  const intl = useIntl();
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const labelsRef = useRef<Label[]>([]);
  const labelMarkers = useRef<maplibregl.Marker[]>([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const zoomIn = intl.formatMessage({ id: "map.zoomIn" });
  const zoomOut = intl.formatMessage({ id: "map.zoomOut" });

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
        map.setPaintProperty("coast", "line-color", read("--ink", "#1c1714"));
      }
      if (map.getLayer("admin")) {
        map.setPaintProperty("admin", "line-color", read("--grey", "#8d847a"));
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
            paint: { "line-color": "#1c1714", "line-width": 0.6 },
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
        })
        .catch(() => undefined);
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
      map.remove();
      mapRef.current = null;
    };
  }, [zoomIn, zoomOut]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const mounts = pins.map((pin) => {
      const kind = pin.kind === "warehouse" || pin.kind === "store" ? pin.kind : "factory";
      const mounted = mountMapPin({
        selected: pin.id === selectedId,
        kind,
        glyph: intl.formatMessage({ id: `pin.${kind}` }),
        ariaLabel: intl.formatMessage({ id: "pin.select" }, { name: pin.name }),
        live: pin.live,
        onSelect: () => selectRef.current(pin.id),
      });
      const marker = new maplibregl.Marker({ element: mounted.host }).setLngLat([pin.lon, pin.lat]).addTo(map);
      return marker;
    });
    const selected = pins.find((pin) => pin.id === selectedId);
    if (selected) {
      map.flyTo({ center: [selected.lon, selected.lat], zoom: Math.max(map.getZoom(), 4) });
    }
    return () => {
      for (const marker of mounts) {
        marker.remove();
      }
    };
  }, [pins, selectedId, intl]);

  return (
    <section className="map-panel" aria-label={intl.formatMessage({ id: "map.label" })}>
      <div ref={mapNode} className="map" />
      {hud ? <p className="map-hud glass">{hud}</p> : null}
      <div className="map-tip">
        <InfoTip label={intl.formatMessage({ id: "map.note" })} />
      </div>
    </section>
  );
}
