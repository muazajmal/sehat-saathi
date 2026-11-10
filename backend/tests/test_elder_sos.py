"""Elder emergency button: sign-in with PIN, guardians, and the 1-minute no-response alert."""
from datetime import timedelta

import pytest

from app.db import SessionLocal
from app.models import EmailJob, SosEvent
from app.services import now
from tests.test_api import client
from tests.test_community import bearer, patient


def _clear_rate_limits():
    from app.models import Attempt

    with SessionLocal() as db:
        db.query(Attempt).delete()
        db.commit()


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch):
    # These tests sign up many family members; keep the per-IP sign-up limit from leaking into other tests.
    monkeypatch.setenv("N8N_EMAIL_WEBHOOK", "off")
    monkeypatch.delenv("N8N_SOS_WEBHOOK", raising=False)
    _clear_rate_limits()
    yield
    _clear_rate_limits()


def setup_elder(c, fam_phone, elder_phone):
    t = patient(c, fam_phone, "Bilal Son")
    e = c.post("/api/me/elders", headers=bearer(t), json={"name": "Abba Ji", "phone": elder_phone}).json()
    eid = e["id"]
    r = c.put(f"/api/me/elders/{eid}/profile", headers=bearer(t), json={
        "pin": "4321", "age": 72, "conditions": "Heart patient, high BP", "medicines": "Aspirin 75mg",
        "allergies": "", "blood_group": "B+"})
    assert r.status_code == 200, r.text
    assert r.json()["has_pin"] is True
    r = c.post(f"/api/me/elders/{eid}/guardians", headers=bearer(t), json={
        "name": "Sara Daughter", "relation": "Daughter", "phone": "0301 2223334", "email": "sara.test@example.com"})
    assert r.status_code == 201, r.text
    return t, eid


def login(c, phone, pin="4321"):
    return c.post("/api/elder/login", json={"phone": phone, "pin": pin})


def inbox_titles(c, t):
    return [n["title"] for n in c.get("/api/me/inbox", headers=bearer(t)).json()]


def test_pin_login_and_wrong_pin():
    with client() as c:
        setup_elder(c, "0322 1110001", "0322 1110002")
        assert login(c, "0322 1110002", "0000").status_code == 401
        r = login(c, "0322 1110002")
        assert r.status_code == 200
        me = c.get("/api/elder/me", params={"e": r.json()["e"], "t": r.json()["t"]}).json()
        assert me["name"] == "Abba Ji" and "Heart patient" in me["card"]
        assert [g["name"] for g in me["guardians"]] == ["Bilal Son", "Sara Daughter"]
        assert me["sos"] is None


def test_sos_no_response_after_one_minute_alerts_every_guardian_once():
    with client() as c:
        fam, eid = setup_elder(c, "0322 2220001", "0322 2220002")
        sara = patient(c, "0301 2223334", "Sara Daughter")  # the extra guardian also has the app
        cred = login(c, "0322 2220002").json()
        q = {"e": cred["e"], "t": cred["t"]}

        ev = c.post("/api/elder/sos", params=q, json={"lat": 30.1975, "lng": 71.4697}).json()
        assert ev["status"] == "waiting" and 55 <= ev["seconds_left"] <= 60
        assert any("pressed the EMERGENCY button" in x for x in inbox_titles(c, fam))
        assert any("pressed the EMERGENCY button" in x for x in inbox_titles(c, sara))
        # Pressing again is the same alarm, not a second one.
        assert c.post("/api/elder/sos", params=q).json()["id"] == ev["id"]

        # Urgent case on the desk, with the medical card and location.
        case = next(x for x in c.get("/api/cases").json() if x["id"] == ev["case_id"])
        assert case["urgency"] == "urgent" and "EMERGENCY BUTTON" in case["message"] and "B+" in case["message"]
        assert "Elder emergency button" in case["red_flags"]

        # Before the minute is up: nothing more.
        c.post("/api/sos/check")
        assert not any("did not respond" in x for x in inbox_titles(c, fam))

        # The minute runs out.
        with SessionLocal() as db:
            db.get(SosEvent, ev["id"]).respond_by = now() - timedelta(seconds=1)
            db.commit()
        assert c.post("/api/sos/check").json()["escalated"] == 1
        assert c.post("/api/sos/check").json()["escalated"] == 0  # only once
        c.get("/api/cases")  # the desk polling again changes nothing
        for t in (fam, sara):
            assert sum("did not respond after pressing EMERGENCY" in x for x in inbox_titles(c, t)) == 1
        state = c.get(f"/api/elder/sos/{ev['id']}", params=q).json()
        assert state["status"] == "no_response" and state["map"].startswith("https://maps.google.com/?q=30.1975")
        case = next(x for x in c.get("/api/cases").json() if x["id"] == ev["case_id"])
        assert "No response 1 min after SOS" in case["red_flags"]

        # Emails queued for the guardian who gave one: pressed + no response.
        with SessionLocal() as db:
            subjects = [j.subject for j in db.query(EmailJob).filter(EmailJob.to == "sara.test@example.com")]
        assert any("pressed the EMERGENCY" in s for s in subjects) and any("did not respond" in s for s in subjects)

        # Guardian page via their private link, then "I'm handling it".
        fam_prof = c.get(f"/api/me/elders/{eid}/profile", headers=bearer(fam)).json()
        assert fam_prof["sos"]["status"] == "no_response"
        with SessionLocal() as db:
            from app.models import ElderGuardian
            g = db.query(ElderGuardian).filter(ElderGuardian.elder_id == eid).first().token
        w = c.get("/api/elder/watch", params={"g": g}).json()
        assert w["sos"]["status"] == "no_response"
        w = c.post("/api/elder/watch/handled", params={"g": g, "sos_id": ev["id"]}).json()
        assert w["sos"]["status"] == "resolved" and w["sos"]["resolved_by"] == "Sara Daughter"
        assert any("is with Abba Ji" in x for x in inbox_titles(c, fam))
        assert c.get("/api/elder/watch", params={"g": "bad"}).status_code == 403


def test_sos_answered_okay_does_not_escalate():
    with client() as c:
        fam, _ = setup_elder(c, "0322 3330001", "0322 3330002")
        cred = login(c, "0322 3330002").json()
        q = {"e": cred["e"], "t": cred["t"]}
        ev = c.post("/api/elder/sos", params=q).json()
        r = c.post(f"/api/elder/sos/{ev['id']}/respond", params={**q, "answer": "okay"}).json()
        assert r["status"] == "okay"
        with SessionLocal() as db:
            db.get(SosEvent, ev["id"]).respond_by = now() - timedelta(seconds=5)
            db.commit()
        assert c.post("/api/sos/check").json()["escalated"] == 0
        titles = inbox_titles(c, fam)
        assert any("says they are okay" in x for x in titles) and not any("did not respond" in x for x in titles)
        # A new press after that is a new alarm.
        assert c.post("/api/elder/sos", params=q).json()["id"] != ev["id"]


def test_sos_help_answer_and_bad_token():
    with client() as c:
        fam, _ = setup_elder(c, "0322 4440001", "0322 4440002")
        cred = login(c, "0322 4440002").json()
        q = {"e": cred["e"], "t": cred["t"]}
        assert c.post("/api/elder/sos", params={"e": cred["e"], "t": "nope"}).status_code == 403
        ev = c.post("/api/elder/sos", params=q).json()
        r = c.post(f"/api/elder/sos/{ev['id']}/respond", params={**q, "answer": "help"}).json()
        assert r["status"] == "help"
        assert any("needs an ambulance" in x for x in inbox_titles(c, fam))
        case = next(x for x in c.get("/api/cases").json() if x["id"] == ev["case_id"])
        assert "Elder asked for an ambulance" in case["red_flags"]


def test_pin_needs_phone_and_guardian_needs_contact():
    with client() as c:
        t = patient(c, "0322 5550001", "Family")
        eid = c.post("/api/me/elders", headers=bearer(t), json={"name": "Nani Amma"}).json()["id"]
        assert c.put(f"/api/me/elders/{eid}/profile", headers=bearer(t), json={"pin": "1234"}).status_code == 422
        assert c.post(f"/api/me/elders/{eid}/guardians", headers=bearer(t), json={"name": "Ali"}).status_code == 422
        other = patient(c, "0322 5550009", "Stranger")
        assert c.get(f"/api/me/elders/{eid}/profile", headers=bearer(other)).status_code == 404
