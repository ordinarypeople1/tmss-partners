import { useEffect, useState } from "react";
import { Briefcase, Building2, House, Landmark, Moon, PieChart, RotateCcw, Sun } from "lucide-react";
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
import { resolvedTheme, storeTheme } from "./theme";
import { ClockBar } from "./widgets";

const LINKS: { name: Route["name"]; href: string; label: string; icon: typeof House }[] = [
  { name: "home", href: "#/", label: "nav.home", icon: House },
  { name: "deals", href: "#/deals", label: "nav.deals", icon: Briefcase },
  { name: "companies", href: "#/companies", label: "nav.companies", icon: Building2 },
  { name: "fund", href: "#/fund", label: "nav.fund", icon: Landmark },
  { name: "portfolio", href: "#/portfolio", label: "nav.portfolio", icon: PieChart },
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
  const [theme, setTheme] = useState<"light" | "dark">(() => resolvedTheme());

  useEffect(() => {
    document.title = intl.formatMessage({ id: "app.title" });
  }, [intl]);

  useEffect(() => {
    const sync = () => setTheme(resolvedTheme());
    sync();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    window.addEventListener("deal-atlas-theme", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("deal-atlas-theme", sync);
    };
  }, []);

  function toggleTheme() {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    storeTheme(next);
    setTheme(next);
  }

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

  const themeLabel = intl.formatMessage({ id: theme === "dark" ? "theme.toLight" : "theme.toDark" });
  const ThemeIcon = theme === "dark" ? Sun : Moon;

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
        <div className="top-actions">
          <button type="button" className="icon-btn" aria-label={themeLabel} onClick={toggleTheme}>
            <ThemeIcon size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={intl.formatMessage({ id: "app.reset" })}
            onClick={() => void reset()}
          >
            <RotateCcw size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      {error && dash ? <p className="banner">{intl.formatMessage({ id: `error.${error}` })}</p> : null}
      <p className="muted workspace">{intl.formatMessage({ id: "app.saved" })}</p>
      {body}
      <nav className="nav" aria-label={intl.formatMessage({ id: "nav.label" })}>
        {LINKS.map((link) => {
          const Icon = link.icon;
          const current =
            route.name === link.name ||
            (route.name === "deal" && link.name === "deals") ||
            (route.name === "company" && link.name === "companies");
          return (
            <a key={link.name} href={link.href} aria-current={current ? "page" : undefined}>
              <Icon size={18} aria-hidden="true" />
              {intl.formatMessage({ id: link.label })}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
