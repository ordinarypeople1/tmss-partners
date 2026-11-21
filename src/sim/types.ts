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
export type SaleReason = "retirement" | "succession" | "fund_exit" | "non_core" | "distress" | "strategic_review";
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
  | "report_later"
  /** The two options of an `event` message; the catalog names them per event. */
  | "first"
  | "second";
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

export type Trait =
  | "single_plant"
  | "long_term_contracts"
  | "aging_equipment"
  | "brand_strength"
  | "family_workforce"
  | "export_heavy"
  | "recurring_revenue"
  | "fragmented_market"
  | "seasonal_demand"
  | "proprietary_process"
  | "underinvested_sales"
  | "regulated_customers";
export type CeoStyle = "operator" | "seller" | "engineer" | "financier" | "patriarch";
/** How an owner behaves across the table. */
export type SellerStance = "sentimental" | "price_maximizer" | "hurried" | "balanced";
export type EventKind =
  | "earnout_dispute"
  | "team_poaching"
  | "plant_outage"
  | "customer_renegotiation"
  | "cost_shock"
  | "cyber_incident"
  | "incentive_plan"
  | "repricing_window"
  | "co_invest_request";
export type LpKind = "public_pension" | "endowment" | "family_office" | "fund_of_funds" | "insurer";
export type ObjectiveKind =
  | "close_deals"
  | "deploy_capital"
  | "build_relationships"
  | "finish_initiatives"
  | "clean_covenants"
  | "exit_count"
  | "no_rejections";
export type Achievement =
  | "first_close"
  | "first_exit"
  | "double_up"
  | "triple_up"
  | "home_run"
  | "quick_flip"
  | "roll_up"
  | "clean_sheet"
  | "turnaround"
  | "comeback_kid"
  | "proprietary"
  | "auction_winner"
  | "recession_buyer"
  | "big_game"
  | "dealmaker"
  | "networker"
  | "fully_invested"
  | "distributor"
  | "top_of_the_table"
  | "made_principal"
  | "made_partner"
  | "own_name"
  | "cross_border"
  | "take_private";
export const ACHIEVEMENTS: Achievement[] = [
  "first_close",
  "first_exit",
  "double_up",
  "triple_up",
  "home_run",
  "quick_flip",
  "roll_up",
  "clean_sheet",
  "turnaround",
  "comeback_kid",
  "proprietary",
  "auction_winner",
  "recession_buyer",
  "big_game",
  "dealmaker",
  "networker",
  "fully_invested",
  "distributor",
  "top_of_the_table",
  "made_principal",
  "made_partner",
  "own_name",
  "cross_border",
  "take_private",
];
/** How the owner knows the player: relationship 0, 1–39, 40–59, 60+. */
export type Access = "stranger" | "acquainted" | "trusted" | "confidant";
/** What the owner says about selling, once relationship reaches 20. */
export type Intent = "closed" | "thinking" | "open" | "eager";
/** The one thing worth doing at a company now. The sim decides it; screens only show it. */
export type Step =
  | "meet"
  | "approach"
  | "propose_exclusive"
  | "sign_nda"
  | "diligence"
  | "offer"
  | "committee"
  | "indicate"
  | "value"
  | "bid"
  | "raise"
  | "wait"
  | "operate";
/** Why the step cannot be taken yet. */
export type Block =
  | "no_attention"
  | "cross_border_locked"
  | "too_many_deals"
  | "owner_not_ready"
  | "board_only"
  | "reports_due"
  | "not_bidding_yet"
  | "bid_in"
  | "committee_held"
  | "investment_period_over"
  | "not_invited"
  | "first_round_closed"
  | "awaiting_shortlist"
  | "valuation_due"
  | "committee_scheduled"
  | "owner_considering";
export type Difficulty = "relaxed" | "standard" | "hard";
export type Era = "high_rates" | "cheap_money" | "late_cycle";
export interface Options {
  difficulty: Difficulty;
  era: Era;
}
export type Perk = "industry_club" | "conference_circuit";

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
  /** Listed. No quoted price; a price appears only if someone takes it private. */
  | { kind: "public" }
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
  /** The last month of bidding: rivals may have raised, and a bid already in may be raised. */
  final_round: boolean;
  /** Where the player's bid stands, once the final round opens. `lead` is the best rival bid as a range. */
  standing: { rank: number; bidders: number; lead: Figure } | null;
  my_bid: number | null;
  /** The most the player may bid without going back to the committee (approved price + 5%). 0 without approval. */
  bid_ceiling: number;
  /** The bank running the sale, an index into `view.advisers`. Null in talks the owner holds alone. */
  adviser: number | null;
  /** Whether the teaser went to every buyer or to a short list. */
  format: "broad" | "targeted";
  /** What the teaser calls the company. */
  codename: string;
  /** Whether the bank would send the player the teaser. Without it the NDA is refused. */
  invited: boolean;
  /** 0 talks alone, 1 teaser to indications, 2 shortlist to binding bids. */
  round: 0 | 1 | 2;
  /** Whether the player went through to round two. Null until round one closes. */
  shortlisted: boolean | null;
  /** Bidders the bank takes into round two. */
  seats: number;
  /** Round one closed without the player: the sale can only be watched. */
  first_round_closed: boolean;
}

export interface Adviser {
  name: string;
  tier: "bulge" | "boutique" | "regional";
  focus: string | null;
  /** 0 to 100: how well the bank knows the fund. */
  coverage: number;
  /** The banker who covers the fund there. */
  banker: { name: string; feminine: boolean };
}

export interface CompanyRow {
  /** Index sim-core commands take. */
  i: number;
  id: string;
  name: string;
  /** A rival house has proposed to the owner; null when there is none or the owner would not tell the player. */
  suitor: { house: number; months_left: number } | null;
  /** The name without its legal form, for lists and tables. */
  short: string;
  sector: string;
  admin1: string;
  /** "US" is home. Deals elsewhere need the rank of principal. */
  country: string;
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
  /** The mark on a holding, the range of an ordered valuation, or null. */
  ev: Figure | null;
  alert: boolean;
  exiting: boolean;
  access: Access;
  /** Null until the owner knows the player a little (relationship 20), and for holdings. */
  intent: Intent | null;
  /** What to do here now, and what stands in the way. Labels: t(`step.${step}`), t(`block.${block}`). */
  next: { step: Step; block: Block | null };
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
  /** The model's numbers: only on the fund's own holdings. */
  multiple_millis: number | null;
  quality_bps: number | null;
  model_ev: number | null;
  model_equity: number | null;
  min_cash: number;
  /** Monthly, oldest first, up to 36. */
  revenue_history: number[];
  ebitda_history: number[];
  fcf_history: number[];
  statements: Statements;
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
  valuation: Valuation | null;
  valuation_order: ValuationKind | null;
  /** The committee booked for next month, or sitting now. */
  ic_meeting: IcMeeting | null;
  /** The last meeting, with its questions and answers. */
  ic_record: IcMeeting | null;
  /** Reports the committee wants in before a bid. */
  ic_conditions: DdStream[];
  /** Figures the partners quote, for the offer on the table. */
  ic_facts: IcFacts | null;
  costs: number;
  diligence_cost: number;
  offer: Offer | null;
  preview: OfferPreview | null;
  committee: Committee | null;
  bid_submitted: boolean;
  certainty_bps: number;
  can_roll: boolean;
  /** Investors take a fifth of the equity alongside the fund. */
  coinvest: boolean;
  approved_ev: number;
  /** The non-binding indication given in round one, as an enterprise value. */
  indication: number | null;
  /** Diligence that can be ordered now: the memorandum supports two streams, the data room the rest. */
  open_streams: DdStream[];
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
  /** `months` is the full length; `months_left` counts down. */
  initiatives: { kind: InitiativeKind; months_left: number; months: number }[];
  done: InitiativeKind[];
  available: { kind: InitiativeKind; months: number; cost: number; planned: boolean }[];
  exit: { route: ExitRoute; months_left: number; months: number; offer_ev: number | null } | null;
  marks: Mark[];
  add_ons: number;
  /** Company indices that can be bolted on today. */
  add_on_targets: number[];
  budget: Budget;
  shortfall: boolean;
}

export interface CompanyView extends CompanyRow {
  site_name: string;
  /**
   * An unsolicited proposal to an owner who is not selling (`approach_owner`, 1 attention, relationship 60+).
   * `odds_pct` is the chance it opens four months of exclusive talks; null below 60. A refusal sets
   * `cooldown` to 12 months. The thresholds are the relationship levels that unlock things.
   */
  approach: { odds_pct: number | null; cooldown: number; known_at: number; early_notice_at: number; proposal_at: number };
  /** The senior executive who takes the fund's first meetings. */
  executive: { name: string; feminine: boolean; role: "cfo" | "coo" | "strategy" };
  /** The player's proposal while the owner thinks it over. */
  pending: { kind: "acquisition" | "exclusive"; months_left: number } | null;
  sector_multiple_millis: number;
  union_strength_bps: number;
  /** 1 through 20. Null until operational diligence. */
  management: number | null;
  /** Null until commercial diligence. */
  customer_concentration_bps: number | null;
  /** `stream` is the diligence that finds this kind of issue. */
  issues: { kind: IssueKind; stream: DdStream; severity_bps: number; found: boolean; triggered: boolean }[];
  /** One trait is public; the rest come with the NDA. Each changes a rule (see docs/gdd/systems.md). */
  traits: Trait[];
  traits_hidden: number;
  /** Index 0–5 into the sector's product lines: catalog key `product.<sector>.<n>`. */
  product: number;
  /** `style` is null until the player has met the owner or signed an NDA. */
  ceo: { name: string; age: number; tenure: number; founder: boolean; feminine: boolean; style: CeoStyle | null };
  /** Null until relationship 40 or an NDA. */
  stance: SellerStance | null;
  financials?: Financials;
  deal?: DealView;
  holding?: HoldingView;
}

export type MessageBody =
  | { type: "welcome" }
  | { type: "rate_changed"; from_bps: number; to_bps: number }
  | { type: "phase_changed"; from: Phase; to: Phase }
  | { type: "sale_early_notice"; reason: SaleReason }
  | { type: "owner_opened"; reason: SaleReason }
  | { type: "owner_declined" }
  | { type: "teaser_received"; adviser: number; format: "broad" | "targeted" }
  | { type: "shortlisted"; bidders: number }
  | { type: "not_shortlisted" }
  | { type: "bank_pitch"; adviser: number }
  | { type: "rival_approach"; house: number }
  | { type: "lost_to_rival"; house: number; ev: number }
  | { type: "rival_rebuffed"; house: number }
  | { type: "house_fundraised"; house: number; size: number }
  | { type: "house_partner_left"; house: number }
  | { type: "house_distress"; house: number }
  | { type: "owner_succeeded"; from: string; to: string }
  | { type: "ceo_moved"; name: string; from: string }
  | { type: "sale_started"; reason: SaleReason }
  | { type: "sale_withdrawn" }
  | { type: "sale_failed" }
  | { type: "rival_deal"; buyer: Bidder; ev: number }
  | { type: "auction_lost"; winner: Bidder; ev: number }
  | { type: "final_round"; rank: number; bidders: number }
  | { type: "regulator_blocked" }
  | { type: "event"; event: EventKind; amount: number }
  | { type: "achievement_unlocked"; achievement: Achievement }
  | { type: "objectives_review"; met: number; total: number; bonus: number }
  | { type: "diligence_report"; stream: DdStream; found: IssueKind[] }
  | { type: "committee_decision"; outcome: IcOutcome }
  | { type: "valuation_ready"; kind: ValuationKind }
  | { type: "committee_convened" }
  | { type: "owner_considering"; months: number }
  | { type: "bank_feedback"; band: "leading" | "close" | "behind"; certainty: boolean }
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
    /** What owners say about the player to each other, −40 to 40. It moves meeting gains and proposal odds. */
    street: number;
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
    /** Founder only: each associate adds a point of attention and costs $400K a year. */
    associates: number;
    /** The player's own money in the fund; it returns at the fund's multiple. */
    gp_commit: number;
    perks: Perk[];
  };
  options: Options;
  /** Months of sector research left, by sector index (same order as economy.sectors). */
  insight: number[];
  /** All nine houses by gross multiple, best first. `house` null is the player's fund. */
  league: {
    rank: number;
    house: number | null;
    deals: number;
    exits: number;
    invested: number;
    returned: number;
    held: number;
    multiple_millis: number;
  }[];
  /** Trust per committee seat, 0–100. At 70 a doubt passes; at 30 a doubt becomes a no. */
  partners: { trust: number }[];
  /** Investors. Satisfaction decides what they commit to the next fund. */
  lps: { kind: LpKind; share_bps: number; satisfaction: number }[];
  next_fund_estimate: number;
  /** This year's objectives from the chair. `clean_covenants` and `no_rejections` are met while progress is 0. */
  objectives: { kind: ObjectiveKind; target: number; progress: number; met: boolean }[];
  achievements: { achievement: Achievement; month: number }[];
  records: {
    best_moic_millis: number;
    fastest_exit_months: number;
    largest_deal_ev: number;
    largest_exit_proceeds: number;
    total_proceeds: number;
  };
  attention: { left: number; max: number };
  /** What an outside valuation costs this house. */
  valuation_fee: number;
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
  /** The sell-side banks. */
  advisers: Adviser[];
  /** The last coverage meeting, for the banker's lines. */
  cover_talk: CoverTalk | null;
  /** Coverage that puts the fund on targeted lists, earns favour at the shortlist, and earns a call before the teaser. */
  coverage_marks: [number, number, number];
  companies: CompanyRow[];
  /** Company indices with an open deal file. */
  deals: number[];
  messages: Message[];
}

export type Command =
  | { type: "advance_month" }
  | { type: "watch"; company: number; on: boolean }
  | { type: "meet_owner"; company: number }
  | { type: "approach_owner"; company: number }
  | { type: "submit_indication"; company: number; ev: number }
  | { type: "cover_bank"; adviser: number }
  | { type: "sign_nda"; company: number }
  | { type: "run_diligence"; company: number; stream: DdStream }
  | { type: "order_valuation"; company: number; kind: ValuationKind }
  | { type: "answer_ic"; company: number; answer: IcAnswer }
  | { type: "set_offer"; company: number; offer: Offer }
  | { type: "submit_ic"; company: number }
  | { type: "submit_bid"; company: number }
  | { type: "raise_bid"; company: number; ev: number }
  | { type: "research_sector"; sector: number }
  | { type: "hire_associate" }
  | { type: "release_associate" }
  | { type: "commit_personal"; amount: number }
  | { type: "buy_perk"; perk: Perk }
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

/** One period of the three statements, from `World::view`. Amounts are thousand USD. */
export interface StatementPeriod {
  year: number;
  /** 1–4 for a quarter; 0 for a fiscal year. */
  quarter: number;
  months: number;
  income: Record<"revenue" | "cogs" | "gross_profit" | "sga" | "ebitda" | "da" | "ebit" | "interest" | "ebt" | "tax" | "net_income", number>;
  balance: Record<
    | "cash" | "receivables" | "inventory" | "net_ppe" | "goodwill" | "total_assets"
    | "payables" | "debt" | "total_liabilities" | "share_capital" | "retained_earnings" | "total_equity",
    number
  >;
  cashflow: Record<
    | "net_income" | "da" | "change_in_nwc" | "operating" | "capex" | "free_cash_flow"
    | "debt_net" | "dividends" | "other" | "net_change" | "closing_cash",
    number
  >;
}

export interface Statements {
  /** Up to five fiscal years, oldest first. */
  years: StatementPeriod[];
  ltm: StatementPeriod | null;
  /** The last eight closed quarters, oldest first. */
  quarters: StatementPeriod[];
}

export type ValuationKind = "internal" | "adviser";

/** The fund's own view of value, from `valuation.rs`. */
export interface Valuation {
  kind: ValuationKind;
  date: GameDate;
  low: number;
  mid: number;
  high: number;
  error_bps: number;
  ebitda: number;
  multiple_millis: number;
  /** The adviser's sector comparables; 0 for a desk valuation. */
  sector_multiple_millis: number;
  net_debt: number;
  fee: number;
}

/** A committee question's subject: one of the partner's concerns, or a routine one. */
export type IcTopic = { concern: Concern } | "exit" | "value_creation" | "cycle";
export type IcAnswer = "evidence" | "concede" | "push_back";

export interface IcQuestion {
  partner: number;
  topic: IcTopic;
  answer: IcAnswer | null;
  landed: boolean | null;
}

/** The committee as a meeting, from `ic.rs`. */
export interface IcMeeting {
  date: GameDate;
  open: boolean;
  questions: IcQuestion[];
  cut_bps: number;
  conditions: DdStream[];
}

export interface IcFacts {
  ev: number;
  leverage_millis: number;
  cover_millis: number;
  multiple_millis: number;
  price_bps: number | null;
  irr_bps: number;
  equity: number;
  limit: number;
  missing: DdStream[];
  issues: IssueKind[];
  plan: number;
  union_bps: number;
  phase: Phase;
}

export type CoverLine =
  | { kind: "market"; phase: Phase }
  | { kind: "credit"; spread_bps: number }
  | { kind: "sector"; sector: string; months: number }
  | { kind: "rival"; house: number; sector: string }
  | { kind: "pipeline"; company: string; months: number }
  | { kind: "reputation"; good: boolean };

export interface CoverTalk {
  adviser: number;
  before: number;
  after: number;
  lines: CoverLine[];
}
