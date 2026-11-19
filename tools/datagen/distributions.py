"""Placeholder industry distributions for the content generator.

These numbers are hand-written stand-ins so the pipeline can run.
They are not fitted to EDGAR, Census, BLS, Damodaran, or any other source.
Do not cite generator output as industry research.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class IndustryDistribution:
    sector_id: str
    label: str
    # Annual revenue of a typical company, thousand USD. Lognormal.
    revenue_median_usd_thousand: float
    revenue_log_sigma: float
    quarterly_growth_mean: float
    quarterly_growth_std: float
    gross_margin_mean: float
    gross_margin_std: float
    sga_ratio_mean: float
    sga_ratio_std: float
    # Quarterly depreciation as a fraction of opening net PP&E.
    quarterly_da_rate: float
    quarterly_capex_ratio: float
    cash_interest_spread: float
    tax_rate: float
    dso_days: float
    dio_days: float
    dpo_days: float
    opening_net_debt_to_ebitda: float
    quarterly_amort_fraction: float
    dividend_payout: float
    dividend_leverage_cap: float
    min_cash_to_revenue: float
    ppe_to_annual_revenue: float
    revenue_per_employee_usd_thousand: float
    base_multiple_mean: float
    base_multiple_std: float
    # multiple = base * (1 / (1 + rate_beta * (policy_rate - neutral_rate))) * cycle
    rate_beta: float
    cycle_amplitude: float
    multiple_floor: float
    multiple_cap: float

    def to_public_dict(self) -> dict:
        payload = asdict(self)
        payload["placeholder"] = True
        payload["fitted_to_real_filings"] = False
        return payload


INDUSTRIES: tuple[IndustryDistribution, ...] = (
    IndustryDistribution(
        sector_id="food_manufacturing",
        label="Food manufacturing",
        revenue_median_usd_thousand=80_000,
        revenue_log_sigma=0.45,
        quarterly_growth_mean=0.008,
        quarterly_growth_std=0.02,
        gross_margin_mean=0.31,
        gross_margin_std=0.04,
        sga_ratio_mean=0.16,
        sga_ratio_std=0.02,
        quarterly_da_rate=0.02,
        quarterly_capex_ratio=0.025,
        cash_interest_spread=0.028,
        tax_rate=0.22,
        dso_days=42,
        dio_days=38,
        dpo_days=35,
        opening_net_debt_to_ebitda=1.6,
        quarterly_amort_fraction=0.015,
        dividend_payout=0.1,
        dividend_leverage_cap=3.5,
        min_cash_to_revenue=0.08,
        ppe_to_annual_revenue=0.42,
        revenue_per_employee_usd_thousand=220,
        base_multiple_mean=8.0,
        base_multiple_std=0.8,
        rate_beta=6.0,
        cycle_amplitude=0.06,
        multiple_floor=4.5,
        multiple_cap=12.0,
    ),
    IndustryDistribution(
        sector_id="industrial_components",
        label="Industrial components",
        revenue_median_usd_thousand=110_000,
        revenue_log_sigma=0.5,
        quarterly_growth_mean=0.004,
        quarterly_growth_std=0.03,
        gross_margin_mean=0.27,
        gross_margin_std=0.04,
        sga_ratio_mean=0.12,
        sga_ratio_std=0.02,
        quarterly_da_rate=0.018,
        quarterly_capex_ratio=0.03,
        cash_interest_spread=0.032,
        tax_rate=0.23,
        dso_days=58,
        dio_days=70,
        dpo_days=48,
        opening_net_debt_to_ebitda=2.1,
        quarterly_amort_fraction=0.02,
        dividend_payout=0.08,
        dividend_leverage_cap=4.0,
        min_cash_to_revenue=0.07,
        ppe_to_annual_revenue=0.55,
        revenue_per_employee_usd_thousand=280,
        base_multiple_mean=7.2,
        base_multiple_std=0.9,
        rate_beta=7.0,
        cycle_amplitude=0.08,
        multiple_floor=4.0,
        multiple_cap=11.0,
    ),
    IndustryDistribution(
        sector_id="cold_chain_logistics",
        label="Cold chain logistics",
        revenue_median_usd_thousand=60_000,
        revenue_log_sigma=0.4,
        quarterly_growth_mean=0.012,
        quarterly_growth_std=0.02,
        gross_margin_mean=0.24,
        gross_margin_std=0.03,
        sga_ratio_mean=0.11,
        sga_ratio_std=0.015,
        quarterly_da_rate=0.015,
        quarterly_capex_ratio=0.035,
        cash_interest_spread=0.025,
        tax_rate=0.22,
        dso_days=50,
        dio_days=8,
        dpo_days=40,
        opening_net_debt_to_ebitda=2.8,
        quarterly_amort_fraction=0.012,
        dividend_payout=0.05,
        dividend_leverage_cap=5.0,
        min_cash_to_revenue=0.06,
        ppe_to_annual_revenue=0.9,
        revenue_per_employee_usd_thousand=160,
        base_multiple_mean=9.5,
        base_multiple_std=1.0,
        rate_beta=8.0,
        cycle_amplitude=0.05,
        multiple_floor=5.5,
        multiple_cap=14.0,
    ),
    IndustryDistribution(
        sector_id="business_services",
        label="Business services",
        revenue_median_usd_thousand=70000,
        revenue_log_sigma=0.5,
        quarterly_growth_mean=0.012,
        quarterly_growth_std=0.02,
        gross_margin_mean=0.42,
        gross_margin_std=0.05,
        sga_ratio_mean=0.26,
        sga_ratio_std=0.03,
        quarterly_da_rate=0.03,
        quarterly_capex_ratio=0.008,
        cash_interest_spread=0.03,
        tax_rate=0.25,
        dso_days=55,
        dio_days=2,
        dpo_days=30,
        opening_net_debt_to_ebitda=1.8,
        quarterly_amort_fraction=0.015,
        dividend_payout=0.08,
        dividend_leverage_cap=4.0,
        min_cash_to_revenue=0.07,
        ppe_to_annual_revenue=0.1,
        revenue_per_employee_usd_thousand=150,
        base_multiple_mean=10.5,
        base_multiple_std=1.2,
        rate_beta=7.0,
        cycle_amplitude=0.07,
        multiple_floor=6.0,
        multiple_cap=15.0,
    ),
    IndustryDistribution(
        sector_id="healthcare_services",
        label="Healthcare services",
        revenue_median_usd_thousand=90000,
        revenue_log_sigma=0.45,
        quarterly_growth_mean=0.014,
        quarterly_growth_std=0.015,
        gross_margin_mean=0.36,
        gross_margin_std=0.04,
        sga_ratio_mean=0.21,
        sga_ratio_std=0.025,
        quarterly_da_rate=0.025,
        quarterly_capex_ratio=0.012,
        cash_interest_spread=0.028,
        tax_rate=0.25,
        dso_days=48,
        dio_days=6,
        dpo_days=32,
        opening_net_debt_to_ebitda=2.4,
        quarterly_amort_fraction=0.015,
        dividend_payout=0.08,
        dividend_leverage_cap=4.0,
        min_cash_to_revenue=0.07,
        ppe_to_annual_revenue=0.18,
        revenue_per_employee_usd_thousand=130,
        base_multiple_mean=11.0,
        base_multiple_std=1.2,
        rate_beta=6.0,
        cycle_amplitude=0.04,
        multiple_floor=6.5,
        multiple_cap=15.5,
    ),
    IndustryDistribution(
        sector_id="building_products",
        label="Building products",
        revenue_median_usd_thousand=120000,
        revenue_log_sigma=0.5,
        quarterly_growth_mean=0.006,
        quarterly_growth_std=0.035,
        gross_margin_mean=0.29,
        gross_margin_std=0.04,
        sga_ratio_mean=0.14,
        sga_ratio_std=0.02,
        quarterly_da_rate=0.018,
        quarterly_capex_ratio=0.025,
        cash_interest_spread=0.033,
        tax_rate=0.25,
        dso_days=50,
        dio_days=60,
        dpo_days=42,
        opening_net_debt_to_ebitda=2.0,
        quarterly_amort_fraction=0.015,
        dividend_payout=0.08,
        dividend_leverage_cap=4.0,
        min_cash_to_revenue=0.07,
        ppe_to_annual_revenue=0.4,
        revenue_per_employee_usd_thousand=300,
        base_multiple_mean=7.8,
        base_multiple_std=1.0,
        rate_beta=9.0,
        cycle_amplitude=0.12,
        multiple_floor=4.0,
        multiple_cap=11.5,
    ),
)


# Fragments that would make a generated name point at a real group.
# The generator refuses a name that contains any of these, in any letter case.
NAME_DENYLIST = (
    "Kraft",
    "Heinz",
    "Tyson",
    "Cargill",
    "Nestle",
    "Pepsi",
    "Coca",
    "General Mills",
    "Kellogg",
    "Conagra",
    "Hormel",
    "Smucker",
    "Campbell",
    "Hershey",
    "Mondelez",
    "Sysco",
    "Lineage",
    "Americold",
    "FedEx",
    "UPS",
    "Ryder",
    "Penske",
    "Parker",
    "Hannifin",
    "Timken",
    "Eaton",
    "Emerson",
    "Honeywell",
    "Caterpillar",
    "Deere",
    "Cummins",
    "Dana",
    "Borg",
    "Illinois Tool",
    "Dover",
    "Rockwell",
    "Ford",
    "Boeing",
    "Amazon",
    "Walmart",
)
