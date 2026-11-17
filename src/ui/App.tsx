import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";
import type { CompanyCard, CompanyCardPage } from "../data/page";
import { quoteCompany, type QuotedValue } from "../sim/wasm";
import { pulseSelection } from "./haptics";
import { CompanyCardView } from "./companyCardView";
import { CompanyList } from "./companyList";
import { CompanyStatus } from "./companyStatus";
import { mountMapPin } from "./mapPin";
import { joinBase } from "./publicPath";

const WORLD_FILE = "world-countries.geojson";
const TILE_SIZE = 512;
const MAX_LAT = 85.0511;
// ISO 3166-1 numeric. 회사 데이터가 있는 나라만 활성으로 두고 나머지는 음영 처리한다.
const ACTIVE_COUNTRY_IDS = ["410"];

function worldStyle(dataUrl: string): maplibregl.StyleSpecification {
  const active: maplibregl.FilterSpecification = [
    "in",
    ["get", "id"],
    ["literal", ACTIVE_COUNTRY_IDS],
  ];
  return {
    version: 8,
    sources: { world: { type: "geojson", data: dataUrl } },
    layers: [
      { id: "sea", type: "background", paint: { "background-color": "#e7efe8" } },
      {
        id: "land-inactive",
        type: "fill",
        source: "world",
        filter: ["!", active],
        paint: { "fill-color": "#b9c2bb", "fill-opacity": 0.7 },
      },
      {
        id: "land-active",
        type: "fill",
        source: "world",
        filter: active,
        paint: { "fill-color": "#fffaf3" },
      },
      {
        id: "border",
        type: "line",
        source: "world",
        paint: { "line-color": "#8e9b93", "line-width": 0.6 },
      },
      {
        id: "border-active",
        type: "line",
        source: "world",
        filter: active,
        paint: { "line-color": "#24302c", "line-width": 1.1 },
      },
    ],
  };
}

// 세계지도 한 장이 컨테이너를 빈틈없이 채우는 줌. 이보다 더 축소되지 않는다.
function fullWorldZoom(node: HTMLElement): number {
  const side = Math.max(node.clientWidth, node.clientHeight, 1);
  return Math.max(0, Math.log2(side / TILE_SIZE));
}

export function App() {
  const intl = useIntl();
  const reduceMotion = useReducedMotion();
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [cards, setCards] = useState<CompanyCard[] | null>(null);
  const [seed, setSeed] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [quoted, setQuoted] = useState<(QuotedValue & { id: string }) | null>(null);
  const [quoteError, setQuoteError] = useState(false);

  const zoomIn = intl.formatMessage({ id: "map.zoomIn" });
  const zoomOut = intl.formatMessage({ id: "map.zoomOut" });
  const pinFactory = intl.formatMessage({ id: "pin.factory" });
  const pinWarehouse = intl.formatMessage({ id: "pin.warehouse" });

  useEffect(() => {
    document.title = intl.formatMessage({ id: "app.title" });
  }, [intl]);

  useEffect(() => {
    let cancelled = false;
    fetch(joinBase(import.meta.env.BASE_URL, "sample-page.json"))
      .then((response) => {
        if (!response.ok) {
          throw new Error("page");
        }
        return response.json() as Promise<CompanyCardPage>;
      })
      .then((page) => {
        if (cancelled) {
          return;
        }
        setCards(page.cards);
        setSeed(page.seed);
        setSelectedId(page.cards[0]?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) {
      return;
    }
    const node = mapNode.current;
    const dataUrl = new URL(joinBase(import.meta.env.BASE_URL, WORLD_FILE), window.location.href).href;
    const map = new maplibregl.Map({
      container: node,
      style: worldStyle(dataUrl),
      center: [127.6, 36.4],
      zoom: 6.1,
      minZoom: fullWorldZoom(node),
      renderWorldCopies: false,
      maxBounds: [
        [-180, -MAX_LAT],
        [180, MAX_LAT],
      ],
      attributionControl: false,
      locale: {
        "NavigationControl.ZoomIn": zoomIn,
        "NavigationControl.ZoomOut": zoomOut,
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.on("resize", () => map.setMinZoom(fullWorldZoom(node)));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [zoomIn, zoomOut]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cards) {
      return;
    }
    const mounts = cards.map((card) => {
      const glyph = card.sector_id === "cold_chain_logistics" ? pinWarehouse : pinFactory;
      const mounted = mountMapPin({
        selected: card.id === selectedId,
        glyph,
        ariaLabel: intl.formatMessage({ id: "pin.select" }, { name: card.legal_name_ko }),
        onSelect: () => choose(card.id),
      });
      const marker = new maplibregl.Marker({ element: mounted.host })
        .setLngLat([card.lon, card.lat])
        .addTo(map);
      return { marker, root: mounted.root };
    });
    return () => {
      for (const mounted of mounts) {
        mounted.marker.remove();
        mounted.root.unmount();
      }
    };
  }, [cards, selectedId, pinFactory, pinWarehouse, intl]);

  const selected = cards?.find((card) => card.id === selectedId) ?? cards?.[0];

  useEffect(() => {
    if (!selected) {
      return;
    }
    let cancelled = false;
    setQuoted(null);
    setQuoteError(false);
    quoteCompany(selected.ebitda, selected.model_multiple_millis, selected.debt, selected.cash)
      .then((value) => {
        if (!cancelled) {
          setQuoted({ id: selected.id, ...value });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  function choose(id: string) {
    setSelectedId(id);
    pulseSelection(reduceMotion === true);
  }

  const model = quoted && selected && quoted.id === selected.id ? quoted : null;

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{intl.formatMessage({ id: "app.house" })}</p>
          <h1>{intl.formatMessage({ id: "app.title" })}</h1>
        </div>
        <p className="era">{intl.formatMessage({ id: "app.era" })}</p>
      </header>
      <main className="stage">
        <section className="map-panel" aria-label={intl.formatMessage({ id: "map.label" })}>
          <div ref={mapNode} className="map" />
          <p className="map-note">{intl.formatMessage({ id: "map.note" })}</p>
        </section>
        <section className="dossier" aria-live="polite">
          {loadError ? <CompanyStatus state="error" /> : null}
          {!loadError && !cards ? <CompanyStatus state="loading" /> : null}
          {cards && cards.length === 0 ? <CompanyStatus state="empty" /> : null}
          {cards && selected ? (
            <>
              <CompanyList cards={cards} selectedId={selected.id} onSelect={choose} />
              <CompanyCardView card={selected} seed={seed} quoted={model} error={quoteError} />
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
