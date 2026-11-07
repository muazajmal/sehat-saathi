"""Triage engine.

Two layers, and the safer one always wins:

1. Rules (always runs, no network): danger-sign words in Urdu, Roman Urdu,
   English, Punjabi, Saraiki, Pashto, Sindhi, Balochi, Arabic and Persian.
   Fast, explainable, can't go down.
2. Gemini (runs when GEMINI_API_KEY is set): reads the message in any
   language and returns a summary for the doctor, an urgency and a gentle
   reply in the patient's own language and script.

The final urgency is the MORE urgent of the two, so the model can never
downgrade a red flag the rules caught. If Gemini fails or times out, the
rules result is used on its own. The AI only suggests; a doctor decides.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field

import httpx

from .config import settings
from .languages import detect_language, reply

log = logging.getLogger("sehat.triage")

URGENCY_RANK = {"routine": 0, "today": 1, "urgent": 2}

# Each entry: (flag label shown to the doctor, list of triggers).
# A trigger is either a phrase (matched anywhere in the message) or a tuple of
# word groups that must ALL appear, e.g. (CHEST, PAIN) catches "chest ... pain"
# in any language and any word order. Phrases starting with "=" must match a
# whole word (for short words that hide inside longer ones).

# Shared word groups, across Urdu, Punjabi, Saraiki, Pashto, Sindhi, Balochi,
# Arabic, Persian, Roman Urdu and English.
CHEST = ["سینے", "سینہ", "سینه", "سینې", "سيني", "سينو", "چھاتی", "ڇاتي", "ہک", "سینگ", "صدر", "الصدر", "قفسه",
         "seene", "seenay", "sine", "seena", "sina", "chati", "chest"]
PAIN = ["درد", "پیڑ", "پِیڑ", "=سور", "ألم", "الم", "وجع", "dard", "peer", "pain"]
BREATH = ["سانس", "ساہ", "ساه", "ساهه", "تنفس", "التنفس", "=نفس", "=نفسم", "saans", "sans", "saah", "breath", "breathe"]
CANT = ["نہیں", "نئیں", "=نہ", "=نه", "نٿو", "نٿي", "مشکل", "اوکھا", "تکلیف", "تڪليف", "=بند", "تنګ", "تنگی", "ضيق",
        "صعوبة", "لا أستطيع", "نمیتوانم", "نمیتونم", "nahi", "=nai", "mushkil", "can't", "cannot", "cant", "hard to",
        "short of"]
# No bare "blood"/"خون" here: "blood pressure bohat zyada" must not read as heavy bleeding.
BLOOD = ["لہو", "=رت", "وینه", "نزيف", "نزف", "خونریزی", "خون‌ریزی", "خون بہ", "خون آ", "khoon beh", "khoon aa",
         "lahu", "bleeding", "bleed"]
HEAVY = ["بہت", "بہوں", "زیادہ", "ډېر", "ډېره", "گهڻو", "گھنا", "رک نہیں", "بند نہیں", "شدید", "غزير", "زیاد",
         "bohat", "bohot", "zyada", "heavy", "a lot", "won't stop", "wont stop"]
PREGNANT = ["حمل", "حاملہ", "امیندواره", "امیدواره", "حامل", "باردار", "حاملگی", "hamal", "pregnan"]
CHILD = ["بچے", "بچہ", "بچی", "نومولود", "ٻال", "ٻار", "=بال", "نیانا", "ماشوم", "کوچنی", "طفل", "رضيع",
         "نوزاد", "کودک", "بچه", "baby", "infant", "newborn", "bachay", "bacha", "bachi", "bachy"]
HIGH_FEVER = ["تیز بخار", "تيز بخار", "تیز تاپ", "سخت بخار", "سخته تبه", "ډېره تبه", "لوړه تبه", "حرارة عالية",
              "حمى شديدة", "حرارة مرتفعة", "تب بالا", "تب شدید", "تب زیاد", "tez bukhar", "high fever", "103", "104"]

RED_FLAGS: list[tuple[str, list]] = [
    ("Chest pain", ["chest pain", "seene mein dard", "seenay mein dard", "seene me dard", "سینے میں درد",
                    "درد قفسه سینه", "درد سینه", "ألم في الصدر", "د سینې درد", (CHEST, PAIN)]),
    ("Breathing difficulty", ["can't breathe", "cant breathe", "shortness of breath", "saans nahi", "saans lene mein",
                              "سانس نہیں", "سانس لینے میں", "تنگی نفس", "ضيق في التنفس", "ضيق تنفس", "صعوبة في التنفس",
                              "ساہ نہیں", "ساه نه", "ساهه نٿو", (BREATH, CANT)]),
    ("Unconscious / fainting", ["unconscious", "fainted", "passed out", "behosh", "بے ہوش", "بیہوش", "بيهوش",
                                "بی‌هوش", "بې هوښه", "بیهوښه", "بې سده", "ہوش نہیں", "ہوش نئیں", "فقد الوعي", "فاقد الوعي",
                                "إغماء", "اغماء", "أغمي", "اغمي", "غش کرد", "از هوش رفت"]),
    ("Heavy bleeding", ["heavy bleeding", "bleeding a lot", "khoon beh", "bohat khoon", "خون بہ", "بہت خون",
                        "لہو وگ", "خون وگ", "رت وہ", "رت وهي", "وینه بهیږي", "نزيف", "خونریزی شدید", (BLOOD, HEAVY)]),
    ("Stroke signs", ["face drooping", "slurred", "one side weak", "lakwa", "falij", "لقوہ", "فالج", "=فلج",
                      "سکته مغزی", "جلطة دماغية", "سكتة دماغية", "لقوو"]),
    ("Seizure", ["seizure", "fits", "jhatke", "دورہ", "جھٹکے", "مرگی", "مرګي", "تشنج", "صرع", "جھٽڪا", "مرگهي"]),
    ("Pregnancy warning", ["pregnant bleeding", "hamal mein khoon", "حمل میں خون", (PREGNANT, BLOOD + ["spotting"])]),
    ("Infant high fever", ["baby fever", "bachay ko tez bukhar", "infant fever", "بچے کو تیز بخار", "نومولود",
                           (CHILD, HIGH_FEVER)]),
    ("Suicidal thoughts", ["kill myself", "suicide", "khudkushi", "خودکشی", "خودڪشي", "انتحار", "أقتل نفسي",
                           "ځان وژنه", "ځان ووژنم", "پاڻ کي ماري"]),
]

SAME_DAY: list[tuple[str, list]] = [
    ("High fever", HIGH_FEVER),
    ("Severe pain", ["severe pain", "bohat dard", "shadeed dard", "بہت درد", "شدید درد", "درد شدید", "ألم شديد",
                     "سخت درد", "ډېر درد", "سخت سور", "بہت پیڑ", "بہوں درد"]),
    ("Vomiting / diarrhoea", ["vomiting", "ulti", "dast", "الٹی", "دست", "قيء", "استفراغ", "تقيؤ", "کانګې",
                              "الٽي", "اسهال", "إسهال", "نس ناستی"]),
    ("Dehydration", ["dehydrat", "pani ki kami", "پانی کی کمی", "جفاف", "کم آبی"]),
    ("Injury", ["fracture", "injury", "chot", "haddi", "چوٹ", "ہڈی", "كسر", "شکستگی", "ټپ", "زخم"]),
    ("Sweating", ["sweating", "paseena", "پسینہ", "تعرق", "عرق", "خوله", "پگهر"]),
]

# Plain symptoms that don't change urgency but make the summary useful.
SYMPTOM_NOTES: list[tuple[str, list]] = [
    ("Skin rash / itching", ["rash", "kharish", "itch", "خارش", "دانے", "طفح", "حكة", "خارښت"]),
    ("Fever", ["fever", "bukhar", "بخار", "=تب", "تبه", "تاپ", "حمى", "حرارة"]),
    ("Cough / cold", ["cough", "khansi", "nazla", "zukam", "کھانسی", "نزلہ", "زکام", "سعال", "سرفه", "ټوخی", "کنگھ"]),
    ("Headache", ["headache", "sar dard", "sir dard", "سر درد", "سر میں درد", "صداع", "سردرد", "سر خوږ", "مٿي ۾ سور"]),
    ("Stomach pain", ["stomach", "pait mein dard", "pet dard", "پیٹ میں درد", "پیٹ درد", "ألم في البطن", "دل درد",
                      "معده", "نس درد", "پيٽ ۾ سور", "ڈھڈ"]),
    ("Blood pressure", ["blood pressure", "bp ", " bp", "بلڈ پریشر", "ضغط الدم", "فشار خون"]),
    ("Sugar / diabetes", ["sugar", "diabetes", "شوگر", "السكري", "سكري", "دیابت", "قند"]),
    ("Follow-up visit", ["follow-up", "follow up", "checkup", "check-up", "report dikhani", "مراجعة", "پیگیری"]),
]

AGE_RE = re.compile(
    r"(?:age|umar|umr|عمر)\s*:?\s*(\d{1,3})|(\d{1,3})\s*(?:saal|sal|years?|yrs?|y/o|سال)",
    re.IGNORECASE,
)
DURATION_RE = re.compile(
    r"(\d{1,3}|ek|do|teen|aik)\s*(minute|min|ghante|ghanta|hour|hours|din|day|days|hafte|hafta|week|weeks|mahine|month|months)",
    re.IGNORECASE,
)
UNITS = [
    (("minute", "min"), "min"),
    (("ghante", "ghanta", "hour", "hours"), "hours"),
    (("din", "day", "days"), "days"),
    (("hafte", "hafta", "week", "weeks"), "weeks"),
    (("mahine", "month", "months"), "months"),
]
SINCE_HINTS = [("kal se", "since yesterday"), ("کل رات سے", "since last night"), ("کل سے", "since yesterday"),
               ("aaj se", "since today"), ("since yesterday", "since yesterday")]

SPECIALTY_HINTS: list[tuple[str, list]] = [
    ("paediatrics", CHILD + ["child"]),
    ("gynaecology", PREGNANT + ["period"]),
    ("dermatology", ["rash", "skin", "kharish", "خارش", "جلد", "طفح", "پوست", "خارښت"]),
]


@dataclass
class TriageResult:
    urgency: str
    summary: str
    red_flags: list[str] = field(default_factory=list)
    specialty: str = "general"
    reply_ur: str = ""
    language: str = "ur"
    engine: str = "rules"
    confidence: float = 0.5

    def to_dict(self) -> dict:
        return asdict(self)


_WORD_SPLIT = re.compile(r"[\w\u0600-\u06FF\u0750-\u077F\u200c]+")


def _normalise(text: str) -> str:
    # Arabic yeh/kaf -> Urdu/Persian forms so one word list covers both spellings,
    # and drop the zero-width non-joiner Persian uses inside words.
    return text.lower().replace("ي", "ی").replace("ك", "ک").replace("\u200c", "")


def _term_in(term: str, low: str, words: set[str]) -> bool:
    if term.startswith("="):
        return _normalise(term[1:]) in words
    return _normalise(term) in low


def _matches(trigger, low: str, words: set[str]) -> bool:
    if isinstance(trigger, tuple):  # every group must have a hit
        return all(any(_term_in(t, low, words) for t in group) for group in trigger)
    return _term_in(trigger, low, words)


def _hits(text: str, table: list[tuple[str, list]]) -> list[str]:
    low = _normalise(text)
    words = set(_WORD_SPLIT.findall(low))
    return [label for label, triggers in table if any(_matches(t, low, words) for t in triggers)]


def default_reply(urgency: str, language: str = "ur") -> str:
    return reply(urgency, language)


def rules_triage(message: str) -> TriageResult:
    flags = _hits(message, RED_FLAGS)
    same_day = _hits(message, SAME_DAY)
    specialty = (_hits(message, SPECIALTY_HINTS) or ["general"])[0]

    if flags:
        urgency, conf = "urgent", 0.9
    elif same_day:
        urgency, conf = "today", 0.7
    else:
        urgency, conf = "routine", 0.55

    noted = flags + same_day
    noted += [n for n in _hits(message, SYMPTOM_NOTES) if n not in noted and not
              (n == "Fever" and "High fever" in noted)]
    summary = (
        f"Patient reports: {', '.join(noted).lower()}." if noted else "Non-specific complaint; needs doctor review."
    )
    extras = []
    age = AGE_RE.search(message)
    if age:
        extras.append(f"age {age.group(1) or age.group(2)}")
    dur = DURATION_RE.search(message)
    if dur:
        n = {"ek": "1", "aik": "1", "do": "2", "teen": "3"}.get(dur.group(1).lower(), dur.group(1))
        unit = dur.group(2).lower()
        unit = next((en for keys, en in UNITS if unit in keys), unit)
        if n == "1" and unit.endswith("s"):
            unit = unit[:-1]
        extras.append(f"for {n} {unit}")
    else:
        since = next((label for key, label in SINCE_HINTS if key in message.lower()), None)
        if since:
            extras.append(since)
    if extras:
        summary = summary.rstrip(".") + f" ({', '.join(extras)})."
    language = detect_language(message)
    return TriageResult(
        urgency=urgency,
        summary=summary,
        red_flags=flags,
        specialty=specialty,
        reply_ur=default_reply(urgency, language),
        language=language,
        engine="rules",
        confidence=conf,
    )


GEMINI_PROMPT = """You are a triage assistant for a Pakistani family clinic. You do NOT diagnose
and you do NOT confirm appointments. A doctor reviews everything you produce.

The patient may write in ANY language or script: Urdu, Roman Urdu, English, Punjabi, Saraiki,
Pashto, Sindhi, Balochi, Arabic, Persian or anything else. Read the message and return JSON:
{
  "language": "the patient's language as one code: ur, roman_ur, en, pa, skr, ps, sd, bal, ar, fa, or another ISO 639-1 code",
  "urgency": "urgent" | "today" | "routine",
  "summary": "one or two plain English sentences for the doctor: symptoms, duration, age if given",
  "red_flags": ["short English labels of any danger signs, empty if none"],
  "specialty": "general" | "paediatrics" | "gynaecology" | "dermatology",
  "reply": "a short, kind reply in the SAME language and SAME script the patient used (Roman Urdu gets Roman Urdu, Pashto gets Pashto). No diagnosis, no medicine names. Say a doctor will confirm the time. If urgent, say the clinic team will call within minutes and to call 1122 if it gets worse.",
  "confidence": 0.0-1.0
}
Use "urgent" for chest pain, breathing trouble, fainting, heavy bleeding, stroke signs,
seizures, pregnancy bleeding, high fever in infants, or thoughts of self-harm.

Patient message:
"""


def gemini_triage(message: str, timeout: float = 12.0) -> TriageResult | None:
    if not settings.gemini_api_key:
        return None
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent"
    )
    body = {
        "contents": [{"parts": [{"text": GEMINI_PROMPT + message}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    try:
        r = httpx.post(url, params={"key": settings.gemini_api_key}, json=body, timeout=timeout)
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
        urgency = data.get("urgency", "routine")
        if urgency not in URGENCY_RANK:
            urgency = "today"  # unknown answer -> be cautious
        language = str(data.get("language") or "").strip().lower()[:16]
        if not re.fullmatch(r"[a-z_]{2,8}", language):
            language = detect_language(message)
        return TriageResult(
            urgency=urgency,
            summary=str(data.get("summary", "")).strip()[:600],
            red_flags=[str(f) for f in data.get("red_flags", [])][:6],
            specialty=str(data.get("specialty", "general")),
            reply_ur=str(data.get("reply") or data.get("reply_ur") or "").strip()[:600],
            language=language,
            engine=settings.gemini_model,
            confidence=float(data.get("confidence", 0.6)),
        )
    except Exception as exc:  # network, quota, bad JSON: fall back to rules
        log.warning("Gemini triage failed, using rules only: %s", exc)
        return None


def triage(message: str) -> TriageResult:
    rules = rules_triage(message)
    ai = gemini_triage(message)
    if ai is None:
        return rules

    # Safety merge: the more urgent answer wins, and rule red flags are never dropped.
    final = ai
    if URGENCY_RANK[rules.urgency] > URGENCY_RANK[ai.urgency]:
        final.urgency = rules.urgency
        final.reply_ur = default_reply(rules.urgency, final.language)
    final.red_flags = sorted(set(ai.red_flags) | set(rules.red_flags))
    if final.specialty == "general" and rules.specialty != "general":
        final.specialty = rules.specialty
    if not final.reply_ur:
        final.reply_ur = default_reply(final.urgency, final.language)
    final.engine = f"{ai.engine}+rules"
    return final
