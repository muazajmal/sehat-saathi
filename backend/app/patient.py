"""What a patient can see about their own case, through their private status link."""
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import transport, billing, dispatch
from .config import settings
from .models import Case, CaseAccess, CaseLocation


def issue_token(db: Session, case_id: int) -> str:
    access = db.scalar(select(CaseAccess).where(CaseAccess.case_id == case_id))
    if access is None:
        access = CaseAccess(case_id=case_id, token=secrets.token_urlsafe(16))
        db.add(access)
        db.commit()
    return access.token


def status_link(case_id: int, token: str) -> str:
    return f"{settings.frontend_url}/patient/status?c={case_id}&t={token}"


def check(db: Session, case_id: int, token: str) -> Case:
    access = db.scalar(select(CaseAccess).where(CaseAccess.case_id == case_id))
    case = db.get(Case, case_id)
    if case is None or access is None or not secrets.compare_digest(access.token, token):
        raise HTTPException(403, "This link is not valid.")
    return case


def status(db: Session, case_id: int, token: str) -> dict:
    case = check(db, case_id, token)
    slot = case.proposed_slot
    s = {"starts_at": slot.starts_at, "doctor": slot.doctor} if slot else None
    loc = db.scalar(select(CaseLocation).where(CaseLocation.case_id == case.id))
    trip = None
    d = dispatch.active_dispatch(db, case.id)
    if d and d.status != "cancelled":
        t = dispatch.track(db, d.id)
        heading_to_patient = t["phase"] in ("to_patient", "waiting_at_patient")
        trip = {
            "status": d.status,
            # First name only: the patient doesn't need the internal label.
            "responder": d.responder.name.split("(")[-1].rstrip(")") if "(" in d.responder.name else d.responder.name,
            "vehicle": d.responder.vehicle,
            "hospital": t["hospital"],
            "phase": t["phase"],
            "km_away": t["km_to_patient"] if heading_to_patient else t["km_to_hospital"],
            "eta_min": t["eta_patient_min"] if heading_to_patient else t["eta_hospital_min"],
            "mode": t["mode"],
        }
    return {
        "case_id": case.id,
        "clinic": settings.clinic_name,
        "name": case.patient.name,
        "status": case.status,
        "urgency": case.urgency,
        "language": case.language,
        "reply": case.reply_ur,
        "call_1122": case.urgency == "urgent",
        "held_slot": s if case.status == "pending_review" else None,
        "booked_slot": s if case.status == "approved" else None,
        "called_back": case.called_back,
        "location_shared": loc is not None,
        "out_of_area": bool(loc) and not transport.in_service_area(loc.lat, loc.lng),
        "nearest_hospital_km": round(transport.nearest_hospital_km(loc.lat, loc.lng), 1) if loc else None,
        "trip": trip,
        "charges": billing.patient_view(db, case),
        "created_at": case.created_at,
    }


def share_location(db: Session, case_id: int, token: str, lat: float, lng: float, label: str):
    check(db, case_id, token)
    dispatch.set_location(db, case_id, lat, lng, label or "Shared by the patient", "web")
