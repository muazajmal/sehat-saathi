import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["GEMINI_API_KEY"] = ""  # rules-only, no network in tests
os.environ["SEED_DEMO"] = "1"
os.environ["OPEN_DESK"] = "1"  # older tests use the desk without logging in; test_auth.py turns this off

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.triage import rules_triage  # noqa: E402


def client():
    return TestClient(app)


def test_red_flags_in_three_scripts():
    assert rules_triage("seene mein dard ho raha hai").urgency == "urgent"
    assert rules_triage("سانس نہیں آ رہی").urgency == "urgent"
    assert rules_triage("I fainted this morning, I was unconscious").urgency == "urgent"
    assert rules_triage("tez bukhar hai kal se").urgency == "today"
    assert rules_triage("routine checkup chahiye").urgency == "routine"


def test_intake_holds_slot_but_does_not_book():
    with client() as c:
        r = c.post("/api/intake", json={"phone": "+923000000001", "name": "Test", "message": "tez bukhar aur ulti"})
        assert r.status_code == 201, r.text
        case = r.json()
        assert case["status"] == "pending_review"
        assert case["urgency"] == "today"
        if case["proposed_slot"]:
            assert case["proposed_slot"]["status"] == "held"


def test_urgent_case_needs_callback_and_sorts_first():
    with client() as c:
        c.post("/api/intake", json={"phone": "+923000000002", "message": "routine follow up"})
        c.post("/api/intake", json={"phone": "+923000000003", "message": "chest pain and sweating"})
        queue = c.get("/api/cases").json()
        assert queue[0]["urgency"] == "urgent"
        assert queue[0]["needs_callback"] is True


def test_doctor_approves_then_cannot_approve_twice():
    with client() as c:
        open_slot = c.get("/api/slots", params={"days": 7}).json()[0]
        case = c.post("/api/intake", json={"phone": "+923000000004", "message": "skin rash for a week"}).json()
        r = c.post(f"/api/cases/{case['id']}/approve", json={"staff": "Dr. Test", "slot_id": open_slot["id"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "approved"
        assert body["proposed_slot"]["status"] == "booked"
        assert body["reviewed_by"] == "Dr. Test"
        again = c.post(f"/api/cases/{case['id']}/approve", json={"staff": "Dr. Test"})
        assert again.status_code == 409


def test_reject_releases_slot_and_audit_records_who():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000005", "message": "general checkup"}).json()
        slot_id = case["proposed_slot"]["id"] if case["proposed_slot"] else None
        r = c.post(f"/api/cases/{case['id']}/reject", json={"staff": "Dr. Test", "note": "Refer to lab first"})
        assert r.status_code == 200
        if slot_id:
            open_ids = [s["id"] for s in c.get("/api/slots", params={"days": 7}).json()]
            assert slot_id in open_ids
        actors = {e["actor"] for e in c.get("/api/audit", params={"case_id": case["id"]}).json()}
        assert {"ai", "Dr. Test"} <= actors


def test_whatsapp_webhook_creates_case():
    with client() as c:
        payload = {
            "entry": [{"changes": [{"value": {
                "contacts": [{"wa_id": "923009998877", "profile": {"name": "Ali"}}],
                "messages": [{"from": "923009998877", "type": "text", "text": {"body": "saans lene mein mushkil"}}],
            }}]}]
        }
        r = c.post("/webhook/whatsapp", json=payload)
        assert r.status_code == 200 and len(r.json()["cases"]) == 1
        case = c.get(f"/api/cases/{r.json()['cases'][0]}").json()
        assert case["urgency"] == "urgent" and case["patient"]["name"] == "Ali"


def test_stats_shape():
    with client() as c:
        s = c.get("/api/stats").json()
        assert {"pending", "urgent_pending", "callbacks_open", "approved_today"} <= set(s)


def test_schedule_shows_patient_on_held_slot():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000010", "name": "Sched", "message": "follow up"}).json()
        slot = case["proposed_slot"]
        if not slot:
            return
        day = slot["starts_at"][:10]
        rows = c.get("/api/schedule", params={"day": day}).json()
        row = next(r for r in rows if r["id"] == slot["id"])
        assert row["status"] == "held" and row["patient"] == "Sched"


def test_demo_request():
    with client() as c:
        r = c.post("/api/leads", json={"name": "Dr. Imran", "clinic": "Care Clinic", "phone": "03001234567"})
        assert r.status_code == 201 and r.json()["clinic"] == "Care Clinic"
        bad = c.post("/api/leads", json={"name": "x", "clinic": "", "phone": "1"})
        assert bad.status_code == 422
