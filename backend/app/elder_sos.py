"""Elder emergency button with guardians.

The elder signs in on their own phone once (phone number + 4-digit PIN set by the family). On their
home screen is one huge HELP button. When it is pressed:

1. An urgent case goes to the hospital desk at once, with the elder's medical card and location.
2. Every guardian is told at once (inbox, phone notification, email).
3. The phone asks "Are you okay?" for 1 minute.
4. No answer in 1 minute: every guardian is told "pressed the emergency button and did not respond,
   please check on them now", the desk case is marked, and the duty doctor is alerted again.

The 1-minute check runs from several places, so it still happens if the elder's phone goes quiet:
the elder's own screen, any guardian's screen, the hospital desk, the 15-minute scheduled run and
(optionally) an n8n "wait 1 minute" call. `check` is safe to run any number of times.
"""
import html
import logging
import os
import secrets
from datetime import timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import auth, dispatch, emails, inbox, notify as outbound, services, tenancy
from .community import _elder
from .config import settings
from .db import get_db
from .models import Account, Case, Elder, ElderGuardian, SosEvent
from .services import audit, now

log = logging.getLogger("sehat.sos")
router = APIRouter(prefix="/api")

RESPOND_SECONDS = 60
OPEN = ("waiting", "help", "no_response")  # still needs someone to act
PIN = r"^\d{4}$"
BLOOD = r"^(A|B|AB|O)[+-]$|^$"


# ---------------------------------------------------------------- helpers

def _maps(ev: SosEvent) -> str:
    return f"https://maps.google.com/?q={ev.lat:.6f},{ev.lng:.6f}" if ev.lat is not None and ev.lng is not None else ""


def _hhmm(dt) -> str:
    return dt.strftime("%I:%M %p").lstrip("0").lower()


def guardians(db: Session, el: Elder) -> list[dict]:
    """Everyone to tell: the family member who added the elder, then the extra guardians."""
    out = []
    fam = db.get(Account, el.family_account_id)
    if fam is not None:
        out.append({"id": 0, "name": fam.name, "relation": "", "phone": fam.phone,
                    "email": emails.email_for(db, fam.phone) or "", "link": "/patient/family", "token": ""})
    for g in db.scalars(select(ElderGuardian).where(ElderGuardian.elder_id == el.id, ElderGuardian.active.is_(True))
                        .order_by(ElderGuardian.id)):
        out.append({"id": g.id, "name": g.name, "relation": g.relation, "phone": g.phone, "email": g.email,
                    "link": f"/elder/watch?g={g.token}", "token": g.token})
    return out


def _tell(db: Session, el: Elder, ev: SosEvent, stage: str, title: tuple[str, str], body: tuple[str, str],
          skip_phone: str = ""):
    """Tell every guardian: inbox + phone notification (+ n8n) and an email when they gave one."""
    seen: set[str] = set()
    for g in guardians(db, el):
        if g["phone"] and g["phone"] not in seen and g["phone"] != skip_phone:
            seen.add(g["phone"])
            try:
                inbox.notify(db, g["phone"], "elder", title[0], body[0], g["link"],
                             dedupe=f"sos:{ev.id}:{stage}:{g['phone']}"[:120], ur=(title[1], body[1]))
            except Exception as e:  # never let one message stop the others
                db.rollback()
                log.warning("sos notify failed: %s", e)
        if g["email"] and emails.valid(g["email"]):
            try:
                link = settings.frontend_url + g["link"]
                en = f"<p>{html.escape(body[0])}</p>"
                if _maps(ev):
                    en += f'<p><a href="{_maps(ev)}">📍 Open their location on the map</a></p>'
                ur = f"<p>{html.escape(body[1])}</p>"
                page = emails.shell(html.escape(title[0]), en, ur, ("Open live status", link),
                                    "You get this because you are a guardian on Sehat Saathi.")
                emails.queue(db, f"sos:{ev.id}:{stage}:{g['email']}"[:100], g["email"], title[0], page)
            except Exception as e:
                db.rollback()
                log.warning("sos email failed: %s", e)


def _card(el: Elder) -> str:
    bits = [f"Age {el.age}" if el.age else "", f"Conditions: {el.conditions}" if el.conditions else "",
            f"Medicines: {el.medicines}" if el.medicines else "", f"Allergies: {el.allergies}" if el.allergies else "",
            f"Blood group {el.blood_group}" if el.blood_group else ""]
    return " · ".join(b for b in bits if b)


def _case(db: Session, ev: SosEvent) -> Case | None:
    return db.get(Case, ev.case_id) if ev.case_id else None


def _flag(db: Session, ev: SosEvent, flag: str, action: str, detail: str):
    c = _case(db, ev)
    if c is None:
        return
    c.red_flags = list(dict.fromkeys([*(c.red_flags or []), flag]))
    c.urgency, c.needs_callback = "urgent", True
    audit(db, "system", action, detail, c.id)


def ev_out(db: Session, ev: SosEvent | None) -> dict | None:
    if ev is None:
        return None
    left = max(0, int((ev.respond_by - now()).total_seconds())) if ev.status == "waiting" else 0
    return {"id": ev.id, "status": ev.status, "started_at": ev.started_at, "respond_by": ev.respond_by,
            "seconds_left": left, "responded_at": ev.responded_at, "escalated_at": ev.escalated_at,
            "resolved_at": ev.resolved_at, "resolved_by": ev.resolved_by, "lat": ev.lat, "lng": ev.lng,
            "map": _maps(ev), "case_id": ev.case_id}


def latest(db: Session, elder_id: int, open_only: bool = False) -> SosEvent | None:
    q = select(SosEvent).where(SosEvent.elder_id == elder_id).order_by(SosEvent.id.desc()).limit(1)
    ev = db.scalar(q)
    if ev is None:
        return None
    if open_only and ev.status not in OPEN:
        return None
    # A finished alarm stays on screen for 12 hours, then the page goes back to normal.
    if ev.status not in OPEN and ev.started_at < now() - timedelta(hours=12):
        return None
    return ev


# ---------------------------------------------------------------- the 1-minute rule

def check(db: Session) -> int:
    """Escalate every alarm whose minute has run out without an answer. Safe to run any number of times."""
    n = 0
    try:
        due = list(db.scalars(select(SosEvent).where(SosEvent.status == "waiting", SosEvent.respond_by <= now())))
    except Exception as e:  # table missing on a half-migrated database: never break the caller
        db.rollback()
        log.warning("sos check skipped: %s", e)
        return 0
    for ev in due:
        ev.status, ev.escalated_at = "no_response", now()
        db.commit()
        el = db.get(Elder, ev.elder_id)
        if el is None:
            continue
        call = f" Call them: {el.phone}." if el.phone else ""
        call_ur = f" انہیں کال کریں: {el.phone}۔" if el.phone else ""
        where = f" Location: {_maps(ev)}" if _maps(ev) else ""
        _tell(db, el, ev, "noresp",
              (f"⚠️ {el.name} did not respond after pressing EMERGENCY",
               f"⚠️ {el.name} نے ایمرجنسی بٹن دبانے کے بعد جواب نہیں دیا"),
              (f"{el.name} pressed the emergency button at {_hhmm(ev.started_at)} and has not answered for 1 minute. "
               f"Please check on them now.{call} If you can't reach them, call 1122.{where}",
               f"{el.name} نے {_hhmm(ev.started_at)} پر ایمرجنسی بٹن دبایا اور 1 منٹ سے جواب نہیں دیا۔ "
               f"براہ کرم ابھی ان کی خیریت معلوم کریں۔{call_ur} رابطہ نہ ہو تو 1122 پر کال کریں۔"))
        _flag(db, ev, "No response 1 min after SOS", "sos_no_response",
              "Elder did not answer for 1 minute after pressing the emergency button. Guardians told.")
        c = _case(db, ev)
        db.commit()
        if c is not None:
            try:
                if outbound.escalate({**services.case_payload(c), "sos": "no_response"}):
                    audit(db, "system", "escalated", "Duty doctor alerted again: no response after SOS (n8n)", c.id)
                    db.commit()
            except Exception as e:
                db.rollback()
                log.warning("sos escalate failed: %s", e)
        n += 1
    return n


def _start_timer(ev: SosEvent):
    """Optional: n8n waits 1 minute and calls /api/sos/check, so the rule runs even if every screen is closed."""
    hook = os.getenv("N8N_SOS_WEBHOOK", "")
    if not hook or hook == "off":
        return
    try:
        httpx.post(hook, json={"sos_id": ev.id, "wait_seconds": RESPOND_SECONDS + 5,
                               "check_url": "/api/sos/check"}, timeout=4)
    except Exception as e:
        log.warning("sos timer hook failed: %s", e)


# ---------------------------------------------------------------- family / guardian setup

class ProfileIn(BaseModel):
    pin: str = Field(default="", pattern=r"^(\d{4})?$")
    age: int = Field(default=0, ge=0, le=120)
    conditions: str = Field(default="", max_length=300)
    medicines: str = Field(default="", max_length=300)
    allergies: str = Field(default="", max_length=200)
    blood_group: str = Field(default="", pattern=BLOOD)


class GuardianIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    relation: str = Field(default="", max_length=40)
    phone: str = Field(default="", max_length=32)
    email: str = Field(default="", max_length=200)


def _family_elder(db: Session, elder_id: int, a: Account) -> Elder:
    e = db.get(Elder, elder_id)
    if e is None or not e.active or e.family_account_id != a.id:
        raise HTTPException(404, "Not found.")
    return e


def profile_out(db: Session, e: Elder) -> dict:
    return {"has_pin": bool(e.pin_hash), "age": e.age or 0, "conditions": e.conditions or "", "medicines": e.medicines or "",
            "allergies": e.allergies or "", "blood_group": e.blood_group or "",
            "guardians": [{k: g[k] for k in ("id", "name", "relation", "phone", "email")} for g in guardians(db, e) if g["id"]],
            "sos": ev_out(db, latest(db, e.id))}


@router.get("/me/elders/{elder_id}/profile")
def get_profile(elder_id: int, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    check(db)
    return profile_out(db, _family_elder(db, elder_id, a))


@router.put("/me/elders/{elder_id}/profile")
def set_profile(elder_id: int, body: ProfileIn, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    e = _family_elder(db, elder_id, a)
    if body.pin:
        if not e.phone:
            raise HTTPException(422, "Add their phone number first: they sign in with their number and this PIN.")
        e.pin_hash = auth.hash_password(body.pin)
    e.age, e.blood_group = body.age, body.blood_group
    e.conditions, e.medicines, e.allergies = body.conditions.strip(), body.medicines.strip(), body.allergies.strip()
    db.commit()
    return profile_out(db, e)


@router.post("/me/elders/{elder_id}/guardians", status_code=201)
def add_guardian(elder_id: int, body: GuardianIn, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    e = _family_elder(db, elder_id, a)
    phone = auth.normalize_phone(body.phone) if body.phone.strip() else ""
    email = body.email.strip().lower()
    if email and not emails.valid(email):
        raise HTTPException(422, "That email doesn't look right.")
    if not phone and not email:
        raise HTTPException(422, "Give a phone number or an email, so we can reach them.")
    n = db.scalar(select(func.count()).select_from(ElderGuardian)
                  .where(ElderGuardian.elder_id == e.id, ElderGuardian.active.is_(True))) or 0
    if n >= 4:
        raise HTTPException(422, "You can add up to 4 more guardians.")
    db.add(ElderGuardian(elder_id=e.id, name=body.name.strip(), relation=body.relation.strip(), phone=phone, email=email,
                         token=secrets.token_urlsafe(24), active=True, created_at=now()))
    db.commit()
    return profile_out(db, e)


@router.delete("/me/elders/{elder_id}/guardians/{gid}")
def remove_guardian(elder_id: int, gid: int, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    e = _family_elder(db, elder_id, a)
    g = db.get(ElderGuardian, gid)
    if g is None or g.elder_id != e.id:
        raise HTTPException(404, "Not found.")
    g.active = False
    db.commit()
    return profile_out(db, e)


# ---------------------------------------------------------------- elder sign-in and home

class ElderLoginIn(BaseModel):
    phone: str = Field(min_length=7, max_length=32)
    pin: str = Field(pattern=PIN)


@router.post("/elder/login")
def elder_login(body: ElderLoginIn, request: Request, db: Session = Depends(get_db)):
    phone = auth.normalize_phone(body.phone)
    key = f"elder-pin:{phone}"
    tenancy.check(db, key, 6, 15, "Too many wrong PINs. Wait 15 minutes, or ask your family for the PIN.")
    tenancy.check(db, f"elder-pin-ip:{tenancy.client_ip(request)}", 30, 15)
    for e in db.scalars(select(Elder).where(Elder.phone == phone, Elder.active.is_(True)).order_by(Elder.id.desc())):
        if e.pin_hash and auth.check_password(body.pin, e.pin_hash):
            return {"e": e.id, "t": e.token, "name": e.name, "lang": e.lang}
    tenancy.record(db, key)
    tenancy.record(db, f"elder-pin-ip:{tenancy.client_ip(request)}")
    raise HTTPException(401, "Phone number or PIN is wrong.")


@router.get("/elder/me")
def elder_home(e: int, t: str, db: Session = Depends(get_db)):
    el = _elder(db, e, t)
    check(db)
    from .community import elder_status

    s = elder_status(db, el)
    return {"name": el.name, "lang": el.lang, "status": s["status"], "checked_at": s["checked_at"],
            "checkin_time": el.checkin_time, "card": _card(el),
            "guardians": [{"name": g["name"], "relation": g["relation"], "phone": g["phone"]} for g in guardians(db, el) if g["phone"]],
            "sos": ev_out(db, latest(db, el.id))}


# ---------------------------------------------------------------- the emergency button

class Where(BaseModel):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


def _own_event(db: Session, el: Elder, sos_id: int) -> SosEvent:
    ev = db.get(SosEvent, sos_id)
    if ev is None or ev.elder_id != el.id:
        raise HTTPException(404, "Not found.")
    return ev


def _put_location(db: Session, ev: SosEvent, lat: float, lng: float):
    ev.lat, ev.lng = lat, lng
    db.commit()
    if ev.case_id:
        try:
            dispatch.set_location(db, ev.case_id, lat, lng, "Elder's phone (emergency button)", "web")
        except Exception as x:
            db.rollback()
            log.warning("sos location failed: %s", x)


@router.post("/elder/sos")
def press_sos(e: int, t: str, body: Where | None = None, db: Session = Depends(get_db)):
    el = _elder(db, e, t)
    check(db)
    body = body or Where()
    # Pressed again while an alarm is still open: same alarm, no duplicate messages.
    ev = latest(db, el.id, open_only=True)
    if ev is not None and ev.started_at > now() - timedelta(minutes=30):
        if body.lat is not None and body.lng is not None and ev.lat is None:
            _put_location(db, ev, body.lat, body.lng)
        return ev_out(db, ev)

    t0 = now()
    ev = SosEvent(elder_id=el.id, status="waiting", started_at=t0, respond_by=t0 + timedelta(seconds=RESPOND_SECONDS))
    db.add(ev)
    db.commit()

    # 1. Urgent case on the hospital desk, with the medical card.
    gs = guardians(db, el)
    phone = el.phone or next((g["phone"] for g in gs if g["phone"]), "")
    if phone:
        try:
            who = "; ".join(f"{g['name']}{' (' + g['relation'] + ')' if g['relation'] else ''} {g['phone']}".strip()
                            for g in gs if g["phone"])
            msg = (f"EMERGENCY BUTTON pressed by {el.name} (elder app) at {_hhmm(t0)}. "
                   f"{_card(el) or 'No medical card yet.'}. Guardians: {who or 'none'}. "
                   f"Please call now and send an ambulance if they don't answer.")
            c = services.create_intake(db, phone, el.name, msg, "web")
            c.urgency, c.needs_callback = "urgent", True
            c.red_flags = list(dict.fromkeys([*(c.red_flags or []), "Elder emergency button"]))
            ev.case_id = c.id
            db.commit()
        except Exception as x:
            db.rollback()
            log.warning("sos case failed: %s", x)
    if body.lat is not None and body.lng is not None:
        _put_location(db, ev, body.lat, body.lng)

    # 2. Guardians told at once. 3. The 1-minute clock starts.
    call = f" Call them: {el.phone}." if el.phone else ""
    call_ur = f" انہیں کال کریں: {el.phone}۔" if el.phone else ""
    _tell(db, el, ev, "pressed",
          (f"🚨 {el.name} pressed the EMERGENCY button", f"🚨 {el.name} نے ایمرجنسی بٹن دبایا"),
          (f"At {_hhmm(t0)}. Sehat Saathi is asking if they are okay. If they don't answer in 1 minute, you'll be told "
           f"again.{call} The hospital desk has been alerted. Emergency: 1122.",
           f"{_hhmm(t0)} پر۔ صحت ساتھی ان سے پوچھ رہا ہے کہ کیا وہ ٹھیک ہیں۔ 1 منٹ میں جواب نہ دیا تو آپ کو دوبارہ "
           f"بتایا جائے گا۔{call_ur} ہسپتال کو اطلاع دے دی گئی ہے۔ ایمرجنسی: 1122۔"))
    _start_timer(ev)
    return ev_out(db, ev)


@router.post("/elder/sos/{sos_id}/location")
def sos_location(sos_id: int, e: int, t: str, body: Where, db: Session = Depends(get_db)):
    el = _elder(db, e, t)
    ev = _own_event(db, el, sos_id)
    if body.lat is None or body.lng is None:
        raise HTTPException(422, "Location missing.")
    _put_location(db, ev, body.lat, body.lng)
    return ev_out(db, ev)


@router.get("/elder/sos/{sos_id}")
def sos_state(sos_id: int, e: int, t: str, db: Session = Depends(get_db)):
    el = _elder(db, e, t)
    check(db)
    return ev_out(db, _own_event(db, el, sos_id))


@router.post("/elder/sos/{sos_id}/respond")
def sos_respond(sos_id: int, e: int, t: str, answer: Literal["okay", "help"], db: Session = Depends(get_db)):
    """The elder answered. Okay = pressed by mistake or feeling better. Help = send an ambulance.
    An answer after the minute ran out still counts: it tells the guardians they are awake."""
    el = _elder(db, e, t)
    ev = _own_event(db, el, sos_id)
    if ev.status == "resolved":
        return ev_out(db, ev)
    was = ev.status
    ev.status, ev.responded_at = answer, now()
    db.commit()
    if answer == "okay":
        _tell(db, el, ev, "okay", (f"✅ {el.name} says they are okay", f"✅ {el.name} نے بتایا کہ وہ ٹھیک ہیں"),
              (f"{el.name} answered \"I'm okay\" at {_hhmm(ev.responded_at)}"
               f"{' (after the 1-minute alert)' if was == 'no_response' else ''}. Please still give them a call.",
               f"{el.name} نے {_hhmm(ev.responded_at)} پر \"میں ٹھیک ہوں\" دبایا۔ پھر بھی ایک بار فون کر لیں۔"))
        c = _case(db, ev)
        if c is not None:
            audit(db, "Patient", "sos_okay", "Elder answered: I'm okay. Please still call to check.", c.id)
    else:
        _tell(db, el, ev, "help", (f"🚑 {el.name} needs an ambulance", f"🚑 {el.name} کو ایمبولینس چاہیے"),
              (f"{el.name} answered \"I need an ambulance\" at {_hhmm(ev.responded_at)}. The hospital desk has the case. "
               f"Go to them or call 1122 now.",
               f"{el.name} نے {_hhmm(ev.responded_at)} پر \"مجھے ایمبولینس چاہیے\" دبایا۔ ہسپتال کو کیس مل گیا ہے۔ "
               f"ابھی ان کے پاس جائیں یا 1122 پر کال کریں۔"))
        _flag(db, ev, "Elder asked for an ambulance", "sos_help", "Elder answered: I need an ambulance.")
    db.commit()
    return ev_out(db, ev)


@router.post("/sos/check")
def sos_check(db: Session = Depends(get_db)):
    """Public and harmless: only escalates alarms whose minute has already run out."""
    return {"escalated": check(db)}


# ---------------------------------------------------------------- guardian live page (no login)

def _guardian(db: Session, g: str) -> tuple[ElderGuardian, Elder]:
    gd = db.scalar(select(ElderGuardian).where(ElderGuardian.token == g))
    if gd is None or not gd.active or not secrets.compare_digest(gd.token, g):
        raise HTTPException(403, "This link is not valid.")
    el = db.get(Elder, gd.elder_id)
    if el is None or not el.active:
        raise HTTPException(403, "This link is not valid.")
    return gd, el


def watch_out(db: Session, el: Elder, me: str) -> dict:
    from .community import elder_status

    s = elder_status(db, el)
    return {"me": me, "name": el.name, "phone": el.phone, "card": _card(el), "checkin": s["status"],
            "checked_at": s["checked_at"], "sos": ev_out(db, latest(db, el.id))}


@router.get("/elder/watch")
def watch(g: str, db: Session = Depends(get_db)):
    gd, el = _guardian(db, g)
    check(db)
    return watch_out(db, el, gd.name)


def resolve(db: Session, el: Elder, sos_id: int, by: str, by_phone: str = "") -> SosEvent:
    ev = _own_event(db, el, sos_id)
    if ev.status != "resolved":
        ev.status, ev.resolved_at, ev.resolved_by = "resolved", now(), by[:120]
        db.commit()
        _tell(db, el, ev, "handled", (f"🤝 {by} is with {el.name}", f"🤝 {by} {el.name} کے پاس ہیں"),
              (f"{by} marked the emergency as handled at {_hhmm(ev.resolved_at)}.",
               f"{by} نے {_hhmm(ev.resolved_at)} پر بتایا کہ معاملہ سنبھال لیا گیا ہے۔"), skip_phone=by_phone)
        c = _case(db, ev)
        if c is not None:
            audit(db, by, "sos_handled", "Guardian is with the elder.", c.id)
            db.commit()
    return ev


@router.post("/elder/watch/handled")
def watch_handled(g: str, sos_id: int, db: Session = Depends(get_db)):
    gd, el = _guardian(db, g)
    resolve(db, el, sos_id, gd.name, gd.phone)
    return watch_out(db, el, gd.name)


@router.post("/me/elders/{elder_id}/sos/{sos_id}/handled")
def family_handled(elder_id: int, sos_id: int, a: Account = Depends(auth.current_account), db: Session = Depends(get_db)):
    e = _family_elder(db, elder_id, a)
    resolve(db, e, sos_id, a.name, a.phone)
    return profile_out(db, e)
