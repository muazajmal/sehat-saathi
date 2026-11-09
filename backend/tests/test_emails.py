"""Booking confirmation emails: built once, only for a real confirmed booking with an email."""
from app import emails
from tests.test_api import client


def test_email_job_only_once_and_only_when_confirmed(monkeypatch):
    sent = []
    monkeypatch.setenv("N8N_EMAIL_WEBHOOK", "https://example.test/hook")
    monkeypatch.setattr(emails.httpx, "post", lambda url, json, timeout: sent.append(json))
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923007770001", "name": "Nadia", "message": "bukhar 2 din se",
                                           "email": "Nadia.Test@Example.com"}).json()
        cid, tok = case["id"], case["access_token"]
        # Not confirmed yet: nothing to send.
        assert c.get("/api/email-job", params={"c": cid, "t": tok, "kind": "confirmed"}).json() == {}
        assert c.post(f"/api/cases/{cid}/approve", json={"staff": "Dr. Test"}).status_code == 200
        assert sent and sent[-1]["kind"] == "confirmed" and sent[-1]["case_id"] == cid
        assert c.get("/api/email-job", params={"c": cid, "t": "wrong", "kind": "confirmed"}).json() == {}
        job = c.get("/api/email-job", params={"c": cid, "t": tok, "kind": "confirmed"}).json()
        assert job["to"] == "nadia.test@example.com"
        assert job["subject"].startswith("Appointment confirmed") and "کنفرم" in job["html"]
        # Never twice.
        assert c.get("/api/email-job", params={"c": cid, "t": tok, "kind": "confirmed"}).json() == {}
        st = c.get("/api/patient/status", params={"c": cid, "t": tok}).json()
        assert st["email_to"].startswith("na") and st["email_to"].endswith("@example.com")


def test_no_email_no_hook(monkeypatch):
    sent = []
    monkeypatch.setenv("N8N_EMAIL_WEBHOOK", "https://example.test/hook")
    monkeypatch.setattr(emails.httpx, "post", lambda url, json, timeout: sent.append(json))
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923007770002", "message": "sar dard", "email": "not-an-email"}).json()
        c.post(f"/api/cases/{case['id']}/approve", json={"staff": "Dr. Test"})
        assert sent == []
