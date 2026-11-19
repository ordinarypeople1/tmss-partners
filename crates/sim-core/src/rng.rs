//! SplitMix64. The state is one `u64`, so a save file carries it whole and a
//! reloaded game draws the same numbers the original would have.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng { state: seed }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `0..bound`. `bound` must be positive.
    pub fn below(&mut self, bound: u64) -> u64 {
        assert!(bound > 0, "bound must be positive");
        // Rejection sampling keeps the draw unbiased.
        let zone = u64::MAX - (u64::MAX % bound);
        loop {
            let draw = self.next_u64();
            if draw < zone {
                return draw % bound;
            }
        }
    }

    /// Uniform in `low..=high`.
    pub fn range(&mut self, low: i64, high: i64) -> i64 {
        assert!(low <= high, "range is empty");
        low + self.below((high - low) as u64 + 1) as i64
    }

    /// Roughly normal around zero with the given standard deviation. The sum
    /// of four uniforms: integer only, so every machine draws the same value.
    pub fn noise(&mut self, std: i64) -> i64 {
        if std <= 0 {
            return 0;
        }
        // Four uniforms on [-1, 1] have a standard deviation of sqrt(4/3).
        let span = std * 1_000;
        let sum: i64 = (0..4).map(|_| self.range(-span, span)).sum();
        sum * 866 / 1_000_000
    }

    /// True with probability `bps` / 10 000.
    pub fn chance_bps(&mut self, bps: u32) -> bool {
        self.below(10_000) < u64::from(bps)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_seed_draws_the_same_numbers() {
        let mut a = Rng::new(7);
        let mut b = Rng::new(7);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        assert_ne!(Rng::new(1).next_u64(), Rng::new(2).next_u64());
    }

    #[test]
    fn below_stays_in_range() {
        let mut rng = Rng::new(3);
        for _ in 0..1_000 {
            assert!(rng.below(7) < 7);
        }
    }

    #[test]
    fn chance_respects_its_ends() {
        let mut rng = Rng::new(5);
        for _ in 0..200 {
            assert!(!rng.chance_bps(0));
            assert!(rng.chance_bps(10_000));
        }
    }
}
