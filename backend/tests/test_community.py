"""Area alerts, blood donors, medicines and elder check-ins."""
from datetime import timedelta

from app import community
from app.db import SessionLocal
from app.models import Elder
from app.services import now
from tests.test_api import client


def bearer(t):
    return {"Authorization": f"Bearer {t}"}


def patient(c, phone, name="Test Person"):
    r = c.post("/api/auth/signup", json={"phone": phone, "name": name, "password": "secret12"})
    assert r.status_code == 201, r.text
    return r.json()["token"]


def test_area_rise_found_drafted_published_and_public():
    with client() as c:
        ah = c.get("/api/area-health").json()
        rises = {(r["area"], r["group"]): r for r in ah["rises"]}
        g = rises[("Gulgasht Colony", "fever")]
        assert g["level"] == "alert" and g["cases_week"] >= 8
        assert ("Bosan Road", "cough") not in rises  # steady numbers are not a rise
        a = c.post("/api/area-health/draft", params={"area": "Gulgasht Colony", "group": "fever"}).json()
        assert a["status"] == "draft" and "Gulgasht" in a["title_en"] and "1122" in a["body_en"]
        assert c.get("/api/alerts").json() == []  # nothing public before a doctor approves
        pub = c.post(f"/api/area-health/alerts/{a['id']}/publish").json()
        assert pub["status"] == "published"
        assert [x["id"] for x in c.get("/api/alerts").json()] == [a["id"]]


def test_blood_request_asks_compatible_donors_and_hides_numbers_until_yes():
    with client() as c:
        d = c.post("/api/donors", json={"phone": "0333 1112222", "name": "Asad Khan", "blood_group": "O-",
                                        "area": "Model Town", "eligible": True})
        assert d.status_code == 201
        assert c.post("/api/donors", json={"phone": "03331112223", "name": "No One", "blood_group": "O-",
                                           "eligible": False}).status_code == 422
        r = c.post("/api/blood-requests", json={"blood_group": "A+", "units": 1, "hospital_id": "nishtar"}).json()
        groups = {x["blood_group"] for x in r["asks"]}
        assert groups <= {"A+", "A-", "O+", "O-"} and r["asks"]
        assert all(x["phone"] == "" for x in r["asks"])
        mine = next(x for x in r["asks"] if x["donor"] == "Asad Khan")
        with SessionLocal() as db:
            from app.models import Donor
            tok = db.query(Donor).filter_by(name="Asad Khan").one().token
        assert c.get(f"/api/blood-asks/{mine['id']}", params={"t": "wrong"}).status_code == 403
        seen = c.get(f"/api/blood-asks/{mine['id']}", params={"t": tok}).json()
        assert seen["blood_group"] == "A+" and "patient" not in seen
        c.post(f"/api/blood-asks/{mine['id']}/answer", params={"t": tok, "answer": "yes"})
        again = c.get("/api/donors/summary").json()["requests"][0]
        assert again["yes"] == 1 and next(x for x in again["asks"] if x["donor"] == "Asad Khan")["phone"] == "+923331112222"


def test_medicines_today_taken_and_reminder_once():
    with client() as c:
        t = patient(c, "0344 5556666", "Shazia")
        h = now()
        due = f"{h.hour:02d}:{h.minute:02d}"
        r = c.post("/api/me/medicines", headers=bearer(t), json=[
            {"name": "Tab Example 500mg", "dose": "1 tablet", "times": [due, "23:59"], "with_food": "after", "days": 5}])
        assert r.status_code == 201
        today = c.get("/api/me/medicines", headers=bearer(t)).json()["today"]
        assert [d["status"] for d in today if d["time"] == due] == ["due"]
        inbox = c.get("/api/me/inbox", headers=bearer(t)).json()
        assert sum(1 for n in inbox if n["kind"] == "medicine") == 1
        c.get("/api/me/inbox", headers=bearer(t))
        assert sum(1 for n in c.get("/api/me/inbox", headers=bearer(t)).json() if n["kind"] == "medicine") == 1
        mid = today[0]["medicine_id"]
        after = c.post(f"/api/me/medicines/{mid}/taken", params={"time": due}, headers=bearer(t)).json()["today"]
        assert [d["status"] for d in after if d["time"] == due] == ["taken"]
        assert c.post("/api/me/prescriptions/read", headers=bearer(t), json={"image_b64": "x"}).status_code == 503


def test_elder_checkin_ok_help_and_missed():
    with client() as c:
        t = patient(c, "0355 7778888", "Family Member")
        e = c.post("/api/me/elders", headers=bearer(t), json={"name": "Abba Ji", "phone": "0355 7770000",
                                                              "checkin_time": "00:00", "grace_min": 30}).json()
        link = e["link"]
        eid, tok = link.split("e=")[1].split("&t=")
        # Past the check-in time with no answer: missed, and the family is told once.
        assert c.get("/api/me/elders", headers=bearer(t)).json()[0]["status"] in ("missed", "waiting")
        with SessionLocal() as db:
            el = db.get(Elder, int(eid))
            el.checkin_time = (now() - timedelta(hours=3)).strftime("%H:%M")
            db.commit()
        c.get("/api/me/elders", headers=bearer(t))
        inbox = c.get("/api/me/inbox", headers=bearer(t)).json()
        assert sum(1 for n in inbox if "hasn't checked in" in n["title"]) == 1
        assert c.post("/api/checkin", params={"e": eid, "t": "bad", "status": "ok"}).status_code == 403
        r = c.post("/api/checkin", params={"e": eid, "t": tok, "status": "help"}).json()
        assert r["status"] == "help"
        assert any("NEED HELP" in n["title"] for n in c.get("/api/me/inbox", headers=bearer(t)).json())
        cases = c.get("/api/cases").json()
        assert any(x["urgency"] == "urgent" and "Elder check-in" in x["message"] for x in cases)


def test_push_key_and_tick():
    with client() as c:
        assert len(c.get("/api/push/key").json()["key"]) == 87
        assert c.post("/api/cron/tick").status_code == 200
