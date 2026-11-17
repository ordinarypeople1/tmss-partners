import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useIntl } from "react-intl";
import { joinBase } from "./publicPath";
import { mountMapPin } from "./mapPin";

export function AtlasMap({
  pins,
  selectedId,
  onSelect,
}: {
  pins: { id: string; name: string; lat: number; lon: number; kind: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const intl = useIntl();
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const zoomIn = intl.formatMessage({ id: "map.zoomIn" });
  const zoomOut = intl.formatMessage({ id: "map.zoomOut" });

  useEffect(() => {
    if (!mapNode.current || mapRef.current) {
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: {
        version: 8,
        sources: {
          korea: {
            type: "geojson",
            data: joinBase(import.meta.env.BASE_URL, "atlas/korea.json"),
          },
        },
        layers: [
          {
            id: "paper",
            type: "background",
            paint: { "background-color": read("--bg", "#ffffff") },
          },
          {
            id: "land",
            type: "fill",
            source: "korea",
            paint: { "fill-color": read("--rule", "#e3e3e3") },
          },
          {
            id: "coast",
            type: "line",
            source: "korea",
            paint: { "line-color": read("--ink", "#000000"), "line-width": 1 },
          },
        ],
      },
      center: [127.8, 36.4],
      zoom: 5.6,
      attributionControl: false,
      locale: {
        "NavigationControl.ZoomIn": zoomIn,
        "NavigationControl.ZoomOut": zoomOut,
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;
    return () => {
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
        onSelect: () => selectRef.current(pin.id),
      });
      const marker = new maplibregl.Marker({ element: mounted.host })
        .setLngLat([pin.lon, pin.lat])
        .addTo(map);
      return marker;
    });
    return () => {
      for (const marker of mounts) {
        marker.remove();
      }
    };
  }, [pins, selectedId, intl]);

  return (
    <section className="map-panel" aria-label={intl.formatMessage({ id: "map.label" })}>
      <div ref={mapNode} className="map" />
      <p className="map-note">{intl.formatMessage({ id: "map.note" })}</p>
    </section>
  );
}
