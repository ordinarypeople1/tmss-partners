use serde::{Deserialize, Serialize};

use crate::round::{clamp_i64, mul_div};
use crate::SimError;

/// sin(2π k / 16) in thousandths. A 4-year sector wave, not a random walk.
const SIN_16: [i64; 16] = [
    0, 383, 707, 924, 1000, 924, 707, 383, 0, -383, -707, -924, -1000, -924, -707, -383,
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Drivers {
    pub gross_margin_bps: i64,
    pub sga_bps: i64,
    pub growth_bps: i64,
    pub interest_rate_bps: i64,
    pub da_rate_bps: i64,
    pub capex_bps: i64,
    pub dso_days: i64,
    pub dio_days: i64,
    pub dpo_days: i64,
    pub tax_bps: i64,
    pub dividend_payout_bps: i64,
    pub min_cash_bps: i64,
    pub amort_bps: i64,
    pub dividend_leverage_cap_millis: i64,
    pub base_multiple_millis: i64,
    pub rate_beta_millis: i64,
    pub cycle_amplitude_millis: i64,
    pub multiple_floor_millis: i64,
    pub multiple_cap_millis: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Books {
    pub period: String,
    pub revenue: i64,
    pub cogs: i64,
    pub gross_profit: i64,
    pub sga: i64,
    pub ebitda: i64,
    pub da: i64,
    pub ebit: i64,
    pub interest: i64,
    pub ebt: i64,
    pub tax: i64,
    pub net_income: i64,
    pub cash: i64,
    pub ar: i64,
    pub inv: i64,
    pub gross_ppe: i64,
    pub accum_dep: i64,
    pub net_ppe: i64,
    pub ap: i64,
    pub debt: i64,
    pub share_capital: i64,
    pub retained: i64,
    pub dividends: i64,
    pub cfo: i64,
    pub cfi: i64,
    pub cff: i64,
    pub net_change: i64,
    pub model_multiple_millis: i64,
}

impl Books {
    pub fn total_assets(&self) -> i64 {
        self.cash + self.ar + self.inv + self.net_ppe
    }

    pub fn total_liabilities(&self) -> i64 {
        self.ap + self.debt
    }

    pub fn total_equity(&self) -> i64 {
        self.share_capital + self.retained
    }
}

pub fn quality_millis(gross_margin_bps: i64) -> i64 {
    let delta = (gross_margin_bps - 3_000) * 40 / 100;
    clamp_i64(1_000 + delta, 800, 1_200)
}

pub fn model_multiple_millis(
    drivers: &Drivers,
    policy_rate_bps: i64,
    neutral_rate_bps: i64,
    quarter_index: i64,
) -> Result<i64, SimError> {
    let delta = policy_rate_bps - neutral_rate_bps;
    let bump = mul_div(drivers.rate_beta_millis, delta, 10_000)?;
    let factor = mul_div(1_000_000, 1, 1_000 + bump)?;
    let sin = SIN_16[quarter_index.rem_euclid(16) as usize];
    let cycle = 1_000 + mul_div(drivers.cycle_amplitude_millis, sin, 1_000)?;
    let quality = quality_millis(drivers.gross_margin_bps);
    let mut raw = drivers.base_multiple_millis;
    raw = mul_div(raw, factor, 1_000)?;
    raw = mul_div(raw, cycle, 1_000)?;
    raw = mul_div(raw, quality, 1_000)?;
    Ok(clamp_i64(
        raw,
        drivers.multiple_floor_millis,
        drivers.multiple_cap_millis,
    ))
}

pub struct CloseAdjust {
    pub growth_shock_bps: i64,
    pub extra_interest: i64,
    pub extra_sga: i64,
    pub asset_sale: i64,
}

impl Default for CloseAdjust {
    fn default() -> Self {
        Self {
            growth_shock_bps: 0,
            extra_interest: 0,
            extra_sga: 0,
            asset_sale: 0,
        }
    }
}

pub fn close_quarter(
    books: &Books,
    drivers: &Drivers,
    policy_rate_bps: i64,
    neutral_rate_bps: i64,
    quarter_index: i64,
    period: &str,
    adjust: &CloseAdjust,
) -> Result<Books, SimError> {
    let growth = clamp_i64(drivers.growth_bps + adjust.growth_shock_bps, -1_800, 2_200);
    let revenue = mul_div(books.revenue, 10_000 + growth, 10_000)?.max(1);
    let gross_margin = clamp_i64(drivers.gross_margin_bps, 800, 7_200);
    let sga_ratio = clamp_i64(drivers.sga_bps, 400, 4_200);
    let cogs = mul_div(revenue, 10_000 - gross_margin, 10_000)?;
    let gross_profit = revenue - cogs;
    let sga = mul_div(revenue, sga_ratio, 10_000)? + adjust.extra_sga.max(0);
    let ebitda = gross_profit - sga;
    let da = mul_div(books.net_ppe.max(0), drivers.da_rate_bps, 10_000)?;
    let ebit = ebitda - da;
    let interest = mul_div(books.debt.max(0), drivers.interest_rate_bps, 40_000)?
        + adjust.extra_interest.max(0);
    let ebt = ebit - interest;
    let tax = if ebt > 0 {
        mul_div(ebt, drivers.tax_bps, 10_000)?
    } else {
        0
    };
    let net_income = ebt - tax;

    let ar = mul_div(revenue, drivers.dso_days, 90)?;
    let inv = mul_div(cogs.max(0), drivers.dio_days, 90)?;
    let ap = mul_div(cogs.max(0), drivers.dpo_days, 90)?;
    let delta_nwc = (ar + inv - ap) - (books.ar + books.inv - books.ap);
    let capex = mul_div(revenue, drivers.capex_bps, 10_000)?;
    let sale = adjust.asset_sale.max(0).min(books.gross_ppe.max(0));
    let cash_from_ops = net_income + da - delta_nwc;
    let cash_from_investing = -capex + sale;
    let cash_before = books.cash + cash_from_ops + cash_from_investing;
    let min_cash = mul_div(revenue, drivers.min_cash_bps, 10_000)?;

    let mut amort = mul_div(books.debt.max(0), drivers.amort_bps, 10_000)?.min(books.debt.max(0));
    if cash_before - amort < min_cash {
        amort = (cash_before - min_cash).clamp(0, books.debt.max(0));
    }
    let mut draw = 0;
    if cash_before - amort < min_cash {
        draw = min_cash - (cash_before - amort);
    }
    let debt = books.debt - amort + draw;

    let mut dividend = 0;
    if net_income > 0 {
        let run_rate = (ebitda * 4).max(1);
        let leverage = mul_div(debt, 1_000, run_rate)?;
        if leverage <= drivers.dividend_leverage_cap_millis {
            let room = (cash_before - amort + draw - min_cash).max(0);
            let want = mul_div(net_income, drivers.dividend_payout_bps, 10_000)?;
            dividend = want.min(room);
        }
    }

    let cash_from_financing = draw - amort - dividend;
    let net_change = cash_from_ops + cash_from_investing + cash_from_financing;
    let cash = books.cash + net_change;
    let gross_ppe = books.gross_ppe + capex - sale;
    let accum_dep = books.accum_dep + da;
    let net_ppe = gross_ppe - accum_dep;
    let retained = books.retained + net_income - dividend;
    let next = Books {
        period: period.to_string(),
        revenue,
        cogs,
        gross_profit,
        sga,
        ebitda,
        da,
        ebit,
        interest,
        ebt,
        tax,
        net_income,
        cash,
        ar,
        inv,
        gross_ppe,
        accum_dep,
        net_ppe,
        ap,
        debt,
        share_capital: books.share_capital,
        retained,
        dividends: dividend,
        cfo: cash_from_ops,
        cfi: cash_from_investing,
        cff: cash_from_financing,
        net_change,
        model_multiple_millis: model_multiple_millis(
            drivers,
            policy_rate_bps,
            neutral_rate_bps,
            quarter_index,
        )?,
    };
    if next.total_assets() != next.total_liabilities() + next.total_equity() {
        return Err(SimError::Identity);
    }
    if next.cash != books.cash + net_change {
        return Err(SimError::Identity);
    }
    if next.retained != books.retained + net_income - dividend {
        return Err(SimError::Identity);
    }
    if next.ebitda != next.gross_profit - next.sga {
        return Err(SimError::Identity);
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drivers() -> Drivers {
        Drivers {
            gross_margin_bps: 3_000,
            sga_bps: 1_600,
            growth_bps: 80,
            interest_rate_bps: 600,
            da_rate_bps: 200,
            capex_bps: 250,
            dso_days: 42,
            dio_days: 38,
            dpo_days: 35,
            tax_bps: 2_200,
            dividend_payout_bps: 1_000,
            min_cash_bps: 800,
            amort_bps: 150,
            dividend_leverage_cap_millis: 4_000,
            base_multiple_millis: 8_000,
            rate_beta_millis: 6_000,
            cycle_amplitude_millis: 60,
            multiple_floor_millis: 4_500,
            multiple_cap_millis: 12_000,
        }
    }

    fn books() -> Books {
        Books {
            period: "2024Q4".into(),
            revenue: 4_000,
            cogs: 2_800,
            gross_profit: 1_200,
            sga: 640,
            ebitda: 560,
            da: 80,
            ebit: 480,
            interest: 40,
            ebt: 440,
            tax: 97,
            net_income: 343,
            cash: 400,
            ar: 500,
            inv: 300,
            gross_ppe: 2_000,
            accum_dep: 400,
            net_ppe: 1_600,
            ap: 280,
            debt: 1_200,
            share_capital: 800,
            retained: 520,
            dividends: 0,
            cfo: 0,
            cfi: 0,
            cff: 0,
            net_change: 0,
            model_multiple_millis: 7_500,
        }
    }

    #[test]
    fn a_quarter_keeps_the_three_identities() {
        let mut current = books();
        assert_eq!(
            current.total_assets(),
            current.total_liabilities() + current.total_equity()
        );
        for index in 0..4 {
            let next = close_quarter(
                &current,
                &drivers(),
                350,
                250,
                index,
                &format!("2025Q{}", index + 1),
                &CloseAdjust::default(),
            )
            .unwrap();
            assert_eq!(
                next.total_assets(),
                next.total_liabilities() + next.total_equity(),
                "identity {index}"
            );
            assert_eq!(next.ebitda, next.gross_profit - next.sga);
            assert_eq!(
                next.retained,
                current.retained + next.net_income - next.dividends
            );
            current = next;
        }
    }

    #[test]
    fn model_multiple_moves_with_the_rate_and_stays_inside_the_band() {
        let multiple = model_multiple_millis(&drivers(), 350, 250, 0).unwrap();
        assert!(multiple >= 4_500 && multiple <= 12_000);
        let easier = model_multiple_millis(&drivers(), 250, 250, 0).unwrap();
        assert!(easier > multiple);
    }
}
