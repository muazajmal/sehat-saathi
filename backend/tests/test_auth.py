"""Logins: hospital admin, doctor and patient."""
from tests.test_api import client


def login(c, phone, pw, portal):
    return c.post("/api/auth/login", json={"phone": phone, "password": pw, "portal": portal})


def bearer(t):
    return {"Authorization": f"Bearer {t}"}


def test_desk_needs_a_staff_login(monkeypatch):
    monkeypatch.delenv("OPEN_DESK", raising=False)
    with client() as c:
        assert c.get("/api/cases").status_code == 401
        doc = login(c, "0300 0000002", "doctor123", "staff")
        assert doc.status_code == 200 and doc.json()["account"]["role"] == "doctor"
        assert c.get("/api/cases", headers=bearer(doc.json()["token"])).status_code == 200
        assert c.get("/api/cases", headers=bearer("bad.token")).status_code == 401
        # A patient token can't open the desk, and doors are kept apart.
        pat = login(c, "03001112233", "patient123", "patient").json()["token"]
        assert c.get("/api/cases", headers=bearer(pat)).status_code == 403
        assert login(c, "03001112233", "patient123", "staff").status_code == 403
        assert login(c, "03000000002", "doctor123", "patient").status_code == 403
        assert login(c, "03000000002", "wrong", "staff").status_code == 401


def test_decision_is_signed_with_the_logged_in_doctor(monkeypatch):
    monkeypatch.delenv("OPEN_DESK", raising=False)
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000501", "message": "bukhar hai 2 din se"}).json()
        t = login(c, "03000000002", "doctor123", "staff").json()["token"]
        r = c.post(f"/api/cases/{case['id']}/approve", json={"staff": "Someone Else"}, headers=bearer(t))
        assert r.status_code == 200
        audit = c.get("/api/audit", headers=bearer(t)).json()
        assert any(a.get("actor") == "Dr. Ayesha Malik" or "Dr. Ayesha Malik" in str(a) for a in audit)


def test_admin_adds_and_switches_off_a_doctor(monkeypatch):
    monkeypatch.delenv("OPEN_DESK", raising=False)
    with client() as c:
        admin = login(c, "03000000001", "admin123", "staff").json()["token"]
        doc = login(c, "03000000002", "doctor123", "staff").json()["token"]
        new = {"phone": "0301 7654321", "name": "Kamran Ali", "password": "kamran123", "specialty": "paediatrics"}
        assert c.post("/api/admin/accounts", json=new, headers=bearer(doc)).status_code == 403
        r = c.post("/api/admin/accounts", json=new, headers=bearer(admin))
        assert r.status_code == 201 and r.json()["name"] == "Dr. Kamran Ali"
        assert c.post("/api/admin/accounts", json=new, headers=bearer(admin)).status_code == 409
        slots = c.get("/api/slots", headers=bearer(admin)).json()
        assert any(s["doctor"] == "Dr. Kamran Ali" for s in slots)
        kt = login(c, "03017654321", "kamran123", "staff").json()["token"]
        assert c.get("/api/cases", headers=bearer(kt)).status_code == 200
        c.post(f"/api/admin/accounts/{r.json()['id']}/active", json={"active": False}, headers=bearer(admin))
        assert c.get("/api/cases", headers=bearer(kt)).status_code == 401
        assert login(c, "03017654321", "kamran123", "staff").status_code == 403


def test_patient_signs_up_and_sees_only_their_requests():
    with client() as c:
        mine = c.post("/api/intake", json={"phone": "+923119998877", "name": "Zainab", "message": "sar dard"}).json()
        c.post("/api/intake", json={"phone": "+923119990000", "message": "pait dard"})
        r = c.post("/api/auth/signup", json={"phone": "0311 9998877", "name": "Zainab Bibi", "password": "zainab1"})
        assert r.status_code == 201 and r.json()["account"]["role"] == "patient"
        items = c.get("/api/me/cases", headers=bearer(r.json()["token"])).json()
        assert [i["case_id"] for i in items] == [mine["id"]]
        st = c.get(f"/api/patient/status?c={items[0]['case_id']}&t={items[0]['token']}")
        assert st.status_code == 200
        # Same number again is refused; sign-up can never make a staff account.
        assert c.post("/api/auth/signup", json={"phone": "03119998877", "name": "X Y", "password": "zainab1"}).status_code == 409
        assert c.get("/api/admin/accounts", headers=bearer(r.json()["token"])).status_code == 403
