export interface ClockState {
  year: number;
  quarter: number;
  week_in_quarter: number;
  absolute_week: number;
}

export interface FundSummary {
  name_ko: string;
  commitments: number;
  paid_in: number;
  uncalled: number;
  dry_powder: number;
  cash: number;
  nav: number;
  lp_nav: number;
  lp_distributed: number;
  gp_distributed: number;
  dpi_millis: number | null;
  tvpi_millis: number | null;
  moic_millis: number | null;
  irr_bps: number | null;
  reputation: number;
  fee_quarter: number;
  hurdle_bps: number;
  carry_bps: number;
  fee_bps: number;
  investment_period_years: number;
  term_years: number;
  vintage_year: number;
  fund_ii_commitments: number;
  fee_payable: number;
}

export interface NewsItem {
  id: number;
  template: string;
  week: number;
  company_id: string;
  company_ko: string;
  period: string;
  tone: string;
}

export interface AlertItem {
  template: string;
  company_id: string;
  company_ko: string;
  deal_id: string;
}

export interface Dashboard {
  clock: ClockState;
  fund: FundSummary;
  news: NewsItem[];
  alerts: AlertItem[];
  holdings: number;
  deals: number;
  seed: number;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
  dashboard?: Dashboard;
  page?: PageBody | null;
}

export type PageBody =
  | DealsPage
  | DealPage
  | CompaniesPage
  | CompanyPage
  | FundPage
  | PortfolioPage
  | DistributionPage
  | ExitPage;

export interface DealRow {
  id: string;
  company_id: string;
  legal_name_ko: string;
  sector_id: string;
  lat: number;
  lon: number;
  site_kind: string;
  stage: string;
  process: string;
  access: string;
  seller_kind: string;
  broker_ko: string;
  instrument: string;
  ask_ev: number;
  ask_size: number;
  ask_coupon_bps: number;
  weeks_left: number;
  status: string;
  competing_ev: number;
  competitor_ko: string;
  locked: boolean;
}

export interface Terms {
  instrument: string;
  bid_ev: number;
  bid_size: number;
  ownership_bps: number;
  coupon_bps: number;
  pref_millis: number;
  board_seats: number;
  covenants: boolean;
  drag: boolean;
  tag: boolean;
  earnout: number;
  debt: number;
  debt_rate_bps: number;
  covenant_lev_millis: number;
  covenant_cover_millis: number;
  si_id: string;
  si_equity: number;
  hundred_day_plan: boolean;
}

export interface DealLog {
  template: string;
  week: number;
  ev: number;
}

export interface IcVote {
  partner: string;
  yes: boolean;
  reason: string;
}

export interface DealsPage {
  kind: "deals";
  total: number;
  rows: DealRow[];
}

export interface DealPage {
  kind: "deal";
  deal: DealRow & {
    terms: Terms;
    log: DealLog[];
    ic: IcVote[];
    conditions: boolean;
  };
}

export interface CompanyRow {
  id: string;
  legal_name_ko: string;
  sector_id: string;
  region_label_ko: string;
  complex_name_ko: string;
  lat: number;
  lon: number;
  founded_year: number;
  employees: number;
  period: string;
  revenue: number;
  ebitda: number;
  model_multiple_millis: number;
  debt: number;
  cash: number;
  model_ev: number;
  model_equity: number;
  site_kind: string;
  held: boolean;
  on_market: boolean;
}

export interface CompaniesPage {
  kind: "companies";
  total: number;
  rows: CompanyRow[];
}

export interface Books {
  period: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  sga: number;
  ebitda: number;
  da: number;
  ebit: number;
  interest: number;
  ebt: number;
  tax: number;
  net_income: number;
  cash: number;
  ar: number;
  inv: number;
  gross_ppe: number;
  accum_dep: number;
  net_ppe: number;
  ap: number;
  debt: number;
  share_capital: number;
  retained: number;
  dividends: number;
  cfo: number;
  cfi: number;
  cff: number;
  net_change: number;
  model_multiple_millis: number;
}

export interface Site {
  id: string;
  kind: string;
  name_ko: string;
  lat: number;
  lon: number;
  book_value: number;
  capacity: number;
}

export interface CapRow {
  holder_ko: string;
  holder_kind: string;
  stake_bps: number;
}

export interface Manager {
  id: string;
  name_ko: string;
  role: string;
  trait_id: string;
}

export interface Position {
  instrument: string;
  ownership_bps: number;
  cost: number;
  principal: number;
  distributions: number;
  mark: number;
  moic_millis: number;
  board_seats: number;
  pending_agm: boolean;
  breached: boolean;
  entry_ev: number;
  control: boolean;
}

export interface Cleared {
  week: number;
  company_id: string;
  kind: string;
  ev: number;
  proceeds: number;
}

export interface CompanyPage {
  kind: "company";
  company: CompanyRow;
  books: Books;
  generated: Books[];
  sites: Site[];
  cap: CapRow[];
  management: Manager[];
  owner_kind: string;
  position: Position | null;
  cleared: Cleared[];
}

export interface Agent {
  id: string;
  name_ko: string;
  kind: string;
  subtype: string;
  commitment: number;
}

export interface Candidate {
  id: string;
  name_ko: string;
  trait_id: string;
}

export interface Flow {
  id: number;
  week: number;
  kind: string;
  amount: number;
  company_id: string;
}

export interface WaterfallPreview {
  lp: number;
  gp: number;
  roc: number;
  pref: number;
  catch_up_gp: number;
  residual_lp: number;
  residual_gp: number;
}

export interface FundPage {
  kind: "fund";
  summary: FundSummary;
  lps: Agent[];
  flows: Flow[];
  preview: WaterfallPreview;
  sis: Agent[];
  lenders: Agent[];
  candidates: Candidate[];
  fund_ii_ready: boolean;
}

export interface HoldingRow {
  company_id: string;
  legal_name_ko: string;
  instrument: string;
  ownership_bps: number;
  cost: number;
  distributions: number;
  mark: number;
  moic_millis: number;
  board_seats: number;
  pending_agm: boolean;
  breached: boolean;
  action_used: boolean;
  control: boolean;
}

export interface PortfolioPage {
  kind: "portfolio";
  rows: HoldingRow[];
  candidates: Candidate[];
}

export interface DistributionPage {
  kind: "distribution";
  lp: number;
  gp: number;
  roc: number;
  pref: number;
  catch_up_gp: number;
  residual_lp: number;
  residual_gp: number;
}

export interface ExitPage {
  kind: "exit";
  proceeds: number;
  ev: number;
  moic_millis: number;
}

export type Route =
  | { name: "home" }
  | { name: "deals" }
  | { name: "deal"; id: string }
  | { name: "companies" }
  | { name: "company"; id: string }
  | { name: "fund" }
  | { name: "portfolio" };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  const [name, id] = path.split("/");
  if (name === "deal" && id) return { name: "deal", id: decodeURIComponent(id) };
  if (name === "company" && id) return { name: "company", id: decodeURIComponent(id) };
  if (name === "deals" || name === "companies" || name === "fund" || name === "portfolio") {
    return { name };
  }
  return { name: "home" };
}
