//! Scheduled macro events: central banks, data releases, elections.
//!
//! A hidden state per bloc moves slowly, pulled by the global phase. Releases
//! read that state with noise. Consensus is the forecast made when the month
//! opens; the actual value is drawn when the month closes. What moves the
//! economy is the surprise, `actual − consensus`, scaled by the release's
//! usual miss. Nothing here is a price.
//!
//! Phase 1 covers three blocs: the United States, the euro area (Germany and
//! France) and China. One policy rate, the Fed's, still prices every loan.
//! Every number is a placeholder.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::content::Industry;
use crate::economy::{Economy, Era, Phase, RATE_CAP_BPS, RATE_FLOOR_BPS};
use crate::rng::Rng;

/// Months of resolved events kept for the calendar.
const KEEP_MONTHS: u32 = 24;
/// Months of schedule laid out ahead.
const AHEAD_MONTHS: u32 = 12;
/// Uncertainty a bloc returns to when nothing is happening, 0–100.
pub const UNCERTAINTY_BASE: i64 = 20;
const SURPRISE_CAP_CENTI: i64 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Bloc {
    Us,
    Ez,
    Cn,
}

pub const BLOCS: [Bloc; 3] = [Bloc::Us, Bloc::Ez, Bloc::Cn];

impl Bloc {
    pub fn index(self) -> usize {
        match self {
            Bloc::Us => 0,
            Bloc::Ez => 1,
            Bloc::Cn => 2,
        }
    }

    /// Germany and France share the euro area. Countries outside phase 1 have no bloc.
    pub fn of_country(country: &str) -> Option<Bloc> {
        match country {
            "US" => Some(Bloc::Us),
            "DE" | "FR" => Some(Bloc::Ez),
            "CN" => Some(Bloc::Cn),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MacroKind {
    Fomc,
    UsPayrolls,
    UsCpi,
    UsGdp,
    UsIsm,
    Sloos,
    UsElection,
    UsMidterm,
    Ecb,
    EzHicp,
    Ifo,
    CnActivity,
    CnTrade,
    CnLpr,
    CnNpc,
}

/// How the screen should read a value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Unit {
    /// A rate level in basis points.
    RateBps,
    /// A percentage in basis points (250 = 2.5%).
    PctBps,
    /// Thousands of jobs.
    JobsK,
    /// A diffusion or survey index in tenths (502 = 50.2).
    IndexTenths,
    /// Party 0's share in basis points before the vote; the winner's index after.
    Party,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    CentralBank,
    Data,
    Politics,
}

impl MacroKind {
    pub const ALL: [MacroKind; 15] = [
        MacroKind::Fomc,
        MacroKind::UsPayrolls,
        MacroKind::UsCpi,
        MacroKind::UsGdp,
        MacroKind::UsIsm,
        MacroKind::Sloos,
        MacroKind::UsElection,
        MacroKind::UsMidterm,
        MacroKind::Ecb,
        MacroKind::EzHicp,
        MacroKind::Ifo,
        MacroKind::CnActivity,
        MacroKind::CnTrade,
        MacroKind::CnLpr,
        MacroKind::CnNpc,
    ];

    pub fn bloc(self) -> Bloc {
        use MacroKind::*;
        match self {
            Fomc | UsPayrolls | UsCpi | UsGdp | UsIsm | Sloos | UsElection | UsMidterm => Bloc::Us,
            Ecb | EzHicp | Ifo => Bloc::Ez,
            CnActivity | CnTrade | CnLpr | CnNpc => Bloc::Cn,
        }
    }

    pub fn importance(self) -> u8 {
        use MacroKind::*;
        match self {
            Fomc | UsPayrolls | UsCpi | UsElection | Ecb | CnActivity | CnNpc => 3,
            _ => 2,
        }
    }

    pub fn unit(self) -> Unit {
        use MacroKind::*;
        match self {
            Fomc | Ecb | CnLpr => Unit::RateBps,
            UsPayrolls => Unit::JobsK,
            UsIsm | Ifo => Unit::IndexTenths,
            UsElection | UsMidterm => Unit::Party,
            UsCpi | UsGdp | Sloos | EzHicp | CnActivity | CnTrade | CnNpc => Unit::PctBps,
        }
    }

    pub fn category(self) -> Category {
        use MacroKind::*;
        match self {
            Fomc | Ecb | CnLpr => Category::CentralBank,
            UsElection | UsMidterm | CnNpc => Category::Politics,
            _ => Category::Data,
        }
    }

    /// The usual miss, in the release's unit. A surprise is measured against it.
    fn sigma(self) -> i64 {
        use MacroKind::*;
        match self {
            Fomc | Ecb => 25,
            CnLpr => 10,
            UsPayrolls => 55,
            UsCpi | EzHicp => 10,
            UsGdp => 70,
            UsIsm => 14,
            Ifo => 14,
            Sloos => 600,
            CnActivity => 70,
            CnTrade => 260,
            CnNpc => 25,
            UsElection | UsMidterm => 1,
        }
    }

    /// Sectors whose cycle this release pushes. Used for the exposure tags too.
    pub fn sectors(self) -> &'static [&'static str] {
        use MacroKind::*;
        match self {
            UsPayrolls => &["business_services", "healthcare_services"],
            UsIsm => &["industrial_components", "building_products"],
            Ifo => &["industrial_components"],
            CnActivity => &["food_manufacturing", "cold_chain_logistics"],
            CnTrade => &["industrial_components"],
            UsGdp => &["cold_chain_logistics", "business_services"],
            _ => &[],
        }
    }

    /// Is there an event of this kind in that month, and on which day?
    fn day_in(self, year: i32, month: u8) -> Option<u8> {
        use MacroKind::*;
        let in_months = |months: &[u8]| months.contains(&month);
        match self {
            Fomc => {
                in_months(&[1, 3, 5, 6, 7, 9, 10, 12]).then(|| nth_weekday(year, month, WED, 3))
            }
            UsPayrolls => Some(nth_weekday(year, month, FRI, 1)),
            UsCpi => Some(weekday_on_or_after(year, month, 10, WED)),
            UsGdp => in_months(&[1, 4, 7, 10]).then(|| last_weekday(year, month, THU)),
            UsIsm => Some(business_day_on_or_after(year, month, 1)),
            Sloos => in_months(&[2, 5, 8, 11]).then(|| nth_weekday(year, month, MON, 1)),
            UsElection => (month == 11 && year % 4 == 0).then(|| election_day(year)),
            UsMidterm => (month == 11 && year % 4 == 2).then(|| election_day(year)),
            Ecb => in_months(&[1, 3, 4, 6, 7, 9, 10, 12]).then(|| nth_weekday(year, month, THU, 2)),
            EzHicp => Some(last_business_day(year, month)),
            Ifo => Some(business_day_on_or_after(year, month, 24)),
            CnActivity => Some(business_day_on_or_after(year, month, 15)),
            CnTrade => Some(business_day_on_or_after(year, month, 7)),
            CnLpr => Some(business_day_on_or_after(year, month, 20)),
            CnNpc => (month == 3).then_some(5),
        }
    }
}

// Days of the week, Sunday = 0.
const MON: u8 = 1;
const WED: u8 = 3;
const THU: u8 = 4;
const FRI: u8 = 5;

/// Sakamoto's method. Sunday is 0.
pub fn weekday(year: i32, month: u8, day: u8) -> u8 {
    const OFFSETS: [i32; 12] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = if month < 3 { year - 1 } else { year };
    let value = y + y / 4 - y / 100 + y / 400 + OFFSETS[month as usize - 1] + day as i32;
    value.rem_euclid(7) as u8
}

pub fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 => 29,
        2 => 28,
        _ => 31,
    }
}

fn nth_weekday(year: i32, month: u8, wanted: u8, nth: u8) -> u8 {
    weekday_on_or_after(year, month, 1, wanted) + 7 * (nth - 1)
}

fn weekday_on_or_after(year: i32, month: u8, day: u8, wanted: u8) -> u8 {
    let today = weekday(year, month, day);
    day + (wanted + 7 - today) % 7
}

fn last_weekday(year: i32, month: u8, wanted: u8) -> u8 {
    let last = days_in_month(year, month);
    let today = weekday(year, month, last);
    last - (today + 7 - wanted) % 7
}

fn business_day_on_or_after(year: i32, month: u8, day: u8) -> u8 {
    match weekday(year, month, day) {
        6 => day + 2,
        0 => day + 1,
        _ => day,
    }
}

fn last_business_day(year: i32, month: u8) -> u8 {
    let last = days_in_month(year, month);
    match weekday(year, month, last) {
        6 => last - 1,
        0 => last - 2,
        _ => last,
    }
}

/// The Tuesday after the first Monday of November.
fn election_day(year: i32) -> u8 {
    nth_weekday(year, 11, MON, 1) + 1
}

/// Where a release pushed the economy. Deltas are in each channel's unit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "channel", rename_all = "snake_case")]
pub enum Effect {
    PolicyRate { delta_bps: i64 },
    CreditSpread { delta_bps: i64 },
    BlocGrowth { bloc: Bloc, delta_bps: i64 },
    BlocMultiple { bloc: Bloc, delta_bps: i64 },
    SectorCycle { sector: String, delta_bps: i64 },
    Uncertainty { bloc: Bloc, delta: i64 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroEvent {
    pub id: u64,
    pub kind: MacroKind,
    pub date: GameDate,
    pub day: u8,
    pub consensus: Option<i64>,
    /// The survey's spread around the consensus.
    pub range: Option<(i64, i64)>,
    pub previous: Option<i64>,
    pub actual: Option<i64>,
    /// `(actual − consensus) / usual miss`, in hundredths, capped at ±3.
    pub surprise_centi: Option<i64>,
    /// Central banks only: −2 dovish … +2 hawkish, after the decision.
    pub stance: Option<i64>,
    /// Elections only: the vote went against the polls.
    #[serde(default)]
    pub upset: bool,
    #[serde(default)]
    pub effects: Vec<Effect>,
}

impl MacroEvent {
    pub fn resolved(&self) -> bool {
        self.actual.is_some()
    }
}

/// The hidden state. All basis points.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Latent {
    /// Output gap, annualized.
    pub us_gap: i64,
    pub us_inflation: i64,
    pub us_unemployment: i64,
    /// Net share of banks tightening standards.
    pub us_lending: i64,
    pub ez_gap: i64,
    pub ez_inflation: i64,
    pub ecb_rate: i64,
    pub cn_retail: i64,
    pub cn_exports: i64,
    pub cn_growth: i64,
    pub cn_lpr: i64,
    /// The growth target set at the last National People's Congress.
    pub cn_target: i64,
}

/// What the latent state drifts toward in each phase.
fn phase_means(phase: Phase, phase_months: u32) -> Latent {
    let late = i64::from(phase_months.min(48)) * 2;
    match phase {
        Phase::Expansion => Latent {
            us_gap: 60,
            us_inflation: 250 + late,
            us_unemployment: 400,
            us_lending: 0,
            ez_gap: 30,
            ez_inflation: 220 + late / 2,
            cn_retail: 550,
            cn_exports: 600,
            cn_growth: 500,
            ..Latent::default()
        },
        Phase::Slowdown => Latent {
            us_gap: -60,
            us_inflation: 300,
            us_unemployment: 440,
            us_lending: 1_500,
            ez_gap: -40,
            ez_inflation: 250,
            cn_retail: 400,
            cn_exports: 200,
            cn_growth: 450,
            ..Latent::default()
        },
        Phase::Recession => Latent {
            us_gap: -300,
            us_inflation: 200,
            us_unemployment: 620,
            us_lending: 4_000,
            ez_gap: -220,
            ez_inflation: 170,
            cn_retail: 250,
            cn_exports: -600,
            cn_growth: 380,
            ..Latent::default()
        },
        Phase::Recovery => Latent {
            us_gap: 120,
            us_inflation: 210,
            us_unemployment: 560,
            us_lending: 500,
            ez_gap: 60,
            ez_inflation: 180,
            cn_retail: 450,
            cn_exports: 400,
            cn_growth: 480,
            ..Latent::default()
        },
    }
}

/// Two fictional parties per election. The lean is how business-friendly the
/// platform reads, −1 to +1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Party {
    pub lean: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroCalendar {
    pub latent: Latent,
    pub events: Vec<MacroEvent>,
    pub parties: [Party; 2],
    /// Party 0's poll share in basis points.
    pub poll_bps: i64,
    /// The party in office after the last presidential election.
    pub incumbent: Option<u8>,
    /// The last month laid out in `events`.
    pub scheduled_through: Option<GameDate>,
    next_id: u64,
    rng: Rng,
}

impl Default for MacroCalendar {
    fn default() -> Self {
        MacroCalendar {
            latent: Latent::default(),
            events: Vec::new(),
            parties: [Party::default(); 2],
            poll_bps: 5_000,
            incumbent: None,
            scheduled_through: None,
            next_id: 0,
            rng: Rng::new(0),
        }
    }
}

/// What a month's close tells the world.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MacroNews {
    RateChanged {
        from_bps: i64,
        to_bps: i64,
    },
    /// A release that missed by 1.75 of its usual miss or more.
    Surprise {
        event: u64,
    },
    Election {
        event: u64,
    },
}

impl MacroCalendar {
    /// Opens on the economy as it stands. Its own random stream keeps the rest
    /// of the world's draws where they were.
    pub fn open(seed: u64, date: GameDate, economy: &Economy, era: Era) -> MacroCalendar {
        let mut rng = Rng::new(seed ^ 0x4D41_4352_4F5F_4341);
        let mut latent = phase_means(economy.phase, economy.phase_months);
        latent.us_inflation += match era {
            Era::HighRates => 40,
            Era::CheapMoney => -40,
            Era::LateCycle => 60,
        };
        latent.ecb_rate = (economy.policy_rate_bps - 125).clamp(0, 600);
        latent.cn_lpr = 320;
        latent.cn_target = 500;
        let lean = rng.range(0, 1);
        let parties = [
            Party { lean: 1 - 2 * lean },
            Party {
                lean: -(1 - 2 * lean),
            },
        ];
        let mut calendar = MacroCalendar {
            latent,
            events: Vec::new(),
            parties,
            poll_bps: 5_000 + rng.noise(250),
            incumbent: Some(rng.range(0, 1) as u8),
            scheduled_through: None,
            next_id: 0,
            rng,
        };
        calendar.extend_schedule(date);
        calendar.forecast(date, economy);
        calendar
    }

    pub fn is_open(&self) -> bool {
        self.scheduled_through.is_some()
    }

    /// The same state the latent would reach with no news.
    fn expected(&self, economy: &Economy) -> Latent {
        let mean = phase_means(economy.phase, economy.phase_months + 1);
        let mut next = self.latent.clone();
        drift(&mut next, &mean, None);
        next
    }

    fn extend_schedule(&mut self, open: GameDate) {
        let last = open.plus_months(AHEAD_MONTHS);
        let mut month = match self.scheduled_through {
            Some(done) if done >= open => done.next(),
            _ => open,
        };
        while month <= last {
            for kind in MacroKind::ALL {
                if let Some(day) = kind.day_in(month.year, month.month) {
                    self.next_id += 1;
                    self.events.push(MacroEvent {
                        id: self.next_id,
                        kind,
                        date: month,
                        day,
                        consensus: None,
                        range: None,
                        previous: None,
                        actual: None,
                        surprise_centi: None,
                        stance: None,
                        upset: false,
                        effects: Vec::new(),
                    });
                }
            }
            self.scheduled_through = Some(month);
            month = month.next();
        }
        self.events.sort_by_key(|event| {
            (
                event.date,
                event.day,
                event.kind.importance() as i64 * -1,
                event.id,
            )
        });
    }

    fn previous_actual(&self, kind: MacroKind) -> Option<i64> {
        self.events
            .iter()
            .rev()
            .find(|event| event.kind == kind && event.resolved())
            .and_then(|event| event.actual)
    }

    /// Writes the survey consensus for the open month's releases, and the
    /// current poll on every election ahead.
    fn forecast(&mut self, open: GameDate, economy: &Economy) {
        let expected = self.expected(economy);
        let poll = self.poll_bps;
        let mut previous = Vec::new();
        for event in &self.events {
            if event.date == open && !event.resolved() {
                previous.push((event.id, self.previous_actual(event.kind)));
            }
        }
        for index in 0..self.events.len() {
            let event = &self.events[index];
            if event.resolved() {
                continue;
            }
            let kind = event.kind;
            if matches!(kind, MacroKind::UsElection | MacroKind::UsMidterm) {
                let spread = 300;
                let event = &mut self.events[index];
                event.consensus = Some(poll);
                event.range = Some((poll - spread, poll + spread));
                continue;
            }
            if event.date != open {
                continue;
            }
            let id = event.id;
            let base = match kind {
                MacroKind::Fomc => likely_decision(
                    economy.policy_rate_bps,
                    fed_target(&expected, economy.neutral_rate_bps),
                    25,
                ),
                MacroKind::Ecb => likely_decision(self.latent.ecb_rate, ecb_target(&expected), 25),
                MacroKind::CnLpr => likely_decision(self.latent.cn_lpr, pboc_target(&expected), 10),
                MacroKind::CnNpc => npc_target(&expected),
                _ => reading(kind, &expected),
            };
            let survey = if kind.category() == Category::CentralBank || kind == MacroKind::CnNpc {
                0
            } else {
                self.rng.noise(kind.sigma() / 4)
            };
            let consensus = base + survey;
            let spread = kind.sigma() * 3 / 2;
            let prior = previous
                .iter()
                .find(|(event_id, _)| *event_id == id)
                .and_then(|(_, value)| *value);
            let event = &mut self.events[index];
            event.consensus = Some(consensus);
            event.range = Some((consensus - spread, consensus + spread));
            event.previous = prior;
        }
    }

    /// Mean US output gap, the signal the business cycle listens to.
    pub fn growth_signal_bps(&self) -> i64 {
        self.latent.us_gap * 2 / 3 + self.latent.ez_gap / 6 + (self.latent.cn_growth - 480) / 2
    }

    /// Closes `closing`: moves the hidden state, then resolves that month's
    /// events in day order and pushes the economy.
    pub fn close_month(
        &mut self,
        closing: GameDate,
        economy: &mut Economy,
        industries: &[Industry],
    ) -> Vec<MacroNews> {
        if !self.is_open() {
            return Vec::new();
        }
        let mean = phase_means(economy.phase, economy.phase_months + 1);
        let mut latent = self.latent.clone();
        drift(&mut latent, &mean, Some(&mut self.rng));
        self.latent = latent;

        self.step_polls(closing);
        let mut news = Vec::new();
        let due: Vec<usize> = (0..self.events.len())
            .filter(|index| self.events[*index].date == closing && !self.events[*index].resolved())
            .collect();
        for index in due {
            self.resolve(index, economy, industries, &mut news);
        }
        self.settle_uncertainty(closing, economy);
        economy.decay_tilts();
        news
    }

    /// After the date has moved: lays out more of the schedule, drops old
    /// releases, and writes the new month's consensus.
    pub fn open_month(&mut self, open: GameDate, economy: &Economy) {
        if !self.is_open() {
            return;
        }
        let oldest = open.plus_months(0);
        self.events
            .retain(|event| !event.resolved() || months_between(event.date, oldest) <= KEEP_MONTHS);
        self.extend_schedule(open);
        self.forecast(open, economy);
    }

    fn step_polls(&mut self, closing: GameDate) {
        let pull = (5_000 - self.poll_bps) / 12;
        self.poll_bps = (self.poll_bps + pull + self.rng.noise(140)).clamp(3_800, 6_200);
        // A new race opens after each presidential vote.
        if closing.month == 12 && closing.year % 4 == 0 {
            self.poll_bps = 5_000 + self.rng.noise(300);
            let lean = self.rng.range(0, 1);
            self.parties = [
                Party { lean: 1 - 2 * lean },
                Party {
                    lean: -(1 - 2 * lean),
                },
            ];
        }
    }

    fn resolve(
        &mut self,
        index: usize,
        economy: &mut Economy,
        industries: &[Industry],
        news: &mut Vec<MacroNews>,
    ) {
        let kind = self.events[index].kind;
        let id = self.events[index].id;
        let consensus = self.events[index].consensus;
        let mut effects = Vec::new();
        let mut stance = None;
        let mut upset = false;
        let actual = match kind {
            MacroKind::Fomc => {
                let target = fed_target(&self.latent, economy.neutral_rate_bps);
                let crisis = economy.phase == Phase::Recession;
                let from = economy.policy_rate_bps;
                let to = decide(&mut self.rng, from, target, 25, crisis)
                    .clamp(RATE_FLOOR_BPS, RATE_CAP_BPS);
                if to != from {
                    economy.policy_rate_bps = to;
                    effects.push(Effect::PolicyRate {
                        delta_bps: to - from,
                    });
                    news.push(MacroNews::RateChanged {
                        from_bps: from,
                        to_bps: to,
                    });
                }
                stance = Some(((target - to) / 50).clamp(-2, 2));
                to
            }
            MacroKind::Ecb => {
                let target = ecb_target(&self.latent);
                let to =
                    decide(&mut self.rng, self.latent.ecb_rate, target, 25, false).clamp(0, 600);
                stance = Some(((target - to) / 50).clamp(-2, 2));
                self.latent.ecb_rate = to;
                to
            }
            MacroKind::CnLpr => {
                let target = pboc_target(&self.latent);
                let to =
                    decide(&mut self.rng, self.latent.cn_lpr, target, 10, false).clamp(150, 600);
                stance = Some(((target - to) / 20).clamp(-2, 2));
                self.latent.cn_lpr = to;
                to
            }
            MacroKind::CnNpc => {
                let target = npc_target(&self.latent);
                self.latent.cn_target = target;
                target
            }
            MacroKind::UsElection | MacroKind::UsMidterm => {
                let vote = self.poll_bps + self.rng.noise(220);
                let winner: u8 = if vote >= 5_000 { 0 } else { 1 };
                let leader: u8 = if self.poll_bps >= 5_000 { 0 } else { 1 };
                upset = winner != leader;
                winner as i64
            }
            _ => reading(kind, &self.latent) + self.rng.noise(kind.sigma() * 3 / 5),
        };

        let surprise_centi = match (kind, consensus) {
            (MacroKind::UsElection | MacroKind::UsMidterm, _) => None,
            (_, Some(consensus)) => Some(
                ((actual - consensus) * 100 / kind.sigma())
                    .clamp(-SURPRISE_CAP_CENTI, SURPRISE_CAP_CENTI),
            ),
            _ => None,
        };

        match kind {
            MacroKind::UsElection | MacroKind::UsMidterm => {
                let winner = actual as usize;
                let weight = if kind == MacroKind::UsElection {
                    150
                } else {
                    60
                };
                let lean = self.parties[winner].lean;
                if lean != 0 {
                    effects.push(apply(
                        economy,
                        industries,
                        Channel::Multiple(Bloc::Us),
                        lean * weight,
                    ));
                    effects.push(apply(
                        economy,
                        industries,
                        Channel::Growth(Bloc::Us),
                        lean * weight / 50,
                    ));
                }
                if upset {
                    effects.push(apply(
                        economy,
                        industries,
                        Channel::Uncertainty(Bloc::Us),
                        15,
                    ));
                }
                if kind == MacroKind::UsElection {
                    self.incumbent = Some(winner as u8);
                }
                news.push(MacroNews::Election { event: id });
            }
            _ => {
                if let Some(z) = surprise_centi {
                    effects.extend(self.push(kind, z, economy, industries));
                    if z.abs() >= 175 {
                        news.push(MacroNews::Surprise { event: id });
                    }
                }
            }
        }
        effects.retain(|effect| effect_delta(effect) != 0);

        let event = &mut self.events[index];
        event.actual = Some(actual);
        event.surprise_centi = surprise_centi;
        event.stance = stance;
        event.upset = upset;
        event.effects = effects;
    }

    /// Where a surprise of `z` hundredths of the usual miss goes.
    fn push(
        &mut self,
        kind: MacroKind,
        z: i64,
        economy: &mut Economy,
        industries: &[Industry],
    ) -> Vec<Effect> {
        use Channel::*;
        let mut out = Vec::new();
        let mut go =
            |channel: Channel, delta: i64| out.push(apply(economy, industries, channel, delta));
        match kind {
            MacroKind::Fomc => {
                // A hawkish surprise: dearer credit, lower multiples.
                go(Spread, 6 * z / 100);
                go(Multiple(Bloc::Us), -120 * z / 100);
            }
            MacroKind::UsPayrolls => {
                go(Growth(Bloc::Us), 2 * z / 100);
                go(Spread, -4 * z / 100);
                go(Sector("business_services", 20), z);
                go(Sector("healthcare_services", 40), z);
            }
            MacroKind::UsCpi => {
                go(Spread, 5 * z / 100);
                go(Multiple(Bloc::Us), -60 * z / 100);
            }
            MacroKind::UsGdp => {
                go(Growth(Bloc::Us), 3 * z / 100);
                go(Multiple(Bloc::Us), 50 * z / 100);
                go(Sector("cold_chain_logistics", 30), z);
                go(Sector("business_services", 40), z);
            }
            MacroKind::UsIsm => {
                go(Sector("industrial_components", 15), z);
                go(Sector("building_products", 30), z);
            }
            MacroKind::Sloos => {
                go(Spread, 12 * z / 100);
            }
            MacroKind::Ecb => {
                go(Multiple(Bloc::Ez), -120 * z / 100);
            }
            MacroKind::EzHicp => {
                go(Multiple(Bloc::Ez), -50 * z / 100);
            }
            MacroKind::Ifo => {
                go(Growth(Bloc::Ez), 3 * z / 100);
                go(Multiple(Bloc::Ez), 40 * z / 100);
                go(Sector("industrial_components", 30), z);
            }
            MacroKind::CnActivity => {
                go(Growth(Bloc::Cn), 3 * z / 100);
                go(Sector("food_manufacturing", 25), z);
                go(Sector("cold_chain_logistics", 40), z);
            }
            MacroKind::CnTrade => {
                go(Growth(Bloc::Cn), 2 * z / 100);
                go(Sector("industrial_components", 25), z);
            }
            MacroKind::CnLpr => {
                go(Multiple(Bloc::Cn), -100 * z / 100);
            }
            MacroKind::CnNpc => {
                go(Multiple(Bloc::Cn), 100 * z / 100);
                go(Growth(Bloc::Cn), 2 * z / 100);
            }
            MacroKind::UsElection | MacroKind::UsMidterm => {}
        }
        if z.abs() >= 200 {
            go(Uncertainty(kind.bloc()), 8);
        }
        out
    }

    /// Uncertainty climbs in the three months before a presidential vote and
    /// otherwise falls back toward its base.
    fn settle_uncertainty(&mut self, closing: GameDate, economy: &mut Economy) {
        let next = closing.next();
        for bloc in BLOCS {
            let mut target = UNCERTAINTY_BASE;
            if bloc == Bloc::Us {
                let ahead = self.events.iter().any(|event| {
                    event.kind == MacroKind::UsElection
                        && !event.resolved()
                        && months_between(next, event.date) <= 3
                        && event.date >= next
                });
                if ahead {
                    target += 30;
                }
            }
            let now = &mut economy.uncertainty[bloc.index()];
            *now += (target - *now) / 3 + if target > *now { 1 } else { 0 };
            *now = (*now).clamp(0, 100);
        }
    }

    pub fn event(&self, id: u64) -> Option<&MacroEvent> {
        self.events.iter().find(|event| event.id == id)
    }
}

fn months_between(from: GameDate, to: GameDate) -> u32 {
    let a = i64::from(from.year) * 12 + i64::from(from.month);
    let b = i64::from(to.year) * 12 + i64::from(to.month);
    (b - a).unsigned_abs() as u32
}

fn effect_delta(effect: &Effect) -> i64 {
    match effect {
        Effect::PolicyRate { delta_bps }
        | Effect::CreditSpread { delta_bps }
        | Effect::BlocGrowth { delta_bps, .. }
        | Effect::BlocMultiple { delta_bps, .. }
        | Effect::SectorCycle { delta_bps, .. } => *delta_bps,
        Effect::Uncertainty { delta, .. } => *delta,
    }
}

enum Channel {
    Spread,
    Growth(Bloc),
    Multiple(Bloc),
    /// Sector id, and the divisor on its amplitude per unit of surprise.
    Sector(&'static str, i64),
    Uncertainty(Bloc),
}

/// Pushes the economy and reports what actually moved after the caps.
fn apply(economy: &mut Economy, industries: &[Industry], channel: Channel, delta: i64) -> Effect {
    match channel {
        Channel::Spread => {
            let before = economy.credit_spread_bps;
            economy.credit_spread_bps = (before + delta).clamp(250, 1_100);
            Effect::CreditSpread {
                delta_bps: economy.credit_spread_bps - before,
            }
        }
        Channel::Growth(bloc) => {
            let slot = &mut economy.bloc_growth_bps[bloc.index()];
            let before = *slot;
            *slot = (before + delta).clamp(
                -crate::economy::BLOC_GROWTH_CAP_BPS,
                crate::economy::BLOC_GROWTH_CAP_BPS,
            );
            Effect::BlocGrowth {
                bloc,
                delta_bps: *slot - before,
            }
        }
        Channel::Multiple(bloc) => {
            let slot = &mut economy.bloc_multiple_bps[bloc.index()];
            let before = *slot;
            *slot = (before + delta).clamp(
                -crate::economy::BLOC_MULTIPLE_CAP_BPS,
                crate::economy::BLOC_MULTIPLE_CAP_BPS,
            );
            Effect::BlocMultiple {
                bloc,
                delta_bps: *slot - before,
            }
        }
        Channel::Sector(id, divisor) => {
            let Some(sector) = industries
                .iter()
                .position(|industry| industry.sector_id == id)
            else {
                return Effect::SectorCycle {
                    sector: id.to_string(),
                    delta_bps: 0,
                };
            };
            let amplitude = industries[sector].cycle_amplitude_bps;
            // `delta` is the surprise in hundredths here.
            let push = amplitude * delta / divisor / 100;
            let slot = &mut economy.sector_cycle_bps[sector];
            let before = *slot;
            *slot = (before + push).clamp(-amplitude * 3 / 2, amplitude * 3 / 2);
            Effect::SectorCycle {
                sector: id.to_string(),
                delta_bps: *slot - before,
            }
        }
        Channel::Uncertainty(bloc) => {
            let slot = &mut economy.uncertainty[bloc.index()];
            let before = *slot;
            *slot = (before + delta).clamp(0, 100);
            Effect::Uncertainty {
                bloc,
                delta: *slot - before,
            }
        }
    }
}

/// One month of drift toward the phase means. With no random stream, the
/// expected path.
fn drift(latent: &mut Latent, mean: &Latent, mut rng: Option<&mut Rng>) {
    let mut step = |value: &mut i64, target: i64, k: i64, noise: i64| {
        let shock = rng.as_deref_mut().map(|rng| rng.noise(noise)).unwrap_or(0);
        *value += (target - *value) / k + shock;
    };
    step(&mut latent.us_gap, mean.us_gap, 5, 45);
    step(&mut latent.us_inflation, mean.us_inflation, 8, 9);
    step(&mut latent.us_unemployment, mean.us_unemployment, 6, 6);
    step(&mut latent.us_lending, mean.us_lending, 3, 500);
    step(&mut latent.ez_gap, mean.ez_gap, 5, 40);
    step(&mut latent.ez_inflation, mean.ez_inflation, 8, 9);
    step(&mut latent.cn_retail, mean.cn_retail, 4, 60);
    step(&mut latent.cn_exports, mean.cn_exports, 3, 220);
    step(&mut latent.cn_growth, mean.cn_growth, 6, 12);
}

/// What a release prints for a given state, before measurement noise.
fn reading(kind: MacroKind, state: &Latent) -> i64 {
    match kind {
        MacroKind::UsPayrolls => 110 + state.us_gap * 3 / 10 - (state.us_unemployment - 450) / 10,
        MacroKind::UsCpi => state.us_inflation,
        MacroKind::UsGdp => 200 + state.us_gap * 2,
        MacroKind::UsIsm => 500 + state.us_gap / 5,
        MacroKind::Sloos => state.us_lending,
        MacroKind::EzHicp => state.ez_inflation,
        MacroKind::Ifo => 880 + state.ez_gap / 5,
        MacroKind::CnActivity => state.cn_retail,
        MacroKind::CnTrade => state.cn_exports,
        _ => 0,
    }
}

/// A Taylor-style rule on the hidden state.
fn fed_target(state: &Latent, neutral: i64) -> i64 {
    neutral + (state.us_inflation - 200) * 3 / 2 - (state.us_unemployment - 420) + state.us_gap / 2
}

fn ecb_target(state: &Latent) -> i64 {
    200 + (state.ez_inflation - 200) * 3 / 2 + state.ez_gap / 2
}

/// The People's Bank leans on growth more than prices.
fn pboc_target(state: &Latent) -> i64 {
    320 + (state.cn_growth - 500) + (state.cn_retail - 500) / 10
}

fn npc_target(state: &Latent) -> i64 {
    let raw = (state.cn_growth + state.cn_target * 2) / 3;
    (raw + 25) / 50 * 50
}

fn move_chance_bps(gap: i64, step: i64) -> u32 {
    let gap = gap.abs();
    if gap >= step * 6 {
        7_000
    } else if gap >= step * 3 {
        4_500
    } else if gap >= step {
        2_000
    } else {
        0
    }
}

/// The decision a survey expects: move if a move is more likely than not.
fn likely_decision(rate: i64, target: i64, step: i64) -> i64 {
    if move_chance_bps(target - rate, step) >= 4_500 {
        rate + (target - rate).signum() * step
    } else {
        rate
    }
}

fn decide(rng: &mut Rng, rate: i64, target: i64, step: i64, crisis: bool) -> i64 {
    let gap = target - rate;
    if !rng.chance_bps(move_chance_bps(gap, step)) {
        return rate;
    }
    let size = if crisis && gap <= -step * 6 {
        step * 2
    } else {
        step
    };
    rate + gap.signum() * size
}

#[cfg(test)]
mod tests {
    use super::*;

    fn industries() -> Vec<Industry> {
        [
            "food_manufacturing",
            "industrial_components",
            "business_services",
        ]
        .iter()
        .map(|id| Industry {
            sector_id: (*id).into(),
            monthly_growth_bps: 30,
            monthly_growth_std_bps: 60,
            monthly_da_rate_bps: 60,
            capex_ratio_bps: 250,
            interest_spread_bps: 300,
            tax_rate_bps: 2_500,
            dso_days: 45,
            dio_days: 40,
            dpo_days: 35,
            min_cash_to_revenue_bps: 700,
            dividend_payout_bps: 800,
            dividend_leverage_cap_millis: 4_000,
            base_multiple_millis: 8_000,
            rate_beta_millis: 6_000,
            cycle_amplitude_bps: 600,
            multiple_floor_millis: 4_500,
            multiple_cap_millis: 12_000,
        })
        .collect()
    }

    /// Runs the economy and the calendar together, the way the world does.
    fn run(
        seed: u64,
        months: u32,
        mut each: impl FnMut(GameDate, &Economy, &MacroCalendar, &[MacroNews]),
    ) {
        let industries = industries();
        let mut rng = Rng::new(seed);
        let mut economy = Economy::new(industries.len(), &mut rng, Era::HighRates);
        let mut date = GameDate::new(2027, 1);
        let mut calendar = MacroCalendar::open(seed, date, &economy, Era::HighRates);
        for _ in 0..months {
            let news = calendar.close_month(date, &mut economy, &industries);
            economy.step(&mut rng, &industries, calendar.growth_signal_bps());
            each(date, &economy, &calendar, &news);
            date = date.next();
            calendar.open_month(date, &economy);
        }
    }

    #[test]
    fn weekdays_and_day_rules() {
        // 2027-01-01 is a Friday.
        assert_eq!(weekday(2027, 1, 1), 5);
        assert_eq!(weekday(2024, 2, 29), 4);
        assert_eq!(days_in_month(2028, 2), 29);
        assert_eq!(days_in_month(2100, 2), 28);
        assert_eq!(MacroKind::UsPayrolls.day_in(2027, 1), Some(1));
        assert_eq!(MacroKind::UsElection.day_in(2028, 11), Some(7));
        assert_eq!(MacroKind::UsMidterm.day_in(2030, 11), Some(5));
        assert_eq!(MacroKind::UsElection.day_in(2030, 11), None);
        for year in 2027..2040 {
            let fomc = (1..=12)
                .filter(|month| MacroKind::Fomc.day_in(year, *month).is_some())
                .count();
            assert_eq!(fomc, 8);
            for month in 1..=12u8 {
                let payrolls = MacroKind::UsPayrolls.day_in(year, month).unwrap();
                assert_eq!(weekday(year, month, payrolls), FRI);
                assert!(payrolls <= 7);
                let lpr = MacroKind::CnLpr.day_in(year, month).unwrap();
                assert!((20..=22).contains(&lpr));
                assert!((1..=5).contains(&weekday(year, month, lpr)));
                for kind in MacroKind::ALL {
                    if let Some(day) = kind.day_in(year, month) {
                        assert!(day >= 1 && day <= days_in_month(year, month));
                    }
                }
            }
        }
    }

    #[test]
    fn the_same_seed_makes_the_same_calendar() {
        let mut a = Vec::new();
        let mut b = Vec::new();
        run(7, 60, |_, economy, calendar, _| {
            a.push((economy.policy_rate_bps, calendar.events.clone()))
        });
        run(7, 60, |_, economy, calendar, _| {
            b.push((economy.policy_rate_bps, calendar.events.clone()))
        });
        assert_eq!(a, b);
    }

    #[test]
    fn the_rate_moves_only_at_fomc_meetings_and_stays_in_bounds() {
        for seed in 0..12 {
            let mut last = None;
            run(seed, 480, |date, economy, _, _| {
                let rate = economy.policy_rate_bps;
                if let Some(before) = last {
                    let moved: i64 = (rate - before as i64).abs();
                    let meeting = MacroKind::Fomc.day_in(date.year, date.month).is_some();
                    assert!(moved == 0 || (meeting && (moved == 25 || moved == 50)));
                }
                assert!((RATE_FLOOR_BPS..=RATE_CAP_BPS).contains(&rate));
                assert!((250..=1_100).contains(&economy.credit_spread_bps));
                last = Some(rate);
            });
        }
    }

    #[test]
    fn the_rate_follows_the_cycle_and_every_phase_comes_round() {
        let mut phases = Vec::new();
        let mut low = i64::MAX;
        let mut high = i64::MIN;
        run(11, 480, |_, economy, _, _| {
            if !phases.contains(&economy.phase) {
                phases.push(economy.phase);
            }
            low = low.min(economy.policy_rate_bps);
            high = high.max(economy.policy_rate_bps);
        });
        assert_eq!(phases.len(), 4);
        assert!(high - low >= 150, "rate range {low}..{high}");
    }

    #[test]
    fn surprises_average_out() {
        let mut sum = 0i64;
        let mut count = 0i64;
        for seed in 0..6 {
            run(seed, 600, |date, _, calendar, _| {
                for event in calendar.events.iter().filter(|event| event.date == date) {
                    if event.kind.category() == Category::Data {
                        if let Some(z) = event.surprise_centi {
                            sum += z;
                            count += 1;
                        }
                    }
                }
            });
        }
        assert!(count > 10_000);
        assert!(
            (sum / count).abs() <= 10,
            "mean surprise {} centi",
            sum / count
        );
    }

    #[test]
    fn consensus_shows_for_the_open_month_only_and_actuals_only_after_the_close() {
        run(3, 30, |closing, _, calendar, _| {
            let open = closing.next();
            for event in &calendar.events {
                if event.date <= closing {
                    assert!(event.resolved());
                } else {
                    assert!(!event.resolved());
                    assert!(event.surprise_centi.is_none());
                }
                let election = matches!(event.kind, MacroKind::UsElection | MacroKind::UsMidterm);
                if event.date > open && !election {
                    assert!(event.consensus.is_none());
                }
            }
        });
    }

    #[test]
    fn tilts_stay_inside_their_caps() {
        run(5, 480, |_, economy, _, _| {
            for bloc in BLOCS {
                let g = economy.bloc_growth_bps[bloc.index()];
                let m = economy.bloc_multiple_bps[bloc.index()];
                assert!(g.abs() <= crate::economy::BLOC_GROWTH_CAP_BPS);
                assert!(m.abs() <= crate::economy::BLOC_MULTIPLE_CAP_BPS);
                assert!((0..=100).contains(&economy.uncertainty[bloc.index()]));
            }
        });
    }

    #[test]
    fn uncertainty_rises_before_a_presidential_vote() {
        let mut before = 0;
        let mut quiet = 0;
        run(2, 24, |date, economy, _, _| {
            if date == GameDate::new(2028, 10) {
                before = economy.uncertainty[0];
            }
            if date == GameDate::new(2027, 6) {
                quiet = economy.uncertainty[0];
            }
        });
        assert!(before > quiet + 10, "before {before}, quiet {quiet}");
    }
}
