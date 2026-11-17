import { useEffect, useState } from "react";
import { Briefcase, DoorOpen, Landmark, LineChart, Moon, Newspaper, PieChart, RotateCcw, Sun } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";
import { money } from "./game/format";
import { useGame } from "./game/session";
import { parseRoute, type Route } from "./game/types";
import { CompaniesScreen } from "./screens/CompaniesScreen";
import { CompanyScreen } from "./screens/CompanyScreen";
import { DealScreen } from "./screens/DealScreen";
import { DealsScreen } from "./screens/DealsScreen";
import { FundScreen } from "./screens/FundScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { MarketScreen } from "./screens/MarketScreen";
import { PortfolioScreen } from "./screens/PortfolioScreen";
import { ActivityRail, EconomyRail } from "./rails";
import { spring } from "./motion";
import { resolvedTheme, storeTheme } from "./theme";
import { ClockBar, Skeleton } from "./widgets";

const LINKS: { name: Route["name"]; href: string; label: string; icon: typeof Landmark }[] = [
  { name: "deals", href: "#/deals", label: "nav.deals", icon: Briefcase },
  { name: "room", href: "#/room", label: "nav.room", icon: DoorOpen },
  { name: "portfolio", href: "#/portfolio", label: "nav.portfolio", icon: PieChart },
  { name: "home", href: "#/", label: "nav.house", icon: Landmark },
  { name: "market", href: "#/market", label: "nav.market", icon: LineChart },
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
  const [activityFilter, setActivityFilter] = useState("all");
  const [economyFilter, setEconomyFilter] = useState("all");
  const [sheet, setSheet] = useState<"" | "activity" | "economy">("");

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

  let body = <Skeleton label={intl.formatMessage({ id: "company.loading" })} />;
  if (failed || (ready && !dash)) {
    body = <p className="banner">{intl.formatMessage({ id: "error.boot" })}</p>;
  } else if (dash) {
    if (route.name === "deals") body = <DealsScreen />;
    else if (route.name === "room") body = <DealsScreen room />;
    else if (route.name === "market") body = <MarketScreen />;
    else if (route.name === "deal") body = <DealScreen id={route.id} />;
    else if (route.name === "companies") body = <CompaniesScreen />;
    else if (route.name === "company") body = <CompanyScreen id={route.id} />;
    else if (route.name === "fund") body = <FundScreen />;
    else if (route.name === "portfolio") body = <PortfolioScreen />;
    else body = <HomeScreen />;
  }

  const reduce = useReducedMotion();
  const themeLabel = intl.formatMessage({ id: theme === "dark" ? "theme.toLight" : "theme.toDark" });
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const routeKey = route.name === "deal" || route.name === "company" ? `${route.name}-${route.id}` : route.name;

  return (
    <div className="shell">
      <header className="topbar glass">
        <div className="top-row">
          <div>
            <p className="eyebrow">{intl.formatMessage({ id: "app.house" })}</p>
            <h1>{intl.formatMessage({ id: "app.title" })}</h1>
            {dash ? (
              <label className="fund-select">
                {intl.formatMessage({ id: "header.acting" })}
                <select aria-label={intl.formatMessage({ id: "header.acting" })} defaultValue="active">
                  <option value="active">{dash.funds?.active || dash.fund.name_ko}</option>
                  {(dash.funds?.parked ?? []).map((name) => (
                    <option key={name} value={name} disabled>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {dash ? (
            <div className="treasury">
              <p>
                <span>{intl.formatMessage({ id: "header.treasury" })}</span>
                <strong className="key">{money(intl, dash.fund.cash)}</strong>
              </p>
              <p>
                <span>{intl.formatMessage({ id: "header.overhead" })}</span>
                <strong>{money(intl, dash.fund.overhead_month ?? 0)}</strong>
              </p>
            </div>
          ) : null}
          <div className="top-actions">
            <button type="button" className="rail-toggle" onClick={() => setSheet("activity")}>
              <Newspaper size={16} strokeWidth={1.75} aria-hidden="true" />
              {intl.formatMessage({ id: "nav.activity" })}
            </button>
            <button type="button" className="rail-toggle" onClick={() => setSheet("economy")}>
              <LineChart size={16} strokeWidth={1.75} aria-hidden="true" />
              {intl.formatMessage({ id: "nav.economy" })}
            </button>
            <button type="button" className="icon-btn" aria-label={themeLabel} onClick={toggleTheme}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  style={{ display: "inline-flex" }}
                  initial={reduce ? false : { rotate: -50, scale: 0.5, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={reduce ? undefined : { rotate: 40, scale: 0.5, opacity: 0 }}
                  transition={spring}
                >
                  <ThemeIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={intl.formatMessage({ id: "app.reset" })}
              onClick={() => void reset()}
            >
              <RotateCcw size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
        {dash ? (
          <div className="clock-cluster">
            <p className="clock-readout">
              {intl.formatMessage(
                { id: "clock.quarter" },
                { year: dash.clock.year, quarter: dash.clock.quarter },
              )}
            </p>
            <div className="quarter-track" aria-hidden="true">
              <span style={{ transform: `scaleX(${dash.clock.week_in_quarter / 13})` }} />
            </div>
            <p className="muted">
              {intl.formatMessage(
                { id: "header.progress" },
                { week: dash.clock.week_in_quarter, weeks: 13 },
              )}
            </p>
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
          </div>
        ) : null}
      </header>
      <AnimatePresence>
        {error && dash ? (
          <motion.p
            className="banner"
            initial={reduce ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
          >
            {intl.formatMessage({ id: `error.${error}` })}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <p className="saved">{intl.formatMessage({ id: "app.saved" })}</p>
      <div className="desk">
        <div className="rail-side">
          {dash ? <ActivityRail dash={dash} filter={activityFilter} onFilter={setActivityFilter} /> : null}
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={routeKey}
            className="route"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={spring}
          >
            {body}
          </motion.div>
        </AnimatePresence>
        <div className="rail-side">
          {dash ? <EconomyRail dash={dash} filter={economyFilter} onFilter={setEconomyFilter} /> : null}
        </div>
      </div>
      {sheet && dash ? (
        <>
          <button type="button" className="sheet-back" aria-label={intl.formatMessage({ id: "filter.close" })} onClick={() => setSheet("")} />
          <div className="sheet glass rail-sheet">
            {sheet === "activity" ? (
              <ActivityRail dash={dash} filter={activityFilter} onFilter={setActivityFilter} />
            ) : (
              <EconomyRail dash={dash} filter={economyFilter} onFilter={setEconomyFilter} />
            )}
          </div>
        </>
      ) : null}
      <nav className="nav glass" aria-label={intl.formatMessage({ id: "nav.label" })}>
        {LINKS.map((link) => {
          const Icon = link.icon;
          const current =
            route.name === link.name ||
            (route.name === "deal" && link.name === "deals") ||
            (route.name === "fund" && link.name === "home");
          return (
            <a key={link.name} href={link.href} aria-current={current ? "page" : undefined}>
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {intl.formatMessage({ id: link.label })}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
