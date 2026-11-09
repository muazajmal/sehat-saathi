"""Which first-aid guides to show a patient while help is on the way.

Only for danger signs where bystander first aid is standard. The content itself lives in
frontend/lib/firstAid.json (St John Ambulance guidance, checked and signed off by Dr. Sheryar on 9 Nov 2026).
"""
import re

FLAG_TO_GUIDE = {
    "Chest pain": "heart",
    "Breathing difficulty": "breathing",
    "Unconscious / fainting": "unconscious",
    "Heavy bleeding": "bleeding",
    "Stroke signs": "stroke",
    "Seizure": "seizure",
}

# Words in the patient's own message (Urdu, Roman Urdu, English) for two guides the rules don't flag.
EXTRA = [
    ("burns", re.compile(r"\bburn|jal gay|jal gai|jala|جل گی|جل گئ|جھلس", re.I)),
    ("choking", re.compile(r"chok|phans|phas gay|atak gay|گلے میں.*(پھنس|اٹک)", re.I)),
]


def guides_for(red_flags: list[str], message: str) -> list[str]:
    out: list[str] = []
    for f in red_flags or []:
        key = FLAG_TO_GUIDE.get(f)
        if key is None:  # Gemini may word a flag differently
            low = f.lower()
            key = next((v for k, v in FLAG_TO_GUIDE.items() if k.split(" ")[0].lower() in low), None)
        if key and key not in out:
            out.append(key)
    for key, rx in EXTRA:
        if key not in out and rx.search(message or ""):
            out.append(key)
    return out[:3]
