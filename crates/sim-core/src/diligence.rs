//! What a diligence report says. Each stream reads the company as it is in
//! the simulation, so the report is true: the add-backs and write-downs a
//! quality-of-earnings review finds, the market and customers behind the
//! growth case, the plant and the people, the contracts and the liabilities.
//! A hidden issue the stream covers is found and sized. Financial and
//! commercial work also set the diligence case against the management case
//! in the memorandum.

use serde::{Deserialize, Serialize};

use crate::calendar::GameDate;
use crate::company::{DdStream, IssueKind, Owner, Trait};
use crate::math::{mul_bps, ratio_bps};
use crate::rng::Rng;
use crate::world::World;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tone {
    Good,
    Neutral,
    Bad,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FindingKind {
    // Financial
    /// Reported against adjusted EBITDA: owner costs added back, one-offs taken out.
    QualityOfEarnings,
    InventoryWriteDown,
    WorkingCapital,
    NetDebt,
    // Commercial
    MarketGrowth,
    GrowthVsMarket,
    CustomerConcentration,
    PricingPower,
    ContractedRevenue,
    // Operational
    Management,
    CapexBacklog,
    AgingEquipment,
    SinglePlant,
    KeyPerson,
    // Legal
    Environmental,
    LaborDispute,
    ChangeOfControl,
    Permits,
    CleanTitle,
}

/// One line of a report: what was found, how it reads, and its size.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Finding {
    pub kind: FindingKind,
    pub tone: Tone,
    /// An amount in thousand USD, where the finding has one.
    pub amount: i64,
    /// A rate or share in basis points, where the finding has one.
    pub bps: i64,
}

/// The diligence case set against what the memorandum says.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Outlook {
    /// Annual revenue growth over the next three years, basis points.
    pub management_growth_bps: i64,
    pub diligence_growth_bps: i64,
    pub management_margin_bps: i64,
    pub diligence_margin_bps: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Report {
    pub stream: DdStream,
    pub date: GameDate,
    pub findings: Vec<Finding>,
    pub outlook: Option<Outlook>,
}

fn finding(kind: FindingKind, tone: Tone, amount: i64, bps: i64) -> Finding {
    Finding { kind, tone, amount, bps }
}

impl World {
    /// The management case: what the memorandum promises. Sellers are
    /// optimists; how much depends on the company and is the same every time.
    fn management_case(&self, company: usize) -> (i64, i64) {
        let mut rng = Rng::new(self.seed ^ (company as u64 + 3).wrapping_mul(0x94D0_49BB_1331_11EB));
        let (growth, margin) = self.diligence_case(company);
        (growth + rng.range(150, 450), margin + rng.range(60, 220))
    }

    /// Growth and EBITDA margin as the simulation will actually run them,
    /// before the cycle: the company's own trend and today's margin.
    fn diligence_case(&self, company: usize) -> (i64, i64) {
        let target = &self.companies[company];
        let industry = &self.industries[target.sector];
        let monthly = target.growth_bps + (target.management - 10) * 2 + industry.monthly_growth_bps / 4;
        // Monthly compounding into an annual rate, in basis points.
        let annual = ((1.0 + monthly as f64 / 10_000.0).powi(12) - 1.0) * 10_000.0;
        let margin = target.ebitda_margin_bps();
        // The cycle sits on top: a slowdown or a recession takes some off.
        let cycle = self.economy.growth_bps(target.sector, industry) * 6;
        (annual.round() as i64 + cycle, margin)
    }

    /// Writes the report for one stream. Finds the stream's issues as a side effect.
    pub(crate) fn write_report(&mut self, company: usize, stream: DdStream) -> Report {
        let mut findings = Vec::new();
        let mut outlook = None;
        let mut rng = Rng::new(self.seed ^ (company as u64 * 31 + stream as u64 + 1).wrapping_mul(0xBF58_476D_1CE4_E5B9));
        for issue in &mut self.companies[company].issues {
            if issue.kind.stream() == stream {
                issue.found = true;
            }
        }
        let target = &self.companies[company];
        let industry = &self.industries[target.sector];
        let revenue = target.ttm_revenue();
        let ebitda = target.ttm_ebitda();
        let issue = |kind: IssueKind| target.issues.iter().find(|issue| issue.kind == kind).cloned();
        match stream {
            DdStream::Financial => {
                // Owner-run companies carry the owner's costs; most have a one-off or two.
                let owner_costs = if matches!(target.owner, Owner::Founder { .. }) {
                    mul_bps(revenue, rng.range(40, 160))
                } else {
                    0
                };
                let one_offs = mul_bps(revenue, rng.range(0, 90)) * if rng.chance_bps(5_000) { 1 } else { -1 };
                let adjusted = ebitda + owner_costs + one_offs;
                let change = ratio_bps(adjusted - ebitda, ebitda.max(1));
                findings.push(finding(
                    FindingKind::QualityOfEarnings,
                    if change >= 0 { Tone::Good } else { Tone::Bad },
                    adjusted,
                    change,
                ));
                if let Some(found) = issue(IssueKind::InventoryOverstated) {
                    findings.push(finding(
                        FindingKind::InventoryWriteDown,
                        Tone::Bad,
                        mul_bps(target.books.inventory, found.severity_bps),
                        found.severity_bps,
                    ));
                }
                let days = |value: i64| if revenue > 0 { value * 365 / revenue } else { 0 };
                let nwc_days = days(target.books.net_working_capital());
                let normal_days = industry.dso_days + industry.dio_days - industry.dpo_days;
                findings.push(finding(
                    FindingKind::WorkingCapital,
                    if nwc_days > normal_days + 8 { Tone::Bad } else if nwc_days + 8 < normal_days { Tone::Good } else { Tone::Neutral },
                    target.books.net_working_capital(),
                    nwc_days * 100,
                ));
                findings.push(finding(FindingKind::NetDebt, Tone::Neutral, target.net_debt(), 0));
                let (management_growth, management_margin) = self.management_case(company);
                let (diligence_growth, diligence_margin) = self.diligence_case(company);
                outlook = Some(Outlook {
                    management_growth_bps: management_growth,
                    diligence_growth_bps: diligence_growth,
                    management_margin_bps: management_margin,
                    diligence_margin_bps: diligence_margin,
                });
            }
            DdStream::Commercial => {
                let annual_market = industry.monthly_growth_bps * 12 + self.economy.growth_bps(target.sector, industry) * 12;
                findings.push(finding(
                    FindingKind::MarketGrowth,
                    if annual_market > 300 { Tone::Good } else if annual_market < 0 { Tone::Bad } else { Tone::Neutral },
                    0,
                    annual_market,
                ));
                let relative = (target.growth_bps - industry.monthly_growth_bps) * 12;
                findings.push(finding(
                    FindingKind::GrowthVsMarket,
                    if relative > 100 { Tone::Good } else if relative < -100 { Tone::Bad } else { Tone::Neutral },
                    0,
                    relative,
                ));
                let concentration = issue(IssueKind::CustomerConcentration);
                findings.push(finding(
                    FindingKind::CustomerConcentration,
                    if concentration.is_some() || target.customer_concentration_bps >= 4_000 { Tone::Bad } else { Tone::Neutral },
                    concentration.map_or(0, |found| mul_bps(revenue, found.severity_bps * 6 / 10)),
                    target.customer_concentration_bps,
                ));
                if target.has(Trait::BrandStrength) || target.has(Trait::ProprietaryProcess) {
                    findings.push(finding(FindingKind::PricingPower, Tone::Good, 0, 0));
                }
                if target.has(Trait::RecurringRevenue) || target.has(Trait::LongTermContracts) {
                    findings.push(finding(FindingKind::ContractedRevenue, Tone::Good, 0, 0));
                }
                let (management_growth, management_margin) = self.management_case(company);
                let (diligence_growth, diligence_margin) = self.diligence_case(company);
                outlook = Some(Outlook {
                    management_growth_bps: management_growth,
                    diligence_growth_bps: diligence_growth,
                    management_margin_bps: management_margin,
                    diligence_margin_bps: diligence_margin,
                });
            }
            DdStream::Operational => {
                findings.push(finding(
                    FindingKind::Management,
                    if target.management >= 13 { Tone::Good } else if target.management <= 7 { Tone::Bad } else { Tone::Neutral },
                    0,
                    target.management * 500,
                ));
                if let Some(found) = issue(IssueKind::DeferredMaintenance) {
                    findings.push(finding(FindingKind::CapexBacklog, Tone::Bad, mul_bps(revenue, found.severity_bps / 4), 0));
                }
                if target.has(Trait::AgingEquipment) {
                    findings.push(finding(FindingKind::AgingEquipment, Tone::Bad, mul_bps(revenue, industry.capex_ratio_bps + 50), 0));
                }
                if target.has(Trait::SinglePlant) {
                    findings.push(finding(FindingKind::SinglePlant, Tone::Bad, 0, 0));
                }
                if issue(IssueKind::KeyPerson).is_some() {
                    findings.push(finding(FindingKind::KeyPerson, Tone::Bad, 0, 240));
                }
            }
            DdStream::Legal => {
                if let Some(found) = issue(IssueKind::EnvironmentalLiability) {
                    findings.push(finding(FindingKind::Environmental, Tone::Bad, mul_bps(revenue, found.severity_bps / 6), 0));
                }
                if issue(IssueKind::LaborDispute).is_some() {
                    findings.push(finding(FindingKind::LaborDispute, Tone::Bad, 0, target.union_strength_bps));
                }
                if target.has(Trait::LongTermContracts) || target.has(Trait::RegulatedCustomers) {
                    findings.push(finding(FindingKind::ChangeOfControl, Tone::Neutral, 0, 0));
                }
                if target.has(Trait::RegulatedCustomers) {
                    findings.push(finding(FindingKind::Permits, Tone::Neutral, 0, 0));
                }
                if findings.iter().all(|finding| finding.tone != Tone::Bad) {
                    findings.push(finding(FindingKind::CleanTitle, Tone::Good, 0, 0));
                }
            }
        }
        Report { stream, date: self.date, findings, outlook }
    }
}
