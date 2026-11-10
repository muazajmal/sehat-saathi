"""Sehat Saathi API.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal

import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import accounts, auth, community, elder_sos, emails, ops, tenancy, billing, dispatch, members, patient, services, summary, transport
from .config import settings
from .db import Base, engine, get_db
from .models import AmbulanceMember, AuditEvent, Case, Charge, Dispatch, Lead, Patient, Responder, Slot
from .schemas import (
    TranscribeIn,
    AmbulanceIn,
    AmbulanceOnlineIn,
    AmbulanceOut,
    AmbulanceReviewIn,
    ApproveIn,
    AuditOut,
    CallbackIn,
    CaseOut,
    ChargeOut,
    DispatchIn,
    DispatchOut,
    DispatchStatusIn,
    IntakeIn,
    IntakeOut,
    PatientLocationIn,
    PatientStatusOut,
    LocationIn,
    LocationOut,
    PositionIn,
    PricesOut,
    SettleIn,
    VisitChargeIn,
    ResponderTripOut,
    TrackOut,
    ResponderOut,
    TransportOut,
    LeadIn,
    LeadOut,
    RejectIn,
    ScheduleSlot,
    SlotIn,
    SlotOut,
    StatsOut,
)
from .triage import rules_triage, triage

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def _init_db():
    Base.metadata.create_all(engine)
    from . import tenancy

    tenancy.migrate(engine)
    if os.getenv("SEED_DEMO", "1") == "1":
        from .seed import seed

        seed()
    from .db import SessionLocal

    with SessionLocal() as db:
        tenancy.ensure_default(db)
        tenancy.tidy_phones(db)
        accounts.ensure_accounts(db)
        if os.getenv("SEED_DEMO", "1") == "1":
            community.seed_community(db)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not os.getenv("VERCEL"):
        _init_db()
    yield


# Serverless platforms may not run lifespan events, so set up on import there.
if os.getenv("VERCEL"):
    try:
        _init_db()
    except Exception:  # never stop the API from starting; /api/health will show the error
        logging.getLogger("sehat").exception("Database setup failed")


app = FastAPI(
    title="Sehat Saathi API",
    description="Urdu WhatsApp triage and booking. The AI suggests; a doctor decides.",
    version="1.0.0",
    lifespan=lifespan,
)
app.include_router(accounts.router)
app.include_router(community.router)
app.include_router(elder_sos.router)
app.include_router(emails.router)
app.include_router(ops.router)
app.include_router(summary.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_methods=["*"],
    allow_headers=["*"],
)

URGENCY_ORDER = {"urgent": 0, "today": 1, "routine": 2}


def staff_only(
    authorization: str | None = Header(default=None),
    x_staff_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """The desk and patient data: a doctor or admin login (or the STAFF_KEY for scripts)."""
    return auth.staff_account(db, authorization, x_staff_key)


def H(who=Depends(staff_only)) -> int:
    """The hospital whose data this staff member may see."""
    return tenancy.hid(who)


def acting(who, typed: str) -> str:
    """Decisions are signed with the logged-in doctor's own name, not a typed one."""
    return who.name if who is not None else typed


STAFF = [Depends(staff_only)]


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "clinic": settings.clinic_name,
        "ai": settings.gemini_model if settings.gemini_api_key else "rules-only",
        "whatsapp": bool(settings.whatsapp_token),
        "staff_code_required": bool(settings.staff_key),
        "login_required": os.getenv("OPEN_DESK") != "1",
    }


@app.get("/api/staff/check", dependencies=STAFF)
def staff_check():
    """The desk calls this to know whether the saved access code still works."""
    return {"ok": True}


# ---------- Intake ----------

@app.post("/api/intake", response_model=IntakeOut, status_code=201)
def intake(body: IntakeIn, request: Request, db: Session = Depends(get_db)):
    """A patient message from any channel (patient website, demo, n8n). Public."""
    tenancy.limit(db, f"intake-ip:{accounts.client_ip(request)}", 60, 60,
                  "Too many requests from this connection. Please wait, or call 1122 in an emergency.")
    hosp = tenancy.active(db, body.hospital)
    tenancy.limit(db, f"intake:{body.phone.strip()[-10:]}", 12, 60, "Too many requests from this number. Please wait, or call 1122 in an emergency.")
    case = services.create_intake(db, body.phone.strip(), body.name.strip(), body.message.strip(), body.channel,
                                  body.quick.model_dump() if body.quick else None, hosp.id)
    if body.lat is not None and body.lng is not None:
        dispatch.set_location(db, case.id, body.lat, body.lng, body.location_label, "web")
    if body.email.strip():
        emails.save_email(db, case.patient.phone, body.email)
    token = patient.issue_token(db, case.id)
    db.refresh(case)
    out = IntakeOut.model_validate(
        {**CaseOut.model_validate(case).model_dump(), "access_token": token,
         "status_link": patient.status_link(case.id, token)}
    )
    return out


@app.post("/api/transcribe")
def transcribe(body: TranscribeIn, request: Request, db: Session = Depends(get_db)):
    """Voice note from the patient website -> text, so people can speak instead of typing.
    The text goes back into the form for the patient to check before sending."""
    tenancy.limit(db, f"voice:{accounts.client_ip(request)}", 40, 60, "Too many voice notes. Please type instead, or wait a little.")
    from . import voice

    return {"text": voice.transcribe(body.audio_b64, body.mime, body.ui_lang)}


@app.get("/api/patient/status", response_model=PatientStatusOut)
def patient_status(c: int, t: str, db: Session = Depends(get_db)):
    """The patient's own case, through their private link: booking, reply, responder distance."""
    return patient.status(db, c, t)


@app.post("/api/patient/location", response_model=PatientStatusOut)
def patient_location(body: PatientLocationIn, db: Session = Depends(get_db)):
    patient.share_location(db, body.c, body.t, body.lat, body.lng, body.label)
    return patient.status(db, body.c, body.t)


@app.post("/api/triage/preview", dependencies=STAFF)
def triage_preview(body: IntakeIn):
    """Triage without saving anything. Handy for testing prompts."""
    return {"final": triage(body.message).to_dict(), "rules_only": rules_triage(body.message).to_dict()}


# ---------- Cases ----------

@app.get("/api/cases", response_model=list[CaseOut])
def list_cases(
    status: Literal["pending_review", "approved", "rejected", "all"] = "pending_review",
    limit: int = Query(100, le=500),
    h: int = Depends(H),
    db: Session = Depends(get_db),
):
    elder_sos.check(db)  # the desk polls often, so overdue emergency-button alarms escalate on time
    q = select(Case).where(Case.hospital_id == h).order_by(Case.created_at.desc()).limit(limit)
    if status != "all":
        q = q.where(Case.status == status)
    cases = list(db.scalars(q))
    if status == "pending_review":
        cases.sort(key=lambda c: (URGENCY_ORDER.get(c.urgency, 3), c.created_at))
    return cases


@app.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, h: int = Depends(H), db: Session = Depends(get_db)):
    return tenancy.own_case(db, case_id, h)


@app.post("/api/cases/{case_id}/approve", response_model=CaseOut)
def approve_case(case_id: int, body: ApproveIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, tenancy.hid(who))
    case = services.approve(db, case_id, acting(who, body.staff), body.slot_id, body.note)
    emails.trigger(db, case, "confirmed")
    return case


@app.post("/api/cases/{case_id}/reject", response_model=CaseOut)
def reject_case(case_id: int, body: RejectIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, tenancy.hid(who))
    case = services.reject(db, case_id, acting(who, body.staff), body.note)
    emails.trigger(db, case, "declined")
    return case


@app.post("/api/cases/{case_id}/called", response_model=CaseOut)
def log_callback(case_id: int, body: CallbackIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, tenancy.hid(who))
    return services.mark_called(db, case_id, acting(who, body.staff), body.note)


# ---------- Slots ----------

@app.get("/api/slots", response_model=list[SlotOut])
def list_slots(
    status: Literal["open", "held", "booked", "all"] = "open",
    days: int = Query(2, ge=1, le=14),
    h: int = Depends(H),
    db: Session = Depends(get_db),
):
    start = services.now()
    q = (
        select(Slot)
        .where(Slot.hospital_id == h, Slot.starts_at >= start, Slot.starts_at <= start + timedelta(days=days))
        .order_by(Slot.starts_at)
    )
    if status != "all":
        q = q.where(Slot.status == status)
    return list(db.scalars(q))


@app.post("/api/slots", response_model=SlotOut, status_code=201)
def add_slot(body: SlotIn, h: int = Depends(H), db: Session = Depends(get_db)):
    slot = Slot(**body.model_dump(), status="open", hospital_id=h)
    slot.starts_at = slot.starts_at.replace(tzinfo=None)
    db.add(slot)
    db.commit()
    return slot


@app.get("/api/schedule", response_model=list[ScheduleSlot])
def schedule(day: date | None = None, h: int = Depends(H), db: Session = Depends(get_db)):
    """Every slot for one day, with the patient attached to held or booked ones."""
    d = day or services.now().date()
    start = datetime.combine(d, datetime.min.time())
    slots = list(
        db.scalars(
            select(Slot)
            .where(Slot.hospital_id == h, Slot.starts_at >= start, Slot.starts_at < start + timedelta(days=1))
            .order_by(Slot.doctor, Slot.starts_at)
        )
    )
    ids = [s.id for s in slots]
    cases = (
        {
            c.proposed_slot_id: c
            for c in db.scalars(
                select(Case).where(Case.proposed_slot_id.in_(ids), Case.status != "rejected")
            )
        }
        if ids
        else {}
    )
    out = []
    for s in slots:
        c = cases.get(s.id) if s.status != "open" else None
        out.append(
            ScheduleSlot(
                id=s.id,
                doctor=s.doctor,
                specialty=s.specialty,
                starts_at=s.starts_at,
                minutes=s.minutes,
                status=s.status,
                case_id=c.id if c else None,
                patient=(c.patient.name or c.patient.phone) if c else None,
                urgency=c.urgency if c else None,
                patient_reply=c.patient_reply if c else None,
                attendance=c.attendance if c else None,
            )
        )
    return out


# ---------- Getting patients to hospital ----------

def _own_dispatch(db: Session, dispatch_id: int, h: int):
    d = db.get(Dispatch, dispatch_id)
    if d is None:
        raise HTTPException(404, "Dispatch not found.")
    tenancy.own_case(db, d.case_id, h)

@app.post("/api/cases/{case_id}/location", response_model=LocationOut)
def share_location(case_id: int, body: LocationIn, h: int = Depends(H), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, h)
    return dispatch.set_location(db, case_id, body.lat, body.lng, body.label, body.source)


@app.get("/api/cases/{case_id}/transport", response_model=TransportOut)
def transport_options(case_id: int, h: int = Depends(H), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, h)
    """Suggested government hospital and nearest free responder. Staff decide."""
    return dispatch.options(db, case_id)


@app.post("/api/cases/{case_id}/dispatch", response_model=DispatchOut, status_code=201)
def send_responder(case_id: int, body: DispatchIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, tenancy.hid(who))
    return dispatch.send(db, case_id, acting(who, body.staff), body.responder_id, body.hospital_id, body.note)


@app.post("/api/dispatches/{dispatch_id}/status", response_model=DispatchOut)
def dispatch_status(dispatch_id: int, body: DispatchStatusIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    _own_dispatch(db, dispatch_id, tenancy.hid(who))
    return dispatch.update_status(db, dispatch_id, acting(who, body.staff), body.status, body.note)


@app.get("/api/dispatches/{dispatch_id}/track", response_model=TrackOut)
def track_dispatch(dispatch_id: int, h: int = Depends(H), db: Session = Depends(get_db)):
    _own_dispatch(db, dispatch_id, h)
    """Where the responder is now, and how far from the patient and the hospital."""
    return dispatch.track(db, dispatch_id)


@app.post("/api/dispatches/{dispatch_id}/position", response_model=TrackOut)
def post_position(dispatch_id: int, body: PositionIn, db: Session = Depends(get_db)):
    """GPS fix from the responder's phone (private tracking link)."""
    return dispatch.post_position(db, dispatch_id, body.token, body.lat, body.lng, body.accuracy_m)


@app.post("/api/dispatches/{dispatch_id}/responder-status", response_model=DispatchOut)
def responder_status(dispatch_id: int, body: dict, db: Session = Depends(get_db)):
    """The responder marks progress from their phone, using their private link."""
    d = dispatch._check_token(db, dispatch_id, str(body.get("token", "")))
    status = body.get("status")
    if status not in ("reached_patient", "at_hospital"):
        raise HTTPException(422, "status must be reached_patient or at_hospital")
    return dispatch.update_status(db, d.id, d.responder.name, status, "From the responder's phone")


@app.get("/api/responder-track", response_model=TrackOut)
def responder_track(d: int, t: str, db: Session = Depends(get_db)):
    """Distance and progress for the responder's own phone (private link)."""
    dispatch._check_token(db, d, t)
    return dispatch.track(db, d)


@app.get("/api/responder-trip", response_model=ResponderTripOut)
def responder_trip(d: int, t: str, db: Session = Depends(get_db)):
    """What the responder's phone shows: who to pick up, where, and which hospital."""
    return dispatch.responder_trip(db, d, t)


# ---------- Pay after service ----------

@app.get("/api/prices", response_model=PricesOut)
def prices():
    """Published prices, so patients can see them before agreeing to anything."""
    return {"transport_base_pkr": settings.transport_base_pkr,
            "transport_per_km_pkr": settings.transport_per_km_pkr,
            "visit_fee_pkr": settings.visit_fee_pkr}


@app.get("/api/cases/{case_id}/charges", response_model=list[ChargeOut])
def case_charges(case_id: int, h: int = Depends(H), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, h)
    return billing.for_case(db, case_id)


@app.post("/api/cases/{case_id}/charges", response_model=ChargeOut, status_code=201)
def add_visit_fee(case_id: int, body: VisitChargeIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    tenancy.own_case(db, case_id, tenancy.hid(who))
    return billing.add_visit_charge(db, case_id, acting(who, body.staff), body.amount_pkr, body.note)


@app.post("/api/charges/{charge_id}/settle", response_model=ChargeOut)
def settle_charge(charge_id: int, body: SettleIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    ch = db.get(Charge, charge_id)
    if ch is not None:
        tenancy.own_case(db, ch.case_id, tenancy.hid(who))
    return billing.settle(db, charge_id, acting(who, body.staff), body.status, body.method, body.note)


@app.get("/api/responders", response_model=list[ResponderOut], dependencies=STAFF)
def responders(db: Session = Depends(get_db)):
    return list(db.scalars(select(Responder).order_by(Responder.id)))


@app.post("/api/ambulances/register", response_model=AmbulanceOut, status_code=201)
def ambulance_register(body: AmbulanceIn, request: Request, db: Session = Depends(get_db)):
    """A local ambulance signs up. It can't take patients until staff approve it."""
    tenancy.limit(db, f"ambulance:{accounts.client_ip(request)}", 10, 60 * 24)
    if not body.agree:
        raise HTTPException(422, "Please agree to the rules first.")
    m = members.register(db, body.driver_name.strip(), body.phone, body.organisation.strip(), body.vehicle_type,
                         body.vehicle_reg.strip(), body.area.strip(), body.lat, body.lng)
    return members.out(db, m, private=True)


@app.get("/api/ambulances/me", response_model=AmbulanceOut)
def ambulance_me(m: int, t: str, db: Session = Depends(get_db)):
    """The driver's own page (private link): approval status, online, current trip."""
    return members.out(db, members.check(db, m, t), private=True)


@app.post("/api/ambulances/me/online", response_model=AmbulanceOut)
def ambulance_online(body: AmbulanceOnlineIn, db: Session = Depends(get_db)):
    """Go online or offline. While online the page also sends where the ambulance is."""
    return members.set_online(db, members.check(db, body.m, body.t), body.online, body.lat, body.lng)


@app.get("/api/ambulances", response_model=list[AmbulanceOut], dependencies=STAFF)
def ambulance_list(db: Session = Depends(get_db)):
    return members.list_all(db)


@app.post("/api/ambulances/{member_id}/review", response_model=AmbulanceOut)
def ambulance_review(member_id: int, body: AmbulanceReviewIn, who=Depends(staff_only), db: Session = Depends(get_db)):
    """Staff approve after checking the papers, or reject / pause a member."""
    return members.review(db, member_id, acting(who, body.staff), body.decision, body.note)


@app.get("/api/hospitals")
def hospitals():
    from dataclasses import asdict

    return [asdict(h) for h in transport.HOSPITALS]


@app.get("/api/sample-location")
def sample_location():
    """Where the website demo places a visitor who can't (or won't) share a real location."""
    return transport.SAMPLE_LOCATION


# ---------- Website ----------

@app.post("/api/leads", response_model=LeadOut, status_code=201)
def create_lead(body: LeadIn, request: Request, db: Session = Depends(get_db)):
    """"Book a demo" form on the website."""
    tenancy.limit(db, f"lead:{accounts.client_ip(request)}", 10, 60)
    lead = Lead(**body.model_dump(), created_at=services.now())
    db.add(lead)
    db.commit()
    logging.getLogger("sehat.leads").info("New demo request: %s, %s", lead.name, lead.clinic)
    try:  # confirmation to the clinic's Gmail; never block the request on email
        from . import emails
        subject, html_body = emails.lead_email(lead.name, lead.clinic)
        emails.queue(db, f"lead:{lead.id}", lead.email, subject, html_body)
    except Exception as e:
        logging.getLogger("sehat.leads").warning("lead email failed: %s", e)
    return lead


# ---------- Dashboard ----------

@app.get("/api/stats", response_model=StatsOut)
def stats(h: int = Depends(H), db: Session = Depends(get_db)):
    t = services.now()
    day_start = t.replace(hour=0, minute=0, second=0)
    day_end = t.replace(hour=23, minute=59, second=59)
    pending = db.scalar(select(func.count()).where(Case.hospital_id == h, Case.status == "pending_review"))
    urgent = db.scalar(
        select(func.count()).where(Case.hospital_id == h, Case.status == "pending_review", Case.urgency == "urgent")
    )
    callbacks = db.scalar(
        select(func.count()).where(Case.hospital_id == h, Case.needs_callback.is_(True), Case.called_back.is_(False))
    )
    approved = db.scalar(
        select(func.count()).where(Case.hospital_id == h, Case.status == "approved", Case.reviewed_at >= day_start)
    )
    open_today = db.scalar(
        select(func.count()).where(Slot.hospital_id == h, Slot.status == "open", Slot.starts_at >= t, Slot.starts_at <= day_end)
    )
    reviewed = list(
        db.execute(
            select(Case.created_at, Case.reviewed_at).where(Case.hospital_id == h, Case.reviewed_at.is_not(None)).limit(200)
        )
    )
    avg = (
        round(sum((r - c).total_seconds() for c, r in reviewed) / len(reviewed) / 60, 1)
        if reviewed
        else None
    )
    active = db.scalar(select(func.count()).where(Dispatch.status.in_(dispatch.ACTIVE)))
    due = db.scalar(select(func.coalesce(func.sum(Charge.amount_pkr), 0)).where(Charge.status == "due"))
    free = db.scalar(select(func.count()).where(Responder.status == "available"))
    joining = db.scalar(select(func.count()).where(AmbulanceMember.status == "pending"))
    return StatsOut(
        ambulances_pending=joining,
        dues_pkr=int(due or 0),
        dispatches_active=active,
        responders_free=free,
        pending=pending,
        urgent_pending=urgent,
        callbacks_open=callbacks,
        approved_today=approved,
        open_slots_today=open_today,
        avg_review_minutes=avg,
    )


@app.get("/api/audit", response_model=list[AuditOut])
def audit_log(case_id: int | None = None, limit: int = Query(50, le=500), h: int = Depends(H), db: Session = Depends(get_db)):
    q = (select(AuditEvent).join(Case, Case.id == AuditEvent.case_id).where(Case.hospital_id == h)
         .order_by(AuditEvent.at.desc(), AuditEvent.id.desc()).limit(limit))
    if case_id is not None:
        q = q.where(AuditEvent.case_id == case_id)
    return list(db.scalars(q))


# ---------- WhatsApp Cloud API webhook ----------

@app.get("/webhook/whatsapp", response_class=PlainTextResponse)
def whatsapp_verify(request: Request):
    p = request.query_params
    if p.get("hub.mode") == "subscribe" and p.get("hub.verify_token") == settings.whatsapp_verify_token:
        return p.get("hub.challenge", "")
    raise HTTPException(403, "Verify token does not match WHATSAPP_VERIFY_TOKEN")


@app.post("/webhook/whatsapp")
async def whatsapp_inbound(request: Request, db: Session = Depends(get_db)):
    """Text messages become cases. Voice notes are best sent through n8n
    (download media -> Whisper/Groq STT -> POST /api/intake)."""
    payload = await request.json()
    created = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            names = {c.get("wa_id"): c.get("profile", {}).get("name", "") for c in value.get("contacts", [])}
            for msg in value.get("messages", []):
                if msg.get("type") == "location":
                    # "Share location" in WhatsApp: attach it to this patient's latest case.
                    latest = db.scalar(
                        select(Case).join(Case.patient).where(Patient.phone == "+" + msg["from"])
                        .order_by(Case.created_at.desc()).limit(1)
                    )
                    if latest:
                        loc = msg["location"]
                        label = loc.get("name") or loc.get("address") or ""
                        dispatch.set_location(db, latest.id, loc["latitude"], loc["longitude"], label, "whatsapp")
                    continue
                if msg.get("type") != "text":
                    continue
                phone = "+" + msg["from"]
                case = services.create_intake(
                    db, phone, names.get(msg["from"], ""), msg["text"]["body"], "whatsapp"
                )
                created.append(case.id)
    return {"received": True, "cases": created}
