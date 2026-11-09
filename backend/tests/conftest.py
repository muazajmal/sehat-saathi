"""Runs before any test module is imported, so app settings always see a fresh temporary database."""
import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["GEMINI_API_KEY"] = ""  # rules-only, no network in tests
os.environ["SEED_DEMO"] = "1"
os.environ["OPEN_DESK"] = "1"  # older tests use the desk without logging in; test_auth.py turns this off
