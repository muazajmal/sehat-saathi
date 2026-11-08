"""Responders, patient locations and dispatches. Every dispatch needs a named staff member."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import notify, transport
from .languages import dispatch_reply
from .models import Case, CaseLocation, Dispatch, Responder
from .services import audit, get_case, now

ACTIVE = ("dispatched", "reached_patient")
NEXT_STATUS = {
    "dispatched": {"reached_patient", "cancelled"},
    "reached_patient": {"at_hospital", "cancelled"},
}

DEMO_RESPONDERS = [
    # Demo team for presentations. Not real people; their phones are placeholders.
    ("Demo Responder 1 (Bilal)", "Car with first-aid kit", "Gulgasht Colony", 30.2335, 71.4797),
    ("Demo Responder 2 (Ayesha)", "Car with first-aid kit", "Cantt", 30.1955, 71.4436),
    ("Demo Responder 3 (Usman)", "Motorbike first-aider", "Shah Rukn-e-Alam Colony", 30.1745, 71.4950),
    ("Demo Responder 4 (Hamza)", "Car with first-aid kit", "Bosan Road", 30.2420, 71.4510),
]


def seed_responders(db: Session):
    if db.scalar(select(Responder.id).limit(1)):
        return
    for name, vehicle, area, lat, lng in DEMO_RESPONDERS:
        db.add(Responder(name=name, phone="+920000000000", vehicle=vehicle, area=area, lat=lat, lng=lng,
                         status="available", is_demo=True))
    db.commit()


def set_location(db: Session, case_id: int, lat: float, lng: float, label: str, source: str) -> CaseLocation:
    case = get_case(db, case_id)
    loc = db.scalar(select(CaseLocation).where(CaseLocation.case_id == case.id))
    if loc is None:
        loc = CaseLocation(case_id=case.id, lat=lat, lng=lng)
        db.add(loc)
    loc.lat, loc.lng, loc.label, loc.source, loc.at = lat, lng, label[:200], source, now()
    audit(db, "patient" if source in ("web", "whatsapp") else source, "location_shared",
          label or f"{lat:.4f}, {lng:.4f}", case.id)
    db.commit()
    return loc


def active_dispatch(db: Session, case_id: int) -> Dispatch | None:
    return db.scalar(
        select(Dispatch).where(Dispatch.case_id == case_id).order_by(Dispatch.id.desc()).limit(1)
    )


def dispatch_out(d: Dispatch | None) -> dict | None:
    if d is None:
        return None
    h = transport.HOSPITALS_BY_ID.get(d.hospital_id)
    return {
        "id": d.id, "case_id": d.case_id, "responder": d.responder, "hospital_id": d.hospital_id,
        "hospital_name": h.name if h else d.hospital_id, "tier": d.tier, "status": d.status,
        "eta_minutes": d.eta_minutes, "approved_by": d.approved_by, "note": d.note,
        "created_at": d.created_at, "updated_at": d.updated_at,
    }


def options(db: Session, case_id: int) -> dict:
    case = get_case(db, case_id)
    tier = "emergency" if case.urgency == "urgent" else "transport"
    need, reason = transport.needed_specialty(case.red_flags or [], case.specialty, case.message)
    loc = db.scalar(select(CaseLocation).where(CaseLocation.case_id == case.id))
    hospitals, responders = [], []
    if loc:
        hospitals = transport.rank_hospitals(loc.lat, loc.lng, need)
        free = db.scalars(select(Responder).where(Responder.status == "available"))
        for r in free:
            km = transport.distance_km(loc.lat, loc.lng, r.lat, r.lng)
            responders.append({**{c: getattr(r, c) for c in
                                  ("id", "name", "phone", "vehicle", "area", "lat", "lng", "status", "is_demo")},
                               "distance_km": round(km, 1), "eta_minutes": transport.eta_minutes(km)})
        responders.sort(key=lambda r: r["distance_km"])
    return {
        "case_id": case.id, "tier": tier, "call_1122": tier == "emergency", "need": need, "reason": reason,
        "location": loc, "hospitals": hospitals, "responders": responders,
        "dispatch": dispatch_out(active_dispatch(db, case.id)),
    }


def send(db: Session, case_id: int, staff: str, responder_id: int, hospital_id: str, note: str) -> dict:
    case = get_case(db, case_id)
    current = active_dispatch(db, case.id)
    if current and current.status in ACTIVE:
        raise HTTPException(409, f"{current.responder.name} is already on the way for this patient.")
    loc = db.scalar(select(CaseLocation).where(CaseLocation.case_id == case.id))
    if loc is None:
        raise HTTPException(409, "Ask the patient to share their location first.")
    hospital = transport.HOSPITALS_BY_ID.get(hospital_id)
    if hospital is None:
        raise HTTPException(404, "Unknown hospital.")
    # Claim the responder only if still free, so two staff can't send the same person.
    responder = db.get(Responder, responder_id)
    if responder is None or responder.status != "available":
        raise HTTPException(409, "That responder is no longer free. Pick another.")
    responder.status = "busy"
    km = transport.distance_km(loc.lat, loc.lng, responder.lat, responder.lng)
    eta = transport.eta_minutes(km)
    tier = "emergency" if case.urgency == "urgent" else "transport"
    t = now()
    d = Dispatch(case_id=case.id, responder_id=responder.id, hospital_id=hospital.id, tier=tier,
                 status="dispatched", eta_minutes=eta, approved_by=staff, note=note, created_at=t, updated_at=t)
    db.add(d)
    db.flush()
    audit(db, staff, "dispatched",
          f"{responder.name} to patient (~{eta} min), then {hospital.short}. {note}".strip(), case.id)
    db.commit()
    db.refresh(d)

    notify.send_whatsapp(case.patient.phone, dispatch_reply(
        tier, case.language, responder=responder.name.split("(")[-1].rstrip(")") if "(" in responder.name
        else responder.name, hospital=hospital.short, eta=str(eta)))
    notify.dispatch_alert({
        "dispatch_id": d.id, "case_id": case.id, "tier": tier, "call_1122_first": tier == "emergency",
        "patient": case.patient.name or "Unknown", "patient_phone": case.patient.phone,
        "summary": case.summary, "red_flags": case.red_flags,
        "pickup": {"lat": loc.lat, "lng": loc.lng, "label": loc.label,
                   "map": f"https://www.google.com/maps/search/?api=1&query={loc.lat},{loc.lng}"},
        "hospital": {"id": hospital.id, "name": hospital.name, "phone": hospital.phone,
                     "map": f"https://www.google.com/maps/search/?api=1&query={hospital.lat},{hospital.lng}"},
        "responder": responder.name, "responder_phone": responder.phone, "eta_minutes": eta,
        "approved_by": staff,
    })
    return dispatch_out(d)


def update_status(db: Session, dispatch_id: int, staff: str, status: str, note: str) -> dict:
    d = db.get(Dispatch, dispatch_id)
    if d is None:
        raise HTTPException(404, "Dispatch not found.")
    if status not in NEXT_STATUS.get(d.status, set()):
        raise HTTPException(409, f"Can't go from {d.status.replace('_', ' ')} to {status.replace('_', ' ')}.")
    d.status, d.updated_at = status, now()
    if status in ("at_hospital", "cancelled"):
        d.responder.status = "available"
    label = {"reached_patient": "Responder reached the patient", "at_hospital": "Patient arrived at hospital",
             "cancelled": "Dispatch cancelled"}[status]
    audit(db, staff, f"dispatch_{status}", f"{label}. {note}".strip(), d.case_id)
    db.commit()
    db.refresh(d)
    return dispatch_out(d)
