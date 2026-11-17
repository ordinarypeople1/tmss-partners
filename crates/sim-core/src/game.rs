//! Playable fund loop. React sends a command and paints the returned page.
//! It does not reimplement fees, closes, bids, or the waterfall.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::close::{close_quarter, Books, CloseAdjust, Drivers};
use crate::deal::{
    access_allowed, approach_accepted, counterparty_response, credit_response, Instrument, Offer,
    Phase, ResponseKind, SellerKind,
};
use crate::fees::{dpi_millis, quarterly_management_fee, transaction_cost, tvpi_millis};
use crate::lbo::{covenants_breached, interest_cover_millis, leverage_millis, sources_and_uses};
use crate::news::{push_news, Alert, NewsItem};
use crate::round::mul_div;
use crate::{enterprise_value, equity_value, SimError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Clock {
    pub year: i32,
    pub quarter: i32,
    pub week_in_quarter: i32,
    pub absolute_week: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name_ko: String,
    pub kind: String,
    pub subtype: String,
    pub commitment: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub id: String,
    pub name_ko: String,
    pub trait_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Site {
    pub id: String,
    pub kind: String,
    pub name_ko: String,
    pub lat: f64,
    pub lon: f64,
    pub book_value: i64,
    pub capacity: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapRow {
    pub holder_ko: String,
    pub holder_kind: String,
    pub stake_bps: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manager {
    pub id: String,
    pub name_ko: String,
    pub role: String,
    pub trait_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Company {
    pub id: String,
    #[serde(default)]
    pub name_ko: String,
    pub legal_name_ko: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub subindustry_id: String,
    pub sector_id: String,
    pub region_label_ko: String,
    pub complex_name_ko: String,
    pub lat: f64,
    pub lon: f64,
    pub founded_year: i64,
    pub employees: i64,
    pub owner_kind: String,
    pub owner_openness: i64,
    pub approach_stage: String,
    pub approach_instrument: String,
    pub quarter_index: i64,
    pub drivers: Drivers,
    pub books: Books,
    pub sites: Vec<Site>,
    pub cap: Vec<CapRow>,
    pub management: Vec<Manager>,
    #[serde(default)]
    pub generated: Vec<Books>,
    #[serde(default)]
    pub pending_sale: i64,
    #[serde(default)]
    pub pending_sga: i64,
    /// Absolute week when diligence finishes. 0 means it has not started.
    #[serde(default)]
    pub dd_ready_week: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Terms {
    pub instrument: String,
    pub bid_ev: i64,
    pub bid_size: i64,
    pub ownership_bps: i64,
    pub coupon_bps: i64,
    pub pref_millis: i64,
    pub board_seats: i32,
    pub covenants: bool,
    pub drag: bool,
    pub tag: bool,
    pub earnout: i64,
    pub debt: i64,
    pub debt_rate_bps: i64,
    pub covenant_lev_millis: i64,
    pub covenant_cover_millis: i64,
    pub si_id: String,
    pub si_equity: i64,
    pub hundred_day_plan: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DealLog {
    pub template: String,
    pub week: i64,
    pub ev: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IcVote {
    pub partner: String,
    pub yes: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deal {
    pub id: String,
    pub company_id: String,
    pub stage: String,
    pub process: String,
    pub access: String,
    pub seller_kind: String,
    pub broker_id: String,
    pub instrument: String,
    pub ask_ev: i64,
    pub ask_size: i64,
    pub ask_coupon_bps: i64,
    pub weeks_left: i64,
    pub status: String,
    pub competing_ev: i64,
    pub competitor_ko: String,
    pub raised: bool,
    pub rejects: i32,
    pub conditions: bool,
    pub ic_bid_ev: i64,
    pub terms: Terms,
    pub log: Vec<DealLog>,
    pub ic: Vec<IcVote>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Holding {
    pub company_id: String,
    pub deal_id: String,
    pub instrument: String,
    pub ownership_bps: i64,
    pub cost: i64,
    pub principal: i64,
    pub coupon_bps: i64,
    pub board_seats: i32,
    pub debt_rate_bps: i64,
    pub covenant_lev_millis: i64,
    pub covenant_cover_millis: i64,
    pub invested_week: i64,
    pub distributions: i64,
    pub entry_ev: i64,
    pub pending_agm: bool,
    pub action_used: bool,
    pub breached: bool,
    #[serde(default)]
    pub fund_slot: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flow {
    pub id: i64,
    pub week: i64,
    pub kind: String,
    pub amount: i64,
    pub company_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cleared {
    pub week: i64,
    pub company_id: String,
    pub kind: String,
    pub ev: i64,
    pub proceeds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fund {
    pub name_ko: String,
    pub commitments: i64,
    pub paid_in: i64,
    pub cash: i64,
    pub lp_distributed: i64,
    pub gp_distributed: i64,
    pub roc_paid: i64,
    pub pref_accrued: i64,
    pub pref_paid: i64,
    pub gp_carry: i64,
    pub invested_cost: i64,
    pub fee_bps: i64,
    pub hurdle_bps: i64,
    pub carry_bps: i64,
    pub investment_period_years: i32,
    pub term_years: i32,
    pub vintage_year: i32,
    pub expenses_per_quarter: i64,
    pub reputation: i64,
    pub fund_ii_commitments: i64,
    pub fee_payable: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub schema: i32,
    pub seed: i64,
    pub rng: u64,
    pub news_seq: i64,
    pub flow_seq: i64,
    pub clock: Clock,
    pub policy_rate_bps: i64,
    pub neutral_rate_bps: i64,
    pub fund: Fund,
    pub agents: Vec<Agent>,
    pub candidates: Vec<Candidate>,
    pub companies: Vec<Company>,
    pub deals: Vec<Deal>,
    pub holdings: Vec<Holding>,
    pub news: Vec<NewsItem>,
    pub flows: Vec<Flow>,
    pub lp_quarters: Vec<i64>,
    pub cleared: Vec<Cleared>,
    #[serde(default)]
    pub open_events: Vec<GameEvent>,
    #[serde(default)]
    pub event_seq: i64,
    #[serde(default)]
    pub parked: Vec<ParkedFund>,
    #[serde(default)]
    pub active_slot: u8,
    #[serde(default)]
    pub activity: Vec<NewsItem>,
    #[serde(default)]
    pub index_window: Vec<i64>,
    #[serde(default = "default_inflation")]
    pub inflation_bps: i64,
}

fn default_inflation() -> i64 {
    220
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEvent {
    pub id: i64,
    pub kind: String,
    pub company_id: String,
    pub company_ko: String,
    pub week: i64,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParkedFund {
    pub slot: u8,
    pub name_ko: String,
    pub commitments: i64,
    pub paid_in: i64,
    pub cash: i64,
    pub nav: i64,
    pub dpi_millis: i64,
    pub lp_distributed: i64,
}

#[derive(Deserialize)]
struct BootFile {
    seed: i64,
    clock: Clock,
    policy_rate_bps: i64,
    neutral_rate_bps: i64,
    fund: FundBoot,
    agents: Vec<Agent>,
    candidates: Vec<Candidate>,
    companies: Vec<Company>,
    deals: Vec<DealBoot>,
}

#[derive(Deserialize)]
struct FundBoot {
    name_ko: String,
    commitments: i64,
    fee_bps: i64,
    hurdle_bps: i64,
    carry_bps: i64,
    investment_period_years: i32,
    term_years: i32,
    vintage_year: i32,
    expenses_per_quarter: i64,
    reputation: i64,
}

#[derive(Deserialize)]
struct DealBoot {
    id: String,
    company_id: String,
    stage: String,
    process: String,
    access: String,
    seller_kind: String,
    broker_id: String,
    instrument: String,
    ask_ev: i64,
    ask_size: i64,
    ask_coupon_bps: i64,
    weeks_left: i64,
    competing_ev: i64,
    competitor_ko: String,
}

impl Game {
    pub fn boot(text: &str) -> Result<Self, String> {
        let boot: BootFile = serde_json::from_str(text).map_err(|err| err.to_string())?;
        let mut deals = Vec::new();
        for deal in boot.deals {
            let terms = Terms {
                instrument: deal.instrument.clone(),
                bid_ev: deal.ask_ev,
                bid_size: deal.ask_size,
                ownership_bps: if deal.instrument == "buyout" { 10_000 } else { 2_000 },
                coupon_bps: deal.ask_coupon_bps,
                pref_millis: if deal.instrument == "rcps" { 1_000 } else { 0 },
                board_seats: if deal.instrument == "buyout" { 2 } else { 1 },
                covenants: true,
                drag: deal.instrument == "buyout",
                tag: true,
                earnout: 0,
                debt: 0,
                debt_rate_bps: 800,
                covenant_lev_millis: 5_500,
                covenant_cover_millis: 2_000,
                si_id: String::new(),
                si_equity: 0,
                hundred_day_plan: false,
            };
            deals.push(Deal {
                id: deal.id,
                company_id: deal.company_id,
                stage: deal.stage,
                process: deal.process,
                access: deal.access,
                seller_kind: deal.seller_kind,
                broker_id: deal.broker_id,
                instrument: deal.instrument,
                ask_ev: deal.ask_ev,
                ask_size: deal.ask_size,
                ask_coupon_bps: deal.ask_coupon_bps,
                weeks_left: deal.weeks_left,
                status: "listed".into(),
                competing_ev: deal.competing_ev,
                competitor_ko: deal.competitor_ko,
                raised: false,
                rejects: 0,
                conditions: false,
                ic_bid_ev: 0,
                terms,
                log: Vec::new(),
                ic: Vec::new(),
            });
        }
        let mut game = Game {
            schema: 1,
            seed: boot.seed,
            rng: (boot.seed as u64).max(1),
            news_seq: 0,
            flow_seq: 0,
            clock: boot.clock,
            policy_rate_bps: boot.policy_rate_bps,
            neutral_rate_bps: boot.neutral_rate_bps,
            fund: Fund {
                name_ko: boot.fund.name_ko,
                commitments: boot.fund.commitments,
                paid_in: 0,
                cash: 0,
                lp_distributed: 0,
                gp_distributed: 0,
                roc_paid: 0,
                pref_accrued: 0,
                pref_paid: 0,
                gp_carry: 0,
                invested_cost: 0,
                fee_bps: boot.fund.fee_bps,
                hurdle_bps: boot.fund.hurdle_bps,
                carry_bps: boot.fund.carry_bps,
                investment_period_years: boot.fund.investment_period_years,
                term_years: boot.fund.term_years,
                vintage_year: boot.fund.vintage_year,
                expenses_per_quarter: boot.fund.expenses_per_quarter,
                reputation: boot.fund.reputation,
                fund_ii_commitments: 0,
                fee_payable: 0,
            },
            agents: boot.agents,
            candidates: boot.candidates,
            companies: boot.companies,
            deals,
            holdings: Vec::new(),
            news: Vec::new(),
            flows: Vec::new(),
            lp_quarters: vec![0],
            cleared: Vec::new(),
            open_events: Vec::new(),
            event_seq: 0,
            parked: Vec::new(),
            active_slot: 0,
            activity: Vec::new(),
            index_window: Vec::new(),
            inflation_bps: default_inflation(),
        };
        for company in &game.companies {
            if company.books.total_assets()
                != company.books.total_liabilities() + company.books.total_equity()
            {
                return Err(format!("identity {}", company.id));
            }
        }
        game.opening_news();
        let index = game.market_index();
        game.index_window = vec![index; 8];
        Ok(game)
    }

    pub fn export_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".into())
    }

    pub fn import_json(text: &str) -> Result<Self, String> {
        serde_json::from_str(text).map_err(|err| err.to_string())
    }

    pub fn handle(&mut self, text: &str) -> String {
        let cmd: Value = match serde_json::from_str(text) {
            Ok(value) => value,
            Err(_) => return self.err("bad_state", Value::Null),
        };
        let op = cmd.get("op").and_then(|v| v.as_str()).unwrap_or("dashboard");
        let result = match op {
            "dashboard" => Ok(Value::Null),
            "deals" => Ok(self.page_deals(&cmd)),
            "deal" => self.page_deal(&cmd),
            "companies" => Ok(self.page_companies(&cmd)),
            "company" => self.page_company(&cmd),
            "fund" => Ok(self.page_fund()),
            "portfolio" => Ok(self.page_portfolio()),
            "market" => Ok(self.page_market()),
            "advance_weeks" => {
                let weeks = cmd.get("weeks").and_then(|v| v.as_i64()).unwrap_or(1);
                self.advance_weeks(weeks.clamp(1, 13) as i32);
                Ok(Value::Null)
            }
            "call_capital" => self.call_capital(json_i64(&cmd, "amount")),
            "distribute" => self.distribute(json_i64(&cmd, "amount")),
            "ioi" => self.bid(&cmd, Phase::Ioi),
            "loi" => self.bid(&cmd, Phase::Loi),
            "ic" => self.hold_ic(&cmd),
            "binding" => self.bind(&cmd),
            "walk" => self.walk(&cmd),
            "approach" => self.approach(&cmd),
            "exit" => self.exit_position(&cmd),
            "appoint" => self.appoint(&cmd),
            "action" => self.value_action(&cmd),
            "agm" => self.resolve_agm(&cmd),
            "board" => self.board(&cmd),
            "raise_fund_ii" => self.raise_fund_ii(),
            "start_dd" => self.start_dd(&cmd),
            "resolve_event" => self.resolve_event(&cmd),
            _ => Err("bad_state"),
        };
        if result.is_ok()
            && !matches!(
                op,
                "dashboard" | "deals" | "deal" | "companies" | "company" | "fund" | "portfolio" | "market"
            )
        {
            let company_id = json_str(&cmd, "company_id");
            let name = if company_id.is_empty() {
                String::new()
            } else {
                self.company_name(&company_id)
            };
            self.note(&format!("activity.{op}"), &name);
        }
        match result {
            Ok(page) => self.ok(page),
            Err(code) => self.err(code, Value::Null),
        }
    }

    fn opening_news(&mut self) {
        self.push("news.opening", "", "", "", "neutral");
        let ids: Vec<String> = self.deals.iter().take(3).map(|d| d.id.clone()).collect();
        for id in ids {
            let Some(deal) = self.deals.iter().find(|d| d.id == id) else {
                continue;
            };
            let company_id = deal.company_id.clone();
            let name = self.company_name(&company_id);
            self.push("news.deal_listed", &company_id, &name, "", "neutral");
        }
    }

    fn advance_weeks(&mut self, weeks: i32) {
        for _ in 0..weeks {
            self.clock.week_in_quarter += 1;
            self.clock.absolute_week += 1;
            self.tick_deals();
            if self.clock.week_in_quarter >= 13 {
                self.close_quarter();
                self.clock.week_in_quarter = 0;
                self.clock.quarter += 1;
                if self.clock.quarter > 4 {
                    self.clock.quarter = 1;
                    self.clock.year += 1;
                }
            }
        }
    }

    fn tick_deals(&mut self) {
        let mut expired = Vec::new();
        for deal in &mut self.deals {
            if matches!(deal.status.as_str(), "closed" | "dead") {
                continue;
            }
            if deal.weeks_left > 0 {
                deal.weeks_left -= 1;
            }
            if deal.weeks_left == 0 {
                deal.status = "dead".into();
                expired.push((deal.company_id.clone(), deal.process.clone()));
            }
        }
        for (company_id, process) in expired {
            let name = self.company_name(&company_id);
            let template = if process == "auction" {
                "news.auction_lost"
            } else {
                "news.walked"
            };
            self.push(template, &company_id, &name, "", "down");
        }
    }

    fn close_quarter(&mut self) {
        let period = format!("{}Q{}", self.clock.year, self.clock.quarter);
        let ids: Vec<String> = self.companies.iter().map(|c| c.id.clone()).collect();
        let mut movers = Vec::new();
        for id in ids {
            if let Some(moved) = self.close_company(&id, &period) {
                movers.push(moved);
            }
        }
        movers.sort_by_key(|row| -row.2.abs());
        for (company_id, _new, delta) in movers.into_iter().take(3) {
            if delta == 0 {
                continue;
            }
            let name = self.company_name(&company_id);
            let template = if delta > 0 {
                "news.ebitda_up"
            } else {
                "news.ebitda_down"
            };
            let tone = if delta > 0 { "up" } else { "down" };
            self.push(template, &company_id, &name, &period, tone);
        }
        self.charge_fees();
        self.accrue_pref();
        self.reputation_tick();
        self.lp_quarters.push(0);
        self.push("news.quarter", "", "", &period, "neutral");
        self.maybe_list_deal();
        self.maybe_open_event();
        if self.clock.quarter == 1 {
            let held: Vec<String> = self
                .holdings
                .iter()
                .filter(|h| !Instrument::parse(&h.instrument).is_some_and(|k| k.is_credit()))
                .map(|h| h.company_id.clone())
                .collect();
            for id in held {
                if let Some(holding) = self.holdings.iter_mut().find(|h| h.company_id == id) {
                    holding.pending_agm = true;
                    holding.action_used = false;
                }
                let name = self.company_name(&id);
                self.push("news.agm", &id, &name, &period, "neutral");
            }
        } else {
            for holding in &mut self.holdings {
                holding.action_used = false;
            }
        }
        let step = (self.clock.absolute_week / 13) as i64;
        self.inflation_bps = (180 + (step % 8) * 15).clamp(80, 400);
        self.remember_index();
    }

    fn close_company(&mut self, id: &str, period: &str) -> Option<(String, i64, i64)> {
        let extra_interest = self.coupon_due(id);
        let growth_shock_bps = self.shock();
        let (old_ebitda, adjust, quarter_index, drivers, books) = {
            let company = self.companies.iter().find(|c| c.id == id)?;
            let adjust = CloseAdjust {
                growth_shock_bps,
                extra_interest,
                extra_sga: company.pending_sga,
                asset_sale: company.pending_sale,
            };
            (
                company.books.ebitda,
                adjust,
                company.quarter_index,
                company.drivers.clone(),
                company.books.clone(),
            )
        };
        let closed = close_quarter(
            &books,
            &drivers,
            self.policy_rate_bps,
            self.neutral_rate_bps,
            quarter_index,
            period,
            &adjust,
        )
        .ok()?;
        let dividend = closed.dividends;
        let ebitda = closed.ebitda;
        let interest = closed.interest;
        let debt = closed.debt;
        let cash = closed.cash;
        let company = self.companies.iter_mut().find(|c| c.id == id)?;
        company.pending_sale = 0;
        company.pending_sga = 0;
        company.quarter_index += 1;
        company.books = closed.clone();
        company.generated.push(closed);
        if company.generated.len() > 8 {
            let drop_count = company.generated.len() - 8;
            company.generated.drain(0..drop_count);
        }
        self.sweep_holding(id, dividend, ebitda, interest, debt, cash);
        Some((id.to_string(), ebitda, ebitda - old_ebitda))
    }

    fn coupon_due(&self, company_id: &str) -> i64 {
        self.holdings
            .iter()
            .filter(|h| h.company_id == company_id)
            .filter(|h| Instrument::parse(&h.instrument).is_some_and(|k| k.is_credit()))
            .map(|h| mul_div(h.principal, h.coupon_bps, 40_000).unwrap_or(0))
            .sum()
    }

    fn sweep_holding(
        &mut self,
        company_id: &str,
        dividend: i64,
        ebitda: i64,
        interest: i64,
        debt: i64,
        cash: i64,
    ) {
        let Some(index) = self
            .holdings
            .iter()
            .position(|h| h.company_id == company_id)
        else {
            return;
        };
        let instrument = self.holdings[index].instrument.clone();
        let parsed = Instrument::parse(&instrument);
        if parsed.is_some_and(|k| k.is_credit()) {
            let coupon = mul_div(
                self.holdings[index].principal,
                self.holdings[index].coupon_bps,
                40_000,
            )
            .unwrap_or(0);
            if coupon > 0 {
                let slot = self.holdings[index].fund_slot;
                self.credit_slot(slot, coupon);
                self.holdings[index].distributions += coupon;
                self.record_flow("coupon", coupon, company_id);
            }
        } else {
            let share = mul_div(dividend, self.holdings[index].ownership_bps, 10_000).unwrap_or(0);
            if share > 0 {
                let slot = self.holdings[index].fund_slot;
                self.credit_slot(slot, share);
                self.holdings[index].distributions += share;
                self.record_flow("dividend", share, company_id);
            }
        }
        if self.holdings[index].covenant_lev_millis > 0 && ebitda != 0 {
            let annual = ebitda.saturating_mul(4);
            let net_debt = debt - cash;
            let leverage = leverage_millis(net_debt, annual.max(1)).unwrap_or(9_999);
            let cash_interest = interest.saturating_mul(4).max(0);
            let cover = interest_cover_millis(annual.max(0), cash_interest).unwrap_or(0);
            let breach = covenants_breached(
                leverage,
                self.holdings[index].covenant_lev_millis,
                cover,
                self.holdings[index].covenant_cover_millis,
            );
            if breach && !self.holdings[index].breached {
                self.holdings[index].breached = true;
                self.fund.reputation = (self.fund.reputation - 40).max(0);
                let name = self.company_name(company_id);
                self.push("news.covenant", company_id, &name, "", "down");
                self.event_seq += 1;
                let id = self.event_seq;
                self.open_events.push(GameEvent {
                    id,
                    kind: "covenant".into(),
                    company_id: company_id.into(),
                    company_ko: name,
                    week: self.clock.absolute_week,
                    resolved: false,
                });
            } else if !breach {
                self.holdings[index].breached = false;
            }
        }
    }

    fn charge_fees(&mut self) {
        let in_period =
            self.clock.year < self.fund.vintage_year + self.fund.investment_period_years;
        let base = if in_period {
            self.fund.commitments
        } else {
            self.fund.invested_cost
        };
        let fee = quarterly_management_fee(base, self.fund.fee_bps).unwrap_or(0);
        let due = fee + self.fund.expenses_per_quarter;
        if self.fund.cash < due {
            let uncalled = self.uncalled();
            let call = (due - self.fund.cash).min(uncalled);
            if call > 0 {
                self.apply_call(call);
                self.push("news.fee", "", "", "", "neutral");
            }
        }
        let pay_fee = fee.min(self.fund.cash);
        self.fund.cash -= pay_fee;
        self.fund.fee_payable += fee - pay_fee;
        if pay_fee > 0 {
            self.record_flow("fee", -pay_fee, "");
        }
        let expenses = self.fund.expenses_per_quarter.min(self.fund.cash);
        self.fund.cash -= expenses;
        if expenses > 0 {
            self.record_flow("expense", -expenses, "");
        }
    }

    fn accrue_pref(&mut self) {
        let unreturned = (self.fund.paid_in - self.fund.roc_paid).max(0);
        let accrual = mul_div(unreturned, self.fund.hurdle_bps, 40_000).unwrap_or(0);
        self.fund.pref_accrued += accrual;
    }

    fn reputation_tick(&mut self) {
        let mut missed = Vec::new();
        for holding in &mut self.holdings {
            if holding.pending_agm && self.clock.quarter != 1 {
                holding.pending_agm = false;
                missed.push(holding.company_id.clone());
            }
        }
        for id in missed {
            self.fund.reputation = (self.fund.reputation - 25).max(0);
            let name = self.company_name(&id);
            self.push("news.agm_missed", &id, &name, "", "down");
        }
        if self.fund.paid_in > 0 {
            let tvpi = self.tvpi().unwrap_or(0);
            if tvpi >= 1_100 {
                self.fund.reputation = (self.fund.reputation + 5).min(1_000);
            } else {
                self.fund.reputation = (self.fund.reputation - 6).max(0);
            }
        }
    }

    fn call_capital(&mut self, amount: i64) -> Result<Value, &'static str> {
        if amount <= 0 || amount > self.uncalled() {
            return Err("amount");
        }
        self.apply_call(amount);
        Ok(self.page_fund())
    }

    fn apply_call(&mut self, amount: i64) {
        self.fund.paid_in += amount;
        self.fund.cash += amount;
        if let Some(bucket) = self.lp_quarters.last_mut() {
            *bucket -= amount;
        }
        self.record_flow("call", amount, "");
    }

    fn distribute(&mut self, amount: i64) -> Result<Value, &'static str> {
        if amount <= 0 || amount > self.fund.cash {
            return Err("amount");
        }
        let mut book = crate::waterfall::Waterfall {
            contributed: self.fund.paid_in,
            roc_paid: self.fund.roc_paid,
            pref_accrued: self.fund.pref_accrued,
            pref_paid: self.fund.pref_paid,
            gp_carry: self.fund.gp_carry,
        };
        let split = book
            .distribute(amount, self.fund.carry_bps)
            .map_err(|_| "amount")?;
        self.fund.roc_paid = book.roc_paid;
        self.fund.pref_paid = book.pref_paid;
        self.fund.gp_carry = book.gp_carry;
        self.fund.cash -= amount;
        self.fund.lp_distributed += split.lp;
        self.fund.gp_distributed += split.gp;
        if let Some(bucket) = self.lp_quarters.last_mut() {
            *bucket += split.lp;
        }
        if split.lp > 0 {
            self.record_flow("dist_lp", -split.lp, "");
        }
        if split.gp > 0 {
            self.record_flow("dist_gp", -split.gp, "");
        }
        if split.pref > 0 {
            self.fund.reputation = (self.fund.reputation + 15).min(1_000);
        }
        self.push("news.distribution", "", "", "", "up");
        Ok(json!({
            "kind": "distribution",
            "lp": split.lp,
            "gp": split.gp,
            "roc": split.roc,
            "pref": split.pref,
            "catch_up_gp": split.catch_up_gp,
            "residual_lp": split.residual_lp,
            "residual_gp": split.residual_gp
        }))
    }

    fn bid(&mut self, cmd: &Value, phase: Phase) -> Result<Value, &'static str> {
        let id = json_str(cmd, "id");
        let index = self.deal_index(&id).ok_or("not_found")?;
        if !access_allowed(&self.deals[index].access, self.fund.reputation) {
            return Err("access");
        }
        if !self.revealed(&self.deals[index].company_id) {
            return Err("dd_required");
        }
        if matches!(self.deals[index].status.as_str(), "closed" | "dead") {
            return Err("closed");
        }
        self.apply_terms(index, cmd);
        let response = self.response_for(index, phase)?;
        let company_id = self.deals[index].company_id.clone();
        let name = self.company_name(&company_id);
        match response {
            ResponseKind::Accept => {
                self.deals[index].status = match phase {
                    Phase::Ioi => "ioi".into(),
                    Phase::Loi => "loi".into(),
                    Phase::Binding => "loi".into(),
                };
                self.log_deal(index, "log.accept", self.deals[index].terms.bid_ev);
                self.maybe_raise(index);
            }
            ResponseKind::Counter { ev } => {
                self.deals[index].status = "countered".into();
                self.deals[index].ask_ev = ev;
                self.deals[index].terms.bid_ev = ev;
                self.log_deal(index, "log.counter", ev);
                self.push("news.counter", &company_id, &name, "", "neutral");
                self.maybe_raise(index);
            }
            ResponseKind::Reject => {
                self.deals[index].rejects += 1;
                self.log_deal(index, "log.reject", self.deals[index].terms.bid_ev);
                if self.deals[index].rejects >= 3 {
                    self.deals[index].status = "dead".into();
                }
            }
        }
        self.page_deal_id(&id)
    }

    fn hold_ic(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let id = json_str(cmd, "id");
        let index = self.deal_index(&id).ok_or("not_found")?;
        if !self.revealed(&self.deals[index].company_id) {
            return Err("dd_required");
        }
        self.apply_terms(index, cmd);
        if !matches!(self.deals[index].status.as_str(), "loi" | "ioi" | "ic_hold" | "countered") {
            return Err("bad_state");
        }
        let votes = self.ic_votes(index);
        let yes = votes.iter().filter(|v| v.yes).count();
        let chair_no = votes.first().is_some_and(|v| !v.yes);
        let jeong_no = votes.iter().any(|v| v.partner == "jeong" && !v.yes);
        let seol_no = votes.iter().any(|v| v.partner == "seol" && !v.yes);
        let approved = yes >= 4 && !chair_no;
        self.deals[index].conditions = approved && jeong_no && seol_no;
        self.deals[index].ic = votes;
        self.deals[index].status = if approved { "ic_ok".into() } else { "ic_hold".into() };
        self.deals[index].ic_bid_ev = self.deals[index].terms.bid_ev;
        self.log_deal(index, "log.ic", self.deals[index].terms.bid_ev);
        self.page_deal_id(&id)
    }

    fn bind(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let id = json_str(cmd, "id");
        let index = self.deal_index(&id).ok_or("not_found")?;
        if self.deals[index].status != "ic_ok" {
            return Err("ic_required");
        }
        self.apply_terms(index, cmd);
        if self.deals[index].terms.bid_ev != self.deals[index].ic_bid_ev {
            self.deals[index].status = "loi".into();
            return Err("ic_required");
        }
        let response = self.response_for(index, Phase::Binding)?;
        match response {
            ResponseKind::Accept => self.close_deal(index),
            ResponseKind::Counter { ev } => {
                self.deals[index].status = "countered".into();
                self.deals[index].ask_ev = ev;
                self.log_deal(index, "log.counter", ev);
                self.page_deal_id(&id)
            }
            ResponseKind::Reject => {
                self.deals[index].status = "dead".into();
                self.log_deal(index, "log.reject", self.deals[index].terms.bid_ev);
                self.page_deal_id(&id)
            }
        }
    }

    fn close_deal(&mut self, index: usize) -> Result<Value, &'static str> {
        let deal = self.deals[index].clone();
        let company_index = self
            .companies
            .iter()
            .position(|c| c.id == deal.company_id)
            .ok_or("not_found")?;
        let instrument = Instrument::parse(&deal.terms.instrument).ok_or("bad_state")?;
        let books = &self.companies[company_index].books;
        let net_debt = books.debt - books.cash;
        let model_equity = equity_value(books.ebitda, books.model_multiple_millis, net_debt)
            .map_err(|_| "bad_state")?;
        let (need, ownership, principal, entry_ev) = if instrument.is_credit() {
            let fees = transaction_cost(deal.terms.bid_size).map_err(|_| "amount")?;
            (deal.terms.bid_size + fees, 0, deal.terms.bid_size, deal.terms.bid_size)
        } else if instrument.is_control() {
            let fees = transaction_cost(deal.terms.bid_ev).map_err(|_| "amount")?;
            let sources = sources_and_uses(
                deal.terms.bid_ev,
                fees,
                deal.terms.debt,
                0,
                0,
                deal.terms.si_equity,
            )
            .map_err(|_| "amount")?;
            let equity_pool = (sources.sponsor + sources.strategic).max(1);
            let ownership = mul_div(sources.sponsor, 10_000, equity_pool).unwrap_or(10_000);
            (sources.sponsor, ownership, 0, deal.terms.bid_ev)
        } else {
            let equity_check = mul_div(
                model_equity.max(deal.terms.bid_ev - net_debt).max(0),
                deal.terms.ownership_bps.max(100),
                10_000,
            )
            .unwrap_or(0);
            let priced = mul_div(
                (deal.terms.bid_ev - net_debt).max(0),
                deal.terms.ownership_bps.max(100),
                10_000,
            )
            .unwrap_or(equity_check);
            let fees = transaction_cost(priced).map_err(|_| "amount")?;
            (priced + fees, deal.terms.ownership_bps, 0, deal.terms.bid_ev)
        };
        if need > self.fund.cash {
            return Err("need_capital");
        }
        self.fund.cash -= need;
        self.fund.invested_cost += need;
        self.record_flow("invest", -need, &deal.company_id);
        if instrument.is_credit() {
            let company = &mut self.companies[company_index];
            company.books.cash += principal;
            company.books.debt += principal;
        } else if instrument.is_control() {
            let company = &mut self.companies[company_index];
            let delta = deal.terms.debt - company.books.debt;
            company.books.debt = deal.terms.debt;
            company.books.retained -= delta;
            if deal.terms.debt > 0 {
                company.drivers.interest_rate_bps = deal.terms.debt_rate_bps;
            }
        }
        self.cleared.push(Cleared {
            week: self.clock.absolute_week,
            company_id: deal.company_id.clone(),
            kind: "entry".into(),
            ev: entry_ev,
            proceeds: need,
        });
        self.holdings.push(Holding {
            company_id: deal.company_id.clone(),
            deal_id: deal.id.clone(),
            instrument: deal.terms.instrument.clone(),
            ownership_bps: ownership,
            cost: need,
            principal,
            coupon_bps: deal.terms.coupon_bps,
            board_seats: deal.terms.board_seats,
            debt_rate_bps: deal.terms.debt_rate_bps,
            covenant_lev_millis: if instrument.is_control() {
                deal.terms.covenant_lev_millis
            } else {
                0
            },
            covenant_cover_millis: deal.terms.covenant_cover_millis,
            invested_week: self.clock.absolute_week,
            distributions: 0,
            entry_ev,
            pending_agm: false,
            action_used: false,
            breached: false,
            fund_slot: self.active_slot,
        });
        let name = self.company_name(&deal.company_id);
        self.deals[index].status = "closed".into();
        self.log_deal(index, "log.close", entry_ev);
        self.push("news.closed", &deal.company_id, &name, "", "up");
        self.page_deal_id(&deal.id)
    }

    fn walk(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let id = json_str(cmd, "id");
        let index = self.deal_index(&id).ok_or("not_found")?;
        self.deals[index].status = "dead".into();
        self.log_deal(index, "log.walk", 0);
        self.page_deal_id(&id)
    }

    fn approach(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let company_id = json_str(cmd, "company_id");
        let company = self
            .companies
            .iter()
            .find(|c| c.id == company_id)
            .ok_or("not_found")?;
        if self.deals.iter().any(|d| {
            d.company_id == company_id && !matches!(d.status.as_str(), "dead" | "closed")
        }) {
            return Err("bad_state");
        }
        let openness = company.owner_openness;
        let name = company.legal_name_ko.clone();
        let stage = company.approach_stage.clone();
        let instrument = company.approach_instrument.clone();
        let seller = company.owner_kind.clone();
        let books = company.books.clone();
        let ev = enterprise_value(books.ebitda, books.model_multiple_millis).unwrap_or(0);
        if !approach_accepted(openness, self.fund.reputation) {
            self.fund.reputation = (self.fund.reputation - 2).max(0);
            self.push("news.approach_no", &company_id, &name, "", "down");
            return self.page_company_id(&company_id);
        }
        let id = format!("dl-own-{}-{}", company_id, self.clock.absolute_week);
        let deal = DealBoot {
            id,
            company_id: company_id.clone(),
            stage,
            process: "bilateral".into(),
            access: "proprietary".into(),
            seller_kind: seller,
            broker_id: String::new(),
            instrument,
            ask_ev: ev,
            ask_size: ev / 5,
            ask_coupon_bps: 0,
            weeks_left: 20,
            competing_ev: 0,
            competitor_ko: String::new(),
        };
        // Reuse boot shaping by pushing through the same defaults as Game::boot.
        let shaped = shape_deal(deal);
        let new_id = shaped.id.clone();
        self.deals.push(shaped);
        self.push("news.approach_yes", &company_id, &name, "", "up");
        self.page_deal_id(&new_id)
    }

    fn exit_position(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let company_id = json_str(cmd, "company_id");
        let index = self
            .holdings
            .iter()
            .position(|h| h.company_id == company_id)
            .ok_or("not_found")?;
        let holding = self.holdings[index].clone();
        let company = self
            .companies
            .iter()
            .find(|c| c.id == company_id)
            .ok_or("not_found")?;
        let ev = enterprise_value(company.books.ebitda, company.books.model_multiple_millis)
            .unwrap_or(0);
        let net_debt = company.books.debt - company.books.cash;
        let equity = equity_value(company.books.ebitda, company.books.model_multiple_millis, net_debt)
            .unwrap_or(0);
        let proceeds = if Instrument::parse(&holding.instrument).is_some_and(|k| k.is_credit()) {
            holding.principal
        } else {
            mul_div(equity.max(0), holding.ownership_bps, 10_000).unwrap_or(0)
        };
        self.fund.cash += proceeds;
        self.fund.invested_cost = (self.fund.invested_cost - holding.cost).max(0);
        self.record_flow("exit", proceeds, &company_id);
        self.cleared.push(Cleared {
            week: self.clock.absolute_week,
            company_id: company_id.clone(),
            kind: "exit".into(),
            ev: if Instrument::parse(&holding.instrument).is_some_and(|k| k.is_credit()) {
                proceeds
            } else {
                ev
            },
            proceeds,
        });
        let moic = if holding.cost > 0 {
            (holding.distributions + proceeds) * 1_000 / holding.cost
        } else {
            1_000
        };
        if moic >= 2_000 {
            self.fund.reputation = (self.fund.reputation + 40).min(1_000);
        } else if moic >= 1_000 {
            self.fund.reputation = (self.fund.reputation + 10).min(1_000);
        } else {
            self.fund.reputation = (self.fund.reputation - 30).max(0);
        }
        self.holdings.remove(index);
        let name = self.company_name(&company_id);
        self.push("news.exit", &company_id, &name, "", if moic >= 1_000 { "up" } else { "down" });
        Ok(json!({"kind": "exit", "proceeds": proceeds, "ev": ev, "moic_millis": moic}))
    }

    fn appoint(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let company_id = json_str(cmd, "company_id");
        let candidate_id = json_str(cmd, "candidate_id");
        if !self.is_control(&company_id) {
            return Err("no_control");
        }
        let candidate = self
            .candidates
            .iter()
            .find(|c| c.id == candidate_id)
            .cloned()
            .ok_or("not_found")?;
        let company = self
            .companies
            .iter_mut()
            .find(|c| c.id == company_id)
            .ok_or("not_found")?;
        match candidate.trait_id.as_str() {
            "operator" => company.drivers.sga_bps = (company.drivers.sga_bps - 30).max(400),
            "grower" => company.drivers.growth_bps += 40,
            "cutter" => company.drivers.sga_bps = (company.drivers.sga_bps - 70).max(400),
            _ => {}
        }
        if let Some(ceo) = company.management.iter_mut().find(|m| m.role == "ceo") {
            ceo.name_ko = candidate.name_ko;
            ceo.trait_id = candidate.trait_id.clone();
        }
        if candidate.trait_id == "cutter" {
            self.fund.reputation = (self.fund.reputation - 15).max(0);
        }
        self.page_company_id(&company_id)
    }

    fn value_action(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let company_id = json_str(cmd, "company_id");
        let kind = json_str(cmd, "kind");
        if !self.is_control(&company_id) {
            return Err("no_control");
        }
        let holding = self
            .holdings
            .iter_mut()
            .find(|h| h.company_id == company_id)
            .ok_or("not_found")?;
        if holding.action_used {
            return Err("bad_state");
        }
        holding.action_used = true;
        let company = self
            .companies
            .iter_mut()
            .find(|c| c.id == company_id)
            .ok_or("not_found")?;
        match kind.as_str() {
            "cost" => {
                company.drivers.sga_bps = (company.drivers.sga_bps - 80).max(400);
                company.employees = (company.employees * 95 / 100).max(1);
                company.pending_sga += (company.books.revenue / 50).max(1);
            }
            "pricing" => {
                company.drivers.gross_margin_bps = (company.drivers.gross_margin_bps + 40).min(7_200);
                company.drivers.growth_bps += 20;
            }
            "capex" => {
                company.drivers.capex_bps += 80;
                company.drivers.growth_bps += 15;
            }
            "asset_sale" => {
                let sale = (company.books.gross_ppe / 7).max(0);
                if sale == 0 {
                    return Err("bad_state");
                }
                company.pending_sale = sale;
            }
            _ => return Err("bad_state"),
        }
        if kind == "cost" {
            self.fund.reputation = (self.fund.reputation - 12).max(0);
        }
        self.page_company_id(&company_id)
    }

    fn resolve_agm(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let company_id = json_str(cmd, "company_id");
        let payout = json_i64(cmd, "dividend_payout_bps").clamp(0, 5_000);
        let holding = self
            .holdings
            .iter_mut()
            .find(|h| h.company_id == company_id)
            .ok_or("not_found")?;
        if !holding.pending_agm {
            return Err("bad_state");
        }
        holding.pending_agm = false;
        let company = self
            .companies
            .iter_mut()
            .find(|c| c.id == company_id)
            .ok_or("not_found")?;
        company.drivers.dividend_payout_bps = payout;
        if let Some(director) = cmd.get("director_id").and_then(|v| v.as_str()) {
            if let Some(candidate) = self.candidates.iter().find(|c| c.id == director).cloned() {
                if let Some(ceo) = company.management.iter_mut().find(|m| m.role == "ceo") {
                    ceo.name_ko = candidate.name_ko;
                    ceo.trait_id = candidate.trait_id;
                }
            }
        }
        let name = company.legal_name_ko.clone();
        self.push("news.agm_done", &company_id, &name, "", "neutral");
        self.page_company_id(&company_id)
    }

    fn board(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let company_id = json_str(cmd, "company_id");
        let choice = json_str(cmd, "choice");
        let seats = self
            .holdings
            .iter()
            .find(|h| h.company_id == company_id)
            .map(|h| h.board_seats)
            .unwrap_or(0);
        if seats <= 0 && !self.is_control(&company_id) {
            return Err("no_control");
        }
        let company = self
            .companies
            .iter_mut()
            .find(|c| c.id == company_id)
            .ok_or("not_found")?;
        match choice.as_str() {
            "capex_up" => company.drivers.capex_bps += 40,
            "dividend_up" => {
                company.drivers.dividend_payout_bps =
                    (company.drivers.dividend_payout_bps + 500).min(5_000)
            }
            "dividend_down" => {
                company.drivers.dividend_payout_bps =
                    (company.drivers.dividend_payout_bps - 500).max(0)
            }
            _ => return Err("bad_state"),
        }
        self.page_company_id(&company_id)
    }

    fn raise_fund_ii(&mut self) -> Result<Value, &'static str> {
        if !self.fund_ii_ready() {
            return Err("bad_state");
        }
        let size = (self.fund.commitments * self.fund.reputation / 620).clamp(20_000, 120_000);
        let nav = self.nav();
        let dpi = self.dpi().unwrap_or(0);
        self.parked.push(ParkedFund {
            slot: self.active_slot,
            name_ko: self.fund.name_ko.clone(),
            commitments: self.fund.commitments,
            paid_in: self.fund.paid_in,
            cash: self.fund.cash,
            nav,
            dpi_millis: dpi,
            lp_distributed: self.fund.lp_distributed,
        });
        self.active_slot = self.active_slot.saturating_add(1);
        self.fund.name_ko = "IV호".into();
        self.fund.commitments = size;
        self.fund.paid_in = 0;
        self.fund.cash = 0;
        self.fund.lp_distributed = 0;
        self.fund.gp_distributed = 0;
        self.fund.roc_paid = 0;
        self.fund.pref_accrued = 0;
        self.fund.pref_paid = 0;
        self.fund.gp_carry = 0;
        self.fund.invested_cost = 0;
        self.fund.fee_payable = 0;
        self.fund.vintage_year = self.clock.year;
        self.fund.fund_ii_commitments = size;
        self.fund.reputation = (self.fund.reputation + 20).min(1_000);
        self.lp_quarters = vec![0];
        self.push("news.fund_ii", "", "", "", "up");
        Ok(self.page_fund())
    }

    fn credit_slot(&mut self, slot: u8, amount: i64) {
        if slot == self.active_slot {
            self.fund.cash += amount;
            return;
        }
        if let Some(parked) = self.parked.iter_mut().find(|row| row.slot == slot) {
            parked.cash += amount;
            parked.nav += amount;
        }
    }

    fn revealed(&self, company_id: &str) -> bool {
        if self.holdings.iter().any(|h| h.company_id == company_id) {
            return true;
        }
        self.companies.iter().any(|c| {
            c.id == company_id && c.dd_ready_week > 0 && c.dd_ready_week <= self.clock.absolute_week
        })
    }

    fn start_dd(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let company_id = if json_str(cmd, "company_id").is_empty() {
            let deal_id = json_str(cmd, "id");
            self.deals
                .iter()
                .find(|d| d.id == deal_id)
                .map(|d| d.company_id.clone())
                .ok_or("not_found")?
        } else {
            json_str(cmd, "company_id")
        };
        if self.revealed(&company_id) {
            return Err("bad_state");
        }
        let index = self
            .companies
            .iter()
            .position(|c| c.id == company_id)
            .ok_or("not_found")?;
        if self.companies[index].dd_ready_week > self.clock.absolute_week {
            return Err("bad_state");
        }
        let cost = (self.companies[index].books.revenue / 200).clamp(30, 400);
        if self.fund.cash < cost {
            return Err("need_capital");
        }
        self.fund.cash -= cost;
        self.record_flow("expense", -cost, &company_id);
        self.companies[index].dd_ready_week = self.clock.absolute_week + 6;
        let name = self.company_name(&company_id);
        self.push("news.dd", &company_id, &name, "", "neutral");
        if json_str(cmd, "id").is_empty() {
            self.page_company_id(&company_id)
        } else {
            self.page_deal_id(&json_str(cmd, "id"))
        }
    }

    fn maybe_list_deal(&mut self) {
        let live = self
            .deals
            .iter()
            .filter(|d| !matches!(d.status.as_str(), "dead" | "closed"))
            .count();
        let cap = (self.companies.len() / 10).clamp(5, 12);
        if live >= cap {
            return;
        }
        let candidates: Vec<String> = self
            .companies
            .iter()
            .filter(|c| {
                !self.holdings.iter().any(|h| h.company_id == c.id)
                    && !self.deals.iter().any(|d| {
                        d.company_id == c.id && !matches!(d.status.as_str(), "dead" | "closed")
                    })
            })
            .map(|c| c.id.clone())
            .collect();
        if candidates.is_empty() {
            return;
        }
        let pick = candidates[(self.roll() as usize) % candidates.len()].clone();
        self.spawn_deal(&pick);
    }

    fn spawn_deal(&mut self, company_id: &str) {
        let Some(company) = self.companies.iter().find(|c| c.id == company_id) else {
            return;
        };
        let ebitda = company.books.ebitda.max(1);
        let ask_ev = enterprise_value(ebitda, company.books.model_multiple_millis).unwrap_or(ebitda * 6);
        let stage = company.approach_stage.clone();
        let instrument = company.approach_instrument.clone();
        let seller_kind = company.owner_kind.clone();
        let coupon = if instrument == "senior_loan" { 900 } else { 0 };
        let id = format!("dl-{:03}", self.deals.len() + 1);
        let weeks = 20 + (self.roll() % 16) as i64;
        let deal = DealBoot {
            id,
            company_id: company_id.into(),
            stage,
            process: if instrument == "buyout" { "auction".into() } else { "bilateral".into() },
            access: "open".into(),
            seller_kind,
            broker_id: String::new(),
            instrument,
            ask_ev,
            ask_size: ask_ev.max(200),
            ask_coupon_bps: coupon,
            weeks_left: weeks,
            competing_ev: 0,
            competitor_ko: String::new(),
        };
        let name = self.company_name(company_id);
        self.deals.push(shape_deal(deal));
        self.push("news.deal_listed", company_id, &name, "", "neutral");
    }

    fn maybe_open_event(&mut self) {
        if self.open_events.iter().filter(|e| !e.resolved).count() >= 3 {
            return;
        }
        let roll = self.roll() % 11;
        let mut kind = match roll {
            0 => "fraud",
            1 => "strike",
            2 => "down_round",
            3 => "poach",
            4 => "antitrust",
            5 => "earnout",
            6 => "continuation",
            7 => "stalking",
            8 => "auction",
            9 => "roadshow",
            _ => "refi",
        };
        let mut company_id = self.event_target(kind);
        if company_id.is_empty() {
            kind = "roadshow";
            company_id = "fund".into();
        }
        if self.open_events.iter().any(|e| !e.resolved && e.company_id == company_id && e.kind == kind) {
            return;
        }
        self.event_seq += 1;
        let id = self.event_seq;
        let name = self.company_name(&company_id);
        self.open_events.push(GameEvent {
            id,
            kind: kind.into(),
            company_id: company_id.clone(),
            company_ko: name.clone(),
            week: self.clock.absolute_week,
            resolved: false,
        });
        self.push(&format!("news.{kind}"), &company_id, &name, "", "down");
    }

    fn event_target(&self, kind: &str) -> String {
        match kind {
            "fraud" | "strike" | "earnout" | "poach" => self
                .holdings
                .iter()
                .find(|h| h.fund_slot == self.active_slot || self.parked.is_empty())
                .map(|h| h.company_id.clone())
                .unwrap_or_default(),
            "down_round" => self
                .holdings
                .iter()
                .find(|h| h.instrument == "rcps" || h.instrument == "common")
                .map(|h| h.company_id.clone())
                .unwrap_or_default(),
            "antitrust" => self
                .deals
                .iter()
                .find(|d| d.status == "loi" || d.status == "ic_ok")
                .map(|d| d.company_id.clone())
                .unwrap_or_default(),
            "stalking" => self
                .deals
                .iter()
                .find(|d| d.stage == "distressed" && d.status == "listed")
                .map(|d| d.company_id.clone())
                .unwrap_or_default(),
            "continuation" => {
                if self.holdings.is_empty() {
                    String::new()
                } else {
                    self.holdings[0].company_id.clone()
                }
            }
            "auction" => self
                .deals
                .iter()
                .find(|d| d.process == "auction" && d.status == "listed")
                .map(|d| d.company_id.clone())
                .unwrap_or_default(),
            "roadshow" => "fund".into(),
            "refi" => self
                .holdings
                .iter()
                .find(|h| {
                    self.companies
                        .iter()
                        .find(|c| c.id == h.company_id)
                        .is_some_and(|c| c.books.debt > c.books.ebitda * 8)
                })
                .map(|h| h.company_id.clone())
                .unwrap_or_default(),
            _ => String::new(),
        }
    }

    fn resolve_event(&mut self, cmd: &Value) -> Result<Value, &'static str> {
        let id = json_i64(cmd, "id");
        let choice = json_str(cmd, "choice");
        let index = self
            .open_events
            .iter()
            .position(|e| e.id == id && !e.resolved)
            .ok_or("not_found")?;
        let kind = self.open_events[index].kind.clone();
        let company_id = self.open_events[index].company_id.clone();
        self.apply_event(&kind, &choice, &company_id)?;
        self.open_events[index].resolved = true;
        let name = self.company_name(&company_id);
        self.push("news.event_done", &company_id, &name, &kind, "neutral");
        Ok(json!({"kind": "event", "id": id, "choice": choice, "event_kind": kind}))
    }

    fn apply_event(&mut self, kind: &str, choice: &str, company_id: &str) -> Result<(), &'static str> {
        match (kind, choice) {
            ("fraud", "report") => {
                self.write_off(company_id, 80);
                self.fund.reputation = (self.fund.reputation - 10).max(0);
            }
            ("fraud", "hide") => {
                self.write_off(company_id, 180);
                self.fund.reputation = (self.fund.reputation - 40).max(0);
            }
            ("strike", "settle") => {
                self.write_off(company_id, 60);
            }
            ("strike", "replace") => {
                self.shock_growth(company_id, -200);
                self.fund.reputation = (self.fund.reputation - 15).max(0);
            }
            ("antitrust", "conditions") => {
                if let Some(deal) = self.deals.iter_mut().find(|d| d.company_id == company_id && d.status != "closed") {
                    deal.weeks_left += 8;
                    deal.conditions = true;
                }
                self.fund.reputation = (self.fund.reputation - 5).max(0);
            }
            ("antitrust", "walk") => {
                if let Some(deal) = self.deals.iter_mut().find(|d| d.company_id == company_id && d.status != "closed") {
                    deal.status = "dead".into();
                }
                self.fund.reputation = (self.fund.reputation - 8).max(0);
            }
            ("down_round", "follow") => {
                self.follow_on(company_id, 7000, 400);
            }
            ("down_round", "hold") => {
                if let Some(holding) = self.holdings.iter_mut().find(|h| h.company_id == company_id) {
                    holding.ownership_bps = holding.ownership_bps * 50 / 100;
                }
                self.fund.reputation = (self.fund.reputation - 5).max(0);
            }
            ("earnout", "pay") => {
                let cost = 150;
                if self.fund.cash < cost {
                    return Err("need_capital");
                }
                self.fund.cash -= cost;
                self.record_flow("expense", -cost, company_id);
            }
            ("earnout", "litigate") => {
                self.fund.reputation = (self.fund.reputation - 12).max(0);
            }
            ("poach", "pay") => {
                let cost = 40;
                if self.fund.cash < cost {
                    return Err("need_capital");
                }
                self.fund.cash -= cost;
                self.record_flow("expense", -cost, "");
            }
            ("poach", "let") => {
                self.shock_growth(company_id, -80);
                self.fund.reputation = (self.fund.reputation - 6).max(0);
            }
            ("continuation", "roll") => {
                self.push("news.transfer", company_id, &self.company_name(company_id), "", "neutral");
                self.cleared.push(Cleared {
                    week: self.clock.absolute_week,
                    company_id: company_id.into(),
                    kind: "transfer".into(),
                    ev: 0,
                    proceeds: 0,
                });
            }
            ("continuation", "cash") => {
                self.fund.reputation = (self.fund.reputation + 5).min(1_000);
            }
            ("stalking", "bid") => {
                if let Some(deal) = self.deals.iter_mut().find(|d| d.company_id == company_id) {
                    deal.access = "open".into();
                    deal.weeks_left += 6;
                }
            }
            ("stalking", "pass") => {}
            ("refi", "extend") => {
                if let Some(company) = self.companies.iter_mut().find(|c| c.id == company_id) {
                    company.drivers.interest_rate_bps += 80;
                }
                let fee = 25;
                if self.fund.cash >= fee {
                    self.fund.cash -= fee;
                    self.record_flow("expense", -fee, company_id);
                }
            }
            ("refi", "wait") => {
                self.fund.reputation = (self.fund.reputation - 4).max(0);
            }
            ("auction", "raise") => {
                if let Some(deal) = self.deals.iter_mut().find(|d| d.company_id == company_id && d.status != "closed") {
                    deal.competing_ev = 0;
                    deal.weeks_left += 4;
                }
                self.fund.reputation = (self.fund.reputation + 2).min(1000);
            }
            ("auction", "walk") => {
                if let Some(deal) = self.deals.iter_mut().find(|d| d.company_id == company_id && d.status != "closed") {
                    deal.status = "dead".into();
                }
            }
            ("roadshow", "extend") => {
                self.fund.reputation = (self.fund.reputation + 6).min(1000);
            }
            ("roadshow", "delay") => {
                self.fund.reputation = (self.fund.reputation - 8).max(0);
            }
            ("covenant", "cure") => {
                let cure = 100;
                if self.fund.cash < cure {
                    return Err("need_capital");
                }
                self.fund.cash -= cure;
                self.record_flow("invest", -cure, company_id);
                if let Some(company) = self.companies.iter_mut().find(|c| c.id == company_id) {
                    company.books.cash += cure;
                    company.books.retained += cure;
                }
                if let Some(holding) = self.holdings.iter_mut().find(|h| h.company_id == company_id) {
                    holding.breached = false;
                }
            }
            ("covenant", "waive") => {
                let fee = 20;
                if self.fund.cash < fee {
                    return Err("need_capital");
                }
                self.fund.cash -= fee;
                self.record_flow("expense", -fee, company_id);
                self.fund.reputation = (self.fund.reputation - 8).max(0);
                if let Some(holding) = self.holdings.iter_mut().find(|h| h.company_id == company_id) {
                    holding.breached = false;
                }
            }
            _ => return Err("bad_state"),
        }
        Ok(())
    }

    fn write_off(&mut self, company_id: &str, amount: i64) {
        let Some(company) = self.companies.iter_mut().find(|c| c.id == company_id) else {
            return;
        };
        let hit = amount.min(company.books.cash).max(0);
        company.books.cash -= hit;
        company.books.retained -= hit;
        company.pending_sga += amount / 2;
    }

    fn shock_growth(&mut self, company_id: &str, delta: i64) {
        if let Some(company) = self.companies.iter_mut().find(|c| c.id == company_id) {
            company.drivers.growth_bps += delta;
        }
    }

    fn follow_on(&mut self, company_id: &str, keep_bps: i64, cost: i64) {
        if self.fund.cash >= cost {
            self.fund.cash -= cost;
            self.fund.invested_cost += cost;
            self.record_flow("invest", -cost, company_id);
            if let Some(holding) = self.holdings.iter_mut().find(|h| h.company_id == company_id) {
                holding.cost += cost;
                holding.ownership_bps = mul_div(holding.ownership_bps, keep_bps, 10_000).unwrap_or(holding.ownership_bps);
            }
        } else if let Some(holding) = self.holdings.iter_mut().find(|h| h.company_id == company_id) {
            holding.ownership_bps = holding.ownership_bps * 60 / 100;
        }
    }

    fn roll(&mut self) -> u64 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        self.rng
    }

    fn response_for(&mut self, index: usize, phase: Phase) -> Result<ResponseKind, &'static str> {
        let deal = &self.deals[index];
        let instrument = Instrument::parse(&deal.terms.instrument).ok_or("bad_state")?;
        if instrument.is_credit() {
            return Ok(credit_response(
                deal.terms.bid_size,
                deal.ask_size.max(1),
                deal.terms.coupon_bps,
                deal.ask_coupon_bps,
                self.fund.reputation,
            ));
        }
        let seller = SellerKind::parse(&deal.seller_kind).unwrap_or(SellerKind::Founder);
        let preferred = Instrument::parse(&deal.instrument).unwrap_or(instrument);
        let offer = Offer {
            bid_ev: deal.terms.bid_ev,
            instrument,
            preferred,
            seller,
            board_seats: deal.terms.board_seats,
            earnout: deal.terms.earnout,
            reputation: self.fund.reputation,
            competing_ev: deal.competing_ev,
            phase,
        };
        counterparty_response(&offer, deal.ask_ev.max(1)).map_err(|_| "bad_state")
    }

    fn maybe_raise(&mut self, index: usize) {
        let deal = &mut self.deals[index];
        if deal.process == "auction"
            && !deal.raised
            && deal.terms.bid_ev > deal.competing_ev
            && deal.status != "closed"
        {
            deal.competing_ev = deal.terms.bid_ev * 1_040 / 1_000;
            deal.raised = true;
        }
    }

    fn ic_votes(&self, index: usize) -> Vec<IcVote> {
        let deal = &self.deals[index];
        let company = self.companies.iter().find(|c| c.id == deal.company_id);
        let ebitda = company.map(|c| c.books.ebitda).unwrap_or(0);
        let multiple = company.map(|c| c.books.model_multiple_millis).unwrap_or(0);
        let margin = company.map(|c| c.drivers.gross_margin_bps).unwrap_or(0);
        let model = enterprise_value(ebitda, multiple).unwrap_or(0);
        let annual = (ebitda * 4).max(1);
        let leverage = deal.terms.debt * 1_000 / annual;
        let rich = model > 0 && deal.terms.bid_ev > model * 1_150 / 1_000;
        let buyout = deal.terms.instrument == "buyout";
        let han_yes = !rich && !(buyout && leverage > 5_500);
        let baek_yes = margin >= 1_800;
        let moon_yes = !(deal.stage == "growth" && model > 0 && deal.terms.bid_ev > model);
        let ryu_yes = leverage <= 6_000 && !(deal.stage == "distressed" && buyout && leverage > 4_500);
        let jeong_yes = !(buyout && !deal.terms.hundred_day_plan);
        let too_big = deal.terms.bid_ev > self.fund.commitments * 40 / 100;
        let seol_yes = self.fund.reputation >= 400 && !too_big;
        let vote = |partner: &str, yes: bool, reason: &str| IcVote {
            partner: partner.into(),
            yes,
            reason: reason.into(),
        };
        vec![
            vote(
                "han",
                han_yes,
                if rich {
                    "ic.han.rich"
                } else if !han_yes {
                    "ic.han.leverage"
                } else {
                    "ic.han.ok"
                },
            ),
            vote("baek", baek_yes, if baek_yes { "ic.baek.ok" } else { "ic.baek.margin" }),
            vote("moon", moon_yes, if moon_yes { "ic.moon.ok" } else { "ic.moon.growth" }),
            vote("ryu", ryu_yes, if ryu_yes { "ic.ryu.ok" } else { "ic.ryu.leverage" }),
            vote("jeong", jeong_yes, if jeong_yes { "ic.jeong.ok" } else { "ic.jeong.plan" }),
            vote(
                "seol",
                seol_yes,
                if self.fund.reputation < 400 {
                    "ic.seol.reputation"
                } else if too_big {
                    "ic.seol.size"
                } else {
                    "ic.seol.ok"
                },
            ),
        ]
    }

    fn apply_terms(&mut self, index: usize, cmd: &Value) {
        let terms = &mut self.deals[index].terms;
        if let Some(value) = cmd.get("instrument").and_then(|v| v.as_str()) {
            if Instrument::parse(value).is_some() {
                terms.instrument = value.to_string();
            }
        }
        copy_i64(cmd, "bid_ev", &mut terms.bid_ev);
        copy_i64(cmd, "bid_size", &mut terms.bid_size);
        copy_i64(cmd, "ownership_bps", &mut terms.ownership_bps);
        copy_i64(cmd, "coupon_bps", &mut terms.coupon_bps);
        copy_i64(cmd, "pref_millis", &mut terms.pref_millis);
        copy_i64(cmd, "earnout", &mut terms.earnout);
        copy_i64(cmd, "debt", &mut terms.debt);
        copy_i64(cmd, "debt_rate_bps", &mut terms.debt_rate_bps);
        copy_i64(cmd, "covenant_lev_millis", &mut terms.covenant_lev_millis);
        copy_i64(cmd, "covenant_cover_millis", &mut terms.covenant_cover_millis);
        copy_i64(cmd, "si_equity", &mut terms.si_equity);
        if let Some(value) = cmd.get("board_seats").and_then(|v| v.as_i64()) {
            terms.board_seats = value.clamp(0, 5) as i32;
        }
        if let Some(value) = cmd.get("covenants").and_then(|v| v.as_bool()) {
            terms.covenants = value;
        }
        if let Some(value) = cmd.get("drag").and_then(|v| v.as_bool()) {
            terms.drag = value;
        }
        if let Some(value) = cmd.get("tag").and_then(|v| v.as_bool()) {
            terms.tag = value;
        }
        if let Some(value) = cmd.get("hundred_day_plan").and_then(|v| v.as_bool()) {
            terms.hundred_day_plan = value;
        }
        if let Some(value) = cmd.get("si_id").and_then(|v| v.as_str()) {
            terms.si_id = value.to_string();
        }
        terms.ownership_bps = terms.ownership_bps.clamp(0, 10_000);
        terms.bid_ev = terms.bid_ev.max(0);
        terms.bid_size = terms.bid_size.max(0);
        terms.debt = terms.debt.max(0);
        terms.si_equity = terms.si_equity.max(0);
    }

    fn page_deals(&self, cmd: &Value) -> Value {
        let sector = json_str(cmd, "sector");
        let stage = json_str(cmd, "stage");
        let process = json_str(cmd, "process");
        let q = json_str(cmd, "q");
        let sort = json_str(cmd, "sort");
        let mut rows: Vec<&Deal> = self
            .deals
            .iter()
            .filter(|d| d.status != "dead")
            .filter(|d| stage.is_empty() || d.stage == stage)
            .filter(|d| process.is_empty() || d.process == process)
            .filter(|d| {
                if sector.is_empty() && q.is_empty() {
                    return true;
                }
                let Some(company) = self.companies.iter().find(|c| c.id == d.company_id) else {
                    return false;
                };
                (sector.is_empty() || company.sector_id == sector)
                    && (q.is_empty() || company.legal_name_ko.contains(&q))
            })
            .collect();
        rows.sort_by(|a, b| match sort.as_str() {
            "weeks" => a.weeks_left.cmp(&b.weeks_left),
            "name" => self
                .company_name(&a.company_id)
                .cmp(&self.company_name(&b.company_id)),
            _ => b.ask_ev.cmp(&a.ask_ev),
        });
        let total = rows.len();
        let offset = json_i64(cmd, "offset").max(0) as usize;
        let limit = (json_i64(cmd, "limit").clamp(1, 50) as usize).max(1);
        let page: Vec<Value> = rows
            .into_iter()
            .skip(offset)
            .take(limit)
            .map(|d| self.deal_row(d))
            .collect();
        json!({"kind": "deals", "total": total, "rows": page})
    }

    fn page_deal(&self, cmd: &Value) -> Result<Value, &'static str> {
        self.page_deal_id(&json_str(cmd, "id"))
    }

    fn page_deal_id(&self, id: &str) -> Result<Value, &'static str> {
        let deal = self.deals.iter().find(|d| d.id == id).ok_or("not_found")?;
        let mut row = self.deal_row(deal);
        row["terms"] = serde_json::to_value(&deal.terms).unwrap_or(Value::Null);
        row["log"] = serde_json::to_value(&deal.log).unwrap_or(Value::Null);
        row["ic"] = serde_json::to_value(&deal.ic).unwrap_or(Value::Null);
        row["conditions"] = json!(deal.conditions);
        row["locked"] = json!(!access_allowed(&deal.access, self.fund.reputation));
        Ok(json!({"kind": "deal", "deal": row}))
    }

    fn deal_row(&self, deal: &Deal) -> Value {
        let company = self.companies.iter().find(|c| c.id == deal.company_id);
        let broker = self.agents.iter().find(|a| a.id == deal.broker_id);
        json!({
            "id": deal.id,
            "company_id": deal.company_id,
            "name_ko": company.map(|c| if c.name_ko.is_empty() { c.legal_name_ko.as_str() } else { c.name_ko.as_str() }).unwrap_or(""),
            "legal_name_ko": company.map(|c| c.legal_name_ko.as_str()).unwrap_or(""),
            "revealed": company.map(|c| self.revealed(&c.id)).unwrap_or(false),
            "sector_id": company.map(|c| c.sector_id.as_str()).unwrap_or(""),
            "lat": company.map(|c| c.lat).unwrap_or(0.0),
            "lon": company.map(|c| c.lon).unwrap_or(0.0),
            "site_kind": company.and_then(|c| c.sites.first()).map(|s| s.kind.as_str()).unwrap_or("factory"),
            "stage": deal.stage,
            "process": deal.process,
            "access": deal.access,
            "seller_kind": deal.seller_kind,
            "broker_ko": broker.map(|a| a.name_ko.as_str()).unwrap_or(""),
            "instrument": deal.instrument,
            "ask_ev": company.filter(|c| self.revealed(&c.id)).map(|_| deal.ask_ev),
            "revenue": company.map(|c| c.books.revenue).unwrap_or(0),
            "total_assets": company.map(|c| c.books.total_assets()).unwrap_or(0),
            "ebit": company.map(|c| c.books.ebit).unwrap_or(0),
            "margin_bps": company.map(operating_margin_bps).unwrap_or(0),
            "motive": motive(deal),
            "ask_size": deal.ask_size,
            "ask_coupon_bps": deal.ask_coupon_bps,
            "weeks_left": deal.weeks_left,
            "status": deal.status,
            "competing_ev": deal.competing_ev,
            "competitor_ko": deal.competitor_ko,
            "locked": !access_allowed(&deal.access, self.fund.reputation)
        })
    }

    fn page_companies(&self, cmd: &Value) -> Value {
        let sector = json_str(cmd, "sector");
        let q = json_str(cmd, "q");
        let on_market = cmd.get("on_market").and_then(|v| v.as_bool()).unwrap_or(false);
        let mut rows: Vec<&Company> = self
            .companies
            .iter()
            .filter(|c| sector.is_empty() || c.sector_id == sector)
            .filter(|c| q.is_empty() || c.legal_name_ko.contains(&q) || c.name_ko.contains(&q) || c.region_label_ko.contains(&q))
            .filter(|c| in_range(c.books.revenue, json_opt_i64(cmd, "min_revenue"), json_opt_i64(cmd, "max_revenue")))
            .filter(|c| in_range(c.books.total_assets(), json_opt_i64(cmd, "min_assets"), json_opt_i64(cmd, "max_assets")))
            .filter(|c| in_range(c.books.ebitda, json_opt_i64(cmd, "min_ebitda"), json_opt_i64(cmd, "max_ebitda")))
            .filter(|c| in_range(c.books.net_income, json_opt_i64(cmd, "min_ni"), json_opt_i64(cmd, "max_ni")))
            .filter(|c| in_range(c.employees, json_opt_i64(cmd, "min_employees"), json_opt_i64(cmd, "max_employees")))
            .filter(|c| in_range(operating_margin_bps(c), json_opt_i64(cmd, "min_margin"), json_opt_i64(cmd, "max_margin")))
            .filter(|c| in_range(debt_ratio_bps(c), json_opt_i64(cmd, "min_debt"), json_opt_i64(cmd, "max_debt")))
            .filter(|c| in_range(c.drivers.growth_bps, json_opt_i64(cmd, "min_growth"), json_opt_i64(cmd, "max_growth")))
            .filter(|c| {
                let region = json_str(cmd, "region");
                region.is_empty() || c.region_label_ko.contains(&region)
            })
            .filter(|c| {
                !on_market
                    || self.deals.iter().any(|d| {
                        d.company_id == c.id && !matches!(d.status.as_str(), "dead" | "closed")
                    })
            })
            .collect();
        let sort = json_str(cmd, "sort");
        rows.sort_by(|a, b| match sort.as_str() {
            "name" => a.legal_name_ko.cmp(&b.legal_name_ko),
            "revenue" => b.books.revenue.cmp(&a.books.revenue),
            "assets" => b.books.total_assets().cmp(&a.books.total_assets()),
            "employees" => b.employees.cmp(&a.employees),
            "ni" => b.books.net_income.cmp(&a.books.net_income),
            _ => b.books.ebitda.cmp(&a.books.ebitda),
        });
        let total = rows.len();
        let offset = json_i64(cmd, "offset").max(0) as usize;
        let limit = json_i64(cmd, "limit").clamp(1, 50) as usize;
        let page: Vec<Value> = rows
            .into_iter()
            .skip(offset)
            .take(limit)
            .map(|c| self.company_row(c))
            .collect();
        json!({"kind": "companies", "total": total, "rows": page})
    }

    fn company_row(&self, company: &Company) -> Value {
        let revealed = self.revealed(&company.id);
        let net_debt = company.books.debt - company.books.cash;
        let ev = enterprise_value(company.books.ebitda, company.books.model_multiple_millis).unwrap_or(0);
        let show = |value: i64| if revealed { json!(value) } else { Value::Null };
        json!({
            "id": company.id,
            "name_ko": if company.name_ko.is_empty() { company.legal_name_ko.clone() } else { company.name_ko.clone() },
            "legal_name_ko": company.legal_name_ko,
            "country": company.country,
            "subindustry_id": company.subindustry_id,
            "sector_id": company.sector_id,
            "region_label_ko": company.region_label_ko,
            "complex_name_ko": company.complex_name_ko,
            "lat": company.lat,
            "lon": company.lon,
            "founded_year": company.founded_year,
            "employees": company.employees,
            "period": company.books.period,
            "revenue": company.books.revenue,
            "total_assets": company.books.total_assets(),
            "ebitda": show(company.books.ebitda),
            "net_income": show(company.books.net_income),
            "margin_bps": show(operating_margin_bps(company)),
            "debt_ratio_bps": show(debt_ratio_bps(company)),
            "growth_bps": show(company.drivers.growth_bps),
            "model_multiple_millis": show(company.books.model_multiple_millis),
            "debt": show(company.books.debt),
            "cash": show(company.books.cash),
            "model_ev": show(ev),
            "model_equity": show(ev - net_debt),
            "revealed": revealed,
            "dd_ready_week": company.dd_ready_week,
            "site_kind": company.sites.first().map(|s| s.kind.as_str()).unwrap_or("factory"),
            "held": self.holdings.iter().any(|h| h.company_id == company.id),
            "on_market": self.deals.iter().any(|d| d.company_id == company.id && !matches!(d.status.as_str(), "dead" | "closed"))
        })
    }

    fn page_company(&self, cmd: &Value) -> Result<Value, &'static str> {
        self.page_company_id(&json_str(cmd, "company_id"))
    }

    fn page_company_id(&self, id: &str) -> Result<Value, &'static str> {
        let revealed = self.revealed(id);
        let company = self.companies.iter().find(|c| c.id == id).ok_or("not_found")?;
        let holding = self.holdings.iter().find(|h| h.company_id == id);
        let mark = holding.map(|h| self.mark(h)).unwrap_or(0);
        Ok(json!({
            "kind": "company",
            "company": self.company_row(company),
            "books": if revealed { json!(company.books) } else { Value::Null },
            "generated": if revealed { json!(company.generated) } else { json!([]) },
            "drivers": if revealed { json!({
                "gross_margin_bps": company.drivers.gross_margin_bps,
                "sga_bps": company.drivers.sga_bps,
                "growth_bps": company.drivers.growth_bps,
                "dividend_payout_bps": company.drivers.dividend_payout_bps
            }) } else { Value::Null },
            "sites": company.sites,
            "cap": if revealed { json!(company.cap) } else { json!([]) },
            "management": company.management,
            "owner_kind": company.owner_kind,
            "position": holding.map(|h| json!({
                "instrument": h.instrument,
                "ownership_bps": h.ownership_bps,
                "cost": h.cost,
                "principal": h.principal,
                "distributions": h.distributions,
                "mark": mark,
                "moic_millis": if h.cost > 0 { (h.distributions + mark) * 1000 / h.cost } else { 0 },
                "board_seats": h.board_seats,
                "pending_agm": h.pending_agm,
                "breached": h.breached,
                "entry_ev": h.entry_ev,
                "control": self.is_control(id)
            })),
            "cleared": self.cleared.iter().filter(|c| c.company_id == id).collect::<Vec<_>>()
        }))
    }

    fn page_fund(&self) -> Value {
        let lps: Vec<&Agent> = self.agents.iter().filter(|a| a.kind == "lp").collect();
        let preview = self.preview_distribution(self.fund.cash);
        json!({
            "kind": "fund",
            "summary": self.fund_summary(),
            "lps": lps,
            "flows": self.flows.iter().rev().take(40).collect::<Vec<_>>(),
            "preview": preview,
            "sis": self.agents.iter().filter(|a| a.kind == "si").collect::<Vec<_>>(),
            "lenders": self.agents.iter().filter(|a| a.kind == "lender").collect::<Vec<_>>(),
            "candidates": self.candidates,
            "fund_ii_ready": self.fund_ii_ready(),
            "parked": self.parked,
            "active_slot": self.active_slot
        })
    }

    fn page_portfolio(&self) -> Value {
        let rows: Vec<Value> = self
            .holdings
            .iter()
            .map(|h| {
                let name = self.company_name(&h.company_id);
                let mark = self.mark(h);
                let company = self.companies.iter().find(|c| c.id == h.company_id);
                let issue = if self.open_events.iter().any(|e| !e.resolved && e.company_id == h.company_id) {
                    "issue"
                } else if company.is_some_and(|c| !c.management.iter().any(|m| m.role == "ceo")) {
                    "vacant"
                } else {
                    ""
                };
                let safety = if h.breached {
                    "breach"
                } else if company.is_some_and(|c| debt_ratio_bps(c) > 6_000) {
                    "watch"
                } else {
                    "healthy"
                };
                json!({
                    "company_id": h.company_id,
                    "legal_name_ko": name,
                    "sector_id": company.map(|c| c.sector_id.as_str()).unwrap_or(""),
                    "instrument": h.instrument,
                    "ownership_bps": h.ownership_bps,
                    "cost": h.cost,
                    "distributions": h.distributions,
                    "mark": mark,
                    "created": mark - h.cost,
                    "ebit": company.map(|c| c.books.ebit).unwrap_or(0),
                    "entry_week": h.invested_week,
                    "moic_millis": if h.cost > 0 { (h.distributions + mark) * 1000 / h.cost } else { 0 },
                    "board_seats": h.board_seats,
                    "pending_agm": h.pending_agm,
                    "breached": h.breached,
                    "action_used": h.action_used,
                    "control": self.is_control(&h.company_id),
                    "issue": issue,
                    "safety": safety
                })
            })
            .collect();
        let deployed: i64 = self.holdings.iter().filter(|h| h.fund_slot == self.active_slot).map(|h| h.cost).sum();
        let value: i64 = self.holdings.iter().filter(|h| h.fund_slot == self.active_slot).map(|h| self.mark(h)).sum();
        let distributed: i64 = self.holdings.iter().filter(|h| h.fund_slot == self.active_slot).map(|h| h.distributions).sum();
        let inflow: i64 = self
            .flows
            .iter()
            .filter(|f| f.week + 13 >= self.clock.absolute_week)
            .filter(|f| f.kind == "dividend" || f.kind == "coupon")
            .map(|f| f.amount.max(0))
            .sum();
        json!({
            "kind": "portfolio",
            "rows": rows,
            "candidates": self.candidates,
            "summary": {
                "deployed": deployed,
                "value": value,
                "moic_millis": if deployed > 0 { (value + distributed) * 1000 / deployed } else { 0 },
                "monthly": inflow / 3
            }
        })
    }

    fn page_market(&self) -> Value {
        let mut sectors: Vec<Value> = Vec::new();
        let mut ids: Vec<String> = self.companies.iter().map(|c| c.sector_id.clone()).collect();
        ids.sort();
        ids.dedup();
        for id in ids {
            let members: Vec<&Company> = self.companies.iter().filter(|c| c.sector_id == id).collect();
            let revenue: i64 = members.iter().map(|c| c.books.revenue.max(0)).sum();
            let index = self.index_of(members.iter().copied());
            let growth = if revenue > 0 {
                members.iter().map(|c| c.books.revenue.max(0).saturating_mul(c.drivers.growth_bps)).sum::<i64>() / revenue
            } else {
                0
            };
            let mut ranked = members.clone();
            ranked.sort_by_key(|c| -c.books.revenue);
            let bars: Vec<Value> = ranked
                .iter()
                .take(6)
                .map(|c| {
                    json!({
                        "id": c.id,
                        "name": if c.name_ko.is_empty() { c.legal_name_ko.clone() } else { c.name_ko.clone() },
                        "bps": if revenue > 0 { c.books.revenue.max(0) * 10_000 / revenue } else { 0 },
                        "held": self.holdings.iter().any(|h| h.company_id == c.id)
                    })
                })
                .collect();
            sectors.push(json!({
                "id": id,
                "index": index,
                "revenue": revenue,
                "growth_bps": growth,
                "bars": bars
            }));
        }
        let held: Vec<Value> = self
            .holdings
            .iter()
            .filter(|h| h.fund_slot == self.active_slot)
            .filter_map(|h| {
                let company = self.companies.iter().find(|c| c.id == h.company_id)?;
                let peers: Vec<&Company> = self.companies.iter().filter(|c| c.sector_id == company.sector_id).collect();
                let ahead = peers.iter().filter(|c| c.books.revenue > company.books.revenue).count() as i64;
                Some(json!({
                    "id": company.id,
                    "name": self.company_name(&company.id),
                    "sector_id": company.sector_id,
                    "rank": ahead + 1,
                    "of": peers.len() as i64
                }))
            })
            .collect();
        let index = self.market_index();
        json!({
            "kind": "market",
            "index": index,
            "spark": self.index_window,
            "policy_bps": self.policy_rate_bps,
            "neutral_bps": self.neutral_rate_bps,
            "inflation_bps": self.inflation_bps,
            "ipo": if index >= 108 { "open" } else if index >= 96 { "narrow" } else { "shut" },
            "lbo_bps": self.policy_rate_bps.saturating_add(450),
            "live": self.deals.iter().filter(|d| !matches!(d.status.as_str(), "dead" | "closed")).count(),
            "companies": self.companies.len(),
            "sectors": sectors,
            "held": held
        })
    }

    fn fund_summary(&self) -> Value {
        let nav = self.nav();
        let lp_nav = self.lp_nav(nav);
        json!({
            "name_ko": self.fund.name_ko,
            "commitments": self.fund.commitments,
            "paid_in": self.fund.paid_in,
            "uncalled": self.uncalled(),
            "dry_powder": self.uncalled(),
            "cash": self.fund.cash,
            "nav": nav,
            "lp_nav": lp_nav,
            "lp_distributed": self.fund.lp_distributed,
            "gp_distributed": self.fund.gp_distributed,
            "dpi_millis": self.dpi().ok(),
            "tvpi_millis": self.tvpi().ok(),
            "moic_millis": self.tvpi().ok(),
            "irr_bps": self.irr(),
            "reputation": self.fund.reputation,
            "fee_quarter": quarterly_management_fee(self.fee_base(), self.fund.fee_bps).unwrap_or(0),
            "hurdle_bps": self.fund.hurdle_bps,
            "carry_bps": self.fund.carry_bps,
            "fee_bps": self.fund.fee_bps,
            "investment_period_years": self.fund.investment_period_years,
            "term_years": self.fund.term_years,
            "vintage_year": self.fund.vintage_year,
            "fund_ii_commitments": self.fund.fund_ii_commitments,
            "fee_payable": self.fund.fee_payable,
            "overhead_month": (quarterly_management_fee(self.fee_base(), self.fund.fee_bps).unwrap_or(0)
                + self.fund.expenses_per_quarter)
                / 3
        })
    }

    fn dashboard(&self) -> Value {
        json!({
            "clock": self.clock,
            "fund": self.fund_summary(),
            "news": self.news,
            "alerts": self.alerts(),
            "holdings": self.holdings.len(),
            "deals": self.deals.iter().filter(|d| !matches!(d.status.as_str(), "dead" | "closed")).count(),
            "seed": self.seed,
            "events": self.open_events.iter().filter(|e| !e.resolved).collect::<Vec<_>>(),
            "activity": self.activity,
            "economy": {
                "index": self.market_index(),
                "spark": self.index_window,
                "policy_bps": self.policy_rate_bps,
                "neutral_bps": self.neutral_rate_bps,
                "inflation_bps": self.inflation_bps
            },
            "funds": {
                "active": self.fund.name_ko,
                "parked": self.parked.iter().map(|f| f.name_ko.clone()).collect::<Vec<_>>()
            }
        })
    }

    fn alerts(&self) -> Vec<Alert> {
        let mut alerts = Vec::new();
        if self.fund.paid_in > 0 && self.fund.cash < self.fund_summary_fee() {
            alerts.push(Alert {
                template: "alert.fee".into(),
                company_id: String::new(),
                company_ko: String::new(),
                deal_id: String::new(),
                event_id: 0,
            });
        }
        for deal in &self.deals {
            if deal.status == "countered" {
                alerts.push(Alert {
                    template: "alert.counter".into(),
                    company_id: deal.company_id.clone(),
                    company_ko: self.company_name(&deal.company_id),
                    deal_id: deal.id.clone(),
                    event_id: 0,
                });
            } else if deal.weeks_left <= 4
                && !matches!(deal.status.as_str(), "dead" | "closed")
            {
                alerts.push(Alert {
                    template: "alert.timetable".into(),
                    company_id: deal.company_id.clone(),
                    company_ko: self.company_name(&deal.company_id),
                    deal_id: deal.id.clone(),
                    event_id: 0,
                });
            }
        }
        for holding in &self.holdings {
            if holding.pending_agm {
                alerts.push(Alert {
                    template: "alert.agm".into(),
                    company_id: holding.company_id.clone(),
                    company_ko: self.company_name(&holding.company_id),
                    deal_id: String::new(),
                    event_id: 0,
                });
            }
            if holding.breached {
                alerts.push(Alert {
                    template: "alert.covenant".into(),
                    company_id: holding.company_id.clone(),
                    company_ko: self.company_name(&holding.company_id),
                    deal_id: String::new(),
                    event_id: 0,
                });
            }
        }
        if self.news.iter().any(|n| n.template == "news.quarter") {
            alerts.push(Alert {
                template: "alert.results".into(),
                company_id: String::new(),
                company_ko: String::new(),
                deal_id: String::new(),
                event_id: 0,
            });
        }
        if self.fund_ii_ready() {
            alerts.push(Alert {
                template: "alert.fund_ii".into(),
                company_id: String::new(),
                company_ko: String::new(),
                deal_id: String::new(),
                event_id: 0,
            });
        }
        for event in self.open_events.iter().filter(|event| !event.resolved) {
            alerts.push(Alert {
                template: format!("alert.{}", event.kind),
                company_id: event.company_id.clone(),
                company_ko: event.company_ko.clone(),
                deal_id: String::new(),
                event_id: event.id,
            });
        }
        alerts.truncate(12);
        alerts
    }

    fn fund_summary_fee(&self) -> i64 {
        quarterly_management_fee(self.fee_base(), self.fund.fee_bps).unwrap_or(0)
    }

    fn fee_base(&self) -> i64 {
        if self.clock.year < self.fund.vintage_year + self.fund.investment_period_years {
            self.fund.commitments
        } else {
            self.fund.invested_cost
        }
    }

    fn fund_ii_ready(&self) -> bool {
        if self.fund.fund_ii_commitments > 0 || self.active_slot > 0 {
            return false;
        }
        let period_done = self.clock.year >= self.fund.vintage_year + self.fund.investment_period_years;
        let deployed = self.fund.invested_cost >= self.fund.commitments && self.fund.commitments > 0;
        period_done || deployed
    }

    fn nav(&self) -> i64 {
        let marks: i64 = self
            .holdings
            .iter()
            .filter(|h| h.fund_slot == self.active_slot)
            .map(|h| self.mark(h))
            .sum();
        (self.fund.cash + marks - self.fund.fee_payable).max(0)
    }

    fn mark(&self, holding: &Holding) -> i64 {
        let Some(company) = self.companies.iter().find(|c| c.id == holding.company_id) else {
            return 0;
        };
        if Instrument::parse(&holding.instrument).is_some_and(|k| k.is_credit()) {
            return if holding.breached {
                holding.principal * 90 / 100
            } else {
                holding.principal
            };
        }
        let ev = enterprise_value(company.books.ebitda, company.books.model_multiple_millis).unwrap_or(0);
        let equity = ev - (company.books.debt - company.books.cash);
        mul_div(equity.max(0), holding.ownership_bps, 10_000).unwrap_or(0)
    }

    fn lp_nav(&self, nav: i64) -> i64 {
        self.preview_distribution(nav)
            .get("lp")
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
    }

    fn preview_distribution(&self, amount: i64) -> Value {
        if amount <= 0 {
            return json!({"lp": 0, "gp": 0, "roc": 0, "pref": 0, "catch_up_gp": 0, "residual_lp": 0, "residual_gp": 0});
        }
        let mut book = crate::waterfall::Waterfall {
            contributed: self.fund.paid_in,
            roc_paid: self.fund.roc_paid,
            pref_accrued: self.fund.pref_accrued,
            pref_paid: self.fund.pref_paid,
            gp_carry: self.fund.gp_carry,
        };
        match book.distribute(amount, self.fund.carry_bps) {
            Ok(split) => json!({
                "lp": split.lp,
                "gp": split.gp,
                "roc": split.roc,
                "pref": split.pref,
                "catch_up_gp": split.catch_up_gp,
                "residual_lp": split.residual_lp,
                "residual_gp": split.residual_gp
            }),
            Err(_) => json!({"lp": 0, "gp": 0}),
        }
    }

    fn dpi(&self) -> Result<i64, SimError> {
        dpi_millis(self.fund.lp_distributed, self.fund.paid_in)
    }

    fn tvpi(&self) -> Result<i64, SimError> {
        tvpi_millis(self.fund.lp_distributed, self.lp_nav(self.nav()), self.fund.paid_in)
    }

    fn irr(&self) -> Option<i64> {
        let mut flows = self.lp_quarters.clone();
        if let Some(last) = flows.last_mut() {
            *last += self.lp_nav(self.nav());
        }
        crate::irr::annualized_irr_bps(&flows)
    }

    fn uncalled(&self) -> i64 {
        (self.fund.commitments - self.fund.paid_in).max(0)
    }

    fn is_control(&self, company_id: &str) -> bool {
        self.holdings.iter().any(|h| {
            h.company_id == company_id
                && (h.instrument == "buyout" || h.ownership_bps >= 5_000 || h.board_seats >= 2)
        })
    }

    fn company_name(&self, id: &str) -> String {
        self.companies
            .iter()
            .find(|c| c.id == id)
            .map(|c| {
                if c.name_ko.is_empty() {
                    c.legal_name_ko
                        .trim_start_matches("주식회사 ")
                        .trim_end_matches(" 주식회사")
                        .to_string()
                } else {
                    c.name_ko.clone()
                }
            })
            .unwrap_or_default()
    }

    fn deal_index(&self, id: &str) -> Option<usize> {
        self.deals.iter().position(|d| d.id == id)
    }

    fn shock(&mut self) -> i64 {
        let mut x = self.rng.max(1);
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng = x;
        (x % 301) as i64 - 150
    }

    fn push(&mut self, template: &str, company_id: &str, company_ko: &str, period: &str, tone: &str) {
        self.news_seq += 1;
        push_news(
            &mut self.news,
            NewsItem {
                id: self.news_seq,
                template: template.into(),
                week: self.clock.absolute_week,
                company_id: company_id.into(),
                company_ko: company_ko.into(),
                period: period.into(),
                tone: tone.into(),
                lane: lane_for(template).into(),
            },
        );
    }

    fn note(&mut self, template: &str, company_ko: &str) {
        self.news_seq += 1;
        let period = format!("{}Q{}", self.clock.year, self.clock.quarter);
        push_news(
            &mut self.activity,
            NewsItem {
                id: self.news_seq,
                template: template.into(),
                week: self.clock.absolute_week,
                company_id: String::new(),
                company_ko: company_ko.into(),
                period,
                tone: "neutral".into(),
                lane: "ops".into(),
            },
        );
    }

    fn remember_index(&mut self) {
        self.index_window.push(self.market_index());
        if self.index_window.len() > 8 {
            let drop_count = self.index_window.len() - 8;
            self.index_window.drain(0..drop_count);
        }
    }

    fn market_index(&self) -> i64 {
        self.index_of(self.companies.iter())
    }

    fn index_of<'a>(&self, companies: impl Iterator<Item = &'a Company>) -> i64 {
        let mut weighted = 0i64;
        let mut base = 0i64;
        for company in companies {
            let revenue = company.books.revenue.max(0);
            let floor = company.drivers.base_multiple_millis;
            if revenue == 0 || floor <= 0 {
                continue;
            }
            weighted = weighted.saturating_add(revenue.saturating_mul(company.books.model_multiple_millis));
            base = base.saturating_add(revenue.saturating_mul(floor));
        }
        if base <= 0 {
            100
        } else {
            (weighted * 100 / base).clamp(40, 180)
        }
    }

    fn record_flow(&mut self, kind: &str, amount: i64, company_id: &str) {
        self.flow_seq += 1;
        self.flows.push(Flow {
            id: self.flow_seq,
            week: self.clock.absolute_week,
            kind: kind.into(),
            amount,
            company_id: company_id.into(),
        });
        if self.flows.len() > 80 {
            let drop_count = self.flows.len() - 80;
            self.flows.drain(0..drop_count);
        }
    }

    fn log_deal(&mut self, index: usize, template: &str, ev: i64) {
        let week = self.clock.absolute_week;
        let deal = &mut self.deals[index];
        deal.log.push(DealLog {
            template: template.into(),
            week,
            ev,
        });
        if deal.log.len() > 12 {
            let drop_count = deal.log.len() - 12;
            deal.log.drain(0..drop_count);
        }
    }

    fn ok(&self, page: Value) -> String {
        json!({"ok": true, "dashboard": self.dashboard(), "page": page}).to_string()
    }

    fn err(&self, code: &str, _page: Value) -> String {
        json!({"ok": false, "error": code, "dashboard": self.dashboard()}).to_string()
    }
}

fn shape_deal(deal: DealBoot) -> Deal {
    let terms = Terms {
        instrument: deal.instrument.clone(),
        bid_ev: deal.ask_ev,
        bid_size: deal.ask_size,
        ownership_bps: if deal.instrument == "buyout" { 10_000 } else { 2_000 },
        coupon_bps: deal.ask_coupon_bps,
        pref_millis: if deal.instrument == "rcps" { 1_000 } else { 0 },
        board_seats: if deal.instrument == "buyout" { 2 } else { 1 },
        covenants: true,
        drag: deal.instrument == "buyout",
        tag: true,
        earnout: 0,
        debt: 0,
        debt_rate_bps: 800,
        covenant_lev_millis: 5_500,
        covenant_cover_millis: 2_000,
        si_id: String::new(),
        si_equity: 0,
        hundred_day_plan: false,
    };
    Deal {
        id: deal.id,
        company_id: deal.company_id,
        stage: deal.stage,
        process: deal.process,
        access: deal.access,
        seller_kind: deal.seller_kind,
        broker_id: deal.broker_id,
        instrument: deal.instrument,
        ask_ev: deal.ask_ev,
        ask_size: deal.ask_size,
        ask_coupon_bps: deal.ask_coupon_bps,
        weeks_left: deal.weeks_left,
        status: "listed".into(),
        competing_ev: deal.competing_ev,
        competitor_ko: deal.competitor_ko,
        raised: false,
        rejects: 0,
        conditions: false,
        ic_bid_ev: 0,
        terms,
        log: Vec::new(),
        ic: Vec::new(),
    }
}

fn json_opt_i64(cmd: &Value, key: &str) -> Option<i64> {
    cmd.get(key).and_then(|v| v.as_i64())
}

fn in_range(value: i64, low: Option<i64>, high: Option<i64>) -> bool {
    low.is_none_or(|floor| value >= floor) && high.is_none_or(|cap| value <= cap)
}

fn motive(deal: &Deal) -> &'static str {
    if deal.seller_kind == "court" || deal.weeks_left <= 8 {
        "urgent"
    } else if matches!(deal.seller_kind.as_str(), "pe_exit" | "conglomerate" | "family") {
        "need"
    } else {
        "market"
    }
}

fn lane_for(template: &str) -> &'static str {
    match template {
        "news.quarter" | "news.opening" | "news.fee" | "news.fund_ii" | "news.distribution" | "news.roadshow" => "macro",
        "news.ebitda_up" | "news.ebitda_down" | "news.deal_listed" | "news.auction" | "news.auction_lost" => "markets",
        "news.fraud"
        | "news.strike"
        | "news.down_round"
        | "news.poach"
        | "news.antitrust"
        | "news.earnout"
        | "news.continuation"
        | "news.stalking"
        | "news.refi"
        | "news.covenant"
        | "news.agm"
        | "news.agm_missed"
        | "news.agm_done" => "companies",
        _ => "deals",
    }
}

fn operating_margin_bps(company: &Company) -> i64 {
    if company.books.revenue <= 0 {
        return 0;
    }
    company.books.ebit * 10_000 / company.books.revenue
}

fn debt_ratio_bps(company: &Company) -> i64 {
    let assets = company.books.total_assets();
    if assets <= 0 {
        return 0;
    }
    company.books.debt * 10_000 / assets
}

fn json_str(cmd: &Value, key: &str) -> String {
    cmd.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
}

fn json_i64(cmd: &Value, key: &str) -> i64 {
    cmd.get(key).and_then(|v| v.as_i64()).unwrap_or(0)
}

fn copy_i64(cmd: &Value, key: &str, slot: &mut i64) {
    if let Some(value) = cmd.get(key).and_then(|v| v.as_i64()) {
        *slot = value;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::close::{Books, Drivers};

    fn sample_drivers() -> Drivers {
        Drivers {
            gross_margin_bps: 3_000,
            sga_bps: 1_600,
            growth_bps: 80,
            interest_rate_bps: 600,
            da_rate_bps: 200,
            capex_bps: 250,
            dso_days: 42,
            dio_days: 38,
            dpo_days: 35,
            tax_bps: 2_200,
            dividend_payout_bps: 1_000,
            min_cash_bps: 800,
            amort_bps: 150,
            dividend_leverage_cap_millis: 4_000,
            base_multiple_millis: 8_000,
            rate_beta_millis: 6_000,
            cycle_amplitude_millis: 60,
            multiple_floor_millis: 4_500,
            multiple_cap_millis: 12_000,
        }
    }

    fn sample_books() -> Books {
        Books {
            period: "2024Q4".into(),
            revenue: 4_000,
            cogs: 2_800,
            gross_profit: 1_200,
            sga: 640,
            ebitda: 560,
            da: 80,
            ebit: 480,
            interest: 40,
            ebt: 440,
            tax: 97,
            net_income: 343,
            cash: 400,
            ar: 500,
            inv: 300,
            gross_ppe: 2_000,
            accum_dep: 400,
            net_ppe: 1_600,
            ap: 280,
            debt: 1_200,
            share_capital: 800,
            retained: 520,
            dividends: 0,
            cfo: 0,
            cfi: 0,
            cff: 0,
            net_change: 0,
            model_multiple_millis: 7_500,
        }
    }

    fn company(id: &str, openness: i64) -> Company {
        Company {
            id: id.into(),
            name_ko: id.into(),
            legal_name_ko: format!("주식회사 {id}"),
            country: "KR".into(),
            subindustry_id: "food".into(),
            sector_id: "food_manufacturing".into(),
            region_label_ko: "경기 서부".into(),
            complex_name_ko: "가온 식품단지".into(),
            lat: 37.2,
            lon: 126.8,
            founded_year: 2004,
            employees: 80,
            owner_kind: "founder".into(),
            owner_openness: openness,
            approach_stage: "buyout".into(),
            approach_instrument: "buyout".into(),
            quarter_index: 8,
            drivers: sample_drivers(),
            books: sample_books(),
            sites: vec![Site {
                id: format!("{id}-f"),
                kind: "factory".into(),
                name_ko: "공장".into(),
                lat: 37.21,
                lon: 126.81,
                book_value: 400,
                capacity: 12,
            }],
            cap: vec![CapRow {
                holder_ko: "창업자".into(),
                holder_kind: "founder".into(),
                stake_bps: 10_000,
            }],
            management: vec![Manager {
                id: format!("{id}-ceo"),
                name_ko: "김가온".into(),
                role: "ceo".into(),
                trait_id: "operator".into(),
            }],
            generated: Vec::new(),
            pending_sale: 0,
            pending_sga: 0,
            dd_ready_week: 0,
        }
    }

    fn boot_two() -> Game {
        let text = json!({
            "seed": 7,
            "clock": {"year": 2025, "quarter": 1, "week_in_quarter": 0, "absolute_week": 0},
            "policy_rate_bps": 350,
            "neutral_rate_bps": 250,
            "fund": {
                "name_ko": "III호",
                "commitments": 50_000,
                "fee_bps": 200,
                "hurdle_bps": 800,
                "carry_bps": 2000,
                "investment_period_years": 5,
                "term_years": 10,
                "vintage_year": 2022,
                "expenses_per_quarter": 15,
                "reputation": 620
            },
            "agents": [
                {"id": "lp1", "name_ko": "서린 공제회", "kind": "lp", "subtype": "pension", "commitment": 50_000},
                {"id": "ib1", "name_ko": "가온 증권", "kind": "ib", "subtype": "bank", "commitment": 0},
                {"id": "si1", "name_ko": "온새 식품", "kind": "si", "subtype": "strategic", "commitment": 0}
            ],
            "candidates": [
                {"id": "cand-op", "name_ko": "오운영", "trait_id": "operator"}
            ],
            "companies": [company("co-001", 800), company("co-002", 100)],
            "deals": [{
                "id": "dl-001",
                "company_id": "co-001",
                "stage": "buyout",
                "process": "bilateral",
                "access": "invite",
                "seller_kind": "founder",
                "broker_id": "ib1",
                "instrument": "buyout",
                "ask_ev": 4_000,
                "ask_size": 4_000,
                "ask_coupon_bps": 0,
                "weeks_left": 30,
                "competing_ev": 0,
                "competitor_ko": ""
            }]
        });
        let mut game = Game::boot(&text.to_string()).unwrap();
        game.clock.absolute_week = 1;
        for company in &mut game.companies {
            company.dd_ready_week = 1;
        }
        game
    }

    #[test]
    fn a_quarter_charges_the_fee_and_keeps_the_books() {
        let mut game = boot_two();
        game.handle(r#"{"op":"call_capital","amount":10000}"#);
        game.handle(r#"{"op":"advance_weeks","weeks":13}"#);
        assert_eq!(game.clock.year, 2025);
        assert_eq!(game.clock.quarter, 2);
        assert!(game.flows.iter().any(|f| f.kind == "fee"));
        assert_eq!(game.fund.cash, 10_000 - 250 - 15);
        let company = &game.companies[0];
        assert_eq!(
            company.books.total_assets(),
            company.books.total_liabilities() + company.books.total_equity()
        );
        assert!(game.news.len() <= crate::news::WINDOW);
        assert!(game.news.iter().any(|n| n.template == "news.quarter"));
    }

    #[test]
    fn binding_needs_the_committee_and_then_cash() {
        let mut game = boot_two();
        let denied = game.handle(r#"{"op":"binding","id":"dl-001","bid_ev":4000,"instrument":"buyout","hundred_day_plan":true,"debt":0}"#);
        assert!(denied.contains("ic_required"));
        game.fund.reputation = 300;
        let locked = game.handle(r#"{"op":"ioi","id":"dl-001","bid_ev":4000,"instrument":"buyout"}"#);
        assert!(locked.contains("access"));
        game.fund.reputation = 700;
        game.handle(r#"{"op":"loi","id":"dl-001","bid_ev":4200,"instrument":"buyout","hundred_day_plan":true,"debt":0,"board_seats":2}"#);
        let ic = game.handle(r#"{"op":"ic","id":"dl-001"}"#);
        assert!(ic.contains("ic_ok") || ic.contains("ic_hold"), "{ic}");
        if game.deals[0].status == "ic_ok" {
            let poor = game.handle(r#"{"op":"binding","id":"dl-001"}"#);
            assert!(poor.contains("need_capital"));
            game.handle(r#"{"op":"call_capital","amount":20000}"#);
            let closed = game.handle(r#"{"op":"binding","id":"dl-001"}"#);
            assert!(closed.contains("\"ok\":true"), "{closed}");
            assert_eq!(game.deals[0].status, "closed");
            assert_eq!(game.holdings.len(), 1);
            assert!(!game.cleared.is_empty());
        }
    }

    #[test]
    fn distribution_follows_the_waterfall_buckets() {
        let mut game = boot_two();
        game.handle(r#"{"op":"call_capital","amount":10000}"#);
        game.fund.pref_accrued = 800;
        let raw = game.handle(r#"{"op":"distribute","amount":15000}"#);
        assert!(raw.contains("need") || raw.contains("amount") || raw.contains("\"ok\":false"));
        // Cash is only 10_000, so 15_000 is refused. Distribute what is on hand after a fee-free start.
        let raw = game.handle(r#"{"op":"distribute","amount":10000}"#);
        let parsed: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["page"]["roc"], 10_000);
        assert_eq!(parsed["page"]["gp"], 0);
        assert_eq!(game.fund.cash, 0);
        assert_eq!(game.fund.lp_distributed, 10_000);
    }

    #[test]
    fn a_cold_owner_declines_and_a_warm_one_opens_a_proprietary_deal() {
        let mut game = boot_two();
        game.fund.reputation = 400;
        let cold = game.handle(r#"{"op":"approach","company_id":"co-002"}"#);
        assert!(cold.contains("approach_no") || cold.contains("\"ok\":true"));
        assert!(game.deals.iter().all(|d| d.company_id != "co-002"));
        game.fund.reputation = 700;
        let warm = game.handle(r#"{"op":"approach","company_id":"co-002"}"#);
        // openness 100 + (700-500)/5 = 140, threshold 550, still no.
        assert!(game.deals.iter().all(|d| d.company_id != "co-002"), "{warm}");
        game.companies[1].owner_openness = 800;
        let yes = game.handle(r#"{"op":"approach","company_id":"co-002"}"#);
        assert!(yes.contains("proprietary"), "{yes}");
    }

    #[test]
    fn save_and_load_keep_the_cash() {
        let mut game = boot_two();
        game.handle(r#"{"op":"call_capital","amount":2500}"#);
        let saved = game.export_json();
        let loaded = Game::import_json(&saved).unwrap();
        assert_eq!(loaded.fund.cash, 2_500);
        assert_eq!(loaded.fund.commitments, 50_000);
        assert_eq!(loaded.news.len(), game.news.len());
    }

    #[test]
    fn the_board_hides_the_price_and_the_index_stays_a_multiple() {
        let mut game = boot_two();
        for company in &mut game.companies {
            company.dd_ready_week = 0;
        }
        game.clock.absolute_week = 0;
        let raw = game.handle(r#"{"op":"deals","limit":20}"#);
        let parsed: Value = serde_json::from_str(&raw).unwrap();
        let row = &parsed["page"]["rows"][0];
        assert!(row["ask_ev"].is_null());
        assert!(row["ebit"].as_i64().is_some());
        assert!(row["motive"].as_str().is_some());
        let market = game.handle(r#"{"op":"market"}"#);
        let page: Value = serde_json::from_str(&market).unwrap();
        let index = page["page"]["index"].as_i64().unwrap();
        assert!((40..=180).contains(&index));
        assert!(page["page"]["spark"].as_array().unwrap().len() <= 8);
        assert!(page["page"]["lbo_bps"].as_i64().unwrap() > page["page"]["policy_bps"].as_i64().unwrap());
        for _ in 0..20 {
            game.handle(r#"{"op":"call_capital","amount":1}"#);
        }
        assert!(game.activity.len() <= 16);
    }

    #[test]
    fn news_does_not_grow_without_a_bound() {
        let mut game = boot_two();
        for _ in 0..6 {
            game.handle(r#"{"op":"advance_weeks","weeks":13}"#);
        }
        assert!(game.news.len() <= crate::news::WINDOW);
    }

    #[test]
    fn the_playable_book_boots_when_the_generator_has_written_it() {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../public/atlas/boot.json");
        if !path.exists() {
            return;
        }
        let text = std::fs::read_to_string(path).unwrap();
        let mut game = Game::boot(&text).unwrap();
        assert!(game.companies.len() >= 100);
        let live = game
            .deals
            .iter()
            .filter(|d| !matches!(d.status.as_str(), "dead" | "closed"))
            .count();
        assert!(live * 100 / game.companies.len() >= 5);
        assert!(live * 100 / game.companies.len() <= 10);
        assert_eq!(game.fund.commitments, 50_000);
        assert!(game.deals.len() >= 8);
        let lp: i64 = game
            .agents
            .iter()
            .filter(|agent| agent.kind == "lp")
            .map(|agent| agent.commitment)
            .sum();
        assert_eq!(lp, 50_000);
        game.handle(r#"{"op":"advance_weeks","weeks":13}"#);
        for company in &game.companies {
            assert_eq!(
                company.books.total_assets(),
                company.books.total_liabilities() + company.books.total_equity(),
                "{}",
                company.id
            );
        }
        assert!(game.news.len() <= crate::news::WINDOW);
        assert_eq!(game.fund.fee_bps, 200);
        assert_eq!(game.fund.hurdle_bps, 800);
        assert_eq!(game.fund.carry_bps, 2_000);
    }

    #[test]
    fn diligence_hides_the_mark_until_the_week_arrives() {
        let mut game = boot_two();
        game.handle(r#"{"op":"call_capital","amount":1000}"#);
        game.companies[0].dd_ready_week = 0;
        let hidden: Value = serde_json::from_str(&game.handle(r#"{"op":"company","company_id":"co-001"}"#)).unwrap();
        assert!(hidden["page"]["company"]["model_ev"].is_null());
        let started: Value = serde_json::from_str(&game.handle(r#"{"op":"start_dd","company_id":"co-001"}"#)).unwrap();
        assert!(started["page"]["company"]["model_ev"].is_null());
        assert!(game.flows.iter().any(|flow| flow.kind == "expense"));
        game.handle(r#"{"op":"advance_weeks","weeks":6}"#);
        let shown: Value = serde_json::from_str(&game.handle(r#"{"op":"company","company_id":"co-001"}"#)).unwrap();
        assert!(shown["page"]["company"]["model_ev"].as_i64().unwrap() > 0);
    }

    #[test]
    fn the_next_fund_waits_for_the_investment_period() {
        let mut game = boot_two();
        let blocked = game.handle(r#"{"op":"raise_fund_ii"}"#);
        assert!(blocked.contains("bad_state"));
        game.fund.invested_cost = game.fund.commitments;
        assert!(game.fund_ii_ready());
        let raised = game.handle(r#"{"op":"raise_fund_ii"}"#);
        assert!(raised.contains("\"ok\":true"), "{raised}");
        assert_eq!(game.active_slot, 1);
        assert_eq!(game.parked.len(), 1);
        assert!(game.fund.commitments >= 20_000);
    }
}
