export interface IncomeStatement {
  revenue: number;
  cogs: number;
  gross_profit: number;
  sga: number;
  ebitda: number;
  da: number;
  ebit: number;
  interest_expense: number;
  ebt: number;
  tax: number;
  net_income: number;
}

export interface BalanceSheet {
  cash: number;
  accounts_receivable: number;
  inventory: number;
  gross_ppe: number;
  accumulated_depreciation: number;
  net_ppe: number;
  total_assets: number;
  accounts_payable: number;
  debt: number;
  total_liabilities: number;
  share_capital: number;
  retained_earnings: number;
  total_equity: number;
}

export interface CashFlowStatement {
  net_income: number;
  da: number;
  change_in_nwc: number;
  cash_from_operations: number;
  capex: number;
  cash_from_investing: number;
  debt_draw: number;
  debt_repayment: number;
  dividends: number;
  cash_from_financing: number;
  net_change_in_cash: number;
  opening_cash: number;
  closing_cash: number;
}

export interface Quarter {
  period: string;
  model_multiple: number;
  income: IncomeStatement;
  balance: BalanceSheet;
  cashflow: CashFlowStatement;
}

export interface Company {
  id: string;
  name_ko: string;
  legal_name_ko: string;
  sector_id: string;
  sector_label_ko: string;
  region_label_ko: string;
  complex_name_ko: string;
  lat: number;
  lon: number;
  founded_year: number;
  employees: number;
  identity: {
    fictional: boolean;
    ticker: null;
    real_address: boolean;
    coordinate_precision: string;
  };
  quarters: Quarter[];
}

export interface ContentDocument {
  schema_version: number;
  generator: string;
  seed: number;
  unit: "krw_million";
  unit_label_ko: string;
  placeholder_parameters: true;
  fitted_to_real_filings: false;
  price_policy: string;
  companies: Company[];
}
