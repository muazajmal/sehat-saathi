"""Notifications: an in-app inbox, free phone notifications (web push from the installed app),
and an optional n8n hook (N8N_NOTIFY_WEBHOOK) where WhatsApp/Telegram/SMS can be plugged in later."""
import base64
import hashlib
import json
import logging
import os

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .models import Notification, PushSub
from .services import now

log = logging.getLogger(__name__)
_vapid = None


def vapid():
    """VAPID key pair for web push. VAPID_PRIVATE_KEY (PEM) if set; otherwise derived from the app's
    secret, so it stays the same across serverless instances with no setup."""
    global _vapid
    if _vapid is not None:
        return _vapid
    from cryptography.hazmat.primitives.asymmetric import ec
    from py_vapid import Vapid02

    pem = os.getenv("VAPID_PRIVATE_KEY")
    if pem:
        _vapid = Vapid02.from_pem(pem.encode())
    else:
        seed = os.getenv("AUTH_SECRET") or ("sehat-saathi:" + settings.database_url)
        n = int("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)
        d = int.from_bytes(hashlib.sha256(("vapid:" + seed).encode()).digest(), "big") % (n - 1) + 1
        _vapid = Vapid02(private_key=ec.derive_private_key(d, ec.SECP256R1()))
    return _vapid


def public_key() -> str:
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    raw = vapid().public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def subscribe(db: Session, owner: str, sub: dict, lang: str = "ur"):
    endpoint = sub["endpoint"]
    keys = sub.get("keys") or {}
    row = db.scalar(select(PushSub).where(PushSub.endpoint == endpoint))
    if row is None:
        row = PushSub(endpoint=endpoint, created_at=now(), owner=owner, p256dh=keys.get("p256dh", ""), auth=keys.get("auth", ""),
                      lang=lang)
        db.add(row)
    else:
        row.owner, row.p256dh, row.auth = owner, keys.get("p256dh", row.p256dh), keys.get("auth", row.auth)
        row.lang = lang
    db.commit()


def push(db: Session, owner: str, title: str, body: str, link: str = "", ur: tuple[str, str] | None = None) -> int:
    """Send to every phone of this owner. Dead subscriptions are removed. Returns how many got it."""
    subs = list(db.scalars(select(PushSub).where(PushSub.owner == owner)))
    if not subs:
        return 0
    try:
        from pywebpush import WebPushException, webpush
    except Exception:
        return 0
    sent = 0
    for s in subs:
        t, b = ur if (ur and ur[0] and (s.lang or "ur") == "ur") else (title, body)
        payload = json.dumps({"title": t, "body": b, "link": link or "/app"})
        try:
            webpush({"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}}, payload,
                    vapid_private_key=vapid(), vapid_claims={"sub": os.getenv("VAPID_SUBJECT", settings.frontend_url or "https://sehat-saathi.app")},
                    timeout=8)
            sent += 1
        except WebPushException as e:
            if getattr(e, "response", None) is not None and e.response.status_code in (404, 410):
                db.delete(s)
        except Exception as e:  # network trouble: try again next time
            log.warning("push failed: %s", e)
    db.commit()
    return sent


def notify(db: Session, phone: str, kind: str, title: str, body: str, link: str = "", dedupe: str | None = None,
           push_owner: str | None = None, ur: tuple[str, str] | None = None) -> bool:
    """Inbox + phone notification + n8n hook. With `dedupe`, the same message is only ever sent once.
    `ur` is the (title, body) in Urdu; each person sees the language they chose."""
    n = Notification(phone=phone, kind=kind, title=title[:160], body=body, link=link, dedupe=dedupe, created_at=now(),
                     title_ur=(ur[0] if ur else "")[:200], body_ur=ur[1] if ur else "")
    db.add(n)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    push(db, push_owner or f"phone:{phone}", title, body, link, ur)
    hook = os.getenv("N8N_NOTIFY_WEBHOOK")
    if hook:
        try:
            httpx.post(hook, json={"phone": phone, "kind": kind, "title": title, "body": body,
                                   "link": (settings.frontend_url or "") + link}, timeout=6)
        except Exception as e:
            log.warning("n8n notify hook failed: %s", e)
    return True
