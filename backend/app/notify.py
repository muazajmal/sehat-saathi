"""Outbound messages: WhatsApp replies and urgent-case escalation.

Both are no-ops (logged only) until their env vars are set, so the demo
runs without any accounts.
"""
import logging

import httpx

from .config import settings

log = logging.getLogger("sehat.notify")


def send_whatsapp(to_phone: str, text: str) -> bool:
    if not (settings.whatsapp_token and settings.whatsapp_phone_id):
        log.info("[whatsapp:dry-run] to=%s text=%s", to_phone, text[:120])
        return False
    try:
        r = httpx.post(
            f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_id}/messages",
            headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
            json={
                "messaging_product": "whatsapp",
                "to": to_phone.lstrip("+"),
                "type": "text",
                "text": {"body": text},
            },
            timeout=10,
        )
        r.raise_for_status()
        return True
    except Exception as exc:
        log.warning("WhatsApp send failed: %s", exc)
        return False


def escalate(case_payload: dict) -> bool:
    """Ping n8n so it can ring the duty doctor (Retell / Twilio call, SMS, etc.)."""
    if not settings.n8n_escalation_webhook:
        log.info("[escalate:dry-run] case=%s", case_payload.get("id"))
        return False
    try:
        httpx.post(
            settings.n8n_escalation_webhook,
            json=case_payload,
            headers={"User-Agent": "SehatSaathi-Backend/1.0"},
            timeout=8,
        ).raise_for_status()
        return True
    except Exception as exc:
        log.warning("Escalation webhook failed: %s", exc)
        return False
