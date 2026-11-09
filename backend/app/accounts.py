"""Login, patient sign-up, the patient's own requests, and the admin's team page."""
import os
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import auth, patient as patient_view
from .config import settings
from .db import get_db
from .models import Account, Case, Patient, Slot
from .services import now

router = APIRouter(prefix="/api")


class LoginIn(BaseModel):
    phone: str = Field(min_length=6, max_length=32)
    password: str = Field(min_length=1, max_length=200)
    # Which door they used. A patient can't log in through the hospital door, and the other way round.
    portal: Literal["patient", "staff"] = "patient"


class SignupIn(BaseModel):
    phone: str = Field(min_length=6, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6, max_length=200)
    email: str = Field(default="", max_length=200)


class AccountOut(BaseModel):
    id: int
    role: str
    phone: str
    name: str
    hospital: str
    specialty: str
    active: bool


class SessionOut(BaseModel):
    token: str
    account: AccountOut


class StaffIn(BaseModel):
    role: Literal["doctor", "admin"] = "doctor"
    phone: str = Field(min_length=6, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6, max_length=200)
    specialty: str = Field(default="general", max_length=60)
    add_slots: bool = True


class ActiveIn(BaseModel):
    active: bool


class PasswordIn(BaseModel):
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=6, max_length=200)


class ResetIn(BaseModel):
    new_password: str = Field(min_length=6, max_length=200)


def out(a: Account) -> AccountOut:
    return AccountOut(id=a.id, role=a.role, phone=a.phone, name=a.name, hospital=a.hospital,
                      specialty=a.specialty, active=a.active)


def session(a: Account) -> SessionOut:
    return SessionOut(token=auth.make_token(a), account=out(a))


def create(db: Session, role: str, phone: str, name: str, password: str, specialty: str = "") -> Account:
    if auth.find(db, phone):
        raise HTTPException(409, "An account with this phone number already exists. Please log in.")
    a = Account(role=role, phone=phone, name=name.strip(), password_hash=auth.hash_password(password),
                hospital=settings.clinic_name if role != "patient" else "", specialty=specialty,
                active=True, created_at=now())
    db.add(a)
    db.commit()
    return a


@router.post("/auth/login", response_model=SessionOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    a = auth.find(db, auth.normalize_phone(body.phone))
    if a is None or not auth.check_password(body.password, a.password_hash):
        raise HTTPException(401, "Wrong phone number or password.")
    if not a.active:
        raise HTTPException(403, "This account is switched off. Ask your hospital admin.")
    if body.portal == "staff" and a.role not in auth.STAFF_ROLES:
        raise HTTPException(403, "This is a patient account. Use the patient login.")
    if body.portal == "patient" and a.role != "patient":
        raise HTTPException(403, "This is a hospital account. Use the hospital login.")
    a.last_login_at = now()
    db.commit()
    return session(a)


@router.post("/auth/signup", response_model=SessionOut, status_code=201)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    """Anyone in the community can make a patient account. Staff accounts are made by the admin."""
    phone = auth.normalize_phone(body.phone)
    a = create(db, "patient", phone, body.name, body.password)
    if body.email.strip():
        from . import emails

        emails.save_email(db, phone, body.email)
    p = db.scalar(select(Patient).where(Patient.phone == phone))
    if p and not p.name:
        p.name = a.name
        db.commit()
    return session(a)


@router.get("/auth/me", response_model=AccountOut)
def me(a: Account = Depends(auth.current_account)):
    return out(a)


@router.post("/auth/password")
def change_password(body: PasswordIn, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    if not auth.check_password(body.old_password, a.password_hash):
        raise HTTPException(401, "Your current password is wrong.")
    a.password_hash = auth.hash_password(body.new_password)
    db.commit()
    return {"ok": True}


# ---------- Patient app ----------

@router.get("/me/cases")
def my_cases(a: Account = Depends(auth.patient_only), db: Session = Depends(get_db)):
    """Every request sent from this phone number (website, WhatsApp or Telegram), newest first,
    each with its private status link."""
    p = db.scalar(select(Patient).where(Patient.phone == a.phone))
    if p is None:
        return []
    cases = db.scalars(select(Case).where(Case.patient_id == p.id).order_by(Case.created_at.desc()).limit(50))
    items = []
    for c in cases:
        t = patient_view.issue_token(db, c.id)
        slot = c.proposed_slot
        items.append({
            "case_id": c.id,
            "token": t,
            "created_at": c.created_at,
            "message": c.message[:160],
            "urgency": c.urgency,
            "status": c.status,
            "slot": {"starts_at": slot.starts_at, "doctor": slot.doctor} if slot else None,
        })
    return items


# ---------- Hospital admin ----------

def add_doctor_slots(db: Session, doctor: str, specialty: str, days: int = 6):
    start = now().replace(minute=0, second=0, microsecond=0)
    for d in range(days):
        day = (start + timedelta(days=d)).replace(hour=9)
        for i in range(0, 48, 3):  # 9:00 to 21:00, one slot every 45 min
            t = day + timedelta(minutes=15 * i)
            if t > now():
                db.add(Slot(doctor=doctor, specialty=specialty or "general", starts_at=t, minutes=15))
    db.commit()


@router.get("/admin/accounts", response_model=list[AccountOut])
def list_staff(role: Literal["staff", "patient"] = "staff", _: Account = Depends(auth.admin_only),
               db: Session = Depends(get_db)):
    roles = auth.STAFF_ROLES if role == "staff" else ("patient",)
    return [out(a) for a in db.scalars(select(Account).where(Account.role.in_(roles)).order_by(Account.role, Account.name))]


@router.get("/admin/summary")
def admin_summary(_: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    count = lambda r: db.scalar(select(func.count()).select_from(Account).where(Account.role == r)) or 0  # noqa: E731
    return {"hospital": settings.clinic_name, "admins": count("admin"), "doctors": count("doctor"),
            "patients": count("patient")}


@router.post("/admin/accounts", response_model=AccountOut, status_code=201)
def add_staff(body: StaffIn, _: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    name = body.name.strip()
    if body.role == "doctor" and not name.lower().startswith("dr"):
        name = "Dr. " + name
    a = create(db, body.role, auth.normalize_phone(body.phone), name, body.password,
               body.specialty if body.role == "doctor" else "")
    if body.role == "doctor" and body.add_slots:
        has = db.scalar(select(func.count()).select_from(Slot).where(Slot.doctor == a.name)) or 0
        if not has:
            add_doctor_slots(db, a.name, a.specialty)
    return out(a)


@router.post("/admin/accounts/{account_id}/active", response_model=AccountOut)
def set_active(account_id: int, body: ActiveIn, me_: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    a = db.get(Account, account_id)
    if a is None:
        raise HTTPException(404, "No such account.")
    if a.id == me_.id and not body.active:
        raise HTTPException(400, "You can't switch off your own account.")
    a.active = body.active
    db.commit()
    return out(a)


@router.post("/admin/accounts/{account_id}/password", response_model=AccountOut)
def reset_password(account_id: int, body: ResetIn, _: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    a = db.get(Account, account_id)
    if a is None:
        raise HTTPException(404, "No such account.")
    a.password_hash = auth.hash_password(body.new_password)
    db.commit()
    return out(a)


# ---------- First accounts ----------

DEMO_ACCOUNTS = [
    # role, phone, name, password, specialty
    ("admin", "+923000000001", "Hospital Admin", "admin123", ""),
    ("doctor", "+923000000002", "Dr. Ayesha Malik", "doctor123", "general"),
    ("patient", "+923001112233", "Rashid Ahmed", "patient123", ""),
]


def ensure_accounts(db: Session):
    """ADMIN_PHONE + ADMIN_PASSWORD always make sure that admin exists. With SEED_DEMO=1 the three
    demo logins above are added too (sample data only; change or switch them off for real use)."""
    phone, pw = os.getenv("ADMIN_PHONE"), os.getenv("ADMIN_PASSWORD")
    if phone and pw and not auth.find(db, auth.normalize_phone(phone)):
        create(db, "admin", auth.normalize_phone(phone), os.getenv("ADMIN_NAME", "Hospital Admin"), pw)
    if os.getenv("SEED_DEMO", "1") == "1":
        for role, ph, name, pw, spec in DEMO_ACCOUNTS:
            if not auth.find(db, ph):
                create(db, role, ph, name, pw, spec)
