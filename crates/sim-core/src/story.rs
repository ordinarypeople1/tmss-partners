//! What gives a game its shape beyond the deals: events with a choice, the
//! partners' trust, the investors' mood, the year's objectives, and the record.

use serde::{Deserialize, Serialize};

use crate::company::{GrowthEffect, Trait};
use crate::deal::{Stance, Vote, PARTNERS};
use crate::economy::Phase;
use crate::fund::Rank;
use crate::math::{mul_bps, ratio_bps};
use crate::portfolio::Holding;
use crate::world::{Choice, MessageKind, World};

const CHAIR: usize = 0;
const SPECIAL: usize = 3;
const OPERATING: usize = 4;
const INVESTOR_RELATIONS: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    EarnoutDispute,
    TeamPoaching,
    PlantOutage,
    CustomerRenegotiation,
    CostShock,
    CyberIncident,
    IncentivePlan,
    RepricingWindow,
    CoInvestRequest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LpKind {
    PublicPension,
    Endowment,
    FamilyOffice,
    FundOfFunds,
    Insurer,
}

/// An investor in the fund. Satisfaction, 0 to 100, decides the next commitment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Lp {
    pub kind: LpKind,
    pub share_bps: i64,
    pub satisfaction: i64,
}

pub fn opening_lps() -> Vec<Lp> {
    [
        (LpKind::PublicPension, 3_000),
        (LpKind::FundOfFunds, 2_000),
        (LpKind::Endowment, 2_000),
        (LpKind::Insurer, 1_500),
        (LpKind::FamilyOffice, 1_500),
    ]
    .into_iter()
    .map(|(kind, share_bps)| Lp {
        kind,
        share_bps,
        satisfaction: 55,
    })
    .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectiveKind {
    CloseDeals,
    DeployCapital,
    BuildRelationships,
    FinishInitiatives,
    CleanCovenants,
    ExitCount,
    NoRejections,
}

/// Something the chair wants done by December.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Objective {
    pub kind: ObjectiveKind,
    pub target: i64,
}

/// What has happened since January.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct YearStats {
    pub closes: i64,
    pub deployed: i64,
    pub initiatives: i64,
    pub exits: i64,
    pub breaches: i64,
    pub rejections: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Achievement {
    FirstClose,
    FirstExit,
    DoubleUp,
    TripleUp,
    HomeRun,
    QuickFlip,
    RollUp,
    CleanSheet,
    Turnaround,
    ComebackKid,
    Proprietary,
    AuctionWinner,
    RecessionBuyer,
    BigGame,
    Dealmaker,
    Networker,
    FullyInvested,
    Distributor,
    TopOfTheTable,
    MadePrincipal,
    MadePartner,
    OwnName,
    CrossBorder,
    TakePrivate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Unlocked {
    pub achievement: Achievement,
    pub month: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Records {
    pub best_moic_millis: i64,
    pub fastest_exit_months: u32,
    pub largest_deal_ev: i64,
    pub largest_exit_proceeds: i64,
    pub total_proceeds: i64,
}

impl World {
    pub(crate) fn unlock(&mut self, achievement: Achievement) {
        if self
            .achievements
            .iter()
            .any(|item| item.achievement == achievement)
        {
            return;
        }
        self.achievements.push(Unlocked {
            achievement,
            month: self.months_elapsed,
        });
        self.post(MessageKind::AchievementUnlocked { achievement }, None);
    }

    pub(crate) fn trust(&mut self, partner: usize, change: i64) {
        if let Some(level) = self.partner_trust.get_mut(partner) {
            *level = (*level + change).clamp(0, 100);
        }
    }

    fn lp_mood(&mut self, change: i64) {
        for lp in &mut self.lps {
            lp.satisfaction = (lp.satisfaction + change).clamp(0, 100);
        }
    }

    /// A partner who trusts the player lets a doubt pass; one who does not turns a doubt into a no.
    pub(crate) fn weigh_by_trust(&self, votes: &mut [Vote]) {
        for vote in votes.iter_mut() {
            let trust = self.partner_trust.get(vote.partner).copied().unwrap_or(50);
            if vote.stance == Stance::Hold {
                if trust >= 70 {
                    vote.stance = Stance::For;
                } else if trust <= 30 {
                    vote.stance = Stance::Against;
                }
            }
        }
    }

    // ----- events -----

    fn event_open(&self, company: usize) -> bool {
        self.messages.iter().any(|message| {
            message.company == Some(company)
                && matches!(message.kind, MessageKind::Event { .. })
                && message
                    .decision
                    .as_ref()
                    .is_some_and(|decision| decision.chosen.is_none())
        })
    }

    /// One-off cost: out of cash, and borrowed if the cash is not there.
    fn charge(&mut self, company: usize, amount: i64) {
        let target = &mut self.companies[company];
        let from_cash = amount.min(target.books.cash).max(0);
        target.books.cash -= from_cash;
        target.books.debt += amount - from_cash;
        target.books.retained_earnings -= amount;
    }

    /// Something happens at a company the fund owns, and the player chooses.
    pub(crate) fn maybe_event(&mut self, company: usize) {
        if self.event_open(company) || !self.rng.chance_bps(250) {
            return;
        }
        let target = &self.companies[company];
        let Some(holding) = &target.holding else {
            return;
        };
        let held = self.months_elapsed - holding.acquired_month;
        let revenue = target.ttm_revenue();
        let asset_heavy = self.industries[target.sector].capex_ratio_bps >= 150;
        let mut pool: Vec<(EventKind, i64, i64)> = vec![
            (EventKind::TeamPoaching, 2, 0),
            (
                EventKind::CostShock,
                if target.has(Trait::RegulatedCustomers) {
                    4
                } else {
                    2
                },
                0,
            ),
            (EventKind::CyberIncident, 1, mul_bps(revenue, 40)),
        ];
        if holding.earnout_open && (6..30).contains(&held) {
            pool.push((EventKind::EarnoutDispute, 3, mul_bps(holding.entry_ev, 300)));
        }
        if asset_heavy {
            let weight = if target.has(Trait::SinglePlant) {
                3
            } else if target.has(Trait::AgingEquipment) {
                2
            } else {
                1
            };
            pool.push((EventKind::PlantOutage, weight, mul_bps(revenue, 200)));
        }
        if target.customer_concentration_bps > 3_000 {
            pool.push((EventKind::CustomerRenegotiation, 3, 0));
        }
        if !holding.incentive_asked && held >= 6 {
            pool.push((EventKind::IncentivePlan, 2, 0));
        }
        if self.economy.credit_spread_bps + 100 < target.debt_spread_bps && target.books.debt > 0 {
            pool.push((EventKind::RepricingWindow, 4, target.books.debt / 200));
        }
        let total: i64 = pool.iter().map(|item| item.1).sum();
        let mut mark = self.rng.range(1, total);
        let mut picked = pool[0];
        for item in pool {
            if mark <= item.1 {
                picked = item;
                break;
            }
            mark -= item.1;
        }
        let (event, _, amount) = picked;
        let holding = self.companies[company]
            .holding
            .as_mut()
            .expect("holding exists");
        match event {
            EventKind::EarnoutDispute => holding.earnout_open = false,
            EventKind::IncentivePlan => holding.incentive_asked = true,
            _ => {}
        }
        self.post_decision(
            MessageKind::Event { event, amount },
            Some(company),
            vec![Choice::First, Choice::Second],
            2,
        );
    }

    pub(crate) fn decide_event(
        &mut self,
        company: usize,
        event: EventKind,
        amount: i64,
        choice: Choice,
    ) {
        let first = choice == Choice::First;
        if event == EventKind::CoInvestRequest {
            if let Some(deal) = self.deal_index(company) {
                self.deals[deal].coinvest = first;
            }
            self.lp_mood(if first { 6 } else { -3 });
            return;
        }
        if !self.companies[company].is_player_owned() {
            return;
        }
        let push = |world: &mut World, months_left: u32, growth_bps: i64, starts_in: u32| {
            world.companies[company].effects.push(GrowthEffect {
                months_left,
                growth_bps,
                starts_in,
            });
        };
        match (event, first) {
            (EventKind::EarnoutDispute, true) => self.charge(company, amount),
            (EventKind::EarnoutDispute, false) => {
                // Court: even odds, and it costs more to lose there.
                if self.rng.chance_bps(5_000) {
                    self.charge(company, amount * 5 / 3);
                    self.career.adjust_reputation(-2);
                }
            }
            (EventKind::TeamPoaching, true) => {
                let target = &mut self.companies[company];
                target.sga_fixed = mul_bps(target.sga_fixed, 10_150);
            }
            (EventKind::TeamPoaching, false) => {
                let target = &mut self.companies[company];
                target.management = (target.management - 1).max(1);
                push(self, 3, -10, 0);
            }
            (EventKind::PlantOutage, true) => {
                // Pay to rebuild now: one bad month, then back.
                let target = &mut self.companies[company];
                let spend = amount.min(target.books.cash).max(0);
                target.books.cash -= spend;
                target.books.debt += amount - spend;
                target.books.gross_ppe += amount;
                push(self, 1, -600, 0);
                push(self, 1, 640, 1);
            }
            (EventKind::PlantOutage, false) => {
                push(self, 3, -250, 0);
                push(self, 1, 500, 3);
                self.companies[company].gross_margin_bps -= 30;
            }
            (EventKind::CustomerRenegotiation, true) => {
                self.companies[company].gross_margin_bps -= 80
            }
            (EventKind::CustomerRenegotiation, false) => {
                if self.rng.chance_bps(3_500) {
                    let target = &mut self.companies[company];
                    target.revenue = mul_bps(target.revenue, 9_300);
                }
            }
            (EventKind::CostShock, true) => {
                let drag = if self.companies[company].has(Trait::BrandStrength) {
                    -20
                } else {
                    -40
                };
                push(self, 6, drag, 0);
            }
            (EventKind::CostShock, false) => self.companies[company].gross_margin_bps -= 120,
            (EventKind::CyberIncident, true) => self.charge(company, amount),
            (EventKind::CyberIncident, false) => {
                if self.rng.chance_bps(3_000) {
                    self.charge(company, amount * 2);
                    self.career.adjust_reputation(-5);
                    self.trust(INVESTOR_RELATIONS, -6);
                }
            }
            (EventKind::IncentivePlan, true) => {
                let target = &mut self.companies[company];
                target.management = (target.management + 2).min(20);
                if let Some(holding) = target.holding.as_mut() {
                    holding.ownership_bps = mul_bps(holding.ownership_bps, 9_500);
                }
                self.trust(OPERATING, 2);
            }
            (EventKind::IncentivePlan, false) => {
                let target = &mut self.companies[company];
                target.management = (target.management - 1).max(1);
            }
            (EventKind::RepricingWindow, true) => {
                self.charge(company, amount);
                self.companies[company].debt_spread_bps = self.economy.credit_spread_bps;
            }
            _ => {}
        }
    }

    // ----- hooks -----

    pub(crate) fn after_close(
        &mut self,
        company: usize,
        ev: i64,
        equity: i64,
        rivals: usize,
        exclusive: bool,
    ) {
        self.year.closes += 1;
        self.year.deployed += equity;
        self.records.largest_deal_ev = self.records.largest_deal_ev.max(ev);
        self.unlock(Achievement::FirstClose);
        if self.economy.phase == Phase::Recession {
            self.unlock(Achievement::RecessionBuyer);
        }
        if exclusive {
            self.unlock(Achievement::Proprietary);
        }
        if rivals >= 3 {
            self.unlock(Achievement::AuctionWinner);
        }
        if ev >= 300_000 {
            self.unlock(Achievement::BigGame);
        }
        if self.career.deals_closed >= 10 {
            self.unlock(Achievement::Dealmaker);
        }
        if self.companies[company].country != "US" {
            self.unlock(Achievement::CrossBorder);
        }
    }

    pub(crate) fn after_exit(&mut self, holding: &Holding, proceeds: i64, moic_millis: i64) {
        let months = self.months_elapsed - holding.acquired_month;
        self.year.exits += 1;
        let records = &mut self.records;
        records.best_moic_millis = records.best_moic_millis.max(moic_millis);
        records.largest_exit_proceeds = records.largest_exit_proceeds.max(proceeds);
        records.total_proceeds += proceeds;
        if moic_millis >= 1_000
            && (records.fastest_exit_months == 0 || months < records.fastest_exit_months)
        {
            records.fastest_exit_months = months;
        }
        // The partners remember how they voted.
        for (partner, stance) in holding.votes.clone().into_iter().enumerate().take(PARTNERS) {
            let change = match (stance, moic_millis) {
                (Stance::For, moic) if moic >= 2_000 => 6,
                (_, moic) if moic >= 2_000 => 3,
                (Stance::For, moic) if moic < 1_000 => -4,
                (_, moic) if moic < 1_000 => -8,
                _ => 0,
            };
            self.trust(partner, change);
        }
        self.lp_mood(((moic_millis - 1_500) / 250).clamp(-5, 5));
        self.unlock(Achievement::FirstExit);
        if moic_millis >= 2_000 {
            self.unlock(Achievement::DoubleUp);
        }
        if moic_millis >= 3_000 {
            self.unlock(Achievement::TripleUp);
        }
        if moic_millis >= 5_000 {
            self.unlock(Achievement::HomeRun);
        }
        if moic_millis >= 2_000 && months < 24 {
            self.unlock(Achievement::QuickFlip);
        }
        if holding.add_ons >= 3 {
            self.unlock(Achievement::RollUp);
        }
        if holding.full_diligence && !holding.surprised && moic_millis >= 1_500 {
            self.unlock(Achievement::CleanSheet);
        }
        if holding.distressed_entry && moic_millis >= 2_000 {
            self.unlock(Achievement::Turnaround);
        }
        if holding.cured && moic_millis >= 1_500 {
            self.unlock(Achievement::ComebackKid);
        }
    }

    pub(crate) fn after_breach(&mut self) {
        self.year.breaches += 1;
        self.trust(CHAIR, -4);
        self.trust(SPECIAL, -2);
    }

    pub(crate) fn after_keys(&mut self) {
        for partner in 0..PARTNERS {
            self.trust(partner, -8);
        }
        self.lp_mood(-6);
    }

    pub(crate) fn after_report(&mut self, now: bool, caught: bool) {
        if now {
            self.trust(CHAIR, 3);
            self.trust(INVESTOR_RELATIONS, 2);
        } else if caught {
            self.trust(CHAIR, -8);
        }
    }

    // ----- the year -----

    pub(crate) fn set_objectives(&mut self) {
        self.year = YearStats::default();
        let holdings = self
            .companies
            .iter()
            .filter(|company| company.is_player_owned())
            .count();
        let ripe = self
            .companies
            .iter()
            .filter_map(|company| {
                company
                    .holding
                    .as_ref()
                    .filter(|_| company.is_player_owned())
            })
            .any(|holding| self.months_elapsed.saturating_sub(holding.acquired_month) >= 36);
        let investing = self.fund.investing(self.date);
        let mut objectives = Vec::new();
        if investing {
            objectives.push(Objective {
                kind: ObjectiveKind::CloseDeals,
                target: 1,
            });
        }
        if ripe {
            objectives.push(Objective {
                kind: ObjectiveKind::ExitCount,
                target: 1,
            });
        }
        if holdings > 0 {
            objectives.push(Objective {
                kind: ObjectiveKind::FinishInitiatives,
                target: 2,
            });
            objectives.push(Objective {
                kind: ObjectiveKind::CleanCovenants,
                target: 0,
            });
        } else {
            objectives.push(Objective {
                kind: ObjectiveKind::BuildRelationships,
                target: 3,
            });
        }
        if investing && objectives.len() < 3 {
            objectives.push(Objective {
                kind: ObjectiveKind::DeployCapital,
                target: self.fund.committed / 10,
            });
        }
        if objectives.len() < 3 {
            objectives.push(Objective {
                kind: ObjectiveKind::NoRejections,
                target: 0,
            });
        }
        objectives.truncate(3);
        self.objectives = objectives;
    }

    pub fn objective_progress(&self, objective: &Objective) -> i64 {
        match objective.kind {
            ObjectiveKind::CloseDeals => self.year.closes,
            ObjectiveKind::DeployCapital => self.year.deployed,
            ObjectiveKind::BuildRelationships => self
                .companies
                .iter()
                .filter(|company| company.is_active() && company.relationship >= 60)
                .count() as i64,
            ObjectiveKind::FinishInitiatives => self.year.initiatives,
            ObjectiveKind::CleanCovenants => self.year.breaches,
            ObjectiveKind::ExitCount => self.year.exits,
            ObjectiveKind::NoRejections => self.year.rejections,
        }
    }

    pub fn objective_met(&self, objective: &Objective) -> bool {
        let progress = self.objective_progress(objective);
        match objective.kind {
            // These two are kept by nothing going wrong.
            ObjectiveKind::CleanCovenants | ObjectiveKind::NoRejections => progress == 0,
            _ => progress >= objective.target,
        }
    }

    /// December: the chair looks at the list.
    pub(crate) fn review_objectives(&mut self) {
        if self.objectives.is_empty() {
            return;
        }
        let total = self.objectives.len();
        let met = self
            .objectives
            .clone()
            .iter()
            .filter(|objective| self.objective_met(objective))
            .count();
        self.career
            .adjust_reputation(met as i64 * 2 - (total - met) as i64);
        self.trust(CHAIR, met as i64 * 3 - (total - met) as i64 * 2);
        let bonus = self.career.rank.salary() * met as i64 / 20;
        self.career.wealth += bonus;
        self.post(MessageKind::ObjectivesReview { met, total, bonus }, None);
    }

    /// Quarterly: the investors look at pace and returns.
    pub(crate) fn update_lps(&mut self) {
        let nav = self.nav();
        let tvpi = self.fund.tvpi_millis(nav);
        let elapsed = i64::from(self.months_elapsed.saturating_sub(self.fund_started_month));
        let realized_cost: i64 = self.fund.realized.iter().map(|item| item.cost).sum();
        let deployed_bps = ratio_bps(realized_cost + self.invested_cost(), self.fund.committed);
        let expected_bps = (elapsed * 8_500 / 60).min(8_500);
        let behind = ((expected_bps - deployed_bps) / 100 - 20).max(0);
        let dpi = self.fund.dpi_millis();
        let rank = self.league_rank();
        for lp in &mut self.lps {
            // Early marks say little; nobody judges a fund in its first two years.
            let returns = if elapsed >= 24 {
                (tvpi - 1_000) / 25
            } else {
                0
            };
            let cash = if elapsed >= 60 { (dpi - 500) / 40 } else { 0 };
            let target = 52
                + match lp.kind {
                    LpKind::PublicPension | LpKind::Insurer => returns / 2 + cash - behind,
                    LpKind::Endowment | LpKind::FamilyOffice => returns + cash / 2 - behind / 2,
                    LpKind::FundOfFunds => returns / 2 + (5 - rank as i64) * 4 - behind / 2,
                };
            lp.satisfaction =
                (lp.satisfaction + (target.clamp(0, 100) - lp.satisfaction) / 6).clamp(0, 100);
        }
    }

    /// What the investors would commit to a successor, given how they feel.
    pub fn next_fund_size(&self, own_house: bool) -> i64 {
        let raised: i64 = self
            .lps
            .iter()
            .map(|lp| {
                let reup = match lp.satisfaction {
                    70.. => 150,
                    55..=69 => 110,
                    40..=54 => 70,
                    _ => 0,
                };
                mul_bps(self.fund.committed, lp.share_bps) * reup / 100
            })
            .sum();
        // A first fund under a new name raises less than the franchise would.
        let raised = if own_house { raised * 6 / 10 } else { raised };
        (raised / 10_000 * 10_000).max(150_000)
    }

    /// The player's place among the nine houses by gross multiple. 1 is best.
    pub fn league_rank(&self) -> usize {
        self.league_rows()
            .iter()
            .position(|row| row.house.is_none())
            .map(|at| at + 1)
            .unwrap_or(9)
    }

    /// Checked every month.
    pub(crate) fn monthly_achievements(&mut self) {
        match self.career.rank {
            Rank::Principal => self.unlock(Achievement::MadePrincipal),
            Rank::Partner => self.unlock(Achievement::MadePartner),
            Rank::Founder => self.unlock(Achievement::OwnName),
            Rank::VicePresident => {}
        }
        let friends = self
            .companies
            .iter()
            .filter(|company| company.is_active() && company.relationship >= 60)
            .count();
        if friends >= 8 {
            self.unlock(Achievement::Networker);
        }
        if self.fund.dpi_millis() >= 1_000 {
            self.unlock(Achievement::Distributor);
        }
        let realized_cost: i64 = self.fund.realized.iter().map(|item| item.cost).sum();
        if realized_cost + self.invested_cost() >= self.fund.committed * 85 / 100 {
            self.unlock(Achievement::FullyInvested);
        }
        if self.career.exits >= 2 && self.league_rank() == 1 {
            self.unlock(Achievement::TopOfTheTable);
        }
    }
}
