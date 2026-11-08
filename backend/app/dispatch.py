"""Responders, patient locations and dispatches. Every dispatch needs a named staff member."""
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import notify, transport
from .languages import dispatch_reply
from .config import settings
from .models import Case, CaseLocation, Dispatch, DispatchAccess, Responder, TrackPoint
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
    actor = "Patient" if source in ("web", "whatsapp") else "Staff"
    audit(db, actor, "location_shared", label or f"{lat:.4f}, {lng:.4f}", case.id)
    db.commit()
    return loc


def active_dispatch(db: Session, case_id: int) -> Dispatch | None:
    return db.scalar(
        select(Dispatch).where(Dispatch.case_id == case_id).order_by(Dispatch.id.desc()).limit(1)
    )


def tracking_link(db: Session, d: Dispatch) -> str:
    access = db.scalar(select(DispatchAccess).where(DispatchAccess.dispatch_id == d.id))
    return f"{settings.frontend_url}/responder?d={d.id}&t={access.token}" if access else ""


def dispatch_out(d: Dispatch | None, db: Session | None = None) -> dict | None:
    if d is None:
        return None
    h = transport.HOSPITALS_BY_ID.get(d.hospital_id)
    return {
        "tracking_link": tracking_link(db, d) if db is not None else "",
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
        "dispatch": dispatch_out(active_dispatch(db, case.id), db),
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
    db.add(DispatchAccess(dispatch_id=d.id, token=secrets.token_urlsafe(16)))
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
        "approved_by": staff, "tracking_link": tracking_link(db, d),
    })
    return dispatch_out(d, db)


def update_status(db: Session, dispatch_id: int, staff: str, status: str, note: str) -> dict:
    d = db.get(Dispatch, dispatch_id)
    if d is None:
        raise HTTPException(404, "Dispatch not found.")
    if status not in NEXT_STATUS.get(d.status, set()):
        raise HTTPException(409, f"Can't go from {d.status.replace('_', ' ')} to {status.replace('_', ' ')}.")
    d.status, d.updated_at = status, now()
    if status in ("at_hospital", "cancelled"):
        d.responder.status = "available"
    if status == "at_hospital":
        # Help was given: only now can a transport fee exist.
        from .billing import add_transport_charge

        add_transport_charge(db, d, staff)
    label = {"reached_patient": "Responder reached the patient", "at_hospital": "Patient arrived at hospital",
             "cancelled": "Dispatch cancelled"}[status]
    audit(db, staff, f"dispatch_{status}", f"{label}. {note}".strip(), d.case_id)
    db.commit()
    db.refresh(d)
    return dispatch_out(d, db)


# ---------- Live tracking ----------
# Real responders: their phone posts GPS fixes through the private tracking link.
# Demo responders have no phone, so their trip is simulated (and labelled as such),
# sped up so a judge sees it move within a minute.
DEMO_LEG_SECONDS = 40
LIVE_FIX_MAX_AGE = 180  # seconds; older than this and we stop calling it live


def _check_token(db: Session, dispatch_id: int, token: str) -> Dispatch:
    d = db.get(Dispatch, dispatch_id)
    access = db.scalar(select(DispatchAccess).where(DispatchAccess.dispatch_id == dispatch_id))
    if d is None or access is None or not secrets.compare_digest(access.token, token):
        raise HTTPException(403, "This tracking link is not valid.")
    return d


def post_position(db: Session, dispatch_id: int, token: str, lat: float, lng: float, accuracy: float | None) -> dict:
    d = _check_token(db, dispatch_id, token)
    if d.status not in ACTIVE:
        raise HTTPException(409, "This trip has ended. Thank you.")
    db.add(TrackPoint(dispatch_id=d.id, lat=lat, lng=lng, accuracy_m=accuracy, at=now()))
    db.commit()
    return track(db, d.id)


def responder_trip(db: Session, dispatch_id: int, token: str) -> dict:
    d = _check_token(db, dispatch_id, token)
    case = get_case(db, d.case_id)
    loc = db.scalar(select(CaseLocation).where(CaseLocation.case_id == case.id))
    h = transport.HOSPITALS_BY_ID[d.hospital_id]
    return {
        "dispatch_id": d.id, "status": d.status, "tier": d.tier, "responder": d.responder.name,
        "patient": case.patient.name or "Patient", "patient_phone": case.patient.phone, "summary": case.summary,
        "pickup": {"lat": loc.lat, "lng": loc.lng}, "pickup_label": loc.label,
        "hospital": h.name, "hospital_position": {"lat": h.lat, "lng": h.lng}, "hospital_phone": h.phone,
    }


def _lerp(a: dict, b: dict, f: float) -> dict:
    return {"lat": a["lat"] + (b["lat"] - a["lat"]) * f, "lng": a["lng"] + (b["lng"] - a["lng"]) * f}


def _km(a: dict, b: dict) -> float:
    return transport.distance_km(a["lat"], a["lng"], b["lat"], b["lng"])


def _drive_min(km: float) -> int:
    return round(km * transport.ROAD_FACTOR / transport.CITY_KMH * 60)


def track(db: Session, dispatch_id: int) -> dict:
    d = db.get(Dispatch, dispatch_id)
    if d is None:
        raise HTTPException(404, "Dispatch not found.")
    loc = db.scalar(select(CaseLocation).where(CaseLocation.case_id == d.case_id))
    h = transport.HOSPITALS_BY_ID[d.hospital_id]
    start = {"lat": d.responder.lat, "lng": d.responder.lng}
    patient = {"lat": loc.lat, "lng": loc.lng}
    hospital = {"lat": h.lat, "lng": h.lng}
    t = now()

    fixes = list(db.scalars(select(TrackPoint).where(TrackPoint.dispatch_id == d.id).order_by(TrackPoint.at)))
    last = fixes[-1] if fixes else None
    fix_age = int((t - last.at).total_seconds()) if last else None

    if d.status == "cancelled":
        phase, mode = "cancelled", "finished"
        pos = {"lat": last.lat, "lng": last.lng} if last else start
    elif d.status == "at_hospital":
        phase, mode, pos = "at_hospital", "finished", hospital
    elif last is not None and fix_age is not None and fix_age <= LIVE_FIX_MAX_AGE:
        mode, pos = "live", {"lat": last.lat, "lng": last.lng}
        phase = "to_patient" if d.status == "dispatched" else "to_hospital"
        if phase == "to_patient" and _km(pos, patient) < 0.08:
            phase = "waiting_at_patient"
    elif d.responder.is_demo:
        mode = "simulated"
        elapsed = (t - d.updated_at).total_seconds()
        f = max(0.0, min(1.0, elapsed / DEMO_LEG_SECONDS))
        if d.status == "dispatched":
            pos = _lerp(start, patient, f)
            phase = "waiting_at_patient" if f >= 1 else "to_patient"
        else:
            pos = _lerp(patient, hospital, f)
            phase = "to_hospital"
    else:
        mode = "no_signal"
        pos = {"lat": last.lat, "lng": last.lng} if last else (start if d.status == "dispatched" else patient)
        phase = "to_patient" if d.status == "dispatched" else "to_hospital"

    leg1 = _km(start, patient)
    leg2 = _km(patient, hospital)
    if phase in ("to_patient", "waiting_at_patient"):
        km_patient = 0.0 if phase == "waiting_at_patient" else _km(pos, patient)
        km_hospital = km_patient + leg2
        done = max(0.0, leg1 - km_patient)
    elif phase == "to_hospital":
        km_patient = 0.0
        km_hospital = _km(pos, hospital)
        done = leg1 + max(0.0, leg2 - km_hospital)
    else:
        km_patient = 0.0
        km_hospital = 0.0 if phase == "at_hospital" else _km(pos, hospital)
        done = leg1 + leg2 if phase == "at_hospital" else 0.0
    total = max(leg1 + leg2, 0.001)

    if fixes and mode in ("live", "no_signal", "finished"):
        trail = [{"lat": p.lat, "lng": p.lng} for p in fixes[-200:]]
    elif phase in ("to_hospital", "at_hospital"):
        trail = [start, patient, pos]
    else:
        trail = [start, pos]

    return {
        "dispatch_id": d.id, "status": d.status, "tier": d.tier, "mode": mode, "phase": phase,
        "responder": d.responder.name, "vehicle": d.responder.vehicle, "hospital": h.name,
        "position": pos, "patient": patient, "hospital_position": hospital, "start": start,
        "km_to_patient": round(km_patient, 2), "km_to_hospital": round(km_hospital, 2),
        "eta_patient_min": _drive_min(km_patient), "eta_hospital_min": _drive_min(km_hospital),
        "progress": round(min(1.0, done / total), 3), "trail": trail,
        "last_fix_seconds": fix_age, "updated_at": t,
    }
