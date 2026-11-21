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
use crate::economy::{Economy, EconomyNews, Era, Phase};
use crate::fund::{Career, Fund, Perk, Rank, ASSOCIATE_COST, MAX_ASSOCIATES};
use crate::market::{Bidder, HouseRecord, SaleReason, RIVAL_HOUSES};
use crate::portfolio::{ExitRoute, InitiativeKind};
use crate::rng::Rng;
use crate::story::{
    opening_lps, Achievement, EventKind, Lp, Objective, Records, Unlocked, YearStats,
};

pub const SAVE_SCHEMA_VERSION: u32 = 4;
const FUND_COMMITTED: i64 = 750_000;
const MAX_MESSAGES: usize = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Relaxed,
    #[default]
    Standard,
    Hard,
}

impl Difficulty {
    /// Added to every rival bid.
    pub fn rival_bias_bps(self) -> i64 {
        match self {
            Difficulty::Relaxed => -300,
            Difficulty::Standard => 0,
            Difficulty::Hard => 250,
        }
    }
    pub fn attention_bonus(self) -> i64 {
        match self {
            Difficulty::Relaxed => 1,
            _ => 0,
        }
    }
    /// The fund multiple below which a junior is let go at the end of the term, in thousandths.
    pub fn survival_tvpi_millis(self) -> i64 {
        match self {
            Difficulty::Relaxed => 1_100,
            Difficulty::Standard => 1_300,
            Difficulty::Hard => 1_500,
        }
    }
    /// Multiplier on reputation losses, in percent.
    pub fn penalty_pct(self) -> i64 {
        match self {
            Difficulty::Relaxed => 75,
            Difficulty::Standard => 100,
            Difficulty::Hard => 130,
        }
    }
}

/// Chosen once, when a game opens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Options {
    #[serde(default)]
    pub difficulty: Difficulty,
    #[serde(default)]
    pub era: Era,
}

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
    /// The two options of an event. The catalog names them per event.
    First,
    Second,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageKind {
    Welcome,
    RateChanged {
        from_bps: i64,
        to_bps: i64,
    },
    PhaseChanged {
        from: Phase,
        to: Phase,
    },
    SaleEarlyNotice {
        reason: SaleReason,
    },
    OwnerOpened {
        reason: SaleReason,
    },
    OwnerDeclined,
    /// The bank's teaser for a sale the player is on the list for.
    TeaserReceived {
        adviser: u8,
        format: crate::advisers::Format,
    },
    Shortlisted {
        bidders: u32,
    },
    NotShortlisted,
    /// A bank that knows the player introduces an owner who would sell.
    BankPitch {
        adviser: u8,
    },
    /// A rival house has proposed to an owner the player knows.
    RivalApproach {
        house: u8,
    },
    LostToRival {
        house: u8,
        ev: i64,
    },
    RivalRebuffed {
        house: u8,
    },
    HouseFundraised {
        house: u8,
        size: i64,
    },
    HousePartnerLeft {
        house: u8,
    },
    HouseDistress {
        house: u8,
    },
    OwnerSucceeded {
        from: String,
        to: String,
    },
    CeoMoved {
        name: String,
        from: String,
    },
    SaleStarted {
        reason: SaleReason,
    },
    SaleWithdrawn,
    SaleFailed,
    RivalDeal {
        buyer: Bidder,
        ev: i64,
    },
    AuctionLost {
        winner: Bidder,
        ev: i64,
    },
    FinalRound {
        rank: usize,
        bidders: usize,
    },
    DiligenceReport {
        stream: DdStream,
        found: Vec<IssueKind>,
    },
    CommitteeDecision {
        outcome: IcOutcome,
    },
    ValuationReady {
        kind: crate::valuation::ValuationKind,
    },
    /// The committee is in the room for this deal.
    CommitteeConvened,
    /// The owner is thinking a proposal over.
    OwnerConsidering {
        months: u32,
    },
    /// The seller's bank on the player's bid, before the final round.
    BankFeedback {
        band: crate::market::FeedbackBand,
        /// The seller weighs certainty of closing, not only price.
        certainty: bool,
    },
    DealClosed {
        ev: i64,
        equity: i64,
        debt: i64,
    },
    DealBroken,
    RegulatorBlocked,
    InitiativeDone {
        kind: InitiativeKind,
    },
    IssueSurfaced {
        issue: IssueKind,
    },
    Strike,
    CovenantBreach {
        leverage_millis: i64,
        max_leverage_millis: i64,
        cover_millis: i64,
        cure: i64,
    },
    LendersTookKeys,
    Refinanced {
        spread_bps: i64,
    },
    RecapPaid {
        amount: i64,
    },
    AddOnClosed {
        target: String,
        price: i64,
        from_fund: i64,
    },
    ExitOffer {
        route: ExitRoute,
        ev: i64,
        proceeds: i64,
    },
    ExitPulled {
        route: ExitRoute,
    },
    ExitClosed {
        route: ExitRoute,
        buyer: Bidder,
        ev: i64,
        proceeds: i64,
        moic_millis: i64,
        irr_bps: Option<i64>,
    },
    ProceedsReceived {
        amount: i64,
    },
    QuarterReport {
        nav: i64,
        tvpi_millis: i64,
    },
    InvestmentPeriodEnded,
    FundTermEnded {
        tvpi_millis: i64,
        carry: i64,
    },
    NextFund {
        committed: i64,
        own_house: bool,
    },
    Promotion {
        rank: Rank,
    },
    Event {
        event: EventKind,
        amount: i64,
    },
    AchievementUnlocked {
        achievement: Achievement,
    },
    ObjectivesReview {
        met: usize,
        total: usize,
        bonus: i64,
    },
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
    Watch {
        company: usize,
        on: bool,
    },
    MeetOwner {
        company: usize,
    },
    ApproachOwner {
        company: usize,
    },
    SignNda {
        company: usize,
    },
    RunDiligence {
        company: usize,
        stream: DdStream,
    },
    SetOffer {
        company: usize,
        offer: Offer,
    },
    SubmitIc {
        company: usize,
    },
    SubmitBid {
        company: usize,
    },
    /// A non-binding indication of interest in the first round.
    SubmitIndication {
        company: usize,
        ev: i64,
    },
    /// A coverage call on a sell-side bank.
    CoverBank {
        adviser: u8,
    },
    OrderValuation {
        company: usize,
        kind: crate::valuation::ValuationKind,
    },
    AnswerIc {
        company: usize,
        answer: crate::ic::Answer,
    },
    RaiseBid {
        company: usize,
        ev: i64,
    },
    ResearchSector {
        sector: usize,
    },
    HireAssociate,
    ReleaseAssociate,
    CommitPersonal {
        amount: i64,
    },
    BuyPerk {
        perk: Perk,
    },
    ProposeExclusive {
        company: usize,
    },
    DropDeal {
        company: usize,
    },
    SetBudget {
        company: usize,
        budget: Budget,
    },
    StartInitiative {
        company: usize,
        kind: InitiativeKind,
    },
    AddOn {
        platform: usize,
        target: usize,
    },
    DividendRecap {
        company: usize,
        amount: i64,
    },
    EquityCure {
        company: usize,
        amount: i64,
    },
    StartExit {
        company: usize,
        route: ExitRoute,
    },
    Decide {
        message: u64,
        choice: Choice,
    },
    MarkRead {
        message: u64,
    },
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
    NoBid,
    AboveApproval,
    UnknownSector,
    CrossBorderLocked,
    FoundersOnly,
    TeamFull,
    NotEnoughWealth,
    AlreadyForSale,
    /// The bank did not put the player on its buyer list.
    NotInvited,
    /// Indications are in and the shortlist is set.
    FirstRoundClosed,
    /// The data room and site visits open in the second round.
    SecondRoundOnly,
    OwnerNotReady,
    /// A price needs the fund's own valuation first.
    NeedsValuation,
    /// No committee meeting is booked for this deal.
    NoMeeting,
    /// A report the committee asked for is not in yet.
    ConditionOpen,
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
    pub options: Options,
    /// One record per rival house.
    pub houses: Vec<HouseRecord>,
    /// Months of sector research left, per sector.
    pub insight: Vec<u32>,
    /// 0 to 100 per committee seat.
    pub partner_trust: Vec<i64>,
    pub lps: Vec<Lp>,
    pub objectives: Vec<Objective>,
    pub year: YearStats,
    pub achievements: Vec<Unlocked>,
    pub records: Records,
    pub fund_started_month: u32,
    /// What owners say about the player to each other, −40 to 40.
    #[serde(default)]
    pub street: i64,
    /// Coverage of each sell-side bank, 0 to 100.
    #[serde(default)]
    pub banks: Vec<i64>,
    next_message_id: u64,
    pub(crate) rng: Rng,
}

impl World {
    /// Opens a game on the generator's universe.
    pub fn new(seed: u64, universe: &str, options: Options) -> Result<World, SaveError> {
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
                .ok_or_else(|| {
                    SaveError::Malformed(format!("unknown sector {}", item.sector_id))
                })?;
            companies.push(Company::from_seed(
                item,
                sector,
                &universe.industries[sector],
                &mut rng,
            ));
        }
        let career = Career::new();
        let sectors = universe.industries.len();
        let economy = Economy::new(universe.industries.len(), &mut rng, options.era);
        // Five years of statements behind each company, from a seed of its own
        // so the main stream of the game is untouched.
        for (index, company) in companies.iter_mut().enumerate() {
            let rate = company.interest_rate_bps(&economy);
            let industry = &universe.industries[company.sector];
            let history_seed = seed ^ (index as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15);
            company.backfill(industry, universe.opens.year - 1, rate, history_seed);
        }
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
            attention_left: career.rank.attention() + options.difficulty.attention_bonus(),
            career,
            messages: Vec::new(),
            options,
            houses: vec![HouseRecord::default(); RIVAL_HOUSES],
            insight: vec![0; sectors],
            partner_trust: vec![50; crate::deal::PARTNERS],
            lps: opening_lps(),
            objectives: Vec::new(),
            year: YearStats::default(),
            achievements: Vec::new(),
            records: Records::default(),
            fund_started_month: 0,
            street: 0,
            banks: vec![0; crate::advisers::ADVISERS],
            next_message_id: 0,
            rng,
        };
        // What the rival houses already own is their opening book.
        for index in 0..world.companies.len() {
            if let crate::company::Owner::Sponsor { house, .. } = world.companies[index].owner {
                let target = &world.companies[index];
                let equity = target
                    .model_equity(&world.industries[target.sector], &world.economy)
                    .max(1);
                world.companies[index].sponsor_cost = equity;
                world.houses[house as usize % RIVAL_HOUSES].invested += equity;
            }
        }
        world.post(MessageKind::Welcome, None);
        world.set_objectives();
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
                let target = self
                    .companies
                    .get_mut(company)
                    .ok_or(CommandError::UnknownCompany)?;
                target.watched = on;
                Ok(())
            }
            Command::MeetOwner { company } => self.meet_owner(company),
            Command::ApproachOwner { company } => self.approach_owner(company),
            Command::SignNda { company } => self.sign_nda(company),
            Command::RunDiligence { company, stream } => self.run_diligence(company, stream),
            Command::OrderValuation { company, kind } => self.order_valuation(company, kind),
            Command::AnswerIc { company, answer } => self.answer_ic(company, answer),
            Command::SetOffer { company, offer } => self.set_offer(company, offer),
            Command::SubmitIc { company } => self.submit_ic(company),
            Command::SubmitBid { company } => self.submit_bid(company),
            Command::SubmitIndication { company, ev } => self.submit_indication(company, ev),
            Command::CoverBank { adviser } => self.cover_bank(adviser),
            Command::RaiseBid { company, ev } => self.raise_bid(company, ev),
            Command::ResearchSector { sector } => self.research_sector(sector),
            Command::HireAssociate => self.change_team(1),
            Command::ReleaseAssociate => self.change_team(-1),
            Command::CommitPersonal { amount } => self.commit_personal(amount),
            Command::BuyPerk { perk } => self.buy_perk(perk),
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

    /// How many attention points a month the player has.
    pub fn attention_max(&self) -> i64 {
        self.career.rank.attention()
            + self.options.difficulty.attention_bonus()
            + self.career.associates
    }

    /// A founder hires or lets go an associate.
    fn change_team(&mut self, change: i64) -> Result<(), CommandError> {
        if self.career.rank != Rank::Founder {
            return Err(CommandError::FoundersOnly);
        }
        let next = self.career.associates + change;
        if !(0..=MAX_ASSOCIATES).contains(&next) {
            return Err(CommandError::TeamFull);
        }
        self.career.associates = next;
        Ok(())
    }

    /// The player's own money goes into the fund and comes back at the fund's multiple.
    fn commit_personal(&mut self, amount: i64) -> Result<(), CommandError> {
        if amount <= 0 || !self.fund.investing(self.date) {
            return Err(CommandError::InvalidAmount);
        }
        if amount > self.career.wealth {
            return Err(CommandError::NotEnoughWealth);
        }
        self.career.wealth -= amount;
        if self.career.gp_commit == 0 {
            // Investors like a manager with money in the fund.
            for lp in &mut self.lps {
                lp.satisfaction = (lp.satisfaction + 2).min(100);
            }
        }
        self.career.gp_commit += amount;
        Ok(())
    }

    fn buy_perk(&mut self, perk: Perk) -> Result<(), CommandError> {
        if self.career.perks.contains(&perk) {
            return Err(CommandError::AlreadyDone);
        }
        if perk.cost() > self.career.wealth {
            return Err(CommandError::NotEnoughWealth);
        }
        self.career.wealth -= perk.cost();
        self.career.perks.push(perk);
        Ok(())
    }

    /// Relationship at which an owner tells the player about a sale before the teaser.
    pub(crate) fn early_notice_threshold(&self) -> i64 {
        if self.career.perks.contains(&Perk::ConferenceCircuit) {
            30
        } else {
            40
        }
    }

    /// A month of reading and calls on one sector: sales there are heard of
    /// early and figures are less foggy, for a year.
    fn research_sector(&mut self, sector: usize) -> Result<(), CommandError> {
        if sector >= self.insight.len() {
            return Err(CommandError::UnknownSector);
        }
        self.spend_attention(1)?;
        self.insight[sector] = 12;
        Ok(())
    }

    pub fn model_ev(&self, company: usize) -> i64 {
        let target = &self.companies[company];
        target.model_ev(&self.industries[target.sector], &self.economy)
    }

    fn push_message(
        &mut self,
        kind: MessageKind,
        company: Option<usize>,
        news: bool,
        decision: Option<Decision>,
    ) {
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
            let open = |message: &Message| {
                message
                    .decision
                    .as_ref()
                    .is_some_and(|d| d.chosen.is_none())
            };
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

    pub(crate) fn post_decision(
        &mut self,
        kind: MessageKind,
        company: Option<usize>,
        options: Vec<Choice>,
        months: u32,
    ) {
        let decision = Decision {
            options,
            due_month: self.months_elapsed + months,
            chosen: None,
        };
        self.push_message(kind, company, false, Some(decision));
    }

    fn decide(&mut self, id: u64, choice: Choice) -> Result<(), CommandError> {
        let message = self
            .messages
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or(CommandError::UnknownMessage)?;
        let decision = message
            .decision
            .as_mut()
            .ok_or(CommandError::InvalidChoice)?;
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
            MessageKind::Event { event, amount } => {
                self.decide_event(company, event, amount, choice)
            }
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
                (decision.chosen.is_none() && decision.due_month <= self.months_elapsed).then(
                    || {
                        (
                            message.id,
                            *decision.options.last().expect("a decision has options"),
                        )
                    },
                )
            })
            .collect();
        for (id, choice) in due {
            let _ = self.decide(id, choice);
        }
    }

    fn advance_month(&mut self) {
        let closing = self.date;
        let closes_quarter = closing.closes_a_quarter();

        for news in self
            .economy
            .step(&mut self.rng, &self.industries, closes_quarter)
        {
            match news {
                EconomyNews::RateChanged { from_bps, to_bps } => {
                    self.post_news(MessageKind::RateChanged { from_bps, to_bps }, None)
                }
                EconomyNews::PhaseChanged { from, to } => {
                    self.post_news(MessageKind::PhaseChanged { from, to }, None)
                }
            }
        }

        for index in 0..self.companies.len() {
            if !self.companies[index].is_active() {
                continue;
            }
            let industry = &self.industries[self.companies[index].sector];
            let dividends = self.companies[index].step(industry, &self.economy, &mut self.rng);
            self.collect_dividends(index, dividends);
            if closes_quarter {
                self.companies[index].close_quarter(closing.year, closing.month.div_ceil(3));
            }
            if closing.month == 12 {
                self.companies[index].new_year();
            }
        }

        self.finish_diligence();
        self.finish_valuations();
        self.answer_proposals();
        self.portfolio_step(closes_quarter);
        self.refinance_maturities();
        self.market_step();
        self.rivals_step();
        self.advisers_step();
        if closes_quarter {
            self.close_quarter();
            self.update_lps();
        }
        if closing.month == 12 {
            self.review_objectives();
        }
        self.receive_pending();
        self.expire_decisions();

        self.date = closing.next();
        self.months_elapsed += 1;
        self.convene_committees();
        self.career_step();
        self.fund_clock();
        if closing.month == 12 {
            self.set_objectives();
        }
        self.monthly_achievements();
        self.attention_left = self.attention_max();
        for months in &mut self.insight {
            *months = months.saturating_sub(1);
        }
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
                .is_some_and(|holding| {
                    self.companies[index].is_player_owned() && holding.maturity <= self.date
                });
            if !due {
                continue;
            }
            let stretched =
                self.companies[index].leverage_millis() > self.economy.max_senior_millis();
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
        let due: Vec<i64> = self
            .fund
            .pending
            .iter()
            .filter(|item| item.due_month <= month)
            .map(|item| item.amount)
            .collect();
        self.fund.pending.retain(|item| item.due_month > month);
        for amount in due {
            self.fund.distribute(amount, month);
            self.post(MessageKind::ProceedsReceived { amount }, None);
        }
    }

    fn career_step(&mut self) {
        self.career.months_at_rank += 1;
        self.career.wealth += self.career.rank.salary() * 4 / 10 / 12;
        // The founder pays the team out of the house's fee income.
        self.career.wealth -= self.career.associates * ASSOCIATE_COST / 12;
        if self.career.reputation < 15 {
            self.career.fired = true;
            self.post(MessageKind::Fired, None);
            return;
        }
        // A deal professional with no deals is noticed.
        let idle = self.career.deals_closed == 0
            && self.deals.is_empty()
            && self.fund.investing(self.date);
        if idle && self.months_elapsed >= 24 && self.months_elapsed % 3 == 0 {
            self.career.adjust_reputation(-1);
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
        // The player's own commitment comes back at the fund's multiple.
        self.career.wealth += crate::math::mul_millis(self.career.gp_commit, tvpi_millis);
        self.career.gp_commit = 0;
        self.career.wealth += share;
        self.career.carry_paid += share;
        self.post(MessageKind::FundTermEnded { tvpi_millis, carry }, None);

        let strong = tvpi_millis >= self.options.difficulty.survival_tvpi_millis();
        if !strong && !self.own_house && self.career.rank < Rank::Partner {
            self.career.fired = true;
            self.post(MessageKind::Fired, None);
            return;
        }
        // A partner with a record leaves to raise under their own name.
        let own_house =
            self.own_house || (self.career.rank >= Rank::Partner && self.career.reputation >= 70);
        let committed = self.next_fund_size(own_house && !self.own_house);
        if own_house && !self.own_house {
            self.own_house = true;
            self.fund_number = 0;
            self.career.rank = Rank::Founder;
            self.career.months_at_rank = 0;
        }
        self.fund_number += 1;
        let name = format!("Fund {}", roman(self.fund_number));
        self.fund = Fund::new(&name, committed, self.date);
        self.fund_started_month = self.months_elapsed;
        for lp in &mut self.lps {
            lp.satisfaction = (lp.satisfaction + 55) / 2;
        }
        self.post(
            MessageKind::NextFund {
                committed: self.fund.committed,
                own_house,
            },
            None,
        );
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
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../public/content/universe.json"
        );
        std::fs::read_to_string(path).expect("run tools/datagen/generate.py first")
    }

    pub fn world(seed: u64) -> World {
        World::new(seed, &universe(), Options::default()).expect("the universe opens")
    }

    fn run(world: &mut World, months: u32) {
        for _ in 0..months {
            // An idle player is eventually let go; the caller checks `career.fired`.
            let _ = world.apply(Command::AdvanceMonth);
        }
    }

    /// A plain, careful player: full diligence, moderate debt, a fair price.
    fn play_month(world: &mut World) {
        for index in 0..world.companies.len() {
            if world.deals.len() >= world.career.rank.max_live_deals() {
                break;
            }
            let ebitda = world.companies[index].ttm_ebitda();
            if world.process_visible(index)
                && world.deal_index(index).is_none()
                && (4_000..40_000).contains(&ebitda)
            {
                let _ = world.apply(Command::SignNda { company: index });
            }
        }
        for company in world
            .deals
            .iter()
            .map(|deal| deal.company)
            .collect::<Vec<_>>()
        {
            let _ = world.apply(Command::OrderValuation {
                company,
                kind: crate::valuation::ValuationKind::Internal,
            });
            for stream in DD_STREAMS {
                let _ = world.apply(Command::RunDiligence { company, stream });
            }
            let _ = world.apply(Command::SubmitIndication {
                company,
                ev: world.model_ev(company) * 104 / 100,
            });
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
            attend(world, company);
            let bidding = world.companies[company]
                .process
                .as_ref()
                .is_some_and(|p| p.stage == Stage::Bidding);
            if bidding {
                let _ = world.apply(Command::SubmitBid { company });
            }
        }
        for company in 0..world.companies.len() {
            if !world.companies[company].is_player_owned() {
                continue;
            }
            for kind in [
                InitiativeKind::Procurement,
                InitiativeKind::LeanProgram,
                InitiativeKind::PricingReview,
            ] {
                let _ = world.apply(Command::StartInitiative { company, kind });
            }
            let held = world.months_elapsed
                - world.companies[company]
                    .holding
                    .as_ref()
                    .unwrap()
                    .acquired_month;
            if held >= 54 {
                let _ = world.apply(Command::StartExit {
                    company,
                    route: ExitRoute::Secondary,
                });
            }
        }
        let open: Vec<(u64, Choice)> = world
            .messages
            .iter()
            .filter_map(|message| {
                let decision = message.decision.as_ref()?;
                decision
                    .chosen
                    .is_none()
                    .then(|| (message.id, decision.options[0]))
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
        assert_eq!(world.date, GameDate::new(2027, 1));
        assert_eq!(world.fund.called, 0);
        assert_eq!(world.fund.uncalled(), 750_000);
        assert_eq!(world.companies.len(), 500);
        assert_eq!(
            world
                .companies
                .iter()
                .filter(|company| company.is_abroad())
                .count(),
            250
        );
        assert!(world
            .companies
            .iter()
            .all(|company| !company.is_player_owned()));
        assert!(world
            .companies
            .iter()
            .all(|company| company.books.balances()));
        assert_eq!(world.career.rank, Rank::VicePresident);
    }

    #[test]
    fn a_month_closes_and_the_next_opens() {
        let mut world = world(1);
        world.apply(Command::AdvanceMonth).unwrap();
        assert_eq!(world.date, GameDate::new(2027, 2));
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
        let save = world(1)
            .to_save()
            .replacen("\"schema_version\":4", "\"schema_version\":99", 1);
        assert!(matches!(
            World::from_save(&save),
            Err(SaveError::UnsupportedVersion(99))
        ));
        assert!(matches!(
            World::from_save("not json"),
            Err(SaveError::Malformed(_))
        ));
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
                    assert!(
                        company.books.balances(),
                        "seed {seed} month {month} {}",
                        company.id
                    );
                    assert!(
                        company.books.cash >= 0,
                        "seed {seed} month {month} {}",
                        company.id
                    );
                    assert!(
                        company.books.debt >= 0,
                        "seed {seed} month {month} {}",
                        company.id
                    );
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
            for _ in 0..60 {
                run(&mut world, 1);
                if world.career.fired {
                    break;
                }
                let active = world
                    .companies
                    .iter()
                    .filter(|company| company.is_active())
                    .count();
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
        let index = joinable(&mut world);
        let before = world.company_view(index);
        assert!(before["revenue"][0].as_i64() < before["revenue"][1].as_i64());
        assert!(before.get("financials").is_none());
        world.apply(Command::SignNda { company: index }).unwrap();
        let after = world.company_view(index);
        assert_eq!(after["revenue"][0], after["revenue"][1]);
        assert!(after.get("financials").is_some());
        assert_eq!(
            after["revenue"][0].as_i64().unwrap(),
            world.companies[index].ttm_revenue()
        );
    }

    #[test]
    fn attention_runs_out_and_comes_back() {
        let mut world = world(6);
        for company in 0..world.attention_max() as usize {
            world.apply(Command::MeetOwner { company }).unwrap();
        }
        assert_eq!(
            world.apply(Command::MeetOwner { company: 9 }),
            Err(CommandError::NoAttention)
        );
        world.apply(Command::AdvanceMonth).unwrap();
        assert!(world.apply(Command::MeetOwner { company: 9 }).is_ok());
    }

    /// A sale at home the player can still join: on the list, round one open.
    /// Answers every open question: evidence where it holds, else a concession.
    fn attend(world: &mut World, company: usize) {
        for _ in 0..crate::ic::QUESTIONS {
            let open = world
                .deal_index(company)
                .and_then(|index| world.deals[index].ic_meeting.as_ref())
                .is_some_and(|meeting| meeting.open);
            if !open {
                return;
            }
            let _ = world.apply(Command::AnswerIc { company, answer: crate::ic::Answer::Concede });
        }
    }

    impl World {
        /// Seats the booked committees at once, as if a month had passed.
        fn convene_committees_now(&mut self) {
            for deal in &mut self.deals {
                if let Some(meeting) = deal.ic_meeting.as_mut() {
                    meeting.date = self.date;
                }
            }
            self.convene_committees();
        }
    }

    /// Orders an adviser's valuation and lets it come in at once.
    fn valued(world: &mut World, company: usize) {
        world
            .apply(Command::OrderValuation { company, kind: crate::valuation::ValuationKind::Adviser })
            .unwrap();
        world.finish_valuations();
        let valuation = world.deals[world.deal_index(company).unwrap()].valuation.clone().unwrap();
        let truth = world.model_ev(company);
        assert!(valuation.low <= valuation.mid && valuation.mid <= valuation.high);
        assert!((valuation.mid - truth).abs() <= truth * 3 / 100 + 1);
        assert_eq!(valuation.fee, world.valuation_fee());
    }

    fn joinable(world: &mut World) -> usize {
        for _ in 0..48 {
            let found = (0..world.companies.len()).find(|index| {
                world.process_visible(*index)
                    && !world.companies[*index].is_abroad()
                    && world.on_buyer_list(*index)
                    && !world.first_round_closed(*index)
                    && world.companies[*index]
                        .process
                        .as_ref()
                        .is_some_and(|process| process.stage == Stage::Marketing)
            });
            if let Some(index) = found {
                return index;
            }
            run(world, 1);
        }
        panic!("nothing to join in four years");
    }

    #[test]
    fn a_bid_needs_the_committee() {
        let mut world = world(7);
        run(&mut world, 12);
        let index = joinable(&mut world);
        world.apply(Command::SignNda { company: index }).unwrap();
        assert_eq!(
            world.apply(Command::SubmitBid { company: index }),
            Err(CommandError::NoOffer)
        );
        let offer = Offer {
            ev: world.model_ev(index),
            senior_millis: 3_000,
            mezz_millis: 0,
            rollover_bps: 0,
            plan: Vec::new(),
        };
        assert_eq!(
            world.apply(Command::SetOffer { company: index, offer: offer.clone() }),
            Err(CommandError::NeedsValuation)
        );
        valued(&mut world, index);
        world
            .apply(Command::SetOffer {
                company: index,
                offer,
            })
            .unwrap();
        assert_eq!(
            world.apply(Command::SubmitBid { company: index }),
            Err(CommandError::NeedsCommittee)
        );
        world.apply(Command::SubmitIc { company: index }).unwrap();
        // The committee sits next month, not now.
        let deal = &world.deals[world.deal_index(index).unwrap()];
        assert!(deal.ic.is_none());
        assert_eq!(deal.ic_meeting.as_ref().unwrap().questions.len(), crate::ic::QUESTIONS);
        assert_eq!(
            world.apply(Command::AnswerIc { company: index, answer: crate::ic::Answer::Concede }),
            Err(CommandError::TooEarly)
        );
        world.convene_committees_now();
        attend(&mut world, index);
        // No diligence and no plan: the committee does not approve.
        let deal = &world.deals[world.deal_index(index).unwrap()];
        assert_ne!(deal.ic.as_ref().unwrap().outcome, IcOutcome::Approved);
        let record = deal.ic_record.as_ref().unwrap();
        assert!(record.questions.iter().all(|question| question.answer.is_some()));
        // The questions are this deal's: the missing diligence comes up.
        assert!(record.questions.iter().any(|question| matches!(
            question.topic,
            crate::ic::Topic::Concern(
                crate::deal::Concern::NoFinancialDd
                    | crate::deal::Concern::NoOperationalDd
                    | crate::deal::Concern::NoCommercialDd
                    | crate::deal::Concern::NoLegalDd
                    | crate::deal::Concern::NoPlan
            )
        )));
    }

    #[test]
    fn commands_and_messages_cross_as_tagged_json() {
        let command: Command =
            serde_json::from_str(r#"{"type":"run_diligence","company":3,"stream":"legal"}"#)
                .unwrap();
        assert_eq!(
            command,
            Command::RunDiligence {
                company: 3,
                stream: DdStream::Legal
            }
        );
        let world = world(1);
        let text = serde_json::to_string(&world.messages[0]).unwrap();
        assert!(text.contains(r#""type":"welcome""#), "{text}");
        assert_eq!(
            serde_json::to_string(&CommandError::NoAttention).unwrap(),
            r#""no_attention""#
        );
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
                println!(
                    "   {} cost {} proceeds {} moic {} irr {:?} {:?}",
                    realized.company,
                    realized.cost,
                    realized.proceeds,
                    realized.moic_millis,
                    realized.irr_bps,
                    realized.route
                );
            }
        }
    }

    #[test]
    fn a_game_opens_with_objectives_investors_and_a_league() {
        let world = world(1);
        assert_eq!(world.objectives.len(), 3);
        assert_eq!(world.lps.iter().map(|lp| lp.share_bps).sum::<i64>(), 10_000);
        assert_eq!(world.league_rows().len(), RIVAL_HOUSES + 1);
        assert_eq!(world.partner_trust, vec![50; 6]);
        let view = world.view();
        assert_eq!(view["league"].as_array().unwrap().len(), RIVAL_HOUSES + 1);
        assert_eq!(view["objectives"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn every_company_opens_with_five_years_and_keeps_closing_quarters() {
        let mut world = world(4);
        for company in &world.companies {
            assert_eq!(company.fiscal_years().len(), 5);
            assert!(company.ledger.iter().all(|period| period.books.balances()));
        }
        run(&mut world, 6);
        for company in world.companies.iter().filter(|company| company.is_active()) {
            let last = company.ledger.last().unwrap();
            assert_eq!((last.year, last.quarter, last.months), (2027, 2, 3));
            assert!(last.books.balances());
        }
    }

    #[test]
    fn deals_abroad_wait_for_a_principal() {
        let mut world = world(2);
        run(&mut world, 14);
        let abroad = (0..world.companies.len())
            .find(|index| world.companies[*index].is_abroad() && world.process_visible(*index))
            .expect("something abroad is for sale");
        assert_eq!(
            world.apply(Command::SignNda { company: abroad }),
            Err(CommandError::CrossBorderLocked)
        );
        world.career.rank = Rank::Principal;
        assert!(world.apply(Command::SignNda { company: abroad }).is_ok());
        let home = (0..world.companies.len())
            .find(|index| !world.companies[*index].is_abroad())
            .unwrap();
        assert!(
            world.diligence_cost(abroad) * 100 / world.model_ev(abroad).max(1)
                >= world.diligence_cost(home) * 100 / world.model_ev(home).max(1)
        );
    }

    #[test]
    fn sector_research_sharpens_the_fog_for_a_year() {
        let mut world = world(3);
        let index = 0;
        let sector = world.companies[index].sector;
        let before = world.company_view(index);
        world.apply(Command::ResearchSector { sector }).unwrap();
        assert_eq!(world.attention_left, world.attention_max() - 1);
        let after = world.company_view(index);
        let width = |view: &serde_json::Value| {
            view["ebitda"][1].as_i64().unwrap() - view["ebitda"][0].as_i64().unwrap()
        };
        assert!(width(&after) < width(&before));
        // No value range before the fund has valued the company.
        assert!(after["ev"].is_null());
        run(&mut world, 12);
        assert_eq!(world.insight[sector], 0);
        assert_eq!(
            world.apply(Command::ResearchSector { sector: 99 }),
            Err(CommandError::UnknownSector)
        );
    }

    #[test]
    fn a_bid_can_rise_only_within_the_approval() {
        let mut world = world(4);
        assert_eq!(
            world.apply(Command::RaiseBid { company: 0, ev: 1 }),
            Err(CommandError::NoDeal)
        );
        for _ in 0..90 {
            play_month(&mut world);
            let bid = world
                .deals
                .iter()
                .find(|deal| deal.bid_submitted)
                .map(|deal| (deal.company, deal.approved_ev));
            if let Some((company, approved)) = bid {
                // Concessions in the meeting may have narrowed the room above the approval.
                let approved = world.bid_ceiling(company) * 100 / 103;
                assert_eq!(
                    world.apply(Command::RaiseBid {
                        company,
                        ev: approved * 2
                    }),
                    Err(CommandError::AboveApproval)
                );
                assert!(world
                    .apply(Command::RaiseBid {
                        company,
                        ev: approved * 103 / 100
                    })
                    .is_ok());
                assert_eq!(
                    world.companies[company]
                        .process
                        .as_ref()
                        .unwrap()
                        .player_bid
                        .as_ref()
                        .unwrap()
                        .ev,
                    approved * 103 / 100
                );
                assert!(world.deals[world.deal_index(company).unwrap()].ic.is_some());
                return;
            }
        }
        panic!("the bot never had a bid in");
    }

    #[test]
    fn harder_games_face_higher_rival_bids_and_eras_open_differently() {
        let hard = World::new(
            1,
            &universe(),
            Options {
                difficulty: Difficulty::Hard,
                era: Era::CheapMoney,
            },
        )
        .unwrap();
        assert!(hard.options.difficulty.rival_bias_bps() > Difficulty::Relaxed.rival_bias_bps());
        assert!(hard.economy.policy_rate_bps < world(1).economy.policy_rate_bps);
        let options: Options =
            serde_json::from_str(r#"{"difficulty":"relaxed","era":"late_cycle"}"#).unwrap();
        assert_eq!(options.difficulty, Difficulty::Relaxed);
        assert_eq!(options.era, Era::LateCycle);
        assert_eq!(
            serde_json::from_str::<Options>("{}").unwrap(),
            Options::default()
        );
    }

    #[test]
    fn an_owner_tells_a_friend_what_they_think_and_may_take_a_proposal() {
        use crate::sourcing::{Access, Block, Step};
        let mut opened = 0;
        let mut declined = 0;
        for seed in 0..12 {
            let mut world = world(seed);
            let company = (0..world.companies.len())
                .find(|index| {
                    let target = &world.companies[*index];
                    !target.is_abroad()
                        && target.process.is_none()
                        && matches!(target.owner, crate::company::Owner::Founder { .. })
                })
                .unwrap();
            assert_eq!(world.access(company), Access::Stranger);
            assert_eq!(world.next_step(company).0, Step::Meet);
            assert!(world.company_view(company)["intent"].is_null());
            assert_eq!(
                world.apply(Command::ApproachOwner { company }),
                Err(CommandError::NeedsRelationship)
            );
            world.companies[company].relationship = 70;
            world.companies[company].process = None;
            assert_eq!(world.access(company), Access::Confidant);
            assert!(!world.company_view(company)["intent"].is_null());
            assert_eq!(world.next_step(company), (Step::Approach, None));
            world.apply(Command::ApproachOwner { company }).unwrap();
            // The owner takes time: nothing happens until the answer comes.
            assert!(world.deal_index(company).is_none());
            assert_eq!(world.next_step(company), (Step::Wait, Some(Block::OwnerConsidering)));
            assert_eq!(world.apply(Command::ApproachOwner { company }), Err(CommandError::AlreadyDone));
            world.companies[company].pending.as_mut().unwrap().months_left = 1;
            world.answer_proposals();
            assert!(world.companies[company].pending.is_none());
            if world.deal_index(company).is_some() {
                opened += 1;
                let process = world.companies[company].process.as_ref().unwrap();
                assert_eq!(process.stage, crate::market::Stage::Exclusive);
                assert!(process.rivals.is_empty());
                assert_eq!(world.next_step(company).0, Step::Value);
            } else {
                declined += 1;
                assert_eq!(world.companies[company].approach_cooldown, 12);
                assert_eq!(
                    world.next_step(company),
                    (Step::Approach, Some(Block::OwnerNotReady))
                );
                assert_eq!(
                    world.apply(Command::ApproachOwner { company }),
                    Err(CommandError::OwnerNotReady)
                );
            }
        }
        assert!(
            opened > 0 && declined > 0,
            "opened {opened} declined {declined}"
        );
    }

    #[test]
    fn the_next_step_follows_a_deal_from_the_data_room_to_the_bid() {
        use crate::sourcing::{Block, Step};
        let mut world = world(7);
        run(&mut world, 12);
        let company = joinable(&mut world);
        assert_eq!(world.next_step(company), (Step::SignNda, None));
        world.apply(Command::SignNda { company }).unwrap();
        assert_eq!(world.next_step(company), (Step::Value, None));
        world
            .apply(Command::OrderValuation { company, kind: crate::valuation::ValuationKind::Internal })
            .unwrap();
        assert_eq!(world.next_step(company), (Step::Wait, Some(Block::ValuationDue)));
        world.finish_valuations();
        assert_eq!(world.next_step(company), (Step::Diligence, None));
        // Round one: the memorandum supports financial and commercial work, nothing on site.
        assert_eq!(
            world.apply(Command::RunDiligence {
                company,
                stream: DdStream::Legal
            }),
            Err(CommandError::SecondRoundOnly)
        );
        for stream in [DdStream::Financial, DdStream::Commercial] {
            world
                .apply(Command::RunDiligence { company, stream })
                .unwrap();
        }
        assert_eq!(world.next_step(company), (Step::Indicate, None));
        let ev = world.model_ev(company) * 110 / 100;
        world
            .apply(Command::SubmitIndication { company, ev })
            .unwrap();
        assert_eq!(
            world.next_step(company),
            (Step::Wait, Some(Block::ReportsDue))
        );
        // A full indication takes the player into round two, where the data room opens.
        for _ in 0..4 {
            if world.companies[company]
                .process
                .as_ref()
                .is_none_or(|process| process.stage != Stage::Marketing)
            {
                break;
            }
            run_idle(&mut world);
        }
        if let Some(process) = world.companies[company].process.as_ref() {
            assert_eq!(process.stage, Stage::Bidding);
            assert_eq!(process.shortlisted, Some(true));
            assert!(process.rivals.len() < process.format.shortlist());
            assert!(world.stream_open(company, DdStream::Legal));
        }
        let abroad = (0..world.companies.len()).find(|index| {
            world.companies[*index].is_abroad()
                && world.process_visible(*index)
                && world.on_buyer_list(*index)
                && !world.first_round_closed(*index)
        });
        if let Some(abroad) = abroad {
            assert_eq!(
                world.next_step(abroad),
                (Step::SignNda, Some(Block::CrossBorderLocked))
            );
        }
    }

    #[test]
    fn the_market_moves_without_the_player() {
        let mut world = world(11);
        for _ in 0..96 {
            let _ = world.apply(Command::AdvanceMonth);
        }
        let kinds: Vec<&MessageKind> = world.messages.iter().map(|message| &message.kind).collect();
        assert!(kinds
            .iter()
            .any(|kind| matches!(kind, MessageKind::HouseFundraised { .. })));
        assert!(kinds
            .iter()
            .any(|kind| matches!(kind, MessageKind::HousePartnerLeft { .. })));
        // Houses buy from owners who never ran a process.
        assert!(world.houses.iter().map(|house| house.deals).sum::<u32>() > 0);
        assert!(world.street.abs() <= 40);
    }

    #[test]
    fn a_rival_at_the_door_lets_a_trusted_player_counter() {
        let mut world = world(5);
        let company = world
            .companies
            .iter()
            .position(|company| {
                matches!(company.owner, crate::company::Owner::Founder { .. })
                    && company.process.is_none()
                    && !company.is_abroad()
            })
            .expect("a founder company at home");
        world.companies[company].relationship = 45;
        assert_eq!(world.next_step(company).0, crate::sourcing::Step::Meet);
        world.companies[company].suitor = Some(crate::rivals::Suitor {
            house: 0,
            months_left: 3,
        });
        assert_eq!(world.proposal_threshold(company), crate::rivals::COUNTER_AT);
        if world.sale_motive(company).is_some() {
            assert_eq!(world.next_step(company).0, crate::sourcing::Step::Approach);
        }
        // Left alone, the owner answers the rival within three months.
        for _ in 0..3 {
            let _ = world.apply(Command::AdvanceMonth);
        }
        assert!(world.companies[company].suitor.is_none());
    }

    fn run_idle(world: &mut World) {
        let _ = world.apply(Command::AdvanceMonth);
    }

    #[test]
    fn a_targeted_sale_goes_to_buyers_the_bank_knows() {
        use crate::advisers::{Format, LIST_AT};
        let mut world = world(3);
        let mut seen = None;
        for _ in 0..60 {
            seen = (0..world.companies.len()).find(|index| {
                world.companies[*index]
                    .process
                    .as_ref()
                    .is_some_and(|process| {
                        process.format == Format::Targeted
                            && process.stage == Stage::Marketing
                            && process.adviser.is_some()
                    })
                    && !world.on_buyer_list(*index)
                    && !world.companies[*index].is_abroad()
            });
            if seen.is_some() {
                break;
            }
            run_idle(&mut world);
        }
        let company = seen.expect("a targeted sale the player is not on the list for");
        assert_eq!(
            world.apply(Command::SignNda { company }),
            Err(CommandError::NotInvited)
        );
        let adviser = world.companies[company]
            .process
            .as_ref()
            .unwrap()
            .adviser
            .unwrap();
        world.banks[adviser as usize] = LIST_AT;
        assert!(world.on_buyer_list(company));
        assert!(world.apply(Command::SignNda { company }).is_ok());
    }

    #[test]
    fn a_buyer_who_gives_no_indication_is_cut() {
        let mut world = world(9);
        let company = joinable(&mut world);
        world.apply(Command::SignNda { company }).unwrap();
        for _ in 0..4 {
            run_idle(&mut world);
            if world.deal_index(company).is_none() {
                break;
            }
        }
        assert!(world.deal_index(company).is_none());
        assert!(world.messages.iter().any(|message| matches!(
            message.kind,
            MessageKind::NotShortlisted
        ) || matches!(
            message.kind,
            MessageKind::SaleWithdrawn | MessageKind::SaleFailed
        )));
    }
}
