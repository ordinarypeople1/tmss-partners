//! One company: its books, one month of operations, and its model value.
//!
//! The three statements tie every month. `Books::balances` is the identity
//! and the tests run it over decades. A model value is not a price.

use serde::{Deserialize, Serialize};

use crate::content::{CompanySeed, Industry};
use crate::economy::Economy;
use crate::market::Process;
use crate::math::{div_round, mul_bps, mul_millis, ratio_bps, ratio_millis};
use crate::portfolio::Holding;
use crate::rng::Rng;

pub const HISTORY_MONTHS: usize = 36;
/// Lenders stop funding shortfalls past this leverage, in thousandths.
const LENDER_STOP_MILLIS: i64 = 7_500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Owner {
    Founder {
        age: u8,
    },
    Sponsor {
        house: u8,
        months_held: u32,
    },
    Corporate,
    /// Listed. It has no quoted price here; a price appears only if someone takes it private.
    Public,
    Player,
    Lender,
    /// Absorbed into another company. Out of the universe.
    Merged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DdStream {
    Financial,
    Commercial,
    Operational,
    Legal,
}

pub const DD_STREAMS: [DdStream; 4] = [
    DdStream::Financial,
    DdStream::Commercial,
    DdStream::Operational,
    DdStream::Legal,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueKind {
    InventoryOverstated,
    CustomerConcentration,
    DeferredMaintenance,
    EnvironmentalLiability,
    KeyPerson,
    LaborDispute,
}

impl IssueKind {
    pub fn stream(self) -> DdStream {
        match self {
            IssueKind::InventoryOverstated => DdStream::Financial,
            IssueKind::CustomerConcentration => DdStream::Commercial,
            IssueKind::DeferredMaintenance | IssueKind::KeyPerson => DdStream::Operational,
            IssueKind::EnvironmentalLiability | IssueKind::LaborDispute => DdStream::Legal,
        }
    }
}

/// What makes one company unlike the next. Each trait changes a rule somewhere.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trait {
    /// One site makes everything. An outage stops the company.
    SinglePlant,
    /// Multi-year contracts: steady revenue.
    LongTermContracts,
    /// Old machines: more maintenance spending, a lower multiple.
    AgingEquipment,
    /// A name customers pay for: price rises land better.
    BrandStrength,
    /// A long-tenured local workforce: cuts cost more goodwill.
    FamilyWorkforce,
    /// Sells abroad: swings harder with the cycle.
    ExportHeavy,
    /// Subscriptions or service contracts: steadier and worth more.
    RecurringRevenue,
    /// Many small competitors: bolt-ons integrate cheaply.
    FragmentedMarket,
    /// Demand comes in seasons: noisier months.
    SeasonalDemand,
    /// A process competitors cannot copy: worth more.
    ProprietaryProcess,
    /// Nobody has pushed sales: an expansion pays more.
    UnderinvestedSales,
    /// Paid by regulated or public payers: exposed to rule changes.
    RegulatedCustomers,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CeoStyle {
    Operator,
    Seller,
    Engineer,
    Financier,
    Patriarch,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ceo {
    pub name: String,
    #[serde(default)]
    pub feminine: bool,
    pub age: u8,
    /// Years in the job.
    pub tenure: u8,
    pub style: CeoStyle,
    /// The owner runs the company.
    pub founder: bool,
}

/// How an owner behaves across the table.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stance {
    /// Cares who buys and what happens to the people.
    Sentimental,
    /// Holds out for the last dollar.
    PriceMaximizer,
    /// Wants it done.
    Hurried,
    Balanced,
}

/// Something diligence can find. Unfound, it goes off after the close.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Issue {
    pub kind: IssueKind,
    /// Size of the damage in basis points; what it scales depends on the kind.
    pub severity_bps: i64,
    pub found: bool,
    pub triggered: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Books {
    pub cash: i64,
    pub accounts_receivable: i64,
    pub inventory: i64,
    pub gross_ppe: i64,
    pub accumulated_depreciation: i64,
    /// Arises only at an acquisition. Never amortized.
    pub goodwill: i64,
    pub accounts_payable: i64,
    pub debt: i64,
    pub share_capital: i64,
    pub retained_earnings: i64,
}

impl Books {
    pub fn net_ppe(&self) -> i64 {
        self.gross_ppe - self.accumulated_depreciation
    }
    pub fn total_assets(&self) -> i64 {
        self.cash + self.accounts_receivable + self.inventory + self.net_ppe() + self.goodwill
    }
    pub fn total_liabilities(&self) -> i64 {
        self.accounts_payable + self.debt
    }
    pub fn total_equity(&self) -> i64 {
        self.share_capital + self.retained_earnings
    }
    pub fn balances(&self) -> bool {
        self.total_assets() == self.total_liabilities() + self.total_equity()
    }
    pub fn net_working_capital(&self) -> i64 {
        self.accounts_receivable + self.inventory - self.accounts_payable
    }
}

/// One month's income statement and cash flow.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct MonthResult {
    pub revenue: i64,
    pub cogs: i64,
    pub sga: i64,
    pub ebitda: i64,
    pub da: i64,
    pub interest: i64,
    pub tax: i64,
    pub net_income: i64,
    pub change_in_nwc: i64,
    pub capex: i64,
    pub debt_draw: i64,
    pub debt_repayment: i64,
    pub dividends: i64,
    pub opening_cash: i64,
    pub closing_cash: i64,
}

impl MonthResult {
    pub fn cash_from_operations(&self) -> i64 {
        self.net_income + self.da - self.change_in_nwc
    }
    /// Cash the business made before financing choices.
    pub fn free_cash_flow(&self) -> i64 {
        self.cash_from_operations() - self.capex
    }
}

/// What the owner does with the month's cash. Shares are of monthly revenue
/// (the two budgets) or of cash above the floor (sweep, dividend).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Budget {
    pub growth_bps: i64,
    pub efficiency_bps: i64,
    pub sweep_pct: i64,
    pub dividend_pct: i64,
}

/// A temporary push on monthly revenue growth.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrowthEffect {
    pub months_left: u32,
    pub growth_bps: i64,
    /// Months before it starts to bite.
    #[serde(default)]
    pub starts_in: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Company {
    pub id: String,
    pub legal_name: String,
    pub sector: usize,
    pub country: String,
    pub admin1: String,
    pub site_name: String,
    pub lat: f64,
    pub lon: f64,
    pub founded_year: i32,
    pub employees: i64,
    pub union_strength_bps: i64,

    pub base_multiple_millis: i64,
    pub gross_margin_bps: i64,
    /// Monthly, in money.
    pub sga_fixed: i64,
    pub sga_variable_bps: i64,
    /// Structural monthly revenue growth.
    pub growth_bps: i64,
    /// Spread over the policy rate on this company's debt.
    pub debt_spread_bps: i64,
    /// The all-in rate when the debt was swapped to fixed at a buyout. None floats.
    #[serde(default)]
    pub fixed_rate_bps: Option<i64>,
    pub dso_adjust_days: i64,
    pub dio_adjust_days: i64,
    /// 1 through 20.
    pub management: i64,
    pub customer_concentration_bps: i64,
    pub issues: Vec<Issue>,
    pub traits: Vec<Trait>,
    /// Index into the sector's product lines; the catalog names it.
    pub product: u8,
    pub ceo: Ceo,
    pub stance: Stance,
    pub effects: Vec<GrowthEffect>,
    /// Margin the efficiency budget has added so far.
    pub efficiency_gained_bps: i64,

    /// Current monthly revenue.
    pub revenue: i64,
    pub books: Books,
    pub last: MonthResult,
    pub revenue_history: Vec<i64>,
    pub ebitda_history: Vec<i64>,
    pub fcf_history: Vec<i64>,
    /// Closed quarters, oldest first. See `ledger.rs`.
    #[serde(default)]
    pub ledger: Vec<crate::ledger::Period>,
    /// The quarter still running.
    #[serde(default)]
    pub open_quarter: crate::ledger::Period,

    pub owner: Owner,
    pub budget: Budget,
    pub process: Option<Process>,
    /// Months before the owner will consider a sale again.
    pub cooldown: u32,
    /// 0 through 100: how well the owner knows the player.
    pub relationship: i64,
    pub watched: bool,
    pub holding: Option<Holding>,
    /// A liquidity shortfall the lenders would not fund this month.
    pub shortfall: bool,
    /// Equity the current sponsor paid. Zero unless a rival house owns it.
    #[serde(default)]
    pub sponsor_cost: i64,
    /// Months before the owner will hear another unsolicited proposal.
    #[serde(default)]
    pub approach_cooldown: u32,
    /// A rival house that has proposed to the owner.
    #[serde(default)]
    pub suitor: Option<crate::rivals::Suitor>,
    /// The player's proposal, while the owner thinks it over.
    #[serde(default)]
    pub pending: Option<crate::sourcing::Pending>,
}

fn monthly_ebitda(
    revenue: i64,
    gross_margin_bps: i64,
    sga_fixed: i64,
    sga_variable_bps: i64,
) -> i64 {
    mul_bps(revenue, gross_margin_bps) - sga_fixed - mul_bps(revenue, sga_variable_bps)
}

impl Ceo {
    /// A professional manager brought in from outside.
    pub fn hired(rng: &mut Rng, country: &str) -> Ceo {
        let (name, feminine) = crate::people::name(rng, country);
        Ceo {
            name,
            feminine,
            age: rng.range(42, 62) as u8,
            tenure: rng.range(0, 9) as u8,
            style: [
                CeoStyle::Operator,
                CeoStyle::Seller,
                CeoStyle::Engineer,
                CeoStyle::Financier,
            ][rng.below(4) as usize],
            founder: false,
        }
    }
}

impl Company {
    pub fn has(&self, wanted: Trait) -> bool {
        self.traits.contains(&wanted)
    }

    /// The founder steps back; an outsider takes the chair.
    pub fn replace_ceo(&mut self, rng: &mut Rng) {
        self.ceo = Ceo::hired(rng, &self.country);
        self.ceo.tenure = 0;
    }

    pub fn from_seed(
        seed: &CompanySeed,
        sector: usize,
        industry: &Industry,
        rng: &mut Rng,
    ) -> Company {
        let sga_total = mul_bps(seed.monthly_revenue, seed.sga_ratio_bps);
        let sga_fixed = sga_total * 45 / 100;
        let sga_variable_bps = seed.sga_ratio_bps * 55 / 100;
        // Who owns companies differs by country: family firms in Germany,
        // group subsidiaries in Korea and Japan, sponsors at home.
        let (founders, sponsors) = match seed.country.as_str() {
            "US" => (52, 30),
            "GB" => (45, 35),
            "DE" => (70, 12),
            "FR" => (55, 22),
            "KR" => (50, 10),
            "JP" => (55, 8),
            _ => (65, 10),
        };
        let draw = rng.below(100) as i64;
        let owner = if draw < founders {
            Owner::Founder {
                age: rng.range(44, 74) as u8,
            }
        } else if draw < founders + sponsors {
            Owner::Sponsor {
                house: crate::market::pick_house(&seed.country, rng),
                months_held: rng.range(0, 66) as u32,
            }
        } else if seed.country == "US" && seed.monthly_revenue >= 9_000 && rng.chance_bps(4_000) {
            Owner::Public
        } else {
            Owner::Corporate
        };
        let mut books = Books {
            cash: seed.cash,
            accounts_receivable: seed.accounts_receivable,
            inventory: seed.inventory,
            gross_ppe: seed.gross_ppe,
            accumulated_depreciation: seed.accumulated_depreciation,
            goodwill: 0,
            accounts_payable: seed.accounts_payable,
            debt: seed.debt,
            share_capital: seed.share_capital,
            retained_earnings: seed.retained_earnings,
        };
        let ebitda = monthly_ebitda(
            seed.monthly_revenue,
            seed.gross_margin_bps,
            sga_fixed,
            sga_variable_bps,
        );
        let mut debt_spread_bps = industry.interest_spread_bps;
        if let Owner::Sponsor { .. } = owner {
            // A sponsor bought it with debt. Push the same amount out of equity.
            let target = mul_millis(ebitda * 12, rng.range(3_200, 4_800));
            if target > books.debt {
                let added = target - books.debt;
                books.debt += added;
                books.retained_earnings -= added;
                debt_spread_bps += 150;
            }
        }
        let mut issues = Vec::new();
        for kind in [
            IssueKind::InventoryOverstated,
            IssueKind::CustomerConcentration,
            IssueKind::DeferredMaintenance,
            IssueKind::EnvironmentalLiability,
            IssueKind::KeyPerson,
            IssueKind::LaborDispute,
        ] {
            let chance = match kind {
                IssueKind::LaborDispute => 600 + seed.union_strength_bps / 5,
                IssueKind::InventoryOverstated if seed.inventory == 0 => 0,
                _ => 1_300,
            };
            if rng.chance_bps(chance as u32) {
                issues.push(Issue {
                    kind,
                    severity_bps: rng.range(600, 2_000),
                    found: false,
                    triggered: false,
                });
            }
        }
        let has_concentration = issues
            .iter()
            .any(|issue| issue.kind == IssueKind::CustomerConcentration);
        // Plants and machines only where there are plants and machines.
        let asset_heavy = industry.capex_ratio_bps >= 150;
        let mut pool = vec![
            Trait::LongTermContracts,
            Trait::BrandStrength,
            Trait::FamilyWorkforce,
            Trait::FragmentedMarket,
            Trait::SeasonalDemand,
            Trait::UnderinvestedSales,
            Trait::ProprietaryProcess,
        ];
        if asset_heavy {
            pool.extend([
                Trait::SinglePlant,
                Trait::AgingEquipment,
                Trait::ExportHeavy,
            ]);
        } else {
            pool.extend([Trait::RecurringRevenue, Trait::RegulatedCustomers]);
        }
        let mut traits = Vec::new();
        for _ in 0..rng.range(2, 3) {
            let pick = pool.remove(rng.below(pool.len() as u64) as usize);
            traits.push(pick);
        }
        let ceo = match owner {
            Owner::Founder { age } => {
                let (name, feminine) = crate::people::name(rng, &seed.country);
                Ceo {
                    name,
                    feminine,
                    age,
                    tenure: (age.saturating_sub(32)).min(40),
                    style: if rng.chance_bps(4_000) {
                        CeoStyle::Patriarch
                    } else {
                        [CeoStyle::Operator, CeoStyle::Seller, CeoStyle::Engineer]
                            [rng.below(3) as usize]
                    },
                    founder: true,
                }
            }
            _ => Ceo::hired(rng, &seed.country),
        };
        let stance = match (owner, rng.below(100)) {
            (Owner::Founder { .. }, 0..=34) => Stance::Sentimental,
            (Owner::Founder { .. }, 35..=59) => Stance::PriceMaximizer,
            (Owner::Founder { .. }, 60..=74) => Stance::Hurried,
            (Owner::Founder { .. }, _) => Stance::Balanced,
            (_, 0..=39) => Stance::PriceMaximizer,
            _ => Stance::Balanced,
        };
        let free_cash = ebitda - mul_bps(seed.monthly_revenue, industry.capex_ratio_bps);
        Company {
            id: seed.id.clone(),
            legal_name: seed.legal_name.clone(),
            sector,
            country: seed.country.clone(),
            admin1: seed.admin1.clone(),
            site_name: seed.site_name.clone(),
            lat: seed.lat,
            lon: seed.lon,
            founded_year: seed.founded_year,
            employees: seed.employees,
            union_strength_bps: seed.union_strength_bps,
            base_multiple_millis: seed.base_multiple_millis,
            gross_margin_bps: seed.gross_margin_bps,
            sga_fixed,
            sga_variable_bps,
            growth_bps: industry.monthly_growth_bps
                + rng.noise(industry.monthly_growth_std_bps / 3),
            debt_spread_bps,
            fixed_rate_bps: None,
            dso_adjust_days: 0,
            dio_adjust_days: 0,
            management: (10 + rng.noise(3)).clamp(1, 20),
            customer_concentration_bps: if has_concentration {
                rng.range(3_500, 6_000)
            } else {
                rng.range(600, 3_000)
            },
            issues,
            traits,
            product: rng.below(6) as u8,
            ceo,
            stance,
            effects: Vec::new(),
            efficiency_gained_bps: 0,
            revenue: seed.monthly_revenue,
            books,
            last: MonthResult::default(),
            revenue_history: vec![seed.monthly_revenue; 12],
            ebitda_history: vec![ebitda; 12],
            fcf_history: vec![free_cash; 12],
            ledger: Vec::new(),
            open_quarter: crate::ledger::Period::default(),
            owner,
            budget: Budget::default(),
            process: None,
            cooldown: rng.range(0, 18) as u32,
            relationship: 0,
            watched: false,
            holding: None,
            shortfall: false,
            sponsor_cost: 0,
            approach_cooldown: 0,
            suitor: None,
            pending: None,
        }
    }

    pub fn is_active(&self) -> bool {
        self.owner != Owner::Merged
    }

    pub fn is_abroad(&self) -> bool {
        self.country != "US"
    }

    pub fn is_player_owned(&self) -> bool {
        self.owner == Owner::Player
    }

    fn trailing(history: &[i64]) -> i64 {
        history.iter().rev().take(12).sum()
    }
    pub fn ttm_revenue(&self) -> i64 {
        Self::trailing(&self.revenue_history)
    }
    pub fn ttm_ebitda(&self) -> i64 {
        Self::trailing(&self.ebitda_history)
    }
    pub fn ttm_fcf(&self) -> i64 {
        Self::trailing(&self.fcf_history)
    }
    pub fn ebitda_margin_bps(&self) -> i64 {
        ratio_bps(self.ttm_ebitda(), self.ttm_revenue())
    }
    pub fn net_debt(&self) -> i64 {
        self.books.debt - self.books.cash
    }
    /// Net debt over trailing EBITDA, in thousandths. 99 000 when EBITDA is not positive.
    pub fn leverage_millis(&self) -> i64 {
        let ebitda = self.ttm_ebitda();
        if ebitda <= 0 {
            99_000
        } else {
            ratio_millis(self.net_debt().max(0), ebitda)
        }
    }
    pub fn interest_rate_bps(&self, economy: &Economy) -> i64 {
        self.fixed_rate_bps
            .unwrap_or(economy.policy_rate_bps + self.debt_spread_bps)
    }
    /// Trailing EBITDA over a year of interest at today's rate, in thousandths.
    pub fn interest_cover_millis(&self, economy: &Economy) -> i64 {
        let interest = mul_bps(self.books.debt, self.interest_rate_bps(economy));
        if interest <= 0 {
            99_000
        } else {
            ratio_millis(self.ttm_ebitda().max(0), interest)
        }
    }

    /// Quality and size, as a multiplier on the multiple in basis points.
    pub fn quality_bps(&self, industry: &Industry) -> i64 {
        let management = (self.management - 10) * 120;
        let concentration = -((self.customer_concentration_bps - 3_000).max(0) / 5);
        let growth = ((self.growth_bps - industry.monthly_growth_bps) * 20).clamp(-800, 800);
        let size = match self.ttm_ebitda() {
            ebitda if ebitda < 5_000 => -800,
            ebitda if ebitda < 15_000 => 0,
            ebitda if ebitda < 40_000 => 600,
            _ => 1_200,
        };
        let mut character = 0;
        for (wanted, worth) in [
            (Trait::RecurringRevenue, 400),
            (Trait::ProprietaryProcess, 250),
            (Trait::BrandStrength, 200),
            (Trait::LongTermContracts, 150),
            (Trait::AgingEquipment, -250),
            (Trait::SinglePlant, -150),
        ] {
            if self.has(wanted) {
                character += worth;
            }
        }
        10_000 + management + concentration + growth + size + character
    }

    /// base × rate × cycle × phase × quality, clamped. Thousandths of a turn.
    pub fn multiple_millis(&self, industry: &Industry, economy: &Economy) -> i64 {
        let mut multiple = self.base_multiple_millis;
        multiple = mul_millis(
            multiple,
            economy.rate_factor_millis(industry.rate_beta_millis),
        );
        multiple = mul_bps(multiple, 10_000 + economy.sector_cycle_bps[self.sector]);
        multiple = mul_bps(multiple, economy.phase_multiple_bps());
        multiple = mul_bps(multiple, self.quality_bps(industry));
        multiple.clamp(
            industry.multiple_floor_millis * 85 / 100,
            industry.multiple_cap_millis * 115 / 100,
        )
    }

    /// Trailing EBITDA times the model multiple. A thin business is floored at a quarter of revenue.
    pub fn model_ev(&self, industry: &Industry, economy: &Economy) -> i64 {
        let by_earnings = mul_millis(self.ttm_ebitda(), self.multiple_millis(industry, economy));
        by_earnings.max(self.ttm_revenue() / 4)
    }

    pub fn model_equity(&self, industry: &Industry, economy: &Economy) -> i64 {
        self.model_ev(industry, economy) - self.net_debt()
    }

    pub fn min_cash(&self, industry: &Industry) -> i64 {
        mul_bps(self.revenue * 3, industry.min_cash_to_revenue_bps)
    }

    fn push_history(history: &mut Vec<i64>, value: i64) {
        history.push(value);
        if history.len() > HISTORY_MONTHS {
            history.remove(0);
        }
    }

    /// Runs one month. Returns the dividends paid to the owners.
    pub fn step(&mut self, industry: &Industry, economy: &Economy, rng: &mut Rng) -> i64 {
        let player = self.is_player_owned();
        let budget = if player {
            self.budget
        } else {
            Budget::default()
        };

        // Revenue.
        let steady = self.has(Trait::RecurringRevenue) || self.has(Trait::LongTermContracts);
        let noise_pct = if self.has(Trait::SeasonalDemand) {
            160
        } else if steady {
            55
        } else {
            100
        };
        let cycle_pct = if self.has(Trait::ExportHeavy) {
            150
        } else {
            100
        };
        let mut growth = self.growth_bps
            + economy.growth_bps(self.sector, industry) * cycle_pct / 100
            + rng.noise(industry.monthly_growth_std_bps * noise_pct / 100)
            + (self.management - 10) * 2;
        growth +=
            budget.growth_bps.min(200) * 12 / 100 + (budget.growth_bps - 200).max(0) * 6 / 100;
        for effect in &mut self.effects {
            if effect.starts_in > 0 {
                effect.starts_in -= 1;
                continue;
            }
            growth += effect.growth_bps;
            effect.months_left -= 1;
        }
        self.effects.retain(|effect| effect.months_left > 0);
        self.revenue = mul_bps(self.revenue, 10_000 + growth.clamp(-2_500, 2_500)).max(1);
        if budget.efficiency_bps > 0 && self.efficiency_gained_bps < 600 {
            let gain = (budget.efficiency_bps / 50).max(1);
            self.gross_margin_bps += gain;
            self.efficiency_gained_bps += gain;
        }
        // Fixed cost creeps with wages, and competitors copy what works.
        self.sga_fixed = mul_bps(self.sga_fixed, 10_025);
        self.gross_margin_bps += rng.noise(6) - 1;

        // Income statement.
        let revenue = self.revenue;
        let cogs = revenue - mul_bps(revenue, self.gross_margin_bps);
        let sga = self.sga_fixed + mul_bps(revenue, self.sga_variable_bps);
        let ebitda = revenue - cogs - sga;
        let da =
            mul_bps(self.books.net_ppe(), industry.monthly_da_rate_bps).min(self.books.net_ppe());
        let interest = div_round(self.books.debt * self.interest_rate_bps(economy), 120_000);
        let ebt = ebitda - da - interest;
        let tax = mul_bps(ebt.max(0), industry.tax_rate_bps);
        let net_income = ebt - tax;

        // Working capital.
        let receivable = div_round(
            revenue * (industry.dso_days + self.dso_adjust_days).max(5),
            30,
        );
        let inventory = div_round(cogs * (industry.dio_days + self.dio_adjust_days).max(0), 30);
        let payable = div_round(cogs * industry.dpo_days, 30);
        let change_in_nwc = (receivable + inventory - payable) - self.books.net_working_capital();

        // Investing.
        let upkeep = if self.has(Trait::AgingEquipment) {
            50
        } else {
            0
        };
        let capex = mul_bps(
            revenue,
            industry.capex_ratio_bps + upkeep + budget.growth_bps + budget.efficiency_bps,
        );

        // Financing.
        let opening_cash = self.books.cash;
        let before_financing = opening_cash + net_income + da - change_in_nwc - capex;
        let floor = self.min_cash(industry);
        let mut repayment = 0;
        let mut draw = 0;
        let mut dividends = 0;
        self.shortfall = false;
        if before_financing < floor {
            let needed = floor - before_financing;
            let annual = (Self::trailing(&self.ebitda_history)
                - self.ebitda_history.last().copied().unwrap_or(0)
                + ebitda)
                .max(0);
            let lender_room = (mul_millis(annual, LENDER_STOP_MILLIS) - self.books.debt).max(0);
            draw = needed.min(lender_room);
            if draw < needed {
                self.shortfall = true;
                // The lenders stop. Whatever keeps cash from going negative is still drawn.
                draw = draw.max(-(before_financing.min(0)));
            }
        } else {
            let excess = before_financing - floor;
            if player {
                repayment = (excess * budget.sweep_pct.clamp(0, 100) / 100).min(self.books.debt);
                dividends = (excess - repayment) * budget.dividend_pct.clamp(0, 100) / 100;
            } else {
                repayment = (self.books.debt / 200).min(excess).min(self.books.debt);
                let annual = Self::trailing(&self.ebitda_history).max(1);
                let leverage = ratio_millis(self.books.debt - repayment, annual);
                if net_income > 0 && leverage <= industry.dividend_leverage_cap_millis {
                    dividends =
                        mul_bps(net_income, industry.dividend_payout_bps).min(excess - repayment);
                }
            }
        }
        let closing_cash = before_financing + draw - repayment - dividends;

        // Balance sheet.
        self.books.cash = closing_cash;
        self.books.accounts_receivable = receivable;
        self.books.inventory = inventory;
        self.books.accounts_payable = payable;
        self.books.gross_ppe += capex;
        self.books.accumulated_depreciation += da;
        self.books.debt += draw - repayment;
        self.books.retained_earnings += net_income - dividends;

        self.last = MonthResult {
            revenue,
            cogs,
            sga,
            ebitda,
            da,
            interest,
            tax,
            net_income,
            change_in_nwc,
            capex,
            debt_draw: draw,
            debt_repayment: repayment,
            dividends,
            opening_cash,
            closing_cash,
        };
        Self::push_history(&mut self.revenue_history, revenue);
        Self::push_history(&mut self.ebitda_history, ebitda);
        let fcf = self.last.free_cash_flow();
        Self::push_history(&mut self.fcf_history, fcf);
        let month = self.last.clone();
        self.open_quarter.add_month(&month);

        match &mut self.owner {
            Owner::Sponsor { months_held, .. } => *months_held += 1,
            _ => {}
        }
        self.cooldown = self.cooldown.saturating_sub(1);
        self.approach_cooldown = self.approach_cooldown.saturating_sub(1);
        dividends
    }

    /// Ages a founder by a year. Called each January.
    pub fn new_year(&mut self) {
        if let Owner::Founder { age } = &mut self.owner {
            *age = age.saturating_add(1);
        }
    }

    /// Cash in from the owners. Raises share capital.
    pub fn inject_equity(&mut self, amount: i64) {
        self.books.cash += amount;
        self.books.share_capital += amount;
    }

    /// Repays debt from cash on hand, up to what is there.
    pub fn repay_from_cash(&mut self, amount: i64) -> i64 {
        let paid = amount.min(self.books.debt).min(self.books.cash).max(0);
        self.books.cash -= paid;
        self.books.debt -= paid;
        paid
    }

    /// New borrowing paid straight out to the owners.
    pub fn recapitalize(&mut self, amount: i64) {
        self.books.debt += amount;
        self.books.retained_earnings -= amount;
    }

    /// Restates the books at a purchase. Cash is left at the floor, old debt
    /// is replaced, and goodwill takes the excess of the price over the
    /// operating assets. Equity becomes cash + price − debt.
    pub fn acquire(&mut self, industry: &Industry, enterprise_value: i64, new_debt: i64) {
        let cash = self.min_cash(industry);
        let operating = self.books.net_working_capital() + self.books.net_ppe();
        self.books.cash = cash;
        self.books.goodwill = (enterprise_value - operating).max(0);
        self.books.debt = new_debt;
        // New debt, new terms: whatever swap there was ends with the old loan.
        self.fixed_rate_bps = None;
        let equity = self.books.total_assets() - self.books.total_liabilities();
        self.books.share_capital = equity;
        self.books.retained_earnings = 0;
    }

    /// Folds another company into this one. `synergy_bps` comes off the target's fixed cost.
    pub fn absorb(&mut self, target: &Company, synergy_bps: i64) {
        let combined = self.revenue + target.revenue;
        self.gross_margin_bps = div_round(
            self.gross_margin_bps * self.revenue + target.gross_margin_bps * target.revenue,
            combined,
        );
        self.sga_variable_bps = div_round(
            self.sga_variable_bps * self.revenue + target.sga_variable_bps * target.revenue,
            combined,
        );
        self.growth_bps = div_round(
            self.growth_bps * self.revenue + target.growth_bps * target.revenue,
            combined,
        );
        self.customer_concentration_bps = div_round(
            self.customer_concentration_bps * self.revenue
                + target.customer_concentration_bps * target.revenue,
            combined,
        ) * 85
            / 100;
        self.sga_fixed += mul_bps(target.sga_fixed, 10_000 - synergy_bps);
        self.revenue = combined;
        self.employees += target.employees * 92 / 100;
        for (mine, theirs) in [
            (&mut self.revenue_history, &target.revenue_history),
            (&mut self.ebitda_history, &target.ebitda_history),
            (&mut self.fcf_history, &target.fcf_history),
        ] {
            let offset = mine.len().saturating_sub(theirs.len());
            for (index, value) in theirs.iter().enumerate() {
                if let Some(slot) = mine.get_mut(index + offset) {
                    *slot += value;
                }
            }
        }
        self.books.accounts_receivable += target.books.accounts_receivable;
        self.books.inventory += target.books.inventory;
        self.books.gross_ppe += target.books.gross_ppe;
        self.books.accumulated_depreciation += target.books.accumulated_depreciation;
        self.books.accounts_payable += target.books.accounts_payable;
        for mine in &mut self.ledger {
            if let Some(theirs) = target
                .ledger
                .iter()
                .find(|period| period.year == mine.year && period.quarter == mine.quarter)
            {
                mine.absorb(theirs);
            }
        }
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn industry() -> Industry {
        Industry {
            sector_id: "industrial_components".into(),
            monthly_growth_bps: 20,
            monthly_growth_std_bps: 80,
            monthly_da_rate_bps: 60,
            capex_ratio_bps: 300,
            interest_spread_bps: 320,
            tax_rate_bps: 2_500,
            dso_days: 58,
            dio_days: 70,
            dpo_days: 48,
            min_cash_to_revenue_bps: 700,
            dividend_payout_bps: 800,
            dividend_leverage_cap_millis: 4_000,
            base_multiple_millis: 7_200,
            rate_beta_millis: 7_000,
            cycle_amplitude_bps: 800,
            multiple_floor_millis: 4_000,
            multiple_cap_millis: 11_000,
        }
    }

    pub fn seed() -> CompanySeed {
        // 10 000 a month of revenue at a 27% gross margin and 12% SG&A.
        let (ar, inv, ppe, accum, ap, debt, cash) =
            (19_333, 17_033, 100_000, 34_000, 11_680, 30_000, 2_100);
        let equity = cash + ar + inv + ppe - accum - ap - debt;
        CompanySeed {
            id: "co-test".into(),
            legal_name: "Test Works Inc.".into(),
            sector_id: "industrial_components".into(),
            country: "US".into(),
            admin1: "US-OH".into(),
            site_name: "Test Park".into(),
            lat: 40.0,
            lon: -83.0,
            founded_year: 1990,
            employees: 400,
            union_strength_bps: 5_000,
            base_multiple_millis: 7_200,
            gross_margin_bps: 2_700,
            sga_ratio_bps: 1_200,
            monthly_revenue: 10_000,
            cash,
            accounts_receivable: ar,
            inventory: inv,
            gross_ppe: ppe,
            accumulated_depreciation: accum,
            accounts_payable: ap,
            debt,
            share_capital: 20_000,
            retained_earnings: equity - 20_000,
        }
    }

    pub fn company(rng_seed: u64) -> Company {
        Company::from_seed(&seed(), 0, &industry(), &mut Rng::new(rng_seed))
    }

    #[test]
    fn the_opening_books_balance() {
        for rng_seed in 0..50 {
            assert!(company(rng_seed).books.balances());
        }
    }

    #[test]
    fn the_statements_tie_every_month_for_thirty_years() {
        let industry = industry();
        for rng_seed in 0..25 {
            let mut rng = Rng::new(rng_seed);
            let mut economy = Economy::new(1, &mut rng, crate::economy::Era::HighRates);
            let mut company = company(rng_seed);
            let industries = [industry.clone()];
            for month in 1..=360 {
                economy.step(&mut rng, &industries, month % 3 == 0);
                let equity_before = company.books.total_equity();
                let debt_before = company.books.debt;
                company.step(&industry, &economy, &mut rng);
                let last = &company.last;
                assert!(company.books.balances(), "seed {rng_seed} month {month}");
                assert_eq!(last.ebitda, last.revenue - last.cogs - last.sga);
                assert_eq!(
                    last.closing_cash,
                    last.opening_cash + last.cash_from_operations() - last.capex + last.debt_draw
                        - last.debt_repayment
                        - last.dividends
                );
                assert_eq!(company.books.cash, last.closing_cash);
                assert_eq!(
                    company.books.total_equity(),
                    equity_before + last.net_income - last.dividends
                );
                assert_eq!(
                    company.books.debt,
                    debt_before + last.debt_draw - last.debt_repayment
                );
                assert!(company.books.cash >= 0, "seed {rng_seed} month {month}");
                assert!(company.books.debt >= 0);
                assert!(last.dividends >= 0);
            }
        }
    }

    #[test]
    fn value_is_trailing_ebitda_times_the_model_multiple() {
        let industry = industry();
        let economy = Economy::new(1, &mut Rng::new(0), crate::economy::Era::HighRates);
        let company = company(1);
        let multiple = company.multiple_millis(&industry, &economy);
        assert_eq!(
            company.model_ev(&industry, &economy),
            mul_millis(company.ttm_ebitda(), multiple)
        );
        assert_eq!(
            company.model_equity(&industry, &economy),
            company.model_ev(&industry, &economy) - company.net_debt()
        );
    }

    #[test]
    fn lower_rates_raise_the_multiple() {
        let industry = industry();
        let mut economy = Economy::new(1, &mut Rng::new(0), crate::economy::Era::HighRates);
        let company = company(1);
        let high_rates = company.multiple_millis(&industry, &economy);
        economy.policy_rate_bps = 200;
        assert!(company.multiple_millis(&industry, &economy) > high_rates);
    }

    #[test]
    fn an_acquisition_restates_the_books_and_they_still_balance() {
        let industry = industry();
        let mut company = company(2);
        company.acquire(&industry, 120_000, 60_000);
        assert!(company.books.balances());
        assert_eq!(company.books.debt, 60_000);
        assert_eq!(
            company.books.total_equity(),
            company.books.cash + 120_000 - 60_000
        );
        company.inject_equity(5_000);
        company.recapitalize(10_000);
        assert_eq!(company.repay_from_cash(1_000), 1_000);
        assert!(company.books.balances());
    }

    #[test]
    fn the_player_budget_sweeps_debt_and_pays_dividends() {
        let industry = industry();
        let economy = Economy::new(1, &mut Rng::new(0), crate::economy::Era::HighRates);
        let mut rng = Rng::new(4);
        let mut company = company(4);
        company.owner = Owner::Player;
        company.books.cash += 20_000;
        company.books.share_capital += 20_000;
        company.budget = Budget {
            growth_bps: 0,
            efficiency_bps: 0,
            sweep_pct: 50,
            dividend_pct: 100,
        };
        let paid = company.step(&industry, &economy, &mut rng);
        assert!(company.last.debt_repayment > 0);
        assert!(paid > 0);
        assert_eq!(paid, company.last.dividends);
        assert!(company.books.balances());
    }
}
