//! Getting to a deal. An owner the player has never met is a stranger; a few
//! meetings make an acquaintance, then someone who calls first, then someone
//! who will hear a proposal. This module also answers, for any company, the
//! one question the screen keeps asking: what can the player do here now, and
//! if nothing, why not.

use serde::{Deserialize, Serialize};

use crate::company::Owner;
use crate::company::Stance;
use crate::deal::{IcOutcome, DD_STREAM_COUNT};
use crate::fund::Rank;
use crate::market::{Process, Stage};
use crate::world::{CommandError, MessageKind, World};

/// Relationship at which an owner says how they feel about selling.
pub const KNOWN_AT: i64 = 20;
/// Relationship at which an owner will hear an unsolicited proposal, or agree to talk alone.
pub const PROPOSAL_AT: i64 = 60;

/// How the owner knows the player.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Access {
    Stranger,
    Acquainted,
    Trusted,
    Confidant,
}

/// How an owner feels about selling, as they would put it over lunch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Intent {
    /// Not for years.
    Closed,
    /// It has crossed their mind.
    Thinking,
    /// Would listen to the right buyer.
    Open,
    /// Wants out.
    Eager,
}

/// The one thing worth doing at a company now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Step {
    Meet,
    Approach,
    ProposeExclusive,
    SignNda,
    Diligence,
    Offer,
    Committee,
    /// A non-binding indication of interest in round one.
    Indicate,
    Bid,
    Raise,
    /// Nothing to do but close the month.
    Wait,
    Operate,
}

/// Why the step cannot be taken yet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Block {
    NoAttention,
    CrossBorderLocked,
    TooManyDeals,
    /// The owner turned a proposal down within the last year.
    OwnerNotReady,
    /// A listed company sells only through its board.
    BoardOnly,
    ReportsDue,
    NotBiddingYet,
    BidIn,
    CommitteeHeld,
    InvestmentPeriodOver,
    /// The bank did not send the teaser.
    NotInvited,
    /// Round one closed without the player.
    FirstRoundClosed,
    /// The indication is in; the bank is choosing its shortlist.
    AwaitingShortlist,
}

impl World {
    pub fn access(&self, company: usize) -> Access {
        match self.companies[company].relationship {
            i64::MIN..=0 => Access::Stranger,
            1..=39 => Access::Acquainted,
            40..=59 => Access::Trusted,
            _ => Access::Confidant,
        }
    }

    /// What the owner thinks about selling. Derived from the same motive the market rolls on.
    pub fn intent(&self, company: usize) -> Intent {
        match self
            .sale_motive(company)
            .map(|(chance, _)| chance)
            .unwrap_or(0)
        {
            i64::MIN..=39 => Intent::Closed,
            40..=89 => Intent::Thinking,
            90..=199 => Intent::Open,
            _ => Intent::Eager,
        }
    }

    /// Chance, in percent, that an unsolicited proposal opens a negotiation.
    pub fn approach_odds(&self, company: usize) -> i64 {
        let target = &self.companies[company];
        let base = match self.intent(company) {
            Intent::Closed => 8,
            Intent::Thinking => 30,
            Intent::Open => 60,
            Intent::Eager => 85,
        };
        let warmth = (target.relationship - PROPOSAL_AT).max(0) / 2;
        let stance = match target.stance {
            Stance::Sentimental => 10,
            Stance::PriceMaximizer => -10,
            _ => 0,
        };
        // A rival at the door makes the owner take the question seriously.
        let courted = if target.suitor.is_some() { 10 } else { 0 };
        (base + warmth + stance + courted + self.street_swing()).clamp(3, 95)
    }

    /// The relationship an unsolicited proposal needs: lower when a rival has already made one.
    pub fn proposal_threshold(&self, company: usize) -> i64 {
        if self.companies[company].suitor.is_some() {
            crate::rivals::COUNTER_AT
        } else {
            PROPOSAL_AT
        }
    }

    fn approach_block(&self, company: usize) -> Option<Block> {
        let target = &self.companies[company];
        if target.owner == Owner::Public {
            return Some(Block::BoardOnly);
        }
        if target.is_abroad() && self.career.rank < Rank::Principal {
            return Some(Block::CrossBorderLocked);
        }
        if !self.fund.investing(self.date) {
            return Some(Block::InvestmentPeriodOver);
        }
        if target.approach_cooldown > 0 {
            return Some(Block::OwnerNotReady);
        }
        if self.deals.len() >= self.career.rank.max_live_deals() {
            return Some(Block::TooManyDeals);
        }
        None
    }

    /// Asks an owner who is not selling whether they would sell to the player.
    /// A yes opens four months of talks alone; a no closes the subject for a year.
    pub(crate) fn approach_owner(&mut self, company: usize) -> Result<(), CommandError> {
        let target = self
            .companies
            .get(company)
            .ok_or(CommandError::UnknownCompany)?;
        if !target.is_active() || target.is_player_owned() {
            return Err(CommandError::UnknownCompany);
        }
        if target.process.is_some() {
            return Err(CommandError::AlreadyForSale);
        }
        if target.relationship < self.proposal_threshold(company) {
            return Err(CommandError::NeedsRelationship);
        }
        match self.approach_block(company) {
            Some(Block::BoardOnly) => return Err(CommandError::NotForSale),
            Some(Block::CrossBorderLocked) => return Err(CommandError::CrossBorderLocked),
            Some(Block::InvestmentPeriodOver) => return Err(CommandError::InvestmentPeriodOver),
            Some(Block::OwnerNotReady) => return Err(CommandError::OwnerNotReady),
            Some(Block::TooManyDeals) => return Err(CommandError::TooManyDeals),
            _ => {}
        }
        let Some((_, reason)) = self.sale_motive(company) else {
            return Err(CommandError::NotForSale);
        };
        self.spend_attention(1)?;
        let odds = self.approach_odds(company);
        if !self.rng.chance_bps((odds * 100) as u32) {
            let target = &mut self.companies[company];
            target.approach_cooldown = 12;
            target.relationship = (target.relationship - 3).max(0);
            self.post(MessageKind::OwnerDeclined, Some(company));
            return Ok(());
        }
        self.companies[company].suitor = None;
        self.companies[company].process = Some(Process {
            reason,
            stage: Stage::Exclusive,
            months_left: 4,
            rivals: Vec::new(),
            player_bid: None,
            final_round: false,
            adviser: None,
            format: crate::advisers::Format::Broad,
            codename: String::new(),
            shortlisted: None,
        });
        self.sign_nda(company)?;
        self.post(MessageKind::OwnerOpened { reason }, Some(company));
        Ok(())
    }

    /// The next move at a company, and what stands in the way of it.
    pub fn next_step(&self, company: usize) -> (Step, Option<Block>) {
        let target = &self.companies[company];
        if target.is_player_owned() {
            return (Step::Operate, None);
        }
        let tired = |cost: i64| (self.attention_left < cost).then_some(Block::NoAttention);
        if let Some(index) = self.deal_index(company) {
            let deal = &self.deals[index];
            let stage = target.process.as_ref().map(|process| process.stage);
            if deal.bid_submitted {
                let behind = self
                    .standing(company)
                    .is_some_and(|standing| standing.rank > 1);
                let bid = target
                    .process
                    .as_ref()
                    .and_then(|p| p.player_bid.as_ref())
                    .map(|b| b.ev)
                    .unwrap_or(0);
                let final_round = target
                    .process
                    .as_ref()
                    .is_some_and(|process| process.final_round);
                return if final_round && behind && self.bid_ceiling(company) > bid {
                    (Step::Raise, None)
                } else {
                    (Step::Wait, Some(Block::BidIn))
                };
            }
            let round_one = target.process.as_ref().is_some_and(|process| {
                process.adviser.is_some()
                    && matches!(process.stage, Stage::Preparing | Stage::Marketing)
            });
            if round_one && deal.ic.is_none() {
                // Read the memorandum, name a number, wait for the cut.
                let desktop = deal
                    .streams_done
                    .iter()
                    .chain(&deal.streams_running)
                    .filter(|stream| self.stream_open(company, **stream))
                    .count();
                return if deal.indication.is_none() && desktop < 2 {
                    (Step::Diligence, tired(1))
                } else if deal.indication.is_none() {
                    (Step::Indicate, None)
                } else if !deal.streams_running.is_empty() {
                    (Step::Wait, Some(Block::ReportsDue))
                } else {
                    (Step::Wait, Some(Block::AwaitingShortlist))
                };
            }
            return match &deal.ic {
                Some(ic) if ic.outcome == IcOutcome::Approved => {
                    if matches!(stage, Some(Stage::Bidding | Stage::Exclusive)) {
                        (Step::Bid, None)
                    } else {
                        (Step::Wait, Some(Block::NotBiddingYet))
                    }
                }
                // The committee said no or not yet: the offer has to change.
                Some(_) => (Step::Offer, Some(Block::CommitteeHeld)),
                None if deal.offer.is_some() => (Step::Committee, tired(1)),
                None if deal.streams_done.len() + deal.streams_running.len() < DD_STREAM_COUNT => {
                    (Step::Diligence, tired(1))
                }
                None if !deal.streams_running.is_empty() => (Step::Wait, Some(Block::ReportsDue)),
                None => (Step::Offer, None),
            };
        }
        let abroad_locked = target.is_abroad() && self.career.rank < Rank::Principal;
        if self.process_visible(company) {
            let preparing = target
                .process
                .as_ref()
                .is_some_and(|process| process.stage == Stage::Preparing);
            if preparing && target.relationship >= PROPOSAL_AT && !abroad_locked {
                return (Step::ProposeExclusive, tired(1));
            }
            let block = if !self.on_buyer_list(company) {
                Some(Block::NotInvited)
            } else if self.first_round_closed(company) {
                Some(Block::FirstRoundClosed)
            } else if abroad_locked {
                Some(Block::CrossBorderLocked)
            } else if self.deals.len() >= self.career.rank.max_live_deals() {
                Some(Block::TooManyDeals)
            } else {
                None
            };
            return (Step::SignNda, block);
        }
        if target.relationship >= self.proposal_threshold(company) && target.process.is_none() {
            return (Step::Approach, self.approach_block(company).or(tired(1)));
        }
        (Step::Meet, tired(if target.is_abroad() { 2 } else { 1 }))
    }
}
