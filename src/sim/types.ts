/**
 * What sim-core hands the screen. Money is thousand USD. `_bps` is basis
 * points (10 000 = 1.0), `_millis` is thousandths (7 200 = 7.2x).
 * These mirror crates/sim-core/src/view.rs; rules stay in Rust.
 */

export interface GameDate {
  year: number;
  /** 1 through 12. */
  month: number;
}

/** [low, high]. Equal when the player has earned the real figure. */
export type Figure = [number, number];

export type Phase = "expansion" | "slowdown" | "recession" | "recovery";
export type Rank = "vice_president" | "principal" | "partner" | "founder";
export type Stage = "preparing" | "marketing" | "bidding" | "exclusive";
export type SaleReason = "retirement" | "succession" | "fund_exit" | "non_core" | "distress";
export type DdStream = "financial" | "commercial" | "operational" | "legal";
export type IssueKind =
  | "inventory_overstated"
  | "customer_concentration"
  | "deferred_maintenance"
  | "environmental_liability"
  | "key_person"
  | "labor_dispute";
export type InitiativeKind =
  | "pricing_review"
  | "procurement"
  | "lean_program"
  | "sales_expansion"
  | "headcount_reduction"
  | "management_change"
  | "sale_leaseback"
  | "working_capital";
export type ExitRoute = "strategic" | "secondary" | "ipo";
export type Choice =
  | "accept"
  | "decline"
  | "cure"
  | "waiver"
  | "ignore"
  | "settle"
  | "hold_out"
  | "report_now"
  | "report_later";
export type Stance = "for" | "hold" | "against";
export type Concern =
  | "leverage"
  | "price"
  | "interest_cover"
  | "no_financial_dd"
  | "no_commercial_dd"
  | "no_operational_dd"
  | "no_legal_dd"
  | "inventory_days"
  | "thin_returns"
  | "multiple_reliance"
  | "downside"
  | "no_plan"
  | "layoffs_in_union_shop"
  | "fund_concentration"
  | "open_issue";
export type IcOutcome = "approved" | "held" | "rejected";

export const DD_STREAMS: DdStream[] = ["financial", "commercial", "operational", "legal"];
export const INITIATIVES: InitiativeKind[] = [
  "pricing_review",
  "procurement",
  "lean_program",
  "sales_expansion",
  "headcount_reduction",
  "management_change",
  "sale_leaseback",
  "working_capital",
];

export type Owner =
  | { kind: "founder"; age: number }
  | { kind: "sponsor"; house: number; months_held: number }
  | { kind: "corporate" }
  | { kind: "player" }
  | { kind: "lender" }
  | { kind: "merged" };

export type Bidder = { kind: "house"; house: number } | { kind: "strategic" } | { kind: "player" };

export interface SaleView {
  stage: Stage;
  months_left: number;
  reason: SaleReason;
  /** Empty until the teaser is out. */
  rivals: Bidder[];
  bid_in: boolean;
}

export interface CompanyRow {
  /** Index sim-core commands take. */
  i: number;
  id: string;
  name: string;
  sector: string;
  admin1: string;
  lat: number;
  lon: number;
  owner: Owner;
  founded: number;
  employees: number;
  /** 0 through 100. */
  relationship: number;
  watched: boolean;
  held: boolean;
  in_deal: boolean;
  revealed: boolean;
  sale: SaleView | null;
  /** Trailing twelve months. */
  revenue: Figure;
  ebitda: Figure;
  /** Model value. Not a price. */
  ev: Figure;
  alert: boolean;
  exiting: boolean;
}

export interface MonthResult {
  revenue: number;
  cogs: number;
  sga: number;
  ebitda: number;
  da: number;
  interest: number;
  tax: number;
  net_income: number;
  change_in_nwc: number;
  capex: number;
  debt_draw: number;
  debt_repayment: number;
  dividends: number;
  opening_cash: number;
  closing_cash: number;
}

export interface Books {
  cash: number;
  accounts_receivable: number;
  inventory: number;
  gross_ppe: number;
  accumulated_depreciation: number;
  goodwill: number;
  accounts_payable: number;
  debt: number;
  share_capital: number;
  retained_earnings: number;
}

export interface Financials {
  last: MonthResult;
  books: Books;
  net_ppe: number;
  total_assets: number;
  total_equity: number;
  ttm_revenue: number;
  ttm_ebitda: number;
  ttm_fcf: number;
  margin_bps: number;
  gross_margin_bps: number;
  /** Structural monthly revenue growth. */
  growth_bps: number;
  net_debt: number;
  leverage_millis: number;
  cover_millis: number;
  interest_rate_bps: number;
  multiple_millis: number;
  quality_bps: number;
  model_ev: number;
  model_equity: number;
  min_cash: number;
  /** Monthly, oldest first, up to 36. */
  revenue_history: number[];
  ebitda_history: number[];
  fcf_history: number[];
}

export interface Offer {
  ev: number;
  senior_millis: number;
  mezz_millis: number;
  rollover_bps: number;
  plan: InitiativeKind[];
}

export interface Financing {
  ebitda: number;
  senior: number;
  mezz: number;
  debt: number;
  fees: number;
  rollover: number;
  equity: number;
  ownership_bps: number;
  spread_bps: number;
  annual_interest: number;
  leverage_millis: number;
  cover_millis: number;
  price_to_model_bps: number;
  multiple_millis: number;
}

export interface Returns {
  exit_ebitda: number;
  exit_ev: number;
  exit_net_debt: number;
  proceeds: number;
  moic_millis: number;
  irr_bps: number;
  from_ebitda: number;
  from_multiple: number;
  from_debt: number;
}

export interface OfferPreview {
  financing: Financing;
  returns: Returns;
}

export interface Vote {
  /** Seat 0 through 5, in the order of docs/personas. */
  partner: number;
  stance: Stance;
  concerns: Concern[];
}

export interface Committee {
  outcome: IcOutcome;
  votes: Vote[];
  date: GameDate;
}

export interface DealView {
  opened: GameDate;
  streams_done: DdStream[];
  streams_running: DdStream[];
  costs: number;
  diligence_cost: number;
  offer: Offer | null;
  preview: OfferPreview | null;
  committee: Committee | null;
  bid_submitted: boolean;
  certainty_bps: number;
  can_roll: boolean;
}

export interface Budget {
  /** Share of monthly revenue, 0 to 500. */
  growth_bps: number;
  /** Share of monthly revenue, 0 to 300. */
  efficiency_bps: number;
  /** Percent of cash above the floor that repays debt. */
  sweep_pct: number;
  /** Percent of what is left that is paid out. */
  dividend_pct: number;
}

export interface Mark {
  month: number;
  ebitda: number;
  ev: number;
  net_debt: number;
  equity: number;
}

export interface HoldingView {
  acquired: GameDate;
  months_held: number;
  entry_ev: number;
  entry_ebitda: number;
  entry_multiple_millis: number;
  entry_net_debt: number;
  entry_equity: number;
  cost: number;
  ownership_bps: number;
  dividends: number;
  /** The fund's share of model equity. A mark, not a price. */
  value: number;
  moic_millis: number;
  irr_bps: number | null;
  /** Where the gain over entry equity comes from. */
  bridge: { ebitda: number; multiple: number; debt: number };
  max_leverage_millis: number;
  min_cover_millis: number;
  maturity: GameDate;
  breaches: number;
  waiver_quarters: number;
  strike: boolean;
  plan: InitiativeKind[];
  initiatives: { kind: InitiativeKind; months_left: number }[];
  done: InitiativeKind[];
  available: { kind: InitiativeKind; months: number; cost: number; planned: boolean }[];
  exit: { route: ExitRoute; months_left: number; offer_ev: number | null } | null;
  marks: Mark[];
  add_ons: number;
  /** Company indices that can be bolted on today. */
  add_on_targets: number[];
  budget: Budget;
  shortfall: boolean;
}

export interface CompanyView extends CompanyRow {
  site_name: string;
  country: string;
  sector_multiple_millis: number;
  union_strength_bps: number;
  /** 1 through 20. Null until operational diligence. */
  management: number | null;
  /** Null until commercial diligence. */
  customer_concentration_bps: number | null;
  issues: { kind: IssueKind; severity_bps: number; found: boolean; triggered: boolean }[];
  financials?: Financials;
  deal?: DealView;
  holding?: HoldingView;
}

export type MessageBody =
  | { type: "welcome" }
  | { type: "rate_changed"; from_bps: number; to_bps: number }
  | { type: "phase_changed"; from: Phase; to: Phase }
  | { type: "sale_early_notice"; reason: SaleReason }
  | { type: "sale_started"; reason: SaleReason }
  | { type: "sale_withdrawn" }
  | { type: "sale_failed" }
  | { type: "rival_deal"; buyer: Bidder; ev: number }
  | { type: "auction_lost"; winner: Bidder; ev: number }
  | { type: "diligence_report"; stream: DdStream; found: IssueKind[] }
  | { type: "committee_decision"; outcome: IcOutcome }
  | { type: "deal_closed"; ev: number; equity: number; debt: number }
  | { type: "deal_broken" }
  | { type: "initiative_done"; kind: InitiativeKind }
  | { type: "issue_surfaced"; issue: IssueKind }
  | { type: "strike" }
  | { type: "covenant_breach"; leverage_millis: number; max_leverage_millis: number; cover_millis: number; cure: number }
  | { type: "lenders_took_keys" }
  | { type: "refinanced"; spread_bps: number }
  | { type: "recap_paid"; amount: number }
  | { type: "add_on_closed"; target: string; price: number; from_fund: number }
  | { type: "exit_offer"; route: ExitRoute; ev: number; proceeds: number }
  | { type: "exit_pulled"; route: ExitRoute }
  | {
      type: "exit_closed";
      route: ExitRoute;
      buyer: Bidder;
      ev: number;
      proceeds: number;
      moic_millis: number;
      irr_bps: number | null;
    }
  | { type: "proceeds_received"; amount: number }
  | { type: "quarter_report"; nav: number; tvpi_millis: number }
  | { type: "investment_period_ended" }
  | { type: "fund_term_ended"; tvpi_millis: number; carry: number }
  | { type: "next_fund"; committed: number; own_house: boolean }
  | { type: "promotion"; rank: Rank }
  | { type: "fired" };

export type Message = MessageBody & {
  id: number;
  date: GameDate;
  /** Market news rather than something addressed to the player. */
  news: boolean;
  /** Company index, when the message is about one. */
  company: number | null;
  read: boolean;
  decision: { options: Choice[]; due_month: number; chosen: Choice | null } | null;
};

export interface SectorView {
  id: string;
  cycle_bps: number;
  amplitude_bps: number;
  /** Median model multiple in the sector. */
  multiple_millis: number;
  companies: number;
  revenue: number;
  for_sale: number;
}

export interface Realized {
  company: string;
  acquired: GameDate;
  exited: GameDate;
  route: ExitRoute | null;
  cost: number;
  proceeds: number;
  moic_millis: number;
  irr_bps: number | null;
}

export interface View {
  date: GameDate;
  /** Months since the game opened. */
  month: number;
  seed: number;
  house: "poiesis" | "own";
  career: {
    rank: Rank;
    reputation: number;
    months_at_rank: number;
    deals_closed: number;
    exits: number;
    best_moic_millis: number;
    wealth: number;
    carry_share_bps: number;
    carry_accrued: number;
    carry_paid: number;
    salary: number;
    fired: boolean;
  };
  attention: { left: number; max: number };
  limits: { deals: number; initiatives: number };
  economy: {
    policy_rate_bps: number;
    neutral_rate_bps: number;
    phase: Phase;
    phase_months: number;
    credit_spread_bps: number;
    /** 100 is a normal market. */
    valuation_index: number;
    max_senior_millis: number;
    max_mezz_millis: number;
    senior_rate_bps: number;
    mezz_rate_bps: number;
    history: { policy_rate_bps: number; credit_spread_bps: number; valuation_index: number }[];
    sectors: SectorView[];
  };
  fund: {
    name: string;
    committed: number;
    called: number;
    uncalled: number;
    distributed: number;
    fees_paid: number;
    deal_costs: number;
    invested: number;
    pending: number;
    nav: number;
    dpi_millis: number;
    tvpi_millis: number;
    irr_bps: number | null;
    carry: number;
    investing: boolean;
    started: GameDate;
    investment_period_ends: GameDate;
    term_ends: GameDate;
    concentration_limit: number;
    realized: Realized[];
  };
  market: { companies: number; live: number; visible: number };
  rivals: string[];
  companies: CompanyRow[];
  /** Company indices with an open deal file. */
  deals: number[];
  messages: Message[];
}

export type Command =
  | { type: "advance_month" }
  | { type: "watch"; company: number; on: boolean }
  | { type: "meet_owner"; company: number }
  | { type: "sign_nda"; company: number }
  | { type: "run_diligence"; company: number; stream: DdStream }
  | { type: "set_offer"; company: number; offer: Offer }
  | { type: "submit_ic"; company: number }
  | { type: "submit_bid"; company: number }
  | { type: "propose_exclusive"; company: number }
  | { type: "drop_deal"; company: number }
  | { type: "set_budget"; company: number; budget: Budget }
  | { type: "start_initiative"; company: number; kind: InitiativeKind }
  | { type: "add_on"; platform: number; target: number }
  | { type: "dividend_recap"; company: number; amount: number }
  | { type: "equity_cure"; company: number; amount: number }
  | { type: "start_exit"; company: number; route: ExitRoute }
  | { type: "decide"; message: number; choice: Choice }
  | { type: "mark_read"; message: number }
  | { type: "mark_all_read" };

/** `error` is a code from sim-core's CommandError, e.g. "no_attention". */
export type CommandResult = { ok: true } | { ok: false; error: string };
