//! Valuation and the monthly scheduler.
//!
//! Money is an `i64` count of thousand USD. A model multiple is an `i64` count of
//! thousandths: 7200 means 7.200x. Rounding is half away from zero. Positive
//! examples match the previous `Math.round` results (2549 × 7.2 = 18353).

pub mod calendar;
pub mod rng;
pub mod world;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimError {
    NegativeMultiple,
    Overflow,
}

impl std::fmt::Display for SimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SimError::NegativeMultiple => write!(f, "multiple must be non-negative"),
            SimError::Overflow => write!(f, "overflow"),
        }
    }
}

impl std::error::Error for SimError {}

const MILLIS_PER_TURN: i64 = 1_000;

pub fn enterprise_value(ebitda: i64, multiple_millis: i64) -> Result<i64, SimError> {
    if multiple_millis < 0 {
        return Err(SimError::NegativeMultiple);
    }
    let product = ebitda
        .checked_mul(multiple_millis)
        .ok_or(SimError::Overflow)?;
    Ok(div_round_half_away(product, MILLIS_PER_TURN))
}

pub fn equity_value(ebitda: i64, multiple_millis: i64, net_debt: i64) -> Result<i64, SimError> {
    let value = enterprise_value(ebitda, multiple_millis)?;
    value.checked_sub(net_debt).ok_or(SimError::Overflow)
}

fn div_round_half_away(numerator: i64, denominator: i64) -> i64 {
    let half = denominator / 2;
    if numerator >= 0 {
        (numerator + half) / denominator
    } else {
        (numerator - half) / denominator
    }
}

#[cfg(feature = "wasm")]
mod wasm_api {
    use super::world::{Command, World};
    use super::{enterprise_value, equity_value, SimError};
    use wasm_bindgen::prelude::*;

    /// One running game. The host holds it and never reads its fields directly.
    #[wasm_bindgen]
    pub struct Session {
        world: World,
    }

    #[wasm_bindgen]
    impl Session {
        #[wasm_bindgen(constructor)]
        pub fn new(seed: u64) -> Session {
            Session {
                world: World::new(seed),
            }
        }

        pub fn load(save: &str) -> Result<Session, JsValue> {
            World::from_save(save)
                .map(|world| Session { world })
                .map_err(|err| JsValue::from_str(&err.to_string()))
        }

        /// The save file. The same text is the state the screen draws.
        pub fn save(&self) -> String {
            self.world.to_save()
        }

        /// Closes one month and returns the events as a JSON array.
        pub fn advance_month(&mut self) -> String {
            let events = self.world.apply(Command::AdvanceMonth);
            serde_json::to_string(&events).expect("events serialize")
        }
    }

    fn into_js(error: SimError) -> JsValue {
        JsValue::from_str(&error.to_string())
    }

    #[wasm_bindgen]
    pub fn enterprise_value_millis(ebitda: i64, multiple_millis: i64) -> Result<i64, JsValue> {
        enterprise_value(ebitda, multiple_millis).map_err(into_js)
    }

    #[wasm_bindgen]
    pub fn equity_value_millis(
        ebitda: i64,
        multiple_millis: i64,
        net_debt: i64,
    ) -> Result<i64, JsValue> {
        equity_value(ebitda, multiple_millis, net_debt).map_err(into_js)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prices_ebitda_times_a_multiple() {
        assert_eq!(enterprise_value(10_000, 7_000).unwrap(), 70_000);
        assert_eq!(enterprise_value(2_549, 7_200).unwrap(), 18_353);
    }

    #[test]
    fn rounds_half_away_from_zero() {
        assert_eq!(enterprise_value(1, 1_500).unwrap(), 2);
        assert_eq!(enterprise_value(-1, 1_500).unwrap(), -2);
        assert_eq!(enterprise_value(10_000, 7_000).unwrap(), 70_000);
    }

    #[test]
    fn subtracts_net_debt() {
        assert_eq!(equity_value(10_000, 7_000, 12_000).unwrap(), 58_000);
    }

    #[test]
    fn rejects_a_negative_multiple() {
        assert_eq!(
            enterprise_value(100, -1).unwrap_err(),
            SimError::NegativeMultiple
        );
    }

    #[test]
    fn rejects_overflow() {
        assert_eq!(
            enterprise_value(i64::MAX, 2_000).unwrap_err(),
            SimError::Overflow
        );
    }
}
