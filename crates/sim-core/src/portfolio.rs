//! After the close: budgets, initiatives, covenants, what diligence missed,
//! bolt-ons, recaps, and the exit.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::company::{Budget, GrowthEffect, IssueKind, Owner, Trait};
use crate::economy::Phase;
use crate::fund::Realized;
use crate::market::{Bidder, RIVAL_HOUSES};
use crate::math::{irr_bps, mul_bps, mul_millis, ratio_millis};
use crate::world::{Choice, CommandError, MessageKind, World};

const EXIT_FEE_BPS: i64 = 150;
const MIN_COVER_MILLIS: i64 = 1_500;
const MIN_HOLD_MONTHS: u32 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InitiativeKind {
    PricingReview,
    Procurement,
    LeanProgram,
    SalesExpansion,
    HeadcountReduction,
    ManagementChange,
    SaleLeaseback,
    WorkingCapital,
}

pub const INITIATIVES: [InitiativeKind; 8] = [
    InitiativeKind::PricingReview,
    InitiativeKind::Procurement,
    InitiativeKind::LeanProgram,
    InitiativeKind::SalesExpansion,
    InitiativeKind::HeadcountReduction,
    InitiativeKind::ManagementChange,
    InitiativeKind::SaleLeaseback,
    InitiativeKind::WorkingCapital,
];

impl InitiativeKind {
    pub fn months(self) -> u32 {
        match self {
            InitiativeKind::PricingReview => 3,
            InitiativeKind::Procurement => 4,
            InitiativeKind::LeanProgram => 6,
            InitiativeKind::SalesExpansion => 6,
            InitiativeKind::HeadcountReduction => 2,
            InitiativeKind::ManagementChange => 3,
            InitiativeKind::SaleLeaseback => 3,
            InitiativeKind::WorkingCapital => 4,
        }
    }
    /// One-off cost as a share of trailing revenue.
    pub fn cost_bps(self) -> i64 {
        match self {
            InitiativeKind::PricingReview => 20,
            InitiativeKind::Procurement => 40,
            InitiativeKind::LeanProgram => 100,
            InitiativeKind::SalesExpansion => 150,
            InitiativeKind::HeadcountReduction => 80,
            InitiativeKind::ManagementChange => 60,
            InitiativeKind::SaleLeaseback => 10,
            InitiativeKind::WorkingCapital => 30,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Initiative {
    pub kind: InitiativeKind,
    pub months_left: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExitRoute {
    Strategic,
    Secondary,
    Ipo,
}

impl ExitRoute {
    /// Months from launch to an offer.
    pub fn months(self) -> u32 {
        match self {
            ExitRoute::Strategic => 5,
            ExitRoute::Secondary => 4,
            ExitRoute::Ipo => 6,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExitProcess {
    pub route: ExitRoute,
    pub months_left: u32,
    /// Set when the buyer names a price. This is a cleared price only once accepted.
    pub offer_ev: Option<i64>,
}

/// A committee mark at a quarter end. Not a price.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Mark {
    pub month: u32,
    pub ebitda: i64,
    pub ev: i64,
    pub net_debt: i64,
    pub equity: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Holding {
    pub acquired: GameDate,
    pub acquired_month: u32,
    pub entry_ev: i64,
    pub entry_ebitda: i64,
    pub entry_multiple_millis: i64,
    pub entry_net_debt: i64,
    /// Fund money in: the equity check, fees, diligence, later injections.
    pub cost: i64,
    pub ownership_bps: i64,
    pub dividends: i64,
    pub max_leverage_millis: i64,
    pub min_cover_millis: i64,
    pub maturity: GameDate,
    /// Tests failed in a row without a cure or a waiver.
    pub breaches: u32,
    pub waiver_quarters: u32,
    pub plan: Vec<InitiativeKind>,
    pub initiatives: Vec<Initiative>,
    pub done: Vec<InitiativeKind>,
    pub exit: Option<ExitProcess>,
    pub marks: Vec<Mark>,
    pub add_ons: u32,
    /// (month index, amount) from the fund's side: money in is negative.
    pub flows: Vec<(u32, i64)>,
    pub strike: bool,
    /// How each partner voted at entry, by seat.
    pub votes: Vec<crate::deal::Stance>,
    pub earnout_open: bool,
    pub incentive_asked: bool,
    pub full_diligence: bool,
    /// Convertible bonds outstanding: debt until the exit, shares at it.
    #[serde(default)]
    pub convertible: i64,
    /// Something diligence missed has gone off.
    pub surprised: bool,
    pub distressed_entry: bool,
    pub cured: bool,
    /// A swap or a cap on the base rate of part of the debt.
    #[serde(default)]
    pub hedge: Option<Hedge>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HedgeKind {
    /// Pays a fixed base rate instead of the floating one.
    Swap,
    /// Pays the floating base rate up to a strike, for a premium up front.
    Cap,
}

/// A contract on the base rate. Terms, not a price: nothing here is marked to market.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hedge {
    pub kind: HedgeKind,
    /// Share of the debt it covers.
    pub share_bps: i64,
    /// The swap's fixed base rate, or the cap's strike.
    pub rate_bps: i64,
    pub months: u32,
    pub months_left: u32,
    /// What the company paid up front. Zero for a swap.
    pub premium: i64,
}

/// Terms a bank offers for a hedge on one holding, today.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HedgeQuote {
    pub floating_bps: i64,
    /// (months, fixed base rate).
    pub swaps: Vec<(u32, i64)>,
    /// (strike above today's rate, months, strike, premium for the whole debt).
    pub caps: Vec<(i64, u32, i64, i64)>,
}

pub const HEDGE_MONTHS: [u32; 3] = [12, 24, 36];
pub const CAP_OFFSETS_BPS: [i64; 3] = [50, 100, 200];
pub const HEDGE_SHARES_BPS: [i64; 2] = [5_000, 10_000];

impl Hedge {
    /// The base rate on the debt it covers, given the floating one.
    pub fn hedged_rate_bps(&self, floating: i64) -> i64 {
        match self.kind {
            HedgeKind::Swap => self.rate_bps,
            HedgeKind::Cap => floating.min(self.rate_bps),
        }
    }
}

impl Holding {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        acquired: GameDate,
        month: u32,
        entry_ev: i64,
        entry_ebitda: i64,
        entry_multiple_millis: i64,
        entry_net_debt: i64,
        cost: i64,
        ownership_bps: i64,
        max_leverage_millis: i64,
        plan: Vec<InitiativeKind>,
    ) -> Holding {
        Holding {
            acquired,
            acquired_month: month,
            entry_ev,
            entry_ebitda,
            entry_multiple_millis,
            entry_net_debt,
            cost,
            ownership_bps,
            dividends: 0,
            max_leverage_millis,
            min_cover_millis: MIN_COVER_MILLIS,
            maturity: acquired.plus_months(84),
            breaches: 0,
            waiver_quarters: 0,
            plan,
            initiatives: Vec::new(),
            done: Vec::new(),
            exit: None,
            marks: Vec::new(),
            add_ons: 0,
            flows: vec![(month, -cost)],
            strike: false,
            votes: Vec::new(),
            earnout_open: false,
            incentive_asked: false,
            full_diligence: false,
            convertible: 0,
            surprised: false,
            distressed_entry: false,
            cured: false,
            hedge: None,
        }
    }
}

impl World {
    fn held(&self, company: usize) -> Result<&Holding, CommandError> {
        self.companies
            .get(company)
            .filter(|target| target.is_player_owned())
            .and_then(|target| target.holding.as_ref())
            .ok_or(CommandError::NotHeld)
    }

    fn holding_mut(&mut self, company: usize) -> &mut Holding {
        self.companies[company]
            .holding
            .as_mut()
            .expect("held company has a holding")
    }

    /// The fund's share of today's model equity. A mark, not a price.
    pub fn holding_value(&self, company: usize) -> i64 {
        let target = &self.companies[company];
        let Some(holding) = &target.holding else {
            return 0;
        };
        // Convertible bonds become shares rather than debt to repay.
        let equity = (target.model_equity(&self.industries[target.sector], &self.economy)
            + holding.convertible)
            .max(0);
        mul_bps(equity, holding.ownership_bps)
    }

    pub fn nav(&self) -> i64 {
        (0..self.companies.len())
            .filter(|index| self.companies[*index].is_player_owned())
            .map(|index| self.holding_value(index))
            .sum()
    }

    pub(crate) fn invested_cost(&self) -> i64 {
        self.companies
            .iter()
            .filter(|target| target.is_player_owned())
            .filter_map(|target| target.holding.as_ref())
            .map(|holding| holding.cost)
            .sum()
    }

    pub(crate) fn set_budget(
        &mut self,
        company: usize,
        budget: Budget,
    ) -> Result<(), CommandError> {
        self.held(company)?;
        let valid = (0..=500).contains(&budget.growth_bps)
            && (0..=300).contains(&budget.efficiency_bps)
            && (0..=100).contains(&budget.sweep_pct)
            && (0..=100).contains(&budget.dividend_pct);
        if !valid {
            return Err(CommandError::InvalidBudget);
        }
        if budget.dividend_pct > 0 && self.held(company)?.breaches > 0 {
            return Err(CommandError::CovenantBlocks);
        }
        self.companies[company].budget = budget;
        Ok(())
    }

    pub(crate) fn start_initiative(
        &mut self,
        company: usize,
        kind: InitiativeKind,
    ) -> Result<(), CommandError> {
        let holding = self.held(company)?;
        if holding.done.contains(&kind) || holding.initiatives.iter().any(|item| item.kind == kind)
        {
            return Err(CommandError::AlreadyDone);
        }
        if holding.initiatives.len() >= self.career.rank.max_initiatives() {
            return Err(CommandError::TooManyInitiatives);
        }
        let planned = holding.plan.contains(&kind);
        let cost = mul_bps(self.companies[company].ttm_revenue(), kind.cost_bps());
        if self.companies[company].books.cash < cost {
            return Err(CommandError::CompanyCashShort);
        }
        // Work the committee already backed costs no attention.
        if !planned {
            self.spend_attention(1)?;
        }
        let target = &mut self.companies[company];
        target.books.cash -= cost;
        target.books.retained_earnings -= cost;
        self.holding_mut(company).initiatives.push(Initiative {
            kind,
            months_left: kind.months(),
        });
        Ok(())
    }

    fn finish_initiative(&mut self, company: usize, kind: InitiativeKind) {
        let management = self.companies[company].management;
        // A strong team lands more of the plan.
        let skill = 70 + management * 3;
        let mut strike = false;
        let mut lost_customer = false;
        let roll =
            |world: &mut World, low: i64, high: i64| world.rng.range(low, high) * skill / 100;
        match kind {
            InitiativeKind::PricingReview => {
                let brand = if self.companies[company].has(Trait::BrandStrength) {
                    140
                } else {
                    100
                };
                let gain = roll(self, 80, 180) * brand / 100;
                let risky = self.companies[company].customer_concentration_bps > 4_000;
                lost_customer = risky && self.rng.chance_bps(2_500);
                let target = &mut self.companies[company];
                target.gross_margin_bps += gain;
                target.effects.push(GrowthEffect {
                    months_left: 6,
                    growth_bps: -12,
                    starts_in: 0,
                });
                if lost_customer {
                    target.revenue = mul_bps(target.revenue, 9_200);
                }
            }
            InitiativeKind::Procurement => {
                let gain = roll(self, 50, 110);
                self.companies[company].gross_margin_bps += gain;
            }
            InitiativeKind::LeanProgram => {
                let cut = roll(self, 400, 800);
                let target = &mut self.companies[company];
                target.sga_fixed = mul_bps(target.sga_fixed, 10_000 - cut);
            }
            InitiativeKind::SalesExpansion => {
                let untapped = if self.companies[company].has(Trait::UnderinvestedSales) {
                    150
                } else {
                    100
                };
                let gain = roll(self, 8, 20) * untapped / 100;
                let target = &mut self.companies[company];
                target.growth_bps += gain;
                target.sga_fixed = mul_bps(target.sga_fixed, 10_400);
            }
            InitiativeKind::HeadcountReduction => {
                let cut = self.rng.range(700, 1_200);
                let union = self.companies[company].union_strength_bps;
                let loyal = self.companies[company].has(Trait::FamilyWorkforce);
                strike = self
                    .rng
                    .chance_bps((union * 6 / 10 + if loyal { 2_000 } else { 0 }).min(9_500) as u32);
                if loyal {
                    self.career.adjust_reputation(-1);
                }
                let target = &mut self.companies[company];
                target.sga_fixed = mul_bps(target.sga_fixed, 10_000 - cut);
                target.employees = target.employees * 88 / 100;
                self.career.adjust_reputation(-2);
            }
            InitiativeKind::ManagementChange => {
                let change = self.rng.range(-2, 6);
                self.companies[company].replace_ceo(&mut self.rng);
                let target = &mut self.companies[company];
                target.management = (target.management + change).clamp(1, 20);
                target.effects.push(GrowthEffect {
                    months_left: 3,
                    growth_bps: -15,
                    starts_in: 0,
                });
                for issue in &mut target.issues {
                    if issue.kind == IssueKind::KeyPerson {
                        issue.triggered = true;
                    }
                }
            }
            InitiativeKind::SaleLeaseback => {
                let target = &mut self.companies[company];
                let gross = target.books.gross_ppe * 4 / 10;
                let accumulated = target.books.accumulated_depreciation * 4 / 10;
                let proceeds = gross - accumulated;
                target.books.gross_ppe -= gross;
                target.books.accumulated_depreciation -= accumulated;
                target.books.cash += proceeds;
                target.sga_fixed += proceeds * 8 / 100 / 12;
            }
            InitiativeKind::WorkingCapital => {
                let target = &mut self.companies[company];
                target.dso_adjust_days -= 6;
                target.dio_adjust_days -= 8;
            }
        }
        let planned = self.holding_mut(company).plan.contains(&kind);
        self.holding_mut(company).done.push(kind);
        self.year.initiatives += 1;
        if planned {
            self.trust(4, 2);
        }
        if kind == InitiativeKind::HeadcountReduction {
            self.trust(5, -3);
            self.adjust_street(-3);
        }
        self.post(MessageKind::InitiativeDone { kind }, Some(company));
        if lost_customer {
            self.post(
                MessageKind::IssueSurfaced {
                    issue: IssueKind::CustomerConcentration,
                },
                Some(company),
            );
        }
        if strike {
            self.start_strike(company);
        }
    }

    fn start_strike(&mut self, company: usize) {
        if self.holding_mut(company).strike {
            return;
        }
        self.holding_mut(company).strike = true;
        self.companies[company].effects.push(GrowthEffect {
            months_left: 1,
            growth_bps: -2_000,
            starts_in: 0,
        });
        self.career.adjust_reputation(-3);
        self.post_decision(
            MessageKind::Strike,
            Some(company),
            vec![Choice::Settle, Choice::HoldOut],
            2,
        );
    }

    pub(crate) fn decide_strike(&mut self, company: usize, choice: Choice) {
        if !self.companies[company].is_player_owned() {
            return;
        }
        let settle = choice == Choice::Settle;
        let target = &mut self.companies[company];
        if settle {
            target.sga_fixed = mul_bps(target.sga_fixed, 10_400);
            target.effects.push(GrowthEffect {
                months_left: 1,
                growth_bps: 2_300,
                starts_in: 0,
            });
        } else {
            // The line holds. Output comes back slowly, without the raise.
            target.effects.push(GrowthEffect {
                months_left: 2,
                growth_bps: -900,
                starts_in: 0,
            });
            target.effects.push(GrowthEffect {
                months_left: 6,
                growth_bps: 620,
                starts_in: 2,
            });
            self.career.adjust_reputation(-2);
        }
        self.holding_mut(company).strike = false;
    }

    /// Monthly work on every company the fund owns.
    pub(crate) fn portfolio_step(&mut self, closes_quarter: bool) {
        for company in 0..self.companies.len() {
            if !self.companies[company].is_player_owned() {
                continue;
            }
            let finished: Vec<InitiativeKind> = {
                let holding = self.holding_mut(company);
                for item in &mut holding.initiatives {
                    item.months_left = item.months_left.saturating_sub(1);
                }
                let finished = holding
                    .initiatives
                    .iter()
                    .filter(|item| item.months_left == 0)
                    .map(|item| item.kind)
                    .collect();
                holding.initiatives.retain(|item| item.months_left > 0);
                finished
            };
            for kind in finished {
                self.finish_initiative(company, kind);
            }
            self.surface_issues(company);
            self.maybe_event(company);
            self.maybe_approach(company);
            self.age_hedge(company);
            if closes_quarter {
                self.test_covenants(company);
                // The lenders may just have taken the company.
                if self.companies[company].is_player_owned() {
                    self.mark(company);
                }
            }
            if self.companies[company].is_player_owned() {
                self.exit_step(company);
            }
        }
    }

    fn age_hedge(&mut self, company: usize) {
        let holding = self.holding_mut(company);
        let Some(hedge) = holding.hedge.as_mut() else {
            return;
        };
        hedge.months_left = hedge.months_left.saturating_sub(1);
        if hedge.months_left == 0 {
            let kind = hedge.kind;
            holding.hedge = None;
            self.post(MessageKind::HedgeExpired { kind }, Some(company));
        }
    }

    /// Terms for a swap or a cap on a holding's debt. A swap's fixed rate leans
    /// on the last stance of the company's central bank; a cap costs more the
    /// closer its strike and the more uncertain the bloc.
    pub fn hedge_quote(&self, company: usize) -> Option<HedgeQuote> {
        let target = self.companies.get(company)?;
        target.holding.as_ref()?;
        let floating = self.economy.policy_rate_for(&target.country);
        let bloc = crate::macro_events::Bloc::of_country(&target.country).unwrap_or(crate::macro_events::Bloc::Us);
        let stance = self
            .macro_calendar
            .events
            .iter()
            .rev()
            .find(|event| {
                event.resolved()
                    && event.kind.category() == crate::macro_events::Category::CentralBank
                    && event.bloc() == bloc
            })
            .and_then(|event| event.stance)
            .unwrap_or(0);
        let uncertainty = self.economy.uncertainty_for(&target.country);
        let debt = target.books.debt.max(0);
        let swaps = HEDGE_MONTHS
            .iter()
            .map(|months| {
                let years = i64::from(*months / 12);
                (*months, (floating + years * (10 + stance * 20)).max(0))
            })
            .collect();
        let mut caps = Vec::new();
        for offset in CAP_OFFSETS_BPS {
            let yearly_bps = match offset {
                50 => 90,
                100 => 50,
                _ => 20,
            } * (100 + uncertainty)
                / 120;
            for months in HEDGE_MONTHS {
                let years = i64::from(months / 12);
                caps.push((offset, months, floating + offset, mul_bps(debt, yearly_bps * years)));
            }
        }
        Some(HedgeQuote { floating_bps: floating, swaps, caps })
    }

    pub(crate) fn hedge(
        &mut self,
        company: usize,
        kind: HedgeKind,
        share_bps: i64,
        months: u32,
        strike_offset_bps: i64,
    ) -> Result<(), CommandError> {
        self.held(company)?;
        if self.held(company)?.hedge.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        if !HEDGE_SHARES_BPS.contains(&share_bps) || !HEDGE_MONTHS.contains(&months) {
            return Err(CommandError::InvalidAmount);
        }
        if kind == HedgeKind::Cap && !CAP_OFFSETS_BPS.contains(&strike_offset_bps) {
            return Err(CommandError::InvalidAmount);
        }
        let quote = self.hedge_quote(company).ok_or(CommandError::NotHeld)?;
        let (rate_bps, premium) = match kind {
            HedgeKind::Swap => (
                quote.swaps.iter().find(|(m, _)| *m == months).map(|(_, rate)| *rate).unwrap_or(quote.floating_bps),
                0,
            ),
            HedgeKind::Cap => {
                let (_, _, strike, full) = quote
                    .caps
                    .iter()
                    .copied()
                    .find(|(offset, m, _, _)| *offset == strike_offset_bps && *m == months)
                    .ok_or(CommandError::InvalidAmount)?;
                (strike, mul_bps(full, share_bps))
            }
        };
        self.spend_attention(1)?;
        if premium > 0 {
            self.charge(company, premium);
        }
        self.holding_mut(company).hedge = Some(Hedge {
            kind,
            share_bps,
            rate_bps,
            months,
            months_left: months,
            premium,
        });
        Ok(())
    }

    /// What diligence did not find goes off after the close.
    fn surface_issues(&mut self, company: usize) {
        let held_months =
            self.months_elapsed - self.held(company).map(|h| h.acquired_month).unwrap_or(0);
        if held_months < 3 {
            return;
        }
        for slot in 0..self.companies[company].issues.len() {
            let issue = self.companies[company].issues[slot].clone();
            if issue.found || issue.triggered || !self.rng.chance_bps(600) {
                continue;
            }
            self.companies[company].issues[slot].triggered = true;
            self.holding_mut(company).surprised = true;
            let target = &mut self.companies[company];
            let revenue = target.ttm_revenue();
            match issue.kind {
                IssueKind::InventoryOverstated => {
                    let loss = mul_bps(target.books.inventory, issue.severity_bps);
                    target.books.inventory -= loss;
                    target.books.retained_earnings -= loss;
                }
                IssueKind::CustomerConcentration => {
                    target.revenue = mul_bps(target.revenue, 10_000 - issue.severity_bps * 6 / 10);
                }
                IssueKind::DeferredMaintenance => {
                    let spend = mul_bps(revenue, issue.severity_bps / 4).min(target.books.cash);
                    target.books.cash -= spend;
                    target.books.gross_ppe += spend;
                }
                IssueKind::EnvironmentalLiability => {
                    let cost = mul_bps(revenue, issue.severity_bps / 6).min(target.books.cash);
                    target.books.cash -= cost;
                    target.books.retained_earnings -= cost;
                    self.career.adjust_reputation(-2);
                }
                IssueKind::KeyPerson => {
                    target.management = (target.management - 3).max(1);
                    target.effects.push(GrowthEffect {
                        months_left: 6,
                        growth_bps: -20,
                        starts_in: 0,
                    });
                }
                IssueKind::LaborDispute => {
                    self.start_strike(company);
                    continue;
                }
            }
            // Bad news travels: tell the committee now, or sit on it.
            self.post_decision(
                MessageKind::IssueSurfaced { issue: issue.kind },
                Some(company),
                vec![Choice::ReportNow, Choice::ReportLater],
                1,
            );
        }
    }

    pub(crate) fn decide_report(&mut self, choice: Choice) {
        if choice == Choice::ReportNow {
            self.career.adjust_reputation(1);
            self.after_report(true, false);
        } else if self.rng.chance_bps(6_000) {
            // The chair hears it from the lender instead.
            self.career.adjust_reputation(-6);
            self.after_report(false, true);
        }
    }

    fn test_covenants(&mut self, company: usize) {
        let target = &self.companies[company];
        let Some(holding) = &target.holding else {
            return;
        };
        let leverage = target.leverage_millis();
        let cover = target.interest_cover_millis(&self.economy);
        let failed = leverage > holding.max_leverage_millis
            || cover < holding.min_cover_millis
            || target.shortfall;
        let max_leverage = holding.max_leverage_millis;
        let waived = holding.waiver_quarters > 0;
        if waived {
            self.holding_mut(company).waiver_quarters -= 1;
            return;
        }
        if !failed {
            self.holding_mut(company).breaches = 0;
            return;
        }
        let breaches = {
            let holding = self.holding_mut(company);
            holding.breaches += 1;
            holding.breaches
        };
        if breaches >= 3 {
            self.lenders_take_keys(company);
            return;
        }
        let target = &mut self.companies[company];
        target.budget.dividend_pct = 0;
        target.budget.sweep_pct = 100;
        // Enough equity to sit a quarter turn inside the covenant.
        let ebitda = target.ttm_ebitda().max(0);
        let allowed = mul_millis(ebitda, max_leverage - 250).max(0);
        let cure =
            (target.net_debt() - allowed).max(target.min_cash(&self.industries[target.sector]));
        self.career.adjust_reputation(-3);
        self.after_breach();
        self.post_decision(
            MessageKind::CovenantBreach {
                leverage_millis: leverage,
                max_leverage_millis: max_leverage,
                cover_millis: cover,
                cure,
            },
            Some(company),
            vec![Choice::Cure, Choice::Waiver, Choice::Ignore],
            2,
        );
    }

    pub(crate) fn decide_breach(&mut self, company: usize, choice: Choice, cure: i64) {
        if !self.companies[company].is_player_owned() {
            return;
        }
        match choice {
            Choice::Cure => {
                if self.equity_cure(company, cure).is_ok() {
                    let holding = self.holding_mut(company);
                    holding.breaches = 0;
                    holding.cured = true;
                }
            }
            Choice::Waiver => {
                let target = &mut self.companies[company];
                let fee = target.books.debt / 100;
                target.books.debt += fee;
                target.books.retained_earnings -= fee;
                target.debt_spread_bps += 100;
                let holding = self.holding_mut(company);
                holding.waiver_quarters = 2;
                holding.breaches = 0;
                self.career.adjust_reputation(-1);
            }
            _ => {}
        }
    }

    pub(crate) fn equity_cure(&mut self, company: usize, amount: i64) -> Result<(), CommandError> {
        self.held(company)?;
        if amount <= 0 {
            return Err(CommandError::InvalidAmount);
        }
        if !self.fund.call(amount, self.months_elapsed) {
            return Err(CommandError::FundExhausted);
        }
        let month = self.months_elapsed;
        let target = &mut self.companies[company];
        target.inject_equity(amount);
        let floor = target.min_cash(&self.industries[target.sector]);
        let spare = (target.books.cash - floor).max(0);
        target.repay_from_cash(spare);
        let holding = self.holding_mut(company);
        holding.cost += amount;
        holding.flows.push((month, -amount));
        Ok(())
    }

    fn lenders_take_keys(&mut self, company: usize) {
        let month = self.months_elapsed;
        let date = self.date;
        let target = &mut self.companies[company];
        let holding = target.holding.take().expect("held company has a holding");
        target.owner = Owner::Lender;
        target.budget = Budget::default();
        target.cooldown = 3;
        let name = target.legal_name.clone();
        self.fund.realized.push(Realized {
            company: name,
            acquired: holding.acquired,
            exited: date,
            route: None,
            cost: holding.cost,
            proceeds: holding.dividends,
            moic_millis: ratio_millis(holding.dividends, holding.cost),
            irr_bps: irr_bps(&holding.flows),
        });
        let _ = month;
        self.career.adjust_reputation(-12);
        self.after_keys();
        self.post(MessageKind::LendersTookKeys, Some(company));
    }

    fn mark(&mut self, company: usize) {
        let target = &self.companies[company];
        let industry = &self.industries[target.sector];
        let mark = Mark {
            month: self.months_elapsed,
            ebitda: target.ttm_ebitda(),
            ev: target.model_ev(industry, &self.economy),
            net_debt: target.net_debt(),
            equity: self.holding_value(company),
        };
        let holding = self.holding_mut(company);
        holding.marks.push(mark);
        if holding.marks.len() > 60 {
            holding.marks.remove(0);
        }
    }

    /// Dividends the company paid this month go to the fund by its share.
    pub(crate) fn collect_dividends(&mut self, company: usize, dividends: i64) {
        if dividends <= 0 || !self.companies[company].is_player_owned() {
            return;
        }
        let month = self.months_elapsed;
        let holding = self.holding_mut(company);
        let share = mul_bps(dividends, holding.ownership_bps);
        holding.dividends += share;
        holding.flows.push((month, share));
        self.fund.distribute(share, month);
    }

    pub(crate) fn dividend_recap(
        &mut self,
        company: usize,
        amount: i64,
    ) -> Result<(), CommandError> {
        let holding = self.held(company)?;
        if amount <= 0 {
            return Err(CommandError::InvalidAmount);
        }
        if self.months_elapsed - holding.acquired_month < MIN_HOLD_MONTHS {
            return Err(CommandError::TooEarly);
        }
        if holding.breaches > 0 || holding.waiver_quarters > 0 {
            return Err(CommandError::CovenantBlocks);
        }
        let target = &self.companies[company];
        let ebitda = target.ttm_ebitda().max(1);
        let after = ratio_millis(target.net_debt() + amount, ebitda);
        let market = self.economy.max_senior_for(&target.country) + self.economy.max_mezz_millis();
        if after > market.min(holding.max_leverage_millis - 500) {
            return Err(CommandError::LendersRefuse);
        }
        self.spend_attention(2)?;
        if after > 5_000 {
            self.career.adjust_reputation(-1);
        }
        self.companies[company].recapitalize(amount);
        self.collect_dividends(company, amount);
        self.post(MessageKind::RecapPaid { amount }, Some(company));
        Ok(())
    }

    /// Buys a smaller company in the same sector and folds it into a platform.
    pub(crate) fn add_on(&mut self, platform: usize, target: usize) -> Result<(), CommandError> {
        let holding = self.held(platform)?;
        let max_leverage = holding.max_leverage_millis;
        if holding.breaches > 0 {
            return Err(CommandError::CovenantBlocks);
        }
        let candidate = self
            .companies
            .get(target)
            .ok_or(CommandError::UnknownCompany)?;
        if !candidate.is_active() || candidate.is_player_owned() || target == platform {
            return Err(CommandError::UnknownCompany);
        }
        if candidate.sector != self.companies[platform].sector {
            return Err(CommandError::DifferentSector);
        }
        if candidate.ttm_ebitda() > self.companies[platform].ttm_ebitda() {
            return Err(CommandError::TargetTooLarge);
        }
        let open = self.process_visible(target)
            || (matches!(candidate.owner, Owner::Founder { .. }) && candidate.relationship >= 50);
        if !open {
            return Err(CommandError::NotForSale);
        }
        let price = mul_bps(self.model_ev(target), 10_500);
        let fees = mul_bps(price, crate::deal::FEE_BPS);
        let need = price + fees;
        let industry = self.industries[self.companies[platform].sector].clone();
        let combined_ebitda =
            (self.companies[platform].ttm_ebitda() + candidate.ttm_ebitda()).max(0);
        let buyer = &self.companies[platform];
        let from_cash = (buyer.books.cash - buyer.min_cash(&industry))
            .max(0)
            .min(need);
        let debt_room = (mul_millis(combined_ebitda, max_leverage - 750) - buyer.books.debt).max(0);
        let from_debt = (need - from_cash).min(debt_room);
        let from_fund = need - from_cash - from_debt;
        if from_fund > self.fund.uncalled() {
            return Err(CommandError::FundExhausted);
        }
        self.spend_attention(2)?;
        self.fund.call(from_fund, self.months_elapsed);
        let fragmented = if self.companies[platform].has(Trait::FragmentedMarket) {
            400
        } else {
            0
        };
        let synergy_bps = self.rng.range(800, 1_500) + fragmented;
        let month = self.months_elapsed;
        let absorbed = self.companies[target].clone();
        let operating = absorbed.books.net_working_capital() + absorbed.books.net_ppe();
        let buyer = &mut self.companies[platform];
        buyer.absorb(&absorbed, synergy_bps);
        buyer.books.cash -= from_cash;
        buyer.books.debt += from_debt;
        buyer.books.share_capital += from_fund;
        // Price over the target's operating assets is goodwill; fees are expensed.
        buyer.books.goodwill += price - operating;
        buyer.books.retained_earnings -= fees;
        buyer.effects.push(GrowthEffect {
            months_left: 6,
            growth_bps: -15,
            starts_in: 0,
        });
        let holding = self.holding_mut(platform);
        holding.add_ons += 1;
        holding.cost += from_fund;
        if from_fund > 0 {
            holding.flows.push((month, -from_fund));
        }
        let gone = &mut self.companies[target];
        gone.owner = Owner::Merged;
        gone.process = None;
        gone.holding = None;
        self.drop_deal_record(target);
        self.post(
            MessageKind::AddOnClosed {
                target: absorbed.legal_name.clone(),
                price,
                from_fund,
            },
            Some(platform),
        );
        Ok(())
    }

    pub(crate) fn start_exit(
        &mut self,
        company: usize,
        route: ExitRoute,
    ) -> Result<(), CommandError> {
        let holding = self.held(company)?;
        if holding.exit.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        if self.months_elapsed - holding.acquired_month < MIN_HOLD_MONTHS {
            return Err(CommandError::TooEarly);
        }
        if route == ExitRoute::Ipo {
            if self.companies[company].ttm_ebitda() < 25_000 {
                return Err(CommandError::TooSmallToList);
            }
            if self.economy.phase == Phase::Recession {
                return Err(CommandError::WindowClosed);
            }
        }
        self.spend_attention(2)?;
        let months_left = route.months();
        self.holding_mut(company).exit = Some(ExitProcess {
            route,
            months_left,
            offer_ev: None,
        });
        Ok(())
    }

    fn exit_step(&mut self, company: usize) {
        let Some(exit) = self.holding_mut(company).exit.as_mut() else {
            return;
        };
        if exit.offer_ev.is_some() {
            return;
        }
        exit.months_left = exit.months_left.saturating_sub(1);
        if exit.months_left > 0 {
            return;
        }
        let route = exit.route;
        let phase = self.economy.phase;
        let shut = self.economy.uncertainty_for(&self.companies[company].country) >= 70;
        if route == ExitRoute::Ipo && (phase == Phase::Recession || shut) {
            self.holding_mut(company).exit = None;
            self.post(MessageKind::ExitPulled { route }, Some(company));
            return;
        }
        let factor = match route {
            ExitRoute::Strategic => {
                10_600
                    + self.rng.noise(600)
                    + match phase {
                        Phase::Expansion => 300,
                        Phase::Recession => -900,
                        _ => -200,
                    }
            }
            ExitRoute::Secondary => {
                10_000 + self.rng.noise(400) - (self.economy.credit_spread_bps - 400) * 3
            }
            ExitRoute::Ipo => {
                let country = &self.companies[company].country;
                11_200 + self.rng.noise(700) + (self.economy.valuation_index() - 100) * 40
                    - (self.economy.uncertainty_for(country) - crate::macro_events::UNCERTAINTY_BASE).max(0) * 20
            }
        };
        let ev = mul_bps(self.model_ev(company), factor.clamp(6_000, 14_000));
        let proceeds = self.exit_proceeds(company, ev);
        self.holding_mut(company)
            .exit
            .as_mut()
            .expect("exit exists")
            .offer_ev = Some(ev);
        self.post_decision(
            MessageKind::ExitOffer {
                route,
                ev,
                proceeds,
            },
            Some(company),
            vec![Choice::Accept, Choice::Decline],
            1,
        );
    }

    /// In good markets a strategic buyer sometimes calls first, and pays for the privilege.
    fn maybe_approach(&mut self, company: usize) {
        let Ok(holding) = self.held(company) else {
            return;
        };
        let held = self.months_elapsed - holding.acquired_month;
        if holding.exit.is_some()
            || held < 18
            || self.economy.phase != Phase::Expansion
            || !self.rng.chance_bps(60)
        {
            return;
        }
        let ev = mul_bps(self.model_ev(company), self.rng.range(10_800, 12_200));
        let proceeds = self.exit_proceeds(company, ev);
        self.holding_mut(company).exit = Some(ExitProcess {
            route: ExitRoute::Strategic,
            months_left: 0,
            offer_ev: Some(ev),
        });
        self.post_decision(
            MessageKind::ExitOffer {
                route: ExitRoute::Strategic,
                ev,
                proceeds,
            },
            Some(company),
            vec![Choice::Accept, Choice::Decline],
            1,
        );
    }

    /// What the fund receives if the company sells at `ev`.
    pub fn exit_proceeds(&self, company: usize, ev: i64) -> i64 {
        let target = &self.companies[company];
        let (ownership, convertible) = target
            .holding
            .as_ref()
            .map(|holding| (holding.ownership_bps, holding.convertible))
            .unwrap_or((0, 0));
        let equity = ev - mul_bps(ev, EXIT_FEE_BPS) - target.net_debt() + convertible;
        mul_bps(equity.max(0), ownership)
    }

    pub(crate) fn decide_exit(&mut self, company: usize, choice: Choice) {
        if !self.companies[company].is_player_owned() {
            return;
        }
        let Some(exit) = self.holding_mut(company).exit.clone() else {
            return;
        };
        let Some(ev) = exit.offer_ev else {
            return;
        };
        if choice != Choice::Accept {
            self.holding_mut(company).exit = None;
            return;
        }
        let proceeds = self.exit_proceeds(company, ev);
        let month = self.months_elapsed;
        let date = self.date;
        // A listing pays 60% at pricing and the rest when the lock-up ends.
        let now = if exit.route == ExitRoute::Ipo {
            proceeds * 6 / 10
        } else {
            proceeds
        };
        let industry = self.industries[self.companies[company].sector].clone();
        let house = self.rng.below(RIVAL_HOUSES as u64) as u8;
        let senior = self.economy.max_senior_for(&self.companies[company].country);
        let mut secondary_equity = None;
        let target = &mut self.companies[company];
        let mut holding = target.holding.take().expect("held company has a holding");
        let name = target.legal_name.clone();
        let ebitda = target.ttm_ebitda().max(0);
        match exit.route {
            ExitRoute::Secondary => {
                let debt = (ebitda * senior / 1_000).min(ev * 6 / 10);
                target.acquire(&industry, ev, debt);
                target.owner = Owner::Sponsor {
                    house,
                    months_held: 0,
                };
                secondary_equity = Some(ev - debt);
            }
            _ => {
                target.acquire(&industry, ev, (ev / 5).min(ebitda * 2));
                target.owner = if exit.route == ExitRoute::Ipo {
                    Owner::Public
                } else {
                    Owner::Corporate
                };
            }
        }
        target.debt_spread_bps = industry.interest_spread_bps;
        target.budget = Budget::default();
        target.cooldown = 36;
        target.relationship = 0;
        if let Some(equity) = secondary_equity {
            self.record_house_entry(company, house, equity);
        }
        self.fund.distribute(now, month);
        holding.flows.push((month, now));
        if proceeds > now {
            self.fund.pending.push(crate::fund::Pending {
                due_month: month + 6,
                amount: proceeds - now,
                company: name.clone(),
            });
            holding.flows.push((month + 6, proceeds - now));
        }
        let total = proceeds + holding.dividends;
        let moic_millis = ratio_millis(total, holding.cost);
        let irr = irr_bps(&holding.flows);
        self.fund.realized.push(Realized {
            company: name,
            acquired: holding.acquired,
            exited: date,
            route: Some(exit.route),
            cost: holding.cost,
            proceeds: total,
            moic_millis,
            irr_bps: irr,
        });
        self.career.exits += 1;
        self.after_exit(&holding, total, moic_millis);
        self.career.best_moic_millis = self.career.best_moic_millis.max(moic_millis);
        self.career
            .adjust_reputation(((moic_millis - 1_500) * 6 / 1_000).clamp(-12, 10));
        let buyer = match exit.route {
            ExitRoute::Secondary => Bidder::House { house },
            _ => Bidder::Strategic,
        };
        self.post(
            MessageKind::ExitClosed {
                route: exit.route,
                buyer,
                ev,
                proceeds: total,
                moic_millis,
                irr_bps: irr,
            },
            Some(company),
        );
    }
}
