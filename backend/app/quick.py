"""One-tap answers from the patient website (symptom buttons and follow-up questions).

The patient's words still go through triage as before. These answers are a second,
fixed safety layer: a tapped danger sign always counts, whatever the text says.
"""
from .languages import reply as lang_reply
from .triage import URGENCY_RANK, TriageResult, merge_flags

# key -> (label for the doctor, urgency it means, red-flag label or "")
SYMPTOMS = {
    "chest": ("Chest pain", "urgent", "Chest pain"),
    "breathing": ("Trouble breathing", "urgent", "Breathing difficulty"),
    "fever": ("Fever", "routine", ""),
    "stomach": ("Stomach pain, vomiting or loose motions", "routine", ""),
    "pregnancy": ("Pregnancy problem", "today", ""),
    "injury": ("Injury or burn", "today", ""),
    "headache": ("Headache", "routine", ""),
    "cough": ("Cough or cold", "routine", ""),
    "skin": ("Skin rash or itching", "routine", ""),
    "other": ("Something else", "routine", ""),
}
ANSWERS = {
    "sweating": ("Sweating", "urgent", ""),
    "pain_arm": ("Pain spreading to arm or jaw", "urgent", ""),
    "short_breath": ("Short of breath", "urgent", "Breathing difficulty"),
    "lips_blue": ("Lips or face turning blue", "urgent", "Blue lips / face"),
    "cant_speak": ("Can't finish a sentence", "urgent", "Breathing difficulty"),
    "fever_high": ("Very high fever (103°F or more)", "today", ""),
    "stiff_neck": ("Stiff neck or rash with fever", "urgent", "Fever with stiff neck / rash"),
    "fits": ("Fits (seizure)", "urgent", "Seizure"),
    "drowsy": ("Very drowsy, hard to wake", "urgent", "Hard to wake"),
    "vomit_blood": ("Vomiting blood or black stool", "urgent", "Bleeding from stomach"),
    "dehydrated": ("Can't keep water down, very little urine", "today", ""),
    "severe_pain": ("Severe pain", "today", ""),
    "preg_bleeding": ("Bleeding in pregnancy", "urgent", "Pregnancy warning"),
    "preg_pain": ("Severe belly pain in pregnancy", "urgent", "Pregnancy warning"),
    "baby_moves_less": ("Baby moving less", "urgent", "Pregnancy warning"),
    "preg_headache": ("Bad headache or blurred vision in pregnancy", "urgent", "Pregnancy warning"),
    "bleeding_wont_stop": ("Bleeding won't stop", "urgent", "Heavy bleeding"),
    "head_injury": ("Head injury, then fainted or vomited", "urgent", "Head injury"),
    "big_burn": ("Large burn or burn on the face", "urgent", "Serious burn"),
    "broken_bone": ("Bone may be broken", "today", ""),
    "worst_headache": ("Sudden, worst-ever headache", "urgent", "Sudden severe headache"),
    "one_side_weak": ("Face drooping or one side weak", "urgent", "Stroke signs"),
    "cough_blood": ("Coughing blood", "today", ""),
    "cough_weeks": ("Cough for more than 2 weeks", "routine", ""),
    "face_swelling": ("Face or lips swelling", "urgent", "Allergic swelling"),
}
FOR_WHOM = {"self": "for themselves", "child": "for their child", "parent": "for a parent", "other": "for someone else"}
SINCE = {"today": "started today", "days": "for 2-3 days", "week": "for a week or more"}
SPECIALTY = {"pregnancy": "gynaecology", "skin": "dermatology"}


def _age_months(age: int | None, unit: str) -> int | None:
    if age is None:
        return None
    return age if unit == "months" else age * 12


def apply(result: TriageResult, quick: dict) -> TriageResult:
    symptoms = [s for s in quick.get("symptoms") or [] if s in SYMPTOMS]
    answers = [a for a in quick.get("answers") or [] if a in ANSWERS]
    months = _age_months(quick.get("age"), quick.get("age_unit") or "years")

    urgency, flags = result.urgency, []
    for urg, flag in [SYMPTOMS[s][1:] for s in symptoms] + [ANSWERS[a][1:] for a in answers]:
        if URGENCY_RANK[urg] > URGENCY_RANK[urgency]:
            urgency = urg
        if flag:
            flags.append(flag)
    # Babies: any fever under 3 months, or a very high fever under 1 year, needs a doctor now.
    if months is not None and "fever" in symptoms and (months < 3 or ("fever_high" in answers and months < 12)):
        urgency = "urgent"
        flags.append("Infant high fever")

    # A plain line for the doctor, in English, whatever language the patient used.
    parts = []
    who = FOR_WHOM.get(quick.get("for_whom") or "")
    if who or months is not None:
        age = ""
        if quick.get("age") is not None:
            age = f"{quick['age']} {'months' if quick.get('age_unit') == 'months' else 'years'} old"
        parts.append(", ".join(p for p in (f"Asking {who}" if who else "", age) if p))
    if symptoms:
        parts.append("Tapped: " + ", ".join(SYMPTOMS[s][0].lower() for s in symptoms))
    if answers:
        parts.append("; ".join(ANSWERS[a][0] for a in answers))
    if quick.get("since") in SINCE:
        parts.append(SINCE[quick["since"]].capitalize())
    if parts:
        result.summary = (result.summary.rstrip() + " Quick answers: " + ". ".join(parts) + ".").strip()[:900]

    if URGENCY_RANK[urgency] > URGENCY_RANK[result.urgency]:
        result.urgency = urgency
        result.reply_ur = lang_reply(urgency, result.language)
        result.confidence = max(result.confidence, 0.85)
    result.red_flags = merge_flags(result.red_flags, flags)
    if result.specialty == "general":
        if quick.get("for_whom") == "child" or (months is not None and months < 12 * 12):
            result.specialty = "paediatrics"
        else:
            result.specialty = next((SPECIALTY[s] for s in symptoms if s in SPECIALTY), "general")
    return result
