"""Pay after service. The one rule: help first, money after.

* No fee exists until help was given: a transport fee is added when the patient arrives
  at hospital, a visit fee when staff add it after the visit is booked.
* Asking for help, 1122 advice and triage are always free.
* Staff can mark a fee paid (cash, JazzCash, Easypaisa, card, Sehat Card) or waive it.
"""
import math

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import transport
from .config import settings
from .models import Case, CaseLocation, Charge, Dispatch
from .services import audit, get_case, now

METHODS = ("cash", "jazzcash", "easypaisa", "card", "sehat_card")


def transport_fee(km: float) -> int:
    """Base + per km, rounded up to the next 10 rupees."""
    raw = settings.transport_base_pkr + settings.transport_per_km_pkr * km
    return int(math.ceil(raw / 10.0) * 10)


def add_transport_charge(db: Session, d: Dispatch, staff: str) -> Charge | None:
    """Called when a trip reaches hospital. Charged for the patient -> hospital leg only."""
    if db.scalar(select(Charge).where(Charge.dispatch_id == d.id)):
        return None
    loc = db.scalar(select(CaseLocation).where(CaseLocation.case_id == d.case_id))
    h = transport.HOSPITALS_BY_ID.get(d.hospital_id)
    if loc is None or h is None:
        return None
    km = transport.distance_km(loc.lat, loc.lng, h.lat, h.lng) * transport.ROAD_FACTOR
    c = Charge(case_id=d.case_id, dispatch_id=d.id, kind="transport",
               description=f"Transport to {h.short} ({km:.1f} km)", amount_pkr=transport_fee(km),
               added_by=staff, created_at=now())
    db.add(c)
    audit(db, "system", "charge_added", f"Rs {c.amount_pkr} for {c.description}", d.case_id)
    return c


def add_visit_charge(db: Session, case_id: int, staff: str, amount: int | None, note: str) -> Charge:
    case = get_case(db, case_id)
    if case.status != "approved":
        raise HTTPException(409, "Add a visit fee only after the visit is booked.")
    if db.scalar(select(Charge).where(Charge.case_id == case.id, Charge.kind == "visit")):
        raise HTTPException(409, "This visit already has a fee.")
    c = Charge(case_id=case.id, kind="visit", description="Doctor's visit",
               amount_pkr=amount if amount is not None else settings.visit_fee_pkr,
               added_by=staff, note=note, created_at=now())
    db.add(c)
    audit(db, staff, "charge_added", f"Rs {c.amount_pkr} for the visit. {note}".strip(), case.id)
    db.commit()
    db.refresh(c)
    return c


def settle(db: Session, charge_id: int, staff: str, status: str, method: str | None, note: str) -> Charge:
    c = db.get(Charge, charge_id)
    if c is None:
        raise HTTPException(404, "Charge not found.")
    if c.status != "due":
        raise HTTPException(409, f"This fee is already {c.status}.")
    if status == "paid" and method not in METHODS:
        raise HTTPException(422, f"Choose how it was paid: {', '.join(METHODS)}.")
    c.status, c.method, c.settled_by, c.settled_at, c.note = (
        status, method if status == "paid" else None, staff, now(), note or c.note)
    label = f"Rs {c.amount_pkr} paid by {method.replace('_', ' ')}" if status == "paid" else f"Rs {c.amount_pkr} waived"
    audit(db, staff, f"charge_{status}", f"{label}. {note}".strip(), c.case_id)
    db.commit()
    db.refresh(c)
    return c


def for_case(db: Session, case_id: int) -> list[Charge]:
    return list(db.scalars(select(Charge).where(Charge.case_id == case_id).order_by(Charge.id)))


def patient_view(db: Session, case: Case) -> list[dict]:
    return [{"id": c.id, "kind": c.kind, "description": c.description, "amount_pkr": c.amount_pkr,
             "status": c.status, "method": c.method} for c in for_case(db, case.id)]
