"""Local ambulances that register themselves, like drivers on a ride app.

Sign up (public) -> staff check papers and approve -> driver goes online from
their private page -> the desk can send them to a patient -> the trip opens
on the same responder page the demo team uses.
"""
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import transport
from .config import settings
from .dispatch import ACTIVE, tracking_link
from .models import AmbulanceMember, Dispatch, Responder
from .services import audit, now

VEHICLES = {
    "basic": "Ambulance (basic)",
    "oxygen": "Ambulance with oxygen",
    "icu": "ICU ambulance (ventilator)",
    "car": "Patient transport car",
}
DECISIONS = {"approve": "approved", "reject": "rejected", "suspend": "suspended"}


def member_link(m: AmbulanceMember) -> str:
    return f"{settings.frontend_url}/ambulance/me?m={m.id}&t={m.token}"


def register(db: Session, driver_name: str, phone: str, organisation: str, vehicle_type: str,
             vehicle_reg: str, area: str, lat: float | None, lng: float | None) -> AmbulanceMember:
    if vehicle_type not in VEHICLES:
        raise HTTPException(422, "Pick a vehicle type.")
    if db.scalar(select(AmbulanceMember.id).where(AmbulanceMember.phone == phone)):
        raise HTTPException(409, "This phone number is already registered. Use your private link, or ask the clinic.")
    if lat is None or lng is None:
        lat, lng = transport.SAMPLE_LOCATION["lat"], transport.SAMPLE_LOCATION["lng"]
    m = AmbulanceMember(driver_name=driver_name, phone=phone, organisation=organisation,
                        vehicle_type=vehicle_type, vehicle_reg=vehicle_reg.upper(), area=area,
                        lat=lat, lng=lng, status="pending", token=secrets.token_urlsafe(16), created_at=now())
    db.add(m)
    db.flush()
    audit(db, driver_name, "ambulance_registered", f"{VEHICLES[vehicle_type]} {m.vehicle_reg}, {area}")
    db.commit()
    db.refresh(m)
    return m


def check(db: Session, member_id: int, token: str) -> AmbulanceMember:
    m = db.get(AmbulanceMember, member_id)
    if m is None or not secrets.compare_digest(m.token, token):
        raise HTTPException(403, "This link is not valid.")
    return m


def _current_trip(db: Session, m: AmbulanceMember) -> Dispatch | None:
    if m.responder_id is None:
        return None
    return db.scalar(select(Dispatch).where(Dispatch.responder_id == m.responder_id, Dispatch.status.in_(ACTIVE))
                     .order_by(Dispatch.id.desc()).limit(1))


def out(db: Session, m: AmbulanceMember, private: bool = False) -> dict:
    r = m.responder
    trip = _current_trip(db, m)
    o = {
        "id": m.id, "driver_name": m.driver_name, "phone": m.phone, "organisation": m.organisation,
        "vehicle_type": m.vehicle_type, "vehicle": VEHICLES.get(m.vehicle_type, m.vehicle_type),
        "vehicle_reg": m.vehicle_reg, "area": m.area, "lat": m.lat, "lng": m.lng, "status": m.status,
        "online": bool(r and r.status in ("available", "busy")), "busy": bool(r and r.status == "busy"),
        "review_note": m.review_note, "reviewed_by": m.reviewed_by, "created_at": m.created_at,
        "last_seen_at": m.last_seen_at, "trip_link": "", "trip_tier": "",
        "in_area": transport.in_service_area(m.lat, m.lng),
    }
    if trip is not None:
        o["trip_tier"] = trip.tier
        # Only the driver's own page gets the trip link; it lets them post GPS for that trip.
        if private:
            o["trip_link"] = tracking_link(db, trip).replace(settings.frontend_url, "")
    if private:
        o["link"] = member_link(m)
    return o


def set_online(db: Session, m: AmbulanceMember, online: bool, lat: float | None, lng: float | None) -> dict:
    if m.status != "approved" or m.responder is None:
        msg = {"pending": "The clinic is still checking your papers. You can go online once approved.",
               "rejected": "Your registration was not approved. Contact the clinic.",
               "suspended": "Your account is paused by the clinic. Contact them to restart."}
        raise HTTPException(409, msg.get(m.status, "Not approved yet."))
    r = m.responder
    # During a trip the responder page sends GPS, and the trip's start point must stay put.
    if r.status != "busy":  # never drop a driver out of a live trip
        if lat is not None and lng is not None:
            # Where they are now decides who is nearest, so keep it fresh while online.
            r.lat, r.lng = lat, lng
            m.lat, m.lng = lat, lng
        r.status = "available" if online else "off"
    m.last_seen_at = now()
    db.commit()
    db.refresh(m)
    return out(db, m, private=True)


def list_all(db: Session) -> list[dict]:
    order = {"pending": 0, "approved": 1, "suspended": 2, "rejected": 3}
    ms = list(db.scalars(select(AmbulanceMember).order_by(AmbulanceMember.id.desc())))
    ms.sort(key=lambda m: order.get(m.status, 9))
    return [out(db, m) for m in ms]


def review(db: Session, member_id: int, staff: str, decision: str, note: str) -> dict:
    m = db.get(AmbulanceMember, member_id)
    if m is None:
        raise HTTPException(404, "Ambulance not found.")
    if decision not in DECISIONS:
        raise HTTPException(422, "Decision must be approve, reject or suspend.")
    status = DECISIONS[decision]
    if status == "approved" and m.responder is None:
        label = f"{m.driver_name} · {m.organisation}" if m.organisation else m.driver_name
        r = Responder(name=label[:120], phone=m.phone, vehicle=f"{VEHICLES[m.vehicle_type]} · {m.vehicle_reg}"[:60],
                      area=m.area, lat=m.lat, lng=m.lng, status="off", is_demo=False)
        db.add(r)
        db.flush()
        m.responder_id = r.id
    elif status != "approved" and m.responder is not None:
        if _current_trip(db, m) is not None:
            raise HTTPException(409, "This ambulance is on a trip. Finish or cancel the trip first.")
        m.responder.status = "off"  # can no longer be picked for trips
    m.status, m.reviewed_by, m.review_note, m.reviewed_at = status, staff, note, now()
    audit(db, staff, f"ambulance_{status}", f"{m.driver_name} ({m.vehicle_reg}). {note}".strip())
    db.commit()
    db.refresh(m)
    return out(db, m)
