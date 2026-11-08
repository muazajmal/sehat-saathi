from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class IntakeIn(BaseModel):
    phone: str = Field(min_length=6, max_length=32, examples=["+923001234567"])
    name: str = Field(default="", max_length=120)
    message: str = Field(min_length=2, max_length=4000)
    channel: Literal["whatsapp", "web", "n8n"] = "web"
    # Optional: where the patient is, if they shared it with the message.
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    location_label: str = Field(default="", max_length=200)


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
    dispatches_active: int = 0
    responders_free: int = 0


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


# ---------- Getting patients to hospital ----------

class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    label: str = Field(default="", max_length=200)
    source: Literal["web", "whatsapp", "sample", "staff"] = "web"


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    lat: float
    lng: float
    label: str
    source: str
    at: datetime


class ResponderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    phone: str
    vehicle: str
    area: str
    lat: float
    lng: float
    status: str
    is_demo: bool


class ResponderOption(ResponderOut):
    distance_km: float
    eta_minutes: int


class HospitalOption(BaseModel):
    id: str
    name: str
    short: str
    area: str
    lat: float
    lng: float
    specialties: list[str]
    phone: str
    distance_km: float
    eta_minutes: int
    match: bool


class DispatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    case_id: int
    responder: ResponderOut
    hospital_id: str
    hospital_name: str = ""
    tier: str
    status: str
    eta_minutes: int
    approved_by: str
    note: str
    created_at: datetime
    updated_at: datetime


class TransportOut(BaseModel):
    case_id: int
    tier: Literal["emergency", "transport"]
    call_1122: bool
    need: str
    reason: str
    location: LocationOut | None
    hospitals: list[HospitalOption]
    responders: list[ResponderOption]
    dispatch: DispatchOut | None


class DispatchIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    responder_id: int
    hospital_id: str = Field(min_length=2, max_length=40)
    note: str = Field(default="", max_length=1000)


class DispatchStatusIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    status: Literal["reached_patient", "at_hospital", "cancelled"]
    note: str = Field(default="", max_length=1000)
