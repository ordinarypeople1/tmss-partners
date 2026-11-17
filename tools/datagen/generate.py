#!/usr/bin/env python3
"""Seeded generator of fictional companies and integrated quarterly financials.

Public filings are not read here. Industry parameters live in distributions.py
and are explicitly marked as placeholders.

Outputs
  JSON document of companies and quarters
  SQLite database with the same facts, plus a company_cards table
  fixture copy for the generator check
  one card page for the web client, without quarter history

Run
  python3 tools/datagen/generate.py --check
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sqlite3
from pathlib import Path

from distributions import INDUSTRIES, NAME_DENYLIST, REGION_BOXES, IndustryDistribution

UNIT = "krw_million"
SCHEMA_VERSION = 1

NAME_STEMS = (
    "가온",
    "나래",
    "다온",
    "라온",
    "모람",
    "바르",
    "소담",
    "아람",
    "온새",
    "이든",
    "지온",
    "하람",
)
NAME_CORES = {
    "food_manufacturing": ("제분", "발효", "소스", "냉동식품"),
    "industrial_components": ("정밀", "금형", "밸브", "베어링"),
    "cold_chain_logistics": ("냉장", "창고", "운송", "보세"),
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round_int(value: float) -> int:
    return int(round(value))


def lognormal(rng: random.Random, median: float, sigma: float) -> float:
    # median = exp(mu) for a lognormal, so mu = ln(median).
    return math.exp(rng.gauss(math.log(median), sigma))


def rate_factor(policy_rate: float, neutral_rate: float, beta: float) -> float:
    return 1.0 / (1.0 + beta * (policy_rate - neutral_rate))


def model_multiple(
    industry: IndustryDistribution,
    base_multiple: float,
    policy_rate: float,
    neutral_rate: float,
    quarter_index: int,
) -> float:
    cycle = 1.0 + industry.cycle_amplitude * math.sin(2.0 * math.pi * quarter_index / 16.0)
    raw = base_multiple * rate_factor(policy_rate, neutral_rate, industry.rate_beta) * cycle
    return round(clamp(raw, industry.multiple_floor, industry.multiple_cap), 2)


def make_name(
    rng: random.Random,
    sector_id: str,
    used: set[str],
    cores_by_sector: dict[str, tuple[str, ...]] | None = None,
) -> str:
    cores = (cores_by_sector or NAME_CORES)[sector_id]
    for _ in range(50):
        name = f"{rng.choice(NAME_STEMS)}{rng.choice(cores)}"
        if name in used:
            continue
        if any(token in name for token in NAME_DENYLIST):
            continue
        used.add(name)
        return name
    raise RuntimeError("could not mint a fictional company name")


def opening_state(
    rng: random.Random,
    industry: IndustryDistribution,
    policy_rate: float,
) -> dict:
    revenue = round_int(
        lognormal(rng, industry.revenue_median_krw_million, industry.revenue_log_sigma) / 4.0
    )
    revenue = max(revenue, 1_000)
    gross_margin = clamp(
        rng.gauss(industry.gross_margin_mean, industry.gross_margin_std), 0.1, 0.7
    )
    sga_ratio = clamp(rng.gauss(industry.sga_ratio_mean, industry.sga_ratio_std), 0.05, 0.4)
    annual_revenue = revenue * 4
    ebitda_margin = gross_margin - sga_ratio
    ebitda_annual = max(round_int(annual_revenue * ebitda_margin), 1)
    net_ppe = round_int(annual_revenue * industry.ppe_to_annual_revenue)
    gross_ppe = round_int(net_ppe / 0.62)
    accum = gross_ppe - net_ppe
    cogs = round_int(revenue * (1.0 - gross_margin))
    ar = round_int(revenue * industry.dso_days / 90.0)
    inv = round_int(cogs * industry.dio_days / 90.0)
    ap = round_int(cogs * industry.dpo_days / 90.0)
    debt = round_int(ebitda_annual * industry.opening_net_debt_to_ebitda)
    share_capital = round_int(annual_revenue * 0.18)
    min_cash = round_int(revenue * industry.min_cash_to_revenue)
    # Equity is the plug that makes the opening balance sheet identity hold,
    # after cash is set to the liquidity floor. Retained earnings absorb it.
    cash = min_cash
    assets_ex_cash = ar + inv + net_ppe
    # total assets = cash + assets_ex_cash
    # total L+E = ap + debt + equity
    equity = cash + assets_ex_cash - ap - debt
    if equity < share_capital:
        share_capital = max(equity // 2, 1)
    retained = equity - share_capital
    return {
        "revenue": revenue,
        "gross_margin": gross_margin,
        "sga_ratio": sga_ratio,
        "cash": cash,
        "ar": ar,
        "inv": inv,
        "ap": ap,
        "gross_ppe": gross_ppe,
        "accum_dep": accum,
        "net_ppe": net_ppe,
        "debt": debt,
        "share_capital": share_capital,
        "retained_earnings": retained,
        "interest_rate": policy_rate + industry.cash_interest_spread,
        "employees": max(40, round_int(annual_revenue / industry.revenue_per_employee_krw_million)),
    }


def step_quarter(
    state: dict,
    industry: IndustryDistribution,
    rng: random.Random,
    policy_rate: float,
    neutral_rate: float,
    base_multiple: float,
    quarter_index: int,
    period: str,
) -> tuple[dict, dict]:
    growth = clamp(
        rng.gauss(industry.quarterly_growth_mean, industry.quarterly_growth_std), -0.18, 0.22
    )
    revenue = max(1, round_int(state["revenue"] * (1.0 + growth)))
    gross_margin = clamp(state["gross_margin"] + rng.gauss(0.0, 0.004), 0.08, 0.72)
    sga_ratio = clamp(state["sga_ratio"] + rng.gauss(0.0, 0.003), 0.04, 0.42)
    cogs = round_int(revenue * (1.0 - gross_margin))
    gross_profit = revenue - cogs
    sga = round_int(revenue * sga_ratio)
    ebitda = gross_profit - sga
    da = round_int(state["net_ppe"] * industry.quarterly_da_rate)
    ebit = ebitda - da
    interest = round_int(state["debt"] * state["interest_rate"] / 4.0)
    ebt = ebit - interest
    tax = round_int(max(ebt, 0) * industry.tax_rate)
    net_income = ebt - tax

    ar = round_int(revenue * industry.dso_days / 90.0)
    inv = round_int(cogs * industry.dio_days / 90.0)
    ap = round_int(cogs * industry.dpo_days / 90.0)
    delta_nwc = (ar + inv - ap) - (state["ar"] + state["inv"] - state["ap"])
    capex = round_int(revenue * industry.quarterly_capex_ratio)

    cash_from_operations = net_income + da - delta_nwc
    cash_from_investing = -capex
    cash_before_financing = state["cash"] + cash_from_operations + cash_from_investing
    min_cash = round_int(revenue * industry.min_cash_to_revenue)

    repayment = min(round_int(state["debt"] * industry.quarterly_amort_fraction), state["debt"])
    if cash_before_financing - repayment < min_cash:
        repayment = max(0, min(state["debt"], cash_before_financing - min_cash))
    draw = 0
    if cash_before_financing - repayment < min_cash:
        draw = min_cash - (cash_before_financing - repayment)
    debt = state["debt"] - repayment + draw

    dividend = 0
    if net_income > 0:
        ebitda_run_rate = max(ebitda * 4, 1)
        if debt / ebitda_run_rate <= industry.dividend_leverage_cap:
            room = cash_before_financing - repayment + draw - min_cash
            dividend = min(round_int(net_income * industry.dividend_payout), max(room, 0))

    cash_from_financing = draw - repayment - dividend
    net_change = cash_from_operations + cash_from_investing + cash_from_financing
    cash = state["cash"] + net_change

    gross_ppe = state["gross_ppe"] + capex
    accum_dep = state["accum_dep"] + da
    net_ppe = gross_ppe - accum_dep
    retained = state["retained_earnings"] + net_income - dividend
    equity = state["share_capital"] + retained
    total_assets = cash + ar + inv + net_ppe
    total_liabilities = ap + debt
    gap = total_assets - (total_liabilities + equity)
    if gap != 0:
        raise RuntimeError(f"{period} balance sheet did not close (gap={gap})")

    quarter = {
        "period": period,
        "model_multiple": model_multiple(
            industry, base_multiple, policy_rate, neutral_rate, quarter_index
        ),
        "income": {
            "revenue": revenue,
            "cogs": cogs,
            "gross_profit": gross_profit,
            "sga": sga,
            "ebitda": ebitda,
            "da": da,
            "ebit": ebit,
            "interest_expense": interest,
            "ebt": ebt,
            "tax": tax,
            "net_income": net_income,
        },
        "balance": {
            "cash": cash,
            "accounts_receivable": ar,
            "inventory": inv,
            "gross_ppe": gross_ppe,
            "accumulated_depreciation": accum_dep,
            "net_ppe": net_ppe,
            "total_assets": total_assets,
            "accounts_payable": ap,
            "debt": debt,
            "total_liabilities": total_liabilities,
            "share_capital": state["share_capital"],
            "retained_earnings": retained,
            "total_equity": equity,
        },
        "cashflow": {
            "net_income": net_income,
            "da": da,
            "change_in_nwc": delta_nwc,
            "cash_from_operations": cash_from_operations,
            "capex": capex,
            "cash_from_investing": cash_from_investing,
            "debt_draw": draw,
            "debt_repayment": repayment,
            "dividends": dividend,
            "cash_from_financing": cash_from_financing,
            "net_change_in_cash": net_change,
            "opening_cash": state["cash"],
            "closing_cash": cash,
        },
    }
    nxt = {
        **state,
        "revenue": revenue,
        "gross_margin": gross_margin,
        "sga_ratio": sga_ratio,
        "cash": cash,
        "ar": ar,
        "inv": inv,
        "ap": ap,
        "gross_ppe": gross_ppe,
        "accum_dep": accum_dep,
        "net_ppe": net_ppe,
        "debt": debt,
        "retained_earnings": retained,
    }
    return quarter, nxt


def period_labels(start_year: int, start_quarter: int, count: int) -> list[str]:
    labels = []
    year, quarter = start_year, start_quarter
    for _ in range(count):
        labels.append(f"{year}Q{quarter}")
        quarter += 1
        if quarter == 5:
            quarter = 1
            year += 1
    return labels


def build_document(
    seed: int,
    count: int,
    quarters: int,
    start_year: int,
    policy_rate: float,
    neutral_rate: float,
    industries: tuple | list | None = None,
    regions: tuple | list | None = None,
    name_cores: dict[str, tuple[str, ...]] | None = None,
) -> dict:
    industry_rows = list(industries or INDUSTRIES)
    region_rows = list(regions or REGION_BOXES)
    rng = random.Random(seed)
    used_names: set[str] = set()
    companies = []
    for index in range(count):
        industry = industry_rows[index % len(industry_rows)]
        region = region_rows[index % len(region_rows)]
        name = make_name(rng, industry.sector_id, used_names, name_cores)
        state = opening_state(rng, industry, policy_rate)
        base_multiple = clamp(
            rng.gauss(industry.base_multiple_mean, industry.base_multiple_std),
            industry.multiple_floor,
            industry.multiple_cap,
        )
        lat = round(rng.uniform(*region["lat"]), 2)
        lon = round(rng.uniform(*region["lon"]), 2)
        legal_prefix = region.get("legal_prefix", "주식회사 ")
        series = []
        for quarter_index, period in enumerate(period_labels(start_year, 1, quarters)):
            quarter, state = step_quarter(
                state,
                industry,
                rng,
                policy_rate,
                neutral_rate,
                base_multiple,
                quarter_index,
                period,
            )
            series.append(quarter)
        companies.append(
            {
                "id": f"co-{index + 1:03d}",
                "name_ko": name,
                "legal_name_ko": f"{legal_prefix}{name}",
                "country": region.get("country", "KR"),
                "subindustry_id": region.get("subindustry_id", industry.sector_id),
                "sector_id": industry.sector_id,
                "sector_label_ko": industry.label_ko,
                "region_label_ko": region["label_ko"],
                "complex_name_ko": region["complex_ko"],
                "lat": lat,
                "lon": lon,
                "founded_year": rng.randint(1988, 2016),
                "employees": state["employees"],
                "base_multiple": round(base_multiple, 4),
                "identity": {
                    "fictional": True,
                    "ticker": None,
                    "real_address": False,
                    "coordinate_precision": "two decimal degrees",
                },
                "quarters": series,
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "generator": "deal-atlas-datagen",
        "seed": seed,
        "unit": UNIT,
        "unit_label_ko": "백만 원",
        "placeholder_parameters": True,
        "fitted_to_real_filings": False,
        "price_policy": "model_multiple_only_no_share_price",
        "macro": {
            "era": "high_rate_2024_2026",
            "policy_rate": policy_rate,
            "neutral_rate": neutral_rate,
            "note": "Placeholder rate regime. Not a published Bank of Korea series.",
        },
        "industries": [item.to_public_dict() for item in industry_rows],
        "companies": companies,
    }


def validate(document: dict, korea_box: bool = True) -> list[str]:
    errors: list[str] = []
    if document.get("placeholder_parameters") is not True:
        errors.append("placeholder flag missing")
    if document.get("fitted_to_real_filings") is not False:
        errors.append("document claims to be fitted to filings")
    names = []
    for company in document["companies"]:
        names.append(company["name_ko"])
        if company["identity"].get("ticker") not in (None,):
            errors.append(f"{company['id']} has a ticker")
        if "share_price" in company or "ticker" in company:
            errors.append(f"{company['id']} exposes a market price field")
        if any(token in company["name_ko"] for token in NAME_DENYLIST):
            errors.append(f"{company['id']} name hit the denylist")
        if korea_box and not (33.0 <= company["lat"] <= 39.5 and 124.0 <= company["lon"] <= 132.0):
            errors.append(f"{company['id']} is outside the Korea box")
        if not (-60.0 <= company["lat"] <= 75.0 and -170.0 <= company["lon"] <= 180.0):
            errors.append(f"{company['id']} is outside the world box")
        previous_cash = None
        previous_re = None
        for quarter in company["quarters"]:
            income = quarter["income"]
            balance = quarter["balance"]
            cashflow = quarter["cashflow"]
            period = f"{company['id']} {quarter['period']}"
            if income["gross_profit"] != income["revenue"] - income["cogs"]:
                errors.append(f"{period} gross profit")
            if income["ebitda"] != income["gross_profit"] - income["sga"]:
                errors.append(f"{period} ebitda")
            if income["ebit"] != income["ebitda"] - income["da"]:
                errors.append(f"{period} ebit")
            if income["net_income"] != income["ebt"] - income["tax"]:
                errors.append(f"{period} net income")
            assets = (
                balance["cash"]
                + balance["accounts_receivable"]
                + balance["inventory"]
                + balance["net_ppe"]
            )
            if assets != balance["total_assets"]:
                errors.append(f"{period} asset sum")
            if balance["net_ppe"] != balance["gross_ppe"] - balance["accumulated_depreciation"]:
                errors.append(f"{period} net ppe")
            equity = balance["share_capital"] + balance["retained_earnings"]
            if equity != balance["total_equity"]:
                errors.append(f"{period} equity sum")
            if balance["total_liabilities"] != balance["accounts_payable"] + balance["debt"]:
                errors.append(f"{period} liability sum")
            if balance["total_assets"] != balance["total_liabilities"] + balance["total_equity"]:
                errors.append(f"{period} accounting identity")
            if cashflow["closing_cash"] != cashflow["opening_cash"] + cashflow["net_change_in_cash"]:
                errors.append(f"{period} cash rollforward")
            if balance["cash"] != cashflow["closing_cash"]:
                errors.append(f"{period} cash tie")
            if previous_cash is not None and cashflow["opening_cash"] != previous_cash:
                errors.append(f"{period} opening cash")
            if previous_re is not None:
                expected_re = previous_re + income["net_income"] - cashflow["dividends"]
                if balance["retained_earnings"] != expected_re:
                    errors.append(f"{period} retained earnings")
            previous_cash = balance["cash"]
            previous_re = balance["retained_earnings"]
            if "share_price" in quarter:
                errors.append(f"{period} has a share price")
    if len(names) != len(set(names)):
        errors.append("duplicate company names")
    return errors


def write_sqlite(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE industry_parameters (
              sector_id TEXT PRIMARY KEY,
              label_ko TEXT NOT NULL,
              placeholder INTEGER NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE companies (
              id TEXT PRIMARY KEY,
              name_ko TEXT NOT NULL,
              legal_name_ko TEXT NOT NULL,
              sector_id TEXT NOT NULL,
              region_label_ko TEXT NOT NULL,
              complex_name_ko TEXT NOT NULL,
              lat REAL NOT NULL,
              lon REAL NOT NULL,
              founded_year INTEGER NOT NULL,
              employees INTEGER NOT NULL
            );
            CREATE TABLE quarters (
              company_id TEXT NOT NULL,
              period TEXT NOT NULL,
              model_multiple REAL NOT NULL,
              payload TEXT NOT NULL,
              PRIMARY KEY (company_id, period)
            );
            CREATE INDEX idx_quarters_company ON quarters(company_id);
            CREATE TABLE company_cards (
              id TEXT PRIMARY KEY,
              legal_name_ko TEXT NOT NULL,
              sector_id TEXT NOT NULL,
              region_label_ko TEXT NOT NULL,
              complex_name_ko TEXT NOT NULL,
              lat REAL NOT NULL,
              lon REAL NOT NULL,
              founded_year INTEGER NOT NULL,
              employees INTEGER NOT NULL,
              period TEXT NOT NULL,
              revenue INTEGER NOT NULL,
              ebitda INTEGER NOT NULL,
              model_multiple_millis INTEGER NOT NULL,
              debt INTEGER NOT NULL,
              cash INTEGER NOT NULL
            );
            CREATE INDEX idx_company_cards_sector ON company_cards(sector_id);
            """
        )
        connection.executemany(
            "INSERT INTO meta (key, value) VALUES (?, ?)",
            [
                ("schema_version", str(document["schema_version"])),
                ("seed", str(document["seed"])),
                ("unit", document["unit"]),
                ("placeholder_parameters", "true"),
                ("fitted_to_real_filings", "false"),
                ("price_policy", document["price_policy"]),
            ],
        )
        for industry in document["industries"]:
            connection.execute(
                "INSERT INTO industry_parameters (sector_id, label_ko, placeholder, payload) VALUES (?, ?, 1, ?)",
                (industry["sector_id"], industry["label_ko"], json.dumps(industry, ensure_ascii=False)),
            )
        for company in document["companies"]:
            connection.execute(
                """
                INSERT INTO companies (
                  id, name_ko, legal_name_ko, sector_id, region_label_ko,
                  complex_name_ko, lat, lon, founded_year, employees
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    company["id"],
                    company["name_ko"],
                    company["legal_name_ko"],
                    company["sector_id"],
                    company["region_label_ko"],
                    company["complex_name_ko"],
                    company["lat"],
                    company["lon"],
                    company["founded_year"],
                    company["employees"],
                ),
            )
            for quarter in company["quarters"]:
                connection.execute(
                    "INSERT INTO quarters (company_id, period, model_multiple, payload) VALUES (?, ?, ?, ?)",
                    (
                        company["id"],
                        quarter["period"],
                        quarter["model_multiple"],
                        json.dumps(quarter, ensure_ascii=False),
                    ),
                )
            latest = company["quarters"][-1]
            connection.execute(
                """
                INSERT INTO company_cards (
                  id, legal_name_ko, sector_id, region_label_ko, complex_name_ko,
                  lat, lon, founded_year, employees, period, revenue, ebitda,
                  model_multiple_millis, debt, cash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    company["id"],
                    company["legal_name_ko"],
                    company["sector_id"],
                    company["region_label_ko"],
                    company["complex_name_ko"],
                    company["lat"],
                    company["lon"],
                    company["founded_year"],
                    company["employees"],
                    latest["period"],
                    latest["income"]["revenue"],
                    latest["income"]["ebitda"],
                    int(round(latest["model_multiple"] * 1000)),
                    latest["balance"]["debt"],
                    latest["balance"]["cash"],
                ),
            )
        connection.commit()
    finally:
        connection.close()


def card_from_company(company: dict) -> dict:
    latest = company["quarters"][-1]
    return {
        "id": company["id"],
        "legal_name_ko": company["legal_name_ko"],
        "sector_id": company["sector_id"],
        "region_label_ko": company["region_label_ko"],
        "complex_name_ko": company["complex_name_ko"],
        "lat": company["lat"],
        "lon": company["lon"],
        "founded_year": company["founded_year"],
        "employees": company["employees"],
        "period": latest["period"],
        "revenue": latest["income"]["revenue"],
        "ebitda": latest["income"]["ebitda"],
        "model_multiple_millis": int(round(latest["model_multiple"] * 1000)),
        "debt": latest["balance"]["debt"],
        "cash": latest["balance"]["cash"],
    }


def write_card_page(path: Path, document: dict, page_size: int = 20) -> None:
    page = {
        "schema": "company_card_page",
        "seed": document["seed"],
        "unit": document["unit"],
        "page": 0,
        "page_size": page_size,
        "placeholder_parameters": True,
        "cards": [card_from_company(company) for company in document["companies"][:page_size]],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(page, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Generate fictional companies and three-statement history.")
    parser.add_argument("--seed", type=int, default=2024)
    parser.add_argument("--count", type=int, default=4)
    parser.add_argument("--quarters", type=int, default=8)
    parser.add_argument("--start-year", type=int, default=2024)
    parser.add_argument("--policy-rate", type=float, default=0.035)
    parser.add_argument("--neutral-rate", type=float, default=0.025)
    parser.add_argument(
        "--json",
        type=Path,
        default=root / "tools" / "datagen" / "out" / "companies.json",
    )
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=root / "tools" / "datagen" / "out" / "content.sqlite",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        default=root / "src" / "data" / "fixtures" / "sample-companies.json",
    )
    parser.add_argument(
        "--page",
        type=Path,
        default=root / "public" / "sample-page.json",
        help="One card page for the web client. Quarter history is not included.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate and write outputs. Exit 1 if an accounting identity fails.",
    )
    parser.add_argument(
        "--atlas",
        action="store_true",
        help="Write the 40-company playable book. Does not replace the 4-company sample fixture.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.atlas:
        from atlas import write_playable_book

        return write_playable_book(Path(__file__).resolve().parents[2])
    document = build_document(
        seed=args.seed,
        count=args.count,
        quarters=args.quarters,
        start_year=args.start_year,
        policy_rate=args.policy_rate,
        neutral_rate=args.neutral_rate,
    )
    errors = validate(document)
    if errors:
        for error in errors:
            print(f"error: {error}")
        return 1
    text = json.dumps(document, ensure_ascii=False, indent=2)
    for path in (args.json, args.fixture):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + "\n", encoding="utf-8")
    write_sqlite(args.sqlite, document)
    write_card_page(args.page, document)
    print(
        f"wrote {len(document['companies'])} companies x {args.quarters} quarters "
        f"seed={args.seed} unit={UNIT}"
    )
    print(f"json {args.json}")
    print(f"sqlite {args.sqlite}")
    print(f"fixture {args.fixture}")
    print(f"page {args.page}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
