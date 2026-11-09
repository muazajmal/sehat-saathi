"""First-aid guides shown to the patient while help is coming."""
from app.first_aid import guides_for
from tests.test_api import client


def test_guides_follow_danger_signs_and_words():
    assert guides_for(["Chest pain"], "") == ["heart"]
    assert guides_for(["Seizure", "Unconscious / fainting"], "") == ["seizure", "unconscious"]
    assert guides_for([], "haath jal gaya garam tel se") == ["burns"]
    assert guides_for([], "bachay ke galay mein kuch phans gaya") == ["choking"]
    assert guides_for(["Skin rash / itching"], "kharish") == []


def test_patient_status_lists_guides():
    with client() as c:
        case = c.post("/api/intake", json={"phone": "+923000000601", "message": "Mere abbu ke seene mein dard hai"}).json()
        st = c.get(f"/api/patient/status?c={case['id']}&t={case['access_token']}").json()
        assert "heart" in st["first_aid"]
