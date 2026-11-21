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
use crate::math::ratio_bps;
use crate::world::{CommandError, MessageKind, World};

/// Relationship at which an owner says how they feel about selling.
pub const KNOWN_AT: i64 = 20;
/// Relationship at which an owner will hear an unsolicited proposal, or agree to talk alone.
pub const PROPOSAL_AT: i64 = 60;
/// A minority proposal asks less of the owner than a sale, and needs less trust.
pub const MINORITY_AT: i64 = 40;

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
    /// Value the company: in house or through an adviser.
    Value,
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
    /// The valuation comes in when the month closes.
    ValuationDue,
    /// The committee sits next month.
    CommitteeScheduled,
    /// The owner is thinking the proposal over.
    OwnerConsidering,
}

/// What the player proposed to an owner.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProposalKind {
    /// Buy the company, outside any sale.
    Acquisition,
    /// Talk alone before the bank starts an auction.
    Exclusive,
    /// Buy a minority stake from an owner who keeps the company.
    Minority,
}

/// A proposal the owner is still thinking over.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pending {
    pub kind: ProposalKind,
    pub months_left: u32,
    /// The terms of a minority proposal.
    #[serde(default)]
    pub offer: Option<crate::deal::Offer>,
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

    /// How likely an owner is to take a minority proposal on these terms, in percent.
    /// Price and new money for the company help; a big stake and preferred shares cost.
    pub fn minority_odds(&self, company: usize, offer: &crate::deal::Offer) -> i64 {
        let target = &self.companies[company];
        let warmth = (target.relationship - MINORITY_AT).max(0) / 2;
        let price_bps = ratio_bps(offer.ev, self.model_ev(company).max(1));
        let price = match price_bps {
            i64::MIN..=8_999 => -25,
            9_000..=9_499 => -10,
            9_500..=9_999 => 0,
            10_000..=10_999 => 8,
            _ => 15,
        };
        let stake = match offer.stake_bps {
            i64::MIN..=2_000 => 5,
            2_001..=3_499 => 0,
            _ => -10,
        };
        let financing = self.financing(company, offer);
        // New money for the business is what most owners want from a minority investor.
        let growth = if financing.primary * 2 >= financing.equity - financing.fees { 10 } else { 0 };
        let preferred = if offer.preferred { -12 } else { 0 };
        let stance = match target.stance {
            Stance::Sentimental => 5,
            Stance::PriceMaximizer => -5,
            _ => 0,
        };
        // An owner who wants out wants all of it out.
        let intent = match self.intent(company) {
            Intent::Eager => -10,
            Intent::Open => -5,
            _ => 0,
        };
        (45 + warmth + price + stake + growth + preferred + stance + intent + self.street_swing())
            .clamp(3, 90)
    }

    /// Proposes a minority stake on stated terms. The owner answers in a month or two;
    /// a yes opens talks alone at that price.
    pub(crate) fn propose_minority(
        &mut self,
        company: usize,
        offer: crate::deal::Offer,
    ) -> Result<(), CommandError> {
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
        if !matches!(target.owner, Owner::Founder { .. }) {
            return Err(CommandError::FounderOwnedOnly);
        }
        if target.relationship < MINORITY_AT {
            return Err(CommandError::NeedsRelationship);
        }
        if offer.kind != crate::deal::DealKind::Minority {
            return Err(CommandError::InvalidOffer);
        }
        match self.approach_block(company) {
            Some(Block::CrossBorderLocked) => return Err(CommandError::CrossBorderLocked),
            Some(Block::InvestmentPeriodOver) => return Err(CommandError::InvestmentPeriodOver),
            Some(Block::OwnerNotReady) => return Err(CommandError::OwnerNotReady),
            Some(Block::TooManyDeals) => return Err(CommandError::TooManyDeals),
            _ => {}
        }
        if self.companies[company].pending.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        self.validate_offer(company, &offer)?;
        if self.financing(company, &offer).equity > self.fund.uncalled() {
            return Err(CommandError::FundExhausted);
        }
        self.spend_attention(1)?;
        let months = self.rng.range(1, 2) as u32;
        self.companies[company].pending = Some(Pending {
            kind: ProposalKind::Minority,
            months_left: months,
            offer: Some(offer),
        });
        self.post(MessageKind::OwnerConsidering { months }, Some(company));
        Ok(())
    }

    fn answer_minority(&mut self, company: usize, offer: crate::deal::Offer) {
        if self.companies[company].process.is_some() {
            self.post(MessageKind::OwnerDeclined, Some(company));
            return;
        }
        let odds = self.minority_odds(company, &offer);
        if !self.rng.chance_bps((odds * 100) as u32) || self.deals.len() >= self.career.rank.max_live_deals() {
            let target = &mut self.companies[company];
            target.approach_cooldown = 6;
            target.relationship = (target.relationship - 2).max(0);
            self.post(MessageKind::OwnerDeclined, Some(company));
            return;
        }
        let reason = crate::market::SaleReason::GrowthCapital;
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
        if self.sign_nda(company).is_ok() {
            if let Some(index) = self.deal_index(company) {
                // The agreed terms are the draft; the agreed price is the floor of the talks.
                self.deals[index].indication = Some(offer.ev);
                self.deals[index].offer = Some(offer);
            }
            self.post(MessageKind::OwnerOpened { reason }, Some(company));
        }
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
        if self.companies[company].pending.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        if self.sale_motive(company).is_none() {
            return Err(CommandError::NotForSale);
        }
        self.spend_attention(1)?;
        // The owner takes a month or two: family, the bank, the accountant.
        let months = self.rng.range(1, 2) as u32;
        self.companies[company].pending = Some(Pending { kind: ProposalKind::Acquisition, months_left: months, offer: None });
        self.post(MessageKind::OwnerConsidering { months }, Some(company));
        Ok(())
    }

    /// Month end: owners who have thought it over answer.
    pub(crate) fn answer_proposals(&mut self) {
        for company in 0..self.companies.len() {
            let Some(pending) = self.companies[company].pending.as_mut() else {
                continue;
            };
            pending.months_left = pending.months_left.saturating_sub(1);
            if pending.months_left > 0 {
                continue;
            }
            let kind = pending.kind;
            let offer = pending.offer.clone();
            self.companies[company].pending = None;
            if !self.companies[company].is_active() || self.companies[company].is_player_owned() {
                continue;
            }
            match kind {
                ProposalKind::Acquisition => self.answer_acquisition(company),
                ProposalKind::Exclusive => self.answer_exclusive(company),
                ProposalKind::Minority => {
                    if let Some(offer) = offer {
                        self.answer_minority(company, offer);
                    }
                }
            }
        }
    }

    fn answer_acquisition(&mut self, company: usize) {
        // Someone else got there first, or the reason to sell went away.
        if self.companies[company].process.is_some() {
            self.post(MessageKind::OwnerDeclined, Some(company));
            return;
        }
        let Some((_, reason)) = self.sale_motive(company) else {
            self.companies[company].approach_cooldown = 6;
            self.post(MessageKind::OwnerDeclined, Some(company));
            return;
        };
        let odds = self.approach_odds(company);
        if !self.rng.chance_bps((odds * 100) as u32) {
            let target = &mut self.companies[company];
            target.approach_cooldown = 12;
            target.relationship = (target.relationship - 3).max(0);
            self.post(MessageKind::OwnerDeclined, Some(company));
            return;
        }
        if self.deals.len() >= self.career.rank.max_live_deals() {
            self.post(MessageKind::OwnerDeclined, Some(company));
            return;
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
        if self.sign_nda(company).is_ok() {
            self.post(MessageKind::OwnerOpened { reason }, Some(company));
        }
    }

    fn answer_exclusive(&mut self, company: usize) {
        let still_preparing = self.companies[company]
            .process
            .as_ref()
            .is_some_and(|process| process.stage == Stage::Preparing);
        // The bank moved first: the owner keeps the auction.
        if !still_preparing {
            self.post(MessageKind::OwnerDeclined, Some(company));
            return;
        }
        let process = self.companies[company].process.as_mut().expect("checked above");
        process.stage = Stage::Exclusive;
        // The owner deals directly: no bank, no list, no rounds.
        process.adviser = None;
        process.months_left = 4;
        if self.deal_index(company).is_none() && self.sign_nda(company).is_err() {
            return;
        }
        let reason = self.companies[company].process.as_ref().map(|process| process.reason);
        if let Some(reason) = reason {
            self.post(MessageKind::OwnerOpened { reason }, Some(company));
        }
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
            // A price needs a valuation: first thing after the NDA.
            if deal.ic.is_none() && deal.valuation.is_none() {
                return if deal.valuation_order.is_some() {
                    (Step::Wait, Some(Block::ValuationDue))
                } else {
                    (Step::Value, None)
                };
            }
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
            if let Some(meeting) = &deal.ic_meeting {
                return if meeting.open {
                    (Step::Committee, None)
                } else {
                    (Step::Wait, Some(Block::CommitteeScheduled))
                };
            }
            let conditions_open = deal.ic_conditions.iter().any(|stream| !deal.has(*stream));
            return match &deal.ic {
                Some(ic) if ic.outcome == IcOutcome::Approved && conditions_open => {
                    if deal.streams_running.is_empty() {
                        (Step::Diligence, tired(1))
                    } else {
                        (Step::Wait, Some(Block::ReportsDue))
                    }
                }
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
        if target.pending.is_some() {
            return (Step::Wait, Some(Block::OwnerConsidering));
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
