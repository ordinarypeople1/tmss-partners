use crate::SimError;

/// Half away from zero. `denom` must be positive.
pub fn mul_div(value: i64, numer: i64, denom: i64) -> Result<i64, SimError> {
    if denom <= 0 {
        return Err(SimError::NonPositiveDivisor);
    }
    let product = (value as i128)
        .checked_mul(numer as i128)
        .ok_or(SimError::Overflow)?;
    let den = denom as i128;
    let half = den / 2;
    let rounded = if product >= 0 {
        product + half
    } else {
        product - half
    } / den;
    i64::try_from(rounded).map_err(|_| SimError::Overflow)
}

pub fn clamp_i64(value: i64, low: i64, high: i64) -> i64 {
    value.clamp(low, high)
}
