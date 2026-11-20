//! The blind pool, its cash flows, and the player's career.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::math::{irr_bps, mul_bps, ratio_millis};
use crate::portfolio::ExitRoute;

pub const INVESTMENT_MONTHS: u32 = 60;
pub const TERM_MONTHS: u32 = 120;
/// Largest equity check as a share of commitments.
pub const CONCENTRATION_LIMIT_BPS: i64 = 2_000;
const FEE_INVESTING_BPS: i64 = 200;
const FEE_HARVEST_BPS: i64 = 150;
const HURDLE_BPS: i64 = 800;
const CARRY_BPS: i64 = 2_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Realized {
    pub company: String,
    pub acquired: GameDate,
    pub exited: GameDate,
    pub route: Option<ExitRoute>,
    pub cost: i64,
    pub proceeds: i64,
    pub moic_millis: i64,
    pub irr_bps: Option<i64>,
}

/// Proceeds agreed at an exit and paid later.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pending {
    pub due_month: u32,
    pub amount: i64,
    pub company: String,
}

/// Thousand USD. `flows` are (month index, amount) from the investors' side:
/// calls are negative, distributions positive.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fund {
    pub name: String,
    pub committed: i64,
    pub called: i64,
    pub distributed: i64,
    pub fees_paid: i64,
    pub deal_costs: i64,
    pub started: GameDate,
    /// First month in which the fund may no longer buy a new platform.
    pub investment_period_ends: GameDate,
    /// First month past the fund's term.
    pub term_ends: GameDate,
    pub flows: Vec<(u32, i64)>,
    pub realized: Vec<Realized>,
    pub pending: Vec<Pending>,
}

impl Fund {
    pub fn new(name: &str, committed: i64, started: GameDate) -> Fund {
        Fund {
            name: name.to_string(),
            committed,
            called: 0,
            distributed: 0,
            fees_paid: 0,
            deal_costs: 0,
            started,
            investment_period_ends: started.plus_months(INVESTMENT_MONTHS),
            term_ends: started.plus_months(TERM_MONTHS),
            flows: Vec::new(),
            realized: Vec::new(),
            pending: Vec::new(),
        }
    }

    pub fn uncalled(&self) -> i64 {
        self.committed - self.called
    }

    pub fn investing(&self, date: GameDate) -> bool {
        date < self.investment_period_ends
    }

    pub fn concentration_limit(&self) -> i64 {
        mul_bps(self.committed, CONCENTRATION_LIMIT_BPS)
    }

    /// Calls capital. Returns false, and calls nothing, if the commitments are spent.
    pub fn call(&mut self, amount: i64, month: u32) -> bool {
        if amount <= 0 {
            return true;
        }
        if amount > self.uncalled() {
            return false;
        }
        self.called += amount;
        self.flows.push((month, -amount));
        true
    }

    pub fn distribute(&mut self, amount: i64, month: u32) {
        if amount <= 0 {
            return;
        }
        self.distributed += amount;
        self.flows.push((month, amount));
    }

    /// Quarterly management fee: on commitments while investing, on invested cost after.
    pub fn quarterly_fee(&self, date: GameDate, invested_cost: i64) -> i64 {
        if self.investing(date) {
            mul_bps(self.committed, FEE_INVESTING_BPS) / 4
        } else {
            mul_bps(invested_cost, FEE_HARVEST_BPS) / 4
        }
    }

    pub fn dpi_millis(&self) -> i64 {
        ratio_millis(self.distributed, self.called)
    }

    pub fn tvpi_millis(&self, nav: i64) -> i64 {
        ratio_millis(self.distributed + nav + self.pending_total(), self.called)
    }

    pub fn pending_total(&self) -> i64 {
        self.pending.iter().map(|item| item.amount).sum()
    }

    /// Net IRR to investors, treating today's marks as a final distribution.
    pub fn net_irr_bps(&self, nav: i64, month: u32) -> Option<i64> {
        let mut flows = self.flows.clone();
        let terminal = nav + self.pending_total();
        if terminal > 0 {
            flows.push((month, terminal));
        }
        irr_bps(&flows)
    }

    /// Carry the house would earn if the fund were wound up at `nav` today.
    /// Whole-fund waterfall: capital back, an 8% compounding hurdle, then 20%
    /// of all profit.
    pub fn carry(&self, nav: i64, month: u32) -> i64 {
        let mut flows = self.flows.clone();
        let terminal = nav + self.pending_total();
        if terminal > 0 {
            flows.push((month, terminal));
        }
        flows.sort_by_key(|(at, _)| *at);
        let mut owed = 0_i64;
        let mut at = flows.first().map(|(first, _)| *first).unwrap_or(month);
        for (when, amount) in &flows {
            for _ in at..*when {
                owed += owed * HURDLE_BPS / 120_000;
            }
            at = *when;
            owed -= amount;
        }
        if owed > 0 {
            return 0;
        }
        let profit = self.distributed + terminal - self.called;
        mul_bps(profit.max(0), CARRY_BPS)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Rank {
    VicePresident,
    Principal,
    Partner,
    Founder,
}

impl Rank {
    pub fn attention(self) -> i64 {
        match self {
            Rank::VicePresident => 4,
            Rank::Principal => 6,
            Rank::Partner => 8,
            Rank::Founder => 10,
        }
    }
    pub fn max_live_deals(self) -> usize {
        match self {
            Rank::VicePresident => 2,
            Rank::Principal => 4,
            Rank::Partner => 6,
            Rank::Founder => 8,
        }
    }
    pub fn max_initiatives(self) -> usize {
        match self {
            Rank::VicePresident => 1,
            Rank::Principal => 2,
            _ => 3,
        }
    }
    /// The player's share of the carry pool.
    pub fn carry_share_bps(self) -> i64 {
        match self {
            Rank::VicePresident => 100,
            Rank::Principal => 500,
            Rank::Partner => 1_500,
            Rank::Founder => 6_000,
        }
    }
    /// Annual pay, thousand USD.
    pub fn salary(self) -> i64 {
        match self {
            Rank::VicePresident => 350,
            Rank::Principal => 700,
            Rank::Partner => 1_600,
            Rank::Founder => 2_500,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Career {
    pub rank: Rank,
    /// 0 through 100.
    pub reputation: i64,
    pub months_at_rank: u32,
    pub deals_closed: u32,
    pub exits: u32,
    pub best_moic_millis: i64,
    pub ic_rejections: u32,
    /// Personal savings, thousand USD.
    pub wealth: i64,
    pub carry_paid: i64,
    pub spinout_offered: bool,
    pub fired: bool,
    /// Associates on the founder's payroll. Each adds a point of attention.
    #[serde(default)]
    pub associates: i64,
    /// The player's own money in the fund.
    #[serde(default)]
    pub gp_commit: i64,
    #[serde(default)]
    pub perks: Vec<Perk>,
}

/// Things personal money buys.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Perk {
    /// Owners warm to the player faster.
    IndustryClub,
    /// Sales are heard of at a lower relationship.
    ConferenceCircuit,
}

impl Perk {
    pub fn cost(self) -> i64 {
        match self {
            Perk::IndustryClub => 150,
            Perk::ConferenceCircuit => 300,
        }
    }
}

pub const MAX_ASSOCIATES: i64 = 6;
/// Annual cost of one associate, thousand USD.
pub const ASSOCIATE_COST: i64 = 400;

impl Career {
    pub fn new() -> Career {
        Career {
            rank: Rank::VicePresident,
            reputation: 50,
            months_at_rank: 0,
            deals_closed: 0,
            exits: 0,
            best_moic_millis: 0,
            ic_rejections: 0,
            wealth: 250,
            carry_paid: 0,
            spinout_offered: false,
            fired: false,
            associates: 0,
            gp_commit: 0,
            perks: Vec::new(),
        }
    }

    /// A name is slow to build and quick to lose: gains shrink as it rises.
    pub fn adjust_reputation(&mut self, change: i64) {
        let change = if change > 0 {
            change * (100 - self.reputation) / 50
        } else {
            change
        };
        self.reputation = (self.reputation + change).clamp(0, 100);
    }

    /// The next rank, if the record has earned it.
    pub fn promotion(&self, tvpi_millis: i64) -> Option<Rank> {
        match self.rank {
            Rank::VicePresident
                if self.deals_closed >= 1 && self.reputation >= 56 && self.months_at_rank >= 18 =>
            {
                Some(Rank::Principal)
            }
            Rank::Principal
                if self.reputation >= 68
                    && self.months_at_rank >= 24
                    && (self.best_moic_millis >= 1_800
                        || (self.deals_closed >= 3 && tvpi_millis >= 1_350)) =>
            {
                Some(Rank::Partner)
            }
            _ => None,
        }
    }
}

impl Default for Career {
    fn default() -> Self {
        Career::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fund() -> Fund {
        Fund::new("Fund III", 750_000, GameDate::new(2024, 1))
    }

    #[test]
    fn the_clock_runs_five_and_ten_years() {
        let fund = fund();
        assert_eq!(fund.investment_period_ends, GameDate::new(2029, 1));
        assert_eq!(fund.term_ends, GameDate::new(2034, 1));
        assert!(fund.investing(GameDate::new(2028, 12)));
        assert!(!fund.investing(GameDate::new(2029, 1)));
    }

    #[test]
    fn a_call_cannot_exceed_commitments() {
        let mut fund = fund();
        assert!(fund.call(700_000, 0));
        assert!(!fund.call(60_000, 1));
        assert_eq!(fund.called, 700_000);
        assert_eq!(fund.uncalled(), 50_000);
    }

    #[test]
    fn multiples_and_irr_follow_the_flows() {
        let mut fund = fund();
        fund.call(100_000, 0);
        fund.distribute(50_000, 36);
        assert_eq!(fund.dpi_millis(), 500);
        assert_eq!(fund.tvpi_millis(150_000), 2_000);
        let irr = fund.net_irr_bps(150_000, 60).unwrap();
        assert!((1_500..=1_900).contains(&irr), "{irr}");
    }

    #[test]
    fn carry_waits_for_the_hurdle() {
        let mut fund = fund();
        fund.call(100_000, 0);
        // 8% for five years needs about 149 000 back.
        assert_eq!(fund.carry(140_000, 60), 0);
        assert_eq!(fund.carry(200_000, 60), 20_000);
    }

    #[test]
    fn fees_step_down_after_the_investment_period() {
        let fund = fund();
        assert_eq!(fund.quarterly_fee(GameDate::new(2024, 3), 0), 3_750);
        assert_eq!(fund.quarterly_fee(GameDate::new(2030, 3), 200_000), 750);
    }

    #[test]
    fn promotion_needs_a_closed_deal_and_a_name() {
        let mut career = Career::new();
        assert_eq!(career.promotion(1_000), None);
        career.deals_closed = 1;
        career.reputation = 60;
        career.months_at_rank = 20;
        assert_eq!(career.promotion(1_000), Some(Rank::Principal));
    }
}
