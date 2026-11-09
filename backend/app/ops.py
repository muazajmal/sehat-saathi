"""Running a hospital on Sehat Saathi: fewer no-shows, management reports, and trust basics
(password reset by email, deleting your data)."""
import csv
import hashlib
import io
import secrets
import statistics
from collections import Counter, defaultdict
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import areas, auth, emails, inbox as notify, patient, tenancy
from .config import settings
from .db import get_db
from .models import (Account, AuditEvent, Case, CaseAccess, CaseLocation, Checkin, ContactEmail, DoseLog, Donor, Elder,
                     Medicine, Notification, Patient, PushSub, ResetToken, Slot)
from .services import now

router = APIRouter(prefix="/api")


def staff(authorization: str | None = Header(default=None), x_staff_key: str | None = Header(default=None),
          db: Session = Depends(get_db)):
    return auth.staff_account(db, authorization, x_staff_key)


def _audit(db: Session, actor: str, action: str, detail: str, case_id: int):
    db.add(AuditEvent(actor=actor, action=action, detail=detail, case_id=case_id, at=now()))


def _case_by_token(db: Session, c: int, t: str) -> Case:
    access = db.scalar(select(CaseAccess).where(CaseAccess.case_id == c))
    case = db.get(Case, c)
    if case is None or access is None or not secrets.compare_digest(access.token, t):
        raise HTTPException(403, "This link is not valid.")
    return case


# ======================= Fewer no-shows =======================

@router.post("/patient/reply")
def patient_reply(c: int, t: str, reply: Literal["coming", "cancelled"], db: Session = Depends(get_db)):
    """From the patient's own page: "I'll come" or "Cancel". Cancelling frees the time for someone else."""
    case = _case_by_token(db, c, t)
    if case.status != "approved" or case.proposed_slot is None or case.attendance:
        raise HTTPException(409, "There is no upcoming appointment to answer for.")
    if case.proposed_slot.starts_at <= now():
        raise HTTPException(409, "This appointment time has already passed.")
    case.patient_reply, case.patient_reply_at = reply, now()
    if reply == "cancelled":
        case.proposed_slot.status = "open"
        _audit(db, "patient", "patient_cancelled", f"{case.proposed_slot.doctor} {case.proposed_slot.starts_at:%a %H:%M} freed", case.id)
    else:
        _audit(db, "patient", "patient_confirmed", "Patient will come", case.id)
    db.commit()
    return {"patient_reply": case.patient_reply}


class AttendanceIn(BaseModel):
    value: Literal["arrived", "no_show"]


@router.post("/cases/{case_id}/attendance")
def attendance(case_id: int, body: AttendanceIn, who=Depends(staff), db: Session = Depends(get_db)):
    case = tenancy.own_case(db, case_id, tenancy.hid(who))
    if case.status != "approved" or case.proposed_slot is None:
        raise HTTPException(409, "Only booked appointments can be marked.")
    if case.proposed_slot.starts_at.date() > now().date():
        raise HTTPException(409, "You can mark this on the day of the appointment.")
    case.attendance = body.value
    _audit(db, who.name if who else "Clinic staff", "attendance", body.value.replace("_", "-"), case.id)
    db.commit()
    return {"attendance": case.attendance}


def appointment_reminders(db: Session) -> dict:
    """Called by the scheduled run. A day-before reminder (if booked well ahead) and a 2-hours-before one,
    each once, in the app, as a phone notification, and by email if the patient gave one."""
    t = now()
    sent = {"day": 0, "soon": 0}
    q = (select(Case).join(Slot, Slot.id == Case.proposed_slot_id)
         .where(Case.status == "approved", Case.attendance.is_(None), Slot.starts_at > t, Slot.starts_at <= t + timedelta(hours=26)))
    for case in db.scalars(q):
        if case.patient_reply == "cancelled":
            continue
        slot = case.proposed_slot
        booked = case.reviewed_at or case.created_at
        left = slot.starts_at - t
        if left <= timedelta(hours=2):
            kind = "soon" if booked < slot.starts_at - timedelta(hours=2) else None
        elif left <= timedelta(hours=24):
            kind = "day" if booked < slot.starts_at - timedelta(hours=20) else None
        else:
            kind = None
        if not kind:
            continue
        tok = patient.issue_token(db, case.id)
        link = f"/patient/status?c={case.id}&t={tok}"
        title = (f"Soon: {slot.doctor} at {slot.starts_at:%I:%M %p}" if kind == "soon"
                 else f"Tomorrow: {slot.doctor} at {slot.starts_at:%I:%M %p}").replace(" 0", " ")
        if notify.notify(db, case.patient.phone, "booking", title, "Tap \"I'll come\" or \"Cancel\" so others can use the time.",
                         link, dedupe=f"appt-{kind}:{case.id}"):
            emails.trigger(db, case, f"reminder-{kind}")
            sent[kind] += 1
    return sent


# ======================= Reports for hospital management =======================

def _median(xs):
    return round(statistics.median(xs), 1) if xs else None


@router.get("/reports")
def reports(days: int = Query(30, ge=1, le=365), who=Depends(staff), db: Session = Depends(get_db)):
    h = tenancy.hid(who)
    t = now()
    since = (t - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    cases = list(db.scalars(select(Case).where(Case.hospital_id == h, Case.created_at >= since)))
    by_day = defaultdict(lambda: {"requests": 0, "urgent": 0})
    for c in cases:
        d = c.created_at.strftime("%Y-%m-%d")
        by_day[d]["requests"] += 1
        by_day[d]["urgent"] += c.urgency == "urgent"
    series = []
    for i in range(days):
        d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({"day": d, **by_day.get(d, {"requests": 0, "urgent": 0})})
    decided = [c for c in cases if c.reviewed_at]
    minutes = [(c.reviewed_at - c.created_at).total_seconds() / 60 for c in decided]
    urgent_minutes = [(c.reviewed_at - c.created_at).total_seconds() / 60 for c in decided if c.urgency == "urgent"]
    booked = [c for c in cases if c.status == "approved" and c.proposed_slot is not None]
    arrived = sum(1 for c in booked if c.attendance == "arrived")
    no_show = sum(1 for c in booked if c.attendance == "no_show")
    cancelled = sum(1 for c in booked if c.patient_reply == "cancelled")
    confirmed = sum(1 for c in booked if c.patient_reply == "coming")
    groups = Counter(areas.symptom_group(f"{c.message} {c.summary}") or "other" for c in cases)
    complaint_names = {k: v["en"] for k, v in areas.GROUPS.items()} | {"other": "Other"}
    doctors = defaultdict(lambda: {"booked": 0, "arrived": 0, "no_show": 0})
    for c in booked:
        d = doctors[c.proposed_slot.doctor]
        d["booked"] += 1
        d["arrived"] += c.attendance == "arrived"
        d["no_show"] += c.attendance == "no_show"
    hours = Counter(c.created_at.hour for c in cases)
    locs = {cid: (la, ln) for cid, la, ln in db.execute(
        select(CaseLocation.case_id, CaseLocation.lat, CaseLocation.lng).where(CaseLocation.case_id.in_([c.id for c in cases] or [0])))}
    area_count = Counter(areas.nearest_area(*locs[c.id]) or "Outside the city" for c in cases if c.id in locs)
    return {
        "hospital": tenancy.name_of(db, h), "days": days, "from": since, "to": t,
        "totals": {
            "requests": len(cases),
            "urgent": sum(c.urgency == "urgent" for c in cases),
            "today": sum(c.urgency == "today" for c in cases),
            "routine": sum(c.urgency == "routine" for c in cases),
            "pending": sum(c.status == "pending_review" for c in cases),
            "approved": sum(c.status == "approved" for c in cases),
            "declined": sum(c.status == "rejected" for c in cases),
            "median_decision_min": _median(minutes),
            "median_urgent_decision_min": _median(urgent_minutes),
            "booked": len(booked), "arrived": arrived, "no_show": no_show, "cancelled": cancelled, "confirmed": confirmed,
            "no_show_rate": round(100 * no_show / (arrived + no_show), 1) if (arrived + no_show) else None,
            "ai_triaged": sum(c.engine != "rules" for c in cases),
        },
        "series": series,
        "complaints": [{"key": k, "name": complaint_names.get(k, k), "count": n} for k, n in groups.most_common()],
        "channels": dict(Counter(c.channel for c in cases)),
        "languages": dict(Counter(c.language for c in cases).most_common(8)),
        "hours": [hours.get(i, 0) for i in range(24)],
        "doctors": [{"doctor": k, **v} for k, v in sorted(doctors.items(), key=lambda kv: -kv[1]["booked"])],
        "areas": [{"area": k, "count": n} for k, n in area_count.most_common(10)],
    }


@router.get("/reports/cases.csv", response_class=PlainTextResponse)
def reports_csv(days: int = Query(30, ge=1, le=365), who=Depends(staff), db: Session = Depends(get_db)):
    """One row per request, without names or phone numbers."""
    h = tenancy.hid(who)
    since = now() - timedelta(days=days)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["case_id", "received", "channel", "language", "urgency", "complaint", "status", "decided_by",
                "decision_minutes", "doctor", "appointment", "patient_reply", "attendance", "ai_engine"])
    for c in db.scalars(select(Case).where(Case.hospital_id == h, Case.created_at >= since).order_by(Case.created_at)):
        s = c.proposed_slot if c.status == "approved" else None
        w.writerow([c.id, c.created_at.strftime("%Y-%m-%d %H:%M"), c.channel, c.language, c.urgency,
                    areas.symptom_group(f"{c.message} {c.summary}") or "other", c.status, c.reviewed_by or "",
                    round((c.reviewed_at - c.created_at).total_seconds() / 60, 1) if c.reviewed_at else "",
                    s.doctor if s else "", s.starts_at.strftime("%Y-%m-%d %H:%M") if s else "",
                    c.patient_reply or "", c.attendance or "", c.engine])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="sehat-saathi-cases-{days}d.csv"'})


# ======================= Trust basics =======================

class ForgotIn(BaseModel):
    phone: str = Field(min_length=6, max_length=32)


class ResetIn(BaseModel):
    u: int
    t: str = Field(min_length=10, max_length=100)
    password: str = Field(min_length=6, max_length=200)


SAME_ANSWER = {"ok": True, "message": "If this number has an account with an email, we've sent a reset link. It works for 30 minutes."}


@router.post("/auth/forgot")
def forgot(body: ForgotIn, db: Session = Depends(get_db)):
    """Always the same answer, so nobody can find out which numbers have accounts."""
    phone = auth.normalize_phone(body.phone)
    tenancy.limit(db, f"forgot:{phone}", 3, 60, "Too many reset requests. Please wait an hour.")
    a = auth.find(db, phone)
    to = emails.email_for(db, phone) if a else None
    if a and to and a.active:
        tok = secrets.token_urlsafe(32)
        db.add(ResetToken(account_id=a.id, token_hash=hashlib.sha256(tok.encode()).hexdigest(),
                          expires_at=now() + timedelta(minutes=30)))
        db.commit()
        subject, body_html = emails.reset_email(a.name, f"{settings.frontend_url}/reset?u={a.id}&t={tok}")
        emails.queue(db, f"reset:{a.id}:{now():%Y%m%d%H%M%S}", to, subject, body_html)
    return SAME_ANSWER


@router.post("/auth/reset")
def reset(body: ResetIn, db: Session = Depends(get_db)):
    tenancy.limit(db, f"reset:{body.u}", 10, 60)
    h = hashlib.sha256(body.t.encode()).hexdigest()
    rt = db.scalar(select(ResetToken).where(ResetToken.account_id == body.u, ResetToken.token_hash == h))
    if rt is None or rt.used or rt.expires_at < now():
        raise HTTPException(400, "This reset link has expired. Ask for a new one.")
    a = db.get(Account, body.u)
    a.password_hash = auth.hash_password(body.password)
    rt.used = True
    db.commit()
    return {"ok": True}


class DeleteIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)


@router.post("/me/delete")
def delete_me(body: DeleteIn, a: Account = Depends(auth.patient_only), db: Session = Depends(get_db)):
    """A patient deletes their account and personal data. Requests already sent to a hospital are kept
    for the hospital's medical record, but without the patient's name, number or own words."""
    if not auth.check_password(body.password, a.password_hash):
        raise HTTPException(401, "Your password is wrong.")
    phone = a.phone
    for m in db.scalars(select(Medicine).where(Medicine.account_id == a.id)):
        db.execute(delete(DoseLog).where(DoseLog.medicine_id == m.id))
        db.delete(m)
    for e in db.scalars(select(Elder).where(Elder.family_account_id == a.id)):
        db.execute(delete(Checkin).where(Checkin.elder_id == e.id))
        db.execute(delete(PushSub).where(PushSub.owner == f"elder:{e.id}"))
        db.delete(e)
    donor = db.scalar(select(Donor).where(Donor.phone == phone))
    if donor:
        donor.available, donor.name, donor.phone = False, "Deleted donor", f"deleted:{donor.id}"
    db.execute(delete(Notification).where(Notification.phone == phone))
    db.execute(delete(PushSub).where(PushSub.owner == f"phone:{phone}"))
    db.execute(delete(ContactEmail).where(ContactEmail.phone == phone))
    db.execute(delete(ResetToken).where(ResetToken.account_id == a.id))
    p = db.scalar(select(Patient).where(Patient.phone == phone))
    if p:
        p.name, p.phone = "", f"deleted:{p.id}"
        for c in db.scalars(select(Case).where(Case.patient_id == p.id)):
            c.message = "[removed at the patient's request]"
    db.delete(a)
    db.commit()
    return {"ok": True}
