"""Area health alerts: spot a rise of one kind of illness in one neighbourhood, and draft a public
alert the hospital approves before anyone sees it.

Areas are approximate centre points of Multan neighbourhoods (good enough to group cases, not for
navigation). A case counts once the patient has shared a location.
"""
import re
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ai, transport
from .config import settings
from .models import AreaAlert, Case, CaseLocation, SampleSignal
from .services import now

AREAS = [  # name, lat, lng (approximate centres)
    ("Gulgasht Colony", 30.2205, 71.4875),
    ("Bosan Road", 30.2330, 71.4660),
    ("Shah Rukn-e-Alam Colony", 30.1660, 71.5040),
    ("Mumtazabad", 30.1720, 71.4880),
    ("Multan Cantt", 30.1840, 71.4420),
    ("New Multan", 30.2150, 71.4500),
    ("Model Town", 30.2060, 71.4790),
    ("Hussain Agahi / Old City", 30.1975, 71.4745),
    ("Chungi No. 9", 30.2010, 71.4560),
    ("Qasim Bela", 30.1590, 71.4430),
]
AREA_NAMES = [a[0] for a in AREAS]

GROUPS = {
    "fever": {"en": "Fever", "ur": "بخار",
              "rx": r"bukh?a+r|fever|temperature|t[ae]mp|dengue|malaria|typhoid|بخار|ڈینگی|ملیریا"},
    "diarrhoea": {"en": "Diarrhoea and vomiting", "ur": "دست اور الٹی",
                  "rx": r"dast|diarr|loose motion|vomit|ulti|qay|cholera|اسہال|دست|الٹی|قے|ہیضہ"},
    "cough": {"en": "Cough and flu", "ur": "کھانسی اور نزلہ",
              "rx": r"khaa?nsi|cough|flu|nazla|zukam|sore throat|gala kharab|کھانسی|نزلہ|زکام"},
    "rash": {"en": "Skin rash and itching", "ur": "جلد پر دانے اور خارش",
             "rx": r"kharish|khujli|rash|itch|scabies|daan[ae]|خارش|خارج|دانے"},
    "eye": {"en": "Red, sore eyes", "ur": "آنکھوں کی سرخی",
            "rx": r"aankh|ankh|eye|conjunctiv|آنکھ"},
}

ADVICE = {
    "fever": {
        "en": "Empty any standing water around your home (coolers, pots, tyres), use mosquito nets or repellent, and drink plenty of fluids. See a doctor if fever lasts more than 2 days, or with bleeding, severe pain or drowsiness.",
        "ur": "گھر کے آس پاس کھڑا پانی (کولر، گملے، ٹائر) خالی کریں، مچھر دانی یا مچھر بھگانے والی دوا استعمال کریں اور پانی زیادہ پئیں۔ بخار 2 دن سے زیادہ رہے، یا خون آئے، شدید درد یا غنودگی ہو تو ڈاکٹر کو دکھائیں۔"},
    "diarrhoea": {
        "en": "Boil drinking water, wash hands with soap, and avoid cut fruit and street food for now. Give ORS for loose motions. See a doctor for blood in stool, a child who won't drink, or signs of dehydration.",
        "ur": "پینے کا پانی ابال کر پئیں، صابن سے ہاتھ دھوئیں اور ابھی کٹے پھل اور ٹھیلے کا کھانا نہ کھائیں۔ دست میں او آر ایس دیں۔ پاخانے میں خون، بچہ پانی نہ پیے، یا پانی کی کمی ہو تو ڈاکٹر کو دکھائیں۔"},
    "cough": {
        "en": "Cover coughs and sneezes, wash hands often, and wear a mask when unwell. Keep children and older people away from anyone sick. See a doctor for breathing trouble or fever for more than 3 days.",
        "ur": "کھانستے اور چھینکتے وقت منہ ڈھانپیں، بار بار ہاتھ دھوئیں اور بیماری میں ماسک پہنیں۔ بچوں اور بزرگوں کو بیمار لوگوں سے دور رکھیں۔ سانس میں تکلیف یا 3 دن سے زیادہ بخار ہو تو ڈاکٹر کو دکھائیں۔"},
    "rash": {
        "en": "Keep skin clean and dry, and don't share towels, clothes or bedding. Wash bedding in hot water. See a doctor if the rash spreads, comes with fever, or affects a baby.",
        "ur": "جلد صاف اور خشک رکھیں، تولیہ، کپڑے اور بستر کسی سے شیئر نہ کریں۔ بستر گرم پانی میں دھوئیں۔ دانے پھیلیں، بخار ہو یا بچے کو ہوں تو ڈاکٹر کو دکھائیں۔"},
    "eye": {
        "en": "Don't rub your eyes, wash hands often, and don't share towels or eye make-up. Keep children with red eyes home from school for a few days. See a doctor for eye pain or blurred vision.",
        "ur": "آنکھیں نہ ملیں، بار بار ہاتھ دھوئیں، تولیہ یا سرمہ شیئر نہ کریں۔ سرخ آنکھوں والے بچوں کو چند دن اسکول نہ بھیجیں۔ آنکھ میں درد یا دھندلا دکھائی دے تو ڈاکٹر کو دکھائیں۔"},
}


def nearest_area(lat: float, lng: float, max_km: float = 4.0) -> str | None:
    best = min(AREAS, key=lambda a: transport.distance_km(lat, lng, a[1], a[2]))
    return best[0] if transport.distance_km(lat, lng, best[1], best[2]) <= max_km else None


def symptom_group(text: str) -> str | None:
    t = (text or "").lower()
    for key, g in GROUPS.items():
        if re.search(g["rx"], t):
            return key
    return None


def signals(db: Session, since):
    """(area, group, time) for every case with a shared location, plus demo history."""
    out = []
    rows = db.execute(select(Case.message, Case.summary, Case.created_at, CaseLocation.lat, CaseLocation.lng)
                      .join(CaseLocation, CaseLocation.case_id == Case.id).where(Case.created_at >= since))
    for msg, summary, at, lat, lng in rows:
        area, grp = nearest_area(lat, lng), symptom_group(f"{msg} {summary}")
        if area and grp:
            out.append((area, grp, at))
    for s in db.scalars(select(SampleSignal).where(SampleSignal.at >= since)):
        out.append((s.area, s.group, s.at))
    return out


def detect(db: Session) -> list[dict]:
    """This week vs the average of the 4 weeks before. A rise needs at least 4 cases and double
    the usual; 'alert' needs 8 cases and triple. Simple, explainable numbers a doctor can check."""
    t = now()
    week_ago, base_from = t - timedelta(days=7), t - timedelta(days=35)
    this_week, before = defaultdict(int), defaultdict(int)
    daily = defaultdict(lambda: [0] * 7)
    for area, grp, at in signals(db, base_from):
        if at >= week_ago:
            this_week[(area, grp)] += 1
            daily[(area, grp)][min(6, max(0, (at - week_ago).days))] += 1
        else:
            before[(area, grp)] += 1
    found = []
    for key, n in this_week.items():
        base = before[key] / 4
        ratio = n / max(base, 1)
        level = "alert" if n >= 8 and ratio >= 3 else "watch" if n >= 4 and ratio >= 2 else None
        if level:
            area, grp = key
            found.append({"area": area, "group": grp, "group_en": GROUPS[grp]["en"], "group_ur": GROUPS[grp]["ur"],
                          "level": level, "cases_week": n, "baseline_week": round(base, 1), "ratio": round(ratio, 1),
                          "daily": daily[key], "lat": dict((a[0], a[1]) for a in AREAS)[area],
                          "lng": dict((a[0], a[2]) for a in AREAS)[area]})
    found.sort(key=lambda f: (f["level"] != "alert", -f["cases_week"]))
    return found


def map_points(db: Session) -> list[dict]:
    """Cases per area this week, for the desk map."""
    week_ago = now() - timedelta(days=7)
    count = defaultdict(int)
    for area, _grp, _at in signals(db, week_ago):
        count[area] += 1
    return [{"area": a, "lat": lat, "lng": lng, "cases": count.get(a, 0)} for a, lat, lng in AREAS]


DRAFT_PROMPT = """You write short public health notices for a hospital in Multan, Pakistan, sent to people in one
neighbourhood. Facts: {n} people from {area} came with {group} in the last 7 days (usually about {base} a week).
Return JSON: {{"title_en": "...", "body_en": "...", "title_ur": "...", "body_ur": "..."}}
Rules: calm, not scary; say cases are higher than usual in {area}; give only these prevention steps, in plain words:
{advice}
Never name a diagnosis as confirmed, never mention medicines or doses. End with: in an emergency call 1122.
Urdu in Urdu script. Body under 70 words each. Title under 9 words."""


def draft(db: Session, found: dict) -> AreaAlert:
    grp = found["group"]
    adv = ADVICE[grp]
    title_en = f"{GROUPS[grp]['en']} cases rising in {found['area']}"
    title_ur = f"{found['area']} میں {GROUPS[grp]['ur']} کے کیس بڑھ رہے ہیں"
    body_en = (f"More people than usual from {found['area']} have come to us with {GROUPS[grp]['en'].lower()} this week. "
               f"{adv['en']} In an emergency, call 1122.")
    body_ur = f"اس ہفتے {found['area']} سے معمول سے زیادہ لوگ {GROUPS[grp]['ur']} کے ساتھ آئے ہیں۔ {adv['ur']} ایمرجنسی میں 1122 پر کال کریں۔"
    by = "template"
    data = ai.gemini_json(DRAFT_PROMPT.format(n=found["cases_week"], area=found["area"], group=GROUPS[grp]["en"].lower(),
                                              base=found["baseline_week"], advice=adv["en"]), temperature=0.3)
    if isinstance(data, dict) and all(isinstance(data.get(k), str) and data.get(k) for k in ("title_en", "body_en", "title_ur", "body_ur")):
        title_en, body_en, title_ur, body_ur = (data[k].strip()[:600] for k in ("title_en", "body_en", "title_ur", "body_ur"))
        by = settings.gemini_model
    a = AreaAlert(area=found["area"], group=grp, level=found["level"], cases_week=found["cases_week"],
                  baseline_week=found["baseline_week"], title_en=title_en[:200], body_en=body_en, title_ur=title_ur[:200],
                  body_ur=body_ur, drafted_by=by, status="draft", created_at=now())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a
