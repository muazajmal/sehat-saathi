"""Languages Sehat Saathi understands and answers in.

Two jobs:

1. ``detect_language`` guesses the patient's language without any network
   call, from letters that only some languages use (Pashto ټ ښ, Sindhi ڪ ٻ,
   Arabic ة) and a few very common words. Gemini, when switched on, gives a
   better answer and overrides this guess.
2. ``reply`` returns the fixed messages (triage reply, booking confirmed,
   booking declined) in the patient's language. These are used when Gemini
   is off or fails, and whenever the safety rules raise the urgency.

Translations for Punjabi, Saraiki, Pashto and Sindhi should be checked by a
native speaker before a real clinic goes live. Balochi falls back to Urdu,
which most Balochi speakers in Pakistan read; Gemini can still answer in
Balochi when it is switched on.
"""
from __future__ import annotations

import re

# code -> (English name, right-to-left?)
LANGUAGES: dict[str, tuple[str, bool]] = {
    "ur": ("Urdu", True),
    "roman_ur": ("Roman Urdu", False),
    "en": ("English", False),
    "pa": ("Punjabi", True),
    "skr": ("Saraiki", True),
    "ps": ("Pashto", True),
    "sd": ("Sindhi", True),
    "bal": ("Balochi", True),
    "ar": ("Arabic", True),
    "fa": ("Persian", True),
}

ARABIC_SCRIPT = re.compile(r"[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")

# Letters used by one language (or family) and not by Urdu.
PASHTO_LETTERS = set("ټډړښږځڅېۍګڼ")
SINDHI_LETTERS = set("ڪٽٺٿڊڌڍڏڙڱڻڦڇڃڀ")
SARAIKI_LETTERS = set("ݙ")  # ٻ ڄ ڳ are shared with Sindhi
SINDHI_SARAIKI = set("ٻڄڳ")
ARABIC_ONLY = set("ةىأإؤ")
URDU_FAMILY = set("ےٹڈڑںھ")  # Urdu, Punjabi, Saraiki. Not Persian or Arabic.

WORDS: dict[str, list[str]] = {
    "ur": ["میں", "ہے", "ہیں", "کو", "سے", "کا", "کی", "مجھے", "میرے", "میری", "نہیں", "رہا", "رہی", "اور"],
    "pa": ["مینوں", "سانوں", "تہانوں", "وچ", "نوں", "اے", "ہویا", "رہیا", "پیڑ", "تاپ", "لہو", "ساہ"],
    "skr": ["میکوں", "ساکوں", "تہاکوں", "کوں", "میڈے", "میڈا", "تھیندا", "تھیندی", "پئی", "ہے تاں", "ونجو", "ٻال", "رت"],
    "ps": ["زما", "زه", "ستاسو", "دی", "ده", "کې", "مې", "یې", "ماشوم", "تبه", "وینه", "ساه"],
    "sd": ["آهي", "آهن", "منهنجو", "منهنجي", "مون", "۾", "کي", "ٿو", "ٿي", "سور", "رت", "ٻار"],
    "bal": ["منا", "انت", "بیت", "منی", "ءَ", "ءِ"],
    "fa": ["است", "دارم", "هستم", "می", "نمی", "سینه", "نفس", "تب", "بچه", "کودک", "خیلی"],
    "ar": ["عندي", "أعاني", "اعاني", "في", "من", "ألم", "الم", "لا", "طفل", "حرارة", "الصدر"],
}

ROMAN: dict[str, list[str]] = {
    "roman_ur": ["mein", "hai", "hoon", "hun", "nahi", "bohat", "dard", "bukhar", "mujhe", "kal se", "ho raha", "ko",
                 "chahiye", "raha", "rahi", "mera", "meri", "mere", "aur", "kya"],
    "pa": ["mainu", "menu", "sanu", "tuhanu", "vich", "ae", "hoya", "reha", "peer", "taap", "saah"],
    "skr": ["mekun", "mainkun", "kun", "theenda", "theendi", "paee", "wanjo", "maide"],
    "ps": ["zama", "ma ta", "dard dey", "dard de", "sa na sham", "tabba", "khog", "yam", "sta"],
}


def _tokens(text: str) -> list[str]:
    return re.findall(r"[\w؀-ۿݐ-ݿ]+", text.lower())


def is_rtl_script(text: str) -> bool:
    return bool(ARABIC_SCRIPT.search(text))


def detect_language(text: str) -> str:
    """Best guess at the patient's language. Never raises; defaults to Urdu/English."""
    low = text.lower()
    toks = set(_tokens(low))

    if is_rtl_script(text):
        chars = set(text)
        score = {code: 0.0 for code in ("ur", "pa", "skr", "ps", "sd", "bal", "ar", "fa")}
        score["ps"] += 3 * len(chars & PASHTO_LETTERS)
        score["sd"] += 3 * len(chars & SINDHI_LETTERS)
        score["skr"] += 3 * len(chars & SARAIKI_LETTERS)
        both = len(chars & SINDHI_SARAIKI)
        score["sd"] += 1.5 * both
        score["skr"] += 1.5 * both
        score["ar"] += 3 * len(chars & ARABIC_ONLY)
        # Arabic yeh/kaf (ي ك) instead of Persian/Urdu (ی ک) points to Arabic or Sindhi.
        if "ي" in chars or "ك" in chars:
            score["ar"] += 2
            score["sd"] += 1
        urdu_family = len(chars & URDU_FAMILY)
        if urdu_family:
            for code in ("ur", "pa", "skr"):
                score[code] += 1 + urdu_family
        for code, words in WORDS.items():
            score[code] += sum(1.5 for w in words if (w in toks if " " not in w else w in low))
        best = max(score, key=lambda c: score[c])
        # Urdu wins ties and is the default when nothing else stands out.
        return best if score[best] > score["ur"] else "ur"

    roman_scores = {code: sum(1 for w in words if (w in toks if " " not in w else w in low))
                    for code, words in ROMAN.items()}
    best = max(roman_scores, key=lambda c: roman_scores[c])
    if roman_scores[best] == 0:
        return "en"
    # Roman Urdu wins ties: it's by far the most common way patients type.
    if roman_scores[best] <= roman_scores["roman_ur"]:
        return "roman_ur"
    return best


# ---------- Fixed messages ----------
# Keys: urgent / today / routine / confirmed / declined.
# "confirmed" takes {date} {time} {doctor} {clinic}.

_UR = {
    "urgent": "آپ کی علامات فوری توجہ مانگتی ہیں۔ ہماری ٹیم چند منٹ میں آپ کو کال کرے گی۔ "
              "اگر حالت بگڑ رہی ہے تو فوراً 1122 پر کال کریں یا قریبی ایمرجنسی جائیں۔",
    "today": "شکریہ۔ ہم نے آج کے لیے ایک وقت تجویز کیا ہے۔ ڈاکٹر کی منظوری کے بعد آپ کو تصدیقی پیغام ملے گا۔",
    "routine": "شکریہ۔ ہم نے آپ کے لیے ایک وقت تجویز کیا ہے۔ ڈاکٹر کی منظوری کے بعد آپ کو تصدیقی پیغام ملے گا۔",
    "confirmed": "آپ کا وقت کنفرم ہو گیا ہے: {date} کو {time}، {doctor}، {clinic}۔",
    "declined": "ڈاکٹر نے آپ کا پیغام دیکھ لیا ہے۔ کلینک کی ٹیم جلد آپ سے رابطہ کرے گی۔",
}

MESSAGES: dict[str, dict[str, str]] = {
    "ur": _UR,
    "roman_ur": _UR,  # Roman Urdu writers read Urdu script replies fine; Gemini mirrors Roman when on.
    "bal": _UR,
    "en": {
        "urgent": "Your symptoms need urgent attention. Our team will call you within a few minutes. "
                  "If things get worse, call 1122 now or go to the nearest emergency department.",
        "today": "Thank you. We have suggested a time for today. You will get a confirmation once the doctor approves it.",
        "routine": "Thank you. We have suggested a time for you. You will get a confirmation once the doctor approves it.",
        "confirmed": "Your appointment is confirmed: {date} at {time}, {doctor}, {clinic}.",
        "declined": "The doctor has seen your message. The clinic team will contact you soon.",
    },
    "pa": {
        "urgent": "تہاڈیاں علامتاں نوں فوری توجہ دی لوڑ اے۔ ساڈی ٹیم کجھ منٹاں وچ تہانوں کال کرے گی۔ "
                  "جے حالت وگڑ رہی اے تے فوراً 1122 تے کال کرو یا نیڑے دی ایمرجنسی جاؤ۔",
        "today": "شکریہ۔ اسیں تہاڈے لئی اج دا اک ویلا تجویز کیتا اے۔ ڈاکٹر دی منظوری توں بعد تہانوں تصدیق دا سنیہا ملے گا۔",
        "routine": "شکریہ۔ اسیں تہاڈے لئی اک ویلا تجویز کیتا اے۔ ڈاکٹر دی منظوری توں بعد تہانوں تصدیق دا سنیہا ملے گا۔",
        "confirmed": "تہاڈا ویلا پکا ہو گیا اے: {date} نوں {time}، {doctor}، {clinic}۔",
        "declined": "ڈاکٹر نے تہاڈا سنیہا ویکھ لیا اے۔ کلینک دی ٹیم چھیتی تہاڈے نال رابطہ کرے گی۔",
    },
    "skr": {
        "urgent": "تہاڈیاں علامتاں کوں فوری توجہ دی لوڑ ہے۔ ساڈی ٹیم کجھ منٹاں وچ تہاکوں کال کریسی۔ "
                  "جے حالت خراب تھیندی پئی ہے تاں فوراً 1122 تے کال کرو یا نیڑے دی ایمرجنسی ونجو۔",
        "today": "مہربانی۔ اساں تہاڈے کیتے اڄ دا ہک ویلا تجویز کیتا ہے۔ ڈاکٹر دی منظوری توں بعد تہاکوں تصدیق دا سنیہا ملسی۔",
        "routine": "مہربانی۔ اساں تہاڈے کیتے ہک ویلا تجویز کیتا ہے۔ ڈاکٹر دی منظوری توں بعد تہاکوں تصدیق دا سنیہا ملسی۔",
        "confirmed": "تہاڈا ویلا پکا تھی گیا ہے: {date} کوں {time}، {doctor}، {clinic}۔",
        "declined": "ڈاکٹر تہاڈا سنیہا ݙٹھا ہے۔ کلینک دی ٹیم جلدی تہاڈے نال رابطہ کریسی۔",
    },
    "ps": {
        "urgent": "ستاسو نښې فوري پاملرنې ته اړتیا لري. زموږ ټیم به په څو دقیقو کې تاسو ته زنګ ووهي. "
                  "که حالت مو خراب شو، سمدستي 1122 ته زنګ ووهئ یا نږدې بیړنۍ څانګې ته لاړ شئ.",
        "today": "مننه. موږ تاسو ته د نن ورځې لپاره یو وخت وړاندیز کړی دی. د ډاکټر له تایید وروسته به تاسو ته د تایید پیغام درشي.",
        "routine": "مننه. موږ تاسو ته یو وخت وړاندیز کړی دی. د ډاکټر له تایید وروسته به تاسو ته د تایید پیغام درشي.",
        "confirmed": "ستاسو وخت تایید شو: {date} په {time}، {doctor}، {clinic}.",
        "declined": "ډاکټر ستاسو پیغام ولید. د کلینیک ټیم به ژر له تاسو سره اړیکه ونیسي.",
    },
    "sd": {
        "urgent": "توهان جون علامتون فوري توجه گهرن ٿيون. اسان جي ٽيم ڪجهه منٽن ۾ توهان کي ڪال ڪندي. "
                  "جيڪڏهن حالت خراب ٿئي ته فوري طور 1122 تي ڪال ڪريو يا ويجهي ايمرجنسي ڏانهن وڃو.",
        "today": "مهرباني. اسان توهان لاءِ اڄ جو هڪ وقت تجويز ڪيو آهي. ڊاڪٽر جي منظوري کان پوءِ توهان کي تصديقي پيغام ملندو.",
        "routine": "مهرباني. اسان توهان لاءِ هڪ وقت تجويز ڪيو آهي. ڊاڪٽر جي منظوري کان پوءِ توهان کي تصديقي پيغام ملندو.",
        "confirmed": "توهان جو وقت پڪو ٿي ويو آهي: {date} تي {time}، {doctor}، {clinic}.",
        "declined": "ڊاڪٽر توهان جو پيغام ڏٺو آهي. ڪلينڪ جي ٽيم جلد توهان سان رابطو ڪندي.",
    },
    "ar": {
        "urgent": "أعراضك تحتاج إلى اهتمام عاجل. سيتصل بك فريقنا خلال دقائق. "
                  "إذا ساءت حالتك، اتصل فوراً على 1122 أو توجّه إلى أقرب قسم طوارئ.",
        "today": "شكراً لك. اقترحنا لك موعداً اليوم. ستصلك رسالة تأكيد بعد موافقة الطبيب.",
        "routine": "شكراً لك. اقترحنا لك موعداً. ستصلك رسالة تأكيد بعد موافقة الطبيب.",
        "confirmed": "تم تأكيد موعدك: {date} الساعة {time}، {doctor}، {clinic}.",
        "declined": "اطّلع الطبيب على رسالتك. سيتواصل معك فريق العيادة قريباً.",
    },
    "fa": {
        "urgent": "علائم شما نیاز به رسیدگی فوری دارد. تیم ما تا چند دقیقه دیگر با شما تماس می‌گیرد. "
                  "اگر حالتان بدتر شد، فوراً با 1122 تماس بگیرید یا به نزدیک‌ترین اورژانس بروید.",
        "today": "متشکریم. یک وقت برای امروز پیشنهاد دادیم. پس از تأیید پزشک، پیام تأیید برایتان ارسال می‌شود.",
        "routine": "متشکریم. یک وقت برای شما پیشنهاد دادیم. پس از تأیید پزشک، پیام تأیید برایتان ارسال می‌شود.",
        "confirmed": "وقت شما تأیید شد: {date} ساعت {time}، {doctor}، {clinic}.",
        "declined": "پزشک پیام شما را دید. تیم کلینیک به‌زودی با شما تماس می‌گیرد.",
    },
}


def reply(kind: str, language: str, **fields: str) -> str:
    """A fixed message in the patient's language (English for languages we have no template for)."""
    table = MESSAGES.get(language) or MESSAGES["en"]
    return table[kind].format(**fields) if fields else table[kind]


def language_name(code: str) -> str:
    return LANGUAGES.get(code, (code, False))[0]


# ---------- Getting to hospital ----------
# Sent when a staff member approves a dispatch. {responder} {hospital} {eta}.
# "emergency" = urgent case: 1122 always comes first.

_DISPATCH_UR = {
    "dispatch_transport": "صحت ساتھی کے رضاکار {responder} آپ کی طرف روانہ ہو گئے ہیں (تقریباً {eta} منٹ)۔ "
                          "وہ آپ کو {hospital} لے جائیں گے۔ اپنا فون آن رکھیں۔",
    "dispatch_emergency": "اگر آپ نے ابھی تک 1122 پر کال نہیں کی تو فوراً کریں۔ صحت ساتھی کے رضاکار {responder} بھی "
                          "مدد کے لیے آپ کی طرف آ رہے ہیں (تقریباً {eta} منٹ) اور آپ سے {hospital} میں ملیں گے۔",
}

DISPATCH_MESSAGES: dict[str, dict[str, str]] = {
    "ur": _DISPATCH_UR,
    "roman_ur": _DISPATCH_UR,
    "bal": _DISPATCH_UR,
    "en": {
        "dispatch_transport": "A Sehat Saathi responder, {responder}, is on the way to you (about {eta} min). "
                              "They will take you to {hospital}. Please keep your phone on.",
        "dispatch_emergency": "Please call 1122 now if you have not already. A Sehat Saathi responder, {responder}, "
                              "is also on the way (about {eta} min) to help and to meet you at {hospital}.",
    },
    "pa": {
        "dispatch_transport": "صحت ساتھی دا رضاکار {responder} تہاڈے ول آ رہیا اے (لگ بھگ {eta} منٹ)۔ "
                              "اوہ تہانوں {hospital} لے جاوے گا۔ اپنا فون چالو رکھو۔",
        "dispatch_emergency": "جے تسیں حالے تک 1122 تے کال نہیں کیتی تے فوراً کرو۔ صحت ساتھی دا رضاکار {responder} وی "
                              "مدد لئی آ رہیا اے (لگ بھگ {eta} منٹ) تے تہانوں {hospital} وچ ملے گا۔",
    },
    "skr": {
        "dispatch_transport": "صحت ساتھی دا رضاکار {responder} تہاڈے ول آندا پئے (تقریباً {eta} منٹ)۔ "
                              "او تہاکوں {hospital} گھن ویسی۔ اپݨا فون چالو رکھو۔",
        "dispatch_emergency": "جے تساں ہݨ تئیں 1122 تے کال کائنی کیتی تاں فوراً کرو۔ صحت ساتھی دا رضاکار {responder} وی "
                              "مدد کیتے آندا پئے (تقریباً {eta} منٹ) تے تہاکوں {hospital} وچ ملسی۔",
    },
    "ps": {
        "dispatch_transport": "د Sehat Saathi رضاکار {responder} ستاسو په لور روان دی (شاوخوا {eta} دقیقې). "
                              "هغه به تاسو {hospital} ته یوسي. خپل ټیلیفون روښانه وساتئ.",
        "dispatch_emergency": "که مو تر اوسه 1122 ته زنګ نه دی وهلی، همدا اوس یې ووهئ. د Sehat Saathi رضاکار {responder} هم "
                              "د مرستې لپاره درځي (شاوخوا {eta} دقیقې) او په {hospital} کې به له تاسو سره وي.",
    },
    "sd": {
        "dispatch_transport": "Sehat Saathi جو رضاڪار {responder} توهان ڏانهن اچي رهيو آهي (لڳ ڀڳ {eta} منٽ). "
                              "هو توهان کي {hospital} وٺي ويندو. پنهنجو فون چالو رکو.",
        "dispatch_emergency": "جيڪڏهن توهان اڃا تائين 1122 تي ڪال نه ڪئي آهي ته هاڻي ئي ڪريو. Sehat Saathi جو رضاڪار {responder} "
                              "به مدد لاءِ اچي رهيو آهي (لڳ ڀڳ {eta} منٽ) ۽ توهان سان {hospital} ۾ ملندو.",
    },
    "ar": {
        "dispatch_transport": "مُسعف من Sehat Saathi، {responder}، في طريقه إليك (حوالي {eta} دقيقة). "
                              "سينقلك إلى {hospital}. يرجى إبقاء هاتفك مفتوحاً.",
        "dispatch_emergency": "يرجى الاتصال بالرقم 1122 الآن إن لم تفعل بعد. مُسعف من Sehat Saathi، {responder}، "
                              "في طريقه أيضاً (حوالي {eta} دقيقة) للمساعدة ولمقابلتك في {hospital}.",
    },
    "fa": {
        "dispatch_transport": "یک امدادگر Sehat Saathi، {responder}، در راه است (حدود {eta} دقیقه). "
                              "او شما را به {hospital} می‌برد. لطفاً تلفن خود را روشن نگه دارید.",
        "dispatch_emergency": "اگر هنوز با 1122 تماس نگرفته‌اید، همین حالا تماس بگیرید. یک امدادگر Sehat Saathi، {responder}، "
                              "هم برای کمک در راه است (حدود {eta} دقیقه) و در {hospital} به شما می‌پیوندد.",
    },
}


def dispatch_reply(tier: str, language: str, **fields: str) -> str:
    table = DISPATCH_MESSAGES.get(language) or DISPATCH_MESSAGES["en"]
    return table[f"dispatch_{tier}"].format(**fields)
