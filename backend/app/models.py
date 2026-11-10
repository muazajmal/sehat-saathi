"""Database tables.

Times are stored as naive datetimes in clinic local time (CLINIC_TZ),
which keeps SQLite and Postgres behaving the same.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)

    cases: Mapped[list["Case"]] = relationship(back_populates="patient")


class Slot(Base):
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doctor: Mapped[str] = mapped_column(String(120))
    specialty: Mapped[str] = mapped_column(String(60), default="general")
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    minutes: Mapped[int] = mapped_column(Integer, default=15)
    # open -> held (AI proposed it) -> booked (doctor approved)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    hospital_id: Mapped[int] = mapped_column(Integer, default=1, server_default="1", index=True)


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    channel: Mapped[str] = mapped_column(String(16), default="whatsapp")
    message: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(16), default="ur")

    # AI suggestion (never final)
    urgency: Mapped[str] = mapped_column(String(16), index=True)  # urgent | today | routine
    summary: Mapped[str] = mapped_column(Text, default="")
    red_flags: Mapped[list] = mapped_column(JSON, default=list)
    specialty: Mapped[str] = mapped_column(String(60), default="general")
    reply_ur: Mapped[str] = mapped_column(Text, default="")
    engine: Mapped[str] = mapped_column(String(32), default="rules")
    confidence: Mapped[float] = mapped_column(default=0.0)

    # Human decision
    # pending_review | approved | rejected
    status: Mapped[str] = mapped_column(String(20), default="pending_review", index=True)
    needs_callback: Mapped[bool] = mapped_column(Boolean, default=False)
    called_back: Mapped[bool] = mapped_column(Boolean, default=False)
    proposed_slot_id: Mapped[int | None] = mapped_column(ForeignKey("slots.id"), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hospital_id: Mapped[int] = mapped_column(Integer, default=1, server_default="1", index=True)
    # No-shows: the patient's answer to reminders, and whether they came (marked by staff).
    patient_reply: Mapped[str | None] = mapped_column(String(12), nullable=True)  # coming | cancelled
    patient_reply_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    attendance: Mapped[str | None] = mapped_column(String(12), nullable=True)  # arrived | no_show

    patient: Mapped[Patient] = relationship(back_populates="cases")
    proposed_slot: Mapped[Slot | None] = relationship()


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(120))  # "ai", "system" or a staff name
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(DateTime, index=True)


class Lead(Base):
    """A "Book a demo" request from the website."""

    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    clinic: Mapped[str] = mapped_column(String(160))
    city: Mapped[str] = mapped_column(String(80), default="")
    phone: Mapped[str] = mapped_column(String(32))
    email: Mapped[str] = mapped_column(String(200), default="")
    size: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)


class Responder(Base):
    """A Sehat Saathi responder who can take patients to hospital (demo team for now)."""

    __tablename__ = "responders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(32), default="")
    vehicle: Mapped[str] = mapped_column(String(60), default="Car")
    area: Mapped[str] = mapped_column(String(120), default="")
    lat: Mapped[float] = mapped_column()
    lng: Mapped[float] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="available", index=True)  # available | busy | off
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class CaseLocation(Base):
    """Where the patient is, shared from WhatsApp or the website. One per case (latest wins)."""

    __tablename__ = "case_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), unique=True, index=True)
    lat: Mapped[float] = mapped_column()
    lng: Mapped[float] = mapped_column()
    label: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(20), default="web")  # web | whatsapp | sample | staff
    at: Mapped[datetime] = mapped_column(DateTime)


class Dispatch(Base):
    """A staff-approved trip: responder -> patient -> government hospital."""

    __tablename__ = "dispatches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    responder_id: Mapped[int] = mapped_column(ForeignKey("responders.id"))
    hospital_id: Mapped[str] = mapped_column(String(40))
    tier: Mapped[str] = mapped_column(String(16))  # emergency (1122 first) | transport
    # dispatched -> reached_patient -> at_hospital, or cancelled
    status: Mapped[str] = mapped_column(String(20), default="dispatched", index=True)
    eta_minutes: Mapped[int] = mapped_column(Integer, default=0)
    approved_by: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    responder: Mapped[Responder] = relationship()


class DispatchAccess(Base):
    """Private link for the responder's phone. Only someone with the token can post positions."""

    __tablename__ = "dispatch_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("dispatches.id"), unique=True, index=True)
    token: Mapped[str] = mapped_column(String(64))


class TrackPoint(Base):
    """A GPS position from the responder's phone during a trip."""

    __tablename__ = "track_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("dispatches.id"), index=True)
    lat: Mapped[float] = mapped_column()
    lng: Mapped[float] = mapped_column()
    accuracy_m: Mapped[float | None] = mapped_column(nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime, index=True)


class CaseAccess(Base):
    """Private status link for the patient. Only someone with the token sees their own case."""

    __tablename__ = "case_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), unique=True, index=True)
    token: Mapped[str] = mapped_column(String(64))


class Charge(Base):
    """A fee, only ever added AFTER help was given (trip finished or visit booked). Staff can waive it."""

    __tablename__ = "charges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id"), index=True)
    dispatch_id: Mapped[int | None] = mapped_column(ForeignKey("dispatches.id"), nullable=True, unique=True)
    kind: Mapped[str] = mapped_column(String(16))  # transport | visit
    description: Mapped[str] = mapped_column(String(200), default="")
    amount_pkr: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), default="due", index=True)  # due | paid | waived
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)  # cash | jazzcash | easypaisa | card | sehat_card
    added_by: Mapped[str] = mapped_column(String(120))
    settled_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AmbulanceMember(Base):
    """A local ambulance or driver who signed up on the website (like a ride app driver).

    Stays 'pending' until clinic staff check the papers and approve. Approval creates
    a Responder, so approved members show up in dispatch next to the demo team.
    """

    __tablename__ = "ambulance_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    driver_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    organisation: Mapped[str] = mapped_column(String(120), default="")
    vehicle_type: Mapped[str] = mapped_column(String(24))  # basic | oxygen | icu | car
    vehicle_reg: Mapped[str] = mapped_column(String(32))
    area: Mapped[str] = mapped_column(String(120))
    lat: Mapped[float] = mapped_column()
    lng: Mapped[float] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)  # pending|approved|rejected|suspended
    token: Mapped[str] = mapped_column(String(64))
    responder_id: Mapped[int | None] = mapped_column(ForeignKey("responders.id"), nullable=True)
    reviewed_by: Mapped[str] = mapped_column(String(120), default="")
    review_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    responder = relationship("Responder")


class Account(Base):
    """A login. Roles: admin (runs the hospital desk, adds doctors), doctor (decides on cases),
    patient (a local person who sees their own requests). Patients link to their cases by phone."""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[str] = mapped_column(String(16), index=True)  # admin | doctor | patient
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    hospital: Mapped[str] = mapped_column(String(160), default="")
    specialty: Mapped[str] = mapped_column(String(60), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hospital_id: Mapped[int] = mapped_column(Integer, default=1, server_default="1", index=True)


# ---------- Community features: notifications, area alerts, blood donors, medicines, elder check-ins ----------


class Notification(Base):
    """In-app inbox message (also pushed to the phone and to the n8n hook when set up)."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(24))  # alert | blood | medicine | elder | booking
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text, default="")
    title_ur: Mapped[str] = mapped_column(String(200), default="")
    body_ur: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(400), default="")
    dedupe: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class PushSub(Base):
    """A phone that agreed to notifications. Owner is a phone number (patient, donor, family) or an elder."""

    __tablename__ = "push_subs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner: Mapped[str] = mapped_column(String(48), index=True)  # "phone:+92..." or "elder:12"
    endpoint: Mapped[str] = mapped_column(String(600), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(80))
    lang: Mapped[str] = mapped_column(String(4), default="ur")
    created_at: Mapped[datetime] = mapped_column(DateTime)


class SampleSignal(Base):
    """Past cases used only to demo area alerts (never shown on the desk)."""

    __tablename__ = "sample_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    area: Mapped[str] = mapped_column(String(60), index=True)
    group: Mapped[str] = mapped_column(String(24))
    at: Mapped[datetime] = mapped_column(DateTime, index=True)


class AreaAlert(Base):
    __tablename__ = "area_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    area: Mapped[str] = mapped_column(String(60), index=True)
    group: Mapped[str] = mapped_column(String(24))
    level: Mapped[str] = mapped_column(String(12), default="watch")  # watch | alert
    cases_week: Mapped[int] = mapped_column(Integer, default=0)
    baseline_week: Mapped[float] = mapped_column(default=0.0)
    title_en: Mapped[str] = mapped_column(String(200), default="")
    body_en: Mapped[str] = mapped_column(Text, default="")
    title_ur: Mapped[str] = mapped_column(String(200), default="")
    body_ur: Mapped[str] = mapped_column(Text, default="")
    drafted_by: Mapped[str] = mapped_column(String(40), default="template")  # template | gemini model
    status: Mapped[str] = mapped_column(String(12), default="draft", index=True)  # draft | published | closed
    approved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hospital_id: Mapped[int] = mapped_column(Integer, default=1, server_default="1", index=True)


class Donor(Base):
    __tablename__ = "donors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    blood_group: Mapped[str] = mapped_column(String(4), index=True)
    area: Mapped[str] = mapped_column(String(60), default="")
    lat: Mapped[float | None] = mapped_column(nullable=True)
    lng: Mapped[float | None] = mapped_column(nullable=True)
    last_donated: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    token: Mapped[str] = mapped_column(String(64), index=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"), nullable=True)
    blood_group: Mapped[str] = mapped_column(String(4))
    units: Mapped[int] = mapped_column(Integer, default=1)
    hospital: Mapped[str] = mapped_column(String(160))
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="open")  # open | filled | closed
    created_by: Mapped[str] = mapped_column(String(120), default="")
    hospital_id: Mapped[int] = mapped_column(Integer, default=1, server_default="1", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class BloodAsk(Base):
    __tablename__ = "blood_asks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("blood_requests.id"), index=True)
    donor_id: Mapped[int] = mapped_column(ForeignKey("donors.id"))
    answer: Mapped[str] = mapped_column(String(12), default="waiting")  # waiting | yes | no | donated
    km: Mapped[float | None] = mapped_column(nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    donor: Mapped["Donor"] = relationship()


class Medicine(Base):
    """A medicine from the patient's own prescription. Doses are as the doctor wrote them."""

    __tablename__ = "medicines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    dose: Mapped[str] = mapped_column(String(160), default="")
    times: Mapped[list] = mapped_column(JSON, default=list)  # ["08:00", "21:00"]
    with_food: Mapped[str] = mapped_column(String(12), default="any")  # before | after | any
    instructions_ur: Mapped[str] = mapped_column(Text, default="")
    instructions_en: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[datetime] = mapped_column(DateTime)
    days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(12), default="manual")  # photo | manual
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class DoseLog(Base):
    __tablename__ = "dose_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicines.id"), index=True)
    day: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD
    time: Mapped[str] = mapped_column(String(5))  # HH:MM
    taken_at: Mapped[datetime] = mapped_column(DateTime)


class Elder(Base):
    """An older person living alone, added by a family member, who checks in once a day."""

    __tablename__ = "elders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    family_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(32), default="")
    checkin_time: Mapped[str] = mapped_column(String(5), default="09:00")
    grace_min: Mapped[int] = mapped_column(Integer, default=120)
    lang: Mapped[str] = mapped_column(String(4), default="ur")
    token: Mapped[str] = mapped_column(String(64), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    # Elder sign-in and the medical card the hospital sees when the emergency button is pressed.
    pin_hash: Mapped[str] = mapped_column(String(200), default="", server_default="")
    age: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    conditions: Mapped[str] = mapped_column(String(300), default="", server_default="")
    medicines: Mapped[str] = mapped_column(String(300), default="", server_default="")
    allergies: Mapped[str] = mapped_column(String(200), default="", server_default="")
    blood_group: Mapped[str] = mapped_column(String(4), default="", server_default="")


class ElderGuardian(Base):
    """An extra guardian (son, daughter, neighbour) told when the elder presses the emergency button.
    The family member who added the elder is always a guardian too."""

    __tablename__ = "elder_guardians"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    elder_id: Mapped[int] = mapped_column(ForeignKey("elders.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    relation: Mapped[str] = mapped_column(String(40), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    token: Mapped[str] = mapped_column(String(64), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class SosEvent(Base):
    """One press of the elder's emergency button. waiting -> okay | help | no_response -> resolved."""

    __tablename__ = "sos_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    elder_id: Mapped[int] = mapped_column(ForeignKey("elders.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    respond_by: Mapped[datetime] = mapped_column(DateTime, index=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[str] = mapped_column(String(120), default="")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    case_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    elder_id: Mapped[int] = mapped_column(ForeignKey("elders.id"), index=True)
    day: Mapped[str] = mapped_column(String(10), index=True)
    status: Mapped[str] = mapped_column(String(8))  # ok | help
    at: Mapped[datetime] = mapped_column(DateTime)


class ContactEmail(Base):
    """A patient's email for booking confirmations (optional; given on the request form or at sign-up)."""

    __tablename__ = "contact_emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class EmailSent(Base):
    """One row per email actually handed to Gmail, so each booking email goes out only once."""

    __tablename__ = "emails_sent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True)  # "case:12:confirmed"
    to: Mapped[str] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime)



class Tenant(Base):
    """A hospital or clinic using Sehat Saathi. Its staff, slots and cases are kept apart from others."""

    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    city: Mapped[str] = mapped_column(String(80), default="Multan")
    address: Mapped[str] = mapped_column(String(240), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)  # pending | active | suspended
    created_at: Mapped[datetime] = mapped_column(DateTime)


class EmailJob(Base):
    """An email waiting for the n8n Gmail workflow to pick it up (given out once)."""

    __tablename__ = "email_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64))
    key: Mapped[str] = mapped_column(String(100), unique=True)  # one email per purpose, e.g. "case:12:confirmed"
    to: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(240))
    html: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ResetToken(Base):
    __tablename__ = "reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Attempt(Base):
    """For rate limits: one row per attempt at something that can be abused (login, sign-up, requests)."""

    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(120), index=True)
    at: Mapped[datetime] = mapped_column(DateTime, index=True)
