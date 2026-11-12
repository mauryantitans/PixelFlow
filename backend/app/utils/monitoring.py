"""
Optional error tracking with Sentry.

Off unless SENTRY_DSN is set. Server errors are reported automatically by the
FastAPI integration; browser errors arrive through POST /api/client-errors and
are forwarded with ``report_client_error``. No personal data is sent
(send_default_pii=False): no cookies, request bodies or user emails.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)
_enabled = False


def init_monitoring() -> bool:
    global _enabled
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover - dependency is pinned in requirements.txt
        logger.warning("SENTRY_DSN is set but sentry-sdk isn't installed; error tracking is off")
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0") or 0),
        send_default_pii=False,
    )
    _enabled = True
    logger.info("Sentry error tracking enabled")
    return True


def report_client_error(message: str, extra: dict) -> None:
    if not _enabled:
        return
    import sentry_sdk

    with sentry_sdk.new_scope() as scope:
        scope.set_tag("source", "browser")
        for k, v in extra.items():
            scope.set_extra(k, v)
        sentry_sdk.capture_message(f"[browser] {message}", level="error")
