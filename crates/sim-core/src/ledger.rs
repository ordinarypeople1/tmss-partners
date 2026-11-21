//! Quarterly financial statements. The simulation runs by the month; the
//! ledger closes a quarter every three months, and the view adds quarters up
//! into fiscal years (calendar years) and the last twelve months.
//!
//! A company arrives with five years of history. The history is built
//! backwards from the opening balance sheet so that every quarter obeys the
//! same identities as a simulated one: assets equal liabilities plus equity,
//! and closing cash equals opening cash plus the quarter's cash flows.

use serde::{Deserialize, Serialize};

use crate::company::{Books, Company, MonthResult};
use crate::content::Industry;
use crate::math::{div_round, mul_bps};
use crate::rng::Rng;

/// Quarters kept: six years, so five full fiscal years are always on hand.
pub const LEDGER_QUARTERS: usize = 24;
/// Fiscal years of history a company opens with.
pub const BACKFILL_YEARS: i32 = 5;

/// One quarter: the income statement and cash flow summed over its months,
/// and the balance sheet on its last day.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Period {
    pub year: i32,
    /// 1 through 4.
    pub quarter: u8,
    pub revenue: i64,
    pub cogs: i64,
    pub sga: i64,
    pub ebitda: i64,
    pub da: i64,
    pub interest: i64,
    pub tax: i64,
    pub net_income: i64,
    pub change_in_nwc: i64,
    pub capex: i64,
    pub debt_draw: i64,
    pub debt_repayment: i64,
    pub dividends: i64,
    pub opening_cash: i64,
    pub closing_cash: i64,
    /// Months summed so far; three once the quarter closes.
    pub months: u8,
    pub books: Books,
}

impl Period {
    pub fn gross_profit(&self) -> i64 {
        self.revenue - self.cogs
    }
    pub fn ebit(&self) -> i64 {
        self.ebitda - self.da
    }
    pub fn ebt(&self) -> i64 {
        self.ebit() - self.interest
    }
    pub fn cash_from_operations(&self) -> i64 {
        self.net_income + self.da - self.change_in_nwc
    }
    pub fn free_cash_flow(&self) -> i64 {
        self.cash_from_operations() - self.capex
    }
    /// Cash moved by anything the statement lines do not name: equity in,
    /// an acquisition, a recapitalization. Zero for an ordinary quarter.
    pub fn other_financing(&self) -> i64 {
        self.closing_cash
            - self.opening_cash
            - self.free_cash_flow()
            - self.debt_draw
            + self.debt_repayment
            + self.dividends
    }

    /// Adds one month into the open quarter.
    pub fn add_month(&mut self, month: &MonthResult) {
        if self.months == 0 {
            self.opening_cash = month.opening_cash;
        }
        self.months = self.months.saturating_add(1);
        self.revenue += month.revenue;
        self.cogs += month.cogs;
        self.sga += month.sga;
        self.ebitda += month.ebitda;
        self.da += month.da;
        self.interest += month.interest;
        self.tax += month.tax;
        self.net_income += month.net_income;
        self.change_in_nwc += month.change_in_nwc;
        self.capex += month.capex;
        self.debt_draw += month.debt_draw;
        self.debt_repayment += month.debt_repayment;
        self.dividends += month.dividends;
    }

    /// Adds another company's figures for the same quarter, for an add-on.
    pub fn absorb(&mut self, other: &Period) {
        self.revenue += other.revenue;
        self.cogs += other.cogs;
        self.sga += other.sga;
        self.ebitda += other.ebitda;
        self.da += other.da;
        self.interest += other.interest;
        self.tax += other.tax;
        self.net_income += other.net_income;
        self.change_in_nwc += other.change_in_nwc;
        self.capex += other.capex;
        self.debt_draw += other.debt_draw;
        self.debt_repayment += other.debt_repayment;
        self.dividends += other.dividends;
        self.opening_cash += other.opening_cash;
        self.closing_cash += other.closing_cash;
        let (mine, theirs) = (&mut self.books, &other.books);
        mine.cash += theirs.cash;
        mine.accounts_receivable += theirs.accounts_receivable;
        mine.inventory += theirs.inventory;
        mine.gross_ppe += theirs.gross_ppe;
        mine.accumulated_depreciation += theirs.accumulated_depreciation;
        mine.goodwill += theirs.goodwill;
        mine.accounts_payable += theirs.accounts_payable;
        mine.debt += theirs.debt;
        mine.share_capital += theirs.share_capital;
        mine.retained_earnings += theirs.retained_earnings;
    }

    /// Several periods added into one: flows summed, the balance sheet and
    /// closing cash of the last, opening cash of the first.
    pub fn sum(periods: &[&Period]) -> Option<Period> {
        let (first, last) = (periods.first()?, periods.last()?);
        let mut total = Period {
            year: last.year,
            quarter: last.quarter,
            opening_cash: first.opening_cash,
            closing_cash: last.closing_cash,
            books: last.books.clone(),
            ..Period::default()
        };
        for period in periods {
            total.revenue += period.revenue;
            total.cogs += period.cogs;
            total.sga += period.sga;
            total.ebitda += period.ebitda;
            total.da += period.da;
            total.interest += period.interest;
            total.tax += period.tax;
            total.net_income += period.net_income;
            total.change_in_nwc += period.change_in_nwc;
            total.capex += period.capex;
            total.debt_draw += period.debt_draw;
            total.debt_repayment += period.debt_repayment;
            total.dividends += period.dividends;
            total.months = total.months.saturating_add(period.months);
        }
        Some(total)
    }
}

impl Company {
    /// Closes the open quarter with today's balance sheet.
    pub fn close_quarter(&mut self, year: i32, quarter: u8) {
        let mut period = std::mem::take(&mut self.open_quarter);
        if period.months == 0 {
            period.opening_cash = self.books.cash;
        }
        period.year = year;
        period.quarter = quarter;
        period.closing_cash = self.books.cash;
        period.books = self.books.clone();
        self.ledger.push(period);
        if self.ledger.len() > LEDGER_QUARTERS {
            self.ledger.remove(0);
        }
    }

    /// Fiscal years with all four quarters in the ledger, oldest first.
    pub fn fiscal_years(&self) -> Vec<Period> {
        let mut years = Vec::new();
        for window in self.ledger.windows(4) {
            if window[0].quarter == 1 && window[3].quarter == 4 && window[0].year == window[3].year {
                let refs: Vec<&Period> = window.iter().collect();
                if let Some(mut year) = Period::sum(&refs) {
                    year.quarter = 0;
                    years.push(year);
                }
            }
        }
        years
    }

    /// The last four closed quarters added up.
    pub fn last_twelve_months(&self) -> Option<Period> {
        if self.ledger.len() < 4 {
            return None;
        }
        let refs: Vec<&Period> = self.ledger[self.ledger.len() - 4..].iter().collect();
        Period::sum(&refs)
    }

    /// Writes five years of quarters ending with `last_year` Q4, backwards
    /// from today's books, and resets the monthly history to match the last
    /// year. `rate_bps` is the interest rate on the debt today.
    pub fn backfill(&mut self, industry: &Industry, last_year: i32, rate_bps: i64, seed: u64) {
        let mut rng = Rng::new(seed);
        let quarters = (BACKFILL_YEARS * 4) as usize;
        // Annual growth for each year back, and a little noise per quarter.
        let base_annual = industry.monthly_growth_bps * 12;
        let seasonal = self.has(crate::company::Trait::SeasonalDemand);
        let mut revenue = vec![0i64; quarters];
        let mut margin = vec![0i64; quarters];
        let mut level = self.revenue * 3;
        let mut gm = self.gross_margin_bps;
        let mut year_growth = base_annual + rng.noise(450);
        for index in (0..quarters).rev() {
            let quarter_noise = rng.noise(if seasonal { 450 } else { 180 });
            revenue[index] = mul_bps(level, 10_000 + quarter_noise).max(3);
            margin[index] = gm.clamp(500, 9_500);
            // Step back one quarter.
            level = div_round(level * 10_000, 10_000 + year_growth / 4).max(3);
            if index % 4 == 0 {
                year_growth = base_annual + rng.noise(450);
                gm += rng.noise(60);
            }
        }
        // Fixed cost grows with wages, about 3% a year, so it was lower before.
        let fixed_now = self.sga_fixed * 3;
        let da_now = mul_bps(self.books.net_ppe(), industry.monthly_da_rate_bps) * 3;
        let interest_now = div_round(self.books.debt * rate_bps, 40_000);
        let latest = revenue[quarters - 1].max(1);

        let mut books = self.books.clone();
        let mut periods = Vec::with_capacity(quarters);
        for index in (0..quarters).rev() {
            let back = (quarters - 1 - index) as i64;
            let sales = revenue[index];
            let scale = |value: i64| div_round(value * sales, latest);
            let cogs = sales - mul_bps(sales, margin[index]);
            let fixed = div_round(fixed_now * 10_000, 10_000 + back * 75);
            let sga = fixed + mul_bps(sales, self.sga_variable_bps);
            let ebitda = sales - cogs - sga;
            let da = scale(da_now).max(0);
            let interest = div_round(interest_now * books.debt, self.books.debt.max(1)).max(0);
            let ebt = ebitda - da - interest;
            let tax = mul_bps(ebt.max(0), industry.tax_rate_bps);
            let net_income = ebt - tax;
            let capex = mul_bps(sales, industry.capex_ratio_bps);
            // Mature private companies paid most of their earnings out; the
            // rest is what the balance sheet carries forward.
            let dividends = if net_income > 0 {
                mul_bps(net_income, industry.dividend_payout_bps.max(6_500))
            } else {
                0
            };

            // The balance sheet a quarter earlier.
            let before = if index > 0 { revenue[index - 1] } else { div_round(sales * 10_000, 10_000 + base_annual / 4) };
            let mut start = books.clone();
            start.accounts_receivable = div_round(books.accounts_receivable * before, sales.max(1));
            start.inventory = div_round(books.inventory * before, sales.max(1));
            start.accounts_payable = div_round(books.accounts_payable * before, sales.max(1));
            start.gross_ppe = books.gross_ppe - capex;
            start.accumulated_depreciation = books.accumulated_depreciation - da;
            if start.accumulated_depreciation < 0 || start.gross_ppe < start.accumulated_depreciation {
                let net = (books.net_ppe() - capex + da).max(0);
                start.accumulated_depreciation = 0;
                start.gross_ppe = net;
            }
            start.retained_earnings = books.retained_earnings - net_income + dividends;
            start.debt = books.debt + div_round(books.debt, 200);
            start.cash = 0;
            let mut cash = start.total_liabilities() + start.total_equity() - start.total_assets();
            let floor = mul_bps(before, industry.min_cash_to_revenue_bps);
            if cash < floor {
                start.debt += floor - cash;
                cash = floor;
            }
            start.cash = cash;
            // The PP&E fallback above can move net PP&E; capex absorbs the difference.
            let capex = books.net_ppe() - start.net_ppe() + da;

            let delta_debt = books.debt - start.debt;
            let period = Period {
                year: last_year - (back / 4) as i32,
                quarter: (4 - back % 4) as u8,
                revenue: sales,
                cogs,
                sga,
                ebitda,
                da,
                interest,
                tax,
                net_income,
                change_in_nwc: books.net_working_capital() - start.net_working_capital(),
                capex,
                debt_draw: delta_debt.max(0),
                debt_repayment: (-delta_debt).max(0),
                dividends,
                opening_cash: start.cash,
                closing_cash: books.cash,
                months: 3,
                books: books.clone(),
            };
            periods.push(period);
            books = start;
        }
        periods.reverse();

        // The monthly history follows the last year of quarters.
        let last_year_quarters = &periods[quarters - 4..];
        let mut revenue_history = Vec::with_capacity(12);
        let mut ebitda_history = Vec::with_capacity(12);
        let mut fcf_history = Vec::with_capacity(12);
        for period in last_year_quarters {
            for month in 0..3 {
                let share = |value: i64| value / 3 + if month == 2 { value % 3 } else { 0 };
                revenue_history.push(share(period.revenue));
                ebitda_history.push(share(period.ebitda));
                fcf_history.push(share(period.free_cash_flow()));
            }
        }
        self.revenue_history = revenue_history;
        self.ebitda_history = ebitda_history;
        self.fcf_history = fcf_history;
        self.ledger = periods;
        self.open_quarter = Period::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::company::tests::{company, industry};

    #[test]
    fn backfilled_quarters_obey_the_identities() {
        for seed in 1..40 {
            let mut firm = company(seed);
            firm.backfill(&industry(), 2026, 900, seed);
            assert_eq!(firm.ledger.len(), 20);
            assert_eq!(firm.fiscal_years().len(), 5);
            assert_eq!(firm.ledger.last().unwrap().books, firm.books);
            for period in &firm.ledger {
                assert!(period.books.balances(), "balance sheet, seed {seed}");
                assert_eq!(period.other_financing(), 0, "cash bridge, seed {seed}");
                assert!(period.books.cash >= 0);
            }
            for pair in firm.ledger.windows(2) {
                assert_eq!(pair[0].closing_cash, pair[1].opening_cash);
                assert_eq!(pair[0].books.cash, pair[1].opening_cash);
            }
            assert_eq!(firm.ledger[0].year, 2022);
            assert_eq!(firm.ledger[0].quarter, 1);
            assert_eq!(firm.revenue_history.iter().sum::<i64>(), firm.last_twelve_months().unwrap().revenue);
        }
    }

    #[test]
    fn simulated_quarters_close_with_a_cash_bridge() {
        let mut firm = company(3);
        let industry = industry();
        firm.backfill(&industry, 2026, 900, 3);
        let economy = crate::economy::Economy::new(1, &mut Rng::new(0), crate::economy::Era::HighRates);
        let mut rng = Rng::new(5);
        for month in 1..=6u8 {
            firm.step(&industry, &economy, &mut rng);
            if month % 3 == 0 {
                firm.close_quarter(2027, month / 3);
            }
        }
        let closed = &firm.ledger[firm.ledger.len() - 2..];
        for period in closed {
            assert_eq!(period.months, 3);
            assert_eq!(period.other_financing(), 0);
            assert!(period.books.balances());
        }
        assert_eq!(closed[1].quarter, 2);
    }
}
