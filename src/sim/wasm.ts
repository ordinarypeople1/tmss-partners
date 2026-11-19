interface WasmSession {
  save(): string;
  advance_month(): string;
  free(): void;
}

interface SimCoreModule {
  default: (input?: unknown) => Promise<unknown>;
  Session: {
    new (seed: bigint): WasmSession;
    load(save: string): WasmSession;
  };
  enterprise_value_millis: (ebitda: bigint, multipleMillis: bigint) => bigint;
  equity_value_millis: (ebitda: bigint, multipleMillis: bigint, netDebt: bigint) => bigint;
}

let loading: Promise<SimCoreModule> | undefined;

export function loadSimCore(): Promise<SimCoreModule> {
  if (!loading) {
    loading = import("./pkg/sim_core.js").then(async (mod) => {
      const api = mod as SimCoreModule;
      await api.default();
      return api;
    });
  }
  return loading;
}

export interface QuotedValue {
  enterpriseValue: number;
  equityValue: number;
  netDebt: number;
}

export async function quoteCompany(
  ebitda: number,
  multipleMillis: number,
  debt: number,
  cash: number,
): Promise<QuotedValue> {
  const api = await loadSimCore();
  const ebitdaInt = BigInt(ebitda);
  const millis = BigInt(multipleMillis);
  const netDebt = BigInt(debt - cash);
  return {
    enterpriseValue: Number(api.enterprise_value_millis(ebitdaInt, millis)),
    equityValue: Number(api.equity_value_millis(ebitdaInt, millis, netDebt)),
    netDebt: Number(netDebt),
  };
}

export interface GameDate {
  year: number;
  /** 1 through 12. */
  month: number;
}

/** The state sim-core saves. Money is thousand USD. Rates are basis points. */
export interface WorldView {
  schema_version: number;
  seed: number;
  date: GameDate;
  months_elapsed: number;
  economy: { policy_rate_bps: number; neutral_rate_bps: number };
  fund: {
    committed: number;
    called: number;
    distributed: number;
    started: GameDate;
    investment_period_ends: GameDate;
    term_ends: GameDate;
  };
}

export type SimEvent = { seq: number; date: GameDate } & (
  | { type: "month_closed" }
  | { type: "quarter_closed"; quarter: number }
  | { type: "policy_rate_changed"; from_bps: number; to_bps: number }
  | { type: "investment_period_ended" }
  | { type: "fund_term_ended" }
);

/** A running game. Rules stay in sim-core; this only carries text across. */
export class GameSession {
  private constructor(private readonly inner: WasmSession) {}

  static async start(seed: number): Promise<GameSession> {
    const api = await loadSimCore();
    return new GameSession(new api.Session(BigInt(seed)));
  }

  static async resume(save: string): Promise<GameSession> {
    const api = await loadSimCore();
    return new GameSession(api.Session.load(save));
  }

  save(): string {
    return this.inner.save();
  }

  view(): WorldView {
    return JSON.parse(this.inner.save()) as WorldView;
  }

  advanceMonth(): SimEvent[] {
    return JSON.parse(this.inner.advance_month()) as SimEvent[];
  }
}
