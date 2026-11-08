"""Help first, money after."""
from app.billing import transport_fee

from tests.test_api import client

GULGASHT = {"lat": 30.2297, "lng": 71.4789}


def test_fee_rounding():
    assert transport_fee(0) == 300
    assert transport_fee(5.01) == 510  # 300 + 200.4 -> rounded up to 510


def test_no_fee_until_help_given_then_patient_sees_it():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000601", "message": "chest pain", **GULGASHT}).json()
        tok = case["access_token"]
        st = c.get(f"/api/patient/status?c={case['id']}&t={tok}").json()
        assert st["charges"] == []

        opts = c.get(f"/api/cases/{case['id']}/transport").json()
        d = c.post(f"/api/cases/{case['id']}/dispatch", json={
            "staff": "Dr Test", "responder_id": opts["responders"][0]["id"], "hospital_id": "cardiology"}).json()
        c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "reached_patient"})
        # Still on the way: no fee yet.
        assert c.get(f"/api/cases/{case['id']}/charges").json() == []
        c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "at_hospital"})

        fees = c.get(f"/api/cases/{case['id']}/charges").json()
        assert len(fees) == 1 and fees[0]["kind"] == "transport" and fees[0]["status"] == "due"
        assert fees[0]["amount_pkr"] >= 300 and fees[0]["amount_pkr"] % 10 == 0
        assert c.get(f"/api/patient/status?c={case['id']}&t={tok}").json()["charges"][0]["status"] == "due"

        bad = c.post(f"/api/charges/{fees[0]['id']}/settle", json={"staff": "Desk", "status": "paid"})
        assert bad.status_code == 422  # must say how it was paid
        paid = c.post(f"/api/charges/{fees[0]['id']}/settle",
                      json={"staff": "Desk", "status": "paid", "method": "jazzcash"}).json()
        assert paid["status"] == "paid" and paid["method"] == "jazzcash"
        again = c.post(f"/api/charges/{fees[0]['id']}/settle", json={"staff": "Desk", "status": "waived"})
        assert again.status_code == 409


def test_visit_fee_only_after_booking_and_can_be_waived():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000602", "message": "routine follow up"}).json()
        assert c.post(f"/api/cases/{case['id']}/charges", json={"staff": "Desk"}).status_code == 409
        slots = c.get("/api/slots?status=open&days=7").json()
        c.post(f"/api/cases/{case['id']}/approve", json={"staff": "Dr Test", "slot_id": slots[0]["id"]})
        fee = c.post(f"/api/cases/{case['id']}/charges", json={"staff": "Desk", "amount_pkr": 700}).json()
        assert fee["amount_pkr"] == 700 and fee["kind"] == "visit"
        assert c.post(f"/api/cases/{case['id']}/charges", json={"staff": "Desk"}).status_code == 409
        w = c.post(f"/api/charges/{fee['id']}/settle", json={"staff": "Desk", "status": "waived", "note": "Zakat"}).json()
        assert w["status"] == "waived"
        assert c.get("/api/prices").json()["visit_fee_pkr"] == 500
