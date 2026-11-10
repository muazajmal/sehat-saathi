"""Report Samjhao (Mystery Card 5): AI summary button with a meaning guard."""
from app import summary
from tests.test_api import client


def test_example_report_gives_three_styles_linked_and_faithful():
    with client() as c:
        text = c.get("/api/summarize/example").json()["text"]
        r = c.post("/api/summarize", json={"text": text})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["engine"] == "example"  # no AI key in tests
        assert s["one_line"]["en"] and s["one_line"]["ur"]
        assert len(s["bullets"]) == 3 and 3 <= len(s["detailed"]) <= 5
        assert s["guard"]["level"] == "ok" and s["guard"]["not_in_report"] == []
        assert s["guard"]["points_linked"] == s["guard"]["points"]
        assert s["specialty"] == "Endocrinology"


def test_guard_catches_a_changed_number():
    lines = summary.split_lines(summary.SAMPLE.replace("9.2 %", "8.1 %"))
    g = summary.guard(lines, summary.EXAMPLE)
    assert g["level"] == "bad" and "9.2" in g["not_in_report"]


def test_without_ai_any_report_is_summarised_word_for_word():
    report = "Lab X\nPotassium: 6.1 mmol/L (3.5 - 5.1) HIGH\nSodium: 139 mmol/L (135 - 145)\nUrea: 30 mg/dL (15 - 40)"
    with client() as c:
        s = c.post("/api/summarize", json={"text": report}).json()
        assert s["engine"] == "rules"
        assert "Potassium" in s["one_line"]["en"]
        assert s["bullets"][0]["en"] == "Potassium: 6.1 mmol/L (3.5 - 5.1) HIGH"
        assert s["guard"]["level"] == "ok"


def test_too_short_is_refused():
    with client() as c:
        assert c.post("/api/summarize", json={"text": "short"}).status_code == 422
