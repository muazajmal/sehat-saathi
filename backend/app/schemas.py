import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class QuickIn(BaseModel):
    """One-tap answers from the patient website. Unknown keys are ignored."""
    for_whom: Literal["self", "child", "parent", "other"] | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    age_unit: Literal["years", "months"] = "years"
    symptoms: list[str] = Field(default_factory=list, max_length=10)
    answers: list[str] = Field(default_factory=list, max_length=30)
    since: Literal["today", "days", "week"] | None = None


class TranscribeIn(BaseModel):
    audio_b64: str = Field(min_length=100, max_length=3_500_000)  # about 60s of 16 kHz WAV
    mime: Literal["audio/wav"] = "audio/wav"
    ui_lang: Literal["ur", "en"] = "ur"


class IntakeIn(BaseModel):
    phone: str = Field(min_length=6, max_length=32, examples=["+923001234567"])
    name: str = Field(default="", max_length=120)
    message: str = Field(min_length=2, max_length=4000)
    channel: Literal["whatsapp", "web", "n8n"] = "web"
    # Optional: where the patient is, if they shared it with the message.
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    location_label: str = Field(default="", max_length=200)
    quick: QuickIn | None = None
    # Optional: for a "your appointment is confirmed" email.
    email: str = Field(default="", max_length=200)
    # Which hospital (its slug or id); empty = the main one.
    hospital: str = Field(default="", max_length=60)


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
    dues_pkr: int = 0
    ambulances_pending: int = 0


class LeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    clinic: str = Field(min_length=2, max_length=160)
    city: str = Field(default="", max_length=80)
    phone: str = Field(min_length=7, max_length=32)
    email: str = Field(min_length=6, max_length=200)
    size: str = Field(default="", max_length=40)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]{1,64}@[^@\s]{1,130}\.[a-zA-Z]{2,24}$", v):
            raise ValueError("Enter a valid Gmail or email address, like name@gmail.com")
        return v


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
    patient_reply: str | None = None
    attendance: str | None = None


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
    tracking_link: str = ""


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
    out_of_area: bool = False
    nearest_hospital_km: float | None = None
    responders_too_far: int = 0


class DispatchIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    responder_id: int
    hospital_id: str = Field(min_length=2, max_length=40)
    note: str = Field(default="", max_length=1000)


class DispatchStatusIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    status: Literal["reached_patient", "at_hospital", "cancelled"]
    note: str = Field(default="", max_length=1000)


class PositionIn(BaseModel):
    token: str = Field(min_length=8, max_length=64)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0, le=100000)


class TrackPointOut(BaseModel):
    lat: float
    lng: float


class TrackOut(BaseModel):
    dispatch_id: int
    status: str
    tier: str
    mode: Literal["live", "simulated", "no_signal", "finished"]
    phase: Literal["to_patient", "waiting_at_patient", "to_hospital", "at_hospital", "cancelled"]
    responder: str
    vehicle: str
    hospital: str
    position: TrackPointOut
    patient: TrackPointOut
    hospital_position: TrackPointOut
    start: TrackPointOut
    km_to_patient: float
    km_to_hospital: float
    eta_patient_min: int
    eta_hospital_min: int
    progress: float  # 0..1 along responder -> patient -> hospital
    trail: list[TrackPointOut]
    last_fix_seconds: int | None  # how old the latest GPS fix is
    updated_at: datetime


class ResponderTripOut(BaseModel):
    dispatch_id: int
    status: str
    tier: str
    responder: str
    patient: str
    patient_phone: str
    summary: str
    pickup: TrackPointOut
    pickup_label: str
    hospital: str
    hospital_position: TrackPointOut
    hospital_phone: str


# ---------- Patient-facing ----------

class IntakeOut(CaseOut):
    """What the patient (or the website demo) gets back: their case plus a private status link."""
    access_token: str
    status_link: str


class PatientLocationIn(BaseModel):
    c: int
    t: str = Field(min_length=8, max_length=64)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    label: str = Field(default="", max_length=200)


class PatientSlot(BaseModel):
    starts_at: datetime
    doctor: str


class PatientTrip(BaseModel):
    status: str
    responder: str
    vehicle: str
    hospital: str
    phase: str
    km_away: float
    eta_min: int
    mode: str
    position: dict | None = None
    start: dict | None = None
    patient: dict | None = None
    hospital_position: dict | None = None
    progress: float = 0.0


class PatientCharge(BaseModel):
    id: int
    kind: str
    description: str
    amount_pkr: int
    status: str
    method: str | None


class PatientStatusOut(BaseModel):
    case_id: int
    clinic: str
    name: str
    status: Literal["pending_review", "approved", "rejected"]
    urgency: str
    language: str
    reply: str
    call_1122: bool
    held_slot: PatientSlot | None
    booked_slot: PatientSlot | None
    called_back: bool
    location_shared: bool
    out_of_area: bool = False
    nearest_hospital_km: float | None = None
    trip: PatientTrip | None
    first_aid: list[str] = []
    email_to: str | None = None
    patient_reply: str | None = None
    attendance: str | None = None
    charges: list[PatientCharge] = []
    created_at: datetime


class ChargeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    case_id: int
    dispatch_id: int | None
    kind: str
    description: str
    amount_pkr: int
    status: str
    method: str | None
    added_by: str
    settled_by: str | None
    note: str
    created_at: datetime
    settled_at: datetime | None


class VisitChargeIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    amount_pkr: int | None = Field(default=None, ge=0, le=1_000_000)
    note: str = Field(default="", max_length=500)


class SettleIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    status: Literal["paid", "waived"]
    method: Literal["cash", "jazzcash", "easypaisa", "card", "sehat_card"] | None = None
    note: str = Field(default="", max_length=500)


class PricesOut(BaseModel):
    transport_base_pkr: int
    transport_per_km_pkr: int
    visit_fee_pkr: int


class AmbulanceIn(BaseModel):
    driver_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=r"^\+\d{10,15}$")
    organisation: str = Field(default="", max_length=120)
    vehicle_type: Literal["basic", "oxygen", "icu", "car"]
    vehicle_reg: str = Field(min_length=3, max_length=32)
    area: str = Field(min_length=2, max_length=120)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    agree: bool


class AmbulanceOut(BaseModel):
    id: int
    driver_name: str
    phone: str
    organisation: str
    vehicle_type: str
    vehicle: str
    vehicle_reg: str
    area: str
    lat: float
    lng: float
    status: str
    online: bool
    busy: bool
    review_note: str
    reviewed_by: str
    created_at: datetime
    last_seen_at: datetime | None
    trip_link: str = ""
    trip_tier: str = ""
    link: str = ""
    in_area: bool = True


class AmbulanceOnlineIn(BaseModel):
    m: int
    t: str = Field(min_length=8, max_length=64)
    online: bool
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class AmbulanceReviewIn(BaseModel):
    staff: str = Field(min_length=2, max_length=120)
    decision: Literal["approve", "reject", "suspend"]
    note: str = Field(default="", max_length=500)
