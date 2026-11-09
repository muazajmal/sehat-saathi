"""Booking emails (sent with the clinic's Gmail through n8n).

The backend only tells n8n "case 12 was confirmed, here is its private key". n8n then asks
GET /api/email-job for the email itself, which is given out once, and only when that case really
is confirmed (or declined) and the patient left an email. So the n8n webhook can't be used to send
anything else.
"""
import html
import logging
import os
import re
import secrets

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import patient
from .config import settings
from .db import get_db
from .models import Case, CaseAccess, ContactEmail, EmailSent, Patient
from .services import now

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")
EMAIL_RX = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-zA-Z]{2,24}$")
DEFAULT_HOOK = "https://muazajmal212.app.n8n.cloud/webhook/sehat-saathi-email-7d41c9e2b8"


def valid(email: str) -> bool:
    return bool(EMAIL_RX.match(email or ""))


def save_email(db: Session, phone: str, email: str):
    email = (email or "").strip().lower()
    if not valid(email):
        return
    row = db.scalar(select(ContactEmail).where(ContactEmail.phone == phone))
    if row is None:
        db.add(ContactEmail(phone=phone, email=email, updated_at=now()))
    else:
        row.email, row.updated_at = email, now()
    db.commit()


def email_for(db: Session, phone: str) -> str | None:
    row = db.scalar(select(ContactEmail).where(ContactEmail.phone == phone))
    return row.email if row else None


def masked(email: str | None) -> str | None:
    if not email:
        return None
    user, _, dom = email.partition("@")
    return (user[:2] + "•" * max(1, len(user) - 2)) + "@" + dom


def trigger(db: Session, case: Case, kind: str):
    """After a doctor confirms or declines: ask n8n to send the email (if the patient gave one)."""
    if not email_for(db, case.patient.phone):
        return
    hook = os.getenv("N8N_EMAIL_WEBHOOK", DEFAULT_HOOK)
    if not hook or hook == "off":
        return
    try:
        httpx.post(hook, json={"case_id": case.id, "token": patient.issue_token(db, case.id), "kind": kind}, timeout=6)
    except Exception as e:
        log.warning("booking email hook failed: %s", e)


def when(dt) -> str:
    return dt.strftime("%A, %d %B %Y at %I:%M %p").replace(" 0", " ").replace("AM", "am").replace("PM", "pm")


def build(case: Case, kind: str, link: str) -> tuple[str, str]:
    e = html.escape
    name = e(case.patient.name or "")
    clinic = e(settings.clinic_name)
    slot = case.proposed_slot
    hello_en = f"Assalam-o-Alaikum{', ' + name if name else ''},"
    hello_ur = f"السلام علیکم{('، ' + name) if name else ''}،"
    if kind == "confirmed":
        subject = f"Appointment confirmed: {slot.doctor}, {when(slot.starts_at)}"
        rows = (f"<tr><td style='color:#5c7470;padding:6px 0'>Doctor</td><td style='padding:6px 0'><b>{e(slot.doctor)}</b></td></tr>"
                f"<tr><td style='color:#5c7470;padding:6px 0'>When</td><td style='padding:6px 0'><b>{e(when(slot.starts_at))}</b></td></tr>"
                f"<tr><td style='color:#5c7470;padding:6px 0'>Where</td><td style='padding:6px 0'><b>{clinic}</b></td></tr>"
                f"<tr><td style='color:#5c7470;padding:6px 0'>Confirmed by</td><td style='padding:6px 0'>{e(case.reviewed_by or 'the clinic')}</td></tr>")
        en = (f"<p>{hello_en}</p><p>Your appointment is <b>confirmed</b>. A doctor has checked your request and booked this time for you:</p>"
              f"<table style='border-collapse:collapse;margin:8px 0 14px'>{rows}</table>"
              "<p>Please arrive 10 minutes early and bring your ID card and any old reports or medicines.</p>")
        ur = (f"<p>{hello_ur}</p><p>آپ کی اپائنٹمنٹ <b>کنفرم</b> ہو گئی ہے۔ ڈاکٹر نے آپ کی درخواست دیکھ کر یہ وقت طے کیا ہے:</p>"
              f"<p><b>{e(slot.doctor)}</b><br>{e(when(slot.starts_at))}<br>{clinic}</p>"
              "<p>براہ کرم 10 منٹ پہلے آئیں اور شناختی کارڈ، پرانی رپورٹس یا دوائیں ساتھ لائیں۔</p>")
        head = "Appointment confirmed ✓"
    else:
        subject = f"About your request to {settings.clinic_name}"
        note = e(case.review_note or "")
        en = (f"<p>{hello_en}</p><p>A doctor has looked at your request and we couldn't book a visit this time.</p>"
              + (f"<p><b>Note from the clinic:</b> {note}</p>" if note else "")
              + "<p>Open your request to read the reply or send a new one.</p>")
        ur = (f"<p>{hello_ur}</p><p>ڈاکٹر نے آپ کی درخواست دیکھی، لیکن اس بار وقت طے نہیں ہو سکا۔</p>"
              "<p>جواب پڑھنے یا نئی درخواست بھیجنے کے لیے اپنی درخواست کھولیں۔</p>")
        head = "About your request"
    body = f"""<!doctype html><html><body style="margin:0;background:#eef4f2;font-family:Arial,Helvetica,sans-serif;color:#0d1f1c">
<div style="max-width:560px;margin:0 auto;padding:20px 12px">
 <div style="background:#05302a;color:#eaf5f2;border-radius:16px 16px 0 0;padding:18px 22px">
  <div style="font-size:18px;font-weight:bold">Sehat Saathi <span style="color:#5fe3c4">· صحت ساتھی</span></div>
  <div style="font-size:22px;font-weight:bold;margin-top:8px">{head}</div>
 </div>
 <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:18px 22px;line-height:1.55;font-size:15px">
  {en}
  <p style="margin:18px 0"><a href="{e(link)}" style="background:#0b8f78;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold;display:inline-block">Open my request</a></p>
  <hr style="border:0;border-top:1px solid #dfe9e6;margin:18px 0">
  <div dir="rtl" style="text-align:right;font-size:16px;line-height:1.9">{ur}</div>
  <hr style="border:0;border-top:1px solid #dfe9e6;margin:18px 0">
  <p style="font-size:13px;color:#5c7470;margin:0">In an emergency, call <b>1122</b>. Sehat Saathi does not diagnose; your doctor decides.<br>
  ایمرجنسی میں 1122 پر کال کریں۔</p>
 </div>
 <p style="font-size:12px;color:#7a8f8b;text-align:center">You got this because you gave this email when asking {clinic} for help.</p>
</div></body></html>"""
    return subject, body


@router.get("/email-job")
def email_job(c: int, t: str, kind: str, db: Session = Depends(get_db)):
    """For the n8n booking-email workflow only. Empty unless there is exactly one email to send."""
    access = db.scalar(select(CaseAccess).where(CaseAccess.case_id == c))
    case = db.get(Case, c)
    if case is None or access is None or not secrets.compare_digest(access.token, t):
        return {}
    if not ((kind == "confirmed" and case.status == "approved" and case.proposed_slot is not None)
            or (kind == "declined" and case.status == "rejected")):
        return {}
    to = email_for(db, case.patient.phone)
    if not to:
        return {}
    db.add(EmailSent(key=f"case:{c}:{kind}", to=to, at=now()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {}
    subject, body = build(case, kind, patient.status_link(case.id, t))
    return {"to": to, "subject": subject, "html": body}
