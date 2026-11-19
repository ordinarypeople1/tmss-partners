//! Integer helpers. Money is thousand USD, ratios are basis points (10 000 =
//! 1.0) or thousandths (1 000 = 1.0x). Rounding is half away from zero.

pub const BPS: i64 = 10_000;
pub const MILLIS: i64 = 1_000;

pub fn div_round(numerator: i64, denominator: i64) -> i64 {
    debug_assert!(denominator > 0);
    let half = denominator / 2;
    if numerator >= 0 {
        (numerator + half) / denominator
    } else {
        (numerator - half) / denominator
    }
}

pub fn mul_bps(value: i64, bps: i64) -> i64 {
    div_round(value * bps, BPS)
}

pub fn mul_millis(value: i64, millis: i64) -> i64 {
    div_round(value * millis, MILLIS)
}

/// `numerator / denominator` in thousandths. Zero when the denominator is not positive.
pub fn ratio_millis(numerator: i64, denominator: i64) -> i64 {
    if denominator <= 0 {
        0
    } else {
        div_round(numerator * MILLIS, denominator)
    }
}

pub fn ratio_bps(numerator: i64, denominator: i64) -> i64 {
    if denominator <= 0 {
        0
    } else {
        div_round(numerator * BPS, denominator)
    }
}

/// Annual internal rate of return of monthly cash flows, in basis points.
/// `flows` are (month index, amount); money out is negative. Returns `None`
/// when the flows never change sign. Bisection on the monthly rate.
pub fn irr_bps(flows: &[(u32, i64)]) -> Option<i64> {
    let has_out = flows.iter().any(|(_, amount)| *amount < 0);
    let has_in = flows.iter().any(|(_, amount)| *amount > 0);
    if !has_out || !has_in {
        return None;
    }
    let first = flows.iter().map(|(month, _)| *month).min().unwrap_or(0);
    let npv = |monthly: f64| -> f64 {
        flows
            .iter()
            .map(|(month, amount)| {
                let mut discount = 1.0;
                for _ in 0..(*month - first) {
                    discount /= 1.0 + monthly;
                }
                *amount as f64 * discount
            })
            .sum()
    };
    // Net present value falls as the rate rises, so the sign at zero says
    // which side the root is on.
    let (mut low, mut high) = if npv(0.0) >= 0.0 { (0.0_f64, 1.0_f64) } else { (-0.08_f64, 0.0_f64) };
    if npv(low) < 0.0 {
        return Some(-9_999);
    }
    if npv(high) > 0.0 {
        return Some(99_999);
    }
    for _ in 0..60 {
        let mid = (low + high) / 2.0;
        if npv(mid) > 0.0 {
            low = mid;
        } else {
            high = mid;
        }
    }
    let monthly = (low + high) / 2.0;
    let mut annual = 1.0;
    for _ in 0..12 {
        annual *= 1.0 + monthly;
    }
    Some(((annual - 1.0) * 10_000.0).round() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounds_half_away_from_zero() {
        assert_eq!(div_round(15, 10), 2);
        assert_eq!(div_round(-15, 10), -2);
        assert_eq!(mul_bps(1_000, 2_750), 275);
        assert_eq!(mul_millis(2_549, 7_200), 18_353);
        assert_eq!(ratio_millis(70_000, 10_000), 7_000);
        assert_eq!(ratio_millis(1, 0), 0);
    }

    #[test]
    fn doubles_in_five_years_at_about_fifteen_percent() {
        let irr = irr_bps(&[(0, -100_000), (60, 200_000)]).unwrap();
        assert!((1_480..=1_490).contains(&irr), "{irr}");
    }

    #[test]
    fn a_loss_is_a_negative_rate_and_no_sign_change_is_none() {
        assert!(irr_bps(&[(0, -100), (12, 80)]).unwrap() < 0);
        assert_eq!(irr_bps(&[(0, -100), (12, -80)]), None);
        assert_eq!(irr_bps(&[]), None);
        // Late calls among early gains still find the rate.
        let mixed = irr_bps(&[(0, -100), (12, 150), (100, -20), (118, 60)]).unwrap();
        assert!((0..20_000).contains(&mixed), "{mixed}");
    }
}
