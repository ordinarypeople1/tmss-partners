//! Counterparty response. A cleared price exists only when this accepts a bid.

use crate::SimError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Instrument {
    Common,
    Rcps,
    CbMezz,
    SeniorLoan,
    Buyout,
}

impl Instrument {
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "common" => Self::Common,
            "rcps" => Self::Rcps,
            "cb_mezz" => Self::CbMezz,
            "senior_loan" => Self::SeniorLoan,
            "buyout" => Self::Buyout,
            _ => return None,
        })
    }

    pub fn is_credit(self) -> bool {
        matches!(self, Self::CbMezz | Self::SeniorLoan)
    }

    pub fn is_control(self) -> bool {
        matches!(self, Self::Buyout)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SellerKind {
    Founder,
    Family,
    Conglomerate,
    PeExit,
    Court,
}

impl SellerKind {
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "founder" => Self::Founder,
            "family" => Self::Family,
            "conglomerate" => Self::Conglomerate,
            "pe_exit" => Self::PeExit,
            "court" => Self::Court,
            _ => return None,
        })
    }

    fn reserve_millis(self) -> i64 {
        match self {
            Self::Founder => 940,
            Self::Family => 960,
            Self::Conglomerate => 950,
            Self::PeExit => 1_030,
            Self::Court => 930,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Ioi,
    Loi,
    Binding,
}

impl Phase {
    fn floor_millis(self) -> i64 {
        match self {
            // An IOI can sit below the reserve and still open the process.
            Self::Ioi => 850,
            Self::Loi => 920,
            Self::Binding => 960,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Offer {
    pub bid_ev: i64,
    pub instrument: Instrument,
    pub preferred: Instrument,
    pub seller: SellerKind,
    pub board_seats: i32,
    pub earnout: i64,
    pub reputation: i64,
    pub competing_ev: i64,
    pub phase: Phase,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResponseKind {
    Accept,
    Counter { ev: i64 },
    Reject,
}

pub fn reserve_ev(offer: &Offer, ask_ev: i64) -> Result<i64, SimError> {
    if ask_ev <= 0 || offer.bid_ev < 0 || offer.earnout < 0 {
        return Err(SimError::Domain);
    }
    let mut reserve = ask_ev * offer.seller.reserve_millis() / 1_000;
    if offer.reputation < 500 {
        let penalty = (500 - offer.reputation) / 5;
        reserve = reserve * (1_000 + penalty) / 1_000;
    }
    if offer.instrument != offer.preferred {
        reserve = reserve * 1_040 / 1_000;
    }
    if offer.seller == SellerKind::Founder && offer.instrument != Instrument::Buyout && offer.board_seats > 2
    {
        reserve = reserve * 1_030 / 1_000;
    }
    match offer.seller {
        SellerKind::Founder => reserve -= offer.earnout / 2,
        SellerKind::PeExit => reserve += offer.earnout / 2,
        _ => {}
    }
    let reserve = reserve.max(1).max(offer.competing_ev);
    Ok(reserve)
}

pub fn counterparty_response(offer: &Offer, ask_ev: i64) -> Result<ResponseKind, SimError> {
    let reserve = reserve_ev(offer, ask_ev)?;
    let floor = reserve * offer.phase.floor_millis() / 1_000;
    if offer.bid_ev >= reserve {
        Ok(ResponseKind::Accept)
    } else if offer.bid_ev >= floor {
        let mid = (offer.bid_ev + reserve) / 2;
        Ok(ResponseKind::Counter { ev: mid.max(offer.bid_ev + 1) })
    } else {
        Ok(ResponseKind::Reject)
    }
}

pub fn credit_response(
    bid_size: i64,
    ask_size: i64,
    coupon_bps: i64,
    ask_coupon_bps: i64,
    reputation: i64,
) -> ResponseKind {
    if bid_size <= 0 || ask_size <= 0 {
        return ResponseKind::Reject;
    }
    let mut needed = ask_coupon_bps;
    if reputation < 500 {
        needed += (500 - reputation) / 10;
    }
    if bid_size >= ask_size * 80 / 100 && coupon_bps >= needed {
        ResponseKind::Accept
    } else if bid_size >= ask_size * 50 / 100 {
        ResponseKind::Counter { ev: ask_size }
    } else {
        ResponseKind::Reject
    }
}

/// Invite-only processes stay shut when the house reputation is thin.
pub fn access_allowed(access: &str, reputation: i64) -> bool {
    access != "invite" || reputation >= 450
}

/// Proprietary approach. Openness and reputation are on a 0–1000 scale.
pub fn approach_accepted(openness: i64, reputation: i64) -> bool {
    openness + (reputation - 500) / 5 >= 550
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offer(reputation: i64, bid: i64) -> Offer {
        Offer {
            bid_ev: bid,
            instrument: Instrument::Buyout,
            preferred: Instrument::Buyout,
            seller: SellerKind::Founder,
            board_seats: 1,
            earnout: 0,
            reputation,
            competing_ev: 0,
            phase: Phase::Binding,
        }
    }

    #[test]
    fn a_low_reputation_bid_is_answered_with_a_higher_counter() {
        let high = counterparty_response(&offer(800, 9_400), 10_000).unwrap();
        let low = counterparty_response(&offer(200, 9_700), 10_000).unwrap();
        assert_eq!(high, ResponseKind::Accept);
        match low {
            ResponseKind::Counter { ev } => assert!(ev > 9_400),
            other => panic!("expected counter, got {other:?}"),
        }
    }

    #[test]
    fn an_ioi_can_open_below_the_binding_reserve() {
        let mut soft = offer(800, 8_200);
        soft.phase = Phase::Ioi;
        assert!(matches!(
            counterparty_response(&soft, 10_000).unwrap(),
            ResponseKind::Counter { .. } | ResponseKind::Accept
        ));
        soft.phase = Phase::Binding;
        assert_eq!(
            counterparty_response(&soft, 10_000).unwrap(),
            ResponseKind::Reject
        );
    }

    #[test]
    fn a_competing_bid_sets_the_floor() {
        let mut bid = offer(800, 9_500);
        bid.competing_ev = 10_200;
        assert!(matches!(
            counterparty_response(&bid, 10_000).unwrap(),
            ResponseKind::Counter { .. } | ResponseKind::Reject
        ));
    }

    #[test]
    fn a_thin_reputation_lender_has_to_pay_a_higher_coupon() {
        assert_eq!(
            credit_response(5_000, 5_000, 750, 750, 800),
            ResponseKind::Accept
        );
        assert!(matches!(
            credit_response(5_000, 5_000, 750, 750, 200),
            ResponseKind::Counter { .. }
        ));
    }

    #[test]
    fn invite_access_and_proprietary_approach_follow_reputation() {
        assert!(!access_allowed("invite", 400));
        assert!(access_allowed("invite", 450));
        assert!(access_allowed("proprietary", 100));
        assert!(!approach_accepted(400, 400));
        assert!(approach_accepted(700, 620));
    }
}
