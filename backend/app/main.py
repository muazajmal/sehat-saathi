"""Sehat Saathi API.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import dispatch, services, transport
from .config import settings
from .db import Base, engine, get_db
from .models import AuditEvent, Case, Dispatch, Lead, Patient, Responder, Slot
from .schemas import (
    ApproveIn,
    AuditOut,
    CallbackIn,
    CaseOut,
    DispatchIn,
    DispatchOut,
    DispatchStatusIn,
    IntakeIn,
    LocationIn,
    LocationOut,
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
    if os.getenv("SEED_DEMO", "1") == "1":
        from .seed import seed

        seed()


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_methods=["*"],
    allow_headers=["*"],
)

URGENCY_ORDER = {"urgent": 0, "today": 1, "routine": 2}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "clinic": settings.clinic_name,
        "ai": settings.gemini_model if settings.gemini_api_key else "rules-only",
        "whatsapp": bool(settings.whatsapp_token),
    }


# ---------- Intake ----------

@app.post("/api/intake", response_model=CaseOut, status_code=201)
def intake(body: IntakeIn, db: Session = Depends(get_db)):
    """A patient message from any channel (web demo, n8n, WhatsApp webhook)."""
    case = services.create_intake(db, body.phone.strip(), body.name.strip(), body.message.strip(), body.channel)
    if body.lat is not None and body.lng is not None:
        dispatch.set_location(db, case.id, body.lat, body.lng, body.location_label, "web")
    return case


@app.post("/api/triage/preview")
def triage_preview(body: IntakeIn):
    """Triage without saving anything. Handy for testing prompts."""
    return {"final": triage(body.message).to_dict(), "rules_only": rules_triage(body.message).to_dict()}


# ---------- Cases ----------

@app.get("/api/cases", response_model=list[CaseOut])
def list_cases(
    status: Literal["pending_review", "approved", "rejected", "all"] = "pending_review",
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    q = select(Case).order_by(Case.created_at.desc()).limit(limit)
    if status != "all":
        q = q.where(Case.status == status)
    cases = list(db.scalars(q))
    if status == "pending_review":
        cases.sort(key=lambda c: (URGENCY_ORDER.get(c.urgency, 3), c.created_at))
    return cases


@app.get("/api/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db)):
    return services.get_case(db, case_id)


@app.post("/api/cases/{case_id}/approve", response_model=CaseOut)
def approve_case(case_id: int, body: ApproveIn, db: Session = Depends(get_db)):
    return services.approve(db, case_id, body.staff, body.slot_id, body.note)


@app.post("/api/cases/{case_id}/reject", response_model=CaseOut)
def reject_case(case_id: int, body: RejectIn, db: Session = Depends(get_db)):
    return services.reject(db, case_id, body.staff, body.note)


@app.post("/api/cases/{case_id}/called", response_model=CaseOut)
def log_callback(case_id: int, body: CallbackIn, db: Session = Depends(get_db)):
    return services.mark_called(db, case_id, body.staff, body.note)


# ---------- Slots ----------

@app.get("/api/slots", response_model=list[SlotOut])
def list_slots(
    status: Literal["open", "held", "booked", "all"] = "open",
    days: int = Query(2, ge=1, le=14),
    db: Session = Depends(get_db),
):
    start = services.now()
    q = (
        select(Slot)
        .where(Slot.starts_at >= start, Slot.starts_at <= start + timedelta(days=days))
        .order_by(Slot.starts_at)
    )
    if status != "all":
        q = q.where(Slot.status == status)
    return list(db.scalars(q))


@app.post("/api/slots", response_model=SlotOut, status_code=201)
def add_slot(body: SlotIn, db: Session = Depends(get_db)):
    slot = Slot(**body.model_dump(), status="open")
    slot.starts_at = slot.starts_at.replace(tzinfo=None)
    db.add(slot)
    db.commit()
    return slot


@app.get("/api/schedule", response_model=list[ScheduleSlot])
def schedule(day: date | None = None, db: Session = Depends(get_db)):
    """Every slot for one day, with the patient attached to held or booked ones."""
    d = day or services.now().date()
    start = datetime.combine(d, datetime.min.time())
    slots = list(
        db.scalars(
            select(Slot)
            .where(Slot.starts_at >= start, Slot.starts_at < start + timedelta(days=1))
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
            )
        )
    return out


# ---------- Getting patients to hospital ----------

@app.post("/api/cases/{case_id}/location", response_model=LocationOut)
def share_location(case_id: int, body: LocationIn, db: Session = Depends(get_db)):
    return dispatch.set_location(db, case_id, body.lat, body.lng, body.label, body.source)


@app.get("/api/cases/{case_id}/transport", response_model=TransportOut)
def transport_options(case_id: int, db: Session = Depends(get_db)):
    """Suggested government hospital and nearest free responder. Staff decide."""
    return dispatch.options(db, case_id)


@app.post("/api/cases/{case_id}/dispatch", response_model=DispatchOut, status_code=201)
def send_responder(case_id: int, body: DispatchIn, db: Session = Depends(get_db)):
    return dispatch.send(db, case_id, body.staff, body.responder_id, body.hospital_id, body.note)


@app.post("/api/dispatches/{dispatch_id}/status", response_model=DispatchOut)
def dispatch_status(dispatch_id: int, body: DispatchStatusIn, db: Session = Depends(get_db)):
    return dispatch.update_status(db, dispatch_id, body.staff, body.status, body.note)


@app.get("/api/responders", response_model=list[ResponderOut])
def responders(db: Session = Depends(get_db)):
    return list(db.scalars(select(Responder).order_by(Responder.id)))


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
def create_lead(body: LeadIn, db: Session = Depends(get_db)):
    """"Book a demo" form on the website."""
    lead = Lead(**body.model_dump(), created_at=services.now())
    db.add(lead)
    db.commit()
    logging.getLogger("sehat.leads").info("New demo request: %s, %s", lead.name, lead.clinic)
    return lead


# ---------- Dashboard ----------

@app.get("/api/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    t = services.now()
    day_start = t.replace(hour=0, minute=0, second=0)
    day_end = t.replace(hour=23, minute=59, second=59)
    pending = db.scalar(select(func.count()).where(Case.status == "pending_review"))
    urgent = db.scalar(
        select(func.count()).where(Case.status == "pending_review", Case.urgency == "urgent")
    )
    callbacks = db.scalar(
        select(func.count()).where(Case.needs_callback.is_(True), Case.called_back.is_(False))
    )
    approved = db.scalar(
        select(func.count()).where(Case.status == "approved", Case.reviewed_at >= day_start)
    )
    open_today = db.scalar(
        select(func.count()).where(Slot.status == "open", Slot.starts_at >= t, Slot.starts_at <= day_end)
    )
    reviewed = list(
        db.execute(
            select(Case.created_at, Case.reviewed_at).where(Case.reviewed_at.is_not(None)).limit(200)
        )
    )
    avg = (
        round(sum((r - c).total_seconds() for c, r in reviewed) / len(reviewed) / 60, 1)
        if reviewed
        else None
    )
    active = db.scalar(select(func.count()).where(Dispatch.status.in_(dispatch.ACTIVE)))
    free = db.scalar(select(func.count()).where(Responder.status == "available"))
    return StatsOut(
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
def audit_log(case_id: int | None = None, limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    q = select(AuditEvent).order_by(AuditEvent.at.desc(), AuditEvent.id.desc()).limit(limit)
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
