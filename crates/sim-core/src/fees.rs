use crate::round::mul_div;
use crate::SimError;

/// Quarterly management fee. `annual_fee_bps` of 200 is 2.00% per year.
/// During the investment period `base` is commitments. Afterwards it is
/// invested cost. Charged in arrears, four equal quarters.
pub fn quarterly_management_fee(base: i64, annual_fee_bps: i64) -> Result<i64, SimError> {
    if base < 0 || annual_fee_bps < 0 {
        return Err(SimError::Domain);
    }
    mul_div(base, annual_fee_bps, 40_000)
}

/// 1% transaction cost, at least 20 (million KRW), on the equity or loan check.
pub fn transaction_cost(check: i64) -> Result<i64, SimError> {
    if check < 0 {
        return Err(SimError::Domain);
    }
    Ok(mul_div(check, 100, 10_000)?.max(20))
}

pub fn moic_millis(realized: i64, residual: i64, invested: i64) -> Result<i64, SimError> {
    if invested <= 0 {
        return Err(SimError::Domain);
    }
    let total = realized
        .checked_add(residual)
        .ok_or(SimError::Overflow)?;
    mul_div(total, 1_000, invested)
}

pub fn dpi_millis(distributed: i64, paid_in: i64) -> Result<i64, SimError> {
    moic_millis(distributed, 0, paid_in)
}

pub fn tvpi_millis(distributed: i64, nav_to_lp: i64, paid_in: i64) -> Result<i64, SimError> {
    moic_millis(distributed, nav_to_lp, paid_in)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_percent_on_fifty_billion_is_two_hundred_fifty_a_quarter() {
        // 500억원 = 50_000 million KRW. 2% / 4 = 250.
        assert_eq!(quarterly_management_fee(50_000, 200).unwrap(), 250);
    }

    #[test]
    fn fee_base_can_switch_to_invested_cost() {
        assert_eq!(quarterly_management_fee(20_000, 200).unwrap(), 100);
    }

    #[test]
    fn multiples_use_thousandths() {
        assert_eq!(moic_millis(22_500, 33_750, 22_500).unwrap(), 2_500);
        assert_eq!(dpi_millis(5_000, 10_000).unwrap(), 500);
        assert_eq!(tvpi_millis(5_000, 8_000, 10_000).unwrap(), 1_300);
    }

    #[test]
    fn transaction_cost_is_one_percent_with_a_floor() {
        assert_eq!(transaction_cost(100_000).unwrap(), 1_000);
        assert_eq!(transaction_cost(100).unwrap(), 20);
    }
}
