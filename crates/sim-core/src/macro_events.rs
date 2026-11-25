//! Scheduled macro events: central banks, data releases, elections, laws, and
//! the shocks nobody scheduled.
//!
//! A hidden state per bloc moves slowly, pulled by the global phase. Releases
//! read that state with noise. Consensus is the forecast made when the month
//! opens; the actual value is drawn when the month closes. What moves the
//! economy is the surprise, `actual − consensus`, scaled by the release's
//! usual miss. Nothing here is a price.
//!
//! Six blocs: the United States, the euro area (Germany and France), China,
//! the United Kingdom, Japan and Korea. One policy rate, the Fed's, still
//! prices every loan; the other central banks tilt their own bloc. Every
//! number is a placeholder.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::content::Industry;
use crate::economy::{
    Economy, Era, Phase, APPROVAL_DRAG_CAP_BPS, BLOC_GROWTH_CAP_BPS, BLOC_MULTIPLE_CAP_BPS,
    ENERGY_SHOCK_CAP_BPS, RATE_CAP_BPS, RATE_FLOOR_BPS, TAX_DELTA_CAP_BPS, TRADE_DRAG_CAP_BPS,
};
use crate::rng::Rng;

/// Months of resolved events kept for the calendar.
const KEEP_MONTHS: u32 = 24;
/// Months of schedule laid out ahead.
const AHEAD_MONTHS: u32 = 12;
/// Uncertainty a bloc returns to when nothing is happening, 0–100.
pub const UNCERTAINTY_BASE: i64 = 20;
const SURPRISE_CAP_CENTI: i64 = 300;
/// The shape of the saved calendar. 1 had three blocs and one race.
pub const CALENDAR_VERSION: u32 = 2;
pub const BLOC_COUNT: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Bloc {
    Us,
    Ez,
    Cn,
    Gb,
    Jp,
    Kr,
}

/// Index order of every per-bloc array. The first three keep their phase-1 slots.
pub const BLOCS: [Bloc; BLOC_COUNT] = [Bloc::Us, Bloc::Ez, Bloc::Cn, Bloc::Gb, Bloc::Jp, Bloc::Kr];

impl Bloc {
    pub fn index(self) -> usize {
        match self {
            Bloc::Us => 0,
            Bloc::Ez => 1,
            Bloc::Cn => 2,
            Bloc::Gb => 3,
            Bloc::Jp => 4,
            Bloc::Kr => 5,
        }
    }

    /// Germany and France share the euro area.
    pub fn of_country(country: &str) -> Option<Bloc> {
        match country {
            "US" => Some(Bloc::Us),
            "DE" | "FR" => Some(Bloc::Ez),
            "CN" => Some(Bloc::Cn),
            "GB" => Some(Bloc::Gb),
            "JP" => Some(Bloc::Jp),
            "KR" => Some(Bloc::Kr),
            _ => None,
        }
    }
}

/// A country that votes. Each has two fictional parties.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Race {
    Us,
    Gb,
    De,
    Fr,
    Jp,
    Kr,
}

pub const RACES: [Race; 6] = [Race::Us, Race::Gb, Race::De, Race::Fr, Race::Jp, Race::Kr];

impl Race {
    pub fn bloc(self) -> Bloc {
        match self {
            Race::Us => Bloc::Us,
            Race::Gb => Bloc::Gb,
            Race::De | Race::Fr => Bloc::Ez,
            Race::Jp => Bloc::Jp,
            Race::Kr => Bloc::Kr,
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
    DeElection,
    FrElection,
    CnActivity,
    CnTrade,
    CnLpr,
    CnNpc,
    Boe,
    UkCpi,
    UkBudget,
    UkElection,
    Boj,
    Tankan,
    Shunto,
    JpElection,
    Bok,
    KrExports,
    KrElection,
    KrGeneral,
    /// Laws an election winner puts to a vote.
    TaxBill,
    TradeAct,
    RegulationRule,
    /// Nobody schedules these.
    TariffShock,
    Geopolitics,
    BankStress,
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
    /// A balance of answers in whole points (+12).
    Points,
    /// Party 0's share in basis points before the vote; the winner's index after.
    Party,
    /// The chance it passes in basis points before the vote; 1 passed, 0 failed after.
    Vote,
    /// 1 to 3. Shocks only.
    Severity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    CentralBank,
    Data,
    Politics,
    Breaking,
}

/// Rule-based releases and meetings. Elections, laws and shocks are laid out elsewhere.
const SCHEDULED: [MacroKind; 21] = [
    MacroKind::Fomc,
    MacroKind::UsPayrolls,
    MacroKind::UsCpi,
    MacroKind::UsGdp,
    MacroKind::UsIsm,
    MacroKind::Sloos,
    MacroKind::Ecb,
    MacroKind::EzHicp,
    MacroKind::Ifo,
    MacroKind::CnActivity,
    MacroKind::CnTrade,
    MacroKind::CnLpr,
    MacroKind::CnNpc,
    MacroKind::Boe,
    MacroKind::UkCpi,
    MacroKind::UkBudget,
    MacroKind::Boj,
    MacroKind::Tankan,
    MacroKind::Shunto,
    MacroKind::Bok,
    MacroKind::KrExports,
];

/// Regular elections: month, a year one fell in, and the term.
const ELECTIONS: [(MacroKind, u8, i32, i32); 8] = [
    (MacroKind::UsElection, 11, 2024, 4),
    (MacroKind::UsMidterm, 11, 2026, 4),
    (MacroKind::UkElection, 5, 2024, 5),
    (MacroKind::DeElection, 9, 2025, 4),
    (MacroKind::FrElection, 4, 2022, 5),
    (MacroKind::JpElection, 7, 2025, 3),
    (MacroKind::KrElection, 3, 2022, 5),
    (MacroKind::KrGeneral, 4, 2024, 4),
];

impl MacroKind {
    /// Where the event happens, unless the event names another.
    pub fn bloc(self) -> Bloc {
        use MacroKind::*;
        match self {
            Fomc | UsPayrolls | UsCpi | UsGdp | UsIsm | Sloos | UsElection | UsMidterm => Bloc::Us,
            Ecb | EzHicp | Ifo | DeElection | FrElection => Bloc::Ez,
            CnActivity | CnTrade | CnLpr | CnNpc => Bloc::Cn,
            Boe | UkCpi | UkBudget | UkElection => Bloc::Gb,
            Boj | Tankan | Shunto | JpElection => Bloc::Jp,
            Bok | KrExports | KrElection | KrGeneral => Bloc::Kr,
            TaxBill | TradeAct | RegulationRule | TariffShock | Geopolitics | BankStress => {
                Bloc::Us
            }
        }
    }

    pub fn race(self) -> Option<Race> {
        use MacroKind::*;
        match self {
            UsElection | UsMidterm => Some(Race::Us),
            UkElection => Some(Race::Gb),
            DeElection => Some(Race::De),
            FrElection => Some(Race::Fr),
            JpElection => Some(Race::Jp),
            KrElection | KrGeneral => Some(Race::Kr),
            _ => None,
        }
    }

    /// Does a regular vote of this kind pick the government?
    fn picks_executive(self) -> bool {
        use MacroKind::*;
        matches!(
            self,
            UsElection | UkElection | DeElection | FrElection | KrElection
        )
    }

    pub fn importance(self) -> u8 {
        use MacroKind::*;
        match self {
            Fomc | UsPayrolls | UsCpi | UsElection | Ecb | CnActivity | CnNpc | Boj
            | UkElection | DeElection | FrElection | KrElection | TariffShock | Geopolitics
            | BankStress => 3,
            _ => 2,
        }
    }

    pub fn unit(self) -> Unit {
        use MacroKind::*;
        match self {
            Fomc | Ecb | CnLpr | Boe | Boj | Bok => Unit::RateBps,
            UsPayrolls => Unit::JobsK,
            UsIsm | Ifo => Unit::IndexTenths,
            Tankan => Unit::Points,
            UsElection | UsMidterm | UkElection | DeElection | FrElection | JpElection
            | KrElection | KrGeneral => Unit::Party,
            TaxBill | TradeAct | RegulationRule => Unit::Vote,
            TariffShock | Geopolitics | BankStress => Unit::Severity,
            UsCpi | UsGdp | Sloos | EzHicp | CnActivity | CnTrade | CnNpc | UkCpi | UkBudget
            | Shunto | KrExports => Unit::PctBps,
        }
    }

    pub fn category(self) -> Category {
        use MacroKind::*;
        match self {
            Fomc | Ecb | CnLpr | Boe | Boj | Bok => Category::CentralBank,
            UsElection | UsMidterm | UkElection | DeElection | FrElection | JpElection
            | KrElection | KrGeneral | CnNpc | UkBudget | TaxBill | TradeAct | RegulationRule => {
                Category::Politics
            }
            TariffShock | Geopolitics | BankStress => Category::Breaking,
            _ => Category::Data,
        }
    }

    /// The usual miss, in the release's unit. A surprise is measured against it.
    fn sigma(self) -> i64 {
        use MacroKind::*;
        match self {
            Fomc | Ecb | Boe | Boj | Bok => 25,
            CnLpr => 10,
            UsPayrolls => 55,
            UsCpi | EzHicp => 10,
            UkCpi => 12,
            UsGdp => 70,
            UsIsm | Ifo => 14,
            Tankan => 3,
            Shunto => 20,
            UkBudget => 30,
            Sloos => 600,
            CnActivity => 70,
            CnTrade => 260,
            KrExports => 300,
            CnNpc => 25,
            _ => 1,
        }
    }

    /// Sectors whose cycle the event pushes. Used for the exposure tags too.
    pub fn sectors(self) -> &'static [&'static str] {
        use MacroKind::*;
        match self {
            UsPayrolls => &["business_services", "healthcare_services"],
            UsIsm => &["industrial_components", "building_products"],
            Ifo | Tankan | KrExports | CnTrade => &["industrial_components"],
            CnActivity => &["food_manufacturing", "cold_chain_logistics"],
            UsGdp => &["cold_chain_logistics", "business_services"],
            Shunto => &["business_services"],
            TradeAct | TariffShock => &["industrial_components", "building_products"],
            RegulationRule => &["healthcare_services"],
            Geopolitics => &["cold_chain_logistics", "food_manufacturing"],
            _ => &[],
        }
    }

    /// Is there a rule-based event of this kind in that month, and on which day?
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
            Ecb => in_months(&[1, 3, 4, 6, 7, 9, 10, 12]).then(|| nth_weekday(year, month, THU, 2)),
            EzHicp => Some(last_business_day(year, month)),
            Ifo => Some(business_day_on_or_after(year, month, 24)),
            CnActivity => Some(business_day_on_or_after(year, month, 15)),
            CnTrade => Some(business_day_on_or_after(year, month, 7)),
            CnLpr => Some(business_day_on_or_after(year, month, 20)),
            CnNpc => (month == 3).then_some(5),
            Boe => in_months(&[2, 3, 5, 6, 8, 9, 11, 12]).then(|| nth_weekday(year, month, THU, 1)),
            UkCpi => Some(nth_weekday(year, month, WED, 3)),
            UkBudget => (month == 11).then(|| last_weekday(year, month, WED)),
            Boj => in_months(&[1, 3, 4, 6, 7, 9, 10, 12])
                .then(|| business_day_on_or_after(year, month, 19)),
            Tankan => match month {
                4 | 7 | 10 => Some(business_day_on_or_after(year, month, 1)),
                12 => Some(business_day_on_or_after(year, month, 13)),
                _ => None,
            },
            Shunto => (month == 3).then(|| weekday_on_or_after(year, month, 13, FRI)),
            Bok => in_months(&[1, 2, 4, 5, 7, 8, 10, 11]).then(|| nth_weekday(year, month, THU, 3)),
            KrExports => Some(1),
            _ => None,
        }
    }

    /// The day of a regular vote in its month.
    fn election_day(self, year: i32, month: u8) -> u8 {
        use MacroKind::*;
        match self {
            UsElection | UsMidterm => nth_weekday(year, month, MON, 1) + 1,
            UkElection => nth_weekday(year, month, THU, 1),
            DeElection => last_weekday(year, month, SUN),
            FrElection | JpElection => nth_weekday(year, month, SUN, 2),
            KrElection => nth_weekday(year, month, WED, 1),
            KrGeneral => nth_weekday(year, month, WED, 2),
            _ => 1,
        }
    }
}

// Days of the week, Sunday = 0.
const SUN: u8 = 0;
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

/// Where an event pushed the economy. Deltas are in each channel's unit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "channel", rename_all = "snake_case")]
pub enum Effect {
    PolicyRate { delta_bps: i64 },
    CreditSpread { delta_bps: i64 },
    BlocGrowth { bloc: Bloc, delta_bps: i64 },
    BlocMultiple { bloc: Bloc, delta_bps: i64 },
    SectorCycle { sector: String, delta_bps: i64 },
    Uncertainty { bloc: Bloc, delta: i64 },
    TaxRate { bloc: Bloc, delta_bps: i64 },
    ApprovalDrag { bloc: Bloc, delta_bps: i64 },
    TradeDrag { delta_bps: i64 },
    EnergyCost { delta_bps: i64 },
    /// Another central bank's own rate, which its bloc's companies borrow over.
    LocalRate { bloc: Bloc, delta_bps: i64 },
}

/// A law put to a vote after an election: which axis, which way, whose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Measure {
    pub race: Race,
    pub party: u8,
    /// +1 raises taxes, protects trade, or tightens rules; −1 the other way.
    pub direction: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroEvent {
    pub id: u64,
    pub kind: MacroKind,
    pub date: GameDate,
    pub day: u8,
    /// Laws and shocks say where they happen; everything else follows the kind.
    #[serde(default)]
    pub bloc: Option<Bloc>,
    /// A tariff's target.
    #[serde(default)]
    pub target: Option<Bloc>,
    /// Not on the schedule: it appears the month it happens.
    #[serde(default)]
    pub breaking: bool,
    #[serde(default)]
    pub measure: Option<Measure>,
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
    /// The fund's economist's narrower call, once asked.
    #[serde(default)]
    pub call: Option<(i64, i64)>,
    /// What the economist already knows: the measurement error, or the
    /// committee's roll. Never on screen.
    #[serde(default)]
    preset_noise: Option<i64>,
    #[serde(default)]
    preset_roll: Option<u32>,
}

impl MacroEvent {
    fn new(id: u64, kind: MacroKind, date: GameDate, day: u8) -> MacroEvent {
        MacroEvent {
            id,
            kind,
            date,
            day,
            bloc: None,
            target: None,
            breaking: false,
            measure: None,
            consensus: None,
            range: None,
            previous: None,
            actual: None,
            surprise_centi: None,
            stance: None,
            upset: false,
            effects: Vec::new(),
            call: None,
            preset_noise: None,
            preset_roll: None,
        }
    }

    pub fn resolved(&self) -> bool {
        self.actual.is_some()
    }

    pub fn bloc(&self) -> Bloc {
        self.bloc.unwrap_or(self.kind.bloc())
    }
}

/// The hidden state. All basis points.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
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
    pub gb_gap: i64,
    pub gb_inflation: i64,
    pub boe_rate: i64,
    pub jp_gap: i64,
    pub jp_inflation: i64,
    pub boj_rate: i64,
    pub kr_gap: i64,
    pub kr_inflation: i64,
    pub kr_exports: i64,
    pub bok_rate: i64,
}

/// What the latent state drifts toward in each phase. Rates are not drifted.
fn phase_means(phase: Phase, phase_months: u32) -> Latent {
    let late = i64::from(phase_months.min(48)) * 2;
    let rows: [i64; 16] = match phase {
        //            us_gap us_inf          unemp  lending ez_gap ez_inf           cn_ret cn_exp cn_gr gb_gap gb_inf        jp_gap jp_inf kr_gap kr_inf kr_exp
        Phase::Expansion => [
            60,
            250 + late,
            400,
            0,
            30,
            220 + late / 2,
            550,
            600,
            500,
            30,
            260 + late / 2,
            20,
            200,
            40,
            230,
            700,
        ],
        Phase::Slowdown => [
            -60, 300, 440, 1_500, -40, 250, 400, 200, 450, -50, 300, -30, 190, -40, 250, 0,
        ],
        Phase::Recession => [
            -300, 200, 620, 4_000, -220, 170, 250, -600, 380, -250, 200, -200, 80, -250, 150,
            -1_200,
        ],
        Phase::Recovery => [
            120, 210, 560, 500, 60, 180, 450, 400, 480, 60, 190, 50, 120, 80, 180, 500,
        ],
    };
    Latent {
        us_gap: rows[0],
        us_inflation: rows[1],
        us_unemployment: rows[2],
        us_lending: rows[3],
        ez_gap: rows[4],
        ez_inflation: rows[5],
        cn_retail: rows[6],
        cn_exports: rows[7],
        cn_growth: rows[8],
        gb_gap: rows[9],
        gb_inflation: rows[10],
        jp_gap: rows[11],
        jp_inflation: rows[12],
        kr_gap: rows[13],
        kr_inflation: rows[14],
        kr_exports: rows[15],
        ..Latent::default()
    }
}

/// A fictional party's platform on four axes, each −1, 0 or +1.
/// +1 raises taxes, protects trade, tightens rules, spends more.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Party {
    #[serde(default)]
    pub tax: i64,
    #[serde(default)]
    pub trade: i64,
    #[serde(default)]
    pub regulation: i64,
    #[serde(default)]
    pub fiscal: i64,
}

impl Party {
    /// What a win does to the bloc's multiples, in basis points.
    pub fn multiple_bps(&self) -> i64 {
        -self.tax * 80 - self.regulation * 80 - self.trade * 40 + self.fiscal * 30
    }

    fn draw(rng: &mut Rng) -> [Party; 2] {
        let mut axis = || rng.range(-1, 1);
        let tax = axis();
        let regulation = axis();
        let trade = axis();
        let fiscal = axis();
        let other_trade = axis();
        let other_fiscal = axis();
        // The two sides disagree on taxes and rules; trade and spending can cut across.
        [
            Party {
                tax,
                trade,
                regulation,
                fiscal,
            },
            Party {
                tax: -tax,
                trade: other_trade,
                regulation: -regulation,
                fiscal: other_fiscal,
            },
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RaceState {
    pub race: Race,
    pub parties: [Party; 2],
    /// Party 0's poll share in basis points.
    pub poll_bps: i64,
    /// Who governs.
    pub executive: Option<u8>,
    /// Who holds the legislature.
    pub legislature: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroCalendar {
    #[serde(default)]
    pub version: u32,
    pub latent: Latent,
    pub events: Vec<MacroEvent>,
    #[serde(default)]
    pub races: Vec<RaceState>,
    /// The year of each kind's next regular vote.
    #[serde(default)]
    pub next_election: Vec<(MacroKind, i32)>,
    /// The last month laid out in `events`.
    pub scheduled_through: Option<GameDate>,
    next_id: u64,
    rng: Rng,
}

impl Default for MacroCalendar {
    fn default() -> Self {
        MacroCalendar {
            version: 0,
            latent: Latent::default(),
            events: Vec::new(),
            races: Vec::new(),
            next_election: Vec::new(),
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
    Vote {
        event: u64,
    },
    Breaking {
        event: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallError {
    UnknownEvent,
    NotThisMonth,
    AlreadyDone,
}

impl MacroCalendar {
    /// Opens on the economy as it stands. Its own random stream keeps the rest
    /// of the world's draws where they were.
    pub fn open(seed: u64, date: GameDate, economy: &Economy, era: Era) -> MacroCalendar {
        let rng = Rng::new(seed ^ 0x4D41_4352_4F5F_4341);
        let mut latent = phase_means(economy.phase, economy.phase_months);
        latent.us_inflation += match era {
            Era::HighRates => 40,
            Era::CheapMoney => -40,
            Era::LateCycle => 60,
        };
        latent.ecb_rate = (economy.policy_rate_bps - 125).clamp(0, 600);
        latent.cn_lpr = 320;
        latent.cn_target = 500;
        let mut calendar = MacroCalendar {
            version: CALENDAR_VERSION,
            latent,
            events: Vec::new(),
            races: Vec::new(),
            next_election: Vec::new(),
            scheduled_through: None,
            next_id: 0,
            rng,
        };
        calendar.seed_new_blocs(date, economy);
        calendar.extend_schedule(date);
        calendar.forecast(date, economy);
        calendar
    }

    /// Brings a calendar saved before the six blocs up to date, on the month
    /// that is open. Nothing already scheduled moves.
    pub fn upgrade(&mut self, open: GameDate, economy: &Economy) {
        if self.version >= CALENDAR_VERSION || !self.is_open() {
            return;
        }
        self.seed_new_blocs(open, economy);
        self.version = CALENDAR_VERSION;
        let through = self.scheduled_through;
        self.scheduled_through = None;
        self.extend_schedule(open);
        if let Some(through) = through {
            if through > self.scheduled_through.unwrap_or(through) {
                self.scheduled_through = Some(through);
            }
        }
        self.forecast(open, economy);
    }

    /// The parts phase 2 added: three more blocs and the races.
    fn seed_new_blocs(&mut self, open: GameDate, economy: &Economy) {
        let means = phase_means(economy.phase, economy.phase_months);
        let state = &mut self.latent;
        state.gb_gap = means.gb_gap;
        state.gb_inflation = means.gb_inflation;
        state.boe_rate = (economy.policy_rate_bps - 50).clamp(0, 700);
        state.jp_gap = means.jp_gap;
        state.jp_inflation = means.jp_inflation;
        state.boj_rate = 50;
        state.kr_gap = means.kr_gap;
        state.kr_inflation = means.kr_inflation;
        state.kr_exports = means.kr_exports;
        state.bok_rate = 275;
        self.races = RACES
            .iter()
            .map(|race| {
                let parties = Party::draw(&mut self.rng);
                let executive = self.rng.range(0, 1) as u8;
                let legislature = if self.rng.chance_bps(7_000) {
                    executive
                } else {
                    1 - executive
                };
                RaceState {
                    race: *race,
                    parties,
                    poll_bps: 5_000 + self.rng.noise(250),
                    executive: Some(executive),
                    legislature: Some(legislature),
                }
            })
            .collect();
        self.next_election = ELECTIONS
            .iter()
            .map(|(kind, month, base, term)| {
                let mut year = *base;
                while GameDate::new(year, *month) < open {
                    year += term;
                }
                (*kind, year)
            })
            .collect();
    }

    pub fn is_open(&self) -> bool {
        self.scheduled_through.is_some()
    }

    pub fn race(&self, race: Race) -> Option<&RaceState> {
        self.races.iter().find(|state| state.race == race)
    }

    fn race_mut(&mut self, race: Race) -> Option<&mut RaceState> {
        self.races.iter_mut().find(|state| state.race == race)
    }

    /// The same state the latent would reach with no news.
    fn expected(&self, economy: &Economy) -> Latent {
        let mean = phase_means(economy.phase, economy.phase_months + 1);
        let mut next = self.latent.clone();
        drift(&mut next, &mean, None);
        next
    }

    fn exists(&self, kind: MacroKind, date: GameDate) -> bool {
        self.events
            .iter()
            .any(|event| event.kind == kind && event.date == date && !event.breaking)
    }

    fn push_event(&mut self, kind: MacroKind, date: GameDate, day: u8) -> usize {
        self.next_id += 1;
        self.events
            .push(MacroEvent::new(self.next_id, kind, date, day));
        self.events.len() - 1
    }

    fn extend_schedule(&mut self, open: GameDate) {
        let last = open.plus_months(AHEAD_MONTHS);
        let mut month = match self.scheduled_through {
            Some(done) if done >= open => done.next(),
            _ => open,
        };
        while month <= last {
            for kind in SCHEDULED {
                if let Some(day) = kind.day_in(month.year, month.month) {
                    if !self.exists(kind, month) {
                        self.push_event(kind, month, day);
                    }
                }
            }
            self.schedule_elections(month);
            self.scheduled_through = Some(month);
            month = month.next();
        }
        self.sort_events();
    }

    fn schedule_elections(&mut self, month: GameDate) {
        let due: Vec<MacroKind> = ELECTIONS
            .iter()
            .filter(|(kind, election_month, _, _)| {
                *election_month == month.month && self.next_year(*kind) == Some(month.year)
            })
            .map(|(kind, ..)| *kind)
            .collect();
        for kind in due {
            if !self.exists(kind, month) {
                let day = kind.election_day(month.year, month.month);
                self.push_event(kind, month, day);
            }
        }
    }

    fn next_year(&self, kind: MacroKind) -> Option<i32> {
        self.next_election
            .iter()
            .find(|(item, _)| *item == kind)
            .map(|(_, year)| *year)
    }

    fn set_next_year(&mut self, kind: MacroKind, year: i32) {
        if let Some(slot) = self
            .next_election
            .iter_mut()
            .find(|(item, _)| *item == kind)
        {
            slot.1 = year;
        }
    }

    fn sort_events(&mut self) {
        self.events.sort_by_key(|event| {
            (
                event.date,
                event.day,
                -(event.kind.importance() as i64),
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

    /// The chance a law passes, in basis points: better with the legislature behind it.
    fn pass_chance_bps(&self, measure: &Measure) -> i64 {
        match self.race(measure.race) {
            Some(state) if state.legislature == Some(measure.party) => 7_200,
            Some(_) => 3_500,
            None => 5_000,
        }
    }

    /// Writes the survey consensus for the open month's releases, the polls on
    /// every election ahead, and the odds on every law ahead.
    fn forecast(&mut self, open: GameDate, economy: &Economy) {
        let expected = self.expected(economy);
        for index in 0..self.events.len() {
            let event = &self.events[index];
            if event.resolved() {
                continue;
            }
            let kind = event.kind;
            if let Some(race) = kind.race() {
                let poll = self.race(race).map(|state| state.poll_bps).unwrap_or(5_000);
                let event = &mut self.events[index];
                event.consensus = Some(poll);
                event.range = Some((poll - 300, poll + 300));
                continue;
            }
            if let Some(measure) = event.measure {
                let chance = self.pass_chance_bps(&measure);
                let event = &mut self.events[index];
                event.consensus = Some(chance);
                event.range = None;
                continue;
            }
            if event.date != open || event.breaking {
                continue;
            }
            let base = match kind {
                MacroKind::Fomc => likely_decision(
                    economy.policy_rate_bps,
                    fed_target(&expected, economy.neutral_rate_bps),
                    25,
                ),
                MacroKind::Ecb => likely_decision(self.latent.ecb_rate, ecb_target(&expected), 25),
                MacroKind::CnLpr => likely_decision(self.latent.cn_lpr, pboc_target(&expected), 10),
                MacroKind::Boe => likely_decision(self.latent.boe_rate, boe_target(&expected), 25),
                MacroKind::Boj => likely_decision(self.latent.boj_rate, boj_target(&expected), 25),
                MacroKind::Bok => likely_decision(self.latent.bok_rate, bok_target(&expected), 25),
                MacroKind::CnNpc => npc_target(&expected),
                MacroKind::UkBudget => self.budget_plan(),
                _ => reading(kind, &expected),
            };
            let survey = if kind.category() == Category::Data {
                self.rng.noise(kind.sigma() / 4)
            } else {
                0
            };
            let consensus = base + survey;
            let spread = kind.sigma() * 3 / 2;
            let prior = self.previous_actual(kind);
            let event = &mut self.events[index];
            event.consensus = Some(consensus);
            event.range = Some((consensus - spread, consensus + spread));
            event.previous = prior;
        }
    }

    /// The fiscal impulse the governing party's platform implies, in bp of output.
    fn budget_plan(&self) -> i64 {
        self.race(Race::Gb)
            .and_then(|state| {
                state
                    .executive
                    .map(|party| state.parties[party as usize].fiscal)
            })
            .unwrap_or(0)
            * 30
    }

    /// The output signal the business cycle listens to, around zero.
    pub fn growth_signal_bps(&self) -> i64 {
        let state = &self.latent;
        state.us_gap * 2 / 3
            + state.ez_gap / 6
            + (state.cn_growth - 480) / 2
            + (state.gb_gap + state.jp_gap + state.kr_gap) / 12
    }

    /// The fund's economist on one of this month's releases or meetings: the
    /// same outcome the month will bring, seen through a narrower window.
    pub fn call_economist(
        &mut self,
        id: u64,
        open: GameDate,
        economy: &Economy,
    ) -> Result<(), CallError> {
        let index = self
            .events
            .iter()
            .position(|event| event.id == id)
            .ok_or(CallError::UnknownEvent)?;
        let kind = self.events[index].kind;
        let event = &self.events[index];
        if event.date != open || event.resolved() || event.breaking {
            return Err(CallError::NotThisMonth);
        }
        if !matches!(kind.category(), Category::Data | Category::CentralBank) {
            return Err(CallError::NotThisMonth);
        }
        if event.call.is_some() {
            return Err(CallError::AlreadyDone);
        }
        let expected = self.expected(economy);
        let call = match kind.category() {
            Category::CentralBank => {
                let roll = self.rng.below(10_000) as u32;
                let (rate, target, step) = self.bank_now(kind, &expected, economy);
                let decision = decide_with(roll, rate, target, step, false);
                self.events[index].preset_roll = Some(roll);
                (decision, decision)
            }
            _ => {
                let sigma = kind.sigma();
                let noise = self.rng.noise(sigma * 3 / 5);
                let center = reading(kind, &expected) + noise;
                self.events[index].preset_noise = Some(noise);
                (center - sigma / 2, center + sigma / 2)
            }
        };
        self.events[index].call = Some(call);
        Ok(())
    }

    /// Rate, target and step of a central bank on a given state.
    fn bank_now(&self, kind: MacroKind, state: &Latent, economy: &Economy) -> (i64, i64, i64) {
        match kind {
            MacroKind::Fomc => (
                economy.policy_rate_bps,
                fed_target(state, economy.neutral_rate_bps),
                25,
            ),
            MacroKind::Ecb => (self.latent.ecb_rate, ecb_target(state), 25),
            MacroKind::CnLpr => (self.latent.cn_lpr, pboc_target(state), 10),
            MacroKind::Boe => (self.latent.boe_rate, boe_target(state), 25),
            MacroKind::Boj => (self.latent.boj_rate, boj_target(state), 25),
            _ => (self.latent.bok_rate, bok_target(state), 25),
        }
    }

    /// Closes `closing`: moves the hidden state, resolves that month's events
    /// in day order, then draws the shocks nobody scheduled.
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

        self.step_polls();
        let mut news = Vec::new();
        let due: Vec<u64> = self
            .events
            .iter()
            .filter(|event| event.date == closing && !event.resolved())
            .map(|event| event.id)
            .collect();
        for id in due {
            if let Some(index) = self.events.iter().position(|event| event.id == id) {
                self.resolve(index, closing, economy, industries, &mut news);
            }
        }
        self.draw_shocks(closing, economy, industries, &mut news);
        self.settle_uncertainty(closing, economy);
        economy.decay_tilts();
        self.sync_rates(economy);
        news
    }

    /// Writes every bloc's policy rate into the economy, where companies borrow over it.
    pub fn sync_rates(&self, economy: &mut Economy) {
        let state = &self.latent;
        economy.bloc_policy_rate_bps = vec![
            economy.policy_rate_bps,
            state.ecb_rate,
            state.cn_lpr,
            state.boe_rate,
            state.boj_rate,
            state.bok_rate,
        ];
    }

    /// After the date has moved: lays out more of the schedule, drops old
    /// events, and writes the new month's consensus.
    pub fn open_month(&mut self, open: GameDate, economy: &Economy) {
        if !self.is_open() {
            return;
        }
        self.events
            .retain(|event| !event.resolved() || months_between(event.date, open) <= KEEP_MONTHS);
        self.extend_schedule(open);
        self.forecast(open, economy);
    }

    fn step_polls(&mut self) {
        for index in 0..self.races.len() {
            let noise = self.rng.noise(140);
            let state = &mut self.races[index];
            let pull = (5_000 - state.poll_bps) / 12;
            state.poll_bps = (state.poll_bps + pull + noise).clamp(3_800, 6_200);
        }
    }

    fn resolve(
        &mut self,
        index: usize,
        closing: GameDate,
        economy: &mut Economy,
        industries: &[Industry],
        news: &mut Vec<MacroNews>,
    ) {
        let kind = self.events[index].kind;
        let id = self.events[index].id;
        let consensus = self.events[index].consensus;
        let roll = self.events[index].preset_roll;
        let preset = self.events[index].preset_noise;
        let mut effects = Vec::new();
        let mut stance = None;
        let mut upset = false;
        let category = kind.category();

        let actual = match kind {
            MacroKind::Fomc => {
                let target = fed_target(&self.latent, economy.neutral_rate_bps);
                let crisis = economy.phase == Phase::Recession;
                let from = economy.policy_rate_bps;
                let to = self
                    .decide(roll, from, target, 25, crisis)
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
            MacroKind::Ecb
            | MacroKind::CnLpr
            | MacroKind::Boe
            | MacroKind::Boj
            | MacroKind::Bok => {
                let (rate, target, step) = self.bank_now(kind, &self.latent.clone(), economy);
                let (low, high) = match kind {
                    MacroKind::CnLpr => (150, 600),
                    MacroKind::Boj => (0, 300),
                    _ => (0, 700),
                };
                let to = self
                    .decide(roll, rate, target, step, false)
                    .clamp(low, high);
                stance = Some(((target - to) / (step * 2)).clamp(-2, 2));
                let slot = match kind {
                    MacroKind::Ecb => &mut self.latent.ecb_rate,
                    MacroKind::CnLpr => &mut self.latent.cn_lpr,
                    MacroKind::Boe => &mut self.latent.boe_rate,
                    MacroKind::Boj => &mut self.latent.boj_rate,
                    _ => &mut self.latent.bok_rate,
                };
                *slot = to;
                if to != rate {
                    effects.push(Effect::LocalRate {
                        bloc: kind.bloc(),
                        delta_bps: to - rate,
                    });
                }
                to
            }
            MacroKind::CnNpc => {
                let target = npc_target(&self.latent);
                self.latent.cn_target = target;
                target
            }
            MacroKind::UkBudget => self.budget_plan() + self.rng.noise(30),
            _ if kind.race().is_some() => {
                let race = kind.race().expect("a race");
                let poll = self.race(race).map(|state| state.poll_bps).unwrap_or(5_000);
                let vote = poll + self.rng.noise(220);
                let winner: u8 = if vote >= 5_000 { 0 } else { 1 };
                upset = winner != if poll >= 5_000 { 0 } else { 1 };
                winner as i64
            }
            MacroKind::TaxBill | MacroKind::TradeAct | MacroKind::RegulationRule => {
                let chance = consensus.unwrap_or(5_000);
                i64::from(self.rng.chance_bps(chance.clamp(0, 10_000) as u32))
            }
            _ => {
                let noise = preset.unwrap_or_else(|| self.rng.noise(kind.sigma() * 3 / 5));
                reading(kind, &self.latent) + noise
            }
        };

        let surprise_centi = match (category, consensus) {
            (Category::Data | Category::CentralBank, Some(consensus)) => Some(
                ((actual - consensus) * 100 / kind.sigma())
                    .clamp(-SURPRISE_CAP_CENTI, SURPRISE_CAP_CENTI),
            ),
            (Category::Politics, Some(consensus))
                if matches!(kind, MacroKind::CnNpc | MacroKind::UkBudget) =>
            {
                Some(
                    ((actual - consensus) * 100 / kind.sigma())
                        .clamp(-SURPRISE_CAP_CENTI, SURPRISE_CAP_CENTI),
                )
            }
            _ => None,
        };

        if let Some(race) = kind.race() {
            let breaking = self.events[index].breaking;
            effects.extend(self.elect(
                kind,
                race,
                actual as u8,
                upset,
                breaking,
                closing,
                economy,
                industries,
            ));
            news.push(MacroNews::Election { event: id });
        } else if let Some(measure) = self.events[index].measure {
            if actual == 1 {
                effects.extend(self.enact(kind, &measure, economy, industries));
            }
            news.push(MacroNews::Vote { event: id });
        } else if let Some(z) = surprise_centi {
            effects.extend(self.push(kind, z, economy, industries));
            if z.abs() >= 175 {
                news.push(MacroNews::Surprise { event: id });
            }
        }
        effects.retain(|effect| effect_delta(effect) != 0);

        // A vote may have scheduled laws or dropped a regular election: find the event again.
        let index = self
            .events
            .iter()
            .position(|event| event.id == id)
            .expect("the event survives its own vote");
        let event = &mut self.events[index];
        event.actual = Some(actual);
        event.surprise_centi = surprise_centi;
        event.stance = stance;
        event.upset = upset;
        event.effects = effects;
    }

    fn decide(
        &mut self,
        roll: Option<u32>,
        rate: i64,
        target: i64,
        step: i64,
        crisis: bool,
    ) -> i64 {
        let roll = roll.unwrap_or_else(|| self.rng.below(10_000) as u32);
        decide_with(roll, rate, target, step, crisis)
    }

    /// A vote: who governs now, what it does to the bloc, and the laws the winner puts forward.
    #[allow(clippy::too_many_arguments)]
    fn elect(
        &mut self,
        kind: MacroKind,
        race: Race,
        winner: u8,
        upset: bool,
        snap: bool,
        closing: GameDate,
        economy: &mut Economy,
        industries: &[Industry],
    ) -> Vec<Effect> {
        let bloc = race.bloc();
        let executive = kind.picks_executive() || snap;
        let Some(state) = self.race(race).cloned() else {
            return Vec::new();
        };
        let platform = state.parties[winner as usize];
        let changed = state.executive != Some(winner);
        let weight = if executive { 100 } else { 40 };
        let mut effects = vec![apply(
            economy,
            industries,
            Channel::Multiple(bloc),
            platform.multiple_bps() * weight / 100,
        )];
        if executive {
            effects.push(apply(
                economy,
                industries,
                Channel::Growth(bloc),
                platform.fiscal * 3,
            ));
        }
        if upset {
            effects.push(apply(economy, industries, Channel::Uncertainty(bloc), 15));
        }
        if let Some(slot) = self.race_mut(race) {
            if executive {
                slot.executive = Some(winner);
            }
            // A parliamentary vote, or one that also fills the legislature.
            if !kind.picks_executive() || matches!(race, Race::Gb | Race::De | Race::Jp | Race::Fr)
            {
                slot.legislature = Some(winner);
            }
        }
        if executive && changed {
            for (bill, direction) in [
                (MacroKind::TaxBill, platform.tax),
                (MacroKind::TradeAct, platform.trade),
                (MacroKind::RegulationRule, platform.regulation),
            ] {
                if direction == 0 {
                    continue;
                }
                let date = closing.plus_months(self.rng.range(6, 10) as u32);
                let day = business_day_on_or_after(date.year, date.month, 15);
                let at = self.push_event(bill, date, day);
                self.events[at].bloc = Some(bloc);
                self.events[at].measure = Some(Measure {
                    race,
                    party: winner,
                    direction,
                });
            }
            self.sort_events();
        }
        // The next race opens after a vote for the government.
        if executive {
            let term = ELECTIONS
                .iter()
                .find(|(item, ..)| *item == kind)
                .map(|(.., term)| *term)
                .unwrap_or(4);
            if snap {
                // A snap vote resets the clock of the regular one.
                if kind != MacroKind::JpElection {
                    self.events.retain(|event| {
                        !(event.kind == kind && !event.resolved() && !event.breaking)
                    });
                    self.set_next_year(kind, closing.year + term);
                }
            } else {
                let next = self.next_year(kind).unwrap_or(closing.year) + term;
                self.set_next_year(kind, next);
            }
            let fresh = Party::draw(&mut self.rng);
            let poll = 5_000 + self.rng.noise(300);
            if let Some(slot) = self.race_mut(race) {
                slot.parties = fresh;
                slot.poll_bps = poll;
            }
        } else if !snap {
            let term = ELECTIONS
                .iter()
                .find(|(item, ..)| *item == kind)
                .map(|(.., term)| *term)
                .unwrap_or(4);
            let next = self.next_year(kind).unwrap_or(closing.year) + term;
            self.set_next_year(kind, next);
        }
        effects
    }

    /// A law that passed.
    fn enact(
        &mut self,
        kind: MacroKind,
        measure: &Measure,
        economy: &mut Economy,
        industries: &[Industry],
    ) -> Vec<Effect> {
        use Channel::*;
        let bloc = measure.race.bloc();
        let d = measure.direction;
        let mut out = Vec::new();
        let mut go =
            |channel: Channel, delta: i64| out.push(apply(economy, industries, channel, delta));
        match kind {
            MacroKind::TaxBill => {
                go(Tax(bloc), d * 250);
                go(Multiple(bloc), -d * 150);
            }
            MacroKind::TradeAct => {
                go(Approval(bloc), d * 400);
                go(TradeDrag, d * 120);
                go(Sector("industrial_components", 8), -d * 100);
                go(Sector("building_products", 12), -d * 100);
                if d > 0 && bloc == Bloc::Us {
                    go(Growth(Bloc::Cn), -3);
                }
            }
            MacroKind::RegulationRule => {
                go(Approval(bloc), d * 300);
                go(Multiple(bloc), -d * 120);
                go(Sector("healthcare_services", 8), -d * 100);
            }
            _ => {}
        }
        out
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
            MacroKind::Sloos => go(Spread, 12 * z / 100),
            MacroKind::Ecb => go(Multiple(Bloc::Ez), -120 * z / 100),
            MacroKind::EzHicp => go(Multiple(Bloc::Ez), -50 * z / 100),
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
            MacroKind::CnLpr => go(Multiple(Bloc::Cn), -100 * z / 100),
            MacroKind::CnNpc => {
                go(Multiple(Bloc::Cn), 100 * z / 100);
                go(Growth(Bloc::Cn), 2 * z / 100);
            }
            MacroKind::Boe => go(Multiple(Bloc::Gb), -120 * z / 100),
            MacroKind::UkCpi => go(Multiple(Bloc::Gb), -50 * z / 100),
            MacroKind::UkBudget => {
                go(Growth(Bloc::Gb), 2 * z / 100);
                go(Multiple(Bloc::Gb), 40 * z / 100);
            }
            MacroKind::Boj => go(Multiple(Bloc::Jp), -150 * z / 100),
            MacroKind::Tankan => {
                go(Growth(Bloc::Jp), 3 * z / 100);
                go(Multiple(Bloc::Jp), 40 * z / 100);
                go(Sector("industrial_components", 30), z);
            }
            MacroKind::Shunto => {
                go(Multiple(Bloc::Jp), -30 * z / 100);
                go(Growth(Bloc::Jp), z / 100);
            }
            MacroKind::Bok => go(Multiple(Bloc::Kr), -120 * z / 100),
            MacroKind::KrExports => {
                go(Growth(Bloc::Kr), 3 * z / 100);
                go(Multiple(Bloc::Kr), 40 * z / 100);
                go(Sector("industrial_components", 30), z);
            }
            _ => {}
        }
        if z.abs() >= 200 {
            go(Uncertainty(kind.bloc()), 8);
        }
        out
    }

    /// The month's unscheduled shocks and snap elections, at most one of each kind.
    fn draw_shocks(
        &mut self,
        closing: GameDate,
        economy: &mut Economy,
        industries: &[Industry],
        news: &mut Vec<MacroNews>,
    ) {
        let protectionist = self
            .race(Race::Us)
            .and_then(|state| {
                state
                    .executive
                    .map(|party| state.parties[party as usize].trade > 0)
            })
            .unwrap_or(false);
        let days = days_in_month(closing.year, closing.month);

        if self.rng.chance_bps(if protectionist { 250 } else { 120 }) {
            let roll = self.rng.below(100);
            let (imposer, target) = if roll < 60 {
                (
                    Bloc::Us,
                    if self.rng.chance_bps(7_000) {
                        Bloc::Cn
                    } else {
                        Bloc::Ez
                    },
                )
            } else if roll < 85 {
                (Bloc::Cn, Bloc::Us)
            } else {
                (Bloc::Ez, Bloc::Cn)
            };
            let severity = self.rng.range(1, 3);
            let day = self.rng.range(1, i64::from(days)) as u8;
            let at = self.push_event(MacroKind::TariffShock, closing, day);
            self.events[at].bloc = Some(imposer);
            self.events[at].target = Some(target);
            self.events[at].breaking = true;
            let effects = self.tariff(imposer, target, severity, economy, industries);
            self.finish_shock(at, severity, effects, news);
        }
        if self.rng.chance_bps(80) {
            let roll = self.rng.below(100);
            let bloc = match roll {
                0..=29 => Bloc::Ez,
                30..=54 => Bloc::Cn,
                55..=69 => Bloc::Jp,
                70..=84 => Bloc::Kr,
                _ => Bloc::Us,
            };
            let severity = self.rng.range(1, 3);
            let day = self.rng.range(1, i64::from(days)) as u8;
            let at = self.push_event(MacroKind::Geopolitics, closing, day);
            self.events[at].bloc = Some(bloc);
            self.events[at].breaking = true;
            let effects = geopolitics(bloc, severity, economy, industries);
            self.finish_shock(at, severity, effects, news);
        }
        if self.rng.chance_bps(25) {
            let roll = self.rng.below(100);
            let bloc = match roll {
                0..=59 => Bloc::Us,
                60..=84 => Bloc::Ez,
                _ => Bloc::Gb,
            };
            let severity = self.rng.range(1, 3);
            let day = self.rng.range(1, i64::from(days)) as u8;
            let at = self.push_event(MacroKind::BankStress, closing, day);
            self.events[at].bloc = Some(bloc);
            self.events[at].breaking = true;
            let effects = self.bank_stress(bloc, severity, economy, industries);
            self.finish_shock(at, severity, effects, news);
        }
        // Snap votes, where governments can call them and the regular one is a year off or more.
        for (kind, chance) in [
            (MacroKind::UkElection, 40),
            (MacroKind::DeElection, 30),
            (MacroKind::JpElection, 90),
        ] {
            let far = self
                .events
                .iter()
                .filter(|event| event.kind == kind && !event.resolved())
                .all(|event| months_between(closing, event.date) >= 12);
            if !far || !self.rng.chance_bps(chance) {
                continue;
            }
            let day = self.rng.range(1, i64::from(days)) as u8;
            let at = self.push_event(kind, closing, day);
            self.events[at].breaking = true;
            let race = kind.race().expect("a race");
            let poll = self.race(race).map(|state| state.poll_bps).unwrap_or(5_000);
            self.events[at].consensus = Some(poll);
            self.events[at].range = Some((poll - 300, poll + 300));
            let id = self.events[at].id;
            self.resolve(at, closing, economy, industries, news);
            // `resolve` reported it as an election; it is also news nobody saw coming.
            news.push(MacroNews::Breaking { event: id });
        }
        self.sort_events();
    }

    fn finish_shock(
        &mut self,
        at: usize,
        severity: i64,
        mut effects: Vec<Effect>,
        news: &mut Vec<MacroNews>,
    ) {
        effects.retain(|effect| effect_delta(effect) != 0);
        let event = &mut self.events[at];
        event.actual = Some(severity);
        event.effects = effects;
        news.push(MacroNews::Breaking { event: event.id });
    }

    fn tariff(
        &mut self,
        imposer: Bloc,
        target: Bloc,
        s: i64,
        economy: &mut Economy,
        industries: &[Industry],
    ) -> Vec<Effect> {
        use Channel::*;
        if target == Bloc::Cn {
            self.latent.cn_exports -= 300 * s;
        }
        self.latent.kr_exports -= 100 * s;
        vec![
            apply(economy, industries, TradeDrag, 60 * s),
            apply(economy, industries, Approval(imposer), 250 * s),
            apply(economy, industries, Growth(target), -2 * s),
            apply(economy, industries, Multiple(target), -120 * s),
            apply(economy, industries, Multiple(imposer), -40 * s),
            apply(
                economy,
                industries,
                Sector("industrial_components", 20),
                -100 * s,
            ),
            apply(
                economy,
                industries,
                Sector("building_products", 30),
                -100 * s,
            ),
            apply(economy, industries, Uncertainty(imposer), 8 * s),
            apply(economy, industries, Uncertainty(target), 10 * s),
        ]
    }

    fn bank_stress(
        &mut self,
        bloc: Bloc,
        s: i64,
        economy: &mut Economy,
        industries: &[Industry],
    ) -> Vec<Effect> {
        use Channel::*;
        match bloc {
            Bloc::Us => {
                self.latent.us_lending += 1_500 * s;
                self.latent.us_gap -= 40 * s;
            }
            Bloc::Ez => self.latent.ez_gap -= 40 * s,
            _ => self.latent.gb_gap -= 40 * s,
        }
        vec![
            apply(economy, industries, Spread, 30 * s),
            apply(economy, industries, Uncertainty(bloc), 15 * s),
            apply(economy, industries, Multiple(bloc), -150 * s),
        ]
    }

    /// Uncertainty climbs in the three months before a vote and otherwise
    /// falls back toward its base.
    fn settle_uncertainty(&mut self, closing: GameDate, economy: &mut Economy) {
        let next = closing.next();
        for bloc in BLOCS {
            let mut target = UNCERTAINTY_BASE;
            for event in &self.events {
                if event.resolved() || event.date < next || months_between(next, event.date) > 3 {
                    continue;
                }
                if event.kind.race().map(|race| race.bloc()) == Some(bloc) {
                    target = target
                        .max(UNCERTAINTY_BASE + if event.kind.picks_executive() { 30 } else { 12 });
                }
            }
            let now = &mut economy.uncertainty[bloc.index()];
            *now += (target - *now) / 3 + i64::from(target > *now);
            *now = (*now).clamp(0, 100);
        }
    }

    pub fn event(&self, id: u64) -> Option<&MacroEvent> {
        self.events.iter().find(|event| event.id == id)
    }
}

fn geopolitics(bloc: Bloc, s: i64, economy: &mut Economy, industries: &[Industry]) -> Vec<Effect> {
    use Channel::*;
    let mut out = vec![
        apply(economy, industries, Energy, 150 * s),
        apply(economy, industries, Spread, 10 * s),
        apply(economy, industries, Multiple(bloc), -100 * s),
        apply(
            economy,
            industries,
            Sector("cold_chain_logistics", 15),
            -100 * s,
        ),
        apply(
            economy,
            industries,
            Sector("food_manufacturing", 25),
            -100 * s,
        ),
    ];
    for other in BLOCS {
        let push = if other == bloc { 10 * s } else { 4 * s };
        out.push(apply(economy, industries, Uncertainty(other), push));
    }
    out
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
        | Effect::SectorCycle { delta_bps, .. }
        | Effect::TaxRate { delta_bps, .. }
        | Effect::ApprovalDrag { delta_bps, .. }
        | Effect::TradeDrag { delta_bps }
        | Effect::EnergyCost { delta_bps }
        | Effect::LocalRate { delta_bps, .. } => *delta_bps,
        Effect::Uncertainty { delta, .. } => *delta,
    }
}

enum Channel {
    Spread,
    Growth(Bloc),
    Multiple(Bloc),
    /// Sector id, and the divisor on its amplitude per hundredth of `delta`.
    Sector(&'static str, i64),
    Uncertainty(Bloc),
    Tax(Bloc),
    Approval(Bloc),
    TradeDrag,
    Energy,
}

fn bounded(slot: &mut i64, delta: i64, low: i64, high: i64) -> i64 {
    let before = *slot;
    *slot = (before + delta).clamp(low, high);
    *slot - before
}

/// Pushes the economy and reports what actually moved after the caps.
fn apply(economy: &mut Economy, industries: &[Industry], channel: Channel, delta: i64) -> Effect {
    match channel {
        Channel::Spread => Effect::CreditSpread {
            delta_bps: bounded(&mut economy.credit_spread_bps, delta, 250, 1_100),
        },
        Channel::Growth(bloc) => Effect::BlocGrowth {
            bloc,
            delta_bps: bounded(
                &mut economy.bloc_growth_bps[bloc.index()],
                delta,
                -BLOC_GROWTH_CAP_BPS,
                BLOC_GROWTH_CAP_BPS,
            ),
        },
        Channel::Multiple(bloc) => Effect::BlocMultiple {
            bloc,
            delta_bps: bounded(
                &mut economy.bloc_multiple_bps[bloc.index()],
                delta,
                -BLOC_MULTIPLE_CAP_BPS,
                BLOC_MULTIPLE_CAP_BPS,
            ),
        },
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
            let push = amplitude * delta / divisor / 100;
            Effect::SectorCycle {
                sector: id.to_string(),
                delta_bps: bounded(
                    &mut economy.sector_cycle_bps[sector],
                    push,
                    -amplitude * 3 / 2,
                    amplitude * 3 / 2,
                ),
            }
        }
        Channel::Uncertainty(bloc) => Effect::Uncertainty {
            bloc,
            delta: bounded(&mut economy.uncertainty[bloc.index()], delta, 0, 100),
        },
        Channel::Tax(bloc) => Effect::TaxRate {
            bloc,
            delta_bps: bounded(
                &mut economy.bloc_tax_delta_bps[bloc.index()],
                delta,
                -TAX_DELTA_CAP_BPS,
                TAX_DELTA_CAP_BPS,
            ),
        },
        Channel::Approval(bloc) => Effect::ApprovalDrag {
            bloc,
            delta_bps: bounded(
                &mut economy.bloc_approval_drag_bps[bloc.index()],
                delta,
                -300,
                APPROVAL_DRAG_CAP_BPS,
            ),
        },
        Channel::TradeDrag => Effect::TradeDrag {
            delta_bps: bounded(&mut economy.trade_drag_bps, delta, 0, TRADE_DRAG_CAP_BPS),
        },
        Channel::Energy => Effect::EnergyCost {
            delta_bps: bounded(
                &mut economy.energy_shock_bps,
                delta,
                0,
                ENERGY_SHOCK_CAP_BPS,
            ),
        },
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
    step(&mut latent.gb_gap, mean.gb_gap, 5, 40);
    step(&mut latent.gb_inflation, mean.gb_inflation, 8, 10);
    step(&mut latent.jp_gap, mean.jp_gap, 5, 35);
    step(&mut latent.jp_inflation, mean.jp_inflation, 10, 8);
    step(&mut latent.kr_gap, mean.kr_gap, 5, 45);
    step(&mut latent.kr_inflation, mean.kr_inflation, 8, 10);
    step(&mut latent.kr_exports, mean.kr_exports, 3, 300);
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
        MacroKind::UkCpi => state.gb_inflation,
        MacroKind::Tankan => 5 + state.jp_gap / 10,
        MacroKind::Shunto => 200 + state.jp_inflation * 2 / 3 + state.jp_gap / 2,
        MacroKind::KrExports => state.kr_exports,
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

fn boe_target(state: &Latent) -> i64 {
    225 + (state.gb_inflation - 200) * 3 / 2 + state.gb_gap / 2
}

/// The Bank of Japan moves late and from a low floor.
fn boj_target(state: &Latent) -> i64 {
    25 + (state.jp_inflation - 200) + state.jp_gap / 2
}

fn bok_target(state: &Latent) -> i64 {
    250 + (state.kr_inflation - 200) + state.kr_gap / 2 + (state.kr_exports - 500) / 20
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

/// A committee's decision given its roll out of 10,000.
fn decide_with(roll: u32, rate: i64, target: i64, step: i64, crisis: bool) -> i64 {
    let gap = target - rate;
    if roll >= move_chance_bps(gap, step) {
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
            "healthcare_services",
            "building_products",
            "cold_chain_logistics",
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
        assert_eq!(MacroKind::UsElection.election_day(2028, 11), 7);
        assert_eq!(MacroKind::UsMidterm.election_day(2030, 11), 5);
        for year in 2027..2040 {
            for kind in [
                MacroKind::Fomc,
                MacroKind::Ecb,
                MacroKind::Boe,
                MacroKind::Boj,
                MacroKind::Bok,
            ] {
                let meetings = (1..=12)
                    .filter(|month| kind.day_in(year, *month).is_some())
                    .count();
                assert_eq!(meetings, 8, "{kind:?}");
            }
            for month in 1..=12u8 {
                let payrolls = MacroKind::UsPayrolls.day_in(year, month).unwrap();
                assert_eq!(weekday(year, month, payrolls), FRI);
                assert!(payrolls <= 7);
                let lpr = MacroKind::CnLpr.day_in(year, month).unwrap();
                assert!((20..=22).contains(&lpr));
                assert!((1..=5).contains(&weekday(year, month, lpr)));
                for kind in SCHEDULED {
                    if let Some(day) = kind.day_in(year, month) {
                        assert!(day >= 1 && day <= days_in_month(year, month));
                    }
                }
                for (kind, ..) in ELECTIONS {
                    let day = kind.election_day(year, month);
                    assert!(day >= 1 && day <= days_in_month(year, month));
                }
            }
        }
    }

    #[test]
    fn regular_votes_fall_on_their_cycle() {
        let calendar = MacroCalendar::open(
            1,
            GameDate::new(2027, 1),
            &Economy::new(6, &mut Rng::new(1), Era::HighRates),
            Era::HighRates,
        );
        let year = |kind| calendar.next_year(kind).unwrap();
        assert_eq!(year(MacroKind::UsElection), 2028);
        assert_eq!(year(MacroKind::UsMidterm), 2030);
        assert_eq!(year(MacroKind::KrElection), 2027);
        assert_eq!(year(MacroKind::FrElection), 2027);
        assert_eq!(year(MacroKind::JpElection), 2028);
        assert_eq!(year(MacroKind::UkElection), 2029);
        assert_eq!(year(MacroKind::DeElection), 2029);
        assert!(calendar.events.iter().any(
            |event| event.kind == MacroKind::KrElection && event.date == GameDate::new(2027, 3)
        ));
    }

    #[test]
    fn the_same_seed_makes_the_same_calendar() {
        let mut a = Vec::new();
        let mut b = Vec::new();
        run(7, 60, |_, economy, calendar, _| {
            a.push((economy.clone(), calendar.events.clone()))
        });
        run(7, 60, |_, economy, calendar, _| {
            b.push((economy.clone(), calendar.events.clone()))
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
        assert!(count > 20_000);
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
                    assert!(event.resolved(), "{event:?}");
                } else {
                    assert!(!event.resolved());
                    assert!(event.surprise_centi.is_none());
                    assert!(
                        !event.breaking,
                        "a shock was on the schedule ahead: {event:?}"
                    );
                }
                let forecast_ahead = event.kind.race().is_some() || event.measure.is_some();
                if event.date > open && !forecast_ahead {
                    assert!(event.consensus.is_none());
                }
            }
        });
    }

    #[test]
    fn tilts_stay_inside_their_caps() {
        run(5, 480, |_, economy, _, _| {
            for bloc in BLOCS {
                let i = bloc.index();
                assert!(economy.bloc_growth_bps[i].abs() <= BLOC_GROWTH_CAP_BPS);
                assert!(economy.bloc_multiple_bps[i].abs() <= BLOC_MULTIPLE_CAP_BPS);
                assert!(economy.bloc_tax_delta_bps[i].abs() <= TAX_DELTA_CAP_BPS);
                assert!((-300..=APPROVAL_DRAG_CAP_BPS).contains(&economy.bloc_approval_drag_bps[i]));
                assert!((0..=100).contains(&economy.uncertainty[i]));
            }
            assert!((0..=TRADE_DRAG_CAP_BPS).contains(&economy.trade_drag_bps));
            assert!((0..=ENERGY_SHOCK_CAP_BPS).contains(&economy.energy_shock_bps));
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

    #[test]
    fn a_new_government_puts_its_laws_to_a_vote_and_shocks_come_unannounced() {
        let mut votes = 0;
        let mut laws_scheduled = 0;
        let mut shocks = 0;
        let mut snaps = 0;
        for seed in 0..6 {
            run(seed, 240, |_, _, calendar, news| {
                for item in news {
                    match item {
                        MacroNews::Vote { .. } => votes += 1,
                        MacroNews::Breaking { event } => {
                            shocks += 1;
                            if calendar
                                .event(*event)
                                .is_some_and(|event| event.kind.race().is_some())
                            {
                                snaps += 1;
                            }
                        }
                        _ => {}
                    }
                }
                laws_scheduled = laws_scheduled.max(
                    calendar
                        .events
                        .iter()
                        .filter(|event| event.measure.is_some())
                        .count(),
                );
            });
        }
        assert!(votes > 10, "votes {votes}");
        assert!(laws_scheduled > 0);
        assert!(shocks > 20, "shocks {shocks}");
        assert!(snaps > 0, "snaps {snaps}");
    }

    #[test]
    fn the_economist_narrows_the_window_around_what_will_happen() {
        let industries = industries();
        let mut hits = 0;
        let mut calls = 0;
        for seed in 0..40 {
            let mut rng = Rng::new(seed);
            let mut economy = Economy::new(industries.len(), &mut rng, Era::HighRates);
            let date = GameDate::new(2027, 1);
            let mut calendar = MacroCalendar::open(seed, date, &economy, Era::HighRates);
            let ids: Vec<u64> = calendar
                .events
                .iter()
                .filter(|event| {
                    event.date == date
                        && matches!(
                            event.kind.category(),
                            Category::Data | Category::CentralBank
                        )
                })
                .map(|event| event.id)
                .collect();
            for id in &ids {
                calendar.call_economist(*id, date, &economy).unwrap();
                assert_eq!(
                    calendar.call_economist(*id, date, &economy),
                    Err(CallError::AlreadyDone)
                );
            }
            calendar.close_month(date, &mut economy, &industries);
            for id in ids {
                let event = calendar.event(id).unwrap();
                let (low, high) = event.call.unwrap();
                let survey = event.range.unwrap();
                assert!(high - low <= survey.1 - survey.0);
                calls += 1;
                let sigma = event.kind.sigma();
                if (low - sigma..=high + sigma).contains(&event.actual.unwrap()) {
                    hits += 1;
                }
            }
        }
        assert!(hits * 100 / calls >= 85, "{hits} of {calls}");
    }

    #[test]
    fn a_phase_one_calendar_upgrades_in_place() {
        let industries = industries();
        let mut rng = Rng::new(4);
        let mut economy = Economy::new(industries.len(), &mut rng, Era::HighRates);
        let date = GameDate::new(2027, 5);
        let mut calendar = MacroCalendar::open(4, date, &economy, Era::HighRates);
        // As a phase-1 save would read: three blocs' events and no races.
        calendar.version = 1;
        calendar.races.clear();
        calendar.next_election.clear();
        calendar.events.retain(|event| {
            matches!(event.kind.bloc(), Bloc::Us | Bloc::Ez | Bloc::Cn)
                && event.kind.race().map_or(true, |race| race == Race::Us)
        });
        let kept = calendar.events.len();
        calendar.upgrade(date, &economy);
        assert_eq!(calendar.version, CALENDAR_VERSION);
        assert_eq!(calendar.races.len(), RACES.len());
        assert!(calendar.events.len() > kept);
        assert!(calendar
            .events
            .iter()
            .any(|event| event.kind == MacroKind::Boj));
        let us = calendar
            .events
            .iter()
            .filter(|event| event.kind == MacroKind::UsElection)
            .count();
        assert!(us <= 1);
        calendar.close_month(date, &mut economy, &industries);
    }
}
