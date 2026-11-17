use crate::round::mul_div;
use crate::SimError;

/// One distribution through a European whole-fund waterfall.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WaterfallSplit {
    pub roc: i64,
    pub pref: i64,
    pub catch_up_gp: i64,
    pub residual_lp: i64,
    pub residual_gp: i64,
    pub lp: i64,
    pub gp: i64,
}

/// Buckets carried from one distribution to the next.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Waterfall {
    pub contributed: i64,
    pub roc_paid: i64,
    pub pref_accrued: i64,
    pub pref_paid: i64,
    pub gp_carry: i64,
}

impl Waterfall {
    pub fn new(contributed: i64) -> Self {
        Self {
            contributed,
            roc_paid: 0,
            pref_accrued: 0,
            pref_paid: 0,
            gp_carry: 0,
        }
    }

    pub fn unreturned(&self) -> i64 {
        (self.contributed - self.roc_paid).max(0)
    }

    pub fn unpaid_pref(&self) -> i64 {
        (self.pref_accrued - self.pref_paid).max(0)
    }

    /// Quarterly preferred accrual on capital still unreturned.
    pub fn accrue_pref(&mut self, hurdle_bps: i64) -> Result<i64, SimError> {
        let accrual = mul_div(self.unreturned(), hurdle_bps, 40_000)?;
        self.pref_accrued = self
            .pref_accrued
            .checked_add(accrual)
            .ok_or(SimError::Overflow)?;
        Ok(accrual)
    }

    pub fn distribute(&mut self, amount: i64, carry_bps: i64) -> Result<WaterfallSplit, SimError> {
        if amount < 0 || !(0..10_000).contains(&carry_bps) {
            return Err(SimError::Domain);
        }
        let roc = amount.min(self.unreturned());
        let mut left = amount - roc;
        let pref = left.min(self.unpaid_pref());
        left -= pref;

        let mut catch_up_gp = 0;
        if pref + self.pref_paid == self.pref_accrued && self.unpaid_pref() - pref == 0 {
            let pref_base = self.pref_paid + pref;
            if carry_bps > 0 && pref_base > 0 {
                let target = mul_div(pref_base, carry_bps, 10_000 - carry_bps)?;
                let need = (target - self.gp_carry).max(0);
                catch_up_gp = left.min(need);
                left -= catch_up_gp;
            }
        }

        let residual_gp = if carry_bps == 0 {
            0
        } else {
            mul_div(left, carry_bps, 10_000)?
        };
        let residual_lp = left - residual_gp;
        let lp = roc + pref + residual_lp;
        let gp = catch_up_gp + residual_gp;

        self.roc_paid += roc;
        self.pref_paid += pref;
        self.gp_carry += gp;
        Ok(WaterfallSplit {
            roc,
            pref,
            catch_up_gp,
            residual_lp,
            residual_gp,
            lp,
            gp,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn textbook_exit_pays_roc_pref_catch_up_then_carry() {
        let mut book = Waterfall::new(10_000);
        book.pref_accrued = 800;
        let split = book.distribute(15_000, 2_000).unwrap();
        assert_eq!(split.roc, 10_000);
        assert_eq!(split.pref, 800);
        assert_eq!(split.catch_up_gp, 200);
        assert_eq!(split.residual_lp, 3_200);
        assert_eq!(split.residual_gp, 800);
        assert_eq!(split.lp, 14_000);
        assert_eq!(split.gp, 1_000);
        assert_eq!(split.lp + split.gp, 15_000);
        assert_eq!(book.gp_carry, 1_000);
        assert_eq!(book.unreturned(), 0);
    }

    #[test]
    fn a_second_distribution_stays_on_the_eighty_twenty() {
        let mut book = Waterfall::new(10_000);
        book.pref_accrued = 800;
        book.distribute(15_000, 2_000).unwrap();
        let next = book.distribute(1_000, 2_000).unwrap();
        assert_eq!(next.roc, 0);
        assert_eq!(next.pref, 0);
        assert_eq!(next.catch_up_gp, 0);
        assert_eq!(next.residual_lp, 800);
        assert_eq!(next.residual_gp, 200);
    }

    #[test]
    fn pref_is_not_skipped() {
        let mut book = Waterfall::new(10_000);
        book.pref_accrued = 800;
        let split = book.distribute(10_400, 2_000).unwrap();
        assert_eq!(split.roc, 10_000);
        assert_eq!(split.pref, 400);
        assert_eq!(split.gp, 0);
        assert_eq!(book.unpaid_pref(), 400);
    }

    #[test]
    fn quarterly_pref_is_eight_percent_on_unreturned_capital() {
        let mut book = Waterfall::new(10_000);
        let accrual = book.accrue_pref(800).unwrap();
        assert_eq!(accrual, 200);
        assert_eq!(book.pref_accrued, 200);
    }

    #[test]
    fn return_of_capital_comes_before_profit() {
        let mut book = Waterfall::new(5_000);
        book.pref_accrued = 100;
        let split = book.distribute(5_000, 2_000).unwrap();
        assert_eq!(split.lp, 5_000);
        assert_eq!(split.gp, 0);
        assert_eq!(split.pref, 0);
    }
}
