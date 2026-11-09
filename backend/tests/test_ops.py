"""Multi-hospital, no-shows, reports, password reset, delete my data, rate limits."""
from datetime import timedelta

from app import emails
from app.db import SessionLocal
from app.models import Case, Slot
from app.services import now
from tests.test_api import client


def bearer(t):
    return {"Authorization": f"Bearer {t}"}


def staff_login(c, phone, pw):
    r = c.post("/api/auth/login", json={"phone": phone, "password": pw, "portal": "staff"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_new_hospital_applies_owner_approves_and_data_stays_apart(monkeypatch):
    monkeypatch.delenv("OPEN_DESK", raising=False)
    with client() as c:
        r = c.post("/api/tenants/apply", json={"name": "Al-Shifa Trust Clinic", "city": "Multan", "phone": "061 1234567",
                                               "admin_name": "Sana Admin", "admin_phone": "0321 9990001", "password": "clinic1234"})
        assert r.status_code == 201
        slug = r.json()["slug"]
        # Pending: admin can't log in, patients can't pick it.
        assert c.post("/api/auth/login", json={"phone": "03219990001", "password": "clinic1234", "portal": "staff"}).status_code == 403
        assert slug not in [t["slug"] for t in c.get("/api/tenants").json()]
        # Owner: claimed once, then closed.
        own = c.post("/api/owner/claim", json={"name": "Muaz", "phone": "0300 5550000", "password": "owner12345"})
        assert own.status_code == 201
        assert c.post("/api/owner/claim", json={"name": "Xy", "phone": "0300 5550001", "password": "owner12345"}).status_code == 409
        ot = own.json()["token"]
        tid = next(t["id"] for t in c.get("/api/owner/tenants", headers=bearer(ot)).json() if t["slug"] == slug)
        assert c.post(f"/api/owner/tenants/{tid}/status", params={"status": "active"}, headers=bearer(ot)).status_code == 200
        assert slug in [t["slug"] for t in c.get("/api/tenants").json()]
        # The new hospital's admin adds a doctor; a patient asks that hospital for help.
        adm = staff_login(c, "03219990001", "clinic1234")
        c.post("/api/admin/accounts", headers=bearer(adm), json={"phone": "0321 9990002", "name": "Hina Rauf", "password": "doctor999"})
        case = c.post("/api/intake", json={"phone": "+923119994444", "message": "bukhar hai", "hospital": slug}).json()
        assert case["proposed_slot"] and case["proposed_slot"]["doctor"] == "Dr. Hina Rauf"
        # Each desk sees only its own patients.
        main_doc = staff_login(c, "03000000002", "doctor123")
        assert case["id"] not in [x["id"] for x in c.get("/api/cases", headers=bearer(main_doc)).json()]
        assert c.get(f"/api/cases/{case['id']}", headers=bearer(main_doc)).status_code == 404
        assert c.post(f"/api/cases/{case['id']}/approve", headers=bearer(main_doc), json={"staff": "Someone"}).status_code == 404
        assert case["id"] in [x["id"] for x in c.get("/api/cases", headers=bearer(adm)).json()]
        team = c.get("/api/admin/accounts", headers=bearer(adm)).json()
        assert {a["name"] for a in team} == {"Sana Admin", "Dr. Hina Rauf"}
        # Suspended: staff locked out.
        c.post(f"/api/owner/tenants/{tid}/status", params={"status": "suspended"}, headers=bearer(ot))
        assert c.get("/api/cases", headers=bearer(adm)).status_code == 403
        assert c.get("/api/owner/tenants", headers=bearer(adm)).status_code == 403


def test_reminders_reply_attendance_and_reports(monkeypatch):
    sent = []
    monkeypatch.setenv("N8N_EMAIL_WEBHOOK", "https://example.test/hook")
    monkeypatch.setattr(emails.httpx, "post", lambda url, json, timeout: sent.append(json))
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923128887777", "name": "Asma", "message": "khansi 5 din se",
                                           "email": "asma@example.com"}).json()
        cid, tok = case["id"], case["access_token"]
        c.post(f"/api/cases/{cid}/approve", json={"staff": "Dr. Test"})
        # Pretend it was booked 2 days ago for 90 minutes from now: the 2-hour reminder is due.
        with SessionLocal() as db:
            cs = db.get(Case, cid)
            cs.reviewed_at = now() - timedelta(days=2)
            cs.proposed_slot.starts_at = now() + timedelta(minutes=90)
            db.commit()
        r = c.post("/api/cron/tick").json()
        assert r["appointment_soon"] == 1
        assert c.post("/api/cron/tick").json()["appointment_soon"] == 0  # only once
        with SessionLocal() as db:  # this patient got the confirmation email and the reminder email
            from app.models import EmailJob
            keys = {j.key for j in db.query(EmailJob).all()}
        assert {f"case:{cid}:confirmed", f"case:{cid}:reminder-soon"} <= keys
        assert c.post("/api/patient/reply", params={"c": cid, "t": "bad", "reply": "coming"}).status_code == 403
        assert c.post("/api/patient/reply", params={"c": cid, "t": tok, "reply": "coming"}).json()["patient_reply"] == "coming"
        st = c.get("/api/patient/status", params={"c": cid, "t": tok}).json()
        assert st["patient_reply"] == "coming"
        assert c.post(f"/api/cases/{cid}/attendance", json={"value": "arrived"}).json()["attendance"] == "arrived"
        # A second booking that the patient cancels frees the slot.
        c2 = c.post("/api/intake", json={"phone": "+923128887778", "message": "kharish"}).json()
        c.post(f"/api/cases/{c2['id']}/approve", json={"staff": "Dr. Test"})
        c.post("/api/patient/reply", params={"c": c2["id"], "t": c2["access_token"], "reply": "cancelled"})
        with SessionLocal() as db:
            assert db.get(Slot, db.get(Case, c2["id"]).proposed_slot_id).status == "open"
        rep = c.get("/api/reports", params={"days": 7}).json()
        assert rep["totals"]["arrived"] >= 1 and rep["totals"]["cancelled"] >= 1 and rep["totals"]["requests"] >= 2
        assert len(rep["series"]) == 7 and any(x["key"] == "cough" for x in rep["complaints"])
        csv_text = c.get("/api/reports/cases.csv", params={"days": 7}).text
        assert csv_text.startswith("case_id,") and "+92312" not in csv_text and "Asma" not in csv_text


def test_forgot_reset_and_delete(monkeypatch):
    sent = []
    monkeypatch.setenv("N8N_EMAIL_WEBHOOK", "https://example.test/hook")
    monkeypatch.setattr(emails.httpx, "post", lambda url, json, timeout: sent.append(json))
    with client() as c:
        s = c.post("/api/auth/signup", json={"phone": "0333 4441111", "name": "Rubina", "password": "old-pass1",
                                            "email": "rubina@example.com"}).json()
        same = c.post("/api/auth/forgot", json={"phone": "0333 4441111"}).json()
        assert same == c.post("/api/auth/forgot", json={"phone": "0333 9999999"}).json()  # no hint which numbers exist
        job = sent[-1]
        mail = c.get("/api/email-job", params={"j": job["job_id"], "t": job["token"]}).json()
        link = mail["html"].split("/reset?")[1].split('"')[0].replace("&amp;", "&")
        u, t = link.split("u=")[1].split("&t=")
        assert c.post("/api/auth/reset", json={"u": int(u), "t": t, "password": "new-pass2"}).status_code == 200
        assert c.post("/api/auth/reset", json={"u": int(u), "t": t, "password": "again123"}).status_code == 400  # used
        tok = c.post("/api/auth/login", json={"phone": "03334441111", "password": "new-pass2"}).json()["token"]
        assert c.post("/api/me/delete", headers=bearer(tok), json={"password": "wrong"}).status_code == 401
        assert c.post("/api/me/delete", headers=bearer(tok), json={"password": "new-pass2"}).status_code == 200
        assert c.post("/api/auth/login", json={"phone": "03334441111", "password": "new-pass2"}).status_code == 401
        del s


def test_wrong_passwords_are_limited():
    with client() as c:
        for _ in range(8):
            c.post("/api/auth/login", json={"phone": "0300 0000002", "password": "nope", "portal": "staff"})
        r = c.post("/api/auth/login", json={"phone": "0300 0000002", "password": "doctor123", "portal": "staff"})
        assert r.status_code == 429
