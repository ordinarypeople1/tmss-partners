import type { Command, CommandResult, CompanyView, Offer, OfferPreview, View } from "./types";

interface WasmSession {
  save(): string;
  command(command: string): string;
  view(): string;
  company(index: number): string;
  preview_offer(index: number, offer: string): string;
  free(): void;
}

interface SimCoreModule {
  default: (input?: unknown) => Promise<unknown>;
  Session: {
    new (seed: bigint, universe: string): WasmSession;
    load(save: string): WasmSession;
  };
}

let loading: Promise<SimCoreModule> | undefined;

export function loadSimCore(): Promise<SimCoreModule> {
  if (!loading) {
    loading = import("./pkg/sim_core.js").then(async (mod) => {
      const api = mod as unknown as SimCoreModule;
      await api.default();
      return api;
    });
  }
  return loading;
}

/** A running game. Rules stay in sim-core; this only carries JSON across. */
export class GameSession {
  private constructor(private readonly inner: WasmSession) {}

  /** `universe` is the text of public/content/universe.json. */
  static async start(seed: number, universe: string): Promise<GameSession> {
    const api = await loadSimCore();
    return new GameSession(new api.Session(BigInt(seed), universe));
  }

  static async resume(save: string): Promise<GameSession> {
    const api = await loadSimCore();
    return new GameSession(api.Session.load(save));
  }

  save(): string {
    return this.inner.save();
  }

  command(command: Command): CommandResult {
    return JSON.parse(this.inner.command(JSON.stringify(command))) as CommandResult;
  }

  view(): View {
    return JSON.parse(this.inner.view()) as View;
  }

  company(index: number): CompanyView | null {
    return JSON.parse(this.inner.company(index)) as CompanyView | null;
  }

  previewOffer(index: number, offer: Offer): OfferPreview | null {
    return JSON.parse(this.inner.preview_offer(index, JSON.stringify(offer))) as OfferPreview | null;
  }
}
