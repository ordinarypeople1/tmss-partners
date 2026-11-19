//! The sim ticks by month. Quarters close on months 3, 6, 9 and 12.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct GameDate {
    pub year: i32,
    /// 1 through 12.
    pub month: u8,
}

impl GameDate {
    pub fn new(year: i32, month: u8) -> Self {
        assert!((1..=12).contains(&month), "month must be 1 through 12");
        GameDate { year, month }
    }

    pub fn next(self) -> Self {
        if self.month == 12 {
            GameDate::new(self.year + 1, 1)
        } else {
            GameDate::new(self.year, self.month + 1)
        }
    }

    pub fn plus_months(self, months: u32) -> Self {
        let total = i64::from(self.year) * 12 + i64::from(self.month) - 1 + i64::from(months);
        GameDate::new((total / 12) as i32, (total % 12) as u8 + 1)
    }

    /// 1 through 4.
    pub fn quarter(self) -> u8 {
        (self.month - 1) / 3 + 1
    }

    pub fn closes_a_quarter(self) -> bool {
        self.month % 3 == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn december_rolls_into_january() {
        assert_eq!(GameDate::new(2024, 12).next(), GameDate::new(2025, 1));
        assert_eq!(GameDate::new(2024, 5).next(), GameDate::new(2024, 6));
    }

    #[test]
    fn adds_months_across_years() {
        let start = GameDate::new(2024, 1);
        assert_eq!(start.plus_months(0), start);
        assert_eq!(start.plus_months(11), GameDate::new(2024, 12));
        assert_eq!(start.plus_months(60), GameDate::new(2029, 1));
        assert_eq!(
            GameDate::new(2024, 11).plus_months(3),
            GameDate::new(2025, 2)
        );
    }

    #[test]
    fn quarters_close_every_third_month() {
        let closing: Vec<u8> = (1..=12)
            .filter(|month| GameDate::new(2024, *month).closes_a_quarter())
            .collect();
        assert_eq!(closing, vec![3, 6, 9, 12]);
        assert_eq!(GameDate::new(2024, 1).quarter(), 1);
        assert_eq!(GameDate::new(2024, 12).quarter(), 4);
    }
}
