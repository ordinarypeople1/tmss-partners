import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GameSession } from "../sim/wasm";
import type { Command, CompanyRow, CompanyView, Offer, OfferPreview, Options, View } from "../sim/types";
import { joinBase } from "./publicPath";
import { playSound, soundFor } from "./sound";

export type Screen = "map" | "inbox" | "deals" | "portfolio" | "market" | "league" | "fund" | "career";
export const SCREENS: Screen[] = ["map", "inbox", "deals", "portfolio", "market", "league", "fund", "career"];
/** 0 is paused. */
export type Speed = 0 | 1 | 2 | 3;

export const DAYS_PER_MONTH = 30;
const DAY_MS: Record<Exclude<Speed, 0>, number> = { 1: 400, 2: 160, 3: 55 };
const SAVE_KEY = "deal-atlas.save.v4";

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
  go(screen: Screen): void;
  /** The company open in the side panel, if any. */
  selected: number | null;
  company: CompanyView | null;
  select(company: number | null): void;
  /**
   * Sends one command to sim-core and redraws. Returns whether it applied.
   * A refusal raises a toast with the reason; callers need not handle it.
   */
  act(command: Command): boolean;
  /** Reads a company without selecting it. */
  peek(company: number): CompanyView | null;
  previewOffer(company: number, offer: Offer): OfferPreview | null;
  speed: Speed;
  setSpeed(speed: Speed): void;
  /** 1 through 30: where the open month stands on screen. */
  day: number;
  nextMonth(): void;
  /** Starts over. Without options the defaults apply (standard difficulty, high-rates era). */
  newGame(options?: Options): void;
  toasts: Toast[];
  dismissToast(id: number): void;
}

const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) {
    throw new Error("useGame outside GameProvider");
  }
  return game;
}

function readSave(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function writeSave(save: string) {
  try {
    window.localStorage.setItem(SAVE_KEY, save);
  } catch {
    // Private windows refuse storage. The game still runs for this visit.
  }
}

async function fetchUniverse(): Promise<string> {
  const response = await fetch(joinBase(import.meta.env.BASE_URL, "content/universe.json"));
  if (!response.ok) {
    throw new Error("universe");
  }
  return response.text();
}

async function open(fresh: boolean, options?: Options): Promise<GameSession> {
  const save = fresh ? null : readSave();
  if (save) {
    try {
      return await GameSession.resume(save);
    } catch {
      // A save from another schema starts a new game.
    }
  }
  const seed = Math.floor(Date.now() % 1_000_000_000);
  return GameSession.start(seed, await fetchUniverse(), options);
}

export function GameProvider({
  children,
  loading,
  failed,
}: {
  children: ReactNode;
  loading: ReactNode;
  failed: ReactNode;
}) {
  const session = useRef<GameSession | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(false);
  const [screen, setScreen] = useState<Screen>("map");
  const [selected, setSelected] = useState<number | null>(null);
  const [company, setCompany] = useState<CompanyView | null>(null);
  const [speed, setSpeed] = useState<Speed>(0);
  const [day, setDay] = useState(1);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const selectedRef = useRef<number | null>(null);
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

  const start = useCallback(
    (fresh: boolean, options?: Options) => {
      open(fresh, options)
        .then((opened) => {
          session.current = opened;
          selectedRef.current = null;
          setSelected(null);
          setSpeed(0);
          setDay(1);
          const first = redraw();
          lastMessage.current = Math.max(-1, ...(first?.messages ?? []).map((message) => message.id));
          if (fresh) {
            writeSave(opened.save());
          }
        })
        .catch(() => setError(true));
    },
    [redraw],
  );

  useEffect(() => {
    start(false);
  }, [start]);

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
      return true;
    },
    [redraw, toast],
  );

  const nextMonth = useCallback(() => {
    const current = session.current;
    if (!current) {
      return;
    }
    const result = current.command({ type: "advance_month" });
    setDay(1);
    if (!result.ok) {
      setSpeed(0);
      return;
    }
    const next = redraw();
    writeSave(current.save());
    // Anything addressed to the player stops the clock.
    const fresh = (next?.messages ?? []).filter((message) => message.id > lastMessage.current);
    for (const message of fresh) {
      const sound = soundFor(message);
      if (sound) {
        playSound(sound);
      }
    }
    lastMessage.current = Math.max(lastMessage.current, ...fresh.map((message) => message.id));
    if (fresh.some((message) => !message.news) || next?.career.fired) {
      setSpeed(0);
    }
  }, [redraw]);

  useEffect(() => {
    if (speed === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setDay((value) => value + 1);
    }, DAY_MS[speed]);
    return () => window.clearInterval(timer);
  }, [speed]);

  useEffect(() => {
    if (day > DAYS_PER_MONTH) {
      nextMonth();
    }
  }, [day, nextMonth]);

  useEffect(() => {
    const flush = () => {
      if (session.current) {
        writeSave(session.current.save());
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const select = useCallback((index: number | null) => {
    selectedRef.current = index;
    setSelected(index);
    setCompany(index === null || !session.current ? null : session.current.company(index));
  }, []);

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
      go: setScreen,
    };
  }, [redraw, select]);

  const rows = useMemo(() => new Map((view?.companies ?? []).map((row) => [row.i, row])), [view]);

  const game = useMemo<Game | null>(() => {
    if (!view) {
      return null;
    }
    return {
      view,
      rows,
      screen,
      go: setScreen,
      selected,
      company,
      select,
      act,
      peek: (index) => session.current?.company(index) ?? null,
      previewOffer: (index, offer) => session.current?.previewOffer(index, offer) ?? null,
      speed,
      setSpeed,
      day: Math.min(day, DAYS_PER_MONTH),
      nextMonth,
      newGame: (options) => start(true, options),
      toasts,
      dismissToast: (id) => setToasts((list) => list.filter((item) => item.id !== id)),
    };
  }, [view, rows, screen, selected, company, select, act, speed, day, nextMonth, start, toasts]);

  if (error) {
    return <>{failed}</>;
  }
  if (!game) {
    return <>{loading}</>;
  }
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}
