"""Service area: partner hospitals are in Multan, so far-away patients are told to call 1122."""
from tests.test_api import client

LAHORE = {"lat": 31.4316, "lng": 74.3502, "label": "DHA Lahore", "source": "web"}
GULGASHT = {"lat": 30.2297, "lng": 71.4789, "label": "Gulgasht", "source": "web"}


def _case(c, phone):
    return c.post("/api/intake", json={"phone": phone, "message": "seene mein dard aur paseena"}).json()


def test_patient_in_lahore_is_not_sent_a_multan_responder():
    with client() as c:
        case = _case(c, "+923000000901")
        c.post(f"/api/cases/{case['id']}/location", json=LAHORE)
        opts = c.get(f"/api/cases/{case['id']}/transport").json()
        assert opts["out_of_area"] is True and opts["nearest_hospital_km"] > 300
        assert opts["hospitals"] == [] and opts["responders"] == []
        r = c.post(f"/api/cases/{case['id']}/dispatch", json={"staff": "Dr Test", "responder_id": 1, "hospital_id": "nishtar"})
        assert r.status_code == 409 and "1122" in r.json()["detail"]

        st = c.get(f"/api/patient/status?c={case['id']}&t={case['access_token']}").json()
        assert st["out_of_area"] is True and st["trip"] is None


def test_driver_in_another_city_is_not_offered_for_a_multan_patient():
    with client() as c:
        import random

        phone = "+92301" + str(random.randint(1000000, 9999999))
        m = c.post("/api/ambulances/register", json={
            "driver_name": "Far Driver", "phone": phone, "vehicle_type": "car", "vehicle_reg": "LEA-1",
            "area": "DHA", "lat": LAHORE["lat"], "lng": LAHORE["lng"], "agree": True}).json()
        token = m["link"].split("t=")[1]
        c.post(f"/api/ambulances/{m['id']}/review", json={"staff": "Dr Test", "decision": "approve"})
        me = c.post("/api/ambulances/me/online", json={"m": m["id"], "t": token, "online": True,
                                                         "lat": LAHORE["lat"], "lng": LAHORE["lng"]}).json()
        assert me["in_area"] is False

        case = _case(c, "+923000000902")
        c.post(f"/api/cases/{case['id']}/location", json=GULGASHT)
        opts = c.get(f"/api/cases/{case['id']}/transport").json()
        assert opts["out_of_area"] is False and opts["hospitals"]
        assert all("Far Driver" not in r["name"] for r in opts["responders"]) and opts["responders_too_far"] >= 1
        rid = me and c.get("/api/responders").json()
        far = next(r for r in rid if "Far Driver" in r["name"])
        r = c.post(f"/api/cases/{case['id']}/dispatch", json={"staff": "Dr Test", "responder_id": far["id"], "hospital_id": "nishtar"})
        assert r.status_code == 409 and "km away" in r.json()["detail"]
        c.post(f"/api/ambulances/{m['id']}/review", json={"staff": "Dr Test", "decision": "suspend"})
