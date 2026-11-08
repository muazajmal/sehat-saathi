"""Public patient site vs private clinic desk."""
from urllib.parse import parse_qs, urlparse

from app.config import settings

from tests.test_api import client


def test_desk_needs_code_when_set_and_patient_site_stays_public(monkeypatch):
    monkeypatch.setattr(settings, "staff_key", "test-code-123")
    with client() as c:
        assert c.get("/api/health").json()["staff_code_required"] is True
        # Anyone who is ill can still send their problem.
        r = c.post("/api/intake", json={"phone": "+923000000401", "name": "Amina", "message": "seene mein dard"})
        assert r.status_code == 201
        case = r.json()
        assert case["access_token"] and "/patient/status?c=" in case["status_link"]

        # But nobody can read the queue or act on cases without the code.
        for method, path in [("get", "/api/cases"), ("get", "/api/stats"), ("get", f"/api/cases/{case['id']}"),
                             ("get", f"/api/cases/{case['id']}/transport"), ("get", "/api/audit"),
                             ("post", f"/api/cases/{case['id']}/reject")]:
            res = getattr(c, method)(path, **({"json": {"staff": "X", "note": "no"}} if method == "post" else {}))
            assert res.status_code == 401, path
        assert c.get("/api/cases", headers={"X-Staff-Key": "wrong"}).status_code == 401
        assert c.get("/api/cases", headers={"X-Staff-Key": "test-code-123"}).status_code == 200


def test_patient_sees_only_their_own_case_and_live_responder():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000402", "name": "Bilqees",
                                           "message": "سینے میں درد ہے"}).json()
        token = case["access_token"]
        assert c.get(f"/api/patient/status?c={case['id']}&t={'x' * 16}").status_code == 403
        other = c.post("/api/intake", json={"phone": "+923000000403", "message": "bukhar"}).json()
        assert c.get(f"/api/patient/status?c={other['id']}&t={token}").status_code == 403

        st = c.get(f"/api/patient/status?c={case['id']}&t={token}").json()
        assert st["call_1122"] is True and st["location_shared"] is False and st["trip"] is None
        assert st["reply"] == case["reply_ur"]

        st = c.post("/api/patient/location", json={"c": case["id"], "t": token, "lat": 30.2297, "lng": 71.4789}).json()
        assert st["location_shared"] is True

        opts = c.get(f"/api/cases/{case['id']}/transport").json()
        d = c.post(f"/api/cases/{case['id']}/dispatch", json={
            "staff": "Dr Test", "responder_id": opts["responders"][0]["id"], "hospital_id": "cardiology"}).json()
        trip = c.get(f"/api/patient/status?c={case['id']}&t={token}").json()["trip"]
        assert trip and trip["phase"] in ("to_patient", "waiting_at_patient") and trip["km_away"] >= 0
        assert "(" not in trip["responder"]  # first name only, e.g. "Bilal"

        # Responder moves the trip on from their phone with their own private link.
        rtoken = parse_qs(urlparse(d["tracking_link"]).query)["t"][0]
        assert c.post(f"/api/dispatches/{d['id']}/responder-status",
                      json={"token": "bad-token-xx", "status": "reached_patient"}).status_code == 403
        ok = c.post(f"/api/dispatches/{d['id']}/responder-status", json={"token": rtoken, "status": "reached_patient"})
        assert ok.status_code == 200 and ok.json()["status"] == "reached_patient"
        assert c.get(f"/api/patient/status?c={case['id']}&t={token}").json()["trip"]["phase"] == "to_hospital"
        c.post(f"/api/dispatches/{d['id']}/responder-status", json={"token": rtoken, "status": "at_hospital"})
