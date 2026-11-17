"""Placeholder industry distributions for the content generator.

These numbers are hand-written stand-ins so the pipeline can run.
They are not fitted to KOSIS, DART, EDGAR, Damodaran, or any other source.
Do not cite generator output as industry research.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class IndustryDistribution:
    sector_id: str
    label_ko: str
    # Annual revenue of a typical company, million KRW. Lognormal.
    revenue_median_krw_million: float
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
    revenue_per_employee_krw_million: float
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


# Wide boxes, not street addresses. Two-decimal coordinates land on a ~1 km cell.
REGION_BOXES = (
    {
        "id": "gyeonggi_west",
        "label_ko": "경기 서부",
        "lat": (37.15, 37.65),
        "lon": (126.55, 127.05),
        "complex_ko": "가온 식품단지",
    },
    {
        "id": "chungnam",
        "label_ko": "충남",
        "lat": (36.30, 36.90),
        "lon": (126.45, 127.15),
        "complex_ko": "모람 부품단지",
    },
    {
        "id": "jeonbuk",
        "label_ko": "전북",
        "lat": (35.55, 36.15),
        "lon": (126.70, 127.35),
        "complex_ko": "소담 냉동단지",
    },
    {
        "id": "gyeongnam_inland",
        "label_ko": "경남 내륙",
        "lat": (35.15, 35.65),
        "lon": (127.95, 128.65),
        "complex_ko": "이든 물류단지",
    },
)


INDUSTRIES: tuple[IndustryDistribution, ...] = (
    IndustryDistribution(
        sector_id="food_manufacturing",
        label_ko="식품 제조",
        revenue_median_krw_million=80_000,
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
        revenue_per_employee_krw_million=220,
        base_multiple_mean=8.0,
        base_multiple_std=0.8,
        rate_beta=6.0,
        cycle_amplitude=0.06,
        multiple_floor=4.5,
        multiple_cap=12.0,
    ),
    IndustryDistribution(
        sector_id="industrial_components",
        label_ko="산업 부품",
        revenue_median_krw_million=110_000,
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
        revenue_per_employee_krw_million=280,
        base_multiple_mean=7.2,
        base_multiple_std=0.9,
        rate_beta=7.0,
        cycle_amplitude=0.08,
        multiple_floor=4.0,
        multiple_cap=11.0,
    ),
    IndustryDistribution(
        sector_id="cold_chain_logistics",
        label_ko="냉장·창고 물류",
        revenue_median_krw_million=60_000,
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
        revenue_per_employee_krw_million=160,
        base_multiple_mean=9.5,
        base_multiple_std=1.0,
        rate_beta=8.0,
        cycle_amplitude=0.05,
        multiple_floor=5.5,
        multiple_cap=14.0,
    ),
)


# Fragments that would make a generated name point at a real group.
# The generator refuses a name that contains any of these.
NAME_DENYLIST = (
    "삼성",
    "현대",
    "엘지",
    "LG",
    "SK",
    "롯데",
    "포스코",
    "한화",
    "네이버",
    "카카오",
    "쿠팡",
    "CJ",
    "GS",
    "두산",
    "신세계",
    "아모레",
    "셀트리온",
    "농심",
    "오뚜기",
    "풀무원",
    "대상",
    "하림",
    "SPC",
    "오리온",
    "빙그레",
    "매일",
    "동원",
    "사조",
    "한진",
    "판토스",
    "쿠팡",
)
