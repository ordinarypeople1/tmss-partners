#!/usr/bin/env python3
"""Seeded generator of fictional companies and integrated quarterly financials.

Public filings are not read here. Industry parameters live in distributions.py
and are explicitly marked as placeholders.

Money is an integer count of thousand USD. Every company sits in a country and
a first-level region (a US state for now), drawn from the profiles in states.py.

Outputs
  JSON document of companies and quarters
  SQLite database with the same facts, plus a company_cards table
  fixture copy of the first few companies for the generator check
  the opening universe for sim-core, without quarter history

Run
  node tools/build-geo.mjs
  python3 tools/datagen/generate.py --check
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sqlite3
from pathlib import Path

from distributions import INDUSTRIES, NAME_DENYLIST, IndustryDistribution
from countries import COUNTRY_STYLES, REGION_PROFILES
from states import STATE_PROFILES, StateProfile

UNIT = "usd_thousand"
SCHEMA_VERSION = 2
COUNTRY = "US"
PAGE_SIZE = 20

INDUSTRY_BY_ID = {industry.sector_id: industry for industry in INDUSTRIES}

# Invented stems. A stem plus a sector word plus a suffix makes a name.
NAME_STEMS = (
    "Harlow Ridge",
    "Bramwell",
    "Kestrel",
    "Tallow Creek",
    "Northgate",
    "Quillfeather",
    "Emberly",
    "Stonemere",
    "Calloway Fork",
    "Wrenfield",
    "Osprey Point",
    "Larkmoor",
    "Dunmore",
    "Ashbury Lane",
    "Pinecrest",
    "Marrowstone",
    "Fenwick",
    "Halcyon",
    "Thistledown",
    "Corbin Vale",
    "Redfern",
    "Saltmarsh",
    "Greyling",
    "Wexcombe",
    "Alderpoint",
    "Brightwater",
    "Coldspring",
    "Driftwood",
    "Elmhaven",
    "Foxglove",
    "Garrison Mill",
    "Hawthorne",
    "Ironvale",
    "Juniper Bluff",
    "Kingsbridge",
    "Lowell Reach",
    "Merrivale",
    "Nettlebank",
    "Oakhurst",
    "Pemberly",
    "Quarry Hill",
    "Ravenscroft",
    "Sedgewick",
    "Tidewell",
    "Underhill",
    "Vantage Point",
    "Whitlock",
    "Yarrow",
    "Zephyr Ridge",
    "Abernathy",
)
NAME_CORES = {
    "food_manufacturing": ("Foods", "Milling", "Provisions", "Bakeries", "Kitchens", "Creamery"),
    "industrial_components": ("Precision", "Bearings", "Valve", "Tool & Die", "Castings", "Fasteners"),
    "cold_chain_logistics": ("Cold Storage", "Refrigerated Lines", "Freezer Depots", "Cold Chain"),
    "business_services": ("Facility Services", "Staffing", "Compliance Group", "Field Services", "Testing Labs"),
    "healthcare_services": ("Dental Partners", "Home Health", "Physical Therapy", "Veterinary Group", "Urgent Care"),
    "building_products": ("Windows", "Roofing Supply", "Millwork", "Insulation", "Cabinetry"),
}
NAME_SUFFIXES = ("Inc.", "LLC", "Co.", "Corp.")


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


# A site keeps the proper name of the park it was drawn from and takes the
# kind of estate its sector sits in, in the country's own way of naming one:
# a plant in an industrial park, a cold store in a logistics park, a clinic
# group in a medical centre. The draw itself is unchanged, so the rest of the
# universe stays as it was.
SITE_FILLER = {
    "US": {"Works", "Commerce", "Park", "Industrial", "Logistics", "Packing", "District", "Siding", "Yards", "Dairy"},
    "GB": {"Works", "Trading", "Estate", "Park", "Business", "Exchange", "Yard"},
    "DE": {"Gewerbepark", "Technikhof", "Industriepark", "Werkhof", "Park", "Gewerbehof", "Gewerbe"},
    "FR": {"Parc", "Zone", "Cité"},
    "KR": {"Industrial", "Logistics", "Parts", "Machinery", "Food", "Cold", "Chain", "Complex"},
    "JP": {"Industrial", "Park", "Works", "Logistics", "Food"},
    "CN": {"Industrial", "Zone", "Export", "Park", "Equipment", "Components", "Food", "Logistics"},
}
SITE_KIND = {
    "US": {"plant": "{stem} Industrial Park", "food": "{stem} Food Park", "logistics": "{stem} Logistics Park", "health": "{stem} Medical Plaza", "office": "{stem} Business Center"},
    "GB": {"plant": "{stem} Industrial Estate", "food": "{stem} Food Park", "logistics": "{stem} Distribution Park", "health": "{stem} Medical Centre", "office": "{stem} Business Park"},
    "DE": {"plant": "Industriepark {stem}", "food": "Gewerbepark {stem}", "logistics": "Logistikzentrum {stem}", "health": "Ärztehaus {stem}", "office": "Bürocenter {stem}"},
    "FR": {"plant": "Zone industrielle {stem}", "food": "Zone agroalimentaire {stem}", "logistics": "Plateforme logistique {stem}", "health": "Pôle santé {stem}", "office": "Parc d'affaires {stem}"},
    "KR": {"plant": "{stem} Industrial Complex", "food": "{stem} Food Industrial Complex", "logistics": "{stem} Logistics Complex", "health": "{stem} Medical Center", "office": "{stem} Business Center"},
    "JP": {"plant": "{stem} Industrial Park", "food": "{stem} Food Park", "logistics": "{stem} Logistics Center", "health": "{stem} Medical Plaza", "office": "{stem} Business Park"},
    "CN": {"plant": "{stem} Industrial Zone", "food": "{stem} Food Industrial Zone", "logistics": "{stem} Logistics Park", "health": "{stem} Medical Park", "office": "{stem} Business Park"},
}
SECTOR_SITE = {
    "food_manufacturing": "food",
    "industrial_components": "plant",
    "building_products": "plant",
    "cold_chain_logistics": "logistics",
    "healthcare_services": "health",
    "business_services": "office",
}


def site_for(park: str, sector_id: str, country: str) -> str:
    filler = SITE_FILLER.get(country, SITE_FILLER["US"])
    stem = " ".join(word for word in park.split() if word not in filler) or park.split()[-1]
    kinds = SITE_KIND.get(country, SITE_KIND["US"])
    return kinds[SECTOR_SITE.get(sector_id, "plant")].format(stem=stem)


def hits_denylist(name: str) -> bool:
    lowered = name.lower()
    return any(token.lower() in lowered for token in NAME_DENYLIST)


def make_name(rng: random.Random, sector_id: str, used: set[str], stems: tuple = NAME_STEMS) -> str:
    cores = NAME_CORES[sector_id]
    for _ in range(400):
        name = f"{rng.choice(stems)} {rng.choice(cores)}"
        if name in used or hits_denylist(name):
            continue
        used.add(name)
        return name
    raise RuntimeError("could not mint a fictional company name")


def weighted_choice(rng: random.Random, weighted: list[tuple[object, float]]):
    total = sum(weight for _, weight in weighted)
    mark = rng.uniform(0.0, total)
    running = 0.0
    for item, weight in weighted:
        running += weight
        if mark <= running:
            return item
    return weighted[-1][0]


def load_regions(path: Path) -> dict[str, list]:
    """Region code to its polygons. A polygon is a list of rings; the first is the outline."""
    collection = json.loads(path.read_text(encoding="utf-8"))
    regions: dict[str, list] = {}
    for feature in collection["features"]:
        geometry = feature["geometry"]
        polygons = (
            [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        )
        regions[feature["properties"]["code"]] = polygons
    return regions


def ring_contains(ring: list, lon: float, lat: float) -> bool:
    inside = False
    previous = ring[-1]
    for current in ring:
        (x1, y1), (x2, y2) = previous, current
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
        previous = current
    return inside


def region_contains(polygons: list, lon: float, lat: float) -> bool:
    for rings in polygons:
        if ring_contains(rings[0], lon, lat) and not any(
            ring_contains(hole, lon, lat) for hole in rings[1:]
        ):
            return True
    return False


def ring_area(ring: list) -> float:
    return abs(
        sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1])) / 2.0
    )


def load_countries(path: Path) -> dict[str, list]:
    """Country code to its polygons, for the countries the game plays in."""
    collection = json.loads(path.read_text(encoding="utf-8"))
    countries: dict[str, list] = {}
    for feature in collection["features"]:
        code = feature["properties"].get("country")
        if not code:
            continue
        geometry = feature["geometry"]
        polygons = (
            [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        )
        countries.setdefault(code, []).extend(polygons)
    return countries


def sample_near(rng: random.Random, profile, polygons: list) -> tuple[float, float]:
    """A two-decimal point near the region's centre and inside its country. Not an address."""
    for _ in range(2_000):
        lat = round(profile.lat + rng.uniform(-profile.radius, profile.radius), 2)
        lon = round(profile.lon + rng.uniform(-profile.radius, profile.radius) * 1.3, 2)
        if region_contains(polygons, lon, lat):
            return lat, lon
    raise RuntimeError(f"could not place a site in {profile.admin1}")


def sample_site(rng: random.Random, polygons: list) -> tuple[float, float]:
    """A two-decimal point inside the region's largest polygon. Not an address."""
    outline = max((rings[0] for rings in polygons), key=ring_area)
    lons = [point[0] for point in outline]
    lats = [point[1] for point in outline]
    for _ in range(2_000):
        lon = round(rng.uniform(min(lons), max(lons)), 2)
        lat = round(rng.uniform(min(lats), max(lats)), 2)
        if region_contains(polygons, lon, lat):
            return lat, lon
    raise RuntimeError("could not place a site inside its region")


def opening_state(
    rng: random.Random,
    industry: IndustryDistribution,
    profile: StateProfile,
    policy_rate: float,
) -> dict:
    median = industry.revenue_median_usd_thousand * profile.size_factor
    revenue = round_int(lognormal(rng, median, industry.revenue_log_sigma) / 4.0)
    revenue = max(revenue, 1_000)
    gross_margin = clamp(
        rng.gauss(industry.gross_margin_mean, industry.gross_margin_std), 0.1, 0.7
    )
    # Half of SG&A is treated as labor and scales with the state's wage level.
    sga_mean = industry.sga_ratio_mean * (0.5 + 0.5 * profile.wage_index)
    sga_ratio = clamp(rng.gauss(sga_mean, industry.sga_ratio_std), 0.05, 0.4)
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
        "employees": max(
            40,
            round_int(
                annual_revenue / (industry.revenue_per_employee_usd_thousand * profile.wage_index)
            ),
        ),
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
    regions: dict[str, list],
    countries: dict[str, list],
    foreign_count: int,
) -> dict:
    rng = random.Random(seed)
    used_names: set[str] = set()
    companies = []
    by_country: dict[str, list] = {}
    for item in REGION_PROFILES:
        by_country.setdefault(item.country, []).append(item)
    country_codes = sorted(by_country)
    for index in range(count + foreign_count):
        abroad = index >= count
        if abroad:
            # The six countries take equal shares; regions inside a country are weighted.
            country = country_codes[(index - count) % len(country_codes)]
            profile = weighted_choice(rng, [(item, item.weight) for item in by_country[country]])
            style = COUNTRY_STYLES[country]
        else:
            country = COUNTRY
            profile = weighted_choice(rng, [(item, item.weight) for item in STATE_PROFILES])
            style = None
        sector_id = weighted_choice(rng, sorted(profile.sector_weights.items()))
        industry = INDUSTRY_BY_ID[sector_id]
        name = make_name(rng, industry.sector_id, used_names, style.stems if style else NAME_STEMS)
        state = opening_state(rng, industry, profile, policy_rate)
        base_multiple = clamp(
            rng.gauss(industry.base_multiple_mean, industry.base_multiple_std),
            industry.multiple_floor,
            industry.multiple_cap,
        )
        if style:
            base_multiple = clamp(
                base_multiple * style.multiple_factor, industry.multiple_floor, industry.multiple_cap
            )
            lat, lon = sample_near(rng, profile, countries[country])
        else:
            lat, lon = sample_site(rng, regions[profile.admin1])
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
                "id": f"co-{index + 1:04d}",
                "name": name,
                "legal_name": f"{name} {rng.choice(style.suffixes if style else NAME_SUFFIXES)}",
                "sector_id": industry.sector_id,
                "country": country,
                "admin1": profile.admin1,
                "site_name": site_for(rng.choice(profile.parks), industry.sector_id, country),
                "lat": lat,
                "lon": lon,
                "founded_year": rng.randint(1955, 2017),
                "employees": state["employees"],
                "union_strength": profile.union_strength,
                "identity": {
                    "fictional": True,
                    "ticker": None,
                    "real_address": False,
                    "coordinate_precision": "two decimal degrees",
                },
                "quarters": series,
                "_sim": {"state": state, "base_multiple": base_multiple},
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "generator": "deal-atlas-datagen",
        "seed": seed,
        "unit": UNIT,
        "unit_label": "thousand USD",
        "placeholder_parameters": True,
        "fitted_to_real_filings": False,
        "price_policy": "model_multiple_only_no_share_price",
        "macro": {
            "era": "high_rate_2024_2026",
            "policy_rate": policy_rate,
            "neutral_rate": neutral_rate,
            "note": "Placeholder rate regime. Not a published Federal Reserve series.",
        },
        "industries": [item.to_public_dict() for item in INDUSTRIES],
        "state_profiles": [item.to_public_dict() for item in STATE_PROFILES],
        "region_profiles": [item.to_public_dict() for item in REGION_PROFILES],
        "companies": companies,
    }


def validate(document: dict, regions: dict[str, list], countries: dict[str, list]) -> list[str]:
    errors: list[str] = []
    if document.get("placeholder_parameters") is not True:
        errors.append("placeholder flag missing")
    if document.get("fitted_to_real_filings") is not False:
        errors.append("document claims to be fitted to filings")
    names = []
    for company in document["companies"]:
        names.append(company["name"])
        if company["identity"].get("ticker") not in (None,):
            errors.append(f"{company['id']} has a ticker")
        if "share_price" in company or "ticker" in company:
            errors.append(f"{company['id']} exposes a market price field")
        if hits_denylist(company["name"]):
            errors.append(f"{company['id']} name hit the denylist")
        if not company["admin1"].startswith(company["country"] + "-"):
            errors.append(f"{company['id']} region is not in its country")
        if company["country"] != COUNTRY:
            polygons = countries.get(company["country"])
            if polygons is None or not region_contains(polygons, company["lon"], company["lat"]):
                errors.append(f"{company['id']} sits outside {company['country']}")
            polygons = []
        else:
            polygons = regions.get(company["admin1"])
        if company["country"] != COUNTRY:
            pass
        elif polygons is None:
            errors.append(f"{company['id']} has an unknown region")
        elif not region_contains(polygons, company["lon"], company["lat"]):
            errors.append(f"{company['id']} sits outside {company['admin1']}")
        for axis in ("lat", "lon"):
            if round(company[axis], 2) != company[axis]:
                errors.append(f"{company['id']} {axis} is finer than two decimals")
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
              label TEXT NOT NULL,
              placeholder INTEGER NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE TABLE companies (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              legal_name TEXT NOT NULL,
              sector_id TEXT NOT NULL,
              country TEXT NOT NULL,
              admin1 TEXT NOT NULL,
              site_name TEXT NOT NULL,
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
              legal_name TEXT NOT NULL,
              sector_id TEXT NOT NULL,
              country TEXT NOT NULL,
              admin1 TEXT NOT NULL,
              site_name TEXT NOT NULL,
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
                "INSERT INTO industry_parameters (sector_id, label, placeholder, payload) VALUES (?, ?, 1, ?)",
                (industry["sector_id"], industry["label"], json.dumps(industry, ensure_ascii=False)),
            )
        for company in document["companies"]:
            connection.execute(
                """
                INSERT INTO companies (
                  id, name, legal_name, sector_id, country, admin1,
                  site_name, lat, lon, founded_year, employees
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    company["id"],
                    company["name"],
                    company["legal_name"],
                    company["sector_id"],
                    company["country"],
                    company["admin1"],
                    company["site_name"],
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
                  id, legal_name, sector_id, country, admin1, site_name,
                  lat, lon, founded_year, employees, period, revenue, ebitda,
                  model_multiple_millis, debt, cash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    company["id"],
                    company["legal_name"],
                    company["sector_id"],
                    company["country"],
                    company["admin1"],
                    company["site_name"],
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
        "legal_name": company["legal_name"],
        "sector_id": company["sector_id"],
        "country": company["country"],
        "admin1": company["admin1"],
        "site_name": company["site_name"],
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


def bps(value: float) -> int:
    return round_int(value * 10_000)


def build_universe(document: dict, sim_states: dict, start_year: int, quarters: int) -> dict:
    """What sim-core needs to open a game: each company's books on day one and
    the parameters that move them. Quarter history is left out."""
    industries = []
    for item in INDUSTRIES:
        industries.append(
            {
                "sector_id": item.sector_id,
                "monthly_growth_bps": bps(item.quarterly_growth_mean / 3.0),
                "monthly_growth_std_bps": bps(item.quarterly_growth_std / 3.0),
                "monthly_da_rate_bps": bps(item.quarterly_da_rate / 3.0),
                "capex_ratio_bps": bps(item.quarterly_capex_ratio),
                "interest_spread_bps": bps(item.cash_interest_spread),
                "tax_rate_bps": bps(item.tax_rate),
                "dso_days": round_int(item.dso_days),
                "dio_days": round_int(item.dio_days),
                "dpo_days": round_int(item.dpo_days),
                "min_cash_to_revenue_bps": bps(item.min_cash_to_revenue),
                "dividend_payout_bps": bps(item.dividend_payout),
                "dividend_leverage_cap_millis": round_int(item.dividend_leverage_cap * 1000),
                "base_multiple_millis": round_int(item.base_multiple_mean * 1000),
                "rate_beta_millis": round_int(item.rate_beta * 1000),
                "cycle_amplitude_bps": bps(item.cycle_amplitude),
                "multiple_floor_millis": round_int(item.multiple_floor * 1000),
                "multiple_cap_millis": round_int(item.multiple_cap * 1000),
            }
        )
    companies = []
    for company in document["companies"]:
        sim = sim_states[company["id"]]
        state = sim["state"]
        companies.append(
            {
                "id": company["id"],
                "legal_name": company["legal_name"],
                "sector_id": company["sector_id"],
                "country": company["country"],
                "admin1": company["admin1"],
                "site_name": company["site_name"],
                "lat": company["lat"],
                "lon": company["lon"],
                "founded_year": company["founded_year"],
                "employees": company["employees"],
                "union_strength_bps": bps(company["union_strength"]),
                "base_multiple_millis": round_int(sim["base_multiple"] * 1000),
                "gross_margin_bps": bps(state["gross_margin"]),
                "sga_ratio_bps": bps(state["sga_ratio"]),
                "monthly_revenue": round_int(state["revenue"] / 3.0),
                "cash": state["cash"],
                "accounts_receivable": state["ar"],
                "inventory": state["inv"],
                "gross_ppe": state["gross_ppe"],
                "accumulated_depreciation": state["accum_dep"],
                "accounts_payable": state["ap"],
                "debt": state["debt"],
                "share_capital": state["share_capital"],
                "retained_earnings": state["retained_earnings"],
            }
        )
    end_year = start_year + (quarters // 4)
    return {
        "schema": "universe",
        "schema_version": SCHEMA_VERSION,
        "seed": document["seed"],
        "unit": document["unit"],
        "opens": {"year": end_year, "month": 1},
        "placeholder_parameters": True,
        "industries": industries,
        "companies": companies,
    }


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Generate fictional companies and three-statement history.")
    parser.add_argument("--seed", type=int, default=2024)
    parser.add_argument("--count", type=int, default=250, help="Companies in the United States.")
    parser.add_argument("--foreign-count", type=int, default=250, help="Companies in the other six countries.")
    parser.add_argument("--fixture-count", type=int, default=4)
    parser.add_argument("--quarters", type=int, default=8)
    parser.add_argument("--start-year", type=int, default=2025)
    parser.add_argument("--policy-rate", type=float, default=0.0525)
    parser.add_argument("--neutral-rate", type=float, default=0.0275)
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
        "--universe",
        type=Path,
        default=root / "public" / "content" / "universe.json",
        help="Opening books for sim-core. Quarter history is not included.",
    )
    parser.add_argument(
        "--regions",
        type=Path,
        default=root / "public" / "geo" / "us-states.json",
        help="Region outlines built by tools/build-geo.mjs.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate and write outputs. Exit 1 if an accounting identity fails.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.regions.exists():
        print(f"error: {args.regions} is missing. Run node tools/build-geo.mjs first.")
        return 1
    regions = load_regions(args.regions)
    countries = load_countries(args.regions.parent / "world.json")
    document = build_document(
        seed=args.seed,
        count=args.count,
        quarters=args.quarters,
        start_year=args.start_year,
        policy_rate=args.policy_rate,
        neutral_rate=args.neutral_rate,
        regions=regions,
        countries=countries,
        foreign_count=args.foreign_count,
    )
    sim_states = {company["id"]: company.pop("_sim") for company in document["companies"]}
    errors = validate(document, regions, countries)
    if errors:
        for error in errors:
            print(f"error: {error}")
        return 1
    args.json.parent.mkdir(parents=True, exist_ok=True)
    args.json.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fixture = dict(document, companies=document["companies"][: args.fixture_count])
    args.fixture.parent.mkdir(parents=True, exist_ok=True)
    args.fixture.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_sqlite(args.sqlite, document)
    universe = build_universe(document, sim_states, args.start_year, args.quarters)
    args.universe.parent.mkdir(parents=True, exist_ok=True)
    args.universe.write_text(
        json.dumps(universe, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(
        f"wrote {len(document['companies'])} companies x {args.quarters} quarters "
        f"seed={args.seed} unit={UNIT}"
    )
    print(f"json {args.json}")
    print(f"sqlite {args.sqlite}")
    print(f"fixture {args.fixture} ({len(fixture['companies'])} companies)")
    print(f"universe {args.universe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
