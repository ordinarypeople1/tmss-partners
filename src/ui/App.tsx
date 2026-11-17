import { useEffect, useRef, useState } from "react";
import {
  Binoculars,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Info,
  Inbox,
  Landmark,
  LineChart,
  Menu,
  Moon,
  PieChart,
  RotateCcw,
  Search,
  Sun,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";
import { money } from "./game/format";
import { setSearchQuery } from "./game/shortlist";
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
import { StaffScreen } from "./screens/StaffScreen";
import { EconomyRail } from "./rails";
import { spring } from "./motion";
import { resolvedTheme, storeTheme } from "./theme";
import { ClockBar, IconButton, Skeleton } from "./widgets";

const LINKS: { name: Route["name"]; href: string; label: string; icon: typeof Landmark }[] = [
  { name: "home", href: "#/", label: "nav.inbox", icon: Inbox },
  { name: "deals", href: "#/deals", label: "nav.deals", icon: Briefcase },
  { name: "companies", href: "#/companies", label: "nav.scout", icon: Binoculars },
  { name: "portfolio", href: "#/portfolio", label: "nav.book", icon: PieChart },
  { name: "fund", href: "#/fund", label: "nav.fund", icon: Landmark },
  { name: "market", href: "#/market", label: "nav.market", icon: LineChart },
  { name: "staff", href: "#/staff", label: "nav.staff", icon: Users },
];

const MOBILE = LINKS.slice(0, 4);

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

function currentLink(route: Route, name: Route["name"]) {
  return (
    route.name === name ||
    (route.name === "deal" && name === "deals") ||
    (route.name === "room" && name === "deals") ||
    (route.name === "company" && name === "companies")
  );
}

function crumbId(route: Route): string {
  if (route.name === "deal" || route.name === "room") {
    return "nav.deals";
  }
  if (route.name === "company" || route.name === "companies") {
    return "nav.scout";
  }
  if (route.name === "portfolio") {
    return "nav.book";
  }
  const link = LINKS.find((item) => item.name === route.name);
  return link?.label ?? "nav.inbox";
}

export function App() {
  const intl = useIntl();
  const route = useRoute();
  const { dash, error, ready, failed, paused, speed, setPaused, setSpeed, reset, run } = useGame();
  const [theme, setTheme] = useState<"light" | "dark">(() => resolvedTheme());
  const [economyFilter, setEconomyFilter] = useState("all");
  const [sheet, setSheet] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState(0);
  const history = useRef<string[]>([window.location.hash || "#/"]);
  const index = useRef(0);
  const skip = useRef(false);

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

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash || "#/";
      if (skip.current) {
        skip.current = false;
        setStep((value) => value + 1);
        return;
      }
      const next = history.current.slice(0, index.current + 1);
      if (next[next.length - 1] !== hash) {
        next.push(hash);
        index.current = next.length - 1;
        history.current = next;
      }
      setStep((value) => value + 1);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function toggleTheme() {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    storeTheme(next);
    setTheme(next);
  }

  function visit(hash: string) {
    skip.current = true;
    window.location.hash = hash;
  }

  function back() {
    if (index.current <= 0) {
      return;
    }
    index.current -= 1;
    visit(history.current[index.current] ?? "#/");
  }

  function forward() {
    if (index.current >= history.current.length - 1) {
      return;
    }
    index.current += 1;
    visit(history.current[index.current] ?? "#/");
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
    else if (route.name === "staff") body = <StaffScreen />;
    else if (route.name === "portfolio") body = <PortfolioScreen />;
    else body = <HomeScreen />;
  }

  const reduce = useReducedMotion();
  const themeLabel = intl.formatMessage({ id: theme === "dark" ? "theme.toLight" : "theme.toDark" });
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const routeKey = route.name === "deal" || route.name === "company" ? `${route.name}-${route.id}` : route.name;
  const crumb = intl.formatMessage({ id: crumbId(route) });

  return (
    <div className="shell">
      <aside className={drawer ? "side open" : "side"}>
        <p className="side-title">{intl.formatMessage({ id: "app.title" })}</p>
        <nav aria-label={intl.formatMessage({ id: "nav.label" })}>
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.name}
                href={link.href}
                aria-current={currentLink(route, link.name) ? "page" : undefined}
                onClick={() => setDrawer(false)}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                {intl.formatMessage({ id: link.label })}
              </a>
            );
          })}
        </nav>
        <IconButton label={intl.formatMessage({ id: "tip.saved" })}>
          <Info size={16} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </aside>
      <div className="main-col">
        <header className="topbar glass">
          <div className="top-row">
            <IconButton className="menu-toggle" label={intl.formatMessage({ id: "nav.more" })} onClick={() => setDrawer(true)}>
              <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <IconButton label={intl.formatMessage({ id: "clock.back" })} disabled={index.current <= 0} onClick={back}>
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={intl.formatMessage({ id: "clock.forward" })}
              disabled={index.current >= history.current.length - 1}
              onClick={forward}
            >
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <p className="crumb">{crumb}</p>
            <form
              className="global-search"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchQuery(query);
                window.location.hash = "#/companies";
              }}
            >
              <Search size={16} strokeWidth={1.75} aria-hidden="true" />
              <input
                value={query}
                aria-label={intl.formatMessage({ id: "search.label" })}
                placeholder={intl.formatMessage({ id: "search.placeholder" })}
                onChange={(event) => setQuery(event.target.value)}
              />
            </form>
            {dash ? (
              <p className="treasury-inline">
                <span className="muted">{intl.formatMessage({ id: "header.treasury" })}</span>
                <strong className="key">{money(intl, dash.fund.cash)}</strong>
              </p>
            ) : null}
            <div className="top-actions">
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
              <button
                type="button"
                className="btn-primary continue"
                onClick={() => void run({ op: "advance_weeks", weeks: 1 })}
              >
                {intl.formatMessage({ id: "clock.continue" })}
              </button>
              <IconButton label={themeLabel} onClick={toggleTheme}>
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
              </IconButton>
              <IconButton label={intl.formatMessage({ id: "app.reset" })} onClick={() => void reset()}>
                <RotateCcw size={20} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
              <IconButton className="rail-toggle" label={intl.formatMessage({ id: "nav.economy" })} onClick={() => setSheet(true)}>
                <LineChart size={20} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <span className="sr-only">{step}</span>
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
        <div className="desk">
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
      </div>
      {drawer ? (
        <button type="button" className="sheet-back" aria-label={intl.formatMessage({ id: "filter.close" })} onClick={() => setDrawer(false)} />
      ) : null}
      {sheet && dash ? (
        <>
          <button type="button" className="sheet-back" aria-label={intl.formatMessage({ id: "filter.close" })} onClick={() => setSheet(false)} />
          <div className="sheet glass rail-sheet">
            <IconButton label={intl.formatMessage({ id: "filter.close" })} onClick={() => setSheet(false)}>
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <EconomyRail dash={dash} filter={economyFilter} onFilter={setEconomyFilter} />
          </div>
        </>
      ) : null}
      <nav className="nav glass" aria-label={intl.formatMessage({ id: "nav.label" })}>
        {MOBILE.map((link) => {
          const Icon = link.icon;
          return (
            <a key={link.name} href={link.href} aria-current={currentLink(route, link.name) ? "page" : undefined}>
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {intl.formatMessage({ id: link.label })}
            </a>
          );
        })}
        <button type="button" onClick={() => setDrawer(true)}>
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
          {intl.formatMessage({ id: "nav.more" })}
        </button>
      </nav>
    </div>
  );
}
