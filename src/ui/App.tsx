import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { useGame } from "./game/session";
import { parseRoute, type Route } from "./game/types";
import { CompaniesScreen } from "./screens/CompaniesScreen";
import { CompanyScreen } from "./screens/CompanyScreen";
import { DealScreen } from "./screens/DealScreen";
import { DealsScreen } from "./screens/DealsScreen";
import { FundScreen } from "./screens/FundScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { PortfolioScreen } from "./screens/PortfolioScreen";
import { ClockBar } from "./widgets";

const LINKS: { name: Route["name"]; href: string; label: string }[] = [
  { name: "home", href: "#/", label: "nav.home" },
  { name: "deals", href: "#/deals", label: "nav.deals" },
  { name: "companies", href: "#/companies", label: "nav.companies" },
  { name: "fund", href: "#/fund", label: "nav.fund" },
  { name: "portfolio", href: "#/portfolio", label: "nav.portfolio" },
];

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function App() {
  const intl = useIntl();
  const route = useRoute();
  const { dash, error, ready, failed, paused, speed, setPaused, setSpeed, reset } = useGame();

  useEffect(() => {
    document.title = intl.formatMessage({ id: "app.title" });
  }, [intl]);

  let body = <p>{intl.formatMessage({ id: "company.loading" })}</p>;
  if (failed || (ready && !dash)) {
    body = <p className="banner">{intl.formatMessage({ id: "error.boot" })}</p>;
  } else if (dash) {
    if (route.name === "deals") body = <DealsScreen />;
    else if (route.name === "deal") body = <DealScreen id={route.id} />;
    else if (route.name === "companies") body = <CompaniesScreen />;
    else if (route.name === "company") body = <CompanyScreen id={route.id} />;
    else if (route.name === "fund") body = <FundScreen />;
    else if (route.name === "portfolio") body = <PortfolioScreen />;
    else body = <HomeScreen />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{intl.formatMessage({ id: "app.house" })}</p>
          <h1>{intl.formatMessage({ id: "app.title" })}</h1>
          <p className="era">{intl.formatMessage({ id: "app.era" })}</p>
        </div>
        {dash ? (
          <ClockBar
            year={dash.clock.year}
            quarter={dash.clock.quarter}
            week={dash.clock.week_in_quarter}
            paused={paused}
            speed={speed}
            onToggle={() => setPaused(!paused)}
            onSpeed={(value) => {
              setSpeed(value);
              setPaused(false);
            }}
          />
        ) : null}
        <button type="button" onClick={() => void reset()}>
          {intl.formatMessage({ id: "app.reset" })}
        </button>
      </header>
      <nav className="nav" aria-label={intl.formatMessage({ id: "nav.label" })}>
        {LINKS.map((link) => (
          <a
            key={link.name}
            href={link.href}
            aria-current={route.name === link.name || (route.name === "deal" && link.name === "deals") || (route.name === "company" && link.name === "companies") ? "page" : undefined}
          >
            {intl.formatMessage({ id: link.label })}
          </a>
        ))}
      </nav>
      {error && dash ? (
        <p className="banner">{intl.formatMessage({ id: `error.${error}` })}</p>
      ) : null}
      <p className="muted workspace">{intl.formatMessage({ id: "app.saved" })}</p>
      {body}
    </div>
  );
}
