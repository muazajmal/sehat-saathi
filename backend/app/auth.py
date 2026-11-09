"""Logins for hospital admins, doctors and patients.

Free and self-contained: phone number + password (no SMS costs), PBKDF2 password hashes and
signed tokens made with Python's standard library. Tokens last 7 days.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Account

TOKEN_DAYS = 7
ROLES = ("owner", "admin", "doctor", "patient")
STAFF_ROLES = ("admin", "doctor")


def _secret() -> bytes:
    # AUTH_SECRET should be set in production. The fallback is stable across serverless
    # instances (derived from the database address), so logins survive cold starts.
    s = os.getenv("AUTH_SECRET") or ("sehat-saathi:" + settings.database_url)
    return hashlib.sha256(s.encode()).digest()


def normalize_phone(raw: str) -> str:
    """'0300-1234567', '923001234567', '+92 300 1234567' -> '+923001234567'."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("0092"):
        digits = digits[2:]
    if digits.startswith("03") and len(digits) == 11:
        digits = "92" + digits[1:]
    if len(digits) < 10 or len(digits) > 15:
        raise HTTPException(422, "Enter a valid phone number, like 0300 1234567.")
    return "+" + digits


def tidy_phone(raw: str) -> str:
    """Like normalize_phone, but never fails: odd numbers are kept as typed."""
    try:
        return normalize_phone(raw)
    except HTTPException:
        return (raw or "").strip()


def phone_variants(phone: str) -> list[str]:
    """Every way the same Pakistani number may have been saved before numbers were tidied."""
    out = {phone}
    if phone.startswith("+92"):
        out |= {phone[1:], "0" + phone[3:]}
    return sorted(out)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return "pbkdf2$200000$" + salt.hex() + "$" + h.hex()


def check_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt, h = stored.split("$")
        got = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(got.hex(), h)
    except Exception:
        return False


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(acc: Account) -> str:
    payload = _b64(json.dumps({"id": acc.id, "role": acc.role, "exp": int(time.time()) + TOKEN_DAYS * 86400}).encode())
    sig = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return payload + "." + sig


def read_token(token: str) -> dict | None:
    try:
        payload, sig = token.split(".")
        good = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        data = json.loads(_unb64(payload))
        return data if data.get("exp", 0) > time.time() else None
    except Exception:
        return None


def account_from_header(db: Session, authorization: str | None) -> Account | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    data = read_token(authorization[7:].strip())
    if not data:
        return None
    acc = db.get(Account, data["id"])
    return acc if acc and acc.active else None


def current_account(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> Account:
    acc = account_from_header(db, authorization)
    if acc is None:
        raise HTTPException(401, "Please log in.")
    return acc


def admin_only(acc: Account = Depends(current_account)) -> Account:
    if acc.role != "admin":
        raise HTTPException(403, "Only the hospital admin can do this.")
    return acc


def patient_only(acc: Account = Depends(current_account)) -> Account:
    if acc.role != "patient":
        raise HTTPException(403, "This page is for patients.")
    return acc


def staff_account(db: Session, authorization: str | None, x_staff_key: str | None) -> Account | None:
    """Who is using the desk. A doctor/admin login, or the shared STAFF_KEY (kept for scripts),
    or, only when OPEN_DESK=1, nobody (demo mode). Returns the account when there is one."""
    acc = account_from_header(db, authorization)
    if acc and acc.role in STAFF_ROLES:
        hospital_open(db, acc)
        return acc
    if settings.staff_key and x_staff_key and secrets.compare_digest(x_staff_key, settings.staff_key):
        return None
    if os.getenv("OPEN_DESK") == "1" and not settings.staff_key:
        return None
    if acc and acc.role == "patient":
        raise HTTPException(403, "This is the hospital desk. Patients can see their requests on the patient app.")
    raise HTTPException(401, "Please log in as hospital staff.")


def hospital_open(db: Session, acc: Account):
    """Staff of a hospital that isn't approved (or is suspended) can't use the desk."""
    from .models import Tenant

    t = db.get(Tenant, acc.hospital_id or 1)
    if t is None or t.status != "active":
        msg = ("Your hospital is waiting for approval. You'll be able to log in once it's approved."
               if t is not None and t.status == "pending" else "This hospital's account is paused. Contact Sehat Saathi.")
        raise HTTPException(403, msg)


def owner_only(acc: Account = Depends(current_account)) -> Account:
    if acc.role != "owner":
        raise HTTPException(403, "Only the Sehat Saathi owner can do this.")
    return acc


def find(db: Session, phone: str) -> Account | None:
    return db.scalar(select(Account).where(Account.phone == phone))
