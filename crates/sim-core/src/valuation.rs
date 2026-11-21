//! What the fund thinks a company is worth. The model value lives in the
//! simulation; the player sees it only through a valuation they ordered,
//! done in house or by an outside adviser, and it arrives at month end as a
//! range around the model value, wider for a desk exercise than for a paid
//! report.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::math::{div_round, mul_bps, ratio_millis};
use crate::world::{CommandError, MessageKind, World};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValuationKind {
    /// The deal team's own model: one unit of attention, a wide range.
    Internal,
    /// A paid fairness-style report: a fee, a narrow range, trading comparables.
    Adviser,
}

/// A finished valuation, as of the month it came in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Valuation {
    pub kind: ValuationKind,
    pub date: GameDate,
    pub low: i64,
    pub mid: i64,
    pub high: i64,
    /// Half the width of the range, in basis points of the midpoint.
    pub error_bps: i64,
    /// The trailing EBITDA the valuation rests on.
    pub ebitda: i64,
    /// The midpoint over that EBITDA, in thousandths.
    pub multiple_millis: i64,
    /// The sector's median multiple, from the adviser's comparables; zero in house.
    pub sector_multiple_millis: i64,
    pub net_debt: i64,
    pub fee: i64,
}

/// Desk valuations land within ±15%; sector research and associates tighten them.
const INTERNAL_ERROR_BPS: i64 = 1_500;
const INTERNAL_FLOOR_BPS: i64 = 700;
/// An outside report lands within ±5%.
const ADVISER_ERROR_BPS: i64 = 500;

impl World {
    /// The outside adviser's fee. Advisers price the house, not the target:
    /// a larger fund hires (and pays) a larger firm.
    pub fn valuation_fee(&self) -> i64 {
        let fee = mul_bps(self.fund.committed, 3).max(60);
        div_round(fee, 5) * 5
    }

    fn valuation_error_bps(&self, company: usize, kind: ValuationKind) -> i64 {
        match kind {
            ValuationKind::Adviser => ADVISER_ERROR_BPS,
            ValuationKind::Internal => {
                let sector = self.companies[company].sector;
                let researched = self.insight.get(sector).copied().unwrap_or(0) > 0;
                let team = self.career.associates.clamp(0, 5) * 100;
                (INTERNAL_ERROR_BPS - if researched { 400 } else { 0 } - team).max(INTERNAL_FLOOR_BPS)
            }
        }
    }

    pub(crate) fn order_valuation(&mut self, company: usize, kind: ValuationKind) -> Result<(), CommandError> {
        let index = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        if self.deals[index].valuation_order.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        // A second desk model adds nothing; an adviser can still tighten a desk one.
        if let Some(done) = &self.deals[index].valuation {
            if done.kind == ValuationKind::Adviser || kind == ValuationKind::Internal {
                return Err(CommandError::AlreadyDone);
            }
        }
        match kind {
            ValuationKind::Internal => self.spend_attention(1)?,
            ValuationKind::Adviser => {
                let fee = self.valuation_fee();
                if !self.fund.call(fee, self.months_elapsed) {
                    return Err(CommandError::FundExhausted);
                }
                self.fund.deal_costs += fee;
                self.deals[index].costs += fee;
            }
        }
        self.deals[index].valuation_order = Some(kind);
        Ok(())
    }

    /// Month end: ordered valuations come in.
    pub(crate) fn finish_valuations(&mut self) {
        for index in 0..self.deals.len() {
            let Some(kind) = self.deals[index].valuation_order.take() else {
                continue;
            };
            let company = self.deals[index].company;
            let truth = self.model_ev(company).max(1);
            let error_bps = self.valuation_error_bps(company, kind);
            // The midpoint misses the model by up to half the range, either way.
            let miss = self.rng.noise(error_bps / 3).clamp(-error_bps / 2, error_bps / 2);
            let mid = mul_bps(truth, 10_000 + miss).max(1);
            let target = &self.companies[company];
            let ebitda = target.ttm_ebitda();
            let industry = &self.industries[target.sector];
            let valuation = Valuation {
                kind,
                date: self.date,
                low: mul_bps(mid, 10_000 - error_bps),
                mid,
                high: mul_bps(mid, 10_000 + error_bps),
                error_bps,
                ebitda,
                multiple_millis: if ebitda > 0 { ratio_millis(mid, ebitda) } else { 0 },
                sector_multiple_millis: if kind == ValuationKind::Adviser {
                    industry.base_multiple_millis
                } else {
                    0
                },
                net_debt: target.net_debt(),
                fee: if kind == ValuationKind::Adviser { self.valuation_fee() } else { 0 },
            };
            self.deals[index].valuation = Some(valuation);
            self.post(MessageKind::ValuationReady { kind }, Some(company));
        }
    }
}
