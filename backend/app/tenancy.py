"""Hospitals (tenants). The original clinic is hospital #1, so all existing records stay with it.

`migrate` adds new columns to tables that already exist (create_all only makes new tables).
Safe to run on every start, on SQLite and Postgres.
"""
import re
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from .config import settings
from .models import Attempt, Case, Tenant
from .services import now

NEW_COLUMNS = [
    ("slots", "hospital_id", "INTEGER NOT NULL DEFAULT 1"),
    ("cases", "hospital_id", "INTEGER NOT NULL DEFAULT 1"),
    ("cases", "patient_reply", "VARCHAR(12)"),
    ("cases", "patient_reply_at", "TIMESTAMP"),
    ("cases", "attendance", "VARCHAR(12)"),
    ("accounts", "hospital_id", "INTEGER NOT NULL DEFAULT 1"),
    ("area_alerts", "hospital_id", "INTEGER NOT NULL DEFAULT 1"),
    ("blood_requests", "hospital_id", "INTEGER NOT NULL DEFAULT 1"),
]


def migrate(engine):
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, col, ddl in NEW_COLUMNS:
            if table in tables and col not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))


def ensure_default(db: Session):
    if db.get(Tenant, 1) is None:
        db.add(Tenant(id=1, slug="main", name=settings.clinic_name, city="Multan", status="active", created_at=now()))
        db.commit()
        if db.get_bind().dialect.name == "postgresql":  # move the id counter past the fixed id 1
            db.execute(text("SELECT setval(pg_get_serial_sequence('tenants', 'id'), (SELECT MAX(id) FROM tenants))"))
            db.commit()


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:50] or "hospital"


def hid(who) -> int:
    """The hospital whose desk this is: the staff member's own, or #1 for the shared staff key."""
    return getattr(who, "hospital_id", None) or 1


def name_of(db: Session, hospital_id: int) -> str:
    t = db.get(Tenant, hospital_id or 1)
    return t.name if t else settings.clinic_name


def active(db: Session, slug_or_id: str | int | None) -> Tenant:
    """The hospital a patient chose (by slug or id); the main one if none was chosen."""
    t = None
    if slug_or_id not in (None, "", 0):
        t = db.get(Tenant, int(slug_or_id)) if str(slug_or_id).isdigit() else db.scalar(select(Tenant).where(Tenant.slug == str(slug_or_id)))
    t = t or db.get(Tenant, 1)
    if t is None or t.status != "active":
        raise HTTPException(422, "This hospital isn't taking requests on Sehat Saathi right now.")
    return t


def own_case(db: Session, case_id: int, hospital_id: int) -> Case:
    c = db.get(Case, case_id)
    if c is None or (c.hospital_id or 1) != hospital_id:
        raise HTTPException(404, f"Case {case_id} not found")
    return c


def check(db: Session, key: str, max_count: int, minutes: int, message: str = "Too many tries. Please wait a few minutes."):
    since = now() - timedelta(minutes=minutes)
    n = db.scalar(select(func.count()).select_from(Attempt).where(Attempt.key == key, Attempt.at >= since)) or 0
    if n >= max_count:
        raise HTTPException(429, message)


def record(db: Session, key: str):
    db.add(Attempt(key=key, at=now()))
    db.commit()


def limit(db: Session, key: str, max_count: int, minutes: int, message: str = "Too many tries. Please wait a few minutes."):
    """Simple rate limit kept in the database (works across serverless instances)."""
    check(db, key, max_count, minutes, message)
    record(db, key)
