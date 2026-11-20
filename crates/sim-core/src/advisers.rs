//! The sell side. An owner who decides to sell hires a bank; the bank writes the teaser, draws up
//! the buyer list, collects indications of interest, cuts the field to a shortlist and runs the
//! final round. Buyers the bank knows get the call; the rest read about the deal afterwards.

use serde::{Deserialize, Serialize};

use crate::company::{DdStream, Owner};
use crate::market::{SaleReason, Stage};
use crate::math::mul_bps;
use crate::sourcing::Intent;
use crate::world::{CommandError, MessageKind, World};

pub const ADVISERS: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// A large bank: big assets, wide auctions.
    Bulge,
    /// A sector boutique: narrow lists, buyers it knows.
    Boutique,
    /// A regional broker: small founder-owned companies.
    Regional,
}

pub struct Adviser {
    pub name: &'static str,
    pub tier: Tier,
    pub focus: Option<&'static str>,
    /// Trailing EBITDA of the mandates it takes, thousand USD.
    pub min_ebitda: i64,
    pub max_ebitda: i64,
}

pub const ADVISER_BOOK: [Adviser; ADVISERS] = [
    Adviser {
        name: "Marlow Finch & Co.",
        tier: Tier::Bulge,
        focus: None,
        min_ebitda: 25_000,
        max_ebitda: i64::MAX,
    },
    Adviser {
        name: "Stonebridge Securities",
        tier: Tier::Bulge,
        focus: Some("healthcare_services"),
        min_ebitda: 18_000,
        max_ebitda: i64::MAX,
    },
    Adviser {
        name: "Corvane Partners",
        tier: Tier::Boutique,
        focus: Some("industrial_components"),
        min_ebitda: 6_000,
        max_ebitda: 60_000,
    },
    Adviser {
        name: "Alder Lane Advisory",
        tier: Tier::Boutique,
        focus: Some("business_services"),
        min_ebitda: 5_000,
        max_ebitda: 50_000,
    },
    Adviser {
        name: "Kestrel Hale",
        tier: Tier::Boutique,
        focus: Some("food_manufacturing"),
        min_ebitda: 5_000,
        max_ebitda: 50_000,
    },
    Adviser {
        name: "Northfield Brokers",
        tier: Tier::Regional,
        focus: None,
        min_ebitda: 0,
        max_ebitda: 14_000,
    },
];

/// How the bank sells: to everyone, or to a list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Format {
    /// The teaser goes to every credible buyer.
    #[default]
    Broad,
    /// The teaser goes to a short list the bank and the owner agreed.
    Targeted,
}

impl Format {
    /// Bidders taken into the second round.
    pub fn shortlist(self) -> usize {
        match self {
            Format::Broad => 4,
            Format::Targeted => 3,
        }
    }
}

/// Coverage at which a bank puts the player on a targeted list.
pub const LIST_AT: i64 = 30;
/// Coverage at which a bank gives the benefit of the doubt at the shortlist.
pub const FAVOUR_AT: i64 = 50;
/// Coverage at which a bank calls before the teaser goes out.
pub const HEADS_UP_AT: i64 = 60;

const CODENAMES: [&str; 32] = [
    "Larch", "Falcon", "Granite", "Harbor", "Juniper", "Meridian", "Orchard", "Quartz", "Summit",
    "Tundra", "Willow", "Anchor", "Birch", "Cobalt", "Delta", "Ember", "Foundry", "Glacier",
    "Heron", "Indigo", "Keystone", "Lantern", "Mason", "Nimbus", "Osprey", "Piedmont", "Quarry",
    "Raven", "Sable", "Tiller", "Umber", "Vantage",
];

impl World {
    pub fn coverage(&self, adviser: u8) -> i64 {
        self.banks.get(adviser as usize).copied().unwrap_or(0)
    }

    fn add_coverage(&mut self, adviser: u8, gain: i64) {
        if self.banks.len() < ADVISERS {
            self.banks.resize(ADVISERS, 0);
        }
        let slot = &mut self.banks[adviser as usize % ADVISERS];
        *slot = (*slot + gain).clamp(0, 100);
    }

    /// The owner picks a bank and a way to sell. Called when a process starts.
    pub(crate) fn hire_adviser(&mut self, index: usize) {
        let company = &self.companies[index];
        let ebitda = company.ttm_ebitda();
        let sector = self.industries[company.sector].sector_id.clone();
        let reason = company.process.as_ref().map(|process| process.reason);
        let mut pool: Vec<u8> = Vec::new();
        for (id, adviser) in ADVISER_BOOK.iter().enumerate() {
            if ebitda < adviser.min_ebitda || ebitda > adviser.max_ebitda {
                continue;
            }
            // A bank that knows the sector is three times as likely to win the mandate.
            let weight = if adviser.focus == Some(sector.as_str()) {
                3
            } else {
                1
            };
            for _ in 0..weight {
                pool.push(id as u8);
            }
        }
        let adviser = if pool.is_empty() {
            (ADVISERS - 1) as u8
        } else {
            pool[self.rng.below(pool.len() as u64) as usize]
        };
        let tier = ADVISER_BOOK[adviser as usize].tier;
        // Forced sales and listed companies go wide. A founder who cares who buys keeps the list short.
        let narrow = match reason {
            Some(SaleReason::Distress | SaleReason::StrategicReview) => 0,
            _ => match tier {
                Tier::Bulge => 2_500,
                Tier::Boutique => 6_000,
                Tier::Regional => 4_500,
            },
        };
        let format = if self.rng.chance_bps(narrow) {
            Format::Targeted
        } else {
            Format::Broad
        };
        let codename = CODENAMES[self.rng.below(CODENAMES.len() as u64) as usize].to_string();
        if let Some(process) = self.companies[index].process.as_mut() {
            process.adviser = Some(adviser);
            process.format = format;
            process.codename = codename;
        }
    }

    /// Whether the bank would send the player the teaser.
    pub fn on_buyer_list(&self, index: usize) -> bool {
        let company = &self.companies[index];
        let Some(process) = &company.process else {
            return false;
        };
        let Some(adviser) = process.adviser else {
            return true;
        };
        if process.format == Format::Broad {
            return true;
        }
        self.coverage(adviser) >= LIST_AT
            || company.relationship >= self.early_notice_threshold()
            || self.insight.get(company.sector).copied().unwrap_or(0) > 0
            || self.career.reputation >= 65
            || self
                .companies
                .iter()
                .any(|other| other.is_player_owned() && other.sector == company.sector)
    }

    /// Whether the first round has closed without the player.
    pub fn first_round_closed(&self, index: usize) -> bool {
        self.companies[index]
            .process
            .as_ref()
            .is_some_and(|process| {
                process.adviser.is_some()
                    && process.stage == Stage::Bidding
                    && self.deal_index(index).is_none()
            })
    }

    /// Diligence a buyer can do at this point: the memorandum in round one, the data room and
    /// site visits once shortlisted or in talks alone.
    pub fn stream_open(&self, index: usize, stream: DdStream) -> bool {
        let desktop = matches!(stream, DdStream::Financial | DdStream::Commercial);
        match self.companies[index].process.as_ref() {
            Some(process) if process.adviser.is_some() => {
                desktop || process.stage == Stage::Bidding
            }
            _ => true,
        }
    }

    /// A coverage call on a bank: one attention point.
    pub(crate) fn cover_bank(&mut self, adviser: u8) -> Result<(), CommandError> {
        if adviser as usize >= ADVISERS {
            return Err(CommandError::InvalidChoice);
        }
        self.spend_attention(1)?;
        let gain = 12 + self.career.reputation / 12 + self.rng.range(0, 5);
        self.add_coverage(adviser, gain);
        Ok(())
    }

    /// A non-binding indication of interest in round one. No committee, no commitment.
    pub(crate) fn submit_indication(
        &mut self,
        company: usize,
        ev: i64,
    ) -> Result<(), CommandError> {
        let index = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        if ev <= 0 {
            return Err(CommandError::InvalidOffer);
        }
        let round_one = self.companies[company]
            .process
            .as_ref()
            .is_some_and(|process| {
                process.adviser.is_some()
                    && matches!(process.stage, Stage::Preparing | Stage::Marketing)
            });
        if !round_one {
            return Err(CommandError::WindowClosed);
        }
        self.deals[index].indication = Some(ev);
        Ok(())
    }

    /// Round one closes. `rivals` are priced already; the bank keeps the best few.
    /// Returns the rivals that go through.
    pub(crate) fn cut_shortlist(
        &mut self,
        index: usize,
        mut rivals: Vec<crate::market::RivalBid>,
    ) -> Vec<crate::market::RivalBid> {
        let (adviser, format) = match self.companies[index].process.as_ref() {
            Some(process) => (process.adviser, process.format),
            None => return rivals,
        };
        let Some(adviser) = adviser else {
            return rivals;
        };
        rivals.sort_by(|a, b| b.ev.cmp(&a.ev));
        let seats = format.shortlist();
        let Some(deal) = self.deal_index(index) else {
            rivals.truncate(seats);
            return rivals;
        };
        let through = match self.deals[deal].indication {
            None => false,
            Some(ev) => {
                // The bank reads the number with the buyer in mind: a house it knows, one the owner knows.
                let favour = if self.coverage(adviser) >= FAVOUR_AT {
                    200
                } else {
                    0
                };
                let score = mul_bps(ev, 10_000 + favour + self.companies[index].relationship * 2);
                let ahead = rivals.iter().filter(|rival| rival.ev > score).count();
                ahead < seats && ev >= self.reserve_ev(index) * 95 / 100
            }
        };
        if through {
            rivals.truncate(seats - 1);
            self.post(
                MessageKind::Shortlisted {
                    bidders: rivals.len() as u32 + 1,
                },
                Some(index),
            );
        } else {
            rivals.truncate(seats);
            self.post(MessageKind::NotShortlisted, Some(index));
            self.drop_deal_record(index);
        }
        if let Some(process) = self.companies[index].process.as_mut() {
            process.shortlisted = Some(through);
        }
        rivals
    }

    /// The teaser goes out as marketing starts.
    pub(crate) fn send_teaser(&mut self, index: usize) {
        let Some((Some(adviser), format)) = self.companies[index]
            .process
            .as_ref()
            .map(|process| (process.adviser, process.format))
        else {
            return;
        };
        if !self.on_buyer_list(index) {
            return;
        }
        let kind = MessageKind::TeaserReceived { adviser, format };
        if self.is_followed(index) {
            self.post(kind, Some(index));
        } else {
            self.post_news(kind, Some(index));
        }
    }

    /// Monthly: coverage fades, and banks that know the player bring ideas.
    pub(crate) fn advisers_step(&mut self) {
        if self.banks.len() < ADVISERS {
            self.banks.resize(ADVISERS, 0);
        }
        if self.months_elapsed % 3 == 1 {
            for slot in &mut self.banks {
                *slot = (*slot - 1).max(0);
            }
        }
        for adviser in 0..ADVISERS {
            if self.banks[adviser] < 40 || !self.rng.chance_bps(700) {
                continue;
            }
            let book = &ADVISER_BOOK[adviser];
            // An owner the bank has been talking to, who is not in a process yet.
            for _ in 0..16 {
                let index = self.rng.below(self.companies.len() as u64) as usize;
                let company = &self.companies[index];
                let ebitda = company.ttm_ebitda();
                let fits = company.is_active()
                    && company.process.is_none()
                    && !company.is_player_owned()
                    && matches!(company.owner, Owner::Founder { .. } | Owner::Corporate)
                    && ebitda >= book.min_ebitda
                    && ebitda <= book.max_ebitda
                    && book
                        .focus
                        .is_none_or(|focus| self.industries[company.sector].sector_id == focus)
                    && matches!(self.intent(index), Intent::Open | Intent::Eager)
                    && company.relationship < crate::sourcing::KNOWN_AT;
                if !fits {
                    continue;
                }
                // The introduction is worth a first meeting.
                let company = &mut self.companies[index];
                company.relationship = company.relationship.max(crate::sourcing::KNOWN_AT);
                company.watched = true;
                self.post(
                    MessageKind::BankPitch {
                        adviser: adviser as u8,
                    },
                    Some(index),
                );
                break;
            }
        }
    }

    /// A fee paid is remembered.
    pub(crate) fn pay_adviser(&mut self, index: usize) {
        if let Some(adviser) = self.companies[index]
            .process
            .as_ref()
            .and_then(|process| process.adviser)
        {
            self.add_coverage(adviser, 8);
        }
    }
}
