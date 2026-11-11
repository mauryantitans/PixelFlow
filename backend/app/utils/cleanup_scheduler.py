"""
Background database cleanup.

Runs CleanupService.run_full_cleanup() on a fixed interval: expired sessions
(and their images), uploads / processed images past their retention period,
orphaned images and expired refresh tokens. All periods come from the
admin-editable SystemSettings row, and nothing runs while the admin setting
"enable_auto_cleanup" is off.

This replaces the old session_manager.periodic_cleanup task, which only
looked at an in-memory dict that nothing populated and deleted folders from
the long-removed filesystem storage, so the database was never cleaned.
"""

import asyncio
import logging
import os

from app.core.database import SessionLocal
from app.utils.cleanup_service import CleanupService

logger = logging.getLogger(__name__)

# How often to run (seconds) and how long to wait after startup before the
# first run (so a cold start isn't slowed down). Overridable for tests/ops.
CLEANUP_INTERVAL_SECONDS = int(os.environ.get("DB_CLEANUP_INTERVAL_SECONDS", str(15 * 60)))
CLEANUP_INITIAL_DELAY_SECONDS = int(os.environ.get("DB_CLEANUP_INITIAL_DELAY_SECONDS", "120"))

_task: asyncio.Task | None = None


def run_cleanup_once() -> dict:
    """Run one full cleanup pass in its own DB session (blocking)."""
    db = SessionLocal()
    try:
        return CleanupService.run_full_cleanup(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _loop() -> None:
    await asyncio.sleep(CLEANUP_INITIAL_DELAY_SECONDS)
    while True:
        try:
            # SQLAlchemy is synchronous; keep it off the event loop.
            result = await asyncio.to_thread(run_cleanup_once)
            if result.get("enabled") is False:
                logger.debug("Automatic cleanup is disabled in admin settings")
            elif result.get("total_deleted"):
                logger.info(f"Automatic cleanup removed {result['total_deleted']} item(s)")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Automatic cleanup failed; will retry next interval")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)


def start_cleanup_scheduler() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
        logger.info(
            f"Database cleanup scheduled every {CLEANUP_INTERVAL_SECONDS}s "
            f"(first run in {CLEANUP_INITIAL_DELAY_SECONDS}s)"
        )


async def stop_cleanup_scheduler() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None
