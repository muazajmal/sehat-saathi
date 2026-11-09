"""Login, patient sign-up, the patient's own requests, and the admin's team page."""
import os
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import auth, patient as patient_view, tenancy
from .config import settings
from .db import get_db
from .models import Account, Case, Patient, Slot, Tenant
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
    hospital_id: int = 1


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
                      specialty=a.specialty, active=a.active, hospital_id=a.hospital_id or 1)


def session(a: Account) -> SessionOut:
    return SessionOut(token=auth.make_token(a), account=out(a))


def create(db: Session, role: str, phone: str, name: str, password: str, specialty: str = "",
           hospital_id: int = 1) -> Account:
    if auth.find(db, phone):
        raise HTTPException(409, "An account with this phone number already exists. Please log in.")
    a = Account(role=role, phone=phone, name=name.strip(), password_hash=auth.hash_password(password),
                hospital=tenancy.name_of(db, hospital_id) if role in auth.STAFF_ROLES else "", specialty=specialty,
                active=True, created_at=now(), hospital_id=hospital_id)
    db.add(a)
    db.commit()
    return a


@router.post("/auth/login", response_model=SessionOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    phone = auth.normalize_phone(body.phone)
    tenancy.check(db, f"login-fail:{phone}", 8, 15, "Too many wrong passwords. Please wait 15 minutes.")
    a = auth.find(db, phone)
    if a is None or not auth.check_password(body.password, a.password_hash):
        tenancy.record(db, f"login-fail:{phone}")  # only failures count
        raise HTTPException(401, "Wrong phone number or password.")
    if not a.active:
        raise HTTPException(403, "This account is switched off. Ask your hospital admin.")
    if body.portal == "staff" and a.role not in (*auth.STAFF_ROLES, "owner"):
        raise HTTPException(403, "This is a patient account. Use the patient login.")
    if a.role in auth.STAFF_ROLES:
        auth.hospital_open(db, a)
    if body.portal == "patient" and a.role != "patient":
        raise HTTPException(403, "This is a hospital account. Use the hospital login.")
    a.last_login_at = now()
    db.commit()
    return session(a)


@router.post("/auth/signup", response_model=SessionOut, status_code=201)
def signup(body: SignupIn, request: Request, db: Session = Depends(get_db)):
    """Anyone in the community can make a patient account. Staff accounts are made by the admin."""
    phone = auth.normalize_phone(body.phone)
    tenancy.limit(db, f"signup:{client_ip(request)}", 10, 60)
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
    ids = list(db.scalars(select(Patient.id).where(Patient.phone.in_(auth.phone_variants(a.phone)))))
    if not ids:
        return []
    cases = db.scalars(select(Case).where(Case.patient_id.in_(ids)).order_by(Case.created_at.desc()).limit(50))
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

def client_ip(request: Request) -> str:
    return (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "") or "?").split(",")[0].strip()


def add_doctor_slots(db: Session, doctor: str, specialty: str, days: int = 6, hospital_id: int = 1):
    start = now().replace(minute=0, second=0, microsecond=0)
    for d in range(days):
        day = (start + timedelta(days=d)).replace(hour=9)
        for i in range(0, 48, 3):  # 9:00 to 21:00, one slot every 45 min
            t = day + timedelta(minutes=15 * i)
            if t > now():
                db.add(Slot(doctor=doctor, specialty=specialty or "general", starts_at=t, minutes=15, hospital_id=hospital_id))
    db.commit()


@router.get("/admin/accounts", response_model=list[AccountOut])
def list_staff(role: Literal["staff", "patient"] = "staff", me_: Account = Depends(auth.admin_only),
               db: Session = Depends(get_db)):
    h = me_.hospital_id or 1
    if role == "staff":
        q = select(Account).where(Account.role.in_(auth.STAFF_ROLES), Account.hospital_id == h)
    else:  # patients who have asked this hospital for help
        phones = select(Patient.phone).join(Case, Case.patient_id == Patient.id).where(Case.hospital_id == h)
        q = select(Account).where(Account.role == "patient", Account.phone.in_(phones))
    return [out(a) for a in db.scalars(q.order_by(Account.role, Account.name))]


@router.get("/admin/summary")
def admin_summary(me_: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    h = me_.hospital_id or 1
    count = lambda r: db.scalar(select(func.count()).select_from(Account).where(Account.role == r, Account.hospital_id == h)) or 0  # noqa: E731
    return {"hospital": tenancy.name_of(db, h), "admins": count("admin"), "doctors": count("doctor")}


@router.post("/admin/accounts", response_model=AccountOut, status_code=201)
def add_staff(body: StaffIn, me_: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    name = body.name.strip()
    if body.role == "doctor" and not name.lower().startswith("dr"):
        name = "Dr. " + name
    h = me_.hospital_id or 1
    a = create(db, body.role, auth.normalize_phone(body.phone), name, body.password,
               body.specialty if body.role == "doctor" else "", hospital_id=h)
    if body.role == "doctor" and body.add_slots:
        has = db.scalar(select(func.count()).select_from(Slot).where(Slot.doctor == a.name, Slot.hospital_id == h)) or 0
        if not has:
            add_doctor_slots(db, a.name, a.specialty, hospital_id=h)
    return out(a)


@router.post("/admin/accounts/{account_id}/active", response_model=AccountOut)
def set_active(account_id: int, body: ActiveIn, me_: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    a = db.get(Account, account_id)
    if a is None:
        raise HTTPException(404, "No such account.")
    if (a.hospital_id or 1) != (me_.hospital_id or 1) or a.role not in auth.STAFF_ROLES:
        raise HTTPException(404, "No such account.")
    if a.id == me_.id and not body.active:
        raise HTTPException(400, "You can't switch off your own account.")
    a.active = body.active
    db.commit()
    return out(a)


@router.post("/admin/accounts/{account_id}/password", response_model=AccountOut)
def reset_password(account_id: int, body: ResetIn, me_: Account = Depends(auth.admin_only), db: Session = Depends(get_db)):
    a = db.get(Account, account_id)
    if a is None:
        raise HTTPException(404, "No such account.")
    if (a.hospital_id or 1) != (me_.hospital_id or 1) or a.role not in auth.STAFF_ROLES:
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



# ---------- Hospitals joining, and the owner's panel ----------

class TenantApplyIn(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    city: str = Field(default="Multan", max_length=80)
    address: str = Field(default="", max_length=240)
    phone: str = Field(min_length=6, max_length=32)
    admin_name: str = Field(min_length=2, max_length=120)
    admin_phone: str = Field(min_length=6, max_length=32)
    password: str = Field(min_length=8, max_length=200)


class OwnerClaimIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=32)
    password: str = Field(min_length=8, max_length=200)


def tenant_out(db: Session, t: Tenant) -> dict:
    since = now() - timedelta(days=30)
    return {"id": t.id, "slug": t.slug, "name": t.name, "city": t.city, "address": t.address, "phone": t.phone,
            "status": t.status, "created_at": t.created_at,
            "staff": db.scalar(select(func.count()).select_from(Account).where(Account.hospital_id == t.id, Account.role.in_(auth.STAFF_ROLES))) or 0,
            "cases_30d": db.scalar(select(func.count()).select_from(Case).where(Case.hospital_id == t.id, Case.created_at >= since)) or 0,
            "admin": next((f"{a.name} · {a.phone}" for a in db.scalars(select(Account).where(Account.hospital_id == t.id, Account.role == "admin").limit(1))), "")}


@router.get("/tenants")
def tenants(db: Session = Depends(get_db)):
    """Hospitals patients can send a request to."""
    return [{"id": t.id, "slug": t.slug, "name": t.name, "city": t.city}
            for t in db.scalars(select(Tenant).where(Tenant.status == "active").order_by(Tenant.id))]


@router.post("/tenants/apply", status_code=201)
def tenant_apply(body: TenantApplyIn, request: Request, db: Session = Depends(get_db)):
    """A hospital asks to use Sehat Saathi. Its admin can log in once the owner approves it."""
    tenancy.limit(db, f"apply:{client_ip(request)}", 5, 60 * 24)
    phone = auth.normalize_phone(body.admin_phone)
    if auth.find(db, phone):
        raise HTTPException(409, "An account with the admin's phone number already exists.")
    base = tenancy.slugify(body.name)
    slug, n = base, 2
    while db.scalar(select(Tenant).where(Tenant.slug == slug)):
        slug, n = f"{base}-{n}", n + 1
    t = Tenant(slug=slug, name=body.name.strip(), city=body.city.strip() or "Multan", address=body.address.strip(),
               phone=auth.normalize_phone(body.phone), status="pending", created_at=now())
    db.add(t)
    db.flush()
    create(db, "admin", phone, body.admin_name, body.password, hospital_id=t.id)
    return {"ok": True, "slug": slug, "status": "pending"}


@router.get("/owner/exists")
def owner_exists(db: Session = Depends(get_db)):
    return {"exists": bool(db.scalar(select(func.count()).select_from(Account).where(Account.role == "owner")))}


@router.post("/owner/claim", response_model=SessionOut, status_code=201)
def owner_claim(body: OwnerClaimIn, request: Request, db: Session = Depends(get_db)):
    """One-time setup: the first person to claim becomes the Sehat Saathi owner. Closed after that."""
    tenancy.limit(db, f"claim:{client_ip(request)}", 5, 60)
    if owner_exists(db)["exists"]:
        raise HTTPException(409, "The owner account already exists. Log in instead.")
    return session(create(db, "owner", auth.normalize_phone(body.phone), body.name, body.password, hospital_id=0))


@router.get("/owner/tenants")
def owner_tenants(_: Account = Depends(auth.owner_only), db: Session = Depends(get_db)):
    return [tenant_out(db, t) for t in db.scalars(select(Tenant).order_by(Tenant.status != "pending", Tenant.id))]


@router.post("/owner/tenants/{tenant_id}/status")
def owner_tenant_status(tenant_id: int, status: Literal["active", "suspended"], _: Account = Depends(auth.owner_only),
                        db: Session = Depends(get_db)):
    t = db.get(Tenant, tenant_id)
    if t is None:
        raise HTTPException(404, "No such hospital.")
    t.status = status
    db.commit()
    return tenant_out(db, t)
