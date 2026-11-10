# Wiring n8n

The FastAPI backend handles WhatsApp **text** messages on its own. n8n adds the two things judges
remember: Urdu **voice notes** and a **phone call** to the duty doctor for urgent cases.

## Workflow 1 — Voice note intake

1. **Webhook** node (POST) — point the WhatsApp Cloud API webhook here instead of the backend,
   or forward only `type: "audio"` messages to it.
2. **IF** `{{$json.entry[0].changes[0].value.messages[0].type}}` equals `audio`.
3. **HTTP Request** GET `https://graph.facebook.com/v21.0/{{ media id }}` with the WhatsApp token
   → returns a media URL.
4. **HTTP Request** GET that URL (response: file) with the same token.
5. **HTTP Request** POST to Groq `https://api.groq.com/openai/v1/audio/transcriptions`
   (multipart: `file`, `model=whisper-large-v3`, `language=ur`).
6. **HTTP Request** POST `https://YOUR-BACKEND/api/intake`
   ```json
   { "phone": "+{{from}}", "name": "{{profile name}}", "message": "{{ $json.text }}", "channel": "n8n" }
   ```
   The backend triages, holds a slot and sends the Urdu reply.

For text-only messages, keep the WhatsApp webhook pointed at `https://YOUR-BACKEND/webhook/whatsapp`.

## Workflow 2 — Urgent escalation call

1. **Webhook** node (POST). Copy its production URL into the backend's `N8N_ESCALATION_WEBHOOK`.
   The body contains `id, phone, name, urgency, summary, red_flags, message`.
2. **Retell AI** (or Twilio) — call the duty doctor's number and read out:
   "Urgent patient {{name}}, {{summary}}. Number {{phone}}. Please call back now."
3. Optional **WhatsApp** message to the duty doctor with a link to
   `https://YOUR-FRONTEND/desk?case={{id}}`.

The doctor still logs the call-back on the desk, so the audit trail shows a human closed the loop.

## Workflow — Feedback by Email (Mystery Card)

*"Sehat Saathi - Feedback by Email"* on the n8n cloud instance (active):

1. **Webhook** `POST /webhook/sehat-saathi-feedback-mail-5c2e91` with `{email, name, booking_ref, doctor, slot}`,
   sent when the doctor marks the visit done on the Report Samjhao Clinic Desk.
2. **Code** builds the email from a fixed template (so the webhook can only send this invite) with a
   *Give feedback* button linking to the form, pre-filled with the booking reference and name.
3. **Gmail** sends it ("How was your visit? Sehat Saathi feedback (SS-…)").
4. **Form trigger** `/form/sehat-saathi-feedback`: rating 1–5, "Was the AI report summary easy to understand?",
   "Would you recommend Sehat Saathi to family?", comments (Urdu or English).
5. **Data table** *Sehat Saathi - Patient Feedback* saves each answer; the Clinic Desk reads it live
   (average rating, % summary clear, % would recommend).

Booking confirmations from the main app use a separate Gmail workflow (`N8N_EMAIL_WEBHOOK`, see `backend/app/emails.py`).
