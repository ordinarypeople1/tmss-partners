"""Placeholder state profiles for the content generator.

A profile is the unit the generator draws a company from: which sectors a
state leans toward, how large its companies run, what labor costs, how strong
its unions are, and the fictional industrial parks a site can sit in.

These numbers are hand-written stand-ins so the pipeline can run. They are not
fitted to Census, BLS, BEA, or any other source. Park names are invented and
are not the names of real places.

Only states listed here receive companies. The rest of the 187 regions in
src/data/geo/admin1.json have no profile yet.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class StateProfile:
    admin1: str
    # Share of the generated universe that lands in this state, before normalizing.
    weight: float
    # Sector mix, before normalizing. Keys are sector ids.
    sector_weights: dict
    # Multiplies the sector's median revenue.
    size_factor: float
    # 1.0 is the national level. Raises SG&A and lowers headcount per dollar.
    wage_index: float
    # 0 to 1. Stored on the company for labor events. No effect on the books yet.
    union_strength: float
    parks: tuple

    def to_public_dict(self) -> dict:
        payload = asdict(self)
        payload["placeholder"] = True
        payload["fitted_to_public_statistics"] = False
        return payload


SECTOR_ORDER = (
    "food_manufacturing",
    "industrial_components",
    "cold_chain_logistics",
    "business_services",
    "healthcare_services",
    "building_products",
)


def _profile(admin1, weight, mix, size, wage, union, parks):
    """`mix` is one weight per sector, in SECTOR_ORDER."""
    return StateProfile(
        admin1=admin1,
        weight=weight,
        sector_weights=dict(zip(SECTOR_ORDER, mix)),
        size_factor=size,
        wage_index=wage,
        union_strength=union,
        parks=parks,
    )


STATE_PROFILES: tuple[StateProfile, ...] = (
    _profile("US-MI", 1.2, (2, 6, 2, 2, 2, 3), 1.05, 1.00, 0.70, ("Tamarack Works", "Graystone Forge Park")),
    _profile("US-OH", 1.3, (3, 5, 2, 2, 3, 3), 1.00, 0.96, 0.60, ("Buckthorn Commerce Park", "Mill Run Industrial Park")),
    _profile("US-IL", 1.4, (4, 3, 3, 4, 3, 2), 1.15, 1.06, 0.65, ("Prairie Junction Park", "Lockport Row Yards")),
    _profile("US-WI", 0.9, (5, 3, 2, 1, 2, 3), 0.90, 0.95, 0.50, ("Cedar Hollow Dairy Park", "Fox Bend Industrial Park")),
    _profile("US-IN", 0.9, (2, 5, 3, 1, 2, 3), 0.95, 0.93, 0.45, ("Crossroads Works", "Wabash Flats Park")),
    _profile("US-PA", 1.2, (3, 4, 3, 3, 4, 3), 1.00, 1.01, 0.60, ("Anthracite Ridge Park", "Keystone Siding Yards")),
    _profile("US-TX", 1.8, (3, 4, 3, 4, 4, 4), 1.20, 0.98, 0.15, ("Mesquite Flats Commerce Park", "Brazos Bend Industrial Park")),
    _profile("US-CA", 1.8, (5, 2, 3, 5, 4, 3), 1.25, 1.22, 0.45, ("Valley Oak Packing District", "Delta Reach Logistics Park")),
    _profile("US-GA", 1.0, (3, 2, 5, 3, 3, 3), 1.00, 0.94, 0.15, ("Piedmont Gate Logistics Park", "Longleaf Commerce Park")),
    _profile("US-NC", 1.0, (4, 3, 3, 3, 3, 4), 0.95, 0.92, 0.10, ("Sandhill Commerce Park", "Blue Heron Industrial Park")),
    _profile("US-TN", 0.8, (2, 4, 4, 2, 5, 3), 0.95, 0.91, 0.15, ("Cumberland Bend Park", "Ironwood Siding Yards")),
    _profile("US-MN", 0.8, (5, 3, 2, 3, 4, 2), 1.05, 1.03, 0.50, ("North Prairie Mill Park", "Lakehead Industrial Park")),
    _profile("US-NY", 1.3, (2, 2, 2, 6, 4, 2), 1.20, 1.20, 0.65, ("Mohawk Lock Commerce Park", "Tidewater Row Yards")),
    _profile("US-NJ", 0.9, (3, 2, 5, 4, 3, 2), 1.10, 1.15, 0.55, ("Meadow Reach Logistics Park", "Raritan Bend Park")),
    _profile("US-MA", 0.8, (2, 3, 1, 5, 6, 1), 1.10, 1.18, 0.40, ("Granite Mill Park", "Harborview Works")),
    _profile("US-FL", 1.3, (3, 1, 4, 5, 6, 4), 1.00, 0.95, 0.10, ("Palmetto Gate Commerce Park", "Cypress Landing Park")),
    _profile("US-VA", 0.8, (2, 2, 3, 6, 3, 2), 1.05, 1.02, 0.10, ("Tidewater Pine Park", "Blue Ridge Siding Yards")),
    _profile("US-MO", 0.8, (4, 3, 4, 2, 3, 3), 0.95, 0.93, 0.40, ("River Bluff Commerce Park", "Ozark Gate Works")),
    _profile("US-IA", 0.6, (6, 3, 2, 1, 2, 2), 0.90, 0.92, 0.30, ("Tallgrass Mill Park", "Cedar Fork Works")),
    _profile("US-CO", 0.7, (3, 2, 2, 5, 3, 4), 1.05, 1.05, 0.20, ("Front Range Commerce Park", "High Plains Siding Yards")),
    _profile("US-AZ", 0.7, (2, 3, 3, 4, 4, 5), 1.00, 0.97, 0.10, ("Saguaro Flats Park", "Copper Wash Commerce Park")),
    _profile("US-WA", 0.8, (4, 3, 4, 4, 3, 3), 1.10, 1.14, 0.50, ("Cascade Reach Park", "Sound Gate Logistics Park")),
    _profile("US-KY", 0.6, (3, 4, 5, 1, 3, 2), 0.90, 0.90, 0.30, ("Bluegrass Junction Park", "Limestone Row Works")),
    _profile("US-SC", 0.6, (2, 5, 3, 1, 2, 4), 0.95, 0.90, 0.05, ("Lowcountry Gate Park", "Sweetgrass Commerce Park")),
)
