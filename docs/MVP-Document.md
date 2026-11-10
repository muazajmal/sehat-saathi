# Sehat Saathi — صحت ساتھی
### MVP Document · TechSoc'26 AI Hackathon · Theme: *AI with Purpose — Building Better Societies*

| | |
| --- | --- |
| **Team** | Muaz Ajmal (solo) · FAST-NUCES Multan |
| **Focus area** | 03 Local Services & Coordination (Clinics), with 04 Mutual Support (responders, blood donors, family check-ins) |
| **Live MVP** | https://sehat-saathi-eta.vercel.app/app · staff login: https://sehat-saathi-eta.vercel.app/login · elder app: https://sehat-saathi-eta.vercel.app/elder · **Mystery Card: https://sehat-saathi-eta.vercel.app/report** |
| **Type** | Web app: opens in any browser on a phone or laptop, installs on the home screen like an app. One platform for many hospitals. |
| **Demo video** | `sehat-saathi-demo.mp4` (3 min 49 s): every portal, location + Google Maps, booking + Gmail, elder emergency button, Mystery Card |
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
captions and voice) while help is on the way. With one tap the patient **shares their GPS location**: the desk sees the pin,
the right hospital and the nearest responder, and the pin and directions open in **Google Maps**. Older people living alone
get their own **elder app** with one big **HELP** button. **A named doctor approves every booking.**

### Portals: one web app, a portal for everyone

| Portal | Where | Sign-in |
| --- | --- | --- |
| Opening screen with a portal chooser | `/app` | none |
| Patient portal | `/patient`, `/patient/home`, `/patient/medicines` | phone number + password (Gmail optional, for confirmations); asking for help needs no account |
| Family & guardians | `/patient/family` | patient account |
| Elder app | `/elder` | phone number + 4-digit PIN set by the family; the phone remembers it |
| Guardian live page | `/elder/watch` | private link sent by Gmail, no login |
| Hospital desk (doctor + admin) | `/desk`, `/desk/schedule`, `/desk/ambulances`, `/desk/reports`, `/desk/area`, `/desk/blood`, `/desk/team` | phone number + password, per hospital |
| Ambulance driver | `/ambulance/join`, `/ambulance/me`, `/responder` | private link |
| Blood donor | `/donate` | phone number |
| Platform owner | `/owner` | owner login |

| User | What they do |
| --- | --- |
| **Patient** | Asks for help by voice or text, no account needed. Free account to see every request, the doctor's decision, reminders and messages. |
| **Family** | Sets up a parent living alone: PIN, medical card and up to 4 more guardians. Daily "I'm okay" check-in; told at once if the parent presses HELP or doesn't answer. |
| **Elder** | Signs in once with phone number + PIN and gets one big HELP button, read aloud in Urdu. |
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
| Location | Patient's GPS → right Multan government hospital (cardiology, children's, burns, general) + nearest free responder; pin and directions open in **Google Maps** | Right hospital first time; the driver navigates straight there |
| Report Samjhao (Mystery Card, `/report`) | **AI summary** of a long lab report in 3 styles and 2 languages, with every point linked to its report lines and every number checked against the report | Patients understand their report; a changed number is caught before it reaches them |
| Automation | **n8n**: urgent-case alerts, ambulance trips, booking confirmations and feedback forms through **Gmail** | Duty doctor alerted in minutes; patient gets a confirmation and, after the visit, a feedback form |

## 4. Working MVP — what you can try live

1. **Ask for help:** `/app` → *I need help now* → speak or type "mere abbu ke seene mein dard hai" → **Urgent**, Call 1122, first-aid guide opens, reply in Urdu.
2. **Location services:** tap **Share my location** → the desk shows the pin (opens in Google Maps), suggests the right hospital (chest pain → Institute of Cardiology) and the nearest responder → **Send responder**. The patient watches a **live trip map**; the driver's page has **Navigate** buttons that open Google Maps directions.
3. **Account + booking:** create an account with **name, phone number, password and Gmail**, log in with **phone + password**, send a routine request → the AI holds the earliest slot → the doctor taps **Approve booking** → the patient sees **Appointment confirmed** and a **confirmation email arrives in Gmail**. Reminders follow with **I'll come / Cancel**.
4. **Doctor:** `/login` → Hospital / Doctor → *Demo doctor* → urgent cases are on top with an English summary → approve, change or decline.
5. **Hospital admin:** *Demo admin* → **Team** (add a doctor), **Schedule** (Arrived / No-show), **Reports** (CSV without names, printable monthly report).
6. **Community:** **Area health** (`/desk/area` → draft → approve → `/alerts`), **Blood donors** (`/desk/blood`, `/donate`), **Medicine reminders** (`/patient/medicines`), **Family check-ins** (`/patient/family`, `/checkin`).
7. **First aid for everyone:** `/first-aid`: 8 guides with pictures, captions and voice for deaf, blind and non-reading users.
8. **Many hospitals:** hospitals apply at `/hospitals/join`; the owner approves them at `/owner`. Each hospital gets its own desk, doctors, staff and patient link (`/patient?h=<hospital>`), and sees only its own data. Patients pick their hospital on the request form.
9. **Elder emergency button (new):**
   - Family: `/patient/family` → add a parent → **Set up emergency button** → 4-digit PIN, medical card (age, conditions, medicines, allergies, blood group), up to 4 more guardians (phone and/or Gmail).
   - Elder: `/elder` → phone number + PIN on a big keypad → one big **HELP** button.
   - Press HELP: an **urgent case** with the medical card and **GPS location** goes to the hospital desk, and **every guardian** is told at once (in-app, phone notification, Gmail).
   - The phone asks **"Are you okay?"** for **1 minute**, with a countdown, voice and vibration, and keeps the screen on.
   - **No answer in 1 minute:** every guardian gets "pressed the emergency button and did not respond, please check on them now", with a Google Maps link, and the desk case is flagged. Guardians without the app get a private live page.
   - The elder can still answer later (**I'm okay** or **I need an ambulance**), and a guardian can mark **I'm with them**; everyone is told.
10. **Feedback after the visit:** the doctor marks the visit done → n8n sends a **Gmail** with a *Give feedback* button → 4 questions (rating, was the summary clear, would you recommend, comments) → answers saved in n8n and shown on the Clinic Desk.

## 5. Responsible AI and safety

- **The AI never diagnoses or prescribes.** It only sorts, summarises and *holds* a slot.
- **A named doctor approves every booking.** Approving is the only way a slot becomes booked.
- **Rules first for danger signs**, in every supported language; Gemini can't overrule them. If Gemini fails, the rules keep working.
- **1122 always comes first** for life-threatening cases.
- **First aid checked by a doctor:** all 48 first-aid steps (St John Ambulance guidance) were reviewed and signed off by **Dr. Sheryar** on 9 Nov 2026 (`docs/first-aid-review-signed.md`). Every guide shows "✓ Checked by Dr. Sheryar".
- **Human approval for community alerts:** area health notices and blood requests go out only after staff approve them; a donor's number is shared only after they say yes.
- **Privacy:** each hospital sees only its own patients; patients see only their own requests. Passwords are hashed, logins expire after 7 days, rate limits stop abuse, reports carry no names or numbers, and anyone can **delete their account and data**.
- **Elder button safety:** pressing HELP never waits for anything: the alarm is sent first, location is added after. The 1-minute check runs on the elder's phone, on every guardian's screen, on the hospital desk and every 15 minutes on the server, so it still happens if the elder's phone goes quiet. Each alert is sent only once. The elder's PIN is hashed and wrong PINs are rate-limited.
- **Audit trail:** every AI suggestion and human decision is logged with who and when.
- **Free for patients:** asking for help is always free; any transport or visit fee is shown only *after* the service, and staff can waive it.

## 6. Architecture

```
Patient (app / voice / WhatsApp / Telegram)
        │
        ▼
Next.js web app (installable) ──► FastAPI backend ──► Gemini 2.5 Flash (voice, summary, reply, prescriptions, alert drafts)
 /app /patient /login /elder     │   + danger-sign rules (safer one wins)
 /desk /owner /first-aid         │   elder SOS: 1-minute no-response rule ──► guardians (in-app, push, Gmail)
 /ambulance /donate              ▼   GPS ──► hospital + responder ──► Google Maps links
                          Postgres (Neon)  ──►  n8n: urgent alerts, ambulance trips, Gmail booking emails
                                 ▲
             GitHub Actions every 15 min: medicine, check-in and appointment reminders (web push + email)
```

**Stack (all free tiers, no card):** Next.js, FastAPI, Gemini 2.5 Flash, Neon Postgres, Vercel, n8n, GitHub Actions, web push.
**85 automated backend tests** (triage, safety rules, logins, hospitals kept apart, dispatch, reminders, emails, reports, password reset, data deletion, elder PIN sign-in, the 1-minute no-response alert, guardian alerts, Report Samjhao summary and meaning guard). The elder-button database upgrade was tested on Postgres against a copy of the live schema before going live.

## 7. Mystery Card feature

**Card received:** *AI Summary Button.* 1) Pick long content, 2) choose summary style, 3) generate summary, 4) keep original meaning.

**What we built: Report Samjhao**, an AI summary button for long medical reports, plugged into Sehat Saathi's booking.

| Card step | How Report Samjhao does it |
| --- | --- |
| 1. Pick long content | Paste a lab report, upload a photo of one (AI reads it into text), or use the example report |
| 2. Choose summary style | **One line**, **3 bullets** or **Detailed**, in **English** or **Urdu**, plus a **Listen** button |
| 3. Generate summary | One press of **Summarize** |
| 4. Keep original meaning | **Meaning guard**: every point is linked to its exact report lines (tap a point and they light up), every number in the summary is checked against the report, units and ranges are kept as written, and no new medical claims are added. In the demo we change HbA1c from 9.2 to 8.1 in the report and the guard turns red: *"Meaning changed: 9.2 not found"* |

**Then:** the AI suggests the right specialist (e.g. endocrinologist), the patient books a slot with their Gmail, the
doctor approves it on the Clinic Desk, and after the visit a **feedback form** is emailed through **n8n + Gmail**
(workflow *"Sehat Saathi - Feedback by Email"*). Answers are saved in an n8n data table and shown on the Clinic Desk
(average rating, % who found the summary clear, % who would recommend).

**Where it lives:** inside the Sehat Saathi website at **`/report`** (linked from the opening screen and the
patient's home page). The page calls the backend's **`POST /api/summarize`** (Gemini 2.5 Flash), which returns all
three styles in English and Urdu with source lines for every point; **`POST /api/summarize/read-photo`** turns a
photo of a report into text. The meaning guard runs on the report *as it is now*, so editing a number after
summarising turns the guard red. If the AI is off, a rules-only summary copies the flagged lines word for word, so
the button never fails. Tested in `backend/tests/test_summary.py`.

**Files:** `backend/app/summary.py`, `frontend/components/ReportSamjhao.tsx`, `frontend/app/report/page.tsx`;
the earlier standalone page `docs/mystery-card/report-samjhao.html` and `n8n/README.md` (feedback workflow).

## 8. Impact

- Patients who can't read or type can still get help, in their own language.
- Urgent cases reach a doctor in minutes; families get first-aid guidance while help is coming.
- Hospitals waste fewer slots (reminders, I'll come / Cancel, no-show tracking) and see their numbers.
- Communities get early outbreak notices, a local blood donor network, medicine reminders and daily check-ins for elders living alone.
- An older person who lives alone is never more than one tap and one minute away from their family knowing something is wrong.
- Patients can finally understand their own lab reports, in Urdu, without any number being changed.
- **Scale path:** one clinic pilot in Multan, then Basic Health Units and government hospitals across Punjab, linked to the Sehat Card.

## 9. Limits and next steps

- Responders and the hospital list are demo data for Multan.
- WhatsApp needs a verified business number; the app, website and Telegram bot work today.
- Triage has automated tests but no clinical validation yet; next is a clinic pilot with doctor feedback.
- The elder app's "while you wait" lines are Dr. Sheryar's reviewed heart steps reworded for the patient; he will re-check the wording.
- **We keep improving Sehat Saathi step by step** with feedback from doctors and patients. Next: sign language for deaf patients, WhatsApp once the business number is verified, Report Samjhao for discharge slips and prescriptions, more languages and more hospitals.
