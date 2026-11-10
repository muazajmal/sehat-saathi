"""Report Samjhao (Mystery Card 5: AI Summary Button).

A patient pastes a long medical report (or a photo of one), picks a summary style (one line, 3 bullets or
detailed) and gets a short, clear, faithful summary in English and Urdu. Every point lists the report lines it
comes from, and every number in the summary is checked against the report (the "meaning guard"), so a changed
or invented number is caught before the patient sees it.

Gemini writes the summary. Without a key, or if Gemini fails, a rules-only summary copies the flagged lines
word for word, so the feature never stops working."""
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import ai, tenancy
from .config import settings
from .db import get_db

router = APIRouter(prefix="/api")

SPECIALTIES = ["General Medicine", "Endocrinology", "Cardiology", "Nephrology", "Gynaecology", "Paediatrics"]

PROMPT = """You summarise medical lab reports for patients in Pakistan.
Rules: never diagnose and never add facts, causes or advice that are not in the report. Copy every number and unit
exactly as written. In Urdu text use Urdu script but keep numbers in Western digits (0-9) and keep test names like
HbA1c in English letters. The report is given as numbered lines. For every point list the line numbers it uses in "src".
Return ONLY a JSON object with this shape:
{"not_a_report": false,
 "one_line": {"en": "...", "ur": "...", "src": [n]},
 "bullets": [{"en": "...", "ur": "...", "src": [n]}]  (exactly 3, most important first),
 "detailed": [{"h_en": "short heading", "h_ur": "...", "en": "2-3 sentences", "ur": "...", "src": [n]}]  (3 to 5 sections, cover every result),
 "urgency": "routine" | "soon" | "urgent"  (urgent only for critical values),
 "urgency_reason_en": "one short sentence", "urgency_reason_ur": "...",
 "specialty": one of %s}
If the text is not a medical report, return {"not_a_report": true}.

REPORT:
""" % SPECIALTIES

READ_PROMPT = ("Transcribe this medical report image exactly. One test result per line. Keep every number, unit and "
               "normal range exactly as printed. Return JSON {\"text\": \"...\"}. If it is not a medical report, "
               "return {\"text\": \"NOT_A_REPORT\"}.")

SAMPLE = """CITY DIAGNOSTIC LAB, Multan
Patient: Rashida Bibi   Age/Sex: 54 / F   Ref: OPD
Date: 08-Nov-2026   Sample: Fasting blood
HbA1c: 9.2 %   (Normal < 5.7, Diabetes >= 6.5)   HIGH
Fasting Blood Sugar: 186 mg/dL   (70 - 99)   HIGH
Hemoglobin: 10.4 g/dL   (12.0 - 15.5)   LOW
Total Cholesterol: 238 mg/dL   (< 200)   HIGH
LDL Cholesterol: 156 mg/dL   (< 100)   HIGH
HDL Cholesterol: 41 mg/dL   (> 50)   LOW
Triglycerides: 205 mg/dL   (< 150)   HIGH
Serum Creatinine: 1.1 mg/dL   (0.6 - 1.2)
Urine Albumin: Trace
TSH: 2.4 mIU/L   (0.4 - 4.0)
Remarks: Findings suggest poorly controlled blood sugar. Correlate clinically. Repeat HbA1c after 3 months."""

# A checked summary of SAMPLE, used only when the AI is unavailable and the example report is summarised.
EXAMPLE = {
    "one_line": {"en": "Blood sugar is high (HbA1c 9.2%) and cholesterol is high, so see a diabetes doctor soon.",
                 "ur": "شوگر زیادہ ہے (HbA1c 9.2%) اور کولیسٹرول بھی زیادہ ہے، اس لیے جلد شوگر کے ڈاکٹر کو دکھائیں۔", "src": [4, 5, 7, 8]},
    "bullets": [
        {"en": "Blood sugar is above the diabetes range: HbA1c 9.2% and fasting sugar 186 mg/dL.",
         "ur": "شوگر ذیابیطس کی حد سے اوپر ہے: HbA1c 9.2% اور نہار منہ شوگر 186 mg/dL۔", "src": [4, 5]},
        {"en": "Cholesterol is high: total 238, LDL 156 and triglycerides 205 mg/dL, while good HDL is low at 41.",
         "ur": "کولیسٹرول زیادہ ہے: ٹوٹل 238، LDL 156 اور ٹرائی گلیسرائیڈز 205 mg/dL، جبکہ اچھا HDL کم یعنی 41 ہے۔", "src": [7, 8, 9, 10]},
        {"en": "Hemoglobin is low at 10.4 g/dL. Kidney (creatinine 1.1) and thyroid (TSH 2.4) results are normal.",
         "ur": "ہیموگلوبن 10.4 g/dL کے ساتھ کم ہے۔ گردے (creatinine 1.1) اور تھائیرائیڈ (TSH 2.4) نارمل ہیں۔", "src": [6, 11, 13]}],
    "detailed": [
        {"h_en": "Blood sugar", "h_ur": "شوگر",
         "en": "HbA1c is 9.2%; the diabetes range starts at 6.5%. Fasting sugar is 186 mg/dL against a normal 70 to 99. The lab asks to repeat HbA1c after 3 months.",
         "ur": "HbA1c 9.2% ہے، ذیابیطس کی حد 6.5% سے شروع ہوتی ہے۔ نہار منہ شوگر 186 mg/dL ہے جبکہ نارمل 70 سے 99 ہے۔ لیب نے 3 مہینے بعد HbA1c دوبارہ کروانے کا کہا ہے۔", "src": [4, 5, 14]},
        {"h_en": "Cholesterol and fats", "h_ur": "کولیسٹرول اور چکنائی",
         "en": "Total cholesterol 238 mg/dL (target under 200), LDL 156 (under 100), triglycerides 205 (under 150). HDL, the good cholesterol, is 41 and should be above 50.",
         "ur": "ٹوٹل کولیسٹرول 238 mg/dL (200 سے کم ہونا چاہیے)، LDL 156 (100 سے کم)، ٹرائی گلیسرائیڈز 205 (150 سے کم)۔ اچھا کولیسٹرول HDL 41 ہے، 50 سے زیادہ ہونا چاہیے۔", "src": [7, 8, 9, 10]},
        {"h_en": "Blood count", "h_ur": "خون کی مقدار",
         "en": "Hemoglobin is 10.4 g/dL, below the normal 12.0 to 15.5. Ask the doctor about it at the visit.",
         "ur": "ہیموگلوبن 10.4 g/dL ہے جو نارمل 12.0 سے 15.5 سے کم ہے۔ ملاقات پر ڈاکٹر سے اس بارے میں پوچھیں۔", "src": [6]},
        {"h_en": "Normal results", "h_ur": "نارمل نتائج",
         "en": "Creatinine 1.1 mg/dL (kidneys) and TSH 2.4 (thyroid) are within range. Urine albumin shows a trace.",
         "ur": "Creatinine 1.1 mg/dL (گردے) اور TSH 2.4 (تھائیرائیڈ) نارمل حد میں ہیں۔ پیشاب میں البیومن کی معمولی مقدار ہے۔", "src": [11, 12, 13]}],
    "urgency": "soon",
    "urgency_reason_en": "Sugar and cholesterol are well above range. Book within a week.",
    "urgency_reason_ur": "شوگر اور کولیسٹرول حد سے کافی زیادہ ہیں۔ ایک ہفتے میں وقت لیں۔",
    "specialty": "Endocrinology",
}

UR_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
FLAG = re.compile(r"\b(HIGH|LOW|H|L|ABNORMAL|CRITICAL|POSITIVE)\b|[↑↓*]")


def split_lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()][:150]


def numbers(text: str) -> set[float]:
    return {float(n) for n in re.findall(r"\d+(?:\.\d+)?", str(text).translate(UR_DIGITS))}


def guard(lines: list[str], summary: dict) -> dict:
    """Meaning guard: every number in every point must appear in the report, and every point must cite lines."""
    in_report = set().union(*(numbers(ln) for ln in lines)) if lines else set()
    pts = [summary["one_line"], *summary["bullets"], *summary["detailed"]]
    missing, unlinked, checked = set(), 0, 0
    for p in pts:
        ns = numbers(" ".join(str(p.get(k, "")) for k in ("en", "ur", "h_en")))
        checked += len(ns)
        missing |= {n for n in ns if n not in in_report}
        if not p.get("src"):
            unlinked += 1
    level = "bad" if missing else "warn" if unlinked else "ok"
    fmt = lambda n: f"{n:g}"  # noqa: E731
    return {"level": level, "numbers_checked": checked, "not_in_report": sorted(fmt(n) for n in missing),
            "points": len(pts), "points_linked": len(pts) - unlinked}


def rules_summary(lines: list[str]) -> dict:
    """No AI: copy the flagged results word for word. Nothing is reworded, so no number can change."""
    flagged = [(i + 1, ln) for i, ln in enumerate(lines) if FLAG.search(ln) and re.search(r"\d", ln)]
    results = [(i + 1, ln) for i, ln in enumerate(lines) if re.search(r"\d", ln) and ":" in ln]
    pick = flagged or results[:3] or [(i + 1, ln) for i, ln in enumerate(lines[:3])]
    names = [ln.split(":")[0].strip() for _, ln in pick[:4]]
    if flagged:
        one = {"en": f"Outside the normal range: {', '.join(names)}. Show this report to a doctor.",
               "ur": f"نارمل حد سے باہر: {', '.join(names)}۔ یہ رپورٹ ڈاکٹر کو دکھائیں۔",
               "src": [i for i, _ in pick[:4]]}
    else:
        one = {"en": "No result is marked high or low in this report. Show it to a doctor to be sure.",
               "ur": "اس رپورٹ میں کوئی نتیجہ زیادہ یا کم نشان زد نہیں ہے۔ تسلی کے لیے ڈاکٹر کو دکھائیں۔", "src": []}
    bullets = [{"en": ln, "ur": ln, "src": [i]} for i, ln in pick[:3]]
    while len(bullets) < 3 and len(bullets) < len(lines):
        i = len(bullets)
        bullets.append({"en": lines[i], "ur": lines[i], "src": [i + 1]})
    normal = [(i, ln) for i, ln in results if (i, ln) not in flagged]
    detailed = [{"h_en": "Outside the normal range", "h_ur": "نارمل حد سے باہر",
                 "en": " · ".join(ln for _, ln in flagged) or "None marked.", "ur": " · ".join(ln for _, ln in flagged) or "کوئی نہیں۔",
                 "src": [i for i, _ in flagged]},
                {"h_en": "Other results", "h_ur": "باقی نتائج",
                 "en": " · ".join(ln for _, ln in normal) or "None.", "ur": " · ".join(ln for _, ln in normal) or "کوئی نہیں۔",
                 "src": [i for i, _ in normal]}]
    return {"one_line": one, "bullets": bullets, "detailed": detailed, "urgency": "soon" if flagged else "routine",
            "urgency_reason_en": "Some results are outside the normal range." if flagged else "Nothing is marked abnormal.",
            "urgency_reason_ur": "کچھ نتائج نارمل حد سے باہر ہیں۔" if flagged else "کچھ بھی غیر معمولی نشان زد نہیں۔",
            "specialty": "General Medicine"}


def clean_point(p, n_lines: int, heading: bool = False) -> dict | None:
    if not isinstance(p, dict) or not str(p.get("en", "")).strip():
        return None
    out = {"en": str(p["en"]).strip()[:600], "ur": str(p.get("ur") or "").strip()[:600],
           "src": sorted({s for s in (p.get("src") or []) if isinstance(s, int) and 1 <= s <= n_lines})}
    if heading:
        out["h_en"] = str(p.get("h_en") or "").strip()[:80]
        out["h_ur"] = str(p.get("h_ur") or "").strip()[:80]
    return out


def ai_summary(lines: list[str]) -> dict | None:
    numbered = "\n".join(f"{i + 1}: {ln}" for i, ln in enumerate(lines))
    data = ai.gemini_json(PROMPT + numbered, timeout=45, temperature=0.1)
    if not isinstance(data, dict):
        return None
    if data.get("not_a_report"):
        raise HTTPException(422, "This doesn't look like a medical report. Paste the results from a lab report.")
    one = clean_point(data.get("one_line"), len(lines))
    bullets = [b for b in (clean_point(x, len(lines)) for x in (data.get("bullets") or [])[:3]) if b]
    detailed = [d for d in (clean_point(x, len(lines), True) for x in (data.get("detailed") or [])[:6]) if d]
    if not one or len(bullets) < 3 or not detailed:
        return None
    urgency = data.get("urgency") if data.get("urgency") in ("routine", "soon", "urgent") else "routine"
    spec = data.get("specialty") if data.get("specialty") in SPECIALTIES else "General Medicine"
    return {"one_line": one, "bullets": bullets, "detailed": detailed, "urgency": urgency,
            "urgency_reason_en": str(data.get("urgency_reason_en") or "")[:240],
            "urgency_reason_ur": str(data.get("urgency_reason_ur") or "")[:240], "specialty": spec}


class SummaryIn(BaseModel):
    text: str = Field(min_length=40, max_length=20_000)


class ReportPhotoIn(BaseModel):
    image_b64: str = Field(max_length=8_000_000)
    mime: str = Field(default="image/jpeg", pattern=r"^image/(jpeg|png|webp|heic|heif)$")


@router.get("/summarize/example")
def example_report():
    return {"text": SAMPLE}


@router.post("/summarize")
def summarize(body: SummaryIn, request: Request, db: Session = Depends(get_db)):
    """One press: all three styles in English and Urdu, each point linked to its report lines, plus the guard."""
    tenancy.limit(db, f"summary:{tenancy.client_ip(request)}", 30, 60, "Too many summaries for now. Please wait a few minutes.")
    lines = split_lines(body.text)
    if len(lines) < 2:
        raise HTTPException(422, "Paste a longer report: a few lines of results are enough.")
    s, engine = ai_summary(lines), settings.gemini_model
    if s is None:
        same_as_example = [ln for ln in lines] == split_lines(SAMPLE)
        s, engine = (EXAMPLE, "example") if same_as_example else (rules_summary(lines), "rules")
    return {**s, "lines": lines, "engine": engine, "guard": guard(lines, s)}


@router.post("/summarize/read-photo")
def read_report_photo(body: ReportPhotoIn, request: Request, db: Session = Depends(get_db)):
    """Gemini copies a photo of a report into text the patient can check before summarising."""
    tenancy.limit(db, f"summary-photo:{tenancy.client_ip(request)}", 15, 60, "Too many photos for now. Please paste the text instead.")
    if not settings.gemini_api_key:
        raise HTTPException(503, "Reading photos needs the AI to be switched on. Please paste the report text instead.")
    data = ai.gemini_json(READ_PROMPT, [{"inline_data": {"mime_type": body.mime, "data": body.image_b64}}], timeout=45, temperature=0)
    text = str((data or {}).get("text") or "").strip() if isinstance(data, dict) else ""
    if not text:
        raise HTTPException(502, "Couldn't read the photo. Try a clearer photo in good light, or paste the text.")
    if text == "NOT_A_REPORT":
        raise HTTPException(422, "This photo doesn't look like a medical report.")
    return {"text": text[:20_000]}
