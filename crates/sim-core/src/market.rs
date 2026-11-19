//! Deal flow. A company comes to market because its owner has a reason, runs
//! a process with stages and a deadline, and ends in a sale, a failed
//! process, or a withdrawal. Rival houses and strategic buyers bid.

use serde::{Deserialize, Serialize};

use crate::company::Owner;
use crate::economy::Phase;
use crate::math::mul_bps;
use crate::world::{MessageKind, World};

pub const RIVAL_HOUSES: usize = 8;
/// Invented names. Not real firms.
pub const RIVAL_NAMES: [&str; RIVAL_HOUSES] = [
    "Halberd Capital",
    "Northmere Partners",
    "Calder Wharf Partners",
    "Ninth Meridian Capital",
    "Wabash Row Capital",
    "Larkmoor Capital",
    "Cinderfield Partners",
    "Harrow & Pike",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SaleReason {
    Retirement,
    Succession,
    FundExit,
    NonCore,
    Distress,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    /// The owner is hiring an adviser. Not public.
    Preparing,
    /// The teaser is out.
    Marketing,
    /// Final bids are due when the months run out.
    Bidding,
    /// The player negotiates alone.
    Exclusive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Bidder {
    House { house: u8 },
    Strategic,
    Player,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RivalBid {
    pub bidder: Bidder,
    /// Set when final bids open. Zero before.
    pub ev: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerBid {
    pub ev: i64,
    /// What the seller adds for certainty of closing, in basis points.
    pub certainty_bps: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Process {
    pub reason: SaleReason,
    pub stage: Stage,
    pub months_left: u32,
    pub rivals: Vec<RivalBid>,
    pub player_bid: Option<PlayerBid>,
}

impl SaleReason {
    /// The least the seller takes, as a share of model value.
    pub fn reserve_bps(self) -> i64 {
        match self {
            SaleReason::Retirement => 9_200,
            SaleReason::Succession => 9_000,
            SaleReason::FundExit => 9_600,
            SaleReason::NonCore => 9_000,
            SaleReason::Distress => 7_000,
        }
    }
}

pub enum Outcome {
    Player { ev: i64 },
    Rival { bidder: Bidder, ev: i64 },
    Failed,
}

impl World {
    /// Monthly chance, in basis points, that this owner starts a sale.
    fn sale_trigger(&mut self, index: usize) -> Option<SaleReason> {
        let company = &self.companies[index];
        let industry = &self.industries[company.sector];
        let distressed = company.shortfall || company.leverage_millis() >= 6_500;
        let (base, reason) = match company.owner {
            Owner::Founder { age } => {
                let chance = 35 + (i64::from(age) - 58).max(0) * 10;
                let reason = if age >= 63 {
                    SaleReason::Retirement
                } else {
                    SaleReason::Succession
                };
                (chance, reason)
            }
            Owner::Sponsor { months_held, .. } => {
                let held = i64::from(months_held);
                let chance = if held < 36 { 10 } else { (80 + (held - 36) * 5).min(350) };
                (chance, SaleReason::FundExit)
            }
            Owner::Corporate => {
                let stressed = matches!(self.economy.phase, Phase::Slowdown | Phase::Recession);
                (if stressed { 105 } else { 45 }, SaleReason::NonCore)
            }
            Owner::Lender => (900, SaleReason::Distress),
            Owner::Player | Owner::Merged => return None,
        };
        let _ = industry;
        let (chance, reason) = if distressed && company.owner != (Owner::Lender) {
            (600, SaleReason::Distress)
        } else {
            let market = match self.economy.phase {
                Phase::Recession => 55,
                Phase::Slowdown => 85,
                _ if self.economy.valuation_index() >= 100 => 130,
                _ => 100,
            };
            (base * market / 100, reason)
        };
        self.rng.chance_bps(chance.clamp(0, 10_000) as u32).then_some(reason)
    }

    pub(crate) fn market_step(&mut self) {
        for index in 0..self.companies.len() {
            if !self.companies[index].is_active() || self.companies[index].is_player_owned() {
                continue;
            }
            if self.companies[index].process.is_none() {
                if self.companies[index].cooldown == 0 {
                    if let Some(reason) = self.sale_trigger(index) {
                        let months_left = self.rng.range(2, 4) as u32;
                        self.companies[index].process = Some(Process {
                            reason,
                            stage: Stage::Preparing,
                            months_left,
                            rivals: Vec::new(),
                            player_bid: None,
                        });
                        if self.companies[index].relationship >= 40 {
                            self.post(MessageKind::SaleEarlyNotice { reason }, Some(index));
                        }
                    }
                }
                continue;
            }
            self.advance_process(index);
        }
    }

    fn advance_process(&mut self, index: usize) {
        let (stage, months_left, reason) = {
            let process = self.companies[index].process.as_mut().expect("process exists");
            process.months_left = process.months_left.saturating_sub(1);
            (process.stage, process.months_left, process.reason)
        };
        // A sale can be pulled when the market turns.
        if stage == Stage::Marketing
            && reason != SaleReason::Distress
            && self.economy.phase == Phase::Recession
            && self.rng.chance_bps(1_200)
        {
            self.end_process(index, 12, 24);
            if self.is_followed(index) {
                self.post(MessageKind::SaleWithdrawn, Some(index));
            }
            return;
        }
        if months_left > 0 {
            return;
        }
        match stage {
            Stage::Preparing | Stage::Exclusive => {
                let rivals = self.draw_interest(index);
                let months = self.rng.range(2, 3) as u32;
                let process = self.companies[index].process.as_mut().expect("process exists");
                process.stage = Stage::Marketing;
                process.months_left = months;
                process.rivals = rivals;
                if self.is_followed(index) {
                    self.post(MessageKind::SaleStarted { reason }, Some(index));
                }
            }
            Stage::Marketing => {
                let model_ev = self.model_ev(index);
                let spread = self.economy.credit_spread_bps;
                let phase = self.economy.phase;
                let mut rivals = self.companies[index].process.as_ref().expect("process exists").rivals.clone();
                rivals.retain(|_| !self.rng.chance_bps(2_000));
                for rival in &mut rivals {
                    let factor = match rival.bidder {
                        Bidder::Strategic => {
                            10_550 + self.rng.noise(550) + if phase == Phase::Expansion { 250 } else { -350 }
                        }
                        _ => 10_050 + self.rng.noise(500) - (spread - 400) * 2,
                    };
                    rival.ev = mul_bps(model_ev, factor.clamp(6_500, 12_500));
                }
                let months = self.rng.range(2, 3) as u32;
                let process = self.companies[index].process.as_mut().expect("process exists");
                process.stage = Stage::Bidding;
                process.months_left = months;
                process.rivals = rivals;
            }
            Stage::Bidding => self.resolve_auction(index),
        }
    }

    fn draw_interest(&mut self, index: usize) -> Vec<RivalBid> {
        let company = &self.companies[index];
        let quality = company.quality_bps(&self.industries[company.sector]);
        let phase = match self.economy.phase {
            Phase::Expansion => 1,
            Phase::Recession => -2,
            Phase::Slowdown => -1,
            Phase::Recovery => 0,
        };
        let count = (2 + (quality - 10_000) / 700 + phase + self.rng.noise(1)).clamp(0, 6);
        let mut rivals: Vec<RivalBid> = Vec::new();
        for _ in 0..count {
            let bidder = if self.rng.chance_bps(3_000) {
                Bidder::Strategic
            } else {
                Bidder::House {
                    house: self.rng.below(RIVAL_HOUSES as u64) as u8,
                }
            };
            if bidder != Bidder::Strategic && rivals.iter().any(|rival| rival.bidder == bidder) {
                continue;
            }
            rivals.push(RivalBid { bidder, ev: 0 });
        }
        rivals
    }

    /// The seller's floor for this company today.
    pub(crate) fn reserve_ev(&self, index: usize) -> i64 {
        let Some(process) = &self.companies[index].process else {
            return 0;
        };
        mul_bps(self.model_ev(index), process.reason.reserve_bps())
    }

    pub(crate) fn auction_outcome(&self, index: usize) -> Outcome {
        let process = self.companies[index].process.as_ref().expect("process exists");
        let reserve = self.reserve_ev(index);
        let best = process.rivals.iter().max_by_key(|rival| rival.ev);
        if let Some(bid) = &process.player_bid {
            let weighed = mul_bps(bid.ev, 10_000 + bid.certainty_bps);
            if bid.ev >= reserve && best.map_or(true, |rival| weighed >= rival.ev) {
                return Outcome::Player { ev: bid.ev };
            }
        }
        match best {
            Some(rival) if rival.ev >= reserve => Outcome::Rival {
                bidder: rival.bidder,
                ev: rival.ev,
            },
            _ => Outcome::Failed,
        }
    }

    fn resolve_auction(&mut self, index: usize) {
        match self.auction_outcome(index) {
            Outcome::Player { ev } => self.close_deal(index, ev),
            Outcome::Rival { bidder, ev } => {
                let had_bid = self.companies[index].process.as_ref().is_some_and(|p| p.player_bid.is_some());
                self.transfer_to_rival(index, bidder, ev);
                if had_bid {
                    self.post(MessageKind::AuctionLost { winner: bidder, ev }, Some(index));
                    self.career.adjust_reputation(-1);
                } else {
                    self.post_news(MessageKind::RivalDeal { buyer: bidder, ev }, Some(index));
                }
                self.drop_deal_record(index);
            }
            Outcome::Failed => {
                self.end_process(index, 12, 24);
                if self.is_followed(index) {
                    self.post(MessageKind::SaleFailed, Some(index));
                }
                self.drop_deal_record(index);
            }
        }
    }

    pub(crate) fn end_process(&mut self, index: usize, low: i64, high: i64) {
        let cooldown = self.rng.range(low, high) as u32;
        let company = &mut self.companies[index];
        company.process = None;
        company.cooldown = cooldown;
    }

    fn transfer_to_rival(&mut self, index: usize, bidder: Bidder, ev: i64) {
        let senior = self.economy.max_senior_millis();
        let spread = self.economy.credit_spread_bps;
        let industry = self.industries[self.companies[index].sector].clone();
        let company = &mut self.companies[index];
        let ebitda = company.ttm_ebitda().max(0);
        match bidder {
            Bidder::House { house } => {
                let debt = (ebitda * senior / 1_000).min(ev * 6 / 10);
                company.acquire(&industry, ev, debt);
                company.debt_spread_bps = spread;
                company.owner = Owner::Sponsor { house, months_held: 0 };
            }
            _ => {
                let debt = (ev / 5).min(ebitda * 2);
                company.acquire(&industry, ev, debt);
                company.debt_spread_bps = industry.interest_spread_bps;
                company.owner = Owner::Corporate;
            }
        }
        company.process = None;
        company.cooldown = 24;
        company.relationship = 0;
    }

    /// Whether the player would hear about this company's sale.
    pub(crate) fn is_followed(&self, index: usize) -> bool {
        let company = &self.companies[index];
        company.watched || company.relationship >= 25 || self.deals.iter().any(|deal| deal.company == index)
    }

    /// Whether a process is visible to the player at all.
    pub(crate) fn process_visible(&self, index: usize) -> bool {
        let company = &self.companies[index];
        match &company.process {
            None => false,
            Some(process) => process.stage != Stage::Preparing || company.relationship >= 40,
        }
    }

    pub(crate) fn live_processes(&self) -> usize {
        self.companies.iter().filter(|company| company.is_active() && company.process.is_some()).count()
    }
}
