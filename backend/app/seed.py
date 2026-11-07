"""Demo data: a week of slots and a few realistic cases.

Run on its own to reset:  python -m app.seed --reset
"""
import sys
from datetime import timedelta

from sqlalchemy import func, select

from .db import Base, SessionLocal, engine
from .models import Slot
from .services import create_intake, now

DOCTORS = [
    ("Dr. Ayesha Malik", "general"),
    ("Dr. Usman Raza", "general"),
    ("Dr. Hina Qureshi", "paediatrics"),
    ("Dr. Sana Iqbal", "gynaecology"),
]

DEMO_MESSAGES = [
    ("+923001112233", "Rashid Ahmed", "Mere abbu ko 20 minute se seene mein dard hai aur paseena aa raha hai, umar 62 saal"),
    ("+923214445566", "Nadia Khan", "میرے بچے کو کل رات سے تیز بخار ہے اور الٹی بھی ہو رہی ہے، عمر 4 سال"),
    ("+923335556677", "Bilal Hussain", "Haath pe kharish aur rash hai 1 hafte se, dawai lagai lekin farq nahi para"),
    ("+923456667788", "Farah Siddiqui", "I need a routine follow-up for my blood pressure readings, they have been stable"),
]


def seed_slots(db, days: int = 6, from_day: int = 0):
    start = now().replace(minute=0, second=0)
    for d in range(from_day, from_day + days):
        day = (start + timedelta(days=d)).replace(hour=9)
        for doctor, specialty in DOCTORS:
            for i in range(0, 12 * 4):  # 9:00 to 21:00, every 15 min
                t = day + timedelta(minutes=15 * i)
                if t <= now():
                    continue
                if i % 3:  # keep the grid light: one slot every 45 min per doctor
                    continue
                db.add(Slot(doctor=doctor, specialty=specialty, starts_at=t, minutes=15))
    db.commit()


def top_up_slots(db, ahead_days: int = 6):
    """Keep a week of future slots, so a long-lived database never runs dry."""
    last = db.scalar(select(func.max(Slot.starts_at)))
    today = now().date()
    if last is None:
        seed_slots(db, ahead_days)
        return
    have_until = (last.date() - today).days
    if have_until < ahead_days - 1:
        start = max(have_until + 1, 0)
        seed_slots(db, ahead_days - start, from_day=start)


def seed(reset: bool = False):
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        empty = not db.scalar(select(func.count(Slot.id)))
        top_up_slots(db)
        if empty:
            for phone, name, msg in DEMO_MESSAGES:
                create_intake(db, phone, name, msg, "whatsapp")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
    print("Seeded.")
