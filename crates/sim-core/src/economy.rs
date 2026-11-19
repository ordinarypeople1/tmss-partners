//! Rates, the business cycle, credit, and sector cycles.
//!
//! Nothing here is a price. The policy rate moves at most one step a quarter.
//! The phase is a slow Markov chain. Every number is a placeholder.

use serde::{Deserialize, Serialize};

use crate::content::Industry;
use crate::rng::Rng;

const RATE_STEP_BPS: i64 = 25;
const RATE_FLOOR_BPS: i64 = 0;
const RATE_CAP_BPS: i64 = 800;
const HISTORY_MONTHS: usize = 240;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Expansion,
    Slowdown,
    Recession,
    Recovery,
}

/// Where the game opens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Era {
    /// Rates well above neutral, a mature expansion. Entries are cheap, debt is dear.
    #[default]
    HighRates,
    /// Rates at the floor early in an expansion. Everything is expensive and lenders are generous.
    CheapMoney,
    /// A long expansion with tight money. A downturn is close.
    LateCycle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EconomyPoint {
    pub policy_rate_bps: i64,
    pub credit_spread_bps: i64,
    pub valuation_index: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Economy {
    pub policy_rate_bps: i64,
    pub neutral_rate_bps: i64,
    pub phase: Phase,
    pub phase_months: u32,
    /// Leveraged loan spread over the policy rate.
    pub credit_spread_bps: i64,
    /// One slow wave per sector, in basis points around zero.
    pub sector_cycle_bps: Vec<i64>,
    pub history: Vec<EconomyPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EconomyNews {
    RateChanged { from_bps: i64, to_bps: i64 },
    PhaseChanged { from: Phase, to: Phase },
}

impl Economy {
    /// Each game draws its own neutral rate, so not every era ends in cheap money.
    pub fn new(sectors: usize, rng: &mut Rng, era: Era) -> Self {
        let neutral_rate_bps = 275 + 25 * rng.range(0, 6);
        let (policy_rate_bps, phase_months, credit_spread_bps) = match era {
            Era::HighRates => (525, 18, 400),
            Era::CheapMoney => (150, 8, 340),
            Era::LateCycle => (neutral_rate_bps + 225, 58, 380),
        };
        let mut economy = Economy {
            policy_rate_bps,
            neutral_rate_bps,
            phase: Phase::Expansion,
            phase_months,
            credit_spread_bps,
            sector_cycle_bps: vec![0; sectors],
            history: Vec::new(),
        };
        economy.record();
        economy
    }

    pub fn step(
        &mut self,
        rng: &mut Rng,
        industries: &[Industry],
        closes_quarter: bool,
    ) -> Vec<EconomyNews> {
        let mut news = Vec::new();
        self.phase_months += 1;
        if let Some(next) = self.next_phase(rng) {
            news.push(EconomyNews::PhaseChanged {
                from: self.phase,
                to: next,
            });
            self.phase = next;
            self.phase_months = 0;
        }

        let spread_target = match self.phase {
            Phase::Expansion => 375,
            Phase::Slowdown => 475,
            Phase::Recession => 750,
            Phase::Recovery => 500,
        };
        self.credit_spread_bps += (spread_target - self.credit_spread_bps) / 4 + rng.noise(12);
        self.credit_spread_bps = self.credit_spread_bps.clamp(250, 1_100);

        for (cycle, industry) in self.sector_cycle_bps.iter_mut().zip(industries) {
            let amplitude = industry.cycle_amplitude_bps;
            let pull = match self.phase {
                Phase::Recession => -amplitude / 6,
                Phase::Slowdown => -amplitude / 20,
                Phase::Recovery => amplitude / 12,
                Phase::Expansion => amplitude / 40,
            };
            *cycle = *cycle * 96 / 100 + pull + rng.noise(amplitude / 10);
            *cycle = (*cycle).clamp(-amplitude * 3 / 2, amplitude * 3 / 2);
        }

        if closes_quarter {
            if let Some(change) = self.step_policy_rate(rng) {
                news.push(change);
            }
        }
        self.record();
        news
    }

    fn next_phase(&self, rng: &mut Rng) -> Option<Phase> {
        let tight = self.policy_rate_bps >= self.neutral_rate_bps + 200;
        match self.phase {
            Phase::Expansion if self.phase_months >= 24 => rng
                .chance_bps(if tight { 450 } else { 220 })
                .then_some(Phase::Slowdown),
            Phase::Slowdown if self.phase_months >= 3 => {
                if rng.chance_bps(if tight { 1_400 } else { 900 }) {
                    Some(Phase::Recession)
                } else if rng.chance_bps(700) {
                    Some(Phase::Expansion)
                } else {
                    None
                }
            }
            Phase::Recession if self.phase_months >= 6 => {
                rng.chance_bps(1_500).then_some(Phase::Recovery)
            }
            Phase::Recovery if self.phase_months >= 4 => {
                rng.chance_bps(1_500).then_some(Phase::Expansion)
            }
            _ => None,
        }
    }

    /// A slow path, not a ticker: at most one step a quarter, pulled toward a
    /// target that sits below neutral in a recession and above it late in an
    /// expansion.
    fn step_policy_rate(&mut self, rng: &mut Rng) -> Option<EconomyNews> {
        let target = self.neutral_rate_bps
            + match self.phase {
                Phase::Recession => -200,
                Phase::Recovery => -100,
                Phase::Slowdown => 0,
                Phase::Expansion if self.phase_months > 36 => 150,
                Phase::Expansion => 25,
            };
        let gap = target - self.policy_rate_bps;
        let move_chance = if gap.abs() >= 150 { 6_000 } else { 3_000 };
        if !rng.chance_bps(move_chance) {
            return None;
        }
        let toward = gap.signum();
        let direction = if toward == 0 {
            if rng.chance_bps(5_000) {
                1
            } else {
                -1
            }
        } else if rng.chance_bps(8_000) {
            toward
        } else {
            -toward
        };
        let from = self.policy_rate_bps;
        let to = (from + direction * RATE_STEP_BPS).clamp(RATE_FLOOR_BPS, RATE_CAP_BPS);
        if to == from {
            return None;
        }
        self.policy_rate_bps = to;
        Some(EconomyNews::RateChanged {
            from_bps: from,
            to_bps: to,
        })
    }

    fn record(&mut self) {
        self.history.push(EconomyPoint {
            policy_rate_bps: self.policy_rate_bps,
            credit_spread_bps: self.credit_spread_bps,
            valuation_index: self.valuation_index(),
        });
        if self.history.len() > HISTORY_MONTHS {
            self.history.remove(0);
        }
    }

    /// Multiplier on every multiple for the phase, in basis points.
    pub fn phase_multiple_bps(&self) -> i64 {
        match self.phase {
            Phase::Expansion => 10_300,
            Phase::Slowdown => 9_700,
            Phase::Recession => 8_500,
            Phase::Recovery => 9_500,
        }
    }

    /// `1 / (1 + beta × (policy − neutral))` in thousandths.
    pub fn rate_factor_millis(&self, rate_beta_millis: i64) -> i64 {
        let drag = rate_beta_millis * (self.policy_rate_bps - self.neutral_rate_bps) / 10_000;
        1_000_000 / (1_000 + drag).max(400)
    }

    /// 100 is a normal market. The screen's one-number read of valuations.
    pub fn valuation_index(&self) -> i64 {
        self.rate_factor_millis(7_000) * self.phase_multiple_bps() / 100_000
    }

    /// Monthly revenue growth the phase and the sector wave add, in basis points.
    pub fn growth_bps(&self, sector: usize, industry: &Industry) -> i64 {
        let beta = industry.cycle_amplitude_bps;
        let phase = match self.phase {
            Phase::Expansion => 5,
            Phase::Slowdown => -15 * beta / 600,
            Phase::Recession => -70 * beta / 600,
            Phase::Recovery => 25 * beta / 600,
        };
        phase + self.sector_cycle_bps[sector] / 60
    }

    /// Senior debt lenders will write, in thousandths of a turn of EBITDA.
    pub fn max_senior_millis(&self) -> i64 {
        (4_500 - (self.credit_spread_bps - 375) * 4).clamp(2_500, 5_000)
    }

    pub fn max_mezz_millis(&self) -> i64 {
        match self.phase {
            Phase::Recession => 500,
            Phase::Slowdown => 750,
            _ => 1_250,
        }
    }

    pub fn senior_rate_bps(&self) -> i64 {
        self.policy_rate_bps + self.credit_spread_bps
    }

    pub fn mezz_rate_bps(&self) -> i64 {
        self.policy_rate_bps + self.credit_spread_bps + 450
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn industries() -> Vec<Industry> {
        vec![Industry {
            sector_id: "test".into(),
            monthly_growth_bps: 30,
            monthly_growth_std_bps: 60,
            monthly_da_rate_bps: 60,
            capex_ratio_bps: 250,
            interest_spread_bps: 300,
            tax_rate_bps: 2_500,
            dso_days: 45,
            dio_days: 40,
            dpo_days: 35,
            min_cash_to_revenue_bps: 700,
            dividend_payout_bps: 800,
            dividend_leverage_cap_millis: 4_000,
            base_multiple_millis: 8_000,
            rate_beta_millis: 6_000,
            cycle_amplitude_bps: 600,
            multiple_floor_millis: 4_500,
            multiple_cap_millis: 12_000,
        }]
    }

    #[test]
    fn the_rate_moves_one_step_at_quarter_ends_and_stays_in_bounds() {
        let industries = industries();
        for seed in 0..20 {
            let mut rng = Rng::new(seed);
            let mut economy = Economy::new(1, &mut rng, Era::HighRates);
            for month in 1..=480 {
                let before = economy.policy_rate_bps;
                economy.step(&mut rng, &industries, month % 3 == 0);
                let moved = (economy.policy_rate_bps - before).abs();
                assert!(moved == 0 || moved == RATE_STEP_BPS);
                if month % 3 != 0 {
                    assert_eq!(moved, 0);
                }
                assert!((RATE_FLOOR_BPS..=RATE_CAP_BPS).contains(&economy.policy_rate_bps));
                assert!((250..=1_100).contains(&economy.credit_spread_bps));
            }
        }
    }

    #[test]
    fn forty_years_visit_every_phase() {
        let industries = industries();
        let mut rng = Rng::new(11);
        let mut economy = Economy::new(1, &mut rng, Era::HighRates);
        let mut seen = Vec::new();
        for month in 1..=480 {
            economy.step(&mut rng, &industries, month % 3 == 0);
            if !seen.contains(&economy.phase) {
                seen.push(economy.phase);
            }
        }
        assert_eq!(seen.len(), 4);
    }

    fn open_high() -> i64 {
        Economy::new(1, &mut Rng::new(0), Era::HighRates).max_senior_millis()
    }

    #[test]
    fn higher_rates_lower_the_rate_factor_and_recessions_shut_credit() {
        let mut economy = Economy::new(1, &mut Rng::new(0), Era::HighRates);
        let high = economy.rate_factor_millis(6_000);
        economy.policy_rate_bps = economy.neutral_rate_bps;
        assert_eq!(economy.rate_factor_millis(6_000), 1_000);
        let cheap = Economy::new(1, &mut Rng::new(0), Era::CheapMoney);
        assert!(cheap.rate_factor_millis(6_000) > 1_000);
        assert!(cheap.max_senior_millis() > open_high());
        assert!(high < 1_000);
        let open = economy.max_senior_millis();
        economy.credit_spread_bps = 750;
        assert!(economy.max_senior_millis() < open);
    }
}
