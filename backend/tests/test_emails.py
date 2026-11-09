"""Booking emails: one-time email jobs, only for real confirmed bookings with an email on file."""
from app import emails
from tests.test_api import client


def hook(monkeypatch):
    sent = []
    monkeypatch.setenv("N8N_EMAIL_WEBHOOK", "https://example.test/hook")
    monkeypatch.setattr(emails.httpx, "post", lambda url, json, timeout: sent.append(json))
    return sent


def test_confirmation_email_job_given_once(monkeypatch):
    sent = hook(monkeypatch)
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923007770001", "name": "Nadia", "message": "bukhar 2 din se",
                                           "email": "Nadia.Test@Example.com"}).json()
        cid, tok = case["id"], case["access_token"]
        assert sent == []  # nothing until a doctor confirms
        assert c.post(f"/api/cases/{cid}/approve", json={"staff": "Dr. Test"}).status_code == 200
        job = sent[-1]
        assert set(job) >= {"job_id", "token"} and "@" not in str(job)  # n8n never gets the address or text
        assert c.get("/api/email-job", params={"j": job["job_id"], "t": "wrong"}).json() == {}
        got = c.get("/api/email-job", params={"j": job["job_id"], "t": job["token"]}).json()
        assert got["to"] == "nadia.test@example.com"
        assert got["subject"].startswith("Appointment confirmed") and "کنفرم" in got["html"]
        assert c.get("/api/email-job", params={"j": job["job_id"], "t": job["token"]}).json() == {}  # once only
        st = c.get("/api/patient/status", params={"c": cid, "t": tok}).json()
        assert st["email_to"].startswith("na") and st["email_to"].endswith("@example.com")


def test_no_email_no_hook(monkeypatch):
    sent = hook(monkeypatch)
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923007770002", "message": "sar dard", "email": "not-an-email"}).json()
        c.post(f"/api/cases/{case['id']}/approve", json={"staff": "Dr. Test"})
        assert sent == []
