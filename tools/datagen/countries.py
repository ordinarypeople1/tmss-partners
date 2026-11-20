"""Placeholder profiles for companies outside the United States.

Each profile is one first-level region of a country: where its companies sit
(a centre and a radius in degrees, not an address), which sectors it leans
toward, and how large, how costly and how unionized its companies run.

These numbers are hand-written stand-ins so the pipeline can run. They are not
fitted to Eurostat, ONS, Destatis, INSEE, KOSIS, e-Stat, NBS or any other
source. Name stems are invented and are not the names of real companies.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from states import SECTOR_ORDER


@dataclass(frozen=True)
class RegionProfile:
    country: str
    admin1: str
    lat: float
    lon: float
    radius: float
    weight: float
    sector_weights: dict
    size_factor: float
    wage_index: float
    union_strength: float
    parks: tuple

    def to_public_dict(self) -> dict:
        payload = asdict(self)
        payload["placeholder"] = True
        payload["fitted_to_public_statistics"] = False
        return payload


@dataclass(frozen=True)
class CountryStyle:
    stems: tuple
    suffixes: tuple
    # Multiplies the sector's base multiple.
    multiple_factor: float


def _region(country, code, lat, lon, radius, weight, mix, size, wage, union, parks):
    return RegionProfile(
        country=country,
        admin1=f"{country}-{code}",
        lat=lat,
        lon=lon,
        radius=radius,
        weight=weight,
        sector_weights=dict(zip(SECTOR_ORDER, mix)),
        size_factor=size,
        wage_index=wage,
        union_strength=union,
        parks=parks,
    )


COUNTRY_STYLES = {
    "GB": CountryStyle(
        stems=("Ashcombe", "Wharfedale", "Pennington", "Trentham", "Brindley", "Calderbrook", "Merrowby",
               "Harcastle", "Tynewick", "Dunholm", "Redesdale", "Stokeley", "Farnleigh", "Oxenby"),
        suffixes=("Ltd", "Group Ltd"),
        multiple_factor=1.0,
    ),
    "DE": CountryStyle(
        stems=("Rheinfeld", "Hohenbrück", "Lindenau", "Kesselbach", "Steinhagen", "Werkstein", "Falkenroth",
               "Brunnhaus", "Ostermark", "Tannwald", "Eichborn", "Altenried", "Grafenau", "Neuweiler"),
        suffixes=("GmbH", "GmbH & Co. KG"),
        multiple_factor=1.0,
    ),
    "FR": CountryStyle(
        stems=("Valmont", "Beaurivage", "Clairmont", "Rochebrune", "Montfleury", "Vauclerc", "Belvaux",
               "Hautecombe", "Lormière", "Castelnau", "Durefort", "Ferrières", "Aubrac", "Sévrac"),
        suffixes=("SAS", "SA"),
        multiple_factor=1.0,
    ),
    "KR": CountryStyle(
        stems=("Garam", "Narae", "Daon", "Raon", "Moram", "Sodam", "Aram", "Onsae", "Jion", "Haram",
               "Bareun", "Saebyeol", "Hanbit", "Miraen"),
        suffixes=("Co., Ltd.",),
        multiple_factor=0.92,
    ),
    "JP": CountryStyle(
        stems=("Aoba", "Hinode", "Kawase", "Minori", "Shirakaba", "Wakaba", "Yamabuki", "Asagiri",
               "Kogane", "Seiryu", "Harukaze", "Tsukimi", "Mizuho Oka", "Natsume"),
        suffixes=("K.K.",),
        multiple_factor=0.95,
    ),
    "CN": CountryStyle(
        stems=("Hengyao", "Jinluo", "Mingzhe", "Ruitan", "Shengwei", "Tianlu", "Xinhuo", "Yongce",
               "Zhongyi", "Baoqing", "Chenlu", "Dexuan", "Fengrun", "Guanglin"),
        suffixes=("Co., Ltd.",),
        multiple_factor=0.9,
    ),
}

# mix is one weight per sector, in SECTOR_ORDER:
# food, industrial, cold chain, business services, healthcare, building products.
REGION_PROFILES: tuple[RegionProfile, ...] = (
    _region("GB", "TLG", 52.5, -1.9, 0.35, 1.2, (2, 5, 2, 3, 2, 3), 0.95, 1.00, 0.35, ("Blackmere Works", "Canalside Trading Estate")),
    _region("GB", "TLD", 53.5, -2.5, 0.30, 1.0, (3, 4, 3, 3, 2, 2), 0.90, 0.96, 0.40, ("Millrace Park", "Northgate Trading Estate")),
    _region("GB", "TLE", 53.8, -1.4, 0.30, 0.9, (4, 4, 3, 2, 2, 3), 0.90, 0.93, 0.40, ("Ridings Business Park", "Colliery Row Estate")),
    _region("GB", "TLI", 51.5, -0.15, 0.15, 1.1, (1, 1, 1, 7, 4, 1), 1.20, 1.35, 0.15, ("Dockside Exchange", "Fenwell Yard")),
    _region("GB", "TLJ", 51.3, -0.8, 0.30, 1.0, (2, 2, 3, 5, 4, 2), 1.05, 1.15, 0.15, ("Thamesmead Park", "Downs Gate Estate")),
    _region("GB", "SCT", 55.9, -3.8, 0.30, 0.6, (4, 3, 2, 3, 3, 2), 0.90, 0.98, 0.40, ("Clydeview Works", "Forth Reach Park")),
    _region("DE", "BY", 48.8, 11.6, 0.6, 1.3, (3, 6, 2, 3, 2, 3), 1.15, 1.20, 0.50, ("Gewerbepark Isarau", "Technikhof Lindach")),
    _region("DE", "BW", 48.7, 9.1, 0.5, 1.3, (2, 7, 2, 2, 2, 3), 1.15, 1.22, 0.55, ("Industriepark Neckarried", "Werkhof Filsbach")),
    _region("DE", "NW", 51.4, 7.3, 0.5, 1.4, (3, 5, 4, 3, 3, 3), 1.10, 1.15, 0.65, ("Gewerbepark Ruhraue", "Zechenhof Park")),
    _region("DE", "HE", 50.4, 8.8, 0.4, 0.8, (2, 3, 4, 5, 3, 2), 1.10, 1.20, 0.45, ("Mainfeld Park", "Taunusblick Gewerbehof")),
    _region("DE", "NI", 52.6, 9.6, 0.5, 0.8, (5, 4, 3, 2, 2, 3), 1.00, 1.08, 0.55, ("Heidepark Gewerbe", "Leinetal Werkhof")),
    _region("DE", "SN", 51.0, 13.3, 0.4, 0.6, (2, 5, 2, 2, 2, 4), 0.90, 0.95, 0.35, ("Elbwiesen Park", "Erzhof Gewerbepark")),
    _region("FR", "IDF", 48.8, 2.4, 0.3, 1.3, (2, 2, 3, 6, 4, 2), 1.15, 1.25, 0.45, ("Parc des Écluses", "Cité des Ateliers")),
    _region("FR", "ARA", 45.6, 4.9, 0.5, 1.2, (3, 5, 2, 3, 3, 3), 1.05, 1.10, 0.50, ("Parc du Confluent", "Zone des Fonderies")),
    _region("FR", "HDF", 50.2, 2.8, 0.4, 0.9, (4, 4, 4, 2, 2, 3), 0.95, 1.02, 0.60, ("Parc des Beffrois", "Zone du Canal")),
    _region("FR", "GES", 48.6, 6.5, 0.5, 0.8, (3, 5, 3, 2, 2, 3), 0.95, 1.03, 0.55, ("Parc de la Moselle", "Zone des Verreries")),
    _region("FR", "PDL", 47.5, -0.9, 0.4, 0.8, (6, 3, 3, 2, 2, 3), 0.95, 1.00, 0.40, ("Parc de la Loire", "Zone des Vergers")),
    _region("FR", "OCC", 43.7, 1.6, 0.4, 0.7, (4, 3, 2, 3, 3, 3), 0.95, 1.00, 0.40, ("Parc de la Garonne", "Zone des Coteaux")),
    _region("KR", "41", 37.3, 127.2, 0.25, 1.5, (3, 6, 4, 3, 2, 3), 1.00, 0.85, 0.35, ("Gaon Industrial Complex", "Narae Logistics Complex")),
    _region("KR", "44", 36.6, 126.9, 0.25, 0.9, (3, 6, 3, 1, 1, 3), 0.95, 0.80, 0.40, ("Moram Parts Complex", "Daon Industrial Complex")),
    _region("KR", "48", 35.3, 128.3, 0.25, 1.0, (2, 7, 3, 1, 1, 3), 1.00, 0.82, 0.60, ("Eden Machinery Complex", "Sodam Industrial Complex")),
    _region("KR", "47", 36.2, 128.7, 0.25, 0.8, (3, 6, 2, 1, 1, 3), 0.95, 0.78, 0.50, ("Haram Industrial Complex", "Onsae Parts Complex")),
    _region("KR", "43", 36.8, 127.6, 0.20, 0.7, (4, 4, 3, 1, 3, 2), 0.90, 0.78, 0.30, ("Aram Food Complex", "Jion Industrial Complex")),
    _region("KR", "28", 37.45, 126.72, 0.08, 0.7, (3, 3, 6, 2, 1, 2), 0.95, 0.84, 0.40, ("Raon Cold Chain Complex", "Bareun Logistics Complex")),
    _region("JP", "23", 35.0, 137.15, 0.20, 1.4, (2, 8, 2, 2, 2, 2), 1.10, 0.90, 0.40, ("Aoba Industrial Park", "Kogane Works")),
    _region("JP", "27", 34.65, 135.6, 0.12, 1.1, (3, 5, 3, 3, 3, 2), 1.00, 0.92, 0.35, ("Hinode Industrial Park", "Asagiri Works")),
    _region("JP", "11", 35.95, 139.4, 0.15, 1.0, (4, 4, 4, 2, 3, 2), 0.95, 0.90, 0.30, ("Wakaba Logistics Park", "Minori Food Park")),
    _region("JP", "22", 34.95, 138.3, 0.15, 0.9, (4, 5, 2, 1, 2, 3), 0.95, 0.86, 0.35, ("Yamabuki Industrial Park", "Seiryu Works")),
    _region("JP", "40", 33.6, 130.6, 0.15, 0.8, (4, 3, 4, 3, 3, 2), 0.90, 0.80, 0.30, ("Harukaze Park", "Natsume Logistics Park")),
    _region("JP", "09", 36.6, 139.85, 0.15, 0.7, (3, 6, 2, 1, 2, 3), 0.90, 0.82, 0.35, ("Shirakaba Industrial Park", "Kawase Works")),
    _region("CN", "GD", 23.3, 113.6, 0.5, 1.5, (2, 7, 3, 2, 1, 4), 1.10, 0.45, 0.10, ("Tianlu Industrial Zone", "Jinluo Export Park")),
    _region("CN", "JS", 32.3, 119.5, 0.5, 1.4, (2, 7, 3, 2, 1, 4), 1.10, 0.42, 0.10, ("Mingzhe Industrial Zone", "Zhongyi Equipment Park")),
    _region("CN", "ZJ", 29.6, 120.3, 0.5, 1.2, (2, 6, 3, 2, 1, 5), 1.00, 0.42, 0.10, ("Xinhuo Industrial Zone", "Baoqing Components Park")),
    _region("CN", "SD", 36.4, 118.2, 0.6, 1.1, (5, 5, 3, 1, 1, 4), 1.00, 0.36, 0.10, ("Shengwei Food Zone", "Hengyao Industrial Zone")),
    _region("CN", "SC", 30.6, 104.2, 0.6, 0.8, (5, 3, 3, 2, 3, 3), 0.90, 0.33, 0.10, ("Chenlu Industrial Zone", "Fengrun Food Zone")),
    _region("CN", "HB", 30.8, 113.6, 0.6, 0.8, (3, 5, 4, 1, 2, 4), 0.95, 0.34, 0.10, ("Yongce Industrial Zone", "Guanglin Logistics Park")),
)
