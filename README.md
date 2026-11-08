# Sehat Saathi — صحت ساتھی

Urdu WhatsApp triage and booking for Pakistani clinics.

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

**Deploying (free, no card):** two Vercel projects from this repo.

- `sehat-saathi-api`: root directory `backend` (FastAPI, entry `index.py`). Add a free Neon Postgres from
  Vercel → Storage so `DATABASE_URL` is set; without it the API falls back to SQLite in `/tmp`, which resets often.
  Optional: `GEMINI_API_KEY`.
- `sehat-saathi`: root directory `frontend` (Next.js), with `NEXT_PUBLIC_API_URL` set to the API's URL.

Live: website https://sehat-saathi-eta.vercel.app, API https://sehat-saathi-api.vercel.app. CORS only allows this
project's own Vercel addresses (`CORS_ORIGIN_REGEX`). Urgent cases are also sent to an n8n webhook
(`N8N_ESCALATION_WEBHOOK`) that logs them to the "Sehat Saathi - Urgent Alerts" data table.

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
| POST | `/api/leads` | "Book a demo" form on the website |
| GET | `/api/stats`, `/api/audit` | Desk numbers and activity log |
| GET/POST | `/webhook/whatsapp` | WhatsApp Cloud API verify + inbound text |

## Project layout

```
backend/
  app/main.py        routes
  app/services.py    business rules (hold, approve, reject, call-back)
  app/triage.py      Gemini + Urdu rules, safety merge
  app/notify.py      WhatsApp send + n8n escalation
  app/models.py      Patient, Slot, Case, AuditEvent
  app/seed.py        demo data
  tests/             pytest suite
frontend/
  app/page.tsx       marketing site (hero demo, product, features, pricing, FAQ, demo form)
  app/landing.css    marketing styles
  app/globals.css    design system + desk styles
  app/desk/          clinic desk and schedule
  components/        PhoneDemo, Desk, Schedule, AppShell, DeskPreview, DemoForm, SiteNav, Logo
  lib/api.ts         typed API client
n8n/README.md        how to wire voice notes and escalation calls
```
