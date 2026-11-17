interface SimCoreModule {
  default: (input?: unknown) => Promise<unknown>;
  enterprise_value_millis: (ebitda: bigint, multipleMillis: bigint) => bigint;
  equity_value_millis: (ebitda: bigint, multipleMillis: bigint, netDebt: bigint) => bigint;
  boot_game: (json: string) => string;
  game_command: (json: string) => string;
  export_game: () => string;
  import_game: (json: string) => string;
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
