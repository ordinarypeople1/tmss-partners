//! The world: one state, commands in, events out.
//!
//! `World::apply` is the only way the state changes. Given the same seed and
//! the same commands it produces the same state and the same events, on every
//! machine. The save file is the whole state, the generator included, so a
//! reloaded game continues exactly where the original would have gone.
//!
//! Every number below is a placeholder until a person reviews it.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::rng::Rng;

pub const SAVE_SCHEMA_VERSION: u32 = 1;

const START: GameDate = GameDate { year: 2024, month: 1 };
const POLICY_RATE_BPS: i32 = 525;
const NEUTRAL_RATE_BPS: i32 = 275;
const RATE_STEP_BPS: i32 = 25;
/// Chance per quarter that the policy rate moves at all.
const RATE_MOVE_CHANCE_BPS: u32 = 3_500;
/// Given a move, chance that it heads toward neutral.
const RATE_REVERT_CHANCE_BPS: u32 = 7_000;
const RATE_FLOOR_BPS: i32 = 0;
const RATE_CAP_BPS: i32 = 800;

const FUND_COMMITTED: i64 = 750_000;
const FUND_INVESTMENT_MONTHS: u32 = 60;
const FUND_TERM_MONTHS: u32 = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Economy {
    pub policy_rate_bps: i32,
    pub neutral_rate_bps: i32,
}

/// The blind pool that starts the day the player joins. Thousand USD.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fund {
    pub committed: i64,
    pub called: i64,
    pub distributed: i64,
    pub started: GameDate,
    /// First month in which the fund may no longer make new investments.
    pub investment_period_ends: GameDate,
    /// First month past the fund's term.
    pub term_ends: GameDate,
}

impl Fund {
    pub fn uncalled(&self) -> i64 {
        self.committed - self.called
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct World {
    pub schema_version: u32,
    pub seed: u64,
    /// The month that is open. `AdvanceMonth` closes it.
    pub date: GameDate,
    pub months_elapsed: u32,
    pub economy: Economy,
    pub fund: Fund,
    next_event_seq: u64,
    rng: Rng,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    AdvanceMonth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventKind {
    MonthClosed,
    QuarterClosed { quarter: u8 },
    PolicyRateChanged { from_bps: i32, to_bps: i32 },
    InvestmentPeriodEnded,
    FundTermEnded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    /// Unique and increasing across the whole game.
    pub seq: u64,
    /// The month the event belongs to.
    pub date: GameDate,
    #[serde(flatten)]
    pub kind: EventKind,
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
                write!(f, "save schema version {version} is not supported")
            }
        }
    }
}

impl std::error::Error for SaveError {}

#[derive(Deserialize)]
struct SaveHeader {
    schema_version: u32,
}

impl World {
    pub fn new(seed: u64) -> Self {
        World {
            schema_version: SAVE_SCHEMA_VERSION,
            seed,
            date: START,
            months_elapsed: 0,
            economy: Economy {
                policy_rate_bps: POLICY_RATE_BPS,
                neutral_rate_bps: NEUTRAL_RATE_BPS,
            },
            fund: Fund {
                committed: FUND_COMMITTED,
                called: 0,
                distributed: 0,
                started: START,
                investment_period_ends: START.plus_months(FUND_INVESTMENT_MONTHS),
                term_ends: START.plus_months(FUND_TERM_MONTHS),
            },
            next_event_seq: 0,
            rng: Rng::new(seed),
        }
    }

    pub fn apply(&mut self, command: Command) -> Vec<Event> {
        match command {
            Command::AdvanceMonth => self.advance_month(),
        }
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

    fn advance_month(&mut self) -> Vec<Event> {
        let closing = self.date;
        let mut kinds = vec![EventKind::MonthClosed];

        if closing.closes_a_quarter() {
            kinds.push(EventKind::QuarterClosed {
                quarter: closing.quarter(),
            });
            if let Some(change) = self.step_policy_rate() {
                kinds.push(change);
            }
        }

        self.date = closing.next();
        self.months_elapsed += 1;

        if self.date == self.fund.investment_period_ends {
            kinds.push(EventKind::InvestmentPeriodEnded);
        }
        if self.date == self.fund.term_ends {
            kinds.push(EventKind::FundTermEnded);
        }

        kinds
            .into_iter()
            .map(|kind| {
                let seq = self.next_event_seq;
                self.next_event_seq += 1;
                Event {
                    seq,
                    date: closing,
                    kind,
                }
            })
            .collect()
    }

    /// A slow path, not a ticker: at most one step a quarter, pulled toward neutral.
    fn step_policy_rate(&mut self) -> Option<EventKind> {
        if !self.rng.chance_bps(RATE_MOVE_CHANCE_BPS) {
            return None;
        }
        let from = self.economy.policy_rate_bps;
        let toward_neutral = (self.economy.neutral_rate_bps - from).signum();
        let direction = if toward_neutral == 0 {
            if self.rng.chance_bps(5_000) {
                1
            } else {
                -1
            }
        } else if self.rng.chance_bps(RATE_REVERT_CHANCE_BPS) {
            toward_neutral
        } else {
            -toward_neutral
        };
        let to = (from + direction * RATE_STEP_BPS).clamp(RATE_FLOOR_BPS, RATE_CAP_BPS);
        if to == from {
            return None;
        }
        self.economy.policy_rate_bps = to;
        Some(EventKind::PolicyRateChanged {
            from_bps: from,
            to_bps: to,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(world: &mut World, months: u32) -> Vec<Event> {
        (0..months)
            .flat_map(|_| world.apply(Command::AdvanceMonth))
            .collect()
    }

    #[test]
    fn starts_with_an_empty_fund_on_the_first_day() {
        let world = World::new(1);
        assert_eq!(world.date, GameDate::new(2024, 1));
        assert_eq!(world.fund.called, 0);
        assert_eq!(world.fund.uncalled(), world.fund.committed);
        assert_eq!(world.fund.investment_period_ends, GameDate::new(2029, 1));
        assert_eq!(world.fund.term_ends, GameDate::new(2034, 1));
    }

    #[test]
    fn a_month_closes_and_the_next_opens() {
        let mut world = World::new(1);
        let events = world.apply(Command::AdvanceMonth);
        assert_eq!(world.date, GameDate::new(2024, 2));
        assert_eq!(world.months_elapsed, 1);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, EventKind::MonthClosed);
        assert_eq!(events[0].date, GameDate::new(2024, 1));
    }

    #[test]
    fn a_year_closes_four_quarters() {
        let mut world = World::new(1);
        let quarters: Vec<u8> = run(&mut world, 12)
            .into_iter()
            .filter_map(|event| match event.kind {
                EventKind::QuarterClosed { quarter } => Some(quarter),
                _ => None,
            })
            .collect();
        assert_eq!(quarters, vec![1, 2, 3, 4]);
        assert_eq!(world.date, GameDate::new(2025, 1));
    }

    #[test]
    fn the_same_seed_replays_the_same_game() {
        let mut a = World::new(42);
        let mut b = World::new(42);
        assert_eq!(run(&mut a, 240), run(&mut b, 240));
        assert_eq!(a, b);
    }

    #[test]
    fn different_seeds_take_different_rate_paths() {
        let paths: Vec<Vec<Event>> = (0..8)
            .map(|seed| {
                let mut world = World::new(seed);
                run(&mut world, 240)
            })
            .collect();
        assert!(paths.iter().any(|path| path != &paths[0]));
    }

    #[test]
    fn a_reloaded_game_continues_as_the_original_would() {
        let mut original = World::new(9);
        run(&mut original, 37);
        let mut reloaded = World::from_save(&original.to_save()).unwrap();
        assert_eq!(reloaded, original);
        assert_eq!(run(&mut reloaded, 100), run(&mut original, 100));
        assert_eq!(reloaded, original);
    }

    #[test]
    fn event_sequence_numbers_never_repeat() {
        let mut world = World::new(3);
        let events = run(&mut world, 120);
        for (index, event) in events.iter().enumerate() {
            assert_eq!(event.seq, index as u64);
        }
    }

    #[test]
    fn the_policy_rate_moves_one_step_at_quarter_ends_and_stays_in_bounds() {
        for seed in 0..20 {
            let mut world = World::new(seed);
            for event in run(&mut world, 480) {
                if let EventKind::PolicyRateChanged { from_bps, to_bps } = event.kind {
                    assert!(event.date.closes_a_quarter());
                    assert_eq!((to_bps - from_bps).abs(), RATE_STEP_BPS);
                    assert!((RATE_FLOOR_BPS..=RATE_CAP_BPS).contains(&to_bps));
                }
            }
        }
    }

    #[test]
    fn the_fund_clock_fires_once_each() {
        let mut world = World::new(1);
        let events = run(&mut world, 130);
        let ended: Vec<&Event> = events
            .iter()
            .filter(|event| event.kind == EventKind::InvestmentPeriodEnded)
            .collect();
        assert_eq!(ended.len(), 1);
        assert_eq!(ended[0].date, GameDate::new(2028, 12));
        let term: Vec<&Event> = events
            .iter()
            .filter(|event| event.kind == EventKind::FundTermEnded)
            .collect();
        assert_eq!(term.len(), 1);
        assert_eq!(term[0].date, GameDate::new(2033, 12));
    }

    #[test]
    fn an_event_serializes_flat() {
        let mut world = World::new(1);
        let events = world.apply(Command::AdvanceMonth);
        assert_eq!(
            serde_json::to_string(&events).unwrap(),
            r#"[{"seq":0,"date":{"year":2024,"month":1},"type":"month_closed"}]"#
        );
    }

    #[test]
    fn rejects_a_save_from_another_schema() {
        let save = World::new(1)
            .to_save()
            .replace("\"schema_version\":1", "\"schema_version\":99");
        assert!(matches!(
            World::from_save(&save),
            Err(SaveError::UnsupportedVersion(99))
        ));
        assert!(matches!(
            World::from_save("not json"),
            Err(SaveError::Malformed(_))
        ));
    }
}
