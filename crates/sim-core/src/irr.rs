//! Quarterly IRR, annualized. Cashflows stay integers. Only the rate solver uses
//! floating point, and the result is rounded back to basis points.

/// Annualized IRR in basis points. 1000 = 10.00%.
/// `cashflows[0]` is today. Empty quarters must be present as zero so the
/// spacing stays honest. Returns `None` when the series has no sign change
/// or the solver does not settle.
pub fn annualized_irr_bps(cashflows: &[i64]) -> Option<i64> {
    if cashflows.len() < 2 {
        return None;
    }
    let has_pos = cashflows.iter().any(|c| *c > 0);
    let has_neg = cashflows.iter().any(|c| *c < 0);
    if !has_pos || !has_neg {
        return None;
    }
    let quarterly = solve_quarterly_rate(cashflows)?;
    let annual = (1.0 + quarterly).powi(4) - 1.0;
    if !annual.is_finite() {
        return None;
    }
    Some(round_half_away(annual * 10_000.0))
}

fn solve_quarterly_rate(cashflows: &[i64]) -> Option<f64> {
    let mut rate = 0.05_f64;
    for _ in 0..48 {
        let (npv, derivative) = npv_and_derivative(cashflows, rate);
        if !npv.is_finite() || !derivative.is_finite() || derivative.abs() < 1e-12 {
            return None;
        }
        let next = rate - npv / derivative;
        if !next.is_finite() || next <= -0.90 || next > 10.0 {
            return None;
        }
        if (next - rate).abs() < 1e-12 {
            return Some(next);
        }
        rate = next;
    }
    let (npv, _) = npv_and_derivative(cashflows, rate);
    if npv.abs() < 1e-4 {
        Some(rate)
    } else {
        None
    }
}

fn npv_and_derivative(cashflows: &[i64], rate: f64) -> (f64, f64) {
    let mut npv = 0.0;
    let mut derivative = 0.0;
    let mut discount = 1.0;
    for (index, cash) in cashflows.iter().enumerate() {
        let amount = *cash as f64;
        npv += amount * discount;
        if index > 0 {
            derivative -= index as f64 * amount * discount / (1.0 + rate);
        }
        discount /= 1.0 + rate;
    }
    (npv, derivative)
}

fn round_half_away(value: f64) -> i64 {
    if value >= 0.0 {
        (value + 0.5).floor() as i64
    } else {
        (value - 0.5).ceil() as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_year_of_quarters_at_ten_percent() {
        let irr = annualized_irr_bps(&[-1_000, 0, 0, 0, 1_100]).unwrap();
        assert!((irr - 1_000).abs() <= 1, "irr {irr}");
    }

    #[test]
    fn a_single_quarter_compounds_to_the_annual_rate() {
        // 10% in one quarter: (1.10)^4 - 1 = 46.41%.
        let irr = annualized_irr_bps(&[-1_000, 1_100]).unwrap();
        assert!((irr - 4_641).abs() <= 2, "irr {irr}");
    }

    #[test]
    fn keeps_a_zero_quarter_in_the_spacing() {
        let with_gap = annualized_irr_bps(&[-1_000, 0, 1_210]).unwrap();
        let packed = annualized_irr_bps(&[-1_000, 1_210]).unwrap();
        assert!(with_gap < packed);
    }

    #[test]
    fn refuses_a_series_that_never_returns_cash() {
        assert_eq!(annualized_irr_bps(&[-100, -50, 0]), None);
        assert_eq!(annualized_irr_bps(&[]), None);
    }
}
