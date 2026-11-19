//! What the screen is allowed to see. The save file holds every number; the
//! view holds back what the player has not earned. Before an NDA a company's
//! figures are ranges, and what diligence has not found is absent.

use serde_json::{json, Value};

use crate::company::{Company, DdStream, Owner};
use crate::deal::Offer;
use crate::market::{Stage, RIVAL_NAMES};
use crate::math::{mul_bps, mul_millis, ratio_millis};
use crate::portfolio::INITIATIVES;
use crate::world::World;

fn hash(text: &str, salt: u64) -> u64 {
    let mut value: u64 = 0xcbf2_9ce4_8422_2325 ^ salt;
    for byte in text.bytes() {
        value ^= u64::from(byte);
        value = value.wrapping_mul(0x0000_0100_0000_01b3);
    }
    value
}

fn two_figures(value: i64) -> i64 {
    let mut scale = 1;
    while (value / scale).abs() >= 100 {
        scale *= 10;
    }
    value / scale * scale
}

/// A range around the truth. The same company always shows the same range
/// for the same figure, so the band itself leaks nothing new on a reload.
fn fog(value: i64, id: &str, salt: u64) -> Value {
    let shift = (hash(id, salt) % 11) as i64;
    let low = two_figures(value * (88 - shift) / 100);
    let high = two_figures(value * (118 - shift) / 100);
    json!([low.min(high), low.max(high)])
}

fn exact(value: i64) -> Value {
    json!([value, value])
}

impl World {
    /// Whether the player sees this company's real figures.
    fn revealed(&self, index: usize) -> bool {
        self.companies[index].is_player_owned() || self.deal_index(index).is_some()
    }

    fn knows(&self, index: usize, stream: DdStream) -> bool {
        self.companies[index].is_player_owned()
            || self.deal_index(index).is_some_and(|deal| self.deals[deal].has(stream))
    }

    fn sale_view(&self, index: usize) -> Value {
        if !self.process_visible(index) {
            return Value::Null;
        }
        let process = self.companies[index].process.as_ref().expect("visible process exists");
        let open = process.stage != Stage::Preparing && process.stage != Stage::Exclusive;
        json!({
            "stage": process.stage,
            "months_left": process.months_left,
            "reason": process.reason,
            "rivals": if open { process.rivals.iter().map(|rival| json!(rival.bidder)).collect::<Vec<_>>() } else { Vec::new() },
            "bid_in": process.player_bid.is_some(),
        })
    }

    fn row(&self, index: usize) -> Value {
        let company = &self.companies[index];
        let revealed = self.revealed(index);
        let figure = |value: i64, salt: u64| if revealed { exact(value) } else { fog(value, &company.id, salt) };
        let alert = company.holding.as_ref().is_some_and(|holding| holding.breaches > 0 || holding.strike)
            || (company.is_player_owned() && company.shortfall);
        json!({
            "i": index,
            "id": company.id,
            "name": company.legal_name,
            "sector": self.industries[company.sector].sector_id,
            "admin1": company.admin1,
            "lat": company.lat,
            "lon": company.lon,
            "owner": company.owner,
            "founded": company.founded_year,
            "employees": company.employees,
            "relationship": company.relationship,
            "watched": company.watched,
            "held": company.is_player_owned(),
            "in_deal": self.deal_index(index).is_some(),
            "revealed": revealed,
            "sale": self.sale_view(index),
            "revenue": figure(company.ttm_revenue(), 1),
            "ebitda": figure(company.ttm_ebitda(), 2),
            "ev": figure(self.model_ev(index), 3),
            "alert": alert,
            "exiting": company.holding.as_ref().is_some_and(|holding| holding.exit.is_some()),
        })
    }

    /// Everything the shell draws each month.
    pub fn view(&self) -> Value {
        let nav = self.nav();
        let month = self.months_elapsed;
        let active: Vec<usize> = (0..self.companies.len()).filter(|index| self.companies[*index].is_active()).collect();
        let live = self.live_processes();
        let sectors: Vec<Value> = self
            .industries
            .iter()
            .enumerate()
            .map(|(sector, industry)| {
                let members: Vec<&Company> =
                    active.iter().map(|index| &self.companies[*index]).filter(|c| c.sector == sector).collect();
                let mut multiples: Vec<i64> =
                    members.iter().map(|company| company.multiple_millis(industry, &self.economy)).collect();
                multiples.sort_unstable();
                json!({
                    "id": industry.sector_id,
                    "cycle_bps": self.economy.sector_cycle_bps[sector],
                    "amplitude_bps": industry.cycle_amplitude_bps,
                    "multiple_millis": multiples.get(multiples.len() / 2).copied().unwrap_or(0),
                    "companies": members.len(),
                    "revenue": members.iter().map(|company| company.ttm_revenue()).sum::<i64>(),
                    "for_sale": members.iter().filter(|company| company.process.is_some()).count(),
                })
            })
            .collect();
        json!({
            "date": self.date,
            "month": month,
            "seed": self.seed,
            "house": if self.own_house { "own" } else { "poiesis" },
            "career": {
                "rank": self.career.rank,
                "reputation": self.career.reputation,
                "months_at_rank": self.career.months_at_rank,
                "deals_closed": self.career.deals_closed,
                "exits": self.career.exits,
                "best_moic_millis": self.career.best_moic_millis,
                "wealth": self.career.wealth,
                "carry_share_bps": self.career.rank.carry_share_bps(),
                "carry_accrued": mul_bps(self.fund.carry(nav, month), self.career.rank.carry_share_bps()),
                "carry_paid": self.career.carry_paid,
                "salary": self.career.rank.salary(),
                "fired": self.career.fired,
            },
            "attention": { "left": self.attention_left, "max": self.career.rank.attention() },
            "limits": {
                "deals": self.career.rank.max_live_deals(),
                "initiatives": self.career.rank.max_initiatives(),
            },
            "economy": {
                "policy_rate_bps": self.economy.policy_rate_bps,
                "neutral_rate_bps": self.economy.neutral_rate_bps,
                "phase": self.economy.phase,
                "phase_months": self.economy.phase_months,
                "credit_spread_bps": self.economy.credit_spread_bps,
                "valuation_index": self.economy.valuation_index(),
                "max_senior_millis": self.economy.max_senior_millis(),
                "max_mezz_millis": self.economy.max_mezz_millis(),
                "senior_rate_bps": self.economy.senior_rate_bps(),
                "mezz_rate_bps": self.economy.mezz_rate_bps(),
                "history": self.economy.history,
                "sectors": sectors,
            },
            "fund": {
                "name": self.fund.name,
                "committed": self.fund.committed,
                "called": self.fund.called,
                "uncalled": self.fund.uncalled(),
                "distributed": self.fund.distributed,
                "fees_paid": self.fund.fees_paid,
                "deal_costs": self.fund.deal_costs,
                "invested": self.invested_cost(),
                "pending": self.fund.pending_total(),
                "nav": nav,
                "dpi_millis": self.fund.dpi_millis(),
                "tvpi_millis": self.fund.tvpi_millis(nav),
                "irr_bps": self.fund.net_irr_bps(nav, month),
                "carry": self.fund.carry(nav, month),
                "investing": self.fund.investing(self.date),
                "started": self.fund.started,
                "investment_period_ends": self.fund.investment_period_ends,
                "term_ends": self.fund.term_ends,
                "concentration_limit": self.fund.concentration_limit(),
                "realized": self.fund.realized,
            },
            "market": {
                "companies": active.len(),
                "live": live,
                "visible": active.iter().filter(|index| self.process_visible(**index)).count(),
            },
            "rivals": RIVAL_NAMES,
            "companies": active.iter().map(|index| self.row(*index)).collect::<Vec<_>>(),
            "deals": self.deals.iter().map(|deal| deal.company).collect::<Vec<_>>(),
            "messages": self.messages,
        })
    }

    /// One company in full, as far as the player may see it.
    pub fn company_view(&self, index: usize) -> Value {
        let Some(company) = self.companies.get(index) else {
            return Value::Null;
        };
        let industry = &self.industries[company.sector];
        let revealed = self.revealed(index);
        let mut view = self.row(index);
        let detail = view.as_object_mut().expect("row is an object");
        detail.insert("site_name".into(), json!(company.site_name));
        detail.insert("country".into(), json!(company.country));
        detail.insert("sector_multiple_millis".into(), json!(industry.base_multiple_millis));
        detail.insert("union_strength_bps".into(), json!(company.union_strength_bps));
        detail.insert(
            "management".into(),
            if self.knows(index, DdStream::Operational) { json!(company.management) } else { Value::Null },
        );
        detail.insert(
            "customer_concentration_bps".into(),
            if self.knows(index, DdStream::Commercial) { json!(company.customer_concentration_bps) } else { Value::Null },
        );
        let issues: Vec<Value> = company
            .issues
            .iter()
            .filter(|issue| issue.found || issue.triggered)
            .map(|issue| json!({ "kind": issue.kind, "stream": issue.kind.stream(), "severity_bps": issue.severity_bps, "found": issue.found, "triggered": issue.triggered }))
            .collect();
        detail.insert("issues".into(), json!(issues));
        if revealed {
            detail.insert(
                "financials".into(),
                json!({
                    "last": company.last,
                    "books": company.books,
                    "net_ppe": company.books.net_ppe(),
                    "total_assets": company.books.total_assets(),
                    "total_equity": company.books.total_equity(),
                    "ttm_revenue": company.ttm_revenue(),
                    "ttm_ebitda": company.ttm_ebitda(),
                    "ttm_fcf": company.ttm_fcf(),
                    "margin_bps": company.ebitda_margin_bps(),
                    "gross_margin_bps": company.gross_margin_bps,
                    "growth_bps": company.growth_bps,
                    "net_debt": company.net_debt(),
                    "leverage_millis": company.leverage_millis(),
                    "cover_millis": company.interest_cover_millis(&self.economy),
                    "interest_rate_bps": company.interest_rate_bps(&self.economy),
                    "multiple_millis": company.multiple_millis(industry, &self.economy),
                    "quality_bps": company.quality_bps(industry),
                    "model_ev": self.model_ev(index),
                    "model_equity": company.model_equity(industry, &self.economy),
                    "min_cash": company.min_cash(industry),
                    "revenue_history": company.revenue_history,
                    "ebitda_history": company.ebitda_history,
                    "fcf_history": company.fcf_history,
                }),
            );
        }
        if let Some(deal_index) = self.deal_index(index) {
            let deal = &self.deals[deal_index];
            let preview = deal.offer.as_ref().map(|offer| self.offer_view(index, offer));
            detail.insert(
                "deal".into(),
                json!({
                    "opened": deal.opened,
                    "streams_done": deal.streams_done,
                    "streams_running": deal.streams_running,
                    "costs": deal.costs,
                    "diligence_cost": self.diligence_cost(index),
                    "offer": deal.offer,
                    "preview": preview,
                    "committee": deal.ic,
                    "bid_submitted": deal.bid_submitted,
                    "certainty_bps": self.certainty_bps(index),
                    "can_roll": matches!(company.owner, Owner::Founder { .. }),
                }),
            );
        }
        if let (true, Some(holding)) = (company.is_player_owned(), &company.holding) {
            let value = self.holding_value(index);
            let ebitda = company.ttm_ebitda();
            let multiple = company.multiple_millis(industry, &self.economy);
            let own = holding.ownership_bps;
            let entry_equity = mul_bps(holding.entry_ev - holding.entry_net_debt, own);
            let from_ebitda = mul_bps(mul_millis(ebitda - holding.entry_ebitda, holding.entry_multiple_millis), own);
            let from_multiple = mul_bps(mul_millis(ebitda, multiple - holding.entry_multiple_millis), own);
            let from_debt = value - entry_equity - from_ebitda - from_multiple;
            let mut flows = holding.flows.clone();
            flows.push((self.months_elapsed, value));
            let available: Vec<Value> = INITIATIVES
                .iter()
                .filter(|kind| !holding.done.contains(kind) && !holding.initiatives.iter().any(|item| item.kind == **kind))
                .map(|kind| {
                    json!({
                        "kind": kind,
                        "months": kind.months(),
                        "cost": mul_bps(company.ttm_revenue(), kind.cost_bps()),
                        "planned": holding.plan.contains(kind),
                    })
                })
                .collect();
            let targets: Vec<usize> = (0..self.companies.len())
                .filter(|other| {
                    let candidate = &self.companies[*other];
                    *other != index
                        && candidate.is_active()
                        && !candidate.is_player_owned()
                        && candidate.sector == company.sector
                        && candidate.ttm_ebitda() <= ebitda
                        && (self.process_visible(*other)
                            || (matches!(candidate.owner, Owner::Founder { .. }) && candidate.relationship >= 50))
                })
                .collect();
            detail.insert(
                "holding".into(),
                json!({
                    "acquired": holding.acquired,
                    "months_held": self.months_elapsed - holding.acquired_month,
                    "entry_ev": holding.entry_ev,
                    "entry_ebitda": holding.entry_ebitda,
                    "entry_multiple_millis": holding.entry_multiple_millis,
                    "entry_net_debt": holding.entry_net_debt,
                    "entry_equity": entry_equity,
                    "cost": holding.cost,
                    "ownership_bps": own,
                    "dividends": holding.dividends,
                    "value": value,
                    "moic_millis": ratio_millis(value + holding.dividends, holding.cost),
                    "irr_bps": crate::math::irr_bps(&flows),
                    "bridge": { "ebitda": from_ebitda, "multiple": from_multiple, "debt": from_debt },
                    "max_leverage_millis": holding.max_leverage_millis,
                    "min_cover_millis": holding.min_cover_millis,
                    "maturity": holding.maturity,
                    "breaches": holding.breaches,
                    "waiver_quarters": holding.waiver_quarters,
                    "strike": holding.strike,
                    "plan": holding.plan,
                    "initiatives": holding.initiatives.iter().map(|item| json!({ "kind": item.kind, "months_left": item.months_left, "months": item.kind.months() })).collect::<Vec<_>>(),
                    "done": holding.done,
                    "available": available,
                    "exit": holding.exit.as_ref().map(|exit| json!({ "route": exit.route, "months_left": exit.months_left, "months": exit.route.months(), "offer_ev": exit.offer_ev })),
                    "marks": holding.marks,
                    "add_ons": holding.add_ons,
                    "add_on_targets": targets,
                    "budget": company.budget,
                    "shortfall": company.shortfall,
                }),
            );
        }
        view
    }

    fn offer_view(&self, index: usize, offer: &Offer) -> Value {
        json!({
            "financing": self.financing(index, offer),
            "returns": self.project_returns(index, offer),
            "reserve_hint": Value::Null,
        })
    }

    /// Sources, uses, and the base case for an offer the player is still shaping.
    pub fn preview_offer(&self, index: usize, offer: &Offer) -> Value {
        if index >= self.companies.len() || !self.revealed(index) {
            return Value::Null;
        }
        self.offer_view(index, offer)
    }
}
