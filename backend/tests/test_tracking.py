"""Live tracking: demo simulation moves, real GPS needs the private link, distances shrink."""
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from app import dispatch as dispatch_mod
from app.services import now as real_now

from tests.test_api import client

GULGASHT = {"lat": 30.2297, "lng": 71.4789}


def _send(c, phone, message):
    case = c.post("/api/intake", json={"phone": phone, "message": message, **GULGASHT}).json()
    opts = c.get(f"/api/cases/{case['id']}/transport").json()
    d = c.post(f"/api/cases/{case['id']}/dispatch", json={
        "staff": "Dr Test", "responder_id": opts["responders"][0]["id"], "hospital_id": opts["hospitals"][0]["id"],
    }).json()
    return case, d


def test_demo_trip_is_simulated_and_moves(monkeypatch):
    with client() as c:
        _, d = _send(c, "+923000000301", "seene mein dard")
        assert "/responder?d=" in d["tracking_link"]
        t0 = c.get(f"/api/dispatches/{d['id']}/track").json()
        assert t0["mode"] == "simulated" and t0["phase"] == "to_patient"

        later = real_now() + timedelta(seconds=dispatch_mod.DEMO_LEG_SECONDS // 2)
        monkeypatch.setattr(dispatch_mod, "now", lambda: later)
        mid = c.get(f"/api/dispatches/{d['id']}/track").json()
        assert mid["km_to_patient"] < t0["km_to_patient"] or t0["km_to_patient"] == 0
        assert mid["progress"] >= t0["progress"]

        arrived = real_now() + timedelta(seconds=dispatch_mod.DEMO_LEG_SECONDS + 5)
        monkeypatch.setattr(dispatch_mod, "now", lambda: arrived)
        assert c.get(f"/api/dispatches/{d['id']}/track").json()["phase"] == "waiting_at_patient"

        monkeypatch.setattr(dispatch_mod, "now", real_now)
        c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "reached_patient"})
        leg2 = c.get(f"/api/dispatches/{d['id']}/track").json()
        assert leg2["phase"] == "to_hospital" and leg2["km_to_hospital"] > 0

        c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "at_hospital"})
        done = c.get(f"/api/dispatches/{d['id']}/track").json()
        assert done["phase"] == "at_hospital" and done["progress"] == 1 and done["km_to_hospital"] == 0


def test_gps_needs_the_private_link_and_goes_live():
    with client() as c:
        _, d = _send(c, "+923000000302", "bachay ko tez bukhar")
        token = parse_qs(urlparse(d["tracking_link"]).query)["t"][0]
        bad = c.post(f"/api/dispatches/{d['id']}/position", json={"token": "x" * 16, "lat": 30.2, "lng": 71.47})
        assert bad.status_code == 403
        assert c.get(f"/api/responder-trip?d={d['id']}&t={'x' * 16}").status_code == 403

        trip = c.get(f"/api/responder-trip?d={d['id']}&t={token}").json()
        assert trip["pickup"]["lat"] == GULGASHT["lat"]

        live = c.post(f"/api/dispatches/{d['id']}/position",
                      json={"token": token, "lat": 30.2250, "lng": 71.4750, "accuracy_m": 12}).json()
        assert live["mode"] == "live" and live["last_fix_seconds"] == 0
        closer = c.post(f"/api/dispatches/{d['id']}/position",
                        json={"token": token, "lat": 30.2290, "lng": 71.4785}).json()
        assert closer["km_to_patient"] < live["km_to_patient"]
        assert len(closer["trail"]) == 2

        c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "cancelled"})
        ended = c.post(f"/api/dispatches/{d['id']}/position", json={"token": token, "lat": 30.2, "lng": 71.47})
        assert ended.status_code == 409
