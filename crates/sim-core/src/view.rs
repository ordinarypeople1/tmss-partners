//! What the screen is allowed to see. The save file holds every number; the
//! view holds back what the player has not earned. Before an NDA a company's
//! figures are ranges, and what diligence has not found is absent.

use serde::Serialize;
use serde_json::{json, Value};

use crate::company::{Company, DdStream, Owner};
use crate::deal::Offer;
use crate::market::{Stage, RIVAL_NAMES};
use crate::math::{mul_bps, mul_millis, ratio_millis};
use crate::portfolio::INITIATIVES;
use crate::world::World;

pub struct LeagueRow {
    /// `None` is the player's fund.
    pub house: Option<usize>,
    pub deals: u32,
    pub exits: u32,
    pub invested: i64,
    pub returned: i64,
    pub held: i64,
}

impl LeagueRow {
    pub fn multiple_millis(&self) -> i64 {
        if self.invested <= 0 {
            1_000
        } else {
            ratio_millis(self.returned + self.held, self.invested)
        }
    }
}

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
fn fog(value: i64, id: &str, salt: u64, sharp: bool) -> Value {
    let shift = (hash(id, salt) % 11) as i64;
    // Sector research halves the band.
    let (down, up) = if sharp {
        (94 - shift / 2, 109 - shift / 2)
    } else {
        (88 - shift, 118 - shift)
    };
    let low = two_figures(value * down / 100);
    let high = two_figures(value * up / 100);
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
            || self
                .deal_index(index)
                .is_some_and(|deal| self.deals[deal].has(stream))
    }

    fn sale_view(&self, index: usize) -> Value {
        if !self.process_visible(index) {
            return Value::Null;
        }
        let process = self.companies[index]
            .process
            .as_ref()
            .expect("visible process exists");
        let company_id = self.companies[index].id.clone();
        let open = process.stage != Stage::Preparing && process.stage != Stage::Exclusive;
        json!({
            "stage": process.stage,
            "months_left": process.months_left,
            "reason": process.reason,
            "rivals": if open { process.rivals.iter().map(|rival| json!(rival.bidder)).collect::<Vec<_>>() } else { Vec::new() },
            "bid_in": process.player_bid.is_some(),
            "final_round": process.final_round,
            "standing": if process.final_round {
                self.standing(index).map(|standing| json!({
                    "rank": standing.rank,
                    "bidders": standing.bidders,
                    "lead": fog(standing.lead_ev, &company_id, 7, true),
                }))
            } else {
                None
            },
            "my_bid": process.player_bid.as_ref().map(|bid| bid.ev),
            "bid_ceiling": self.bid_ceiling(index),
            "adviser": process.adviser,
            "format": process.format,
            "codename": process.codename,
            "invited": self.on_buyer_list(index),
            "round": if process.adviser.is_none() { 0 } else if process.stage == Stage::Bidding { 2 } else { 1 },
            "shortlisted": process.shortlisted,
            "seats": process.format.shortlist(),
            "first_round_closed": self.first_round_closed(index),
        })
    }

    fn row(&self, index: usize) -> Value {
        let company = &self.companies[index];
        let revealed = self.revealed(index);
        let sharp = self.insight.get(company.sector).copied().unwrap_or(0) > 0;
        let figure = |value: i64, salt: u64| {
            if revealed {
                exact(value)
            } else {
                fog(value, &company.id, salt, sharp)
            }
        };
        let alert = company
            .holding
            .as_ref()
            .is_some_and(|holding| holding.breaches > 0 || holding.strike)
            || (company.is_player_owned() && company.shortfall);
        // An owner says what they think about selling once they know the player a little.
        let intent = (company.relationship >= crate::sourcing::KNOWN_AT
            && !company.is_player_owned())
        .then(|| self.intent(index));
        let (step, block) = self.next_step(index);
        // The owner mentions a rival's proposal only to someone they know.
        let suitor = company
            .suitor
            .filter(|_| self.knows_owner(index))
            .map(|suitor| json!({ "house": suitor.house, "months_left": suitor.months_left }));
        json!({
            "i": index,
            "id": company.id,
            "suitor": suitor,
            "name": company.legal_name,
            "short": short_name(&company.legal_name),
            "sector": self.industries[company.sector].sector_id,
            "admin1": company.admin1,
            "country": company.country,
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
            "ev": self.value_seen(index),
            "alert": alert,
            "access": self.access(index),
            "intent": intent,
            "next": { "step": step, "block": block },
            "exiting": company.holding.as_ref().is_some_and(|holding| holding.exit.is_some()),
        })
    }

    /// Everything the shell draws each month.
    pub fn view(&self) -> Value {
        let nav = self.nav();
        let month = self.months_elapsed;
        let active: Vec<usize> = (0..self.companies.len())
            .filter(|index| self.companies[*index].is_active())
            .collect();
        let live = self.live_processes();
        let sectors: Vec<Value> = self
            .industries
            .iter()
            .enumerate()
            .map(|(sector, industry)| {
                let members: Vec<&Company> = active
                    .iter()
                    .map(|index| &self.companies[*index])
                    .filter(|c| c.sector == sector)
                    .collect();
                let mut multiples: Vec<i64> = members
                    .iter()
                    .map(|company| company.multiple_millis(industry, &self.economy))
                    .collect();
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
                "street": self.street,
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
                "associates": self.career.associates,
                "gp_commit": self.career.gp_commit,
                "perks": self.career.perks,
            },
            "attention": { "left": self.attention_left, "max": self.attention_max() },
            "valuation_fee": self.valuation_fee(),
            "options": self.options,
            "insight": self.insight,
            "league": self.league(),
            "partners": self.partner_trust.iter().map(|trust| json!({ "trust": trust })).collect::<Vec<_>>(),
            "lps": self.lps,
            "next_fund_estimate": self.next_fund_size(false),
            "objectives": self.objectives.iter().map(|objective| json!({
                "kind": objective.kind,
                "target": objective.target,
                "progress": self.objective_progress(objective),
                "met": self.objective_met(objective),
            })).collect::<Vec<_>>(),
            "achievements": self.achievements,
            "records": self.records,
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
                "bloc_growth_bps": self.economy.bloc_growth_bps,
                "bloc_multiple_bps": self.economy.bloc_multiple_bps,
                "uncertainty": self.economy.uncertainty,
                "bloc_tax_delta_bps": self.economy.bloc_tax_delta_bps,
                "bloc_approval_drag_bps": self.economy.bloc_approval_drag_bps,
                "trade_drag_bps": self.economy.trade_drag_bps,
                "energy_shock_bps": self.economy.energy_shock_bps,
                "bloc_policy_rate_bps": self.economy.bloc_policy_rate_bps,
                "bloc_neutral_bps": (0..crate::macro_events::BLOC_COUNT).map(|index| self.economy.neutral_for_bloc(index)).collect::<Vec<_>>(),
            },
            "calendar": self.calendar_view(),
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
            "advisers": crate::advisers::ADVISER_BOOK.iter().enumerate().map(|(id, adviser)| json!({
                "name": adviser.name,
                "tier": adviser.tier,
                "focus": adviser.focus,
                "coverage": self.coverage(id as u8),
                "banker": self.banker_json(id as u8),
            })).collect::<Vec<_>>(),
            "cover_talk": self.cover_talk,
            "coverage_marks": [crate::advisers::LIST_AT, crate::advisers::FAVOUR_AT, crate::advisers::HEADS_UP_AT],
            "companies": active.iter().map(|index| self.row(*index)).collect::<Vec<_>>(),
            "deals": self.deals.iter().map(|deal| deal.company).collect::<Vec<_>>(),
            "messages": self.messages,
        })
    }

    /// Every house by gross multiple: what it has taken out plus what it still
    /// holds at model value, over what it has put in. The player's fund is one row.
    pub fn league_rows(&self) -> Vec<LeagueRow> {
        let mut rows: Vec<LeagueRow> = Vec::new();
        for (house, record) in self.houses.iter().enumerate() {
            let held: i64 = self
                .companies
                .iter()
                .filter(|company| matches!(company.owner, Owner::Sponsor { house: owner, .. } if owner as usize == house))
                .map(|company| company.model_equity(&self.industries[company.sector], &self.economy).max(0))
                .sum();
            rows.push(LeagueRow {
                house: Some(house),
                deals: record.deals,
                exits: record.exits,
                invested: record.invested,
                returned: record.returned,
                held,
            });
        }
        let realized_cost: i64 = self.fund.realized.iter().map(|item| item.cost).sum();
        let realized: i64 = self.fund.realized.iter().map(|item| item.proceeds).sum();
        let live_dividends: i64 = self
            .companies
            .iter()
            .filter(|company| company.is_player_owned())
            .filter_map(|company| company.holding.as_ref())
            .map(|holding| holding.dividends)
            .sum();
        rows.push(LeagueRow {
            house: None,
            deals: self.career.deals_closed,
            exits: self.career.exits,
            invested: realized_cost + self.invested_cost(),
            returned: realized + live_dividends,
            held: self.nav(),
        });
        // A house that has put nothing in has no multiple; it sorts as 1.0x.
        rows.sort_by_key(|row| std::cmp::Reverse(row.multiple_millis()));
        rows
    }

    fn league(&self) -> Value {
        json!(self
            .league_rows()
            .iter()
            .enumerate()
            .map(|(rank, row)| json!({
                "rank": rank + 1,
                "house": row.house,
                "deals": row.deals,
                "exits": row.exits,
                "invested": row.invested,
                "returned": row.returned,
                "held": row.held,
                "multiple_millis": row.multiple_millis(),
            }))
            .collect::<Vec<_>>())
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
        detail.insert(
            "approach".into(),
            json!({
                "odds_pct": if company.relationship >= self.proposal_threshold(index) { json!(self.approach_odds(index)) } else { Value::Null },
                "cooldown": company.approach_cooldown,
                "known_at": crate::sourcing::KNOWN_AT,
                "early_notice_at": self.early_notice_threshold(),
                "proposal_at": self.proposal_threshold(index),
            }),
        );
        detail.insert("country".into(), json!(company.country));
        detail.insert("pending".into(), json!(company.pending));
        detail.insert("executive".into(), self.executive_json(index));
        detail.insert(
            "sector_multiple_millis".into(),
            json!(industry.base_multiple_millis),
        );
        detail.insert(
            "union_strength_bps".into(),
            json!(company.union_strength_bps),
        );
        detail.insert(
            "management".into(),
            if self.knows(index, DdStream::Operational) {
                json!(company.management)
            } else {
                Value::Null
            },
        );
        let country = company.country.as_str();
        detail.insert(
            "local_credit".into(),
            json!({
                "policy_rate_bps": self.economy.policy_rate_for(country),
                "neutral_bps": self.economy.neutral_for(country),
                "max_senior_millis": self.economy.max_senior_for(country),
                "senior_rate_bps": self.economy.senior_rate_for(country),
            }),
        );
        detail.insert(
            "exposure".into(),
            if self.knows(index, DdStream::Commercial) {
                json!(company.exposure)
            } else {
                Value::Null
            },
        );
        detail.insert(
            "customer_concentration_bps".into(),
            if self.knows(index, DdStream::Commercial) {
                json!(company.customer_concentration_bps)
            } else {
                Value::Null
            },
        );
        let issues: Vec<Value> = company
            .issues
            .iter()
            .filter(|issue| issue.found || issue.triggered)
            .map(|issue| json!({ "kind": issue.kind, "stream": issue.kind.stream(), "severity_bps": issue.severity_bps, "found": issue.found, "triggered": issue.triggered }))
            .collect();
        detail.insert("issues".into(), json!(issues));
        // One trait is common knowledge; the rest come with the data room.
        let known = if revealed { company.traits.len() } else { 1 };
        detail.insert(
            "traits".into(),
            json!(company.traits.iter().take(known).collect::<Vec<_>>()),
        );
        detail.insert("traits_hidden".into(), json!(company.traits.len() - known));
        detail.insert("product".into(), json!(company.product));
        let met = company.relationship > 0 || revealed;
        detail.insert(
            "ceo".into(),
            json!({
                "name": company.ceo.name,
                "age": company.ceo.age,
                "tenure": company.ceo.tenure,
                "founder": company.ceo.founder,
                "feminine": company.ceo.feminine,
                "style": if met { json!(company.ceo.style) } else { Value::Null },
            }),
        );
        detail.insert(
            "stance".into(),
            if company.relationship >= 40 || self.deal_index(index).is_some() {
                json!(company.stance)
            } else {
                Value::Null
            },
        );
        let held = company.is_player_owned();
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
                    // The model's numbers are the fund's mark on its own holdings, and nobody's business before that.
                    "multiple_millis": held.then(|| company.multiple_millis(industry, &self.economy)),
                    "quality_bps": held.then(|| company.quality_bps(industry)),
                    "model_ev": held.then(|| self.model_ev(index)),
                    "model_equity": held.then(|| company.model_equity(industry, &self.economy)),
                    "min_cash": company.min_cash(industry),
                    "revenue_history": company.revenue_history,
                    "ebitda_history": company.ebitda_history,
                    "fcf_history": company.fcf_history,
                    "statements": statements(company),
                }),
            );
        }
        if let Some(deal_index) = self.deal_index(index) {
            let deal = &self.deals[deal_index];
            let preview = deal
                .offer
                .as_ref()
                .map(|offer| self.offer_view(index, offer));
            detail.insert(
                "deal".into(),
                json!({
                    "opened": deal.opened,
                    "streams_done": deal.streams_done,
                    "streams_running": deal.streams_running,
                    "valuation": deal.valuation,
                    "valuation_order": deal.valuation_order,
                    "ic_meeting": deal.ic_meeting,
                    "ic_record": deal.ic_record,
                    "ic_conditions": deal.ic_conditions,
                    "reports": deal.reports,
                    "ic_facts": self.ic_facts(index),
                    "costs": deal.costs,
                    "diligence_cost": self.diligence_cost(index),
                    "offer": deal.offer,
                    "preview": preview,
                    "committee": deal.ic,
                    "bid_submitted": deal.bid_submitted,
                    "certainty_bps": self.certainty_bps(index),
                    "can_roll": matches!(company.owner, Owner::Founder { .. }),
                    "coinvest": deal.coinvest,
                    "approved_ev": deal.approved_ev,
                    "indication": deal.indication,
                    "lock": self.active_lock(index),
                    "lock_fee": self.lock_fee(index),
                    "open_streams": crate::company::DD_STREAMS.iter().filter(|stream| self.stream_open(index, **stream)).collect::<Vec<_>>(),
                }),
            );
        }
        if let (true, Some(holding)) = (company.is_player_owned(), &company.holding) {
            let value = self.holding_value(index);
            let ebitda = company.ttm_ebitda();
            let multiple = company.multiple_millis(industry, &self.economy);
            let own = holding.ownership_bps;
            let entry_equity = mul_bps(holding.entry_ev - holding.entry_net_debt, own);
            let from_ebitda = mul_bps(
                mul_millis(ebitda - holding.entry_ebitda, holding.entry_multiple_millis),
                own,
            );
            let from_multiple = mul_bps(
                mul_millis(ebitda, multiple - holding.entry_multiple_millis),
                own,
            );
            let from_debt = value - entry_equity - from_ebitda - from_multiple;
            let mut flows = holding.flows.clone();
            flows.push((self.months_elapsed, value));
            let available: Vec<Value> = INITIATIVES
                .iter()
                .filter(|kind| {
                    !holding.done.contains(kind)
                        && !holding.initiatives.iter().any(|item| item.kind == **kind)
                })
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
                            || (matches!(candidate.owner, Owner::Founder { .. })
                                && candidate.relationship >= 50))
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
                    "hedge": holding.hedge,
                    "hedge_quote": self.hedge_quote(index),
                    "base_rate_bps": company.base_rate_bps(&self.economy),
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
        // The screen compares the price with the fund's valuation, never with the model.
        let mut financing = serde_json::to_value(self.financing(index, offer)).unwrap_or(Value::Null);
        let valued = self
            .deal_index(index)
            .and_then(|deal| self.deals[deal].valuation.as_ref())
            .map(|valuation| crate::math::ratio_bps(offer.ev, valuation.mid.max(1)));
        financing["price_to_model_bps"] = json!(valued.unwrap_or(10_000));
        json!({
            "financing": financing,
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

/// The legal forms a name can end in, longest first.
const LEGAL_FORMS: [&str; 12] = [
    " GmbH & Co. KG",
    " Group Ltd",
    " Co., Ltd.",
    " GmbH",
    " Corp.",
    " Inc.",
    " K.K.",
    " LLC",
    " Ltd",
    " SAS",
    " Co.",
    " SA",
];

/// The name people say: the legal name without its legal form. Lists and tables show this.
pub fn short_name(legal: &str) -> &str {
    LEGAL_FORMS
        .iter()
        .find_map(|form| legal.strip_suffix(form))
        .unwrap_or(legal)
}

#[cfg(test)]
mod short_name_tests {
    use super::short_name;

    #[test]
    fn the_legal_form_is_dropped() {
        assert_eq!(
            short_name("Brunnhaus Millwork GmbH & Co. KG"),
            "Brunnhaus Millwork"
        );
        assert_eq!(
            short_name("Halcyon Testing Labs Corp."),
            "Halcyon Testing Labs"
        );
        assert_eq!(short_name("Pennington Kitchens Ltd"), "Pennington Kitchens");
        assert_eq!(short_name("Plain Name"), "Plain Name");
    }
}

/// The three statements for one period, with the subtotals written out.
fn period_json(period: &crate::ledger::Period) -> Value {
    let books = &period.books;
    json!({
        "year": period.year,
        "quarter": period.quarter,
        "months": period.months,
        "income": {
            "revenue": period.revenue,
            "cogs": period.cogs,
            "gross_profit": period.gross_profit(),
            "sga": period.sga,
            "ebitda": period.ebitda,
            "da": period.da,
            "ebit": period.ebit(),
            "interest": period.interest,
            "ebt": period.ebt(),
            "tax": period.tax,
            "net_income": period.net_income,
        },
        "balance": {
            "cash": books.cash,
            "receivables": books.accounts_receivable,
            "inventory": books.inventory,
            "net_ppe": books.net_ppe(),
            "goodwill": books.goodwill,
            "total_assets": books.total_assets(),
            "payables": books.accounts_payable,
            "debt": books.debt,
            "total_liabilities": books.total_liabilities(),
            "share_capital": books.share_capital,
            "retained_earnings": books.retained_earnings,
            "total_equity": books.total_equity(),
        },
        "cashflow": {
            "net_income": period.net_income,
            "da": period.da,
            "change_in_nwc": -period.change_in_nwc,
            "operating": period.cash_from_operations(),
            "capex": -period.capex,
            "free_cash_flow": period.free_cash_flow(),
            "debt_net": period.debt_draw - period.debt_repayment,
            "dividends": -period.dividends,
            "other": period.other_financing(),
            "net_change": period.closing_cash - period.opening_cash,
            "closing_cash": period.closing_cash,
        },
    })
}

/// Fiscal years (up to five, oldest first), the last twelve months, and the
/// last eight quarters: the layout a PE or banking model starts from.
fn statements(company: &Company) -> Value {
    let years = company.fiscal_years();
    let years: Vec<Value> = years[years.len().saturating_sub(5)..].iter().map(period_json).collect();
    let quarters: Vec<Value> = company.ledger[company.ledger.len().saturating_sub(8)..]
        .iter()
        .map(period_json)
        .collect();
    json!({
        "years": years,
        "ltm": company.last_twelve_months().as_ref().map(period_json),
        "quarters": quarters,
    })
}

impl World {
    /// The value the player may see: the mark on a holding, the range of a
    /// valuation they ordered, or nothing.
    pub fn value_seen(&self, company: usize) -> Value {
        if self.companies[company].is_player_owned() {
            let ev = self.model_ev(company);
            return json!([ev, ev]);
        }
        match self
            .deal_index(company)
            .and_then(|index| self.deals[index].valuation.as_ref())
        {
            Some(valuation) => json!([valuation.low, valuation.high]),
            None => Value::Null,
        }
    }
}

impl World {
    /// The figures the partners quote in their questions, for the offer on the table.
    fn ic_facts(&self, company: usize) -> Value {
        let Some(index) = self.deal_index(company) else {
            return Value::Null;
        };
        let deal = &self.deals[index];
        let Some(offer) = deal.offer.as_ref() else {
            return Value::Null;
        };
        let financing = self.financing(company, offer);
        let returns = self.project_returns(company, offer);
        let target = &self.companies[company];
        let missing: Vec<DdStream> = crate::company::DD_STREAMS
            .iter()
            .copied()
            .filter(|stream| !deal.has(*stream))
            .collect();
        let issues: Vec<_> = target.issues.iter().filter(|issue| issue.found).map(|issue| issue.kind).collect();
        json!({
            "ev": offer.ev,
            "leverage_millis": financing.leverage_millis,
            "cover_millis": financing.cover_millis,
            "multiple_millis": financing.multiple_millis,
            "price_bps": deal.valuation.as_ref().map(|valuation| crate::math::ratio_bps(offer.ev, valuation.mid.max(1))),
            "irr_bps": returns.irr_bps,
            "equity": financing.equity,
            "limit": self.fund.concentration_limit(),
            "missing": missing,
            "issues": issues,
            "plan": offer.plan.len(),
            "union_bps": target.union_strength_bps,
            "phase": self.economy.phase,
        })
    }
}

impl World {
    fn banker_json(&self, adviser: u8) -> Value {
        let (name, feminine) = self.banker(adviser);
        json!({ "name": name, "feminine": feminine })
    }
}

/// Who meets the fund before the owner will: a senior executive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutiveRole {
    Cfo,
    Coo,
    Strategy,
}

impl World {
    /// The executive who takes the fund's first meetings at a company. The same
    /// person all game, named for the company's country.
    fn executive_json(&self, company: usize) -> Value {
        let mut rng = crate::rng::Rng::new(self.seed ^ (company as u64 + 1).wrapping_mul(0xD6E8_FEB8_6659_FD93));
        let (name, feminine) = crate::people::name(&mut rng, &self.companies[company].country);
        let role = [ExecutiveRole::Cfo, ExecutiveRole::Coo, ExecutiveRole::Strategy][rng.below(3) as usize];
        json!({ "name": name, "feminine": feminine, "role": role })
    }
}

impl World {
    /// The macro calendar as the player may see it: every scheduled release,
    /// a consensus only for the open month (and the polls for elections), and
    /// results only once a month has closed.
    fn calendar_view(&self) -> Value {
        use crate::macro_events::MacroKind;
        let calendar = &self.macro_calendar;
        let events: Vec<Value> = calendar
            .events
            .iter()
            .map(|event| {
                let kind: MacroKind = event.kind;
                json!({
                    "id": event.id,
                    "kind": kind,
                    "bloc": event.bloc(),
                    "target": event.target,
                    "breaking": event.breaking,
                    "measure": event.measure,
                    "race": kind.race(),
                    "call": event.call,
                    "exposed": self.holdings_exposed_to(event),
                    "category": kind.category(),
                    "unit": kind.unit(),
                    "importance": kind.importance(),
                    "sectors": kind.sectors(),
                    "date": event.date,
                    "day": event.day,
                    "consensus": event.consensus,
                    "range": event.range,
                    "previous": event.previous,
                    "actual": event.actual,
                    "surprise_centi": event.surprise_centi,
                    "stance": event.stance,
                    "upset": event.upset,
                    "effects": event.effects,
                })
            })
            .collect();
        json!({
            "events": events,
            "races": calendar.races,
        })
    }
}
