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

/// How a rival house behaves. Aggression shifts every bid; a focus sector
/// earns a further premium; the size band is what the house will look at.
pub struct HouseStyle {
    pub aggression_bps: i64,
    pub focus: Option<&'static str>,
    /// Trailing EBITDA the house will buy, thousand USD.
    pub min_ebitda: i64,
    pub max_ebitda: i64,
}

pub const HOUSE_STYLES: [HouseStyle; RIVAL_HOUSES] = [
    // Halberd: large, disciplined, industrial.
    HouseStyle {
        aggression_bps: -150,
        focus: Some("industrial_components"),
        min_ebitda: 12_000,
        max_ebitda: i64::MAX,
    },
    // Northmere: pays up for healthcare.
    HouseStyle {
        aggression_bps: 150,
        focus: Some("healthcare_services"),
        min_ebitda: 6_000,
        max_ebitda: i64::MAX,
    },
    // Calder Wharf: logistics specialist, fair prices.
    HouseStyle {
        aggression_bps: 0,
        focus: Some("cold_chain_logistics"),
        min_ebitda: 3_000,
        max_ebitda: 40_000,
    },
    // Ninth Meridian: generalist that overpays in auctions.
    HouseStyle {
        aggression_bps: 350,
        focus: None,
        min_ebitda: 8_000,
        max_ebitda: i64::MAX,
    },
    // Wabash Row: small-cap value buyer.
    HouseStyle {
        aggression_bps: -300,
        focus: Some("building_products"),
        min_ebitda: 0,
        max_ebitda: 15_000,
    },
    // Larkmoor: services roll-ups.
    HouseStyle {
        aggression_bps: 200,
        focus: Some("business_services"),
        min_ebitda: 3_000,
        max_ebitda: 30_000,
    },
    // Cinderfield: food, patient.
    HouseStyle {
        aggression_bps: -50,
        focus: Some("food_manufacturing"),
        min_ebitda: 4_000,
        max_ebitda: 50_000,
    },
    // Harrow & Pike: small generalist.
    HouseStyle {
        aggression_bps: 50,
        focus: None,
        min_ebitda: 0,
        max_ebitda: 12_000,
    },
];

/// What a rival house has done since the game opened.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct HouseRecord {
    pub deals: u32,
    pub exits: u32,
    pub invested: i64,
    pub returned: i64,
}

/// Where the player's bid stands once the final round opens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Standing {
    /// 1 is the leading bid.
    pub rank: usize,
    pub bidders: usize,
    /// The best rival bid. The view shows it as a range.
    pub lead_ev: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SaleReason {
    Retirement,
    Succession,
    FundExit,
    NonCore,
    Distress,
    /// A listed company's board looks at offers.
    StrategicReview,
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
    /// The last month of bidding: bidders have seen the field and may raise.
    #[serde(default)]
    pub final_round: bool,
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
            // Public shareholders want a premium over what the business is worth as it stands.
            SaleReason::StrategicReview => 11_500,
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
                let chance = if held < 36 {
                    10
                } else {
                    (80 + (held - 36) * 5).min(350)
                };
                (chance, SaleReason::FundExit)
            }
            Owner::Corporate => {
                let stressed = matches!(self.economy.phase, Phase::Slowdown | Phase::Recession);
                (if stressed { 105 } else { 45 }, SaleReason::NonCore)
            }
            Owner::Lender => (900, SaleReason::Distress),
            Owner::Public => (30, SaleReason::StrategicReview),
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
        self.rng
            .chance_bps(chance.clamp(0, 10_000) as u32)
            .then_some(reason)
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
                            final_round: false,
                        });
                        if self.process_visible(index) {
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
            let process = self.companies[index]
                .process
                .as_mut()
                .expect("process exists");
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
        if stage == Stage::Bidding && months_left == 1 {
            self.open_final_round(index);
        }
        if months_left > 0 {
            return;
        }
        match stage {
            Stage::Preparing | Stage::Exclusive => {
                let rivals = self.draw_interest(index);
                let months = self.rng.range(2, 3) as u32;
                let process = self.companies[index]
                    .process
                    .as_mut()
                    .expect("process exists");
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
                let mut rivals = self.companies[index]
                    .process
                    .as_ref()
                    .expect("process exists")
                    .rivals
                    .clone();
                rivals.retain(|_| !self.rng.chance_bps(2_000));
                let sector_id = self.industries[self.companies[index].sector]
                    .sector_id
                    .clone();
                let difficulty = self.options.difficulty.rival_bias_bps();
                for rival in &mut rivals {
                    let factor = match rival.bidder {
                        Bidder::Strategic => {
                            10_550
                                + self.rng.noise(550)
                                + if phase == Phase::Expansion { 250 } else { -350 }
                        }
                        Bidder::House { house } => {
                            let style = &HOUSE_STYLES[house as usize % RIVAL_HOUSES];
                            let focus = if style.focus == Some(sector_id.as_str()) {
                                350
                            } else {
                                0
                            };
                            10_050 + style.aggression_bps + focus + self.rng.noise(450)
                                - (spread - 400) * 2
                        }
                        Bidder::Player => 0,
                    };
                    // Control of a listed company costs a premium to everyone.
                    let premium = if reason == SaleReason::StrategicReview {
                        1_500
                    } else {
                        0
                    };
                    rival.ev = mul_bps(
                        model_ev,
                        (factor + difficulty + premium).clamp(6_500, 13_800),
                    );
                }
                let months = self.rng.range(2, 3) as u32;
                let process = self.companies[index]
                    .process
                    .as_mut()
                    .expect("process exists");
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
        let ebitda = company.ttm_ebitda();
        let phase = match self.economy.phase {
            Phase::Expansion => 1,
            Phase::Recession => -2,
            Phase::Slowdown => -1,
            Phase::Recovery => 0,
        };
        let count = (3 + (quality - 10_000) / 700 + phase + self.rng.noise(1)).clamp(0, 7);
        let mut rivals: Vec<RivalBid> = Vec::new();
        for _ in 0..count {
            let bidder = if self.rng.chance_bps(3_000) {
                Bidder::Strategic
            } else {
                let house = self.rng.below(RIVAL_HOUSES as u64) as u8;
                let style = &HOUSE_STYLES[house as usize];
                // A house passes on what is outside its size band.
                if ebitda < style.min_ebitda || ebitda > style.max_ebitda {
                    continue;
                }
                Bidder::House { house }
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
        // Some owners hold out; some want it done.
        let stance = match self.companies[index].stance {
            crate::company::Stance::PriceMaximizer => 300,
            crate::company::Stance::Hurried => -300,
            _ => 0,
        };
        mul_bps(self.model_ev(index), process.reason.reserve_bps() + stance)
    }

    pub(crate) fn auction_outcome(&self, index: usize) -> Outcome {
        let process = self.companies[index]
            .process
            .as_ref()
            .expect("process exists");
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
                let had_bid = self.companies[index]
                    .process
                    .as_ref()
                    .is_some_and(|p| p.player_bid.is_some());
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

    /// Books a sale by whoever owns the company now, if that is a rival house.
    pub(crate) fn record_house_exit(&mut self, index: usize, ev: i64) {
        if let Owner::Sponsor { house, .. } = self.companies[index].owner {
            let proceeds = (ev - self.companies[index].net_debt()).max(0);
            let record = &mut self.houses[house as usize % RIVAL_HOUSES];
            record.exits += 1;
            record.returned += proceeds;
            self.companies[index].sponsor_cost = 0;
        }
    }

    pub(crate) fn record_house_entry(&mut self, index: usize, house: u8, equity: i64) {
        let record = &mut self.houses[house as usize % RIVAL_HOUSES];
        record.deals += 1;
        record.invested += equity.max(0);
        self.companies[index].sponsor_cost = equity.max(0);
    }

    /// The last month: rivals see the field and some raise. The player hears where they stand.
    fn open_final_round(&mut self, index: usize) {
        let already = self.companies[index]
            .process
            .as_ref()
            .is_some_and(|process| process.final_round);
        if already {
            return;
        }
        let mut rivals = self.companies[index]
            .process
            .as_ref()
            .expect("process exists")
            .rivals
            .clone();
        for rival in &mut rivals {
            let eager = match rival.bidder {
                Bidder::House { house } => {
                    4_000 + HOUSE_STYLES[house as usize % RIVAL_HOUSES].aggression_bps * 6
                }
                _ => 4_500,
            };
            if self.rng.chance_bps(eager.clamp(1_000, 8_000) as u32) {
                rival.ev = mul_bps(rival.ev, 10_000 + self.rng.range(50, 300));
            }
        }
        let process = self.companies[index]
            .process
            .as_mut()
            .expect("process exists");
        process.rivals = rivals;
        process.final_round = true;
        if let Some(standing) = self.standing(index) {
            self.post(
                MessageKind::FinalRound {
                    rank: standing.rank,
                    bidders: standing.bidders,
                },
                Some(index),
            );
        }
    }

    /// Where the player's bid ranks, counting the seller's certainty premium.
    pub fn standing(&self, index: usize) -> Option<Standing> {
        let process = self.companies[index].process.as_ref()?;
        let bid = process.player_bid.as_ref()?;
        let weighed = mul_bps(bid.ev, 10_000 + bid.certainty_bps);
        let ahead = process
            .rivals
            .iter()
            .filter(|rival| rival.ev > weighed)
            .count();
        Some(Standing {
            rank: ahead + 1,
            bidders: process.rivals.len() + 1,
            lead_ev: process
                .rivals
                .iter()
                .map(|rival| rival.ev)
                .max()
                .unwrap_or(0),
        })
    }

    fn transfer_to_rival(&mut self, index: usize, bidder: Bidder, ev: i64) {
        self.record_house_exit(index, ev);
        let senior = self.economy.max_senior_millis();
        let spread = self.economy.credit_spread_bps;
        let industry = self.industries[self.companies[index].sector].clone();
        let ebitda = self.companies[index].ttm_ebitda().max(0);
        match bidder {
            Bidder::House { house } => {
                let debt = (ebitda * senior / 1_000).min(ev * 6 / 10);
                let company = &mut self.companies[index];
                company.acquire(&industry, ev, debt);
                company.debt_spread_bps = spread;
                company.owner = Owner::Sponsor {
                    house,
                    months_held: 0,
                };
                self.record_house_entry(index, house, ev - debt);
            }
            _ => {
                let debt = (ev / 5).min(ebitda * 2);
                let company = &mut self.companies[index];
                company.acquire(&industry, ev, debt);
                company.debt_spread_bps = industry.interest_spread_bps;
                company.owner = Owner::Corporate;
            }
        }
        let company = &mut self.companies[index];
        company.process = None;
        company.cooldown = 24;
        company.relationship = 0;
    }

    /// Whether the player would hear about this company's sale.
    pub(crate) fn is_followed(&self, index: usize) -> bool {
        let company = &self.companies[index];
        company.watched
            || company.relationship >= 25
            || self.deals.iter().any(|deal| deal.company == index)
    }

    /// Whether a process is visible to the player at all.
    pub(crate) fn process_visible(&self, index: usize) -> bool {
        let company = &self.companies[index];
        match &company.process {
            None => false,
            Some(process) => {
                process.stage != Stage::Preparing
                    || company.relationship >= self.early_notice_threshold()
                    || self.insight.get(company.sector).copied().unwrap_or(0) > 0
            }
        }
    }

    pub(crate) fn live_processes(&self) -> usize {
        self.companies
            .iter()
            .filter(|company| company.is_active() && company.process.is_some())
            .count()
    }
}
