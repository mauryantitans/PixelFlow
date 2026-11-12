import os
import time

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings
import logging

logger = logging.getLogger(__name__)

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # Log SQL statements in debug mode
    pool_pre_ping=True,   # Verify connections before using
    pool_size=5,
    max_overflow=10
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

def get_db():
    """
    Dependency for FastAPI to get database sessions
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _safe_db_target(url: str) -> str:
    """The database URL with the password masked, safe to put in logs."""
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<unparseable DATABASE_URL>"


def _connection_hint(error: Exception) -> str:
    msg = str(error).lower()
    if "could not translate host name" in msg or "name or service not known" in msg:
        return (
            "The database host name does not resolve. On Render this usually means the "
            "Postgres instance was deleted or has expired (free databases expire), or the "
            "web service is in a different region than the database. Create/attach a "
            "database and update DATABASE_URL (use the Internal URL only when both are in "
            "the same region)."
        )
    if "password authentication failed" in msg:
        return "The database rejected the credentials in DATABASE_URL."
    if "connection refused" in msg or "timeout" in msg:
        return "The database is not accepting connections yet (starting, suspended or wrong port)."
    return "Check that DATABASE_URL points at a running database."


def run_migrations(bind=None) -> None:
    """Bring the schema to the latest Alembic revision (idempotent).

    Runs on every startup, so Render (whose start command doesn't run Alembic)
    and Docker behave the same. The baseline adopts databases that were created
    by create_all() before migrations existed.
    """
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.attributes["skip_logging_config"] = True
    with (bind or engine).begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")


def init_db(retries: int | None = None, base_delay: float | None = None):
    """
    Initialize database tables.

    Transient connection errors (database still starting, DNS not yet
    propagated after creating a database) are retried with exponential
    backoff. If the database is still unreachable, a clear error that names the
    host (password masked) and a likely cause is logged before re-raising, so
    the deploy log explains why startup failed.
    """
    retries = int(os.environ.get("DB_CONNECT_RETRIES", "5")) if retries is None else retries
    base_delay = float(os.environ.get("DB_CONNECT_BASE_DELAY", "1")) if base_delay is None else base_delay
    target = _safe_db_target(settings.DATABASE_URL)

    for attempt in range(1, retries + 1):
        try:
            logger.info("Applying database migrations...")
            run_migrations()
            logger.info("Database schema is up to date.")
            return
        except OperationalError as e:
            if attempt < retries:
                delay = base_delay * (2 ** (attempt - 1))
                logger.warning(
                    f"Database not reachable at {target} (attempt {attempt}/{retries}); "
                    f"retrying in {delay:.0f}s: {e.orig if hasattr(e, 'orig') else e}"
                )
                time.sleep(delay)
                continue
            logger.error(
                f"Could not connect to the database at {target} after {retries} attempts. "
                f"{_connection_hint(e)} Original error: {e.orig if hasattr(e, 'orig') else e}"
            )
            raise
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
            raise
