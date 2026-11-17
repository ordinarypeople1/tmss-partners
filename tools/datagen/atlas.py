"""Playable book: 110 fictional companies across 11 sectors, and a thin deal list.

The sample fixture stays at four companies. This writer does not replace it.
Quarter history is one file per company. The boot file that the simulator
reads has the latest statement only.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from dataclasses import asdict

from distributions import INDUSTRIES, NAME_DENYLIST, IndustryDistribution
from generate import build_document, card_from_company, validate, write_sqlite

SEED = 20241118
COUNT = 110
QUARTERS = 8
PAGE_SIZE = 20

SELLERS = ("founder", "family", "conglomerate", "pe_exit", "court")
STAGES = ("buyout", "growth", "vc", "distressed", "buyout", "growth")
GIVEN = ("가온", "나래", "다온", "라온", "모람", "바르", "소담", "아람", "온새", "이든", "지온", "하람")
FAMILY = ("서", "모", "라", "온", "배", "문", "류", "정")


def bps(value: float) -> int:
    return int(round(value * 10_000))


def millis(value: float) -> int:
    return int(round(value * 1_000))


def _sector(template: IndustryDistribution, sector_id: str, label_ko: str, **overrides) -> IndustryDistribution:
    payload = asdict(template)
    payload["sector_id"] = sector_id
    payload["label_ko"] = label_ko
    payload.update(overrides)
    return IndustryDistribution(**payload)


def atlas_industries() -> tuple[IndustryDistribution, ...]:
    food, parts, logistics = INDUSTRIES
    return (
        _sector(parts, "energy", "에너지", base_multiple_mean=6.5, multiple_floor=3.5, multiple_cap=10.0),
        _sector(parts, "materials", "소재", base_multiple_mean=7.0),
        _sector(parts, "industrials", "산업재", base_multiple_mean=7.4),
        _sector(food, "discretionary", "경기소비재", base_multiple_mean=8.5, revenue_median_krw_million=70_000),
        _sector(food, "staples", "필수소비재"),
        _sector(food, "health", "헬스케어", base_multiple_mean=11.0, multiple_cap=16.0, gross_margin_mean=0.48),
        _sector(logistics, "financials", "금융", ppe_to_annual_revenue=0.08, base_multiple_mean=6.0, multiple_floor=3.0),
        _sector(parts, "information_technology", "정보기술", base_multiple_mean=12.0, multiple_cap=18.0, gross_margin_mean=0.42),
        _sector(food, "communication", "커뮤니케이션", base_multiple_mean=9.0),
        _sector(logistics, "utilities", "유틸리티", base_multiple_mean=8.0, quarterly_growth_mean=0.003),
        _sector(logistics, "real_estate", "부동산", base_multiple_mean=10.0, ppe_to_annual_revenue=1.4),
    )


ATLAS_INDUSTRIES = atlas_industries()

NAME_CORES = {
    "energy": ("발전", "정제", "가스", "설비"),
    "materials": ("화학", "합금", "펄프", "유리"),
    "industrials": ("기계", "물류", "건설", "조선"),
    "discretionary": ("의류", "자동차", "외식", "레저"),
    "staples": ("제분", "생활", "음료", "마트"),
    "health": ("제약", "진단", "기기", "병원"),
    "financials": ("캐피탈", "보험", "증권", "신탁"),
    "information_technology": ("소프트", "반도체", "장비", "데이터"),
    "communication": ("통신", "미디어", "광고", "콘텐츠"),
    "utilities": ("전력", "수도", "열병합", "가스망"),
    "real_estate": ("개발", "리츠", "자산", "도시"),
}

SUBINDUSTRY = {
    "energy": ("oil", "power_equip"),
    "materials": ("chemicals", "metals"),
    "industrials": ("machinery", "logistics"),
    "discretionary": ("auto", "retail"),
    "staples": ("food", "household"),
    "health": ("pharma", "devices"),
    "financials": ("bank", "insurance"),
    "information_technology": ("software", "semiconductors"),
    "communication": ("telecom", "media"),
    "utilities": ("electric", "water"),
    "real_estate": ("development", "reit"),
}

# Two-decimal boxes around real admin-1 centers. Not a survey, not a street address.
WORLD_REGIONS = (
    {"id": "kr-seoul", "country": "KR", "label_ko": "서울", "admin_ko": "서울특별시", "lat": (37.45, 37.65), "lon": (126.85, 127.10), "complex_ko": "가온 단지", "legal_prefix": "주식회사 "},
    {"id": "kr-gg", "country": "KR", "label_ko": "경기", "admin_ko": "경기도", "lat": (37.20, 37.70), "lon": (126.60, 127.40), "complex_ko": "모람 단지", "legal_prefix": "주식회사 "},
    {"id": "kr-ic", "country": "KR", "label_ko": "인천", "admin_ko": "인천광역시", "lat": (37.40, 37.55), "lon": (126.60, 126.80), "complex_ko": "북안 단지", "legal_prefix": "주식회사 "},
    {"id": "kr-dj", "country": "KR", "label_ko": "대전", "admin_ko": "대전광역시", "lat": (36.30, 36.45), "lon": (127.30, 127.50), "complex_ko": "이든 단지", "legal_prefix": "주식회사 "},
    {"id": "kr-bs", "country": "KR", "label_ko": "부산", "admin_ko": "부산광역시", "lat": (35.10, 35.25), "lon": (129.00, 129.20), "complex_ko": "소담 단지", "legal_prefix": "주식회사 "},
    {"id": "kr-jb", "country": "KR", "label_ko": "전북", "admin_ko": "전북특별자치도", "lat": (35.70, 35.95), "lon": (126.90, 127.20), "complex_ko": "라온 단지", "legal_prefix": "주식회사 "},
    {"id": "jp-tokyo", "country": "JP", "label_ko": "도쿄", "admin_ko": "東京都", "lat": (35.60, 35.75), "lon": (139.60, 139.85), "complex_ko": "도쿄 단지", "legal_prefix": ""},
    {"id": "jp-osaka", "country": "JP", "label_ko": "오사카", "admin_ko": "大阪府", "lat": (34.60, 34.75), "lon": (135.40, 135.60), "complex_ko": "오사카 단지", "legal_prefix": ""},
    {"id": "jp-aichi", "country": "JP", "label_ko": "아이치", "admin_ko": "愛知県", "lat": (35.05, 35.25), "lon": (136.80, 137.05), "complex_ko": "아이치 단지", "legal_prefix": ""},
    {"id": "jp-fukuoka", "country": "JP", "label_ko": "후쿠오카", "admin_ko": "福岡県", "lat": (33.50, 33.70), "lon": (130.30, 130.50), "complex_ko": "후쿠오카 단지", "legal_prefix": ""},
    {"id": "cn-gd", "country": "CN", "label_ko": "광둥", "admin_ko": "广东省", "lat": (22.80, 23.40), "lon": (113.10, 113.60), "complex_ko": "광둥 단지", "legal_prefix": ""},
    {"id": "cn-js", "country": "CN", "label_ko": "장쑤", "admin_ko": "江苏省", "lat": (31.80, 32.20), "lon": (118.60, 119.10), "complex_ko": "장쑤 단지", "legal_prefix": ""},
    {"id": "cn-zj", "country": "CN", "label_ko": "저장", "admin_ko": "浙江省", "lat": (30.10, 30.40), "lon": (120.00, 120.40), "complex_ko": "저장 단지", "legal_prefix": ""},
    {"id": "cn-sd", "country": "CN", "label_ko": "산둥", "admin_ko": "山东省", "lat": (36.50, 36.80), "lon": (117.00, 117.40), "complex_ko": "산둥 단지", "legal_prefix": ""},
    {"id": "tw-tpe", "country": "TW", "label_ko": "타이베이", "admin_ko": "台北市", "lat": (25.00, 25.15), "lon": (121.45, 121.60), "complex_ko": "타이베이 단지", "legal_prefix": ""},
    {"id": "tw-khh", "country": "TW", "label_ko": "가오슝", "admin_ko": "高雄市", "lat": (22.55, 22.70), "lon": (120.25, 120.40), "complex_ko": "가오슝 단지", "legal_prefix": ""},
    {"id": "us-ca", "country": "US", "label_ko": "캘리포니아", "admin_ko": "California", "lat": (34.00, 34.20), "lon": (-118.40, -118.15), "complex_ko": "캘리포니아 단지", "legal_prefix": ""},
    {"id": "us-tx", "country": "US", "label_ko": "텍사스", "admin_ko": "Texas", "lat": (29.70, 29.90), "lon": (-95.50, -95.25), "complex_ko": "텍사스 단지", "legal_prefix": ""},
    {"id": "us-ny", "country": "US", "label_ko": "뉴욕", "admin_ko": "New York", "lat": (40.70, 40.85), "lon": (-74.05, -73.90), "complex_ko": "뉴욕 단지", "legal_prefix": ""},
    {"id": "us-il", "country": "US", "label_ko": "일리노이", "admin_ko": "Illinois", "lat": (41.80, 41.95), "lon": (-87.75, -87.60), "complex_ko": "일리노이 단지", "legal_prefix": ""},
    {"id": "gb-eng", "country": "GB", "label_ko": "잉글랜드", "admin_ko": "England", "lat": (51.45, 51.55), "lon": (-0.20, 0.05), "complex_ko": "잉글랜드 단지", "legal_prefix": ""},
    {"id": "gb-sct", "country": "GB", "label_ko": "스코틀랜드", "admin_ko": "Scotland", "lat": (55.90, 56.00), "lon": (-3.30, -3.15), "complex_ko": "스코틀랜드 단지", "legal_prefix": ""},
    {"id": "fr-idf", "country": "FR", "label_ko": "일드프랑스", "admin_ko": "Île-de-France", "lat": (48.80, 48.92), "lon": (2.25, 2.45), "complex_ko": "일드프랑스 단지", "legal_prefix": ""},
    {"id": "fr-ara", "country": "FR", "label_ko": "오베르뉴론알프", "admin_ko": "Auvergne-Rhône-Alpes", "lat": (45.70, 45.80), "lon": (4.80, 4.95), "complex_ko": "론 단지", "legal_prefix": ""},
    {"id": "de-nw", "country": "DE", "label_ko": "노르트라인베스트팔렌", "admin_ko": "Nordrhein-Westfalen", "lat": (51.20, 51.30), "lon": (6.70, 6.85), "complex_ko": "라인 단지", "legal_prefix": ""},
    {"id": "de-by", "country": "DE", "label_ko": "바이에른", "admin_ko": "Bayern", "lat": (48.10, 48.20), "lon": (11.50, 11.65), "complex_ko": "바이에른 단지", "legal_prefix": ""},
)


def industry_for(sector_id: str):
    for industry in ATLAS_INDUSTRIES:
        if industry.sector_id == sector_id:
            return industry
    raise KeyError(sector_id)


def person_name(index: int) -> str:
    name = f"{FAMILY[index % len(FAMILY)]}{GIVEN[index % len(GIVEN)]}"
    if any(token in name for token in NAME_DENYLIST):
        raise RuntimeError(name)
    return name


def books_from_quarter(quarter: dict) -> dict:
    income = quarter["income"]
    balance = quarter["balance"]
    cashflow = quarter["cashflow"]
    return {
        "period": quarter["period"],
        "revenue": income["revenue"],
        "cogs": income["cogs"],
        "gross_profit": income["gross_profit"],
        "sga": income["sga"],
        "ebitda": income["ebitda"],
        "da": income["da"],
        "ebit": income["ebit"],
        "interest": income["interest_expense"],
        "ebt": income["ebt"],
        "tax": income["tax"],
        "net_income": income["net_income"],
        "cash": balance["cash"],
        "ar": balance["accounts_receivable"],
        "inv": balance["inventory"],
        "gross_ppe": balance["gross_ppe"],
        "accum_dep": balance["accumulated_depreciation"],
        "net_ppe": balance["net_ppe"],
        "ap": balance["accounts_payable"],
        "debt": balance["debt"],
        "share_capital": balance["share_capital"],
        "retained": balance["retained_earnings"],
        "dividends": cashflow["dividends"],
        "cfo": cashflow["cash_from_operations"],
        "cfi": cashflow["cash_from_investing"],
        "cff": cashflow["cash_from_financing"],
        "net_change": cashflow["net_change_in_cash"],
        "model_multiple_millis": millis(quarter["model_multiple"]),
    }


def drivers_for(company: dict, policy_rate: float) -> dict:
    industry = industry_for(company["sector_id"])
    latest = company["quarters"][-1]
    income = latest["income"]
    revenue = max(income["revenue"], 1)
    return {
        "gross_margin_bps": int(round(income["gross_profit"] / revenue * 10_000)),
        "sga_bps": int(round(income["sga"] / revenue * 10_000)),
        "growth_bps": bps(industry.quarterly_growth_mean),
        "interest_rate_bps": bps(policy_rate + industry.cash_interest_spread),
        "da_rate_bps": bps(industry.quarterly_da_rate),
        "capex_bps": bps(industry.quarterly_capex_ratio),
        "dso_days": int(round(industry.dso_days)),
        "dio_days": int(round(industry.dio_days)),
        "dpo_days": int(round(industry.dpo_days)),
        "tax_bps": bps(industry.tax_rate),
        "dividend_payout_bps": bps(industry.dividend_payout),
        "min_cash_bps": bps(industry.min_cash_to_revenue),
        "amort_bps": bps(industry.quarterly_amort_fraction),
        "dividend_leverage_cap_millis": millis(industry.dividend_leverage_cap),
        "base_multiple_millis": millis(company["base_multiple"]),
        "rate_beta_millis": millis(industry.rate_beta),
        "cycle_amplitude_millis": millis(industry.cycle_amplitude),
        "multiple_floor_millis": millis(industry.multiple_floor),
        "multiple_cap_millis": millis(industry.multiple_cap),
    }


def clamp_coord(lat: float, lon: float) -> tuple[float, float]:
    return round(min(39.2, max(33.2, lat)), 2), round(min(131.5, max(124.3, lon)), 2)


def sites_for(company: dict, index: int) -> list[dict]:
    sector = company["sector_id"]
    if sector in {"staples", "discretionary", "health", "communication"}:
        kinds = ("factory", "warehouse", "store")
    elif sector in {"real_estate", "financials"}:
        kinds = ("store", "warehouse")
    else:
        kinds = ("factory", "warehouse")
    offsets = ((0.0, 0.0), (0.02, -0.01), (-0.01, 0.02))
    sites = []
    net = company["quarters"][-1]["balance"]["net_ppe"]
    for slot, kind in enumerate(kinds):
        lat, lon = clamp_coord(
            company["lat"] + offsets[slot][0],
            company["lon"] + offsets[slot][1],
        )
        sites.append(
            {
                "id": f"{company['id']}-{kind[:1]}{slot}",
                "kind": kind,
                "name_ko": f"{company['name_ko']} {slot + 1}",
                "lat": lat,
                "lon": lon,
                "book_value": max(net // len(kinds), 1),
                "capacity": 8 + ((index + slot) % 20),
            }
        )
    return sites


def cap_for(company: dict, seller: str) -> list[dict]:
    if seller == "conglomerate":
        rows = [("지주", "conglomerate", 7000), ("임원", "management", 1500), ("우리사주", "treasury", 1500)]
    elif seller == "pe_exit":
        rows = [("기존 펀드", "pe", 7600), ("경영진", "management", 2400)]
    elif seller == "court":
        rows = [("관리인", "court", 10000)]
    elif seller == "family":
        rows = [("가족", "family", 6800), ("창업자", "founder", 3200)]
    else:
        rows = [("창업자", "founder", 8200), ("가족", "family", 1800)]
    return [
        {"holder_ko": f"{company['name_ko']} {label}", "holder_kind": kind, "stake_bps": stake}
        for label, kind, stake in rows
    ]


def management_for(index: int) -> list[dict]:
    traits = ("operator", "grower", "cutter")
    return [
        {
            "id": f"mgr-{index}-ceo",
            "name_ko": person_name(index),
            "role": "ceo",
            "trait_id": traits[index % 3],
        },
        {
            "id": f"mgr-{index}-cfo",
            "name_ko": person_name(index + 5),
            "role": "cfo",
            "trait_id": "operator",
        },
    ]


def approach_for(company: dict, seller: str) -> tuple[str, str]:
    latest = company["quarters"][-1]
    ebitda = max(latest["income"]["ebitda"], 1)
    leverage = latest["balance"]["debt"] / (ebitda * 4)
    if leverage > 4.5 or seller == "court":
        return "distressed", "senior_loan"
    if company["sector_id"] in {"information_technology", "health", "communication"} and leverage < 2:
        return "growth", "rcps"
    if latest["income"]["revenue"] < 8_000:
        return "vc", "rcps"
    return "buyout", "buyout"


def agents() -> list[dict]:
    rows = [
        ("lp-seorin", "서린 공제회", "lp", "pension", 20_000),
        ("lp-bukan", "북안 은행", "lp", "bank", 12_000),
        ("lp-house", "하우스 약정", "lp", "gp", 2_000),
        ("lp-ideun", "이든 장학재단", "lp", "endowment", 8_000),
        ("lp-moram", "모람 산업", "lp", "corporate", 8_000),
        ("ib-gaon", "가온 증권", "ib", "bank", 0),
        ("ib-raon", "라온 자문", "ib", "advisor", 0),
        ("ib-bareu", "바르 마켓", "ib", "bank", 0),
        ("ib-sodam", "소담 파트너스", "ib", "advisor", 0),
        ("si-onsae", "온새 식품", "si", "strategic", 0),
        ("si-jion", "지온 부품", "si", "strategic", 0),
        ("si-aram", "아람 로지스", "si", "strategic", 0),
        ("len-narae", "나래 은행", "lender", "bank", 0),
        ("len-daon", "다온 캐피탈", "lender", "private_credit", 0),
        ("len-aram", "아람 크레딧", "lender", "private_credit", 0),
    ]
    return [
        {"id": id_, "name_ko": name, "kind": kind, "subtype": subtype, "commitment": commitment}
        for id_, name, kind, subtype, commitment in rows
    ]


def candidates() -> list[dict]:
    traits = ("operator", "grower", "cutter")
    return [
        {"id": f"cand-{index}", "name_ko": person_name(20 + index), "trait_id": traits[index % 3]}
        for index in range(8)
    ]


def deals_for(companies: list[dict]) -> list[dict]:
    # About 7% of the universe is on the market. The rest is self-sourced.
    step = max(len(companies) // 8, 1)
    picks = tuple(index for index in range(0, len(companies), step))[:8]
    brokers = ("ib-gaon", "ib-raon", "ib-bareu", "ib-sodam")
    rivals = ("나래 캐피탈", "바르 인베스트", "소담 홀딩", "온새 파트너스")
    deals = []
    for slot, index in enumerate(picks):
        company = companies[index]
        latest = company["quarters"][-1]
        ebitda = latest["income"]["ebitda"]
        multiple = latest["model_multiple"]
        ask_ev = max(int(round(ebitda * multiple)), 1)
        stage = STAGES[slot % len(STAGES)]
        seller = company["owner_kind"]
        auction = slot % 2 == 0 and stage == "buyout"
        if stage == "vc":
            instrument = "rcps"
            ask_size = max(ask_ev // 5, 200)
            coupon = 0
        elif stage == "growth":
            instrument = "rcps"
            ask_size = max(ask_ev // 4, 300)
            coupon = 0
        elif stage == "distressed":
            instrument = "senior_loan" if slot % 2 else "buyout"
            ask_size = max(latest["balance"]["debt"] // 2, 400)
            coupon = 900 if instrument == "senior_loan" else 0
        else:
            instrument = "buyout"
            ask_size = ask_ev
            coupon = 0
        deals.append(
            {
                "id": f"dl-{slot + 1:03d}",
                "company_id": company["id"],
                "stage": stage,
                "process": "auction" if auction else "bilateral",
                "access": "invite" if auction else "open",
                "seller_kind": seller,
                "broker_id": brokers[slot % len(brokers)] if auction or slot % 3 == 0 else "",
                "instrument": instrument,
                "ask_ev": ask_ev,
                "ask_size": ask_size,
                "ask_coupon_bps": coupon,
                "weeks_left": 26 + (slot % 13),
                "competing_ev": int(ask_ev * 0.9) if auction else 0,
                "competitor_ko": rivals[slot % len(rivals)] if auction else "",
            }
        )
    return deals


def company_record(company: dict, index: int, policy_rate: float) -> dict:
    seller = SELLERS[index % len(SELLERS)]
    stage, instrument = approach_for(company, seller)
    latest = company["quarters"][-1]
    ebitda = max(latest["income"]["ebitda"], 1)
    openness = 320 + ((index * 47) % 520)
    if seller == "court":
        openness = min(openness, 400)
    return {
        "id": company["id"],
        "name_ko": company["name_ko"],
        "legal_name_ko": company["legal_name_ko"],
        "country": company.get("country", "KR"),
        "subindustry_id": SUBINDUSTRY[company["sector_id"]][index % 2],
        "sector_id": company["sector_id"],
        "region_label_ko": company["region_label_ko"],
        "complex_name_ko": company["complex_name_ko"],
        "lat": company["lat"],
        "lon": company["lon"],
        "founded_year": company["founded_year"],
        "employees": company["employees"],
        "owner_kind": seller,
        "owner_openness": openness,
        "approach_stage": stage,
        "approach_instrument": instrument,
        "quarter_index": len(company["quarters"]),
        "drivers": drivers_for(company, policy_rate),
        "books": books_from_quarter(latest),
        "sites": sites_for(company, index),
        "cap": cap_for(company, seller),
        "management": management_for(index),
    }


def check_book(record: dict) -> None:
    books = record["books"]
    assets = books["cash"] + books["ar"] + books["inv"] + books["net_ppe"]
    liabilities = books["ap"] + books["debt"]
    equity = books["share_capital"] + books["retained"]
    if assets != liabilities + equity:
        raise RuntimeError(f"{record['id']} boot identity {assets} vs {liabilities + equity}")
    stakes = sum(row["stake_bps"] for row in record["cap"])
    if stakes != 10_000:
        raise RuntimeError(f"{record['id']} cap {stakes}")
    if "quarters" in record:
        raise RuntimeError("boot company carries history")


def extend_sqlite(path: Path, records: list[dict], deal_rows: list[dict], roster: list[dict]) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS deals (
              id TEXT PRIMARY KEY,
              company_id TEXT NOT NULL,
              legal_name_ko TEXT NOT NULL,
              sector_id TEXT NOT NULL,
              stage TEXT NOT NULL,
              process TEXT NOT NULL,
              seller_kind TEXT NOT NULL,
              instrument TEXT NOT NULL,
              ask_ev INTEGER NOT NULL,
              ask_size INTEGER NOT NULL,
              weeks_left INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_deals_sector ON deals(sector_id);
            CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
            CREATE TABLE IF NOT EXISTS agents (
              id TEXT PRIMARY KEY,
              name_ko TEXT NOT NULL,
              kind TEXT NOT NULL,
              subtype TEXT NOT NULL,
              commitment INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_agents_kind ON agents(kind);
            """
        )
        names = {row["id"]: row for row in records}
        connection.executemany(
            """
            INSERT INTO deals (
              id, company_id, legal_name_ko, sector_id, stage, process,
              seller_kind, instrument, ask_ev, ask_size, weeks_left
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    deal["id"],
                    deal["company_id"],
                    names[deal["company_id"]]["legal_name_ko"],
                    names[deal["company_id"]]["sector_id"],
                    deal["stage"],
                    deal["process"],
                    deal["seller_kind"],
                    deal["instrument"],
                    deal["ask_ev"],
                    deal["ask_size"],
                    deal["weeks_left"],
                )
                for deal in deal_rows
            ],
        )
        connection.executemany(
            "INSERT INTO agents (id, name_ko, kind, subtype, commitment) VALUES (?, ?, ?, ?, ?)",
            [(row["id"], row["name_ko"], row["kind"], row["subtype"], row["commitment"]) for row in roster],
        )
        connection.commit()
    finally:
        connection.close()


def write_pages(directory: Path, document: dict) -> None:
    cards = [card_from_company(company) for company in document["companies"]]
    directory.mkdir(parents=True, exist_ok=True)
    for page_index in range(0, len(cards), PAGE_SIZE):
        chunk = cards[page_index : page_index + PAGE_SIZE]
        payload = {
            "schema": "company_card_page",
            "seed": document["seed"],
            "unit": document["unit"],
            "page": page_index // PAGE_SIZE,
            "page_size": PAGE_SIZE,
            "placeholder_parameters": True,
            "cards": chunk,
        }
        path = directory / f"cards-{page_index // PAGE_SIZE}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_playable_book(root: Path) -> int:
    document = build_document(
        seed=SEED,
        count=COUNT,
        quarters=QUARTERS,
        start_year=2024,
        policy_rate=0.035,
        neutral_rate=0.025,
        industries=ATLAS_INDUSTRIES,
        regions=WORLD_REGIONS,
        name_cores=NAME_CORES,
    )
    errors = validate(document, korea_box=False)
    if errors:
        for error in errors:
            print(f"error: {error}")
        return 1
    if len(document["companies"]) != COUNT:
        print("error: company count")
        return 1
    policy = document["macro"]["policy_rate"]
    records = [company_record(company, index, policy) for index, company in enumerate(document["companies"])]
    for record in records:
        check_book(record)
    roster = agents()
    people = candidates()
    deal_rows = deals_for(
        [
            {**company, "owner_kind": records[index]["owner_kind"]}
            for index, company in enumerate(document["companies"])
        ]
    )
    lp_sum = sum(row["commitment"] for row in roster if row["kind"] == "lp")
    if lp_sum != 50_000:
        print(f"error: LP commitments {lp_sum}")
        return 1
    sectors = {row["sector_id"] for row in records}
    expected = {row.sector_id for row in ATLAS_INDUSTRIES}
    if sectors != expected:
        print(f"error: sectors {sectors}")
        return 1
    live = len(deal_rows) / COUNT
    if not 0.05 <= live <= 0.10:
        print(f"error: live deal ratio {live}")
        return 1

    boot = {
        "schema": "atlas_boot",
        "seed": SEED,
        "placeholder_parameters": True,
        "fitted_to_real_filings": False,
        "unit": "krw_million",
        "clock": {"year": 2026, "quarter": 1, "week_in_quarter": 0, "absolute_week": 0},
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
            "reputation": 620,
        },
        "agents": roster,
        "candidates": people,
        "companies": records,
        "deals": deal_rows,
    }
    public = root / "public" / "atlas"
    public.mkdir(parents=True, exist_ok=True)
    (public / "boot.json").write_text(json.dumps(boot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_pages(public / "pages", document)
    dossier_dir = public / "companies"
    dossier_dir.mkdir(parents=True, exist_ok=True)
    for company in document["companies"]:
        dossier = {
            "id": company["id"],
            "placeholder_parameters": True,
            "fitted_to_real_filings": False,
            "quarters": company["quarters"],
        }
        (dossier_dir / f"{company['id']}.json").write_text(
            json.dumps(dossier, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    sqlite_path = root / "tools" / "datagen" / "out" / "content.sqlite"
    write_sqlite(sqlite_path, document)
    extend_sqlite(sqlite_path, records, deal_rows, roster)
    print(f"atlas companies={COUNT} deals={len(deal_rows)} seed={SEED}")
    print(f"boot {public / 'boot.json'}")
    return 0
