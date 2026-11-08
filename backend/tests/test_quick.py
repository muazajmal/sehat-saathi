"""One-tap answers on the patient website and the voice endpoint."""
from app.quick import apply
from app.triage import rules_triage

from tests.test_api import client


def test_tapped_danger_sign_counts_even_if_text_is_mild():
    r = apply(rules_triage("thora sa masla hai"), {"symptoms": ["pregnancy"], "answers": ["preg_bleeding"]})
    assert r.urgency == "urgent" and "Pregnancy warning" in r.red_flags
    assert r.specialty == "gynaecology" and "Quick answers" in r.summary


def test_baby_fever_rules():
    young = apply(rules_triage("بخار"), {"for_whom": "child", "age": 2, "age_unit": "months", "symptoms": ["fever"]})
    assert young.urgency == "urgent" and "Infant high fever" in young.red_flags
    older = apply(rules_triage("بخار"), {"for_whom": "child", "age": 5, "symptoms": ["fever"], "since": "today"})
    assert older.urgency == "routine" and older.specialty == "paediatrics"
    assert "5 years old" in older.summary and "Started today" in older.summary
    high = apply(rules_triage("بخار"), {"for_whom": "child", "age": 8, "age_unit": "months",
                                        "symptoms": ["fever"], "answers": ["fever_high"]})
    assert high.urgency == "urgent"


def test_taps_never_lower_urgency_and_unknown_keys_are_ignored():
    r = apply(rules_triage("seene mein dard aur paseena"), {"symptoms": ["skin", "made-up"], "answers": ["nope"]})
    assert r.urgency == "urgent" and "Chest pain" in r.red_flags


def test_intake_with_quick_answers_in_urdu():
    with client() as c:
        r = c.post("/api/intake", json={
            "phone": "+923000000555", "message": "میرے لیے۔ سر درد۔",
            "quick": {"for_whom": "self", "age": 60, "symptoms": ["headache"], "answers": ["one_side_weak"]},
        })
        case = r.json()
        assert r.status_code == 201 and case["urgency"] == "urgent" and "Stroke signs" in case["red_flags"]
        assert case["language"] == "ur" and case["status_link"]
        bad = c.post("/api/intake", json={"phone": "+923000000555", "message": "hi there",
                                          "quick": {"for_whom": "alien"}})
        assert bad.status_code == 422


def test_voice_needs_a_key_and_a_wav():
    with client() as c:
        r = c.post("/api/transcribe", json={"audio_b64": "UklGR" + "A" * 200, "ui_lang": "ur"})
        assert r.status_code == 503  # no Gemini key in tests: tells the patient to type


def test_voice_sends_audio_to_gemini_and_returns_text(monkeypatch):
    import base64

    from app import voice
    from app.config import settings

    seen = {}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": " میرے بچے کو بخار ہے \n"}]}}]}

    def fake_post(url, params, json, timeout):
        seen.update(url=url, body=json)
        return Resp()

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(voice.httpx, "post", fake_post)
    wav = base64.b64encode(b"RIFF" + b"\0" * 200).decode()
    assert voice.transcribe(wav, "audio/wav", "ur") == "میرے بچے کو بخار ہے"
    part = seen["body"]["contents"][0]["parts"][1]["inline_data"]
    assert part["mime_type"] == "audio/wav" and part["data"] == wav
