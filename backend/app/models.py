"""Database tables.

Times are stored as naive datetimes in clinic local time (CLINIC_TZ),
which keeps SQLite and Postgres behaving the same.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
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
    size: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime)
