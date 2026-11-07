from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class IntakeIn(BaseModel):
    phone: str = Field(min_length=6, max_length=32, examples=["+923001234567"])
    name: str = Field(default="", max_length=120)
    message: str = Field(min_length=2, max_length=4000)
    channel: Literal["whatsapp", "web", "n8n"] = "web"


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    doctor: str
    specialty: str
    starts_at: datetime
    minutes: int
    status: str


class SlotIn(BaseModel):
    doctor: str = Field(min_length=2, max_length=120)
    specialty: str = "general"
    starts_at: datetime
    minutes: int = Field(default=15, ge=5, le=120)


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    phone: str
    name: str


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient: PatientOut
    channel: str
    message: str
    language: str
    urgency: str
    summary: str
    red_flags: list[str]
    specialty: str
    reply_ur: str
    engine: str
    confidence: float
    status: str
    needs_callback: bool
    called_back: bool
    proposed_slot: SlotOut | None
    reviewed_by: str | None
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class ApproveIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    slot_id: int | None = None  # pick a different slot than the AI proposed
    note: str = Field(default="", max_length=1000)


class RejectIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    note: str = Field(min_length=2, max_length=1000)


class CallbackIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    note: str = Field(default="", max_length=1000)


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    case_id: int | None
    actor: str
    action: str
    detail: str
    at: datetime


class StatsOut(BaseModel):
    pending: int
    urgent_pending: int
    callbacks_open: int
    approved_today: int
    open_slots_today: int
    avg_review_minutes: float | None


class LeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    clinic: str = Field(min_length=2, max_length=160)
    city: str = Field(default="", max_length=80)
    phone: str = Field(min_length=7, max_length=32)
    size: str = Field(default="", max_length=40)


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    clinic: str
    created_at: datetime


class ScheduleSlot(BaseModel):
    id: int
    doctor: str
    specialty: str
    starts_at: datetime
    minutes: int
    status: str
    case_id: int | None = None
    patient: str | None = None
    urgency: str | None = None
