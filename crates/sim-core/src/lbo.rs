use crate::round::mul_div;
use crate::SimError;

/// Cash-free, debt-free sources and uses. Sponsor equity is the plug.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourcesUses {
    pub enterprise_value: i64,
    pub fees: i64,
    pub uses: i64,
    pub senior: i64,
    pub mezz: i64,
    pub rollover: i64,
    pub strategic: i64,
    pub sponsor: i64,
}

pub fn sources_and_uses(
    enterprise_value: i64,
    fees: i64,
    senior: i64,
    mezz: i64,
    rollover: i64,
    strategic: i64,
) -> Result<SourcesUses, SimError> {
    if enterprise_value < 0 || fees < 0 || senior < 0 || mezz < 0 || rollover < 0 || strategic < 0
    {
        return Err(SimError::Domain);
    }
    let uses = enterprise_value
        .checked_add(fees)
        .ok_or(SimError::Overflow)?;
    let funded = senior
        .checked_add(mezz)
        .and_then(|v| v.checked_add(rollover))
        .and_then(|v| v.checked_add(strategic))
        .ok_or(SimError::Overflow)?;
    if funded > uses {
        return Err(SimError::Domain);
    }
    Ok(SourcesUses {
        enterprise_value,
        fees,
        uses,
        senior,
        mezz,
        rollover,
        strategic,
        sponsor: uses - funded,
    })
}

#[derive(Debug, Clone, Copy)]
pub struct Tranche {
    pub opening: i64,
    pub rate_bps: i64,
    /// Fixed quarterly mandatory amortization. Unused when `pik` is set.
    pub mandatory: i64,
    pub pik: bool,
    pub sweep: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DebtStep {
    pub interest_cash: i64,
    pub interest_pik: i64,
    pub amort: i64,
    pub sweep: i64,
    pub closing: i64,
}

/// One quarter of a tranche. Cash interest is paid before amortization.
/// A PIK tranche adds unpaid interest to principal when cash is short.
/// Sweep takes leftover cash after mandatory amortization, down to zero cash
/// passed in (the caller already reserved minimum cash).
pub fn step_tranche(tranche: &Tranche, cash_available: i64) -> Result<(DebtStep, i64), SimError> {
    if tranche.opening < 0 || tranche.rate_bps < 0 || tranche.mandatory < 0 || cash_available < 0 {
        return Err(SimError::Domain);
    }
    let interest = mul_div(tranche.opening, tranche.rate_bps, 40_000)?;
    let mut cash = cash_available;
    let mut interest_cash = 0;
    let mut interest_pik = 0;
    let mut principal = tranche.opening;
    if cash >= interest {
        cash -= interest;
        interest_cash = interest;
    } else if tranche.pik {
        interest_pik = interest;
        principal += interest;
    } else {
        interest_cash = cash;
        interest_pik = interest - cash;
        principal += interest_pik;
        cash = 0;
    }
    let mut amort = 0;
    if !tranche.pik {
        amort = tranche.mandatory.min(principal).min(cash);
        principal -= amort;
        cash -= amort;
    }
    let mut sweep = 0;
    if tranche.sweep {
        sweep = cash.min(principal);
        principal -= sweep;
        cash -= sweep;
    }
    Ok((
        DebtStep {
            interest_cash,
            interest_pik,
            amort,
            sweep,
            closing: principal,
        },
        cash,
    ))
}

/// Seniority order: pay every cash coupon, then mandatory amortization, then
/// sweep. A PIK tranche accrues only the coupon it could not pay in cash.
pub fn service_debt(tranches: &mut [Tranche], mut cash: i64) -> Result<i64, SimError> {
    if cash < 0 {
        return Err(SimError::Domain);
    }
    let interest: Result<Vec<i64>, SimError> = tranches
        .iter()
        .map(|tranche| mul_div(tranche.opening, tranche.rate_bps, 40_000))
        .collect();
    let interest = interest?;
    for (tranche, due) in tranches.iter_mut().zip(interest.iter().copied()) {
        if cash >= due {
            cash -= due;
        } else if tranche.pik {
            tranche.opening += due - cash;
            cash = 0;
        } else {
            tranche.opening += due - cash;
            cash = 0;
        }
    }
    for tranche in tranches.iter_mut() {
        if tranche.pik {
            continue;
        }
        let amort = tranche.mandatory.min(tranche.opening).min(cash);
        tranche.opening -= amort;
        cash -= amort;
    }
    for tranche in tranches.iter_mut() {
        if !tranche.sweep {
            continue;
        }
        let sweep = cash.min(tranche.opening);
        tranche.opening -= sweep;
        cash -= sweep;
    }
    Ok(cash)
}

/// Net debt / annual EBITDA, in thousandths. 5500 = 5.500x.
pub fn leverage_millis(net_debt: i64, annual_ebitda: i64) -> Result<i64, SimError> {
    if annual_ebitda <= 0 {
        return Err(SimError::Domain);
    }
    mul_div(net_debt, 1_000, annual_ebitda)
}

/// Annual EBITDA / cash interest, in thousandths. 2000 = 2.000x.
pub fn interest_cover_millis(annual_ebitda: i64, cash_interest: i64) -> Result<i64, SimError> {
    if cash_interest <= 0 {
        return Ok(i64::MAX / 4);
    }
    mul_div(annual_ebitda, 1_000, cash_interest)
}

pub fn covenants_breached(
    leverage: i64,
    leverage_limit: i64,
    cover: i64,
    cover_floor: i64,
) -> bool {
    leverage > leverage_limit || cover < cover_floor
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn textbook_sources_balance_the_uses() {
        let book = sources_and_uses(70_000, 1_000, 40_000, 6_000, 2_500, 0).unwrap();
        assert_eq!(book.uses, 71_000);
        assert_eq!(book.sponsor, 22_500);
        assert_eq!(
            book.senior + book.mezz + book.rollover + book.strategic + book.sponsor,
            book.uses
        );
    }

    #[test]
    fn refuses_over_funded_sources() {
        assert_eq!(
            sources_and_uses(10_000, 0, 9_000, 2_000, 0, 0).unwrap_err(),
            SimError::Domain
        );
    }

    #[test]
    fn senior_pays_interest_amortizes_and_sweeps() {
        let tranche = Tranche {
            opening: 4_000,
            rate_bps: 800,
            mandatory: 100,
            pik: false,
            sweep: true,
        };
        let (step, left) = step_tranche(&tranche, 200).unwrap();
        assert_eq!(step.interest_cash, 80);
        assert_eq!(step.amort, 100);
        assert_eq!(step.sweep, 20);
        assert_eq!(step.closing, 3_880);
        assert_eq!(left, 0);
    }

    #[test]
    fn mezzanine_piks_when_cash_cannot_cover_the_coupon() {
        let tranche = Tranche {
            opening: 6_000,
            rate_bps: 1_200,
            mandatory: 0,
            pik: true,
            sweep: false,
        };
        let (step, left) = step_tranche(&tranche, 100).unwrap();
        assert_eq!(step.interest_cash, 0);
        assert_eq!(step.interest_pik, 180);
        assert_eq!(step.closing, 6_180);
        assert_eq!(left, 100);
    }

    #[test]
    fn four_quarter_schedule_reduces_senior_and_compounds_pik() {
        let mut tranches = [
            Tranche {
                opening: 4_000,
                rate_bps: 800,
                mandatory: 100,
                pik: false,
                sweep: true,
            },
            Tranche {
                opening: 1_000,
                rate_bps: 1_200,
                mandatory: 0,
                pik: true,
                sweep: false,
            },
        ];
        let left = service_debt(&mut tranches, 90).unwrap();
        assert_eq!(left, 0);
        assert_eq!(tranches[0].opening, 4_000);
        assert_eq!(tranches[1].opening, 1_020);
        for _ in 0..4 {
            let before = tranches[0].opening;
            service_debt(&mut tranches, 400).unwrap();
            assert!(tranches[0].opening < before);
        }
        assert!(tranches[0].opening < 4_000);
        assert!(tranches[1].opening >= 1_020);
    }

    #[test]
    fn covenant_math_uses_thousandths() {
        let leverage = leverage_millis(22_000, 13_000).unwrap();
        assert_eq!(leverage, 1_692);
        let cover = interest_cover_millis(13_000, 2_000).unwrap();
        assert_eq!(cover, 6_500);
        assert!(!covenants_breached(leverage, 5_500, cover, 2_000));
        assert!(covenants_breached(6_000, 5_500, cover, 2_000));
        assert!(covenants_breached(leverage, 5_500, 1_500, 2_000));
    }
}
