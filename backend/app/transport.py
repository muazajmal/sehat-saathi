"""Getting a patient to hospital.

Two tiers, and 1122 always comes first for real emergencies:

* emergency (case is urgent): the patient is told to call Rescue 1122 now. A Sehat
  Saathi responder can also be sent to support the family and meet them at hospital.
* transport (serious but stable, or no way to travel): a responder picks the
  patient up and takes them to the most suitable government hospital.

A named staff member approves every dispatch. The AI only suggests the
hospital and the nearest free responder.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

# Government hospitals in Multan with 24-hour emergency, from the Punjab Specialized
# Healthcare & Medical Education Department list of tertiary hospitals, located with
# Google Maps (November 2026). Phone numbers only where the listing gave one.
@dataclass(frozen=True)
class Hospital:
    id: str
    name: str
    short: str
    area: str
    lat: float
    lng: float
    specialties: tuple[str, ...]
    phone: str = ""


HOSPITALS: list[Hospital] = [
    Hospital("nishtar", "Nishtar Hospital (Accident & Emergency)", "Nishtar Hospital", "Nishtar Road, Multan",
             30.2029124, 71.4465874, ("general", "trauma", "stroke", "gynaecology")),
    Hospital("cardiology", "Ch. Pervaiz Elahi Institute of Cardiology", "Institute of Cardiology", "Abdali Road, Multan",
             30.192008, 71.450459, ("cardiac",), "+92 61 9201045"),
    Hospital("children", "The Children's Hospital & Institute of Child Health", "Children's Hospital",
             "Sher Shah Road, Multan", 30.1962362, 71.4615872, ("paediatrics",), "+92 61 9201431"),
    Hospital("burns", "Pak-Italian Burn Centre (Nishtar)", "Burn Centre", "Nishtar Road, Multan",
             30.2022498, 71.4438145, ("burns",)),
    Hospital("dhq", "Shahbaz Sharif DHQ Hospital", "DHQ Hospital", "Inner City, Multan",
             30.196036, 71.4653926, ("general", "gynaecology")),
    Hospital("nishtar2", "Tertiary Care Hospital Nishtar-II", "Nishtar-II", "Southern Multan",
             30.0494633, 71.3858121, ("general", "trauma")),
    Hospital("dhq-saddar", "DHQ Hospital Multan Saddar", "DHQ Saddar", "Multan Saddar",
             30.1398288, 71.4744561, ("general",)),
]
HOSPITALS_BY_ID = {h.id: h for h in HOSPITALS}

# Rough city driving: straight-line distance x 1.4 for roads, 25 km/h average, plus 3 min to set off.
ROAD_FACTOR = 1.4
CITY_KMH = 25


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def eta_minutes(km: float) -> int:
    return round(km * ROAD_FACTOR / CITY_KMH * 60 + 3)


def needed_specialty(red_flags: list[str], specialty: str, message: str) -> tuple[str, str]:
    """Which kind of hospital this patient needs, and why (shown to staff)."""
    flags = " ".join(red_flags).lower()
    text = message.lower()
    if "chest" in flags or "cardiac" in flags or "heart" in flags:
        return "cardiac", "Chest pain: heart hospital"
    if any(w in text for w in ("burn", "jal gaya", "jal gai", "جل گیا", "جل گئی", "حرق", "سوختگی")):
        return "burns", "Burn injury: burn centre"
    if "stroke" in flags:
        return "stroke", "Stroke signs: main emergency with neurology"
    if specialty == "paediatrics" or "infant" in flags or "child" in flags:
        return "paediatrics", "Child patient: children's hospital"
    if specialty == "gynaecology" or "pregnan" in flags:
        return "gynaecology", "Pregnancy: hospital with gynae emergency"
    if "bleeding" in flags or "injury" in flags or "fracture" in text:
        return "trauma", "Injury or bleeding: trauma emergency"
    return "general", "Nearest general emergency"


def rank_hospitals(lat: float, lng: float, need: str, limit: int = 3) -> list[dict]:
    rows = []
    for h in HOSPITALS:
        km = distance_km(lat, lng, h.lat, h.lng)
        match = need in h.specialties or (need in ("stroke", "trauma") and "general" in h.specialties)
        exact = need in h.specialties
        # Specialist match first, then distance. Fall back to the nearest general emergency.
        rows.append((0 if exact else 1 if match else 2, km, h))
    rows.sort(key=lambda r: (r[0], r[1]))
    return [
        {**asdict(h), "distance_km": round(km, 1), "eta_minutes": eta_minutes(km), "match": rank == 0}
        for rank, km, h in rows[:limit]
    ]


# Sample points for the website demo when the visitor can't share a real location.
MULTAN_BOX = (29.95, 30.40, 71.25, 71.70)  # lat min, lat max, lng min, lng max
SAMPLE_LOCATION = {"lat": 30.2297, "lng": 71.4789, "label": "Gulgasht Colony, Multan (sample location)"}


def in_multan(lat: float, lng: float) -> bool:
    a, b, c, d = MULTAN_BOX
    return a <= lat <= b and c <= lng <= d


# Service area. Partner hospitals and responders are in Multan only, so a patient far from
# every partner hospital must be told to call 1122, never sent on a 400 km "trip".
MAX_HOSPITAL_KM = 50  # patient to the nearest partner hospital
MAX_RESPONDER_KM = 40  # responder to the patient


def nearest_hospital_km(lat: float, lng: float) -> float:
    return min(distance_km(lat, lng, h.lat, h.lng) for h in HOSPITALS)


def in_service_area(lat: float, lng: float) -> bool:
    return nearest_hospital_km(lat, lng) <= MAX_HOSPITAL_KM
