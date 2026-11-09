# Sehat Saathi — صحت ساتھی
### MVP Document · TechSoc'26 AI Hackathon · Theme: *AI with Purpose — Building Better Societies*

| | |
| --- | --- |
| **Team** | Muaz Ajmal (+ teammates: add names) · FAST-NUCES Multan |
| **Focus area** | 03 Local Services & Coordination (Clinics), with 04 Mutual Support (local responders) |
| **Live MVP** | https://sehat-saathi-eta.vercel.app · login: https://sehat-saathi-eta.vercel.app/login |
| **Repository** | https://github.com/muazajmal/sehat-saathi |

---

## 1. The problem in our community

In Multan, a sick person who goes to a government hospital or clinic usually:

- waits in a long OPD line just to get a token, often after travelling for hours;
- can't fill an English form or explain symptoms to a busy receptionist, especially if they speak Saraiki, Punjabi or Pashto, or can't read;
- waits in the **same line** whether they have a rash or chest pain, because nobody sorts the urgent cases first;
- has no easy way to get to the right hospital in an emergency if 1122 is busy.

Doctors, meanwhile, have no early picture of who is coming and how sick they are.

## 2. Our solution

**Sehat Saathi is a free health helper for the local community.** A patient types or **speaks** their problem in
their own language on the website (or WhatsApp / Telegram). The AI writes a short English summary for the doctor,
marks it **Urgent / See today / Routine**, holds the earliest fitting appointment, and replies to the patient in
their own language. **A real doctor approves every booking.** Danger signs tell the patient to call 1122 at once
and alert the duty doctor.

**Three kinds of users, each with their own login:**

| User | What they do |
| --- | --- |
| **Patient (local person)** | Free account. Sends requests by text or voice, sees every request and the doctor's decision on "My requests". Can also get help **without** an account. |
| **Doctor** | Logs in to the clinic desk, sees patients sorted by urgency, approves / changes / declines. Every decision is signed with their own name. |
| **Hospital admin** | Adds and removes doctors (each gets appointment slots automatically), resets passwords, sees the whole desk. |

## 3. How AI is used (meaningfully, not decoratively)

| Step | AI | Why it matters |
| --- | --- | --- |
| Voice → text | **Gemini** transcribes voice notes in Urdu, Punjabi, Saraiki, Pashto, Sindhi, English | People who can't type or read can still ask for help |
| Understanding | **Gemini** detects the language, summarises the complaint in English for the doctor, picks the department | Doctor reads a 2-line summary instead of a long Roman-Urdu message |
| Triage | **Gemini + fixed danger-sign rules** in every language. The safer result always wins | The AI can never downgrade chest pain or breathing trouble |
| Reply | **Gemini** answers in the patient's own language and script | Patient understands what happens next |
| Routing | Location → nearest suitable **Multan government hospital** (cardiology, children's, burns, general) | Right hospital first time |
| Automation | **n8n** logs every urgent case and responder trip with a desk link | Duty doctor is alerted within minutes |

## 4. Working MVP — what you can try live

1. **Patient:** open `/patient`, tap *Speak instead*, say "mere abbu ke seene mein dard hai" → Urgent, Call 1122 button, reply in Urdu.
2. **Patient app:** `/login` → *Demo patient* → "My requests" shows the request and the doctor's decision.
3. **Doctor:** `/login` → Hospital / Doctor → *Demo doctor* → desk shows the case at the top, with the English summary → **Approve**. The patient's page updates to "Booked".
4. **Admin:** *Demo admin* → **Team** → add a new doctor → they can log in immediately and have slots.
5. **Getting to hospital:** share location → desk suggests the right hospital and the nearest local responder → staff approves → patient sees the responder's distance and arrival time live.

## 5. Responsible AI and safety

- **The AI never diagnoses or prescribes.** It only sorts, summarises and *holds* a slot.
- **A named doctor approves every booking.** Approving is the only way a slot becomes booked.
- **Rules first for danger signs**, in every supported language; Gemini can't overrule them. If Gemini fails, the rules keep working.
- **1122 always comes first** for life-threatening cases.
- **Privacy:** patient details only on the staff desk behind a login; patients see only their own requests through their account or a private link. Passwords are hashed.
- **Audit trail:** every AI suggestion and human decision is logged with who and when.
- **Free for patients:** asking for help is always free; any transport or visit fee is shown only *after* the service, and staff can waive it.

## 6. Architecture

```
Patient (web / voice / WhatsApp / Telegram)
        │
        ▼
Next.js website  ──►  FastAPI backend  ──►  Gemini (voice, summary, reply)
 /patient /login        │   + danger-sign rules (safer one wins)
 /patient/home          ▼
 /desk /desk/team    Postgres (Neon, free)  ──►  n8n: urgent alerts, responder dispatch
```

**Stack (all free tiers, no card):** Next.js, FastAPI, Gemini 2.5 Flash, Neon Postgres, Vercel, n8n.
60 automated backend tests (triage, safety rules, logins, dispatch, billing).

## 7. Mystery Card feature

> **Card received:** _(fill in on Day 2 at 1:00 PM)_
>
> **How we implemented it:** _(what we built, where it is in the app, how to see it in the demo)_
>
> **Files changed:** _(links into this repo)_

## 8. Impact

- Patients who can't read or type can still get help, in their own language.
- Urgent cases reach a doctor in minutes instead of waiting in the OPD line.
- Doctors start each patient with a clear summary; hospitals see tomorrow's load today.
- **Scale path:** Basic Health Units and government hospitals across Punjab, connected to the Sehat Card, with local volunteers as responders.

## 9. Limits and next steps

- Responders and some hospital data are demo data for Multan.
- WhatsApp needs a verified business number; the Telegram bot is ready as a free alternative.
- Next: SMS-free phone verification, doctor-side Urdu voice summaries, and a pilot with one local clinic.
