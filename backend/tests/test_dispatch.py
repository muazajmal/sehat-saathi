"""Getting patients to hospital: right hospital, nearest free responder, staff approval, 1122 first."""
from app.transport import needed_specialty, rank_hospitals

from tests.test_api import client

GULGASHT = {"lat": 30.2297, "lng": 71.4789}


def test_chest_pain_goes_to_cardiology_and_child_to_childrens():
    need, _ = needed_specialty(["Chest pain"], "general", "")
    assert need == "cardiac"
    assert rank_hospitals(GULGASHT["lat"], GULGASHT["lng"], need)[0]["id"] == "cardiology"
    need, _ = needed_specialty(["Infant high fever"], "paediatrics", "")
    assert rank_hospitals(GULGASHT["lat"], GULGASHT["lng"], need)[0]["id"] == "children"
    need, _ = needed_specialty([], "general", "haath jal gaya hai")
    assert rank_hospitals(GULGASHT["lat"], GULGASHT["lng"], need)[0]["id"] == "burns"


def test_full_dispatch_flow_with_1122_first():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000101", "name": "Dispatch test",
                                           "message": "seene mein dard aur paseena"}).json()
        assert case["urgency"] == "urgent"

        # No location yet: options say 1122 first, but nothing to dispatch to.
        opts = c.get(f"/api/cases/{case['id']}/transport").json()
        assert opts["tier"] == "emergency" and opts["call_1122"] is True
        assert opts["location"] is None and opts["responders"] == []
        r = c.post(f"/api/cases/{case['id']}/dispatch",
                   json={"staff": "Dr Test", "responder_id": 1, "hospital_id": "cardiology"})
        assert r.status_code == 409

        c.post(f"/api/cases/{case['id']}/location", json={**GULGASHT, "label": "Gulgasht", "source": "web"})
        opts = c.get(f"/api/cases/{case['id']}/transport").json()
        assert opts["hospitals"][0]["id"] == "cardiology"
        nearest = opts["responders"][0]
        assert nearest["distance_km"] <= opts["responders"][-1]["distance_km"]

        d = c.post(f"/api/cases/{case['id']}/dispatch",
                   json={"staff": "Dr Test", "responder_id": nearest["id"], "hospital_id": "cardiology"})
        assert d.status_code == 201, d.text
        d = d.json()
        assert d["tier"] == "emergency" and d["status"] == "dispatched"
        assert d["responder"]["status"] == "busy"

        # Same responder can't be sent twice; same patient can't get a second active trip.
        other = c.post("/api/intake", json={"phone": "+923000000102", "message": "bachay ko tez bukhar",
                                            **GULGASHT}).json()
        r = c.post(f"/api/cases/{other['id']}/dispatch",
                   json={"staff": "Dr Test", "responder_id": nearest["id"], "hospital_id": "children"})
        assert r.status_code == 409
        r = c.post(f"/api/cases/{case['id']}/dispatch",
                   json={"staff": "Dr Test", "responder_id": opts["responders"][1]["id"], "hospital_id": "cardiology"})
        assert r.status_code == 409

        # Status must move forward in order.
        assert c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "at_hospital"}).status_code == 409
        assert c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "reached_patient"}).status_code == 200
        done = c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "at_hospital"}).json()
        assert done["status"] == "at_hospital" and done["responder"]["status"] == "available"

        actions = [a["action"] for a in c.get(f"/api/audit?case_id={case['id']}").json()]
        for a in ("location_shared", "dispatched", "dispatch_reached_patient", "dispatch_at_hospital"):
            assert a in actions


def test_patient_message_is_in_their_language():
    from app.languages import dispatch_reply

    msg = dispatch_reply("emergency", "ps", responder="Bilal", hospital="Institute of Cardiology", eta="9")
    assert "1122" in msg and "Bilal" in msg
    msg = dispatch_reply("transport", "skr", responder="Bilal", hospital="Children's Hospital", eta="9")
    assert "1122" not in msg and "تہاکوں" in msg


def test_whatsapp_shared_location_attaches_to_latest_case():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000103", "message": "bukhar hai"}).json()
        payload = {"entry": [{"changes": [{"value": {"messages": [{
            "from": "923000000103", "type": "location",
            "location": {"latitude": 30.20, "longitude": 71.47, "name": "Home"}}]}}]}]}
        assert c.post("/webhook/whatsapp", json=payload).status_code == 200
        loc = c.get(f"/api/cases/{case['id']}/transport").json()["location"]
        assert loc and loc["source"] == "whatsapp" and loc["label"] == "Home"
