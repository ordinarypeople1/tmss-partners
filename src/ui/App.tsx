import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { sampleContent } from "../data/sample";
import type { Company } from "../data/types";
import { formatKrwMillion } from "../sim/format";
import { enterpriseValue, equityValue } from "../sim/valuation";

const EMPTY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: undefined,
  sources: {},
  layers: [
    {
      id: "paper",
      type: "background",
      paint: { "background-color": "#e7efe8" },
    },
  ],
};

function latest(company: Company) {
  return company.quarters[company.quarters.length - 1];
}

function netDebt(company: Company): number {
  const balance = latest(company).balance;
  return balance.debt - balance.cash;
}

export function App() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selectedId, setSelectedId] = useState(sampleContent.companies[0]?.id ?? "");
  const selected =
    sampleContent.companies.find((company) => company.id === selectedId) ??
    sampleContent.companies[0];

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
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const markers = sampleContent.companies.map((company) => {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "pin";
      pin.dataset.selected = company.id === selectedId ? "true" : "false";
      pin.title = company.legal_name_ko;
      const label = document.createElement("span");
      label.className = "pin-label";
      label.textContent = company.sector_id === "cold_chain_logistics" ? "창" : "공";
      pin.append(label);
      pin.addEventListener("click", () => setSelectedId(company.id));
      return new maplibregl.Marker({ element: pin })
        .setLngLat([company.lon, company.lat])
        .addTo(map);
    });
    return () => {
      for (const marker of markers) {
        marker.remove();
      }
    };
  }, [selectedId]);

  if (!selected) {
    return <p>샘플 회사가 없습니다.</p>;
  }

  const quarter = latest(selected);
  const ebitda = quarter.income.ebitda;
  const multiple = quarter.model_multiple;
  const ev = enterpriseValue(ebitda, multiple);
  const equity = equityValue(ebitda, multiple, netDebt(selected));

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">TMSS Partners · Fund III</p>
          <h1>Deal Atlas</h1>
        </div>
        <p className="era">2024–2026 고금리 · 샘플 시나리오</p>
      </header>
      <main className="stage">
        <section className="map-panel" aria-label="대한민국 지도">
          <div ref={mapNode} className="map" />
          <p className="map-note">
            밑그림만 있는 지도입니다. 지명 레이어는 아직 없고, 핀은 가공의 단지 안에 있습니다.
          </p>
        </section>
        <section className="dossier" aria-live="polite">
          <ol className="company-list">
            {sampleContent.companies.map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  className="company-button"
                  aria-pressed={company.id === selected.id}
                  onClick={() => setSelectedId(company.id)}
                >
                  <span>{company.legal_name_ko}</span>
                  <small>
                    {company.sector_label_ko} · {company.region_label_ko}
                  </small>
                </button>
              </li>
            ))}
          </ol>
          <article className="card">
            <p className="card-kicker">{selected.complex_name_ko}</p>
            <h2>{selected.legal_name_ko}</h2>
            <p className="card-meta">
              {selected.sector_label_ko} · 설립 {selected.founded_year} · 직원{" "}
              {selected.employees.toLocaleString("ko-KR")}명
            </p>
            <dl className="facts">
              <div>
                <dt>{quarter.period} 매출</dt>
                <dd>{formatKrwMillion(quarter.income.revenue)}</dd>
              </div>
              <div>
                <dt>EBITDA</dt>
                <dd>{formatKrwMillion(ebitda)}</dd>
              </div>
              <div>
                <dt>모델 배수</dt>
                <dd>{multiple.toFixed(2)}x</dd>
              </div>
              <div>
                <dt>모델 기업가치</dt>
                <dd>{formatKrwMillion(ev)}</dd>
              </div>
              <div>
                <dt>순차입금</dt>
                <dd>{formatKrwMillion(netDebt(selected))}</dd>
              </div>
              <div>
                <dt>모델 지분가치</dt>
                <dd>{formatKrwMillion(equity)}</dd>
              </div>
            </dl>
            <p className="disclaimer">
              거래 가격이 아닙니다. 자리표시자 분포로 만든 가공 회사의 모델 가치이며, 단위는{" "}
              {sampleContent.unit_label_ko}입니다. 시드 {sampleContent.seed}.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
