import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { motion, useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";
import type { CompanyCard, CompanyCardPage } from "../data/page";
import { formatKrwMillion } from "../i18n/money";
import { quoteCompany, type QuotedValue } from "../sim/wasm";
import { pulseSelection } from "./haptics";

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
    fetch("/sample-page.json")
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
    const markers = cards.map((card) => {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "pin";
      pin.dataset.selected = card.id === selectedId ? "true" : "false";
      pin.setAttribute(
        "aria-label",
        intl.formatMessage({ id: "pin.select" }, { name: card.legal_name_ko }),
      );
      const label = document.createElement("span");
      label.className = "pin-label";
      label.textContent = card.sector_id === "cold_chain_logistics" ? pinWarehouse : pinFactory;
      pin.append(label);
      pin.addEventListener("click", () => choose(card.id));
      return new maplibregl.Marker({ element: pin }).setLngLat([card.lon, card.lat]).addTo(map);
    });
    return () => {
      for (const marker of markers) {
        marker.remove();
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
  const netDebt = selected ? selected.debt - selected.cash : 0;

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
          {loadError ? <p>{intl.formatMessage({ id: "company.loadError" })}</p> : null}
          {!loadError && !cards ? <p>{intl.formatMessage({ id: "company.loading" })}</p> : null}
          {cards && cards.length === 0 ? <p>{intl.formatMessage({ id: "company.empty" })}</p> : null}
          {cards && selected ? (
            <>
              <ol className="company-list">
                {cards.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      className="company-button"
                      aria-pressed={card.id === selected.id}
                      onClick={() => choose(card.id)}
                    >
                      <span>{card.legal_name_ko}</span>
                      <small>
                        {intl.formatMessage({ id: `sector.${card.sector_id}` })}
                        {" · "}
                        {card.region_label_ko}
                      </small>
                    </button>
                  </li>
                ))}
              </ol>
              <motion.article
                key={selected.id}
                className="card"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }
                }
              >
                <p className="card-kicker">{selected.complex_name_ko}</p>
                <h2>{selected.legal_name_ko}</h2>
                <p className="card-meta">
                  {intl.formatMessage({ id: `sector.${selected.sector_id}` })}
                  {" · "}
                  {intl.formatMessage(
                    { id: "company.meta" },
                    { year: selected.founded_year, employees: selected.employees },
                  )}
                </p>
                <dl className="facts">
                  <div>
                    <dt>{intl.formatMessage({ id: "fact.revenue" }, { period: selected.period })}</dt>
                    <dd>{formatKrwMillion(intl, selected.revenue)}</dd>
                  </div>
                  <div>
                    <dt>{intl.formatMessage({ id: "fact.ebitda" })}</dt>
                    <dd>{formatKrwMillion(intl, selected.ebitda)}</dd>
                  </div>
                  <div>
                    <dt>{intl.formatMessage({ id: "fact.multiple" })}</dt>
                    <dd>
                      {intl.formatMessage(
                        { id: "fact.multipleValue" },
                        { multiple: selected.model_multiple_millis / 1000 },
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{intl.formatMessage({ id: "fact.modelEv" })}</dt>
                    <dd>
                      {quoteError
                        ? intl.formatMessage({ id: "fact.error" })
                        : model
                          ? formatKrwMillion(intl, model.enterpriseValue)
                          : intl.formatMessage({ id: "fact.pending" })}
                    </dd>
                  </div>
                  <div>
                    <dt>{intl.formatMessage({ id: "fact.netDebt" })}</dt>
                    <dd>{formatKrwMillion(intl, model ? model.netDebt : netDebt)}</dd>
                  </div>
                  <div>
                    <dt>{intl.formatMessage({ id: "fact.modelEquity" })}</dt>
                    <dd>
                      {quoteError
                        ? intl.formatMessage({ id: "fact.error" })
                        : model
                          ? formatKrwMillion(intl, model.equityValue)
                          : intl.formatMessage({ id: "fact.pending" })}
                    </dd>
                  </div>
                </dl>
                <p className="disclaimer">
                  {intl.formatMessage({ id: "card.disclaimer" }, { seed })}
                </p>
              </motion.article>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
