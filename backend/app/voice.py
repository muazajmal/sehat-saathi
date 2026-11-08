"""Speech to text for the patient website, using the same Gemini key as triage."""
import base64
import binascii
import json
import logging

import httpx
from fastapi import HTTPException

from .config import settings

log = logging.getLogger("sehat.voice")

PROMPT = (
    "You are transcribing a recording a patient in Pakistan made for a clinic. First decide honestly whether "
    "the recording contains clear human speech. Tones, beeps, music, hum, silence or background noise are NOT "
    "speech. Never guess or invent words: if you are not sure what was said, treat it as no speech. "
    "If there is speech, write exactly what was said, word for word, nothing added, in the script people "
    "normally write that language in: Urdu, Punjabi and Saraiki in Urdu (Shahmukhi) script, Pashto and Sindhi "
    "in their own scripts, English in English. Keep English words mixed into Urdu as they were said. "
    'Return JSON only: {"speech": true or false, "text": "the words, or empty when there is no speech"}'
)


def transcribe(audio_b64: str, mime: str, ui_lang: str) -> str:
    if not settings.gemini_api_key:
        raise HTTPException(503, "Voice isn't switched on here. Please type instead.")
    try:
        raw = base64.b64decode(audio_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "That recording didn't come through. Please try again.")
    if not raw.startswith(b"RIFF"):
        raise HTTPException(422, "That recording didn't come through. Please try again.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    hint = " The website is set to Urdu." if ui_lang == "ur" else " The website is set to English."
    body = {
        "contents": [{"parts": [{"text": PROMPT + hint}, {"inline_data": {"mime_type": mime, "data": audio_b64}}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json",
                             "thinkingConfig": {"thinkingBudget": 0}},
    }
    try:
        r = httpx.post(url, params={"key": settings.gemini_api_key}, json=body, timeout=25)
    except httpx.HTTPError as exc:
        log.warning("Transcription request failed: %s", type(exc).__name__)
        raise HTTPException(502, "Couldn't reach the voice service. Please type instead, or try again.")
    if r.status_code != 200:
        # Log Gemini's own message, never the URL (it carries the key).
        try:
            reason = r.json().get("error", {}).get("message", "")[:300]
        except ValueError:
            reason = r.text[:300]
        log.warning("Transcription failed: Gemini %s %s", r.status_code, reason)
        raise HTTPException(502, f"Couldn't understand the recording right now (code {r.status_code}). "
                                 "Please type instead, or try again.")
    data = r.json()
    candidates = data.get("candidates") or []
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    raw = "".join(p.get("text", "") for p in parts).strip()
    try:
        out = json.loads(raw)
    except ValueError:
        log.warning("Transcription returned non-JSON; ignoring it")
        return ""
    if not isinstance(out, dict) or out.get("speech") is not True:
        return ""  # no clear speech: never pass on guessed words
    return str(out.get("text") or "").strip()[:2000]  # empty when no speech was heard: the page says "we couldn't hear any words"
