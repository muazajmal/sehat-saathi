# Sehat Saathi — صحت ساتھی

**AI health helper for Pakistani communities and a front desk for hospitals.** Built for the TechSoc'26 AI Hackathon
(theme: *AI with Purpose — Building Better Societies*) by Muaz Ajmal, FAST-NUCES Multan.

- **Live:** https://sehat-saathi-eta.vercel.app/app · **Mystery Card (AI Summary Button):** https://sehat-saathi-eta.vercel.app/report
- **MVP document:** [`docs/MVP-Document.md`](docs/MVP-Document.md)

A patient speaks or types their problem in their own language (Urdu, Roman Urdu, Punjabi, Saraiki, Pashto, Sindhi,
English and more). Gemini summarises it for the doctor, marks it **urgent / see today / routine** (danger-sign rules
can only make it more urgent), holds a slot and replies in the patient's language. A named doctor approves every
booking. Emergencies get a one-tap Call 1122, a first-aid video guide and GPS-based hospital and responder matching.
Elders living alone get a one-button HELP app that alerts guardians if they don't answer within 1 minute.

## Mystery Card 5: AI Summary Button → Report Samjhao (`/report`)

| Card step | What the app does |
| --- | --- |
| 1. Pick long content | Paste a lab report, read a photo of one (Gemini), or load the example report |
| 2. Choose summary style | **One line**, **3 bullets** or **Detailed**, in **English** or **Urdu**, with **Listen** |
| 3. Generate summary | One press of **Summarize** → `POST /api/summarize` (Gemini 2.5 Flash) |
| 4. Keep original meaning | **Meaning guard:** each point is linked to its report lines (tap to highlight), every number is checked against the report, and a changed or invented number turns the guard red |

Then the patient can ask for an appointment with the suggested specialist in one tap. Without an AI key the summary
falls back to copying the flagged result lines word for word, so it never fails in a demo.

## Built for real hospitals

| For | What they get |
| --- | --- |
| **Hospital admin** (`/desk/settings`) | Own name, address, reception phone and Gmail, opening hours, 24-hour emergency flag and visit fee, with a live "what patients see" preview and a shareable patient link |
| **Doctors** | A week of bookable appointment times that renews automatically, so no calendar runs dry |
| **Sehat Saathi owner** (`/owner`) | Approves hospitals, and a demo-requests inbox (call, WhatsApp or email each clinic, then track it new → contacted → pilot → closed) |
| **Clinics on the website** | "Book a demo" asks for their Gmail and sends a bilingual confirmation email straight away |
| **Everyone** | Friendly error and loading screens with 1122 always one tap away, security headers, and a branded preview card when the link is shared |

---

Original channel: Urdu WhatsApp triage and booking for Pakistani clinics.

> **Sehat Saathi never diagnoses and never confirms a booking. A doctor does.**

A patient sends a symptom message in Urdu, Roman Urdu, English, Punjabi, Saraiki, Pashto, Sindhi, Balochi,
Arabic or Persian. Sehat Saathi summarises it in English for the doctor, marks it **urgent / see today / routine**,
holds the earliest fitting appointment slot and replies in the patient's own language.
The case then waits on the **clinic desk** until a named doctor or desk staff member approves, changes or
declines it. Danger signs (chest pain, breathing trouble, fainting, stroke signs, infant fever…) alert the
duty doctor for a call-back within minutes.

```
WhatsApp ──► n8n (voice note → Whisper STT) ──► FastAPI /api/intake ──► triage (Gemini + Urdu rules)
                                                     │                        │
                                                     ▼                        ▼
                                              Postgres / Supabase      slot HELD, Urdu reply sent
                                                     │
                         Next.js clinic desk ◄───────┘   doctor approves ──► slot BOOKED ──► WhatsApp confirmation
                                                                        └─ urgent? ──► n8n rings duty doctor
```

## Run it locally (2 terminals)

**Backend** (Python 3.11+)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # works as-is: SQLite + rules-only triage
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. Demo slots and four sample patients are seeded on first start.
Reset the demo any time with `python -m app.seed --reset`.

**Frontend** (Node 20+)

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

- http://localhost:3000 — landing page with a live WhatsApp-style demo
- http://localhost:3000/desk — the clinic desk (type your name in the bottom-left card before approving)
- http://localhost:3000/desk/schedule — each doctor's day: booked, held by AI, free

**Tests:** `cd backend && pytest -q`

## Turn on the real integrations

All optional. Everything runs without them; outbound messages are logged instead of sent.

| Variable | What it enables |
| --- | --- |
| `GEMINI_API_KEY` | Gemini triage (summary, specialty, Urdu reply). Rules still run and can only make it *more* urgent. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` | Real WhatsApp replies via Cloud API, and the inbound webhook at `/webhook/whatsapp`. |
| `N8N_ESCALATION_WEBHOOK` | Urgent cases POST here so n8n can call the duty doctor (Retell AI / Twilio). |
| `DATABASE_URL` | Supabase Postgres instead of SQLite (see `.env.example` for the format). |

**Getting to hospital:** for urgent cases the patient is told to call Rescue 1122 first (one-tap button). When a
patient shares their location (WhatsApp "Share location" or the website demo), the desk suggests the right Multan
government hospital (chest pain to the Institute of Cardiology, children to the Children's Hospital, burns to the
Burn Centre, otherwise the nearest general emergency) and the nearest free Sehat Saathi responder. A staff member
approves the dispatch; the patient gets the responder's name and arrival time in their language, and n8n
(`N8N_DISPATCH_WEBHOOK`) logs the trip with a ready message for the responder. Responders are a demo team for now.

**Public patient website** (`/patient`): anyone who is unwell writes their problem in any language, adds a phone
number and consents. They get a reply in their language at once, a one-tap Call 1122 for emergencies, and a private
status link (`/patient/status`) showing the doctor's decision and, if a responder was sent, how far away they are,
live. Responders get their own private link (`/responder`) to share GPS from their phone; the desk shows the
distance and arrival time to the patient and the hospital. Demo responders are simulated (labelled, sped up).

**Pay after service:** asking for help, triage and 1122 advice are always free. A transport fee is added only when a
trip reaches hospital (`TRANSPORT_BASE_PKR` + `TRANSPORT_PER_KM_PKR` per km for the patient-to-hospital leg, default
Rs 300 + Rs 40/km); staff add a visit fee (`VISIT_FEE_PKR`, default Rs 500) only after a visit is booked. Staff mark
fees paid (cash, JazzCash, Easypaisa, card, Sehat Card) or waive them; the patient sees the amount on their status page.

**Staff access code:** set `STAFF_KEY` on the API to lock the clinic desk and all patient data. Patient and
responder pages only ever see their own case through their private links. Leave `STAFF_KEY` empty only for demos
with sample data.

**Deploying (free, no card):** two Vercel projects from this repo.

- `sehat-saathi-api`: root directory `backend` (FastAPI, entry `index.py`). Add a free Neon Postgres from
  Vercel → Storage so `DATABASE_URL` is set; without it the API falls back to SQLite in `/tmp`, which resets often.
  Optional: `GEMINI_API_KEY`.
- `sehat-saathi`: root directory `frontend` (Next.js), with `NEXT_PUBLIC_API_URL` set to the API's URL.

Live: website https://sehat-saathi-eta.vercel.app, API https://sehat-saathi-api.vercel.app. CORS only allows this
project's own Vercel addresses (`CORS_ORIGIN_REGEX`). Urgent cases are also sent to an n8n webhook
(`N8N_ESCALATION_WEBHOOK`) that logs them to the "Sehat Saathi - Urgent Alerts" data table.

## Ready to sell to hospitals

| | What it does | Where |
| --- | --- | --- |
| **Multi-hospital** | Each hospital has its own desk, doctors, slots, patients, reports, alerts and blood requests; one hospital can never see another's. Hospitals apply at `/hospitals/join`; the owner approves or pauses them at `/owner` (the first visit sets up the owner account, then it's closed). Patients pick a hospital, or use its link `/patient?h=<slug>`. The original clinic is hospital #1, so existing data stays with it. | `/hospitals/join`, `/owner` |
| **Reports** | Requests per day, urgent share, median time to a doctor's decision, bookings, no-show rate, patient confirmations and cancellations, top complaints, channels, languages, busiest hours, per-doctor numbers, areas. CSV download without names or numbers, and a printable monthly report (PDF). | `/desk/reports` |
| **Fewer no-shows** | Day-before and 2-hours-before reminders (app, phone notification, Gmail). The patient taps "I'll come" or "Cancel" (cancelling frees the slot). Staff mark Arrived / No-show on the schedule; reports show the no-show rate. | `/desk/schedule`, patient status page |
| **Trust basics** | Privacy policy and terms, password reset by email (same answer whether or not a number exists), "Delete my account and data", limits on wrong passwords, sign-ups, requests and resets. | `/privacy`, `/terms`, `/forgot` |

New database columns are added on start-up by `app/tenancy.py` (safe to run any number of times; tested by upgrading
a Postgres database made by the previous version).

## Community features

| Feature | Who | Where |
| --- | --- | --- |
| **Area health alerts** | Desk spots an illness rising in a Multan neighbourhood (this week vs the 4 weeks before; watch at 4+ cases and 2×, alert at 8+ and 3×). AI (or a template) drafts an Urdu + English notice; a doctor edits and approves it before it goes on `/alerts` and to people in that area. | `/desk/area`, `/alerts` |
| **Blood donor network** | Local volunteers sign up with their blood group (`/donate`). The desk asks the nearest donors whose blood suits the patient and who haven't given in 3 months. A donor's number is shown only after they say yes. | `/desk/blood`, `/donate`, `/donate/answer` |
| **Medicine reminders** | Patient photographs their prescription; Gemini reads it (names and doses copied exactly, unclear parts flagged), the patient checks the list, then gets reminders and ticks doses. Never changes what the doctor wrote. | `/patient/medicines` |
| **Elder check-ins** | Family adds a parent who lives alone. Every day the elder taps "I'm okay" or "I need help" on a big-button page. No answer: the family is told. Help: the family is told and an urgent case appears on the desk. | `/patient/family`, `/checkin` |
| **Elder emergency button** | Family sets a 4-digit PIN, a medical card and up to 4 more guardians. The elder signs in once on their own phone (`/elder`) and gets one huge HELP button. Press: urgent desk case with the medical card and location, every guardian told at once, and the phone asks "Are you okay?" for 1 minute. No answer: every guardian is told "pressed the emergency button and did not respond, please check on them" (inbox, phone notification, Gmail) and the desk case is flagged. The 1-minute check runs from the elder's screen, guardians' screens, the desk and the 15-minute run (`/api/sos/check` is safe to call any time). Guardians without the app get a private live page (`/elder/watch`). | `/elder`, `/elder/watch`, `/patient/family` |

Notifications are free: an in-app inbox plus phone notifications from the installed app (web push; keys are
derived from `AUTH_SECRET`, or set `VAPID_PRIVATE_KEY`). Set `N8N_NOTIFY_WEBHOOK` to also send them through n8n
(WhatsApp/Telegram/SMS). `.github/workflows/reminders.yml` calls `/api/cron/tick` every 15 minutes for free;
set a `CRON_KEY` secret in both GitHub and Vercel to lock that endpoint.

## Logins: hospitals, doctors and patients

Open `/login`. It has two doors:

| Who | How they get an account | What they see |
| --- | --- | --- |
| **Hospital admin** | First admin comes from `ADMIN_PHONE` + `ADMIN_PASSWORD` (or the demo account) | The desk, plus **Team** (`/desk/team`): add doctors and admins, switch accounts off, reset passwords |
| **Doctor** | Added by the hospital admin; gets 6 days of appointment slots automatically | The desk. Every approve / decline / call-back is signed with **their own name** |
| **Patient** | Signs up free at `/login` with phone + password | **My requests** (`/patient/home`): every request sent from their number (website, WhatsApp, Telegram), with the doctor's decision. The request form fills in their name and number |

Phone + password only, so there is no SMS cost. Passwords are stored as PBKDF2 hashes; logins are signed 7-day
tokens (`AUTH_SECRET`). A patient token can never open the desk, and the staff door refuses patient accounts.
Getting help **never needs an account**: `/patient` and Call 1122 stay open to everyone.

Demo accounts (seeded with `SEED_DEMO=1`, sample data only; switch them off on the Team page for real use):
admin `0300 0000001` / `admin123`, doctor `0300 0000002` / `doctor123`, patient `0300 1112233` / `patient123`.
`OPEN_DESK=1` reopens the desk without a login (local demos only).

## Safety design (say this in the pitch)

1. **The AI can only hold a slot.** `approve` requires a staff name; it's the only path to `booked`.
2. **Two-layer triage, safer one wins.** Danger-sign rules in every supported language run on every message.
   If they say urgent, Gemini can't downgrade it.
3. **Fail-safe.** If Gemini errors or times out, triage falls back to the rules. The clinic never stops.
4. **Audit trail.** Every AI suggestion and every human decision is logged with who and when.

## API at a glance

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/intake` | New patient message from any channel (web demo, n8n, webhook) |
| POST | `/api/triage/preview` | Triage without saving, for testing |
| GET | `/api/cases?status=pending_review` | Queue, urgent first |
| POST | `/api/cases/{id}/approve` | Doctor books (optionally a different slot) |
| POST | `/api/cases/{id}/reject` | Doctor declines with a note |
| POST | `/api/cases/{id}/called` | Log the urgent call-back |
| GET/POST | `/api/slots` | Open slots / add a slot |
| GET | `/api/schedule?day=YYYY-MM-DD` | Every slot for a day, with the patient on held/booked ones |
| POST | `/api/summarize` | Report Samjhao: one line / 3 bullets / detailed, EN + UR, with meaning guard |
| POST | `/api/summarize/read-photo` | Photo of a report → text (Gemini) |
| POST | `/api/leads` | "Book a demo" form on the website |
| GET | `/api/stats`, `/api/audit` | Desk numbers and activity log |
| GET/POST | `/webhook/whatsapp` | WhatsApp Cloud API verify + inbound text |

## Project layout

```
backend/
  app/main.py        routes
  app/services.py    business rules (hold, approve, reject, call-back)
  app/triage.py      Gemini + Urdu rules, safety merge
  app/summary.py     Report Samjhao: AI summary + meaning guard (Mystery Card)
  app/notify.py      WhatsApp send + n8n escalation
  app/models.py      Patient, Slot, Case, AuditEvent
  app/seed.py        demo data
  tests/             pytest suite
frontend/
  app/page.tsx       marketing site (hero demo, product, features, pricing, FAQ, demo form)
  app/landing.css    marketing styles
  app/globals.css    design system + desk styles
  app/desk/          clinic desk and schedule
  app/report/        Report Samjhao (Mystery Card: AI summary button)
  components/        PhoneDemo, Desk, Schedule, AppShell, DeskPreview, DemoForm, SiteNav, Logo
  lib/api.ts         typed API client
n8n/README.md        how to wire voice notes and escalation calls
```
