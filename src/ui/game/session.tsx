import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { joinBase } from "../publicPath";
import { loadSimCore } from "../../sim/wasm";
import type { CommandResult, Dashboard } from "./types";

const SAVE_KEY = "deal-atlas-save-v1";

interface GameContextValue {
  dash: Dashboard | null;
  error: string | null;
  ready: boolean;
  failed: boolean;
  paused: boolean;
  speed: number;
  epoch: number;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  run: (body: Record<string, unknown>) => Promise<CommandResult>;
  reset: () => Promise<void>;
}

const READS = new Set(["dashboard", "deals", "deal", "companies", "company", "fund", "portfolio"]);

let turn: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = turn.then(work, work);
  turn = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const GameContext = createContext<GameContextValue | null>(null);

function readDashboard(result: CommandResult): Dashboard | null {
  if (!result.dashboard?.clock || !result.dashboard.fund) {
    return null;
  }
  return result.dashboard;
}

async function bootGame(force: boolean): Promise<CommandResult> {
  return enqueue(async () => {
    const api = await loadSimCore();
    const response = await fetch(joinBase(import.meta.env.BASE_URL, "atlas/boot.json"));
    if (!response.ok) {
      throw new Error("boot");
    }
    const text = await response.text();
    const seedMatch = text.match(/"seed":\s*(\d+)/);
    const seed = seedMatch ? Number(seedMatch[1]) : 0;
    if (!force) {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const imported = JSON.parse(api.import_game(saved)) as CommandResult;
        if (imported.ok && imported.dashboard?.seed === seed) {
          return imported;
        }
      }
    }
    return JSON.parse(api.boot_game(text)) as CommandResult;
  });
}

async function send(body: Record<string, unknown>): Promise<CommandResult> {
  return enqueue(async () => {
    const api = await loadSimCore();
    const result = JSON.parse(api.game_command(JSON.stringify(body))) as CommandResult;
    if (result.ok) {
      try {
        localStorage.setItem(SAVE_KEY, api.export_game());
      } catch {
        /* private mode */
      }
    }
    return result;
  });
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [epoch, setEpoch] = useState(0);

  const apply = useCallback((result: CommandResult) => {
    const next = readDashboard(result);
    if (next) {
      setDash(next);
    }
    setError(result.ok ? null : (result.error ?? "bad_state"));
    return result;
  }, []);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      const result = apply(await send(body));
      const op = typeof body.op === "string" ? body.op : "";
      if (result.ok && !READS.has(op)) {
        setEpoch((value) => value + 1);
      }
      return result;
    },
    [apply],
  );

  const reset = useCallback(async () => {
    localStorage.removeItem(SAVE_KEY);
    setPaused(true);
    apply(await bootGame(true));
    setEpoch((value) => value + 1);
  }, [apply]);

  useEffect(() => {
    let cancel = false;
    bootGame(false)
      .then((result) => {
        if (!cancel) {
          apply(result);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancel) {
          setFailed(true);
          setReady(true);
        }
      });
    return () => {
      cancel = true;
    };
  }, [apply]);

  useEffect(() => {
    if (!ready || failed || paused) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      void run({ op: "advance_weeks", weeks: 1 });
    }, Math.round(1400 / speed));
    return () => window.clearInterval(timer);
  }, [ready, failed, paused, speed, run]);

  const value = useMemo(
    () => ({ dash, error, ready, failed, paused, speed, epoch, setPaused, setSpeed, run, reset }),
    [dash, error, ready, failed, paused, speed, epoch, run, reset],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) {
    throw new Error("game provider missing");
  }
  return value;
}
