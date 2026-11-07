"""Every language: right language detected, danger signs caught, reply in that language."""
import pytest

from app.languages import MESSAGES, detect_language
from app.triage import rules_triage

CASES = [
    # (message, expected language, expected urgency, expected flag or None)
    ("Mere abbu ko 20 minute se seene mein dard hai aur paseena aa raha hai", "roman_ur", "urgent", "Chest pain"),
    ("میرے بچے کو کل رات سے تیز بخار ہے اور الٹی بھی ہو رہی ہے", "ur", "urgent", "Infant high fever"),
    ("I need a routine follow-up for my blood pressure", "en", "routine", None),
    ("blood pressure bohat zyada hai", "roman_ur", "routine", None),
    ("بخار ہے", "ur", "routine", None),
    # Punjabi
    ("مینوں سینے وچ بہت پیڑ ہو رہی اے", "pa", "urgent", "Chest pain"),
    ("میرے پیو نوں ساہ نہیں آ رہیا", "pa", "urgent", "Breathing difficulty"),
    ("مینوں دو دن توں تاپ اے", "pa", "routine", None),
    # Saraiki
    ("میڈے ٻال کوں کل رات توں تیز بخار ہے تے الٹی وی تھیندی پئی ہے", "skr", "urgent", "Infant high fever"),
    ("میکوں سینے وچ درد تھیندا پیا ہے", "skr", "urgent", "Chest pain"),
    # Pashto
    ("زما پلار ته د سینې درد دی او ساه نه شي اخیستلی", "ps", "urgent", "Chest pain"),
    ("زما ماشوم ډېره تبه لري", "ps", "urgent", "Infant high fever"),
    ("زه د سر خوږ لرم", "ps", "routine", None),
    # Sindhi
    ("منهنجي پيءُ کي سيني ۾ سور آهي", "sd", "urgent", "Chest pain"),
    ("منهنجي ٻار کي تيز بخار آهي", "sd", "urgent", "Infant high fever"),
    ("مون کي ٻن ڏينهن کان بخار آهي", "sd", "routine", None),
    # Arabic
    ("أعاني من ألم في الصدر وضيق في التنفس", "ar", "urgent", "Chest pain"),
    ("طفلي عنده حرارة عالية منذ أمس", "ar", "urgent", "Infant high fever"),
    ("عندي صداع خفيف", "ar", "routine", None),
    # Persian
    ("درد قفسه سینه دارم و نفسم بند میاد", "fa", "urgent", "Chest pain"),
    ("نوزادم تب بالا دارد", "fa", "urgent", "Infant high fever"),
    ("سرفه دارم", "fa", "routine", None),
    # Pregnancy and bleeding across languages
    ("I am pregnant and there is bleeding", "en", "urgent", "Pregnancy warning"),
    ("حامل وعندي نزيف", "ar", "urgent", "Heavy bleeding"),
]


@pytest.mark.parametrize("msg,lang,urgency,flag", CASES)
def test_language_triage(msg, lang, urgency, flag):
    r = rules_triage(msg)
    assert r.language == lang, f"language: got {r.language}"
    assert r.urgency == urgency, f"urgency: got {r.urgency} flags={r.red_flags}"
    if flag:
        assert flag in r.red_flags
    assert r.reply_ur == MESSAGES.get(lang, MESSAGES["en"])[urgency]


def test_every_language_has_every_message():
    kinds = {"urgent", "today", "routine", "confirmed", "declined"}
    for code, table in MESSAGES.items():
        assert set(table) == kinds, code
        assert "{date}" in table["confirmed"] and "{doctor}" in table["confirmed"], code


def test_detect_defaults():
    assert detect_language("ok") == "en"
    assert detect_language("درد") == "ur"
