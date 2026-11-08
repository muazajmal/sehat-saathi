"""Local ambulances sign up, staff approve, they go online and get sent to patients."""
import random

from tests.test_api import client


def _phone():
    return "+92300" + str(random.randint(1000000, 9999999))

NEAR_GULGASHT = {"lat": 30.2300, "lng": 71.4790}


def _join(c, phone=None, **kw):
    phone = phone or _phone()
    body = {"driver_name": "Ali Raza", "phone": phone, "organisation": "Al-Noor Ambulance",
            "vehicle_type": "oxygen", "vehicle_reg": "mna-1234", "area": "Gulgasht", "agree": True,
            **NEAR_GULGASHT, **kw}
    return c.post("/api/ambulances/register", json=body)


def test_signup_needs_approval_before_going_online():
    with client() as c:
        phone = _phone()
        r = _join(c, phone=phone)
        assert r.status_code == 201
        m = r.json()
        assert m["status"] == "pending" and m["vehicle_reg"] == "MNA-1234"
        token = m["link"].split("t=")[1]
        assert _join(c, phone=phone).status_code == 409  # same phone twice
        assert _join(c, agree=False).status_code == 422

        # Not approved: can't go online, and the private page needs the token.
        r = c.post("/api/ambulances/me/online", json={"m": m["id"], "t": token, "online": True})
        assert r.status_code == 409
        assert c.get(f"/api/ambulances/me?m={m['id']}&t=wrong-token").status_code == 403

        assert c.get("/api/stats").json()["ambulances_pending"] >= 1
        listed = c.get("/api/ambulances").json()
        assert listed[0]["status"] == "pending" and all(x["link"] == "" for x in listed)  # staff list never leaks the token


def test_approved_ambulance_is_dispatched_and_sees_its_trip():
    with client() as c:
        m = _join(c).json()
        token = m["link"].split("t=")[1]
        r = c.post(f"/api/ambulances/{m['id']}/review", json={"staff": "Dr Test", "decision": "approve"})
        assert r.json()["status"] == "approved"

        me = c.post("/api/ambulances/me/online",
                    json={"m": m["id"], "t": token, "online": True, **NEAR_GULGASHT}).json()
        assert me["online"] is True and me["busy"] is False

        case = c.post("/api/intake", json={"phone": "+923000000777", "name": "Member trip",
                                           "message": "saans nahi aa rahi"}).json()
        c.post(f"/api/cases/{case['id']}/location",
               json={"lat": 30.2297, "lng": 71.4789, "label": "Gulgasht", "source": "web"})
        opts = c.get(f"/api/cases/{case['id']}/transport").json()
        mine = [r for r in opts["responders"] if not r["is_demo"] and "Ali Raza" in r["name"]]
        assert mine and opts["responders"][0]["id"] == mine[0]["id"]  # parked next to the patient: nearest

        d = c.post(f"/api/cases/{case['id']}/dispatch",
                   json={"staff": "Dr Test", "responder_id": mine[0]["id"], "hospital_id": "nishtar"}).json()
        me = c.get(f"/api/ambulances/me?m={m['id']}&t={token}").json()
        assert me["busy"] is True and me["trip_link"].startswith(f"/responder?d={d['id']}&t=")

        # Going offline mid-trip doesn't drop the trip; suspending mid-trip is refused.
        me = c.post("/api/ambulances/me/online", json={"m": m["id"], "t": token, "online": False}).json()
        assert me["busy"] is True
        assert c.post(f"/api/ambulances/{m['id']}/review",
                      json={"staff": "Dr Test", "decision": "suspend"}).status_code == 409

        c.post(f"/api/dispatches/{d['id']}/status", json={"staff": "Dr Test", "status": "cancelled"})
        r = c.post(f"/api/ambulances/{m['id']}/review", json={"staff": "Dr Test", "decision": "suspend"})
        assert r.json()["status"] == "suspended" and r.json()["online"] is False
        r = c.post("/api/ambulances/me/online", json={"m": m["id"], "t": token, "online": True})
        assert r.status_code == 409
