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
import { SimClock } from "./simClock";

const EMPTY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "paper",
      type: "background",
      paint: { "background-color": "#e7efe8" },
    },
  ],
};

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
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: EMPTY_STYLE,
      center: [127.6, 36.4],
      zoom: 6.1,
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
      <SimClock />
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
