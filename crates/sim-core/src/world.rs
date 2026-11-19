//! The world: one state, commands in, messages out.
//!
//! `World::apply` is the only way the state changes. Given the same universe,
//! seed, and commands it produces the same state on every machine. The save
//! file is the whole state, the generator included, so a reloaded game
//! continues exactly where the original would have gone.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::company::{Budget, Company, DdStream, IssueKind};
use crate::content::{Industry, Universe, UNIVERSE_SCHEMA_VERSION};
use crate::deal::{Deal, IcOutcome, Offer};
use crate::economy::{Economy, EconomyNews, Phase};
use crate::fund::{Career, Fund, Rank};
use crate::market::{Bidder, SaleReason};
use crate::portfolio::{ExitRoute, InitiativeKind};
use crate::rng::Rng;

pub const SAVE_SCHEMA_VERSION: u32 = 3;
const FUND_COMMITTED: i64 = 750_000;
const MAX_MESSAGES: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Choice {
    Accept,
    Decline,
    Cure,
    Waiver,
    Ignore,
    Settle,
    HoldOut,
    ReportNow,
    ReportLater,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageKind {
    Welcome,
    RateChanged { from_bps: i64, to_bps: i64 },
    PhaseChanged { from: Phase, to: Phase },
    SaleEarlyNotice { reason: SaleReason },
    SaleStarted { reason: SaleReason },
    SaleWithdrawn,
    SaleFailed,
    RivalDeal { buyer: Bidder, ev: i64 },
    AuctionLost { winner: Bidder, ev: i64 },
    DiligenceReport { stream: DdStream, found: Vec<IssueKind> },
    CommitteeDecision { outcome: IcOutcome },
    DealClosed { ev: i64, equity: i64, debt: i64 },
    DealBroken,
    InitiativeDone { kind: InitiativeKind },
    IssueSurfaced { issue: IssueKind },
    Strike,
    CovenantBreach { leverage_millis: i64, max_leverage_millis: i64, cover_millis: i64, cure: i64 },
    LendersTookKeys,
    Refinanced { spread_bps: i64 },
    RecapPaid { amount: i64 },
    AddOnClosed { target: String, price: i64, from_fund: i64 },
    ExitOffer { route: ExitRoute, ev: i64, proceeds: i64 },
    ExitPulled { route: ExitRoute },
    ExitClosed { route: ExitRoute, buyer: Bidder, ev: i64, proceeds: i64, moic_millis: i64, irr_bps: Option<i64> },
    ProceedsReceived { amount: i64 },
    QuarterReport { nav: i64, tvpi_millis: i64 },
    InvestmentPeriodEnded,
    FundTermEnded { tvpi_millis: i64, carry: i64 },
    NextFund { committed: i64, own_house: bool },
    Promotion { rank: Rank },
    Fired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub options: Vec<Choice>,
    /// The month index at whose close the last option is taken by default.
    pub due_month: u32,
    pub chosen: Option<Choice>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Message {
    pub id: u64,
    pub date: GameDate,
    /// Market news rather than something addressed to the player.
    pub news: bool,
    pub company: Option<usize>,
    pub read: bool,
    #[serde(flatten)]
    pub kind: MessageKind,
    pub decision: Option<Decision>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    AdvanceMonth,
    Watch { company: usize, on: bool },
    MeetOwner { company: usize },
    SignNda { company: usize },
    RunDiligence { company: usize, stream: DdStream },
    SetOffer { company: usize, offer: Offer },
    SubmitIc { company: usize },
    SubmitBid { company: usize },
    ProposeExclusive { company: usize },
    DropDeal { company: usize },
    SetBudget { company: usize, budget: Budget },
    StartInitiative { company: usize, kind: InitiativeKind },
    AddOn { platform: usize, target: usize },
    DividendRecap { company: usize, amount: i64 },
    EquityCure { company: usize, amount: i64 },
    StartExit { company: usize, route: ExitRoute },
    Decide { message: u64, choice: Choice },
    MarkRead { message: u64 },
    MarkAllRead,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandError {
    GameOver,
    UnknownCompany,
    NoAttention,
    AlreadyDone,
    NotForSale,
    TooManyDeals,
    NoDeal,
    NoOffer,
    InvalidOffer,
    LendersRefuse,
    NeedsCommittee,
    InvestmentPeriodOver,
    FundExhausted,
    BidTooLow,
    NotBiddingYet,
    NeedsRelationship,
    NotHeld,
    InvalidBudget,
    CovenantBlocks,
    TooManyInitiatives,
    CompanyCashShort,
    InvalidAmount,
    TooEarly,
    DifferentSector,
    TargetTooLarge,
    TooSmallToList,
    WindowClosed,
    UnknownMessage,
    InvalidChoice,
}

#[derive(Debug)]
pub enum SaveError {
    Malformed(String),
    UnsupportedVersion(u32),
}

impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SaveError::Malformed(reason) => write!(f, "save is malformed: {reason}"),
            SaveError::UnsupportedVersion(version) => {
                write!(f, "schema version {version} is not supported")
            }
        }
    }
}

impl std::error::Error for SaveError {}

#[derive(Deserialize)]
struct SaveHeader {
    schema_version: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct World {
    pub schema_version: u32,
    pub seed: u64,
    /// The month that is open. `AdvanceMonth` closes it.
    pub date: GameDate,
    pub months_elapsed: u32,
    pub industries: Vec<Industry>,
    pub economy: Economy,
    pub companies: Vec<Company>,
    pub deals: Vec<Deal>,
    pub fund: Fund,
    pub fund_number: u32,
    pub own_house: bool,
    pub career: Career,
    pub attention_left: i64,
    pub messages: Vec<Message>,
    next_message_id: u64,
    pub(crate) rng: Rng,
}

impl World {
    /// Opens a game on the generator's universe.
    pub fn new(seed: u64, universe: &str) -> Result<World, SaveError> {
        let universe: Universe =
            serde_json::from_str(universe).map_err(|err| SaveError::Malformed(err.to_string()))?;
        if universe.schema_version != UNIVERSE_SCHEMA_VERSION {
            return Err(SaveError::UnsupportedVersion(universe.schema_version));
        }
        let mut rng = Rng::new(seed);
        let mut companies = Vec::with_capacity(universe.companies.len());
        for item in &universe.companies {
            let sector = universe
                .industries
                .iter()
                .position(|industry| industry.sector_id == item.sector_id)
                .ok_or_else(|| SaveError::Malformed(format!("unknown sector {}", item.sector_id)))?;
            companies.push(Company::from_seed(item, sector, &universe.industries[sector], &mut rng));
        }
        let career = Career::new();
        let economy = Economy::new(universe.industries.len(), &mut rng);
        let mut world = World {
            schema_version: SAVE_SCHEMA_VERSION,
            seed,
            date: universe.opens,
            months_elapsed: 0,
            economy,
            industries: universe.industries,
            companies,
            deals: Vec::new(),
            fund: Fund::new("Fund III", FUND_COMMITTED, universe.opens),
            fund_number: 3,
            own_house: false,
            attention_left: career.rank.attention(),
            career,
            messages: Vec::new(),
            next_message_id: 0,
            rng,
        };
        world.post(MessageKind::Welcome, None);
        Ok(world)
    }

    pub fn to_save(&self) -> String {
        serde_json::to_string(self).expect("world serializes")
    }

    pub fn from_save(save: &str) -> Result<World, SaveError> {
        let header: SaveHeader =
            serde_json::from_str(save).map_err(|err| SaveError::Malformed(err.to_string()))?;
        if header.schema_version != SAVE_SCHEMA_VERSION {
            return Err(SaveError::UnsupportedVersion(header.schema_version));
        }
        serde_json::from_str(save).map_err(|err| SaveError::Malformed(err.to_string()))
    }

    pub fn apply(&mut self, command: Command) -> Result<(), CommandError> {
        if self.career.fired {
            return Err(CommandError::GameOver);
        }
        match command {
            Command::AdvanceMonth => {
                self.advance_month();
                Ok(())
            }
            Command::Watch { company, on } => {
                let target = self.companies.get_mut(company).ok_or(CommandError::UnknownCompany)?;
                target.watched = on;
                Ok(())
            }
            Command::MeetOwner { company } => self.meet_owner(company),
            Command::SignNda { company } => self.sign_nda(company),
            Command::RunDiligence { company, stream } => self.run_diligence(company, stream),
            Command::SetOffer { company, offer } => self.set_offer(company, offer),
            Command::SubmitIc { company } => self.submit_ic(company),
            Command::SubmitBid { company } => self.submit_bid(company),
            Command::ProposeExclusive { company } => self.propose_exclusive(company),
            Command::DropDeal { company } => self.drop_deal(company),
            Command::SetBudget { company, budget } => self.set_budget(company, budget),
            Command::StartInitiative { company, kind } => self.start_initiative(company, kind),
            Command::AddOn { platform, target } => self.add_on(platform, target),
            Command::DividendRecap { company, amount } => self.dividend_recap(company, amount),
            Command::EquityCure { company, amount } => self.equity_cure(company, amount),
            Command::StartExit { company, route } => self.start_exit(company, route),
            Command::Decide { message, choice } => self.decide(message, choice),
            Command::MarkRead { message } => {
                let found = self.messages.iter_mut().find(|item| item.id == message);
                found.ok_or(CommandError::UnknownMessage)?.read = true;
                Ok(())
            }
            Command::MarkAllRead => {
                for message in &mut self.messages {
                    message.read = true;
                }
                Ok(())
            }
        }
    }

    pub(crate) fn spend_attention(&mut self, cost: i64) -> Result<(), CommandError> {
        if self.attention_left < cost {
            return Err(CommandError::NoAttention);
        }
        self.attention_left -= cost;
        Ok(())
    }

    pub fn model_ev(&self, company: usize) -> i64 {
        let target = &self.companies[company];
        target.model_ev(&self.industries[target.sector], &self.economy)
    }

    fn push_message(&mut self, kind: MessageKind, company: Option<usize>, news: bool, decision: Option<Decision>) {
        let id = self.next_message_id;
        self.next_message_id += 1;
        self.messages.push(Message {
            id,
            date: self.date,
            news,
            company,
            read: false,
            kind,
            decision,
        });
        if self.messages.len() > MAX_MESSAGES {
            let open = |message: &Message| message.decision.as_ref().is_some_and(|d| d.chosen.is_none());
            if let Some(oldest) = self.messages.iter().position(|message| !open(message)) {
                self.messages.remove(oldest);
            }
        }
    }

    pub(crate) fn post(&mut self, kind: MessageKind, company: Option<usize>) {
        self.push_message(kind, company, false, None);
    }

    pub(crate) fn post_news(&mut self, kind: MessageKind, company: Option<usize>) {
        self.push_message(kind, company, true, None);
    }

    pub(crate) fn post_decision(&mut self, kind: MessageKind, company: Option<usize>, options: Vec<Choice>, months: u32) {
        let decision = Decision {
            options,
            due_month: self.months_elapsed + months,
            chosen: None,
        };
        self.push_message(kind, company, false, Some(decision));
    }

    fn decide(&mut self, id: u64, choice: Choice) -> Result<(), CommandError> {
        let message = self.messages.iter_mut().find(|item| item.id == id).ok_or(CommandError::UnknownMessage)?;
        let decision = message.decision.as_mut().ok_or(CommandError::InvalidChoice)?;
        if decision.chosen.is_some() {
            return Err(CommandError::AlreadyDone);
        }
        if !decision.options.contains(&choice) {
            return Err(CommandError::InvalidChoice);
        }
        decision.chosen = Some(choice);
        message.read = true;
        let (kind, company) = (message.kind.clone(), message.company);
        self.resolve(kind, company, choice);
        Ok(())
    }

    fn resolve(&mut self, kind: MessageKind, company: Option<usize>, choice: Choice) {
        let Some(company) = company else {
            return;
        };
        match kind {
            MessageKind::Strike => self.decide_strike(company, choice),
            MessageKind::IssueSurfaced { .. } => self.decide_report(choice),
            MessageKind::CovenantBreach { cure, .. } => self.decide_breach(company, choice, cure),
            MessageKind::ExitOffer { .. } => self.decide_exit(company, choice),
            _ => {}
        }
    }

    /// Decisions left past their month take the last option.
    fn expire_decisions(&mut self) {
        let due: Vec<(u64, Choice)> = self
            .messages
            .iter()
            .filter_map(|message| {
                let decision = message.decision.as_ref()?;
                (decision.chosen.is_none() && decision.due_month <= self.months_elapsed)
                    .then(|| (message.id, *decision.options.last().expect("a decision has options")))
            })
            .collect();
        for (id, choice) in due {
            let _ = self.decide(id, choice);
        }
    }

    fn advance_month(&mut self) {
        let closing = self.date;
        let closes_quarter = closing.closes_a_quarter();

        for news in self.economy.step(&mut self.rng, &self.industries, closes_quarter) {
            match news {
                EconomyNews::RateChanged { from_bps, to_bps } => {
                    self.post_news(MessageKind::RateChanged { from_bps, to_bps }, None)
                }
                EconomyNews::PhaseChanged { from, to } => self.post_news(MessageKind::PhaseChanged { from, to }, None),
            }
        }

        for index in 0..self.companies.len() {
            if !self.companies[index].is_active() {
                continue;
            }
            let industry = &self.industries[self.companies[index].sector];
            let dividends = self.companies[index].step(industry, &self.economy, &mut self.rng);
            self.collect_dividends(index, dividends);
            if closing.month == 12 {
                self.companies[index].new_year();
            }
        }

        self.finish_diligence();
        self.portfolio_step(closes_quarter);
        self.refinance_maturities();
        self.market_step();
        if closes_quarter {
            self.close_quarter();
        }
        self.receive_pending();
        self.expire_decisions();

        self.date = closing.next();
        self.months_elapsed += 1;
        self.career_step();
        self.fund_clock();
        self.attention_left = self.career.rank.attention();
    }

    fn close_quarter(&mut self) {
        let fee = self.fund.quarterly_fee(self.date, self.invested_cost());
        if self.fund.call(fee, self.months_elapsed) {
            self.fund.fees_paid += fee;
        }
        let nav = self.nav();
        let tvpi_millis = self.fund.tvpi_millis(nav);
        if self.fund.called > 0 {
            self.post_news(MessageKind::QuarterReport { nav, tvpi_millis }, None);
        }
    }

    fn refinance_maturities(&mut self) {
        for index in 0..self.companies.len() {
            let due = self.companies[index]
                .holding
                .as_ref()
                .is_some_and(|holding| self.companies[index].is_player_owned() && holding.maturity <= self.date);
            if !due {
                continue;
            }
            let stretched = self.companies[index].leverage_millis() > self.economy.max_senior_millis();
            let spread_bps = self.economy.credit_spread_bps + if stretched { 250 } else { 0 };
            let date = self.date;
            let target = &mut self.companies[index];
            target.debt_spread_bps = spread_bps;
            if let Some(holding) = target.holding.as_mut() {
                holding.maturity = date.plus_months(60);
            }
            self.post(MessageKind::Refinanced { spread_bps }, Some(index));
        }
    }

    fn receive_pending(&mut self) {
        let month = self.months_elapsed;
        let due: Vec<i64> = self.fund.pending.iter().filter(|item| item.due_month <= month).map(|item| item.amount).collect();
        self.fund.pending.retain(|item| item.due_month > month);
        for amount in due {
            self.fund.distribute(amount, month);
            self.post(MessageKind::ProceedsReceived { amount }, None);
        }
    }

    fn career_step(&mut self) {
        self.career.months_at_rank += 1;
        self.career.wealth += self.career.rank.salary() * 4 / 10 / 12;
        if self.career.reputation < 15 {
            self.career.fired = true;
            self.post(MessageKind::Fired, None);
            return;
        }
        // A deal professional with no deals is noticed.
        let idle = self.career.deals_closed == 0 && self.deals.is_empty() && self.fund.investing(self.date);
        if idle && self.months_elapsed >= 24 && self.months_elapsed % 3 == 0 {
            self.career.adjust_reputation(-2);
        }
        let tvpi = self.fund.tvpi_millis(self.nav());
        if let Some(rank) = self.career.promotion(tvpi) {
            self.career.rank = rank;
            self.career.months_at_rank = 0;
            self.post(MessageKind::Promotion { rank }, None);
        }
    }

    fn fund_clock(&mut self) {
        if self.date == self.fund.investment_period_ends {
            self.post(MessageKind::InvestmentPeriodEnded, None);
        }
        if self.date != self.fund.term_ends {
            return;
        }
        // The term is over: whatever is left is sold to a secondary buyer.
        for index in 0..self.companies.len() {
            if !self.companies[index].is_player_owned() {
                continue;
            }
            let ev = self.model_ev(index) * 9 / 10;
            if let Some(holding) = self.companies[index].holding.as_mut() {
                holding.exit = Some(crate::portfolio::ExitProcess {
                    route: ExitRoute::Secondary,
                    months_left: 0,
                    offer_ev: Some(ev),
                });
            }
            self.decide_exit(index, Choice::Accept);
        }
        let month = self.months_elapsed;
        let pending: i64 = self.fund.pending_total();
        self.fund.pending.clear();
        self.fund.distribute(pending, month);
        let tvpi_millis = self.fund.tvpi_millis(0);
        let carry = self.fund.carry(0, month);
        let share = crate::math::mul_bps(carry, self.career.rank.carry_share_bps());
        self.career.wealth += share;
        self.career.carry_paid += share;
        self.post(MessageKind::FundTermEnded { tvpi_millis, carry }, None);

        let strong = tvpi_millis >= 1_300;
        if !strong && !self.own_house && self.career.rank < Rank::Partner {
            self.career.fired = true;
            self.post(MessageKind::Fired, None);
            return;
        }
        // A partner with a record leaves to raise under their own name.
        let own_house = self.own_house || (self.career.rank >= Rank::Partner && self.career.reputation >= 70);
        let scale = tvpi_millis.clamp(700, 1_900);
        let committed = self.fund.committed * scale / 1_300 / 10_000 * 10_000;
        if own_house && !self.own_house {
            self.own_house = true;
            self.fund_number = 0;
            self.career.rank = Rank::Founder;
            self.career.months_at_rank = 0;
        }
        self.fund_number += 1;
        let name = format!("Fund {}", roman(self.fund_number));
        self.fund = Fund::new(&name, committed.max(200_000), self.date);
        self.post(MessageKind::NextFund { committed: self.fund.committed, own_house }, None);
    }
}

fn roman(number: u32) -> String {
    let table = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")];
    let mut left = number;
    let mut text = String::new();
    for (value, glyph) in table {
        while left >= value {
            text.push_str(glyph);
            left -= value;
        }
    }
    text
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::company::DD_STREAMS;
    use crate::deal::Offer;
    use crate::market::Stage;

    pub fn universe() -> String {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../public/content/universe.json");
        std::fs::read_to_string(path).expect("run tools/datagen/generate.py first")
    }

    pub fn world(seed: u64) -> World {
        World::new(seed, &universe()).expect("the universe opens")
    }

    fn run(world: &mut World, months: u32) {
        for _ in 0..months {
            world.apply(Command::AdvanceMonth).unwrap();
        }
    }

    /// A plain, careful player: full diligence, moderate debt, a fair price.
    fn play_month(world: &mut World) {
        for index in 0..world.companies.len() {
            if world.deals.len() >= world.career.rank.max_live_deals() {
                break;
            }
            let ebitda = world.companies[index].ttm_ebitda();
            if world.process_visible(index) && world.deal_index(index).is_none() && (4_000..40_000).contains(&ebitda) {
                let _ = world.apply(Command::SignNda { company: index });
            }
        }
        for company in world.deals.iter().map(|deal| deal.company).collect::<Vec<_>>() {
            for stream in DD_STREAMS {
                let _ = world.apply(Command::RunDiligence { company, stream });
            }
            let deal = &world.deals[world.deal_index(company).unwrap()];
            let ready = DD_STREAMS.iter().all(|stream| deal.has(*stream));
            if ready && deal.offer.is_none() {
                let offer = Offer {
                    ev: world.model_ev(company) * 102 / 100,
                    senior_millis: world.economy.max_senior_millis().min(3_800),
                    mezz_millis: 0,
                    rollover_bps: 0,
                    plan: vec![InitiativeKind::Procurement, InitiativeKind::LeanProgram],
                };
                let _ = world.apply(Command::SetOffer { company, offer });
                let _ = world.apply(Command::SubmitIc { company });
            }
            let bidding = world.companies[company].process.as_ref().is_some_and(|p| p.stage == Stage::Bidding);
            if bidding {
                let _ = world.apply(Command::SubmitBid { company });
            }
        }
        for company in 0..world.companies.len() {
            if !world.companies[company].is_player_owned() {
                continue;
            }
            for kind in [InitiativeKind::Procurement, InitiativeKind::LeanProgram, InitiativeKind::PricingReview] {
                let _ = world.apply(Command::StartInitiative { company, kind });
            }
            let held = world.months_elapsed - world.companies[company].holding.as_ref().unwrap().acquired_month;
            if held >= 54 {
                let _ = world.apply(Command::StartExit { company, route: ExitRoute::Secondary });
            }
        }
        let open: Vec<(u64, Choice)> = world
            .messages
            .iter()
            .filter_map(|message| {
                let decision = message.decision.as_ref()?;
                decision.chosen.is_none().then(|| (message.id, decision.options[0]))
            })
            .collect();
        for (message, choice) in open {
            let _ = world.apply(Command::Decide { message, choice });
        }
        // A fired player's world stops; the caller checks `career.fired`.
        let _ = world.apply(Command::AdvanceMonth);
    }

    #[test]
    fn starts_on_day_one_with_an_empty_fund() {
        let world = world(1);
        assert_eq!(world.date, GameDate::new(2024, 1));
        assert_eq!(world.fund.called, 0);
        assert_eq!(world.fund.uncalled(), 750_000);
        assert_eq!(world.companies.len(), 250);
        assert!(world.companies.iter().all(|company| !company.is_player_owned()));
        assert!(world.companies.iter().all(|company| company.books.balances()));
        assert_eq!(world.career.rank, Rank::VicePresident);
    }

    #[test]
    fn a_month_closes_and_the_next_opens() {
        let mut world = world(1);
        world.apply(Command::AdvanceMonth).unwrap();
        assert_eq!(world.date, GameDate::new(2024, 2));
        assert_eq!(world.months_elapsed, 1);
        assert_eq!(world.attention_left, Rank::VicePresident.attention());
    }

    #[test]
    fn the_same_seed_replays_the_same_game() {
        let mut a = world(42);
        let mut b = world(42);
        for _ in 0..120 {
            play_month(&mut a);
            play_month(&mut b);
        }
        assert_eq!(a.to_save(), b.to_save());
        let mut c = world(43);
        run(&mut c, 120);
        assert_ne!(a.to_save(), c.to_save());
    }

    #[test]
    fn a_reloaded_game_continues_as_the_original_would() {
        let mut original = world(9);
        for _ in 0..40 {
            play_month(&mut original);
        }
        let mut reloaded = World::from_save(&original.to_save()).unwrap();
        assert_eq!(reloaded, original);
        for _ in 0..60 {
            play_month(&mut original);
            play_month(&mut reloaded);
        }
        assert_eq!(reloaded.to_save(), original.to_save());
    }

    #[test]
    fn rejects_a_save_from_another_schema() {
        let save = world(1).to_save().replacen("\"schema_version\":3", "\"schema_version\":99", 1);
        assert!(matches!(World::from_save(&save), Err(SaveError::UnsupportedVersion(99))));
        assert!(matches!(World::from_save("not json"), Err(SaveError::Malformed(_))));
    }

    #[test]
    fn every_company_balances_every_month_for_twenty_years() {
        for seed in [3, 4] {
            let mut world = world(seed);
            for month in 0..240 {
                if world.career.fired {
                    break;
                }
                play_month(&mut world);
                for company in world.companies.iter().filter(|company| company.is_active()) {
                    assert!(company.books.balances(), "seed {seed} month {month} {}", company.id);
                    assert!(company.books.cash >= 0, "seed {seed} month {month} {}", company.id);
                    assert!(company.books.debt >= 0, "seed {seed} month {month} {}", company.id);
                }
                assert!(world.fund.called <= world.fund.committed);
                assert!(world.attention_left >= 0);
            }
        }
    }

    #[test]
    fn five_to_ten_percent_of_the_universe_is_for_sale() {
        let mut shares = Vec::new();
        for seed in 0..4 {
            let mut world = world(seed);
            run(&mut world, 24);
            // An idle player is let go at the end of the fund; the market runs until then.
            for _ in 0..90 {
                run(&mut world, 1);
                let active = world.companies.iter().filter(|company| company.is_active()).count();
                shares.push(world.live_processes() * 10_000 / active);
            }
        }
        let mean = shares.iter().sum::<usize>() / shares.len();
        assert!((500..=1_000).contains(&mean), "mean share {mean} bps");
    }

    #[test]
    fn a_careful_player_closes_deals_and_returns_capital() {
        let mut closed = 0;
        let mut exits = 0;
        for seed in 0..4 {
            let mut world = world(seed);
            for _ in 0..180 {
                play_month(&mut world);
                if world.career.fired {
                    break;
                }
            }
            closed += world.career.deals_closed;
            exits += world.career.exits;
        }
        assert!(closed >= 4, "closed {closed}");
        assert!(exits >= 2, "exits {exits}");
    }

    #[test]
    fn figures_are_ranges_until_an_nda() {
        let mut world = world(5);
        run(&mut world, 12);
        let index = (0..world.companies.len()).find(|index| world.process_visible(*index)).expect("something is for sale");
        let before = world.company_view(index);
        assert!(before["revenue"][0].as_i64() < before["revenue"][1].as_i64());
        assert!(before.get("financials").is_none());
        world.apply(Command::SignNda { company: index }).unwrap();
        let after = world.company_view(index);
        assert_eq!(after["revenue"][0], after["revenue"][1]);
        assert!(after.get("financials").is_some());
        assert_eq!(after["revenue"][0].as_i64().unwrap(), world.companies[index].ttm_revenue());
    }

    #[test]
    fn attention_runs_out_and_comes_back() {
        let mut world = world(6);
        for company in 0..4 {
            world.apply(Command::MeetOwner { company }).unwrap();
        }
        assert_eq!(world.apply(Command::MeetOwner { company: 5 }), Err(CommandError::NoAttention));
        world.apply(Command::AdvanceMonth).unwrap();
        assert!(world.apply(Command::MeetOwner { company: 5 }).is_ok());
    }

    #[test]
    fn a_bid_needs_the_committee() {
        let mut world = world(7);
        run(&mut world, 12);
        let index = (0..world.companies.len()).find(|index| world.process_visible(*index)).unwrap();
        world.apply(Command::SignNda { company: index }).unwrap();
        assert_eq!(world.apply(Command::SubmitBid { company: index }), Err(CommandError::NoOffer));
        let offer = Offer {
            ev: world.model_ev(index),
            senior_millis: 3_000,
            mezz_millis: 0,
            rollover_bps: 0,
            plan: Vec::new(),
        };
        world.apply(Command::SetOffer { company: index, offer }).unwrap();
        assert_eq!(world.apply(Command::SubmitBid { company: index }), Err(CommandError::NeedsCommittee));
        world.apply(Command::SubmitIc { company: index }).unwrap();
        // No diligence and no plan: the committee does not approve.
        let deal = &world.deals[world.deal_index(index).unwrap()];
        assert_ne!(deal.ic.as_ref().unwrap().outcome, IcOutcome::Approved);
    }

    #[test]
    fn commands_and_messages_cross_as_tagged_json() {
        let command: Command = serde_json::from_str(r#"{"type":"run_diligence","company":3,"stream":"legal"}"#).unwrap();
        assert_eq!(command, Command::RunDiligence { company: 3, stream: DdStream::Legal });
        let world = world(1);
        let text = serde_json::to_string(&world.messages[0]).unwrap();
        assert!(text.contains(r#""type":"welcome""#), "{text}");
        assert_eq!(serde_json::to_string(&CommandError::NoAttention).unwrap(), r#""no_attention""#);
    }

    /// Prints how the careful player fares. `cargo test -p sim-core report -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn report() {
        for seed in 0..8 {
            let mut world = world(seed);
            let mut live = Vec::new();
            for _ in 0..119 {
                play_month(&mut world);
                live.push(world.live_processes());
                if world.career.fired {
                    break;
                }
            }
            let nav = world.nav();
            println!(
                "seed {seed}: {:?} rep {} closed {} exits {} called {} dist {} nav {} tvpi {} irr {:?} live avg {} phase {:?} rate {}",
                world.career.rank,
                world.career.reputation,
                world.career.deals_closed,
                world.career.exits,
                world.fund.called,
                world.fund.distributed,
                nav,
                world.fund.tvpi_millis(nav),
                world.fund.net_irr_bps(nav, world.months_elapsed),
                live.iter().sum::<usize>() / live.len().max(1),
                world.economy.phase,
                world.economy.policy_rate_bps,
            );
            for realized in &world.fund.realized {
                println!("   {} cost {} proceeds {} moic {} irr {:?} {:?}", realized.company, realized.cost, realized.proceeds, realized.moic_millis, realized.irr_bps, realized.route);
            }
        }
    }
}
