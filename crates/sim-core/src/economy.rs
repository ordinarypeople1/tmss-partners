//! Rates, the business cycle, credit, and sector cycles.
//!
//! Nothing here is a price. The policy rate moves only at FOMC meetings, which
//! `macro_events` runs. The phase is a slow Markov chain that the macro state
//! leans on. Every number is a placeholder.

use serde::{Deserialize, Serialize};

use crate::content::Industry;
use crate::rng::Rng;

pub const RATE_FLOOR_BPS: i64 = 0;
pub const RATE_CAP_BPS: i64 = 800;
/// Monthly revenue growth a bloc's news can add or take, in basis points.
pub const BLOC_GROWTH_CAP_BPS: i64 = 15;
/// How far a bloc's news can move its multiples, in basis points.
pub const BLOC_MULTIPLE_CAP_BPS: i64 = 800;
/// How far laws can move a bloc's tax rate, in basis points.
pub const TAX_DELTA_CAP_BPS: i64 = 600;
/// The most a bloc's politics can add to the chance a regulator refuses a foreign buyer.
pub const APPROVAL_DRAG_CAP_BPS: i64 = 1_500;
/// Tariffs in force, as a drag on exporters' growth.
pub const TRADE_DRAG_CAP_BPS: i64 = 600;
/// Energy prices above normal, as a drag on energy-heavy companies.
pub const ENERGY_SHOCK_CAP_BPS: i64 = 900;
const BLOCS: usize = crate::macro_events::BLOC_COUNT;
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
    /// Monthly growth the news adds per bloc, in `macro_events::BLOCS` order.
    #[serde(default)]
    pub bloc_growth_bps: Vec<i64>,
    /// Multiplier the news puts on each bloc's multiples, around zero.
    #[serde(default)]
    pub bloc_multiple_bps: Vec<i64>,
    /// 0–100 per bloc. Owners wait and IPOs stall when it is high.
    #[serde(default = "base_uncertainty")]
    pub uncertainty: Vec<i64>,
    /// Added to every company's tax rate in a bloc, by law.
    #[serde(default)]
    pub bloc_tax_delta_bps: Vec<i64>,
    /// Added to the chance a regulator in the bloc refuses a foreign buyer.
    #[serde(default)]
    pub bloc_approval_drag_bps: Vec<i64>,
    #[serde(default)]
    pub trade_drag_bps: i64,
    #[serde(default)]
    pub energy_shock_bps: i64,
    /// Each bloc's own policy rate, in `macro_events::BLOCS` order. The US slot
    /// is `policy_rate_bps`. Companies borrow at their bloc's rate.
    #[serde(default)]
    pub bloc_policy_rate_bps: Vec<i64>,
}

/// Where each bloc's rate sits when it neither helps nor holds back, by bloc
/// index. The US slot is replaced by the game's own neutral rate.
const BLOC_NEUTRAL_BPS: [i64; BLOCS] = [0, 200, 320, 225, 25, 250];

fn base_uncertainty() -> Vec<i64> {
    vec![crate::macro_events::UNCERTAINTY_BASE; BLOCS]
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
            bloc_growth_bps: vec![0; BLOCS],
            bloc_multiple_bps: vec![0; BLOCS],
            uncertainty: base_uncertainty(),
            bloc_tax_delta_bps: vec![0; BLOCS],
            bloc_approval_drag_bps: vec![0; BLOCS],
            trade_drag_bps: 0,
            energy_shock_bps: 0,
            bloc_policy_rate_bps: Vec::new(),
        };
        economy.record();
        economy
    }

    /// One month. `growth_signal_bps` is the macro state's read of output,
    /// around zero; weak readings hasten a downturn and strong ones end it.
    pub fn step(
        &mut self,
        rng: &mut Rng,
        industries: &[Industry],
        growth_signal_bps: i64,
    ) -> Vec<EconomyNews> {
        let mut news = Vec::new();
        self.phase_months += 1;
        if let Some(next) = self.next_phase(rng, growth_signal_bps) {
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

        self.record();
        news
    }

    fn next_phase(&self, rng: &mut Rng, signal: i64) -> Option<Phase> {
        let tight = self.policy_rate_bps >= self.neutral_rate_bps + 200;
        let weak = (-signal).clamp(0, 300) as u32;
        let strong = signal.clamp(0, 300) as u32;
        match self.phase {
            Phase::Expansion if self.phase_months >= 24 => rng
                .chance_bps(if tight { 450 } else { 220 } + weak * 2)
                .then_some(Phase::Slowdown),
            Phase::Slowdown if self.phase_months >= 3 => {
                if rng.chance_bps(if tight { 1_400 } else { 900 } + weak * 3) {
                    Some(Phase::Recession)
                } else if rng.chance_bps(700 + strong * 3) {
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

    /// Pads the per-bloc arrays of a save from before all six blocs.
    pub fn ensure_blocs(&mut self) {
        for (slot, fill) in [
            (&mut self.bloc_growth_bps, 0),
            (&mut self.bloc_multiple_bps, 0),
            (&mut self.uncertainty, crate::macro_events::UNCERTAINTY_BASE),
            (&mut self.bloc_tax_delta_bps, 0),
            (&mut self.bloc_approval_drag_bps, 0),
        ] {
            slot.resize(BLOCS, fill);
        }
    }

    /// The news fades: growth by a fifth a month, multiples by a tenth,
    /// energy by a tenth, tariffs and regulators slowly. Laws stay.
    pub fn decay_tilts(&mut self) {
        for slot in &mut self.bloc_growth_bps {
            *slot = *slot * 80 / 100;
        }
        for slot in &mut self.bloc_multiple_bps {
            *slot = *slot * 90 / 100;
        }
        for slot in &mut self.bloc_approval_drag_bps {
            *slot = *slot * 98 / 100;
        }
        self.trade_drag_bps = self.trade_drag_bps * 97 / 100;
        self.energy_shock_bps = self.energy_shock_bps * 90 / 100;
    }

    /// The bloc's neutral rate.
    pub fn neutral_for_bloc(&self, index: usize) -> i64 {
        if index == 0 {
            self.neutral_rate_bps
        } else {
            BLOC_NEUTRAL_BPS.get(index).copied().unwrap_or(self.neutral_rate_bps)
        }
    }

    fn bloc_slot(country: &str) -> Option<usize> {
        crate::macro_events::Bloc::of_country(country).map(|bloc| bloc.index())
    }

    /// The policy rate a company in this country borrows over.
    pub fn policy_rate_for(&self, country: &str) -> i64 {
        match Self::bloc_slot(country) {
            Some(0) | None => self.policy_rate_bps,
            Some(index) => self.bloc_policy_rate_bps.get(index).copied().unwrap_or(self.policy_rate_bps),
        }
    }

    /// The local neutral rate for this country.
    pub fn neutral_for(&self, country: &str) -> i64 {
        match Self::bloc_slot(country) {
            Some(index) if !self.bloc_policy_rate_bps.is_empty() => self.neutral_for_bloc(index),
            _ => self.neutral_rate_bps,
        }
    }

    /// `rate_factor_millis` on the local rate and its own neutral.
    pub fn rate_factor_for(&self, country: &str, rate_beta_millis: i64) -> i64 {
        let gap = self.policy_rate_for(country) - self.neutral_for(country);
        let drag = rate_beta_millis * gap / 10_000;
        1_000_000 / (1_000 + drag).max(400)
    }

    /// Senior debt local lenders write: the global market, tighter where the
    /// local rate stands further above its neutral than the Fed's does.
    pub fn max_senior_for(&self, country: &str) -> i64 {
        let global = self.max_senior_millis();
        let local_gap = self.policy_rate_for(country) - self.neutral_for(country);
        let us_gap = self.policy_rate_bps - self.neutral_rate_bps;
        (global - (local_gap - us_gap) * 2).clamp(2_500, 5_000)
    }

    pub fn senior_rate_for(&self, country: &str) -> i64 {
        self.policy_rate_for(country) + self.credit_spread_bps
    }

    pub fn tax_delta_for(&self, country: &str) -> i64 {
        crate::macro_events::Bloc::of_country(country)
            .map(|bloc| self.bloc_tax_delta_bps[bloc.index()])
            .unwrap_or(0)
    }

    pub fn approval_drag_for(&self, country: &str) -> i64 {
        crate::macro_events::Bloc::of_country(country)
            .map(|bloc| self.bloc_approval_drag_bps[bloc.index()])
            .unwrap_or(0)
    }

    pub fn bloc_growth_for(&self, country: &str) -> i64 {
        crate::macro_events::Bloc::of_country(country)
            .map(|bloc| self.bloc_growth_bps[bloc.index()])
            .unwrap_or(0)
    }

    pub fn bloc_multiple_for(&self, country: &str) -> i64 {
        crate::macro_events::Bloc::of_country(country)
            .map(|bloc| self.bloc_multiple_bps[bloc.index()])
            .unwrap_or(0)
    }

    pub fn uncertainty_for(&self, country: &str) -> i64 {
        crate::macro_events::Bloc::of_country(country)
            .map(|bloc| self.uncertainty[bloc.index()])
            .unwrap_or(crate::macro_events::UNCERTAINTY_BASE)
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
            * (10_000 + self.bloc_multiple_bps[0])
            / 10_000
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
    fn on_its_own_the_economy_leaves_the_rate_alone_and_keeps_spreads_in_bounds() {
        let industries = industries();
        for seed in 0..20 {
            let mut rng = Rng::new(seed);
            let mut economy = Economy::new(1, &mut rng, Era::HighRates);
            let rate = economy.policy_rate_bps;
            for _ in 1..=480 {
                economy.step(&mut rng, &industries, 0);
                assert_eq!(economy.policy_rate_bps, rate);
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
        for _ in 1..=480 {
            economy.step(&mut rng, &industries, 0);
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
