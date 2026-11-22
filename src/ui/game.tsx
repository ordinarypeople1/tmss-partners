import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GameSession } from "../sim/wasm";
import type { Command, CompanyRow, CompanyView, GameDate, Message, MinorityPreview, Offer, OfferPreview, Options, Rank, View } from "../sim/types";
import { joinBase } from "./publicPath";
import { readSave, writeSave } from "./saveStore";
import { playSound, soundFor } from "./sound";

export type Screen = "map" | "inbox" | "deals" | "portfolio" | "market" | "league" | "fund" | "career";
export const SCREENS: Screen[] = ["map", "inbox", "deals", "portfolio", "market", "league", "fund", "career"];
/** The most months "skip ahead" will close in one go. */
const SKIP_LIMIT = 12;

/** What happened while the last turn closed. */
export interface TurnReport {
  /** The first month that closed. */
  from: GameDate;
  /** How many months closed. More than one after a skip. */
  months: number;
  /** Everything that arrived, oldest first. */
  messages: Message[];
}
/** How long after the last command the game is saved. Each save writes megabytes, so not on every click. */
const SAVE_DELAY_MS = 1_500;

export interface Toast {
  id: number;
  /** Catalog id, e.g. "error.no_attention". */
  messageId: string;
  tone: "bad" | "good";
}

export interface Game {
  view: View;
  /** Rows by the index sim-core commands take. */
  rows: Map<number, CompanyRow>;
  screen: Screen;
  /** Opens a screen. Every move is kept, so the player can go back and forward. */
  go(screen: Screen): void;
  back(): void;
  forward(): void;
  canBack: boolean;
  canForward: boolean;
  /** The company open in the main area, if any. */
  selected: number | null;
  company: CompanyView | null;
  /** Opens a company in the main area; null leaves it, as going back does. */
  select(company: number | null): void;
  /** The page open over the screen, if any. */
  page: Page | null;
  /** Opens a company, a rival house or a bank. */
  open(page: Page): void;
  /**
   * Sends one command to sim-core and redraws. Returns whether it applied.
   * A refusal raises a toast with the reason; callers need not handle it.
   */
  act(command: Command): boolean;
  /** Reads a company without selecting it. */
  peek(company: number): CompanyView | null;
  previewOffer(company: number, offer: Offer): OfferPreview | null;
  /** A minority proposal before the books are open. */
  previewMinority(company: number, offer: Offer): MinorityPreview | null;
  /** Closes the month. The game is turn-based: nothing moves until the player says so. */
  nextMonth(): void;
  /** Closes months until something is addressed to the player, a year at most. For quiet stretches. */
  skipAhead(): void;
  /** The summary of the turn that just closed, until dismissed. */
  turn: TurnReport | null;
  dismissTurn(): void;
  /** Starts over. Without options the defaults apply (standard difficulty, high-rates era). */
  newGame(options?: Options): void;
  /** Saves and goes back to the title screen. */
  toTitle(): void;
  toasts: Toast[];
  dismissToast(id: number): void;
}

/** What the title screen shows of the saved game. */
export interface SaveSummary {
  date: GameDate;
  rank: Rank;
  house: View["house"];
  deals: number;
  exits: number;
  options: Options;
}

/** What the title screen can do before a game is open. */
export interface TitleControls {
  /** The game on this device, or null when there is none (or it is from an older version). */
  saved: SaveSummary | null;
  resume(): void;
  newGame(options?: Options): void;
}

function summarize(view: View): SaveSummary {
  return {
    date: view.date,
    rank: view.career.rank,
    house: view.house,
    deals: view.career.deals_closed,
    exits: view.career.exits,
    options: view.options,
  };
}

/** A page opened over a screen: a company, a rival house or a sell-side bank. */
export type Page = { kind: "company" | "house" | "adviser"; id: number };

/** Where the player is: a screen, and a page opened over it. */
interface Route {
  screen: Screen;
  page: Page | null;
}
const HOME: Route = { screen: "map", page: null };
const samePage = (a: Page | null, b: Page | null) => a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
/** How many moves back the history keeps. */
const HISTORY_LIMIT = 50;

const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) {
    throw new Error("useGame outside GameProvider");
  }
  return game;
}

async function fetchUniverse(): Promise<string> {
  const response = await fetch(joinBase(import.meta.env.BASE_URL, "content/universe.json"));
  if (!response.ok) {
    throw new Error("universe");
  }
  return response.text();
}

/** The saved game, or null when there is none or it is from another schema. */
async function resumeSaved(): Promise<GameSession | null> {
  const save = await readSave();
  if (!save) {
    return null;
  }
  try {
    return await GameSession.resume(save);
  } catch {
    // A save from another schema starts a new game.
    return null;
  }
}

async function startNew(options?: Options): Promise<GameSession> {
  const seed = Math.floor(Date.now() % 1_000_000_000);
  return GameSession.start(seed, await fetchUniverse(), options);
}

export function GameProvider({
  children,
  loading,
  failed,
  title,
}: {
  children: ReactNode;
  loading: ReactNode;
  failed: ReactNode;
  /** The screen before a game opens: continue or start over. */
  title: (controls: TitleControls) => ReactNode;
}) {
  const session = useRef<GameSession | null>(null);
  /** The saved game, read on boot and kept until the player continues or starts over. */
  const saved = useRef<GameSession | null>(null);
  /** Undefined while the save is being read. */
  const [summary, setSummary] = useState<SaveSummary | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  const [screen, setScreen] = useState<Screen>("map");
  const [selected, setSelected] = useState<number | null>(null);
  const [company, setCompany] = useState<CompanyView | null>(null);
  const [turn, setTurn] = useState<TurnReport | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const selectedRef = useRef<number | null>(null);
  const history = useRef<{ stack: Route[]; at: number }>({ stack: [HOME], at: 0 });
  const [position, setPosition] = useState({ at: 0, length: 1 });
  const saveTimer = useRef<number | undefined>(undefined);
  const lastMessage = useRef(-1);

  const redraw = useCallback(() => {
    const current = session.current;
    if (!current) {
      return;
    }
    const next = current.view();
    setView(next);
    const index = selectedRef.current;
    setCompany(index === null ? null : current.company(index));
    return next;
  }, []);

  /** Saves now, dropping any save still waiting. */
  const persist = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (session.current) {
      void writeSave(session.current.save());
    }
  }, []);
  const persistSoon = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(persist, SAVE_DELAY_MS);
  }, [persist]);

  const enter = useCallback(
    (opened: GameSession) => {
      session.current = opened;
      selectedRef.current = null;
      setSelected(null);
      history.current = { stack: [HOME], at: 0 };
      setPage(null);
      setPosition({ at: 0, length: 1 });
      setTurn(null);
      setScreen("map");
      const first = redraw();
      lastMessage.current = Math.max(-1, ...(first?.messages ?? []).map((message) => message.id));
      setPlaying(true);
    },
    [redraw],
  );

  useEffect(() => {
    let live = true;
    resumeSaved()
      .then((found) => {
        if (!live) {
          return;
        }
        saved.current = found;
        setSummary(found ? summarize(found.view()) : null);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  const resume = useCallback(() => {
    if (saved.current) {
      enter(saved.current);
    }
  }, [enter]);

  const start = useCallback(
    (options?: Options) => {
      setBusy(true);
      startNew(options)
        .then((opened) => {
          saved.current = opened;
          void writeSave(opened.save());
          setSummary(summarize(opened.view()));
          enter(opened);
        })
        .catch(() => setError(true))
        .finally(() => setBusy(false));
    },
    [enter],
  );

  const toTitle = useCallback(() => {
    const current = session.current;
    if (current) {
      persist();
      saved.current = current;
      setSummary(summarize(current.view()));
    }
    setPlaying(false);
  }, [persist]);

  const toast = useCallback((messageId: string, tone: Toast["tone"]) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((list) => [...list.slice(-3), { id, messageId, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4_000);
  }, []);

  const act = useCallback(
    (command: Command) => {
      const current = session.current;
      if (!current) {
        return false;
      }
      const result = current.command(command);
      if (!result.ok) {
        toast(`error.${result.error}`, "bad");
        playSound("refuse");
        return false;
      }
      playSound("act");
      redraw();
      persistSoon();
      return true;
    },
    [redraw, toast, persistSoon],
  );

  const advance = useCallback(
    (limit: number) => {
      const current = session.current;
      if (!current) {
        return;
      }
      const from = current.view().date;
      const arrived: Message[] = [];
      let months = 0;
      let next: View | undefined;
      while (months < limit) {
        if (!current.command({ type: "advance_month" }).ok) {
          break;
        }
        months += 1;
        next = current.view();
        const fresh = next.messages.filter((message) => message.id > lastMessage.current);
        lastMessage.current = Math.max(lastMessage.current, ...fresh.map((message) => message.id));
        arrived.push(...fresh);
        // Anything addressed to the player ends a skip.
        if (fresh.some((message) => !message.news) || next.career.fired) {
          break;
        }
      }
      if (months === 0) {
        return;
      }
      redraw();
      persist();
      playSound("month");
      const loudest = arrived.map(soundFor).find((sound) => sound !== null);
      if (loudest) {
        playSound(loudest);
      }
      setTurn({ from, months, messages: arrived });
    },
    [redraw, persist],
  );
  const nextMonth = useCallback(() => advance(1), [advance]);
  const skipAhead = useCallback(() => advance(SKIP_LIMIT), [advance]);

  useEffect(() => {
    // A save still waiting is written when the page goes to the background. On a phone that is
    // often the last moment the app runs; IndexedDB is asynchronous, so the earlier the better.
    const flush = () => {
      if (saveTimer.current !== undefined) {
        persist();
      }
    };
    const hidden = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [persist]);

  const [page, setPage] = useState<Page | null>(null);
  const show = useCallback((route: Route) => {
    const company = route.page?.kind === "company" ? route.page.id : null;
    selectedRef.current = company;
    setSelected(company);
    setPage(route.page);
    setScreen(route.screen);
    setCompany(company === null || !session.current ? null : session.current.company(company));
    setPosition({ at: history.current.at, length: history.current.stack.length });
  }, []);

  const navigate = useCallback(
    (route: Route) => {
      const { stack, at } = history.current;
      const here = stack[at];
      if (here.screen === route.screen && samePage(here.page, route.page)) {
        return;
      }
      const next = [...stack.slice(0, at + 1), route].slice(-HISTORY_LIMIT);
      history.current = { stack: next, at: next.length - 1 };
      show(route);
    },
    [show],
  );

  const move = useCallback(
    (step: number) => {
      const { stack, at } = history.current;
      const target = at + step;
      if (target < 0 || target >= stack.length) {
        return;
      }
      history.current = { stack, at: target };
      show(stack[target]);
    },
    [show],
  );
  const back = useCallback(() => move(-1), [move]);
  const forward = useCallback(() => move(1), [move]);

  const go = useCallback((target: Screen) => navigate({ screen: target, page: null }), [navigate]);

  const open = useCallback(
    (target: Page) => navigate({ screen: history.current.stack[history.current.at].screen, page: target }),
    [navigate],
  );

  const select = useCallback(
    (index: number | null) => {
      const { stack, at } = history.current;
      const here = stack[at];
      if (index !== null) {
        open({ kind: "company", id: index });
      } else if (here.page !== null) {
        // Leaving a page is going back to where it was opened from.
        const previous = stack[at - 1];
        if (previous && previous.screen === here.screen) {
          move(-1);
        } else {
          navigate({ screen: here.screen, page: null });
        }
      }
    },
    [navigate, move, open],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    // Development only: lets a script drive the game without clicking through it. See tools/dev/drive.cjs.
    (window as unknown as Record<string, unknown>).__game = {
      command: (command: Command) => {
        const result = session.current?.command(command);
        redraw();
        return result;
      },
      view: () => session.current?.view(),
      company: (index: number) => session.current?.company(index),
      select,
      open,
      go,
    };
  }, [redraw, select, open, go]);

  const rows = useMemo(() => new Map((view?.companies ?? []).map((row) => [row.i, row])), [view]);

  const game = useMemo<Game | null>(() => {
    if (!view) {
      return null;
    }
    return {
      view,
      rows,
      screen,
      go,
      back,
      forward,
      canBack: position.at > 0,
      canForward: position.at < position.length - 1,
      selected,
      company,
      select,
      page,
      open,
      act,
      peek: (index) => session.current?.company(index) ?? null,
      previewOffer: (index, offer) => session.current?.previewOffer(index, offer) ?? null,
      previewMinority: (index, offer) => session.current?.previewMinority(index, offer) ?? null,
      nextMonth,
      skipAhead,
      turn,
      dismissTurn: () => setTurn(null),
      newGame: start,
      toTitle,
      toasts,
      dismissToast: (id) => setToasts((list) => list.filter((item) => item.id !== id)),
    };
  }, [view, rows, screen, go, back, forward, position, selected, company, select, page, open, act, nextMonth, skipAhead, turn, start, toTitle, toasts]);

  if (error) {
    return <>{failed}</>;
  }
  if (summary === undefined || busy) {
    return <>{loading}</>;
  }
  if (!playing || !game) {
    return <>{title({ saved: summary, resume, newGame: start })}</>;
  }
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}
