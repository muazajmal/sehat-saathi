"""One place to ask Gemini for JSON. Returns None when there is no key or anything goes wrong,
so every feature has a non-AI fallback."""
import json
import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)


def gemini_json(prompt: str, extra_parts: list | None = None, timeout: float = 20.0, temperature: float = 0.2) -> dict | list | None:
    if not settings.gemini_api_key:
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    body = {
        "contents": [{"parts": [{"text": prompt}, *(extra_parts or [])]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": temperature},
    }
    try:
        r = httpx.post(url, params={"key": settings.gemini_api_key}, json=body, timeout=timeout)
        r.raise_for_status()
        return json.loads(r.json()["candidates"][0]["content"]["parts"][0]["text"])
    except Exception as exc:
        log.warning("Gemini request failed: %s", exc)
        return None
