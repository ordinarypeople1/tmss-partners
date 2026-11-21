//! The investment committee as a meeting. Submitting a deal books a slot
//! for next month; when the month turns the committee sits, three partners
//! put a question each, and the vote follows the answers.
//!
//! The questions come from the deal: each is the most serious concern a
//! partner holds about this offer (a vote against before a hold). A deal
//! with fewer than three concerns gets routine questions to fill the hour.
//!
//! Each question takes one of three answers:
//! - evidence, which lands only if the facts back it;
//! - a concession, which always lands but costs something: a lower approval
//!   or a diligence report that must be in before the bid;
//! - pushing back, which lands only with a partner who trusts the player.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::company::DdStream;
use crate::deal::{Concern, IcOutcome, IcResult, Stance, Vote, PARTNERS};
use crate::math::mul_bps;
use crate::valuation::ValuationKind;
use crate::world::{CommandError, MessageKind, World};

/// Questions per meeting.
pub const QUESTIONS: usize = 3;
/// What a price concession takes off the room to raise above the approval
/// (normally 5%), in basis points.
const CONCESSION_CUT_BPS: i64 = 150;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Topic {
    /// One of the partner's concerns about the offer.
    Concern(Concern),
    /// Routine: how the fund gets out.
    Exit,
    /// Routine: where the value comes from.
    ValueCreation,
    /// Routine: what a downturn does to it.
    Cycle,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Answer {
    Evidence,
    Concede,
    PushBack,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Question {
    pub partner: usize,
    pub topic: Topic,
    pub answer: Option<Answer>,
    /// Whether the answer landed with the partner.
    pub landed: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Meeting {
    /// The month the committee sits.
    pub date: GameDate,
    /// The committee is in the room and waiting for answers.
    pub open: bool,
    pub questions: Vec<Question>,
    /// Taken off the room to raise by concessions.
    pub cut_bps: i64,
    /// Reports the player promised to have in before bidding.
    pub conditions: Vec<DdStream>,
}

impl Meeting {
    pub fn answered(&self) -> usize {
        self.questions.iter().filter(|question| question.answer.is_some()).count()
    }
}

fn severity(stance: Stance) -> u8 {
    match stance {
        Stance::Against => 2,
        Stance::Hold => 1,
        Stance::For => 0,
    }
}

/// The diligence report a concession on this concern promises.
fn promised_stream(concern: Concern) -> Option<DdStream> {
    match concern {
        Concern::NoFinancialDd | Concern::InventoryDays => Some(DdStream::Financial),
        Concern::NoCommercialDd => Some(DdStream::Commercial),
        Concern::NoOperationalDd => Some(DdStream::Operational),
        Concern::NoLegalDd => Some(DdStream::Legal),
        _ => None,
    }
}

impl World {
    /// The three questions for this offer, partner by partner.
    pub(crate) fn ic_questions(&self, votes: &[Vote]) -> Vec<Question> {
        let mut ranked: Vec<(u8, usize, Concern)> = votes
            .iter()
            .flat_map(|vote| {
                vote.concerns
                    .iter()
                    .map(move |concern| (severity(vote.stance), vote.partner, *concern))
            })
            .collect();
        // Most serious first; the chair before the others at equal weight.
        ranked.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
        let mut questions: Vec<Question> = Vec::new();
        for (_, partner, concern) in ranked {
            if questions.len() == QUESTIONS {
                break;
            }
            // One question per partner and per concern.
            if questions.iter().any(|question| {
                question.partner == partner || question.topic == Topic::Concern(concern)
            }) {
                continue;
            }
            questions.push(Question { partner, topic: Topic::Concern(concern), answer: None, landed: None });
        }
        // Routine questions from partners who have not spoken yet.
        for (topic, partner) in [(Topic::Exit, 2), (Topic::ValueCreation, 4), (Topic::Cycle, 0), (Topic::Exit, 5), (Topic::ValueCreation, 1), (Topic::Cycle, 3)] {
            if questions.len() == QUESTIONS {
                break;
            }
            if questions.iter().any(|question| question.partner == partner || question.topic == topic) {
                continue;
            }
            questions.push(Question { partner, topic, answer: None, landed: None });
        }
        questions
    }

    /// Whether the facts back an answer with evidence.
    fn evidence_holds(&self, company: usize, topic: Topic) -> bool {
        let Some(index) = self.deal_index(company) else {
            return false;
        };
        let deal = &self.deals[index];
        let Some(offer) = deal.offer.as_ref() else {
            return false;
        };
        let financing = self.financing(company, offer);
        let returns = self.project_returns(company, offer);
        let adviser = deal
            .valuation
            .as_ref()
            .filter(|valuation| valuation.kind == ValuationKind::Adviser);
        let target = &self.companies[company];
        let industry = &self.industries[target.sector];
        match topic {
            // A third-party report that covers the price.
            Topic::Concern(Concern::Price) | Topic::Concern(Concern::MultipleReliance) => {
                adviser.is_some_and(|valuation| offer.ev <= valuation.high)
            }
            Topic::Concern(Concern::Leverage) | Topic::Concern(Concern::Downside) => financing.cover_millis >= 2_200,
            Topic::Concern(Concern::InterestCover) => false,
            Topic::Concern(Concern::ThinReturns) => returns.irr_bps >= 1_200 && !offer.plan.is_empty(),
            Topic::Concern(Concern::OpenIssue) => deal
                .valuation
                .as_ref()
                .is_some_and(|valuation| offer.ev <= valuation.mid),
            Topic::Concern(Concern::FundConcentration) => {
                financing.equity <= mul_bps(self.fund.concentration_limit(), 13_000)
            }
            // A missing report cannot be argued away; neither can a missing plan.
            Topic::Concern(_) => false,
            Topic::Exit => self.economy.valuation_index() >= 95 || target.growth_bps > industry.monthly_growth_bps,
            Topic::ValueCreation => offer.plan.len() >= 2,
            Topic::Cycle => financing.cover_millis >= 2_500,
        }
    }

    /// Opens the committee meetings booked for this month. Called at month end,
    /// after the date has turned, so `date` is the new month.
    pub(crate) fn convene_committees(&mut self) {
        for index in 0..self.deals.len() {
            let Some(meeting) = self.deals[index].ic_meeting.as_mut() else {
                continue;
            };
            if meeting.open {
                // Nobody came: the committee votes on the papers.
                if meeting.date < self.date {
                    let company = self.deals[index].company;
                    self.resolve_committee(company);
                }
                continue;
            }
            if meeting.date <= self.date {
                meeting.open = true;
                let company = self.deals[index].company;
                self.post(MessageKind::CommitteeConvened, Some(company));
            }
        }
    }

    pub(crate) fn answer_ic(&mut self, company: usize, answer: Answer) -> Result<(), CommandError> {
        let index = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        let (partner, topic) = {
            let meeting = self.deals[index].ic_meeting.as_ref().ok_or(CommandError::NoMeeting)?;
            if !meeting.open {
                return Err(CommandError::TooEarly);
            }
            let question = meeting
                .questions
                .iter()
                .find(|question| question.answer.is_none())
                .ok_or(CommandError::AlreadyDone)?;
            (question.partner, question.topic)
        };
        let trust = self.partner_trust.get(partner).copied().unwrap_or(50);
        let senior = self.career.rank >= crate::fund::Rank::Principal;
        let landed = match answer {
            Answer::Evidence => self.evidence_holds(company, topic),
            Answer::Concede => true,
            Answer::PushBack => trust >= 65 || (senior && trust >= 55),
        };
        let shift = match (answer, landed) {
            (Answer::Evidence, true) => 4,
            (Answer::Evidence, false) => -3,
            (Answer::Concede, _) => 1,
            (Answer::PushBack, true) => -1,
            (Answer::PushBack, false) => -6,
        };
        self.trust(partner, shift);
        let meeting = self.deals[index].ic_meeting.as_mut().expect("checked above");
        if answer == Answer::Concede {
            match topic {
                Topic::Concern(concern) => match promised_stream(concern) {
                    Some(stream) => meeting.conditions.push(stream),
                    None => meeting.cut_bps += CONCESSION_CUT_BPS,
                },
                _ => meeting.cut_bps += CONCESSION_CUT_BPS / 2,
            }
        }
        if let Some(question) = meeting.questions.iter_mut().find(|question| question.answer.is_none()) {
            question.answer = Some(answer);
            question.landed = Some(landed);
        }
        if meeting.answered() == meeting.questions.len() {
            self.resolve_committee(company);
        }
        Ok(())
    }

    /// The vote, on today's offer and the answers given in the room.
    pub(crate) fn resolve_committee(&mut self, company: usize) {
        let Some(index) = self.deal_index(company) else {
            return;
        };
        let Some(meeting) = self.deals[index].ic_meeting.take() else {
            return;
        };
        let Some(offer) = self.deals[index].offer.clone() else {
            return;
        };
        let mut votes = self.committee_votes(company, &self.deals[index], &offer);
        self.weigh_by_trust(&mut votes);
        for question in &meeting.questions {
            let vote = &mut votes[question.partner.min(PARTNERS - 1)];
            vote.stance = match (question.landed, vote.stance) {
                (Some(true), Stance::Against) => Stance::Hold,
                (Some(true), _) => Stance::For,
                (Some(false), _) => Stance::Against,
                // Unanswered: a concern stands as it was; a routine question costs a hold.
                (None, Stance::For) if !matches!(question.topic, Topic::Concern(_)) => Stance::Hold,
                (None, stance) => stance,
            };
        }
        let outcome = self.committee_outcome(&votes);
        let deal = &mut self.deals[index];
        if outcome == IcOutcome::Approved {
            deal.approved_ev = offer.ev;
            deal.ic_cut_bps = meeting.cut_bps.min(500);
            deal.ic_conditions = meeting.conditions.clone();
        }
        match outcome {
            IcOutcome::Approved => self.career.adjust_reputation(1),
            IcOutcome::Held => {}
            IcOutcome::Rejected => {
                self.career.adjust_reputation(-2);
                self.career.ic_rejections += 1;
                self.year.rejections += 1;
            }
        }
        self.deals[index].ic = Some(IcResult { outcome, votes, date: self.date });
        self.deals[index].ic_record = Some(meeting);
        self.post(MessageKind::CommitteeDecision { outcome }, Some(company));
        self.offer_coinvest(company, &offer, outcome);
    }
}
