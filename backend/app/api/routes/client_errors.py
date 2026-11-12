"""
POST /api/client-errors: the browser reports uncaught errors here.

They're logged (visible in the host's logs, e.g. Render) and forwarded to
Sentry when SENTRY_DSN is set. Fields are length-capped and nothing personal is
recorded. CSRF-exempt like the other session-less endpoints: it can only add a
log line. Each client IP is limited to a handful of reports a minute.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from ...middleware.rate_limit import client_ip_for
from ...utils.monitoring import report_client_error

router = APIRouter()
logger = logging.getLogger("pixelflow.client")

MAX_PER_MINUTE = 10
_recent: dict[str, deque] = {}
_lock = threading.Lock()


class ClientError(BaseModel):
    kind: str = Field("error", max_length=32)
    message: str = Field(..., max_length=2000)
    stack: str | None = Field(None, max_length=8000)
    path: str | None = Field(None, max_length=300)
    user_agent: str | None = Field(None, max_length=300)


def _allowed(ip: str) -> bool:
    now = time.monotonic()
    with _lock:
        q = _recent.setdefault(ip, deque())
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= MAX_PER_MINUTE:
            return False
        q.append(now)
        return True


@router.post("/client-errors", status_code=204)
async def client_error(report: ClientError, request: Request) -> Response:
    if _allowed(client_ip_for(request)):
        logger.warning(
            "Browser %s on %s: %s%s",
            report.kind,
            report.path or "?",
            report.message[:500],
            f"\n{report.stack[:2000]}" if report.stack else "",
        )
        report_client_error(
            report.message[:500],
            {
                "kind": report.kind,
                "path": report.path,
                "stack": (report.stack or "")[:4000],
                "user_agent": report.user_agent,
            },
        )
    return Response(status_code=204)
