"""App settings, read from environment variables (or a .env file)."""
import os
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv()


def _database_url() -> str:
    """DATABASE_URL, normalised for SQLAlchemy + psycopg 3.

    Vercel's Neon integration hands out postgres:// URLs; SQLAlchemy needs
    postgresql+psycopg://. On Vercel without a database, fall back to SQLite
    in /tmp (the only writable folder there) so the app still starts.
    """
    url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or ""
    if not url:
        return "sqlite:////tmp/sehat.db" if os.getenv("VERCEL") else "sqlite:///./sehat.db"
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


class Settings:
    database_url: str = _database_url()
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    whatsapp_token: str = os.getenv("WHATSAPP_TOKEN", "")
    whatsapp_phone_id: str = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
    whatsapp_verify_token: str = os.getenv("WHATSAPP_VERIFY_TOKEN", "sehat-saathi-verify")
    n8n_escalation_webhook: str = os.getenv("N8N_ESCALATION_WEBHOOK", "")
    clinic_name: str = os.getenv("CLINIC_NAME", "Shifa Family Clinic")
    cors_origins: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    # Only this project's own Vercel sites may call the API: the production address and its
    # preview deploys. (Plain sehat-saathi.vercel.app belongs to someone else, so it is not allowed.)
    cors_origin_regex: str = os.getenv(
        "CORS_ORIGIN_REGEX",
        r"https://sehat-saathi-(eta|[a-z0-9]+-muazajmal112-9797s-projects)\.vercel\.app",
    )
    tz = ZoneInfo(os.getenv("CLINIC_TZ", "Asia/Karachi"))


settings = Settings()
