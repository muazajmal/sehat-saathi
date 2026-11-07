import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

_sqlite = settings.database_url.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _sqlite else {}
# Serverless (Vercel): don't keep connections open between requests.
_pool = {"poolclass": NullPool} if os.getenv("VERCEL") and not _sqlite else {"pool_pre_ping": True}
engine = create_engine(settings.database_url, connect_args=_connect_args, **_pool)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
