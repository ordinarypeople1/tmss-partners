//! The opening universe the content generator writes. sim-core reads it once
//! to start a game; after that the save file carries everything.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;

pub const UNIVERSE_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Deserialize)]
pub struct Universe {
    pub schema_version: u32,
    pub opens: GameDate,
    pub industries: Vec<Industry>,
    pub companies: Vec<CompanySeed>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Industry {
    pub sector_id: String,
    pub monthly_growth_bps: i64,
    pub monthly_growth_std_bps: i64,
    pub monthly_da_rate_bps: i64,
    pub capex_ratio_bps: i64,
    pub interest_spread_bps: i64,
    pub tax_rate_bps: i64,
    pub dso_days: i64,
    pub dio_days: i64,
    pub dpo_days: i64,
    pub min_cash_to_revenue_bps: i64,
    pub dividend_payout_bps: i64,
    pub dividend_leverage_cap_millis: i64,
    pub base_multiple_millis: i64,
    pub rate_beta_millis: i64,
    pub cycle_amplitude_bps: i64,
    pub multiple_floor_millis: i64,
    pub multiple_cap_millis: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CompanySeed {
    pub id: String,
    pub legal_name: String,
    pub sector_id: String,
    pub country: String,
    pub admin1: String,
    pub site_name: String,
    pub lat: f64,
    pub lon: f64,
    pub founded_year: i32,
    pub employees: i64,
    pub union_strength_bps: i64,
    pub base_multiple_millis: i64,
    pub gross_margin_bps: i64,
    pub sga_ratio_bps: i64,
    pub monthly_revenue: i64,
    pub cash: i64,
    pub accounts_receivable: i64,
    pub inventory: i64,
    pub gross_ppe: i64,
    pub accumulated_depreciation: i64,
    pub accounts_payable: i64,
    pub debt: i64,
    pub share_capital: i64,
    pub retained_earnings: i64,
}
