//! Fund math and the quarterly scheduler.
//!
//! Money is an `i64` count of million KRW. A model multiple is an `i64` count of
//! thousandths: 7200 means 7.200x. Rates that are not multiples use basis points:
//! 800 is 8.00%. Rounding is half away from zero. Positive examples match the
//! previous `Math.round` results (2549 × 7.2 = 18353).

mod close;
mod deal;
mod fees;
mod game;
mod irr;
mod lbo;
mod news;
mod round;
mod waterfall;

pub use close::{close_quarter, model_multiple_millis, Books, CloseAdjust, Drivers};
pub use fees::{quarterly_management_fee, transaction_cost};
pub use game::Game;
pub use irr::annualized_irr_bps;
pub use lbo::{
    covenants_breached, interest_cover_millis, leverage_millis, service_debt, sources_and_uses,
    step_tranche, Tranche,
};
pub use waterfall::Waterfall;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimError {
    NegativeMultiple,
    Overflow,
    NonPositiveDivisor,
    Domain,
    Identity,
}

impl std::fmt::Display for SimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SimError::NegativeMultiple => write!(f, "multiple must be non-negative"),
            SimError::Overflow => write!(f, "overflow"),
            SimError::NonPositiveDivisor => write!(f, "divisor must be positive"),
            SimError::Domain => write!(f, "value out of domain"),
            SimError::Identity => write!(f, "accounting identity failed"),
        }
    }
}

impl std::error::Error for SimError {}

const MILLIS_PER_TURN: i64 = 1_000;

pub fn enterprise_value(ebitda: i64, multiple_millis: i64) -> Result<i64, SimError> {
    if multiple_millis < 0 {
        return Err(SimError::NegativeMultiple);
    }
    round::mul_div(ebitda, multiple_millis, MILLIS_PER_TURN)
}

pub fn equity_value(ebitda: i64, multiple_millis: i64, net_debt: i64) -> Result<i64, SimError> {
    let value = enterprise_value(ebitda, multiple_millis)?;
    value.checked_sub(net_debt).ok_or(SimError::Overflow)
}

#[cfg(feature = "wasm")]
mod wasm_api {
    use super::{enterprise_value, equity_value, SimError};
    use wasm_bindgen::prelude::*;

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

    thread_local! {
        static GAME: std::cell::RefCell<Option<crate::game::Game>> = const { std::cell::RefCell::new(None) };
    }

    #[wasm_bindgen]
    pub fn boot_game(json: &str) -> String {
        match crate::game::Game::boot(json) {
            Ok(mut game) => {
                let body = game.handle(r#"{"op":"dashboard"}"#);
                GAME.with(|slot| *slot.borrow_mut() = Some(game));
                body
            }
            Err(err) => format!(r#"{{"ok":false,"error":"boot","detail":{}}}"#, serde_json::to_string(&err).unwrap_or("\"boot\"".into())),
        }
    }

    #[wasm_bindgen]
    pub fn game_command(json: &str) -> String {
        GAME.with(|slot| {
            let mut borrow = slot.borrow_mut();
            match borrow.as_mut() {
                Some(game) => game.handle(json),
                None => r#"{"ok":false,"error":"no_game"}"#.into(),
            }
        })
    }

    #[wasm_bindgen]
    pub fn export_game() -> String {
        GAME.with(|slot| {
            slot.borrow()
                .as_ref()
                .map(|game| game.export_json())
                .unwrap_or_else(|| "{}".into())
        })
    }

    #[wasm_bindgen]
    pub fn import_game(json: &str) -> String {
        match crate::game::Game::import_json(json) {
            Ok(mut game) => {
                let body = game.handle(r#"{"op":"dashboard"}"#);
                GAME.with(|slot| *slot.borrow_mut() = Some(game));
                body
            }
            Err(_) => r#"{"ok":false,"error":"boot"}"#.into(),
        }
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
