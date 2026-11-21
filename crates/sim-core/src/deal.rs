//! The player's side of a deal: diligence, the offer, the investment
//! committee, the bid, and the close.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::company::{DdStream, IssueKind, Owner, DD_STREAMS};
use crate::fund::Rank;
use crate::market::{PlayerBid, Stage};
use crate::math::{div_round, irr_bps, mul_bps, mul_millis, ratio_bps, ratio_millis};
use crate::portfolio::{Holding, InitiativeKind};
use crate::world::{Choice, CommandError, MessageKind, World};

pub const FEE_BPS: i64 = 200;
pub const MAX_ROLLOVER_BPS: i64 = 3_000;
pub const DD_STREAM_COUNT: usize = 4;
const PROJECTION_MONTHS: i64 = 60;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Offer {
    pub ev: i64,
    /// Turns of trailing EBITDA, in thousandths.
    pub senior_millis: i64,
    pub mezz_millis: i64,
    /// Share of the equity the seller keeps. Founders only.
    pub rollover_bps: i64,
    /// The first hundred days: initiatives the committee is asked to back.
    pub plan: Vec<InitiativeKind>,
    /// What the junior money is: notes repaid at maturity, or bonds that
    /// convert into shares at exit.
    #[serde(default)]
    pub mezz_kind: MezzKind,
    /// New shares the fund subscribes on top of buying the old ones. The
    /// cash goes into the company, not to the seller.
    #[serde(default)]
    pub primary: i64,
    /// A buyout takes control; a minority stake buys a share of the owner's company and leaves it theirs.
    #[serde(default)]
    pub kind: DealKind,
    /// Minority only: the share of the existing shares the fund buys from the owner.
    #[serde(default)]
    pub stake_bps: i64,
    /// Minority only: preferred shares. At an exit the fund takes back what it put in before
    /// the owner shares in anything. Owners like it less.
    #[serde(default)]
    pub preferred: bool,
    /// Who lends the senior debt.
    #[serde(default)]
    pub lender: Lender,
    /// Floating with the policy rate, or swapped to a fixed rate at closing.
    #[serde(default)]
    pub rate: RateKind,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DealKind {
    #[default]
    Buyout,
    Minority,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Lender {
    /// A bank syndicate: the cheapest money, the tightest covenants.
    #[default]
    Bank,
    /// A private credit fund lends the whole senior piece itself: dearer, more of it,
    /// looser covenants, and the seller knows the money is there.
    PrivateCredit,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RateKind {
    #[default]
    Floating,
    /// A swap at closing fixes the policy-rate part for the life of the loan, for a premium.
    Fixed,
}

/// Private credit over the bank spread, on the senior piece.
pub const PRIVATE_CREDIT_PREMIUM_BPS: i64 = 150;
/// Private credit lends this much more senior debt, in turns of EBITDA (thousandths).
pub const PRIVATE_CREDIT_EXTRA_MILLIS: i64 = 500;
/// The swap's cost over today's policy rate.
pub const FIXED_PREMIUM_BPS: i64 = 35;
/// Covenant headroom over the leverage at closing.
const BANK_HEADROOM_MILLIS: i64 = 1_500;
const PRIVATE_CREDIT_HEADROOM_MILLIS: i64 = 2_500;
/// A minority stake is at least a tenth and stays under half.
pub const MIN_STAKE_BPS: i64 = 1_000;
pub const MAX_STAKE_BPS: i64 = 4_900;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MezzKind {
    /// Subordinated notes: a high cash coupon, the principal repaid.
    #[default]
    Notes,
    /// Convertible bonds: a low coupon; the holder converts into shares at exit.
    Convertible,
}

/// New shares at most this share of the price.
pub const MAX_PRIMARY_BPS: i64 = 3_000;
/// Coupons over the senior spread.
const NOTES_PREMIUM_BPS: i64 = 450;
const CONVERTIBLE_PREMIUM_BPS: i64 = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Financing {
    pub ebitda: i64,
    pub senior: i64,
    pub mezz: i64,
    pub debt: i64,
    pub fees: i64,
    pub rollover: i64,
    pub equity: i64,
    pub ownership_bps: i64,
    pub spread_bps: i64,
    pub annual_interest: i64,
    pub leverage_millis: i64,
    pub cover_millis: i64,
    pub price_to_model_bps: i64,
    pub multiple_millis: i64,
    /// New money into the company.
    #[serde(default)]
    pub primary: i64,
    /// Junior money that converts into shares at exit.
    #[serde(default)]
    pub convertible: i64,
    /// The seller's share after closing, and the bondholders' on conversion.
    #[serde(default)]
    pub seller_bps: i64,
    #[serde(default)]
    pub converted_bps: i64,
    /// The all-in rate on the debt: policy rate (or the fixed rate) plus the spread.
    #[serde(default)]
    pub rate_bps: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Returns {
    pub exit_ebitda: i64,
    pub exit_ev: i64,
    pub exit_net_debt: i64,
    pub proceeds: i64,
    pub moic_millis: i64,
    pub irr_bps: i64,
    /// Where the equity gain comes from. The three add up to the gain.
    pub from_ebitda: i64,
    pub from_multiple: i64,
    pub from_debt: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stance {
    For,
    Hold,
    Against,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Concern {
    Leverage,
    Price,
    InterestCover,
    NoFinancialDd,
    NoCommercialDd,
    NoOperationalDd,
    NoLegalDd,
    InventoryDays,
    ThinReturns,
    MultipleReliance,
    Downside,
    NoPlan,
    LayoffsInUnionShop,
    FundConcentration,
    OpenIssue,
    /// A minority stake in common shares: no control and nothing ahead of the owner.
    NoProtection,
}

/// Seats on the committee, in the order of the personas document.
pub const PARTNERS: usize = 6;
const CHAIR: usize = 0;
const OPERATING: usize = 4;
const INVESTOR_RELATIONS: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Vote {
    pub partner: usize,
    pub stance: Stance,
    pub concerns: Vec<Concern>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IcOutcome {
    Approved,
    Held,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IcResult {
    pub outcome: IcOutcome,
    pub votes: Vec<Vote>,
    pub date: GameDate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Deal {
    pub company: usize,
    pub opened: GameDate,
    pub streams_done: Vec<DdStream>,
    /// Ordered this month. The reports arrive when the month closes.
    pub streams_running: Vec<DdStream>,
    pub costs: i64,
    pub offer: Option<Offer>,
    pub ic: Option<IcResult>,
    pub bid_submitted: bool,
    /// The price the committee approved. A bid may go 5% above it without going back.
    #[serde(default)]
    pub approved_ev: i64,
    /// Investors take a fifth of the equity alongside the fund.
    #[serde(default)]
    pub coinvest: bool,
    #[serde(default)]
    pub coinvest_asked: bool,
    /// The indication of interest given in round one, as an enterprise value.
    #[serde(default)]
    pub indication: Option<i64>,
    /// The terms that came with the indication.
    #[serde(default)]
    pub indication_terms: Option<Offer>,
    /// The fund's own view of value. Nothing on screen shows a model value without it.
    #[serde(default)]
    pub valuation: Option<crate::valuation::Valuation>,
    /// Ordered this month; it comes in when the month closes.
    #[serde(default)]
    pub valuation_order: Option<crate::valuation::ValuationKind>,
    /// The committee booked for next month, or sitting now.
    #[serde(default)]
    pub ic_meeting: Option<crate::ic::Meeting>,
    /// The last meeting, with the questions and answers.
    #[serde(default)]
    pub ic_record: Option<crate::ic::Meeting>,
    /// Reports the committee wants in before a bid.
    #[serde(default)]
    pub ic_conditions: Vec<DdStream>,
    /// Concessions taken off the 5% room to raise above the approval.
    #[serde(default)]
    pub ic_cut_bps: i64,
    /// The diligence reports in, one per stream.
    #[serde(default)]
    pub reports: Vec<crate::diligence::Report>,
}

impl Deal {
    pub fn has(&self, stream: DdStream) -> bool {
        self.streams_done.contains(&stream)
    }
}

impl World {
    pub(crate) fn deal_index(&self, company: usize) -> Option<usize> {
        self.deals.iter().position(|deal| deal.company == company)
    }

    pub(crate) fn drop_deal_record(&mut self, company: usize) {
        self.deals.retain(|deal| deal.company != company);
    }

    pub(crate) fn sign_nda(&mut self, company: usize) -> Result<(), CommandError> {
        self.check_target(company)?;
        if self.deal_index(company).is_some() {
            return Err(CommandError::AlreadyDone);
        }
        if !self.process_visible(company) {
            return Err(CommandError::NotForSale);
        }
        if !self.on_buyer_list(company) {
            return Err(CommandError::NotInvited);
        }
        if self.first_round_closed(company) {
            return Err(CommandError::FirstRoundClosed);
        }
        if self.deals.len() >= self.career.rank.max_live_deals() {
            return Err(CommandError::TooManyDeals);
        }
        // Deals abroad are a principal's business.
        if self.companies[company].is_abroad() && self.career.rank < Rank::Principal {
            return Err(CommandError::CrossBorderLocked);
        }
        self.deals.push(Deal {
            company,
            opened: self.date,
            streams_done: Vec::new(),
            streams_running: Vec::new(),
            valuation: None,
            valuation_order: None,
            ic_meeting: None,
            ic_record: None,
            ic_conditions: Vec::new(),
            ic_cut_bps: 0,
            reports: Vec::new(),
            costs: 0,
            offer: None,
            ic: None,
            bid_submitted: false,
            approved_ev: 0,
            coinvest: false,
            coinvest_asked: false,
            indication: None,
            indication_terms: None,
        });
        self.companies[company].watched = true;
        Ok(())
    }

    pub(crate) fn diligence_cost(&self, company: usize) -> i64 {
        // Local advisers and travel cost half as much again.
        let abroad = if self.companies[company].is_abroad() {
            150
        } else {
            100
        };
        mul_bps(self.model_ev(company), 15).max(150) * abroad / 100
    }

    pub(crate) fn run_diligence(
        &mut self,
        company: usize,
        stream: DdStream,
    ) -> Result<(), CommandError> {
        let deal = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        if self.deals[deal].has(stream) || self.deals[deal].streams_running.contains(&stream) {
            return Err(CommandError::AlreadyDone);
        }
        if !self.stream_open(company, stream) {
            return Err(CommandError::SecondRoundOnly);
        }
        let cost = self.diligence_cost(company);
        self.spend_attention(1)?;
        if !self.fund.call(cost, self.months_elapsed) {
            self.attention_left += 1;
            return Err(CommandError::FundExhausted);
        }
        self.fund.deal_costs += cost;
        self.deals[deal].costs += cost;
        self.deals[deal].streams_running.push(stream);
        Ok(())
    }

    /// Month end: the reports ordered this month come in.
    pub(crate) fn finish_diligence(&mut self) {
        for deal in 0..self.deals.len() {
            let running = std::mem::take(&mut self.deals[deal].streams_running);
            let company = self.deals[deal].company;
            for stream in running {
                let found: Vec<IssueKind> = self.companies[company]
                    .issues
                    .iter()
                    .filter(|issue| issue.kind.stream() == stream && !issue.found)
                    .map(|issue| issue.kind)
                    .collect();
                let report = self.write_report(company, stream);
                self.deals[deal].reports.retain(|old| old.stream != stream);
                self.deals[deal].reports.push(report);
                self.deals[deal].streams_done.push(stream);
                self.post(
                    MessageKind::DiligenceReport { stream, found },
                    Some(company),
                );
            }
        }
    }

    pub(crate) fn set_offer(&mut self, company: usize, offer: Offer) -> Result<(), CommandError> {
        let deal = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        if self.deals[deal].bid_submitted {
            return Err(CommandError::AlreadyDone);
        }
        if self.deals[deal].valuation.is_none() {
            return Err(CommandError::NeedsValuation);
        }
        self.validate_offer(company, &offer)?;
        if self.deals[deal].offer.as_ref() != Some(&offer) {
            self.deals[deal].ic = None;
            self.deals[deal].ic_meeting = None;
            self.deals[deal].ic_conditions.clear();
        }
        self.deals[deal].offer = Some(offer);
        Ok(())
    }

    pub(crate) fn validate_offer(&self, company: usize, offer: &Offer) -> Result<(), CommandError> {
        if offer.ev <= 0 || offer.senior_millis < 0 || offer.mezz_millis < 0 {
            return Err(CommandError::InvalidOffer);
        }
        if offer.primary < 0 || offer.primary > mul_bps(offer.ev, MAX_PRIMARY_BPS) {
            return Err(CommandError::InvalidOffer);
        }
        if offer.kind == DealKind::Minority {
            // No new debt and no plan: the owner keeps the company and runs it.
            if offer.senior_millis != 0
                || offer.mezz_millis != 0
                || offer.rollover_bps != 0
                || !offer.plan.is_empty()
                || !(MIN_STAKE_BPS..=MAX_STAKE_BPS).contains(&offer.stake_bps)
            {
                return Err(CommandError::InvalidOffer);
            }
            if !matches!(self.companies[company].owner, Owner::Founder { .. }) {
                return Err(CommandError::FounderOwnedOnly);
            }
            let financing = self.financing(company, offer);
            if financing.equity <= 0 || financing.ownership_bps >= 5_000 {
                return Err(CommandError::InvalidOffer);
            }
            return Ok(());
        }
        if offer.stake_bps != 0 || offer.preferred {
            return Err(CommandError::InvalidOffer);
        }
        if offer.senior_millis > self.max_senior_millis(offer.lender)
            || offer.mezz_millis > self.economy.max_mezz_millis()
        {
            return Err(CommandError::LendersRefuse);
        }
        let founder = matches!(self.companies[company].owner, Owner::Founder { .. });
        if offer.rollover_bps < 0 || offer.rollover_bps > if founder { MAX_ROLLOVER_BPS } else { 0 }
        {
            return Err(CommandError::InvalidOffer);
        }
        let mut plan = offer.plan.clone();
        plan.sort_by_key(|kind| *kind as u8);
        plan.dedup();
        if plan.len() != offer.plan.len() || plan.len() > 3 {
            return Err(CommandError::InvalidOffer);
        }
        let financing = self.financing(company, offer);
        if financing.equity <= 0 {
            return Err(CommandError::InvalidOffer);
        }
        Ok(())
    }

    /// Sources and uses for an offer at today's trailing EBITDA and credit market.
    /// The most senior debt a lender of this kind gives today.
    pub fn max_senior_millis(&self, lender: Lender) -> i64 {
        self.economy.max_senior_millis()
            + match lender {
                Lender::Bank => 0,
                Lender::PrivateCredit => PRIVATE_CREDIT_EXTRA_MILLIS,
            }
    }

    /// The policy-rate part of the interest: today's rate, or today's rate swapped to fixed.
    fn base_rate_bps(&self, rate: RateKind) -> i64 {
        self.economy.policy_rate_bps
            + match rate {
                RateKind::Floating => 0,
                RateKind::Fixed => FIXED_PREMIUM_BPS,
            }
    }

    /// A minority stake: the owner's debt stays, the fund buys part of the shares
    /// and may put new money in.
    fn minority_financing(&self, company: usize, offer: &Offer) -> Financing {
        let target = &self.companies[company];
        let ebitda = target.ttm_ebitda().max(0);
        let net_debt = target.net_debt();
        let equity_value = (offer.ev - net_debt).max(0);
        let bought = mul_bps(equity_value, offer.stake_bps);
        let primary = offer.primary.max(0);
        let fees = mul_bps(bought + primary, FEE_BPS);
        let equity = bought + primary + fees;
        let after = (equity_value + primary).max(1);
        let ownership_bps = ratio_bps(bought + primary, after);
        let spread_bps = target.debt_spread_bps;
        let rate_bps = target.interest_rate_bps(&self.economy);
        let annual_interest = mul_bps(target.books.debt, rate_bps);
        Financing {
            ebitda,
            senior: 0,
            mezz: 0,
            debt: 0,
            fees,
            rollover: equity_value - bought,
            equity,
            ownership_bps,
            spread_bps,
            annual_interest,
            leverage_millis: if ebitda > 0 { ratio_millis(net_debt.max(0), ebitda) } else { 0 },
            cover_millis: if annual_interest > 0 {
                ratio_millis(ebitda, annual_interest)
            } else {
                99_000
            },
            price_to_model_bps: ratio_bps(offer.ev, self.model_ev(company)),
            multiple_millis: ratio_millis(offer.ev, ebitda),
            primary,
            convertible: 0,
            seller_bps: 10_000 - ownership_bps,
            converted_bps: 0,
            rate_bps,
        }
    }

    pub fn financing(&self, company: usize, offer: &Offer) -> Financing {
        if offer.kind == DealKind::Minority {
            return self.minority_financing(company, offer);
        }
        let target = &self.companies[company];
        let ebitda = target.ttm_ebitda().max(0);
        let senior = mul_millis(ebitda, offer.senior_millis);
        let mezz = mul_millis(ebitda, offer.mezz_millis);
        let debt = senior + mezz;
        let fees = mul_bps(offer.ev, FEE_BPS);
        let total_equity = offer.ev + fees - debt;
        let rollover = mul_bps(total_equity.max(0), offer.rollover_bps);
        // The fund pays for the old shares it buys and for any new ones.
        let primary = offer.primary.max(0);
        let equity = total_equity - rollover + primary;
        let convertible = if offer.mezz_kind == MezzKind::Convertible { mezz } else { 0 };
        // Fully diluted: the seller's rolled shares and the bonds as converted.
        let diluted = (equity + rollover + convertible).max(1);
        let ownership_bps = ratio_bps(equity.max(0), diluted);
        let seller_bps = ratio_bps(rollover, diluted);
        let converted_bps = 10_000 - ownership_bps - seller_bps;
        let senior_spread = self.economy.credit_spread_bps;
        let premium = match offer.mezz_kind {
            MezzKind::Notes => NOTES_PREMIUM_BPS,
            MezzKind::Convertible => CONVERTIBLE_PREMIUM_BPS,
        };
        let lender_premium = match offer.lender {
            Lender::Bank => 0,
            Lender::PrivateCredit => PRIVATE_CREDIT_PREMIUM_BPS,
        };
        let spread_bps = if debt > 0 {
            div_round(
                senior * (senior_spread + lender_premium) + mezz * (senior_spread + premium),
                debt,
            )
        } else {
            senior_spread
        };
        let rate_bps = self.base_rate_bps(offer.rate) + spread_bps;
        let annual_interest = mul_bps(debt, rate_bps);
        Financing {
            ebitda,
            senior,
            mezz,
            debt,
            fees,
            rollover,
            equity,
            ownership_bps,
            spread_bps,
            annual_interest,
            leverage_millis: offer.senior_millis + offer.mezz_millis,
            cover_millis: if annual_interest > 0 {
                ratio_millis(ebitda, annual_interest)
            } else {
                99_000
            },
            price_to_model_bps: ratio_bps(offer.ev, self.model_ev(company)),
            multiple_millis: ratio_millis(offer.ev, ebitda),
            primary,
            convertible,
            seller_bps,
            converted_bps: converted_bps.max(0),
            rate_bps,
        }
    }

    /// A five-year base case: the company's own growth plus the plan, all
    /// free cash to debt, and an exit at today's model multiple rather than
    /// the multiple paid.
    pub fn project_returns(&self, company: usize, offer: &Offer) -> Returns {
        let target = &self.companies[company];
        let industry = &self.industries[target.sector];
        let financing = self.financing(company, offer);
        let mut growth_bps = target.growth_bps;
        let mut margin_bps = target.gross_margin_bps;
        let mut fixed = target.sga_fixed;
        for kind in &offer.plan {
            match kind {
                InitiativeKind::PricingReview => margin_bps += 180,
                InitiativeKind::Procurement => margin_bps += 110,
                InitiativeKind::LeanProgram => fixed = mul_bps(fixed, 9_150),
                InitiativeKind::HeadcountReduction => fixed = mul_bps(fixed, 8_800),
                InitiativeKind::SalesExpansion => {
                    growth_bps += 18;
                    fixed = mul_bps(fixed, 10_400);
                }
                _ => {}
            }
        }
        let rate_bps = financing.rate_bps;
        let mut revenue = target.revenue;
        // New shares arrive as cash, which pays down debt from the first month.
        let mut debt = if offer.kind == DealKind::Minority {
            // The owner's own debt stays in place.
            (target.net_debt() - financing.primary).max(0)
        } else {
            (financing.debt - financing.primary).max(0)
        };
        let mut trailing: Vec<i64> = Vec::new();
        for _ in 0..PROJECTION_MONTHS {
            revenue = mul_bps(revenue, 10_000 + growth_bps);
            fixed = mul_bps(fixed, 10_020);
            let ebitda =
                mul_bps(revenue, margin_bps) - fixed - mul_bps(revenue, target.sga_variable_bps);
            let interest = div_round(debt * rate_bps, 120_000);
            let capex = mul_bps(revenue, industry.capex_ratio_bps);
            let tax = mul_bps((ebitda - capex - interest).max(0), industry.tax_rate_bps);
            let working_capital = mul_bps(revenue, growth_bps.max(0)) * 2;
            let free = ebitda - interest - capex - tax - working_capital;
            debt = (debt - free.max(0)).max(0);
            trailing.push(ebitda);
        }
        let exit_ebitda: i64 = trailing.iter().rev().take(12).sum();
        let model_multiple = target.multiple_millis(industry, &self.economy);
        let exit_ev = mul_millis(exit_ebitda, model_multiple);
        // Bonds that convert are not repaid; their holders share the equity instead.
        let exit_equity = (exit_ev - debt + financing.convertible).max(0);
        let mut proceeds = mul_bps(exit_equity, financing.ownership_bps);
        if offer.preferred {
            // Preferred shares take their money back first.
            proceeds = proceeds.max((financing.equity - financing.fees).min(exit_equity));
        }
        let equity = financing.equity.max(1);
        let entry_ebitda = financing.ebitda.max(1);
        let paid_multiple = financing.multiple_millis;
        let from_ebitda = mul_bps(
            mul_millis(exit_ebitda - entry_ebitda, paid_multiple),
            financing.ownership_bps,
        );
        let from_multiple = mul_bps(
            mul_millis(exit_ebitda, model_multiple - paid_multiple),
            financing.ownership_bps,
        );
        let from_debt = proceeds - equity - from_ebitda - from_multiple;
        Returns {
            exit_ebitda,
            exit_ev,
            exit_net_debt: debt,
            proceeds,
            moic_millis: ratio_millis(proceeds, equity),
            irr_bps: irr_bps(&[(0, -equity), (PROJECTION_MONTHS as u32, proceeds)])
                .unwrap_or(-9_999),
            from_ebitda,
            from_multiple,
            from_debt,
        }
    }

    /// How each partner reads the offer. Each seat has its own reasons.
    pub fn committee_votes(&self, company: usize, deal: &Deal, offer: &Offer) -> Vec<Vote> {
        let target = &self.companies[company];
        let industry = &self.industries[target.sector];
        let financing = self.financing(company, offer);
        let returns = self.project_returns(company, offer);
        let layoffs = offer.plan.contains(&InitiativeKind::HeadcountReduction)
            && target.union_strength_bps >= 5_000;
        let found = |kind: IssueKind| {
            target
                .issues
                .iter()
                .any(|issue| issue.kind == kind && issue.found)
        };
        let mut votes: Vec<Vote> = (0..PARTNERS)
            .map(|partner| Vote {
                partner,
                stance: Stance::For,
                concerns: Vec::new(),
            })
            .collect();
        let mut raise = |partner: usize, stance: Stance, concern: Concern| {
            let vote = &mut votes[partner];
            vote.concerns.push(concern);
            if stance == Stance::Against || vote.stance == Stance::For {
                vote.stance = stance;
            }
        };

        // Chair: downside, cash, covenants.
        if financing.leverage_millis > 5_500 {
            raise(CHAIR, Stance::Against, Concern::Leverage);
        }
        if financing.price_to_model_bps > 11_500 {
            raise(CHAIR, Stance::Against, Concern::Price);
        }
        if financing.cover_millis < 1_600 {
            raise(CHAIR, Stance::Against, Concern::InterestCover);
        }
        if !deal.has(DdStream::Financial) {
            raise(CHAIR, Stance::Hold, Concern::NoFinancialDd);
        }
        // Industrials: the plant and the working capital.
        if !deal.has(DdStream::Operational) {
            raise(1, Stance::Against, Concern::NoOperationalDd);
        }
        if industry.dio_days + target.dio_adjust_days > 55 && !deal.has(DdStream::Financial) {
            raise(1, Stance::Hold, Concern::InventoryDays);
        }
        // Growth: the quality of the return.
        if returns.irr_bps < 1_500 {
            raise(2, Stance::Against, Concern::ThinReturns);
        }
        if financing.price_to_model_bps > 10_800 && target.growth_bps <= industry.monthly_growth_bps
        {
            raise(2, Stance::Against, Concern::MultipleReliance);
        }
        if !deal.has(DdStream::Commercial) {
            raise(2, Stance::Hold, Concern::NoCommercialDd);
        }
        // Special situations: what happens when EBITDA falls by a fifth.
        if ratio_millis(financing.debt, (financing.ebitda * 8 / 10).max(1)) > 6_500 {
            raise(3, Stance::Against, Concern::Downside);
        }
        if !deal.has(DdStream::Legal) {
            raise(3, Stance::Hold, Concern::NoLegalDd);
        }
        if found(IssueKind::EnvironmentalLiability) && financing.price_to_model_bps > 10_000 {
            raise(3, Stance::Against, Concern::OpenIssue);
        }
        // Operating partner: a plan, and no hidden restructuring. A minority stake has
        // no plan to make; what it needs is protection, since the fund cannot steer.
        let minority = offer.kind == DealKind::Minority;
        if offer.plan.is_empty() && !minority {
            raise(OPERATING, Stance::Against, Concern::NoPlan);
        }
        if minority && !offer.preferred {
            raise(CHAIR, Stance::Hold, Concern::NoProtection);
        }
        if !deal.has(DdStream::Operational) {
            raise(OPERATING, Stance::Against, Concern::NoOperationalDd);
        }
        if layoffs {
            raise(OPERATING, Stance::Hold, Concern::LayoffsInUnionShop);
        }
        // Investor relations: what the investors and the press will say.
        if financing.equity > self.fund.concentration_limit() {
            raise(
                INVESTOR_RELATIONS,
                Stance::Against,
                Concern::FundConcentration,
            );
        }
        if layoffs {
            raise(
                INVESTOR_RELATIONS,
                Stance::Against,
                Concern::LayoffsInUnionShop,
            );
        }
        if found(IssueKind::LaborDispute) || found(IssueKind::EnvironmentalLiability) {
            raise(INVESTOR_RELATIONS, Stance::Hold, Concern::OpenIssue);
        }
        votes
    }

    pub fn committee_outcome(&self, votes: &[Vote]) -> IcOutcome {
        if self.career.rank == Rank::Founder {
            return IcOutcome::Approved;
        }
        let own_vote = usize::from(self.career.rank == Rank::Partner);
        let in_favor = votes
            .iter()
            .filter(|vote| vote.stance == Stance::For)
            .count()
            + own_vote;
        let against = |partner: usize| votes[partner].stance == Stance::Against;
        if against(CHAIR) {
            return IcOutcome::Held;
        }
        if in_favor >= 4 && !(against(OPERATING) && against(INVESTOR_RELATIONS)) {
            return IcOutcome::Approved;
        }
        if in_favor <= 2 {
            IcOutcome::Rejected
        } else {
            IcOutcome::Held
        }
    }

    /// Books the committee for next month. The vote comes at the meeting.
    pub(crate) fn submit_ic(&mut self, company: usize) -> Result<(), CommandError> {
        let index = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        let offer = self.deals[index]
            .offer
            .clone()
            .ok_or(CommandError::NoOffer)?;
        if self.deals[index].ic.is_some() || self.deals[index].ic_meeting.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        self.validate_offer(company, &offer)?;
        self.spend_attention(1)?;
        let mut votes = self.committee_votes(company, &self.deals[index], &offer);
        self.weigh_by_trust(&mut votes);
        let questions = self.ic_questions(&votes);
        self.deals[index].ic_meeting = Some(crate::ic::Meeting {
            date: self.date.next(),
            open: false,
            questions,
            cut_bps: 0,
            conditions: Vec::new(),
        });
        Ok(())
    }

    /// A large check: an investor asks to come in alongside.
    pub(crate) fn offer_coinvest(&mut self, company: usize, offer: &Offer, outcome: IcOutcome) {
        let Some(index) = self.deal_index(company) else {
            return;
        };
        let equity = self.financing(company, offer).equity;
        if outcome == IcOutcome::Approved
            && !self.deals[index].coinvest_asked
            && equity > self.fund.committed / 10
        {
            self.deals[index].coinvest_asked = true;
            self.post_decision(
                MessageKind::Event {
                    event: crate::story::EventKind::CoInvestRequest,
                    amount: equity / 5,
                },
                Some(company),
                vec![Choice::First, Choice::Second],
                2,
            );
        }
    }

    /// What the terms themselves say about closing: how much of the price is the buyer's
    /// own money, whether the debt is committed, whether the founder keeps a stake.
    pub fn terms_certainty_bps(&self, company: usize, offer: &Offer) -> i64 {
        if offer.kind == DealKind::Minority {
            return 0;
        }
        let financing = self.financing(company, offer);
        let cushion = ratio_bps(financing.equity.max(0), offer.ev.max(1));
        let equity = if cushion >= 4_000 {
            150
        } else if cushion < 2_500 {
            -150
        } else {
            0
        };
        let lender = match offer.lender {
            Lender::Bank => 0,
            Lender::PrivateCredit => 150,
        };
        let founder = matches!(self.companies[company].owner, Owner::Founder { .. });
        let alongside = if founder && offer.rollover_bps > 0 { 100 } else { 0 };
        equity + lender + alongside
    }

    /// What the seller adds to the player's price for being a sure closer.
    pub(crate) fn certainty_bps(&self, company: usize) -> i64 {
        let Some(index) = self.deal_index(company) else {
            return 0;
        };
        let streams = DD_STREAMS
            .iter()
            .filter(|stream| self.deals[index].has(**stream))
            .count() as i64;
        // An owner who cares who buys favors a buyer they know with no layoffs planned.
        let target = &self.companies[company];
        let layoffs = self.deals[index]
            .offer
            .as_ref()
            .is_some_and(|offer| offer.plan.contains(&InitiativeKind::HeadcountReduction));
        let sentiment = match target.stance {
            crate::company::Stance::Sentimental if target.relationship >= 50 && !layoffs => 300,
            crate::company::Stance::Sentimental => -200,
            _ => 0,
        };
        let terms = self.deals[index]
            .offer
            .as_ref()
            .map_or(0, |offer| self.terms_certainty_bps(company, offer));
        streams * 50 + target.relationship * 2 + sentiment + terms
    }

    pub(crate) fn submit_bid(&mut self, company: usize) -> Result<(), CommandError> {
        let index = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        let offer = self.deals[index]
            .offer
            .clone()
            .ok_or(CommandError::NoOffer)?;
        let approved = self.deals[index]
            .ic
            .as_ref()
            .is_some_and(|ic| ic.outcome == IcOutcome::Approved);
        if !approved {
            return Err(CommandError::NeedsCommittee);
        }
        if !self.fund.investing(self.date) {
            return Err(CommandError::InvestmentPeriodOver);
        }
        // The committee's conditions: the promised reports must be in.
        if self.deals[index]
            .ic_conditions
            .iter()
            .any(|stream| !self.deals[index].has(*stream))
        {
            return Err(CommandError::ConditionOpen);
        }
        let financing = self.financing(company, &offer);
        if financing.equity > self.fund.uncalled() {
            return Err(CommandError::FundExhausted);
        }
        let stage = self.companies[company]
            .process
            .as_ref()
            .map(|process| process.stage);
        match stage {
            Some(Stage::Bidding) => {
                let certainty_bps = self.certainty_bps(company);
                let process = self.companies[company]
                    .process
                    .as_mut()
                    .expect("process exists");
                process.player_bid = Some(PlayerBid {
                    ev: offer.ev,
                    certainty_bps,
                });
                self.deals[index].bid_submitted = true;
                Ok(())
            }
            Some(Stage::Exclusive) => {
                // One buyer, no auction: the seller takes a fair price today. An owner
                // who agreed a minority price holds the fund to it.
                let floor = match (offer.kind, self.deals[index].indication) {
                    (DealKind::Minority, Some(agreed)) => mul_bps(agreed, 9_800),
                    _ => mul_bps(self.reserve_ev(company), 10_300),
                };
                if offer.ev < floor {
                    return Err(CommandError::BidTooLow);
                }
                self.close_deal(company, offer.ev);
                Ok(())
            }
            _ => Err(CommandError::NotBiddingYet),
        }
    }

    /// The most the player may bid without returning to the committee.
    pub fn bid_ceiling(&self, company: usize) -> i64 {
        self.deal_index(company)
            .map(|index| mul_bps(self.deals[index].approved_ev, 10_500 - self.deals[index].ic_cut_bps))
            .unwrap_or(0)
    }

    /// Raises a bid already in, within the committee's approval.
    pub(crate) fn raise_bid(&mut self, company: usize, ev: i64) -> Result<(), CommandError> {
        let index = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        let current = self.companies[company]
            .process
            .as_ref()
            .and_then(|process| process.player_bid.as_ref())
            .map(|bid| bid.ev)
            .ok_or(CommandError::NoBid)?;
        if ev <= current {
            return Err(CommandError::BidTooLow);
        }
        if ev > self.bid_ceiling(company) {
            return Err(CommandError::AboveApproval);
        }
        let mut offer = self.deals[index]
            .offer
            .clone()
            .ok_or(CommandError::NoOffer)?;
        offer.ev = ev;
        if self.financing(company, &offer).equity > self.fund.uncalled() {
            return Err(CommandError::FundExhausted);
        }
        self.deals[index].offer = Some(offer);
        let process = self.companies[company]
            .process
            .as_mut()
            .expect("a bid has a process");
        process.player_bid.as_mut().expect("bid exists").ev = ev;
        Ok(())
    }

    pub(crate) fn propose_exclusive(&mut self, company: usize) -> Result<(), CommandError> {
        self.check_target(company)?;
        let target = &self.companies[company];
        let preparing = target
            .process
            .as_ref()
            .is_some_and(|process| process.stage == Stage::Preparing);
        if !preparing {
            return Err(CommandError::NotForSale);
        }
        if target.relationship < crate::sourcing::PROPOSAL_AT {
            return Err(CommandError::NeedsRelationship);
        }
        if target.pending.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        self.spend_attention(1)?;
        // The owner answers at month end: before the bank gets going, or not at all.
        self.companies[company].pending = Some(crate::sourcing::Pending {
            kind: crate::sourcing::ProposalKind::Exclusive,
            months_left: 1,
            offer: None,
        });
        self.post(MessageKind::OwnerConsidering { months: 1 }, Some(company));
        Ok(())
    }

    pub(crate) fn meet_owner(&mut self, company: usize) -> Result<(), CommandError> {
        self.check_target(company)?;
        // A trip abroad takes two points.
        self.spend_attention(if self.companies[company].is_abroad() {
            2
        } else {
            1
        })?;
        let club = if self.career.perks.contains(&crate::fund::Perk::IndustryClub) {
            5
        } else {
            0
        };
        let gain = (12
            + club
            + self.career.reputation / 10
            + self.street_swing() / 2
            + self.rng.range(0, 6))
        .max(4);
        let target = &mut self.companies[company];
        target.relationship = (target.relationship + gain).min(100);
        target.watched = true;
        Ok(())
    }

    fn check_target(&self, company: usize) -> Result<(), CommandError> {
        let target = self
            .companies
            .get(company)
            .ok_or(CommandError::UnknownCompany)?;
        if !target.is_active() || target.is_player_owned() {
            return Err(CommandError::UnknownCompany);
        }
        Ok(())
    }

    pub(crate) fn drop_deal(&mut self, company: usize) -> Result<(), CommandError> {
        let index = self.deal_index(company).ok_or(CommandError::NoDeal)?;
        let was_approved = self.deals[index]
            .ic
            .as_ref()
            .is_some_and(|ic| ic.outcome == IcOutcome::Approved);
        if was_approved {
            self.career.adjust_reputation(-2);
            self.adjust_street(-3);
        }
        // Walking away from talks the owner gave alone is remembered.
        if self.companies[company]
            .process
            .as_ref()
            .is_some_and(|process| process.stage == Stage::Exclusive)
        {
            self.adjust_street(-6);
        }
        if let Some(process) = self.companies[company].process.as_mut() {
            process.player_bid = None;
            if process.stage == Stage::Exclusive {
                process.stage = Stage::Preparing;
                process.months_left = 1;
            }
        }
        self.deals.remove(index);
        Ok(())
    }

    /// The player won. Sizes the debt at closing-day EBITDA and credit, calls
    /// the equity, and restates the books.
    pub(crate) fn close_deal(&mut self, company: usize, ev: i64) {
        let Some(index) = self.deal_index(company) else {
            return;
        };
        // An owner who was paid what was agreed says so, and the bank remembers its fee.
        self.adjust_street(2);
        self.pay_adviser(company);
        let deal = self.deals[index].clone();
        let mut offer = deal.offer.clone().expect("a bid carries an offer");
        offer.ev = ev;
        offer.senior_millis = offer.senior_millis.min(self.max_senior_millis(offer.lender));
        offer.mezz_millis = offer.mezz_millis.min(self.economy.max_mezz_millis());
        let mut financing = self.financing(company, &offer);
        if deal.coinvest {
            // Co-investors buy a fifth of the fund's stake at the same price.
            financing.equity = financing.equity * 8 / 10;
            financing.ownership_bps = financing.ownership_bps * 8 / 10;
        }
        let process = self.companies[company].process.clone();
        // Foreign buyers need a regulator's consent, and some regulators say no.
        let refusal = match self.companies[company].country.as_str() {
            "US" => 0,
            "CN" => 2_000,
            _ => 400,
        };
        if self.rng.chance_bps(refusal) {
            self.end_process(company, 6, 12);
            self.deals.remove(index);
            self.post(MessageKind::RegulatorBlocked, Some(company));
            return;
        }
        if financing.equity <= 0 || !self.fund.call(financing.equity, self.months_elapsed) {
            self.end_process(company, 6, 12);
            self.deals.remove(index);
            self.career.adjust_reputation(-4);
            self.post(MessageKind::DealBroken, Some(company));
            return;
        }
        self.record_house_exit(company, ev);
        let industry = self.industries[self.companies[company].sector].clone();
        let multiple = self.companies[company].multiple_millis(&industry, &self.economy);
        let retiring = self.companies[company].ceo.founder
            && self.companies[company]
                .process
                .as_ref()
                .is_some_and(|process| process.reason == crate::market::SaleReason::Retirement);
        if retiring {
            // The founder leaves with the money. Whoever follows knows less.
            let target = &mut self.companies[company];
            target.replace_ceo(&mut self.rng);
            // A succession the plan already provides for costs nothing extra.
            if !offer.plan.contains(&InitiativeKind::ManagementChange) {
                target.management = (target.management - 2).max(1);
            }
        }
        let minority = offer.kind == DealKind::Minority;
        let prior_owner = self.companies[company].owner;
        let fixed_rate = (offer.rate == RateKind::Fixed && !minority)
            .then(|| self.base_rate_bps(RateKind::Fixed) + financing.spread_bps);
        let target = &mut self.companies[company];
        if minority {
            // The owner's balance sheet stays; only the new money arrives.
            target.inject_equity(financing.primary);
        } else {
            target.acquire(&industry, ev, financing.debt);
            // New shares: the cash stays in the company.
            target.inject_equity(financing.primary);
            target.debt_spread_bps = financing.spread_bps;
            target.fixed_rate_bps = fixed_rate;
        }
        target.owner = Owner::Player;
        target.process = None;
        target.cooldown = 0;
        target.budget = if minority {
            // The owner keeps running it the way they did: some growth, some dividends.
            crate::company::Budget {
                growth_bps: 100,
                efficiency_bps: 50,
                sweep_pct: 30,
                dividend_pct: 25,
            }
        } else {
            crate::company::Budget {
                growth_bps: 0,
                efficiency_bps: 0,
                sweep_pct: 50,
                dividend_pct: 0,
            }
        };
        target.holding = Some(Holding::new(
            self.date,
            self.months_elapsed,
            ev,
            financing.ebitda,
            multiple,
            if minority { target.net_debt() } else { financing.debt - target.books.cash },
            financing.equity + deal.costs,
            financing.ownership_bps,
            financing.leverage_millis
                + match offer.lender {
                    Lender::Bank => BANK_HEADROOM_MILLIS,
                    Lender::PrivateCredit => PRIVATE_CREDIT_HEADROOM_MILLIS,
                },
            offer.plan.clone(),
        ));
        {
            let founder_seller = matches!(
                process.as_ref().map(|p| p.reason),
                Some(crate::market::SaleReason::Retirement | crate::market::SaleReason::Succession)
            );
            let holding = self.companies[company]
                .holding
                .as_mut()
                .expect("just created");
            holding.convertible = financing.convertible;
            if minority {
                holding.minority = true;
                holding.prior_owner = Some(prior_owner);
                if offer.preferred {
                    holding.preferred = financing.equity - financing.fees;
                }
            }
            holding.votes = deal
                .ic
                .as_ref()
                .map(|ic| ic.votes.iter().map(|vote| vote.stance).collect())
                .unwrap_or_default();
            holding.earnout_open = founder_seller;
            holding.full_diligence = DD_STREAMS.iter().all(|stream| deal.has(*stream));
            holding.distressed_entry = process
                .as_ref()
                .is_some_and(|p| p.reason == crate::market::SaleReason::Distress);
        }
        self.deals.remove(index);
        self.career.deals_closed += 1;
        let rivals = process.as_ref().map(|p| p.rivals.len()).unwrap_or(0);
        let exclusive = process
            .as_ref()
            .is_some_and(|p| p.stage == Stage::Exclusive);
        self.after_close(company, ev, financing.equity, rivals, exclusive);
        if process
            .as_ref()
            .is_some_and(|p| p.reason == crate::market::SaleReason::StrategicReview)
        {
            self.unlock(crate::story::Achievement::TakePrivate);
        }
        self.career.adjust_reputation(2);
        self.post(
            MessageKind::DealClosed {
                ev,
                equity: financing.equity,
                debt: financing.debt,
            },
            Some(company),
        );
    }
}
