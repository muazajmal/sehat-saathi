"""Community features: area health alerts, blood donor network, medicine reminders, elder check-ins,
the in-app inbox and phone notifications."""
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import ai, areas, auth, inbox as notify, services, tenancy, transport
from .config import settings
from .db import get_db
from .models import (Account, AreaAlert, BloodAsk, BloodRequest, Case, CaseLocation, Checkin, DoseLog, Donor, Elder,
                     Medicine, Notification, Patient, SampleSignal)
from .services import now

router = APIRouter(prefix="/api")


def staff(authorization: str | None = Header(default=None), x_staff_key: str | None = Header(default=None),
          db: Session = Depends(get_db)):
    return auth.staff_account(db, authorization, x_staff_key)


def H(who=Depends(staff)) -> int:
    return tenancy.hid(who)


def own_alert(db: Session, alert_id: int, h: int) -> AreaAlert:
    a = db.get(AreaAlert, alert_id)
    if a is None or (a.hospital_id or 1) != h:
        raise HTTPException(404, "No such alert.")
    return a


def staff_name(who) -> str:
    return who.name if who is not None else "Clinic staff"


def today() -> str:
    return now().strftime("%Y-%m-%d")


def at_time(day: datetime, hhmm: str) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return day.replace(hour=h, minute=m, second=0, microsecond=0)


HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


# ======================= Phone notifications + inbox =======================

class PushIn(BaseModel):
    subscription: dict
    elder: int | None = None
    token: str | None = None
    donor_token: str | None = None
    lang: Literal["ur", "en"] = "ur"


@router.get("/push/key")
def push_key():
    return {"key": notify.public_key()}


@router.post("/push/subscribe")
def push_subscribe(body: PushIn, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """A phone agrees to notifications: for a logged-in person, an elder's check-in page, or a donor link."""
    if not isinstance(body.subscription.get("endpoint"), str):
        raise HTTPException(422, "Bad subscription.")
    if body.elder and body.token:
        e = db.get(Elder, body.elder)
        if e is None or not secrets.compare_digest(e.token, body.token):
            raise HTTPException(403, "This link is not valid.")
        owner = f"elder:{e.id}"
    elif body.donor_token:
        d = db.scalar(select(Donor).where(Donor.token == body.donor_token))
        if d is None:
            raise HTTPException(403, "This link is not valid.")
        owner = f"phone:{d.phone}"
    else:
        acc = auth.account_from_header(db, authorization)
        if acc is None:
            raise HTTPException(401, "Please log in.")
        owner = f"phone:{acc.phone}"
    notify.subscribe(db, owner, body.subscription, body.lang)
    return {"ok": True}


@router.get("/me/inbox")
def inbox(a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    tick(db)  # reminders that just fell due show up at once, even between scheduled runs
    rows = db.scalars(select(Notification).where(Notification.phone == a.phone).order_by(Notification.created_at.desc()).limit(50))
    return [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "title_ur": n.title_ur or "",
             "body_ur": n.body_ur or "", "link": n.link, "read": n.read, "created_at": n.created_at} for n in rows]


@router.post("/me/inbox/read")
def inbox_read(a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notification).where(Notification.phone == a.phone, Notification.read.is_(False))):
        n.read = True
    db.commit()
    return {"ok": True}


# ======================= Area health alerts =======================

class AlertEdit(BaseModel):
    title_en: str = Field(max_length=200)
    body_en: str = Field(max_length=1200)
    title_ur: str = Field(max_length=200)
    body_ur: str = Field(max_length=1200)


def alert_out(a: AreaAlert) -> dict:
    return {"id": a.id, "area": a.area, "group": a.group, "group_en": areas.GROUPS[a.group]["en"],
            "group_ur": areas.GROUPS[a.group]["ur"], "level": a.level, "cases_week": a.cases_week,
            "baseline_week": a.baseline_week, "title_en": a.title_en, "body_en": a.body_en, "title_ur": a.title_ur,
            "body_ur": a.body_ur, "drafted_by": a.drafted_by, "status": a.status, "approved_by": a.approved_by,
            "hospital_id": a.hospital_id or 1,
            "created_at": a.created_at, "published_at": a.published_at, "expires_at": a.expires_at}


@router.get("/area-health")
def area_health(h: int = Depends(H), db: Session = Depends(get_db)):
    """What the desk sees: rises found this week, cases per area, and alerts drafted or sent."""
    found = areas.detect(db, h)
    alerts = list(db.scalars(select(AreaAlert).where(AreaAlert.status != "closed", AreaAlert.hospital_id == h)
                             .order_by(AreaAlert.created_at.desc())))
    for f in found:
        f["alert"] = next((alert_out(a) for a in alerts if a.area == f["area"] and a.group == f["group"]), None)
    return {"rises": found, "map": areas.map_points(db, h), "alerts": [alert_out(a) for a in alerts],
            "areas": [{"name": n, "lat": la, "lng": ln} for n, la, ln in areas.AREAS]}


@router.post("/area-health/draft")
def draft_alert(area: str, group: str, h: int = Depends(H), db: Session = Depends(get_db)):
    f = next((x for x in areas.detect(db, h) if x["area"] == area and x["group"] == group), None)
    if f is None:
        raise HTTPException(404, "No rise found for that area and illness.")
    existing = db.scalar(select(AreaAlert).where(AreaAlert.area == area, AreaAlert.group == group,
                                                 AreaAlert.status != "closed", AreaAlert.hospital_id == h))
    return alert_out(existing or areas.draft(db, f, h))


@router.put("/area-health/alerts/{alert_id}")
def edit_alert(alert_id: int, body: AlertEdit, h: int = Depends(H), db: Session = Depends(get_db)):
    a = own_alert(db, alert_id, h)
    for k, v in body.model_dump().items():
        setattr(a, k, v.strip())
    db.commit()
    return alert_out(a)


@router.post("/area-health/alerts/{alert_id}/publish")
def publish_alert(alert_id: int, who=Depends(staff), db: Session = Depends(get_db)):
    """A doctor approves the wording; then it goes on the public alerts page and to people in that area."""
    a = own_alert(db, alert_id, tenancy.hid(who))
    if a.status == "draft":
        a.status, a.approved_by, a.published_at = "published", staff_name(who), now()
        a.expires_at = now() + timedelta(days=14)
        db.commit()
        reached = 0
        phones = set()
        since = now() - timedelta(days=60)
        for phone, lat, lng in db.execute(select(Patient.phone, CaseLocation.lat, CaseLocation.lng)
                                          .join(Case, Case.patient_id == Patient.id)
                                          .join(CaseLocation, CaseLocation.case_id == Case.id)
                                          .where(Case.created_at >= since, Case.hospital_id == a.hospital_id)):
            if areas.nearest_area(lat, lng) == a.area:
                phones.add(phone)
        for d in db.scalars(select(Donor).where(Donor.area == a.area)):
            phones.add(d.phone)
        for p in phones:
            if notify.notify(db, p, "alert", a.title_en, a.body_en, f"/alerts#a{a.id}", dedupe=f"alert:{a.id}:{p}",
                             ur=(a.title_ur, a.body_ur)):
                reached += 1
        return {**alert_out(a), "reached": reached}
    return alert_out(a)


@router.post("/area-health/alerts/{alert_id}/close")
def close_alert(alert_id: int, h: int = Depends(H), db: Session = Depends(get_db)):
    a = own_alert(db, alert_id, h)
    a.status = "closed"
    db.commit()
    return alert_out(a)


@router.get("/alerts")
def public_alerts(db: Session = Depends(get_db)):
    """Anyone: the hospital's current notices for each neighbourhood."""
    rows = db.scalars(select(AreaAlert).where(AreaAlert.status == "published", AreaAlert.expires_at > now())
                      .order_by(AreaAlert.published_at.desc()))
    return [{**{k: v for k, v in alert_out(a).items() if k not in ("drafted_by",)}, "hospital": tenancy.name_of(db, a.hospital_id)}
            for a in rows]


# ======================= Blood donor network =======================

GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
CAN_RECEIVE_FROM = {
    "O-": ["O-"], "O+": ["O+", "O-"], "A-": ["A-", "O-"], "A+": ["A+", "A-", "O+", "O-"],
    "B-": ["B-", "O-"], "B+": ["B+", "B-", "O+", "O-"], "AB-": ["AB-", "A-", "B-", "O-"], "AB+": GROUPS,
}
DONATION_GAP_DAYS = 90


class DonorIn(BaseModel):
    phone: str = Field(min_length=6, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    blood_group: Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
    area: str = Field(default="", max_length=60)
    lat: float | None = None
    lng: float | None = None
    last_donated: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    eligible: bool  # 18-60, over 50 kg, feeling well (they confirm)


def donor_out(d: Donor) -> dict:
    ready = d.available and (d.last_donated is None or d.last_donated <= now() - timedelta(days=DONATION_GAP_DAYS))
    return {"id": d.id, "name": d.name, "phone": d.phone, "blood_group": d.blood_group, "area": d.area,
            "available": d.available, "ready": ready, "last_donated": d.last_donated, "token": d.token}


@router.post("/donors", status_code=201)
def donor_signup(body: DonorIn, request: Request, db: Session = Depends(get_db)):
    tenancy.limit(db, f"donor:{tenancy.client_ip(request)}", 10, 60)
    if not body.eligible:
        raise HTTPException(422, "Only people aged 18 to 60, over 50 kg and in good health can join.")
    phone = auth.normalize_phone(body.phone)
    area = body.area if body.area in areas.AREA_NAMES else ""
    if body.lat is not None and body.lng is not None:
        area = areas.nearest_area(body.lat, body.lng) or area
    d = db.scalar(select(Donor).where(Donor.phone == phone))
    last = datetime.strptime(body.last_donated, "%Y-%m-%d") if body.last_donated else None
    if d is None:
        d = Donor(phone=phone, token=secrets.token_urlsafe(24), created_at=now(), name=body.name.strip(),
                  blood_group=body.blood_group)
        db.add(d)
    d.name, d.blood_group, d.area, d.lat, d.lng, d.last_donated, d.available = (
        body.name.strip(), body.blood_group, area, body.lat, body.lng, last, True)
    db.commit()
    return donor_out(d)


@router.get("/me/donor")
def my_donor(a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    d = db.scalar(select(Donor).where(Donor.phone == a.phone))
    return donor_out(d) if d else None


@router.post("/me/donor/available")
def my_donor_available(available: bool, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    d = db.scalar(select(Donor).where(Donor.phone == a.phone))
    if d is None:
        raise HTTPException(404, "You are not signed up as a donor.")
    d.available = available
    db.commit()
    return donor_out(d)


class BloodIn(BaseModel):
    blood_group: Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
    units: int = Field(default=1, ge=1, le=10)
    hospital_id: str = "nishtar"
    case_id: int | None = None
    note: str = Field(default="", max_length=300)


def request_out(db: Session, r: BloodRequest) -> dict:
    asks = list(db.scalars(select(BloodAsk).where(BloodAsk.request_id == r.id).order_by(BloodAsk.km)))
    return {"id": r.id, "blood_group": r.blood_group, "units": r.units, "hospital": r.hospital, "note": r.note,
            "status": r.status, "case_id": r.case_id, "created_by": r.created_by, "created_at": r.created_at,
            "yes": sum(1 for a in asks if a.answer == "yes"),
            "asks": [{"id": a.id, "donor": a.donor.name, "phone": a.donor.phone if a.answer == "yes" else "",
                      "blood_group": a.donor.blood_group, "area": a.donor.area, "km": a.km, "answer": a.answer,
                      "answered_at": a.answered_at} for a in asks]}


@router.get("/donors/summary")
def donors_summary(h: int = Depends(H), db: Session = Depends(get_db)):
    by = dict(db.execute(select(Donor.blood_group, func.count()).where(Donor.available.is_(True)).group_by(Donor.blood_group)).all())
    total = db.scalar(select(func.count()).select_from(Donor)) or 0
    reqs = list(db.scalars(select(BloodRequest).where(BloodRequest.hospital_id == h).order_by(BloodRequest.created_at.desc()).limit(20)))
    return {"total": total, "by_group": {g: by.get(g, 0) for g in GROUPS},
            "hospitals": [{"id": h.id, "name": h.short} for h in transport.HOSPITALS],
            "requests": [request_out(db, r) for r in reqs]}


@router.post("/blood-requests", status_code=201)
def blood_request(body: BloodIn, who=Depends(staff), db: Session = Depends(get_db)):
    """Ask nearby donors whose blood suits the patient, nearest first. Donors answer yes or no;
    a donor's number is only shown to the hospital after they say yes."""
    h = transport.HOSPITALS_BY_ID.get(body.hospital_id)
    if h is None:
        raise HTTPException(422, "Unknown hospital.")
    r = BloodRequest(blood_group=body.blood_group, units=body.units, hospital=h.name, note=body.note.strip(),
                     case_id=body.case_id, created_by=staff_name(who), created_at=now(), hospital_id=tenancy.hid(who))
    db.add(r)
    db.flush()
    ok = CAN_RECEIVE_FROM[body.blood_group]
    cutoff = now() - timedelta(days=DONATION_GAP_DAYS)
    cands = []
    for d in db.scalars(select(Donor).where(Donor.available.is_(True), Donor.blood_group.in_(ok))):
        if d.last_donated and d.last_donated > cutoff:
            continue
        pos = (d.lat, d.lng) if d.lat is not None else next(((la, ln) for n, la, ln in areas.AREAS if n == d.area), None)
        km = transport.distance_km(pos[0], pos[1], h.lat, h.lng) if pos else 99.0
        cands.append((d.blood_group != body.blood_group, km, d))
    cands.sort(key=lambda c: (c[0], c[1]))
    for _exact, km, d in cands[: max(8, body.units * 5)]:
        ask = BloodAsk(request_id=r.id, donor_id=d.id, km=round(km, 1))
        db.add(ask)
        db.flush()
        notify.notify(db, d.phone, "blood", f"{body.blood_group} blood needed at {h.short}",
                      f"{body.units} unit(s) needed today. Can you donate? Tap to answer.",
                      f"/donate/answer?a={ask.id}&t={d.token}", dedupe=f"blood:{ask.id}",
                      ur=(f"{h.short} میں {body.blood_group} خون کی ضرورت ہے",
                          f"آج {body.units} یونٹ چاہئیں۔ کیا آپ عطیہ دے سکتے ہیں؟ جواب کے لیے ٹیپ کریں۔"))
    db.commit()
    return request_out(db, r)


@router.post("/blood-requests/{request_id}/status")
def blood_request_status(request_id: int, status: Literal["open", "filled", "closed"], h: int = Depends(H),
                         db: Session = Depends(get_db)):
    r = db.get(BloodRequest, request_id)
    if r is None or (r.hospital_id or 1) != h:
        raise HTTPException(404, "No such request.")
    r.status = status
    db.commit()
    return request_out(db, r)


def _ask(db: Session, ask_id: int, token: str) -> BloodAsk:
    a = db.get(BloodAsk, ask_id)
    if a is None or not secrets.compare_digest(a.donor.token, token):
        raise HTTPException(403, "This link is not valid.")
    return a


@router.get("/blood-asks/{ask_id}")
def blood_ask(ask_id: int, t: str, db: Session = Depends(get_db)):
    """What the donor sees: no patient details, only what they need to decide and get there."""
    a = _ask(db, ask_id, t)
    r = db.get(BloodRequest, a.request_id)
    h = next((x for x in transport.HOSPITALS if x.name == r.hospital), None)
    return {"donor": a.donor.name, "blood_group": r.blood_group, "units": r.units, "hospital": r.hospital,
            "hospital_phone": h.phone if h else "", "hospital_position": {"lat": h.lat, "lng": h.lng} if h else None,
            "km": a.km, "answer": a.answer, "request_status": r.status, "created_at": r.created_at, "token": a.donor.token}


@router.post("/blood-asks/{ask_id}/answer")
def blood_answer(ask_id: int, t: str, answer: Literal["yes", "no"], db: Session = Depends(get_db)):
    a = _ask(db, ask_id, t)
    r = db.get(BloodRequest, a.request_id)
    if r.status != "open" and answer == "yes":
        raise HTTPException(409, "Thank you! Enough donors have already said yes.")
    a.answer, a.answered_at = answer, now()
    db.commit()
    return blood_ask(ask_id, t, db)


# ======================= Medicines (from the patient's own prescription) =======================

TIMING = {"morning": "08:00", "afternoon": "14:00", "evening": "18:00", "night": "21:00"}
DEFAULT_TIMES = {1: ["08:00"], 2: ["08:00", "21:00"], 3: ["08:00", "14:00", "21:00"], 4: ["08:00", "13:00", "18:00", "22:00"]}

RX_PROMPT = """Read this photo of a doctor's prescription from Pakistan. Return JSON:
{"medicines": [{"name": "", "dose": "", "times_per_day": 1, "timing": ["morning","afternoon","evening","night"],
"with_food": "before" | "after" | "any", "days": null, "instructions_en": "", "instructions_ur": ""}],
"unclear": ["anything you could not read"]}
Rules: copy each medicine name, strength and dose EXACTLY as written. Never add, remove or change a medicine or a dose,
and never guess. If any part is hard to read, leave that field empty and add it to "unclear".
Common shorthand: OD = once a day, BD = twice, TDS = three times, QID = four, HS = at night, SOS = only when needed,
AC = before food, PC = after food, "1+0+1" = morning and night.
instructions_en / instructions_ur: only how to take it as written (when, how many, before/after food, how many days),
in very simple words; Urdu in Urdu script. Do not say what the medicine is for, and give no other medical advice.
If the photo is not a prescription, return {"medicines": [], "unclear": ["not a prescription"]}."""


class RxPhotoIn(BaseModel):
    image_b64: str = Field(max_length=8_000_000)
    mime: str = Field(default="image/jpeg", pattern=r"^image/(jpeg|png|webp|heic|heif)$")


class MedIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    dose: str = Field(default="", max_length=160)
    times: list[str] = Field(min_length=1, max_length=6)
    with_food: Literal["before", "after", "any"] = "any"
    days: int | None = Field(default=None, ge=1, le=365)
    instructions_en: str = Field(default="", max_length=400)
    instructions_ur: str = Field(default="", max_length=400)
    source: Literal["photo", "manual"] = "manual"


def times_from(m: dict) -> list[str]:
    t = [TIMING[x] for x in (m.get("timing") or []) if x in TIMING]
    if t:
        return sorted(set(t))
    n = m.get("times_per_day")
    return DEFAULT_TIMES.get(n if isinstance(n, int) else 0, ["08:00"])


@router.post("/me/prescriptions/read")
def read_prescription(body: RxPhotoIn, a: Account = Depends(auth.patient_only), db: Session = Depends(get_db)):
    """Gemini reads the photo. Nothing is saved until the patient checks the list and confirms it."""
    tenancy.limit(db, f"rx:{a.id}", 20, 60, "Too many photos for now. Please wait an hour or add medicines by hand.")
    if not settings.gemini_api_key:
        raise HTTPException(503, "Reading photos needs the AI to be switched on. You can add medicines by hand.")
    data = ai.gemini_json(RX_PROMPT, [{"inline_data": {"mime_type": body.mime, "data": body.image_b64}}], timeout=40, temperature=0)
    if not isinstance(data, dict):
        raise HTTPException(502, "Couldn't read the photo. Try a clearer photo in good light, or add medicines by hand.")
    meds = []
    for m in (data.get("medicines") or [])[:15]:
        if not isinstance(m, dict) or not str(m.get("name", "")).strip():
            continue
        days = m.get("days")
        meds.append({"name": str(m["name"]).strip()[:160], "dose": str(m.get("dose") or "").strip()[:160],
                     "times": times_from(m), "with_food": m.get("with_food") if m.get("with_food") in ("before", "after") else "any",
                     "days": days if isinstance(days, int) and 0 < days <= 365 else None,
                     "instructions_en": str(m.get("instructions_en") or "")[:400],
                     "instructions_ur": str(m.get("instructions_ur") or "")[:400], "source": "photo"})
    return {"medicines": meds, "unclear": [str(u)[:200] for u in (data.get("unclear") or [])][:10],
            "engine": settings.gemini_model}


def med_out(m: Medicine) -> dict:
    return {"id": m.id, "name": m.name, "dose": m.dose, "times": m.times, "with_food": m.with_food, "days": m.days,
            "instructions_en": m.instructions_en, "instructions_ur": m.instructions_ur, "source": m.source,
            "start_date": m.start_date, "active": m.active}


@router.post("/me/medicines", status_code=201)
def add_medicines(body: list[MedIn], a: Account = Depends(auth.patient_only), db: Session = Depends(get_db)):
    if not body or len(body) > 15:
        raise HTTPException(422, "Add between 1 and 15 medicines.")
    out = []
    for m in body:
        times = sorted({t for t in m.times if re.match(HHMM, t)})
        if not times:
            raise HTTPException(422, f"Choose at least one time for {m.name}.")
        row = Medicine(account_id=a.id, name=m.name.strip(), dose=m.dose.strip(), times=times, with_food=m.with_food,
                       days=m.days, instructions_en=m.instructions_en.strip(), instructions_ur=m.instructions_ur.strip(),
                       source=m.source, start_date=now().replace(hour=0, minute=0, second=0, microsecond=0),
                       active=True, created_at=now())
        db.add(row)
        out.append(row)
    db.commit()
    return [med_out(m) for m in out]


@router.delete("/me/medicines/{med_id}")
def stop_medicine(med_id: int, a: Account = Depends(auth.patient_only), db: Session = Depends(get_db)):
    m = db.get(Medicine, med_id)
    if m is None or m.account_id != a.id:
        raise HTTPException(404, "No such medicine.")
    m.active = False
    db.commit()
    return {"ok": True}


def running(m: Medicine, day: datetime) -> bool:
    d0 = m.start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    d = day.replace(hour=0, minute=0, second=0, microsecond=0)
    return m.active and d >= d0 and (m.days is None or d < d0 + timedelta(days=m.days))


def doses_today(db: Session, account_id: int) -> list[dict]:
    t, day = now(), today()
    taken = {(l.medicine_id, l.time): l.taken_at for l in
             db.scalars(select(DoseLog).join(Medicine, Medicine.id == DoseLog.medicine_id)
                        .where(Medicine.account_id == account_id, DoseLog.day == day))}
    out = []
    for m in db.scalars(select(Medicine).where(Medicine.account_id == account_id, Medicine.active.is_(True))):
        if not running(m, t):
            continue
        left = None if m.days is None else (m.start_date + timedelta(days=m.days) - t.replace(hour=0, minute=0)).days
        for hhmm in m.times:
            due = at_time(t, hhmm)
            if (m.id, hhmm) in taken:
                st = "taken"
            elif t < due - timedelta(minutes=30):
                st = "upcoming"
            elif t < due + timedelta(minutes=90):
                st = "due"
            else:
                st = "missed"
            out.append({"medicine_id": m.id, "name": m.name, "dose": m.dose, "time": hhmm, "status": st,
                        "with_food": m.with_food, "instructions_en": m.instructions_en, "instructions_ur": m.instructions_ur,
                        "days_left": left, "taken_at": taken.get((m.id, hhmm))})
    out.sort(key=lambda x: x["time"])
    return out


@router.get("/me/medicines")
def my_medicines(a: Account = Depends(auth.patient_only), db: Session = Depends(get_db)):
    meds = db.scalars(select(Medicine).where(Medicine.account_id == a.id, Medicine.active.is_(True)).order_by(Medicine.created_at))
    return {"today": doses_today(db, a.id), "medicines": [med_out(m) for m in meds if running(m, now())]}


@router.post("/me/medicines/{med_id}/taken")
def dose_taken(med_id: int, time: str = Query(pattern=HHMM), a: Account = Depends(auth.patient_only),
               db: Session = Depends(get_db)):
    m = db.get(Medicine, med_id)
    if m is None or m.account_id != a.id or time not in m.times:
        raise HTTPException(404, "No such dose.")
    exists = db.scalar(select(DoseLog).where(DoseLog.medicine_id == m.id, DoseLog.day == today(), DoseLog.time == time))
    if exists is None:
        db.add(DoseLog(medicine_id=m.id, day=today(), time=time, taken_at=now()))
        db.commit()
    return {"today": doses_today(db, a.id)}


# ======================= Elder check-ins =======================

class ElderIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(default="", max_length=32)
    checkin_time: str = Field(default="09:00", pattern=HHMM)
    grace_min: int = Field(default=120, ge=30, le=360)
    lang: Literal["ur", "en"] = "ur"


def elder_status(db: Session, e: Elder) -> dict:
    t = now()
    c = db.scalar(select(Checkin).where(Checkin.elder_id == e.id, Checkin.day == today()).order_by(Checkin.at.desc()))
    due = at_time(t, e.checkin_time)
    if c:
        st = c.status  # ok | help
    elif t < due:
        st = "upcoming"
    elif t < due + timedelta(minutes=e.grace_min):
        st = "waiting"
    else:
        st = "missed"
    week = [{"day": d, "status": s} for d, s in db.execute(
        select(Checkin.day, Checkin.status).where(Checkin.elder_id == e.id, Checkin.day >= (t - timedelta(days=6)).strftime("%Y-%m-%d"))
        .order_by(Checkin.day))]
    return {"id": e.id, "name": e.name, "phone": e.phone, "checkin_time": e.checkin_time, "grace_min": e.grace_min,
            "lang": e.lang, "status": st, "checked_at": c.at if c else None, "week": week,
            "link": f"/checkin?e={e.id}&t={e.token}"}


@router.post("/me/elders", status_code=201)
def add_elder(body: ElderIn, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    if db.scalar(select(func.count()).select_from(Elder).where(Elder.family_account_id == a.id, Elder.active.is_(True))) >= 5:
        raise HTTPException(422, "You can add up to 5 people.")
    e = Elder(family_account_id=a.id, name=body.name.strip(), phone=auth.normalize_phone(body.phone) if body.phone.strip() else "",
              checkin_time=body.checkin_time, grace_min=body.grace_min, lang=body.lang, token=secrets.token_urlsafe(24),
              active=True, created_at=now())
    db.add(e)
    db.commit()
    return elder_status(db, e)


@router.get("/me/elders")
def my_elders(a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    tick(db)
    from . import elder_sos

    out = []
    for e in db.scalars(select(Elder).where(Elder.family_account_id == a.id, Elder.active.is_(True))):
        s = elder_status(db, e)
        s["sos"] = elder_sos.ev_out(db, elder_sos.latest(db, e.id))
        s["has_pin"] = bool(e.pin_hash)
        out.append(s)
    return out


@router.delete("/me/elders/{elder_id}")
def remove_elder(elder_id: int, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    e = db.get(Elder, elder_id)
    if e is None or e.family_account_id != a.id:
        raise HTTPException(404, "Not found.")
    e.active = False
    db.commit()
    return {"ok": True}


def _elder(db: Session, e_id: int, t: str) -> Elder:
    e = db.get(Elder, e_id)
    if e is None or not e.active or not secrets.compare_digest(e.token, t):
        raise HTTPException(403, "This link is not valid.")
    return e


@router.get("/checkin")
def checkin_page(e: int, t: str, db: Session = Depends(get_db)):
    el = _elder(db, e, t)
    s = elder_status(db, el)
    return {"name": el.name, "lang": el.lang, "status": s["status"], "checked_at": s["checked_at"], "checkin_time": el.checkin_time}


@router.post("/checkin")
def checkin(e: int, t: str, status: Literal["ok", "help"], db: Session = Depends(get_db)):
    """The elder taps "I'm okay" or "I need help". Help reaches the family at once and puts an urgent
    case on the hospital desk."""
    el = _elder(db, e, t)
    db.add(Checkin(elder_id=el.id, day=today(), status=status, at=now()))
    db.commit()
    fam = db.get(Account, el.family_account_id)
    if status == "help":
        notify.notify(db, fam.phone, "elder", f"{el.name} pressed I NEED HELP",
                      f"Call {el.name} now{' on ' + el.phone if el.phone else ''}. In an emergency call 1122.",
                      "/patient/family", dedupe=f"elder-help:{el.id}:{now().isoformat(timespec='minutes')}",
                      ur=(f"{el.name} نے 'مجھے مدد چاہیے' دبایا",
                          f"ابھی {el.name} کو کال کریں{' (' + el.phone + ')' if el.phone else ''}۔ ایمرجنسی میں 1122 پر کال کریں۔"))
        if el.phone:
            case = services.create_intake(db, el.phone, el.name,
                                          f"Elder check-in: {el.name} pressed 'I need help' on the daily check-in. Please call now.",
                                          "web")
            case.urgency, case.needs_callback = "urgent", True
            case.red_flags = list({*(case.red_flags or []), "Elder asked for help"})
            db.commit()
    else:
        notify.notify(db, fam.phone, "elder", f"{el.name} checked in: okay ✓", "", "/patient/family",
                      dedupe=f"elder-ok:{el.id}:{today()}", ur=(f"{el.name} نے بتایا: میں ٹھیک ہوں ✓", ""))
    return checkin_page(e, t, db)


# ======================= Scheduled run (every 15 minutes, free on GitHub Actions) =======================

def tick(db: Session) -> dict:
    """Send what has fallen due. Safe to run any number of times: each message has a one-time key."""
    t, day = now(), today()
    sent = {"medicine": 0, "elder_reminder": 0, "elder_missed": 0}
    from . import elder_sos

    sent["sos_escalated"] = elder_sos.check(db)  # emergency button: no answer within 1 minute
    from . import ops  # appointment reminders (fewer no-shows)

    sent.update({f"appointment_{k}": v for k, v in ops.appointment_reminders(db).items()})
    accounts = {}
    for m in db.scalars(select(Medicine).where(Medicine.active.is_(True))):
        if not running(m, t):
            continue
        for hhmm in m.times:
            due = at_time(t, hhmm)
            if not (due <= t < due + timedelta(minutes=60)):
                continue
            if db.scalar(select(DoseLog).where(DoseLog.medicine_id == m.id, DoseLog.day == day, DoseLog.time == hhmm)):
                continue
            acc = accounts.get(m.account_id) or db.get(Account, m.account_id)
            accounts[m.account_id] = acc
            if notify.notify(db, acc.phone, "medicine", f"Time for {m.name}",
                             " · ".join(x for x in (m.dose, m.instructions_en) if x) or "Tap when you've taken it.",
                             "/patient/medicines", dedupe=f"med:{m.id}:{day}:{hhmm}",
                             ur=(f"{m.name} لینے کا وقت",
                                 " · ".join(x for x in (m.dose, m.instructions_ur) if x) or "دوا لینے کے بعد ٹیپ کریں۔")):
                sent["medicine"] += 1
    for e in db.scalars(select(Elder).where(Elder.active.is_(True))):
        s = elder_status(db, e)
        if s["status"] == "waiting":
            title = "السلام علیکم! کیا آپ آج ٹھیک ہیں؟" if e.lang == "ur" else "Good morning! Are you okay today?"
            if notify.notify(db, f"elder:{e.id}", "elder", title, "Tap to check in.", s["link"],
                             ur=("السلام علیکم! کیا آپ آج ٹھیک ہیں؟", "جواب دینے کے لیے ٹیپ کریں۔") if e.lang == "ur" else None,
                             dedupe=f"elder-remind:{e.id}:{day}", push_owner=f"elder:{e.id}"):
                sent["elder_reminder"] += 1
        elif s["status"] == "missed":
            fam = db.get(Account, e.family_account_id)
            if notify.notify(db, fam.phone, "elder", f"{e.name} hasn't checked in today",
                             f"Please call {e.name}{' on ' + e.phone if e.phone else ''} to make sure they're okay.",
                             "/patient/family", dedupe=f"elder-missed:{e.id}:{day}",
                             ur=(f"{e.name} نے آج جواب نہیں دیا",
                                 f"براہ کرم {e.name} کو کال کر کے خیریت معلوم کریں{' (' + e.phone + ')' if e.phone else ''}۔")):
                sent["elder_missed"] += 1
    return sent


@router.post("/cron/tick")
def cron_tick(x_cron_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    key = os.getenv("CRON_KEY")
    if key and not (x_cron_key and secrets.compare_digest(x_cron_key, key)):
        raise HTTPException(401, "Bad key.")
    return tick(db)


# ======================= Demo data (SEED_DEMO=1) =======================

def seed_community(db: Session):
    """Sample history so area alerts and donors can be shown. Never shown as real cases."""
    if db.scalar(select(func.count()).select_from(SampleSignal)):
        return
    import random

    rnd = random.Random(7)
    t = now()
    plan = [  # area, group, this week, each of the 4 weeks before
        ("Gulgasht Colony", "fever", 11, 2), ("Shah Rukn-e-Alam Colony", "diarrhoea", 6, 1),
        ("Bosan Road", "cough", 3, 3), ("Mumtazabad", "fever", 2, 2), ("Model Town", "rash", 2, 1),
        ("New Multan", "eye", 2, 1), ("Multan Cantt", "cough", 1, 1), ("Chungi No. 9", "diarrhoea", 2, 1),
    ]
    for area, grp, now_n, base_n in plan:
        for _ in range(now_n):
            db.add(SampleSignal(area=area, group=grp, at=t - timedelta(hours=rnd.randint(2, 6 * 24))))
        for w in range(1, 5):
            for _ in range(base_n):
                db.add(SampleSignal(area=area, group=grp, at=t - timedelta(days=7 * w + rnd.randint(0, 6), hours=rnd.randint(0, 20))))
    names = ["Ali Raza", "Sana Tariq", "Usman Ghani", "Hira Javed", "Bilal Ahmed", "Ayesha Noor", "Fahad Iqbal",
             "Maria Khan", "Zeeshan Ali", "Nida Aslam", "Imran Shah", "Saba Qureshi", "Kashif Mehmood", "Rabia Anwar"]
    groups = ["O+", "B+", "A+", "O+", "AB+", "B+", "O-", "A+", "B-", "O+", "A-", "B+", "O+", "AB-"]
    for i, (n, g) in enumerate(zip(names, groups)):
        area, la, ln = areas.AREAS[i % len(areas.AREAS)]
        db.add(Donor(phone=f"+9230099{i:05d}", name=n, blood_group=g, area=area, lat=la + rnd.uniform(-0.01, 0.01),
                     lng=ln + rnd.uniform(-0.01, 0.01), available=True, token=secrets.token_urlsafe(24), is_sample=True,
                     last_donated=t - timedelta(days=rnd.choice([30, 120, 200, 400])) if i % 3 else None, created_at=t))
    db.commit()
