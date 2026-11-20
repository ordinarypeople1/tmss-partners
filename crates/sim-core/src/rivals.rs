//! The rest of the market. Other houses court owners, raise funds, lose partners and stumble;
//! founders hand over and managers change desks. None of it waits for the player.

use serde::{Deserialize, Serialize};

use crate::company::{Ceo, Owner};
use crate::market::{Bidder, Process, SaleReason, Stage, HOUSE_STYLES, RIVAL_HOUSES};
use crate::sourcing::{Intent, KNOWN_AT};
use crate::world::{MessageKind, World};

/// With a rival at the owner's door, a trusted player may counter at this relationship.
pub const COUNTER_AT: i64 = 40;
/// How long an owner weighs a rival's unsolicited proposal.
const SUITOR_MONTHS: u32 = 3;

/// A rival house that has proposed to an owner who was not selling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Suitor {
    pub house: u8,
    pub months_left: u32,
}

impl World {
    /// Whether the player would know what happens at this company without a process.
    pub(crate) fn knows_owner(&self, index: usize) -> bool {
        let company = &self.companies[index];
        company.relationship >= KNOWN_AT || company.watched
    }

    /// What owners say about the player to each other, as a percentage-point swing.
    pub(crate) fn street_swing(&self) -> i64 {
        self.street / 4
    }

    pub(crate) fn adjust_street(&mut self, delta: i64) {
        self.street = (self.street + delta).clamp(-40, 40);
    }

    pub(crate) fn rivals_step(&mut self) {
        self.resolve_suitors();
        self.new_suitors();
        self.house_affairs();
        self.people_move();
        // Talk fades.
        if self.months_elapsed % 3 == 2 {
            self.street -= self.street.signum();
        }
    }

    fn resolve_suitors(&mut self) {
        for index in 0..self.companies.len() {
            let Some(mut suitor) = self.companies[index].suitor else {
                continue;
            };
            let company = &self.companies[index];
            if !company.is_active() || company.is_player_owned() || company.process.is_some() {
                self.companies[index].suitor = None;
                continue;
            }
            suitor.months_left = suitor.months_left.saturating_sub(1);
            if suitor.months_left > 0 {
                self.companies[index].suitor = Some(suitor);
                continue;
            }
            self.companies[index].suitor = None;
            let base = match self.intent(index) {
                Intent::Closed => 10,
                Intent::Thinking => 35,
                Intent::Open => 65,
                Intent::Eager => 88,
            };
            // An owner who knows the player well hesitates to sell to someone else.
            let odds = (base - self.companies[index].relationship / 5).clamp(5, 90);
            let known = self.knows_owner(index);
            let bidder = Bidder::House {
                house: suitor.house,
            };
            if self.rng.chance_bps((odds * 100) as u32) {
                let ev = self.reserve_ev(index) * 103 / 100;
                self.transfer_to_rival(index, bidder, ev);
                if known {
                    self.post(
                        MessageKind::LostToRival {
                            house: suitor.house,
                            ev,
                        },
                        Some(index),
                    );
                } else {
                    self.post_news(MessageKind::RivalDeal { buyer: bidder, ev }, Some(index));
                }
            } else if known {
                self.post(
                    MessageKind::RivalRebuffed {
                        house: suitor.house,
                    },
                    Some(index),
                );
            }
        }
    }

    fn new_suitors(&mut self) {
        for house in 0..RIVAL_HOUSES {
            if !self.rng.chance_bps(900) {
                continue;
            }
            let style = &HOUSE_STYLES[house];
            for _ in 0..8 {
                let index = self.rng.below(self.companies.len() as u64) as usize;
                let company = &self.companies[index];
                let ebitda = company.ttm_ebitda();
                let eligible = company.is_active()
                    && company.process.is_none()
                    && company.suitor.is_none()
                    && company.cooldown == 0
                    && matches!(company.owner, Owner::Founder { .. } | Owner::Corporate)
                    && ebitda >= style.min_ebitda
                    && ebitda <= style.max_ebitda
                    && self.sale_motive(index).is_some();
                if !eligible {
                    continue;
                }
                self.companies[index].suitor = Some(Suitor {
                    house: house as u8,
                    months_left: SUITOR_MONTHS,
                });
                if self.knows_owner(index) {
                    self.post(
                        MessageKind::RivalApproach { house: house as u8 },
                        Some(index),
                    );
                }
                break;
            }
        }
    }

    fn house_affairs(&mut self) {
        for house in 0..RIVAL_HOUSES {
            let record = &mut self.houses[house];
            if record.mood_months > 0 {
                record.mood_months -= 1;
                if record.mood_months == 0 {
                    record.mood_bps = 0;
                }
            }
            if !self.rng.chance_bps(500) {
                continue;
            }
            let roll = self.rng.below(100);
            let id = house as u8;
            if roll < 40 {
                // Fresh money bids harder.
                let size = self.rng.range(4, 15) * 100_000;
                self.houses[house].mood_bps = 200;
                self.houses[house].mood_months = 12;
                self.post_news(MessageKind::HouseFundraised { house: id, size }, None);
            } else if roll < 65 {
                self.houses[house].mood_bps = -300;
                self.houses[house].mood_months = 12;
                self.post_news(MessageKind::HousePartnerLeft { house: id }, None);
            } else if let Some(index) = self.most_levered_of(id) {
                // The lenders want out: a forced sale, already in the market.
                let months_left = self.rng.range(2, 3) as u32;
                self.companies[index].process = Some(Process {
                    reason: SaleReason::Distress,
                    stage: Stage::Marketing,
                    months_left,
                    rivals: Vec::new(),
                    player_bid: None,
                    final_round: false,
                    adviser: None,
                    format: crate::advisers::Format::Broad,
                    codename: String::new(),
                    shortlisted: None,
                });
                self.hire_adviser(index);
                self.post_news(MessageKind::HouseDistress { house: id }, Some(index));
                self.send_teaser(index);
            }
        }
    }

    fn most_levered_of(&self, house: u8) -> Option<usize> {
        self.companies
            .iter()
            .enumerate()
            .filter(|(_, company)| {
                company.is_active()
                    && company.process.is_none()
                    && matches!(company.owner, Owner::Sponsor { house: owner, .. } if owner == house)
            })
            .max_by_key(|(_, company)| company.net_debt() * 1_000 / company.ttm_ebitda().max(1))
            .map(|(index, _)| index)
    }

    fn people_move(&mut self) {
        for index in 0..self.companies.len() {
            let company = &self.companies[index];
            if !company.is_active() || company.is_player_owned() || company.process.is_some() {
                continue;
            }
            match company.owner {
                // The founder hands the chair to the next generation; the player starts over, halfway.
                Owner::Founder { age } if age >= 63 && company.ceo.founder => {
                    if !self.rng.chance_bps(120) {
                        continue;
                    }
                    let known = self.knows_owner(index);
                    let from = self.companies[index].ceo.name.clone();
                    let mut heir = Ceo::hired(&mut self.rng);
                    heir.founder = true;
                    heir.age = self.rng.range(34, 48) as u8;
                    heir.tenure = 0;
                    let to = heir.name.clone();
                    let company = &mut self.companies[index];
                    company.owner = Owner::Founder { age: heir.age };
                    company.ceo = heir;
                    company.relationship /= 2;
                    if known {
                        self.post(MessageKind::OwnerSucceeded { from, to }, Some(index));
                    }
                }
                // A hired manager takes a job down the road, and takes the acquaintance along.
                Owner::Sponsor { .. } | Owner::Corporate if !company.ceo.founder => {
                    if company.relationship < KNOWN_AT || !self.rng.chance_bps(60) {
                        continue;
                    }
                    let sector = company.sector;
                    let Some(to) = (0..12)
                        .map(|_| self.rng.below(self.companies.len() as u64) as usize)
                        .find(|&other| {
                            let target = &self.companies[other];
                            other != index
                                && target.sector == sector
                                && target.is_active()
                                && !target.is_player_owned()
                                && !target.ceo.founder
                        })
                    else {
                        continue;
                    };
                    let mut mover = self.companies[index].ceo.clone();
                    mover.tenure = 0;
                    let name = mover.name.clone();
                    let from =
                        crate::view::short_name(&self.companies[index].legal_name).to_string();
                    let carried = self.companies[index].relationship / 2;
                    self.companies[index].relationship -= carried;
                    self.companies[index].replace_ceo(&mut self.rng);
                    let target = &mut self.companies[to];
                    target.ceo = mover;
                    target.relationship = (target.relationship + carried).min(100);
                    target.watched = true;
                    self.post(MessageKind::CeoMoved { name, from }, Some(to));
                }
                _ => {}
            }
        }
    }
}
