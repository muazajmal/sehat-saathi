"""Business rules. The one rule that matters:

    Sehat Saathi never diagnoses and never confirms a booking. A doctor does.

The AI may only *hold* a slot and *suggest* an urgency. Booking, rejecting
and closing a callback all require a named staff member.
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import notify
from .config import settings
from .models import AuditEvent, Case, Patient, Slot
from .languages import reply
from .triage import triage


def now() -> datetime:
    return datetime.now(settings.tz).replace(tzinfo=None, microsecond=0)


def audit(db: Session, actor: str, action: str, detail: str = "", case_id: int | None = None):
    db.add(AuditEvent(case_id=case_id, actor=actor, action=action, detail=detail, at=now()))


def _end_of_today() -> datetime:
    t = now()
    return t.replace(hour=23, minute=59, second=59)


def find_slot(db: Session, urgency: str, specialty: str) -> Slot | None:
    """Earliest open slot that fits the urgency. Prefers the right specialty."""
    q = select(Slot).where(Slot.status == "open", Slot.starts_at >= now()).order_by(Slot.starts_at)
    if urgency in ("urgent", "today"):
        q = q.where(Slot.starts_at <= _end_of_today())
    slots = list(db.scalars(q))
    if not slots:
        return None
    for s in slots:
        if s.specialty == specialty:
            return s
    return slots[0]


def case_payload(case: Case) -> dict:
    return {
        "id": case.id,
        "phone": case.patient.phone,
        "name": case.patient.name,
        "urgency": case.urgency,
        "summary": case.summary,
        "red_flags": case.red_flags,
        "message": case.message,
    }


def create_intake(db: Session, phone: str, name: str, message: str, channel: str) -> Case:
    patient = db.scalar(select(Patient).where(Patient.phone == phone))
    if patient is None:
        patient = Patient(phone=phone, name=name or "", created_at=now())
        db.add(patient)
        db.flush()
    elif name and not patient.name:
        patient.name = name

    result = triage(message)

    case = Case(
        patient_id=patient.id,
        channel=channel,
        message=message,
        language=result.language,
        urgency=result.urgency,
        summary=result.summary,
        red_flags=result.red_flags,
        specialty=result.specialty,
        reply_ur=result.reply_ur,
        engine=result.engine,
        confidence=result.confidence,
        needs_callback=result.urgency == "urgent",
        created_at=now(),
    )
    slot = find_slot(db, result.urgency, result.specialty)
    if slot:
        slot.status = "held"
        case.proposed_slot_id = slot.id
    db.add(case)
    db.flush()

    audit(db, "ai", "triaged", f"{result.urgency} via {result.engine}", case.id)
    if slot:
        audit(db, "ai", "slot_held", f"{slot.doctor} {slot.starts_at:%a %H:%M}", case.id)
    db.commit()
    db.refresh(case)

    notify.send_whatsapp(patient.phone, result.reply_ur)
    if case.needs_callback:
        if notify.escalate(case_payload(case)):
            audit(db, "system", "escalated", "Duty doctor alerted for a call-back (n8n)", case.id)
        else:
            audit(db, "system", "escalation_pending", "Call-back needed. Alert not sent; desk shows it at the top.", case.id)
        db.commit()
    return case


def get_case(db: Session, case_id: int) -> Case:
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(404, f"Case {case_id} not found")
    return case


def _require_pending(case: Case):
    if case.status != "pending_review":
        raise HTTPException(409, f"Case {case.id} is already {case.status.replace('_', ' ')}")


def approve(db: Session, case_id: int, staff: str, slot_id: int | None, note: str) -> Case:
    case = get_case(db, case_id)
    _require_pending(case)

    if slot_id and slot_id != case.proposed_slot_id:
        new_slot = db.get(Slot, slot_id)
        if new_slot is None or new_slot.status != "open":
            raise HTTPException(409, "That slot is no longer open. Pick another.")
        if case.proposed_slot:
            case.proposed_slot.status = "open"
        new_slot.status = "held"
        case.proposed_slot_id = new_slot.id
        db.flush()
        db.refresh(case)

    if case.proposed_slot is None:
        raise HTTPException(409, "No slot attached. Choose a slot before approving.")

    case.proposed_slot.status = "booked"
    case.status = "approved"
    case.reviewed_by = staff
    case.review_note = note or None
    case.reviewed_at = now()
    s = case.proposed_slot
    audit(db, staff, "approved", f"Booked {s.doctor} {s.starts_at:%a %d %b %H:%M}. {note}".strip(), case.id)
    db.commit()

    notify.send_whatsapp(
        case.patient.phone,
        reply(
            "confirmed",
            case.language,
            date=f"{s.starts_at:%d-%m-%Y}",
            time=f"{s.starts_at:%I:%M %p}",
            doctor=s.doctor,
            clinic=settings.clinic_name,
        ),
    )
    return case


def reject(db: Session, case_id: int, staff: str, note: str) -> Case:
    case = get_case(db, case_id)
    _require_pending(case)
    if case.proposed_slot:
        case.proposed_slot.status = "open"
    case.status = "rejected"
    case.reviewed_by = staff
    case.review_note = note
    case.reviewed_at = now()
    audit(db, staff, "rejected", note, case.id)
    db.commit()
    notify.send_whatsapp(case.patient.phone, reply("declined", case.language))
    return case


def mark_called(db: Session, case_id: int, staff: str, note: str) -> Case:
    case = get_case(db, case_id)
    if not case.needs_callback:
        raise HTTPException(409, "This case was not flagged for a call-back.")
    if case.called_back:
        raise HTTPException(409, "Call-back already logged.")
    case.called_back = True
    audit(db, staff, "called_back", note, case.id)
    db.commit()
    return case
