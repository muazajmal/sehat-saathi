# Sehat Saathi — صحت ساتھی
### MVP Document · TechSoc'26 AI Hackathon · Theme: *AI with Purpose — Building Better Societies*

| | |
| --- | --- |
| **Team** | Muaz Ajmal (+ teammates: add names) · FAST-NUCES Multan |
| **Focus area** | 03 Local Services & Coordination (Clinics), with 04 Mutual Support (responders, blood donors, family check-ins) |
| **Live MVP** | https://sehat-saathi-eta.vercel.app/app · staff login: https://sehat-saathi-eta.vercel.app/login |
| **Repository** | https://github.com/muazajmal/sehat-saathi |

---

## 1. The problem in our community

In Multan, a sick person who goes to a government hospital or clinic usually:

- waits in a long OPD line just to get a token, often after travelling for hours;
- can't fill an English form or explain symptoms to a busy receptionist, especially if they speak Saraiki, Punjabi or Pashto, or can't read;
- waits in the **same line** whether they have a rash or chest pain, because nobody sorts the urgent cases first;
- in an emergency, the family doesn't know what to do until the ambulance arrives.

Doctors, meanwhile, have no early picture of who is coming and how sick they are.

## 2. Our solution

**Sehat Saathi is a free health helper for the local community and a front desk for hospitals.** A patient **speaks or
types** their problem in their own language. The AI writes a short English summary for the doctor, marks it
**Urgent / See today / Routine**, holds the earliest fitting appointment and replies in the patient's language.
Danger signs show a one-tap **Call 1122**, alert the duty doctor, and open a **first-aid video guide** (pictures,
captions and voice) while help is on the way. **A named doctor approves every booking.**

| User | What they do |
| --- | --- |
| **Patient** | Asks for help by voice or text, no account needed. Free account to see every request, the doctor's decision, reminders and messages. |
| **Family** | Daily "I'm okay" check-in for a parent living alone; told at once if they need help or don't answer. |
| **Doctor** | Desk sorted by urgency; approves, changes or declines. Every decision is signed with their own name. |
| **Hospital admin** | Adds doctors, sees the schedule, reports, area health alerts and blood requests for their own hospital only. |
| **Ambulance driver** | Signs up, is checked by the hospital, gets a private trip page and shares live location. |
| **Blood donor** | Asked only when a nearby patient needs their group; number shared only after they say yes. |
| **Platform owner** | Approves or pauses hospitals that apply to join. |

## 3. How AI is used (meaningfully, not decoratively)

| Step | AI | Why it matters |
| --- | --- | --- |
| Voice → text | **Gemini** transcribes voice notes in Urdu, Punjabi, Saraiki, Pashto, Sindhi, English and more | People who can't type or read can still ask for help |
| Understanding | **Gemini** detects the language, summarises in English for the doctor, picks the department | Doctor reads 2 lines instead of a long Roman-Urdu message |
| Triage | **Gemini + fixed danger-sign rules** in 10 languages. The safer result always wins | The AI can never lower the urgency of chest pain or breathing trouble |
| Reply | **Gemini** answers in the patient's own language and script | Patient understands what happens next |
| Prescriptions | **Gemini** reads a prescription photo into a list the patient checks | Medicine reminders without typing |
| Area health | Spots an illness rising in a neighbourhood; **Gemini** drafts an Urdu + English notice | A doctor approves a ready draft before anyone sees it |
| Routing | Location → right Multan government hospital (cardiology, children's, burns, general) | Right hospital first time |
| Automation | **n8n**: urgent-case alerts, ambulance trips, booking emails through Gmail | Duty doctor alerted in minutes; patient gets a confirmation email |

## 4. Working MVP — what you can try live

1. **Ask for help:** `/app` → *I need help now* → speak or type "mere abbu ke seene mein dard hai" → **Urgent**, Call 1122, first-aid guide opens, reply in Urdu.
2. **Share location:** the desk suggests the right hospital and the nearest ambulance; the patient sees it coming on a **live map**.
3. **Doctor:** `/login` → Hospital / Doctor → *Demo doctor* → the case is on top with an English summary → **Approve**. The patient's page shows the booking and, if they gave one, a **confirmation email** arrives. Reminders follow with **I'll come / Cancel**.
4. **Hospital admin:** *Demo admin* → **Team** (add a doctor), **Schedule** (Arrived / No-show), **Reports** (CSV without names, printable monthly report).
5. **Community:** **Area health** (`/desk/area` → draft → approve → `/alerts`), **Blood donors** (`/desk/blood`, `/donate`), **Medicine reminders** (`/patient/medicines`), **Family check-ins** (`/patient/family`, `/checkin`).
6. **First aid for everyone:** `/first-aid`: 8 guides with pictures, captions and voice for deaf, blind and non-reading users.
7. **Many hospitals:** hospitals apply at `/hospitals/join`; the owner approves them at `/owner`. Each hospital sees only its own data.

## 5. Responsible AI and safety

- **The AI never diagnoses or prescribes.** It only sorts, summarises and *holds* a slot.
- **A named doctor approves every booking.** Approving is the only way a slot becomes booked.
- **Rules first for danger signs**, in every supported language; Gemini can't overrule them. If Gemini fails, the rules keep working.
- **1122 always comes first** for life-threatening cases.
- **First aid checked by a doctor:** all 48 first-aid steps (St John Ambulance guidance) were reviewed and signed off by **Dr. Sheryar** on 9 Nov 2026 (`docs/first-aid-review-signed.md`). Every guide shows "✓ Checked by Dr. Sheryar".
- **Human approval for community alerts:** area health notices and blood requests go out only after staff approve them; a donor's number is shared only after they say yes.
- **Privacy:** each hospital sees only its own patients; patients see only their own requests. Passwords are hashed, logins expire after 7 days, rate limits stop abuse, reports carry no names or numbers, and anyone can **delete their account and data**.
- **Audit trail:** every AI suggestion and human decision is logged with who and when.
- **Free for patients:** asking for help is always free; any transport or visit fee is shown only *after* the service, and staff can waive it.

## 6. Architecture

```
Patient (app / voice / WhatsApp / Telegram)
        │
        ▼
Next.js app (installable)  ──►  FastAPI backend  ──►  Gemini 2.5 Flash (voice, summary, reply, prescriptions, alert drafts)
 /app /patient /login            │   + danger-sign rules (safer one wins)
 /desk /owner /first-aid         ▼
                          Postgres (Neon)  ──►  n8n: urgent alerts, ambulance trips, Gmail booking emails
                                 ▲
             GitHub Actions every 15 min: medicine, check-in and appointment reminders (web push + email)
```

**Stack (all free tiers, no card):** Next.js, FastAPI, Gemini 2.5 Flash, Neon Postgres, Vercel, n8n, GitHub Actions, web push.
**76 automated backend tests** (triage, safety rules, logins, hospitals kept apart, dispatch, reminders, emails, reports, password reset, data deletion).

## 7. Mystery Card feature

> **Card received:** _(fill in on Day 2 at 1:00 PM)_
>
> **How we implemented it:** _(what we built, where it is in the app, how to see it in the demo)_
>
> **Files changed:** _(links into this repo)_

## 8. Impact

- Patients who can't read or type can still get help, in their own language.
- Urgent cases reach a doctor in minutes; families get first-aid guidance while help is coming.
- Hospitals waste fewer slots (reminders, I'll come / Cancel, no-show tracking) and see their numbers.
- Communities get early outbreak notices, a local blood donor network, medicine reminders and daily check-ins for elders living alone.
- **Scale path:** one clinic pilot in Multan, then Basic Health Units and government hospitals across Punjab, linked to the Sehat Card.

## 9. Limits and next steps

- Responders and the hospital list are demo data for Multan.
- WhatsApp needs a verified business number; the app, website and Telegram bot work today.
- Triage has automated tests but no clinical validation yet; next is a clinic pilot with doctor feedback.
