"""
Server-side enforcement of the admin PIN.

Before, the PIN only toggled a flag in the browser: every /api/admin/database/*
endpoint checked "is admin" but never the PIN, so any admin session (or a
stolen admin cookie) could read all users' data directly.

Now a correct PIN earns a short-lived, signed, httpOnly cookie scoped to
/api/admin, and the user-data endpoints depend on `require_admin_pin`.
Wrong PINs are rate limited per admin (a 4-6 digit PIN is otherwise easy to
brute force).
"""

from __future__ import annotations

import secrets
import threading
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response
from jose import JWTError, jwt

from ..core.config import settings
from ..models.db_models import User
from .auth import get_current_active_admin

ADMIN_PIN_COOKIE = "pf_admin_pin"
ADMIN_PIN_COOKIE_PATH = "/api/admin"
ADMIN_PIN_TTL = timedelta(minutes=15)
_PURPOSE = "admin_pin"

MAX_PIN_FAILURES = 5
PIN_LOCKOUT = timedelta(minutes=15)

_failures: dict[int, list[datetime]] = {}
_lock = threading.Lock()


def _cookie_options() -> dict:
    samesite = settings.COOKIE_SAMESITE if settings.COOKIE_SAMESITE in ("lax", "strict", "none") else "lax"
    return {
        "path": ADMIN_PIN_COOKIE_PATH,
        "httponly": True,
        "secure": settings.COOKIE_SECURE or samesite == "none",
        "samesite": samesite,
        "domain": settings.COOKIE_DOMAIN,
    }


def issue_pin_cookie(response: Response, user: User) -> None:
    """Grant this admin PIN-protected access for ADMIN_PIN_TTL."""
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": str(user.id), "purpose": _PURPOSE, "iat": now, "exp": now + ADMIN_PIN_TTL, "jti": secrets.token_hex(8)},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    response.set_cookie(ADMIN_PIN_COOKIE, token, max_age=int(ADMIN_PIN_TTL.total_seconds()), **_cookie_options())


def clear_pin_cookie(response: Response) -> None:
    opts = _cookie_options()
    response.delete_cookie(ADMIN_PIN_COOKIE, path=opts["path"], domain=opts["domain"])


def pin_cookie_is_valid(request: Request, user: User) -> bool:
    token = request.cookies.get(ADMIN_PIN_COOKIE)
    if not token:
        return False
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return False
    return payload.get("purpose") == _PURPOSE and payload.get("sub") == str(user.id)


def require_admin_pin(request: Request, current_user: User = Depends(get_current_active_admin)) -> User:
    """Dependency: an admin who entered the PIN in the last ADMIN_PIN_TTL."""
    if not pin_cookie_is_valid(request, current_user):
        raise HTTPException(
            status_code=403,
            detail={"error": "pin_required", "message": "Enter the admin PIN to view or change user data."},
        )
    return current_user


# --- wrong-PIN throttling -------------------------------------------------------


def _recent_failures(user_id: int, now: datetime) -> list[datetime]:
    recent = [t for t in _failures.get(user_id, []) if now - t < PIN_LOCKOUT]
    _failures[user_id] = recent
    return recent


def check_not_locked_out(user_id: int) -> None:
    now = datetime.now(timezone.utc)
    with _lock:
        recent = _recent_failures(user_id, now)
        if len(recent) >= MAX_PIN_FAILURES:
            retry_after = int((recent[0] + PIN_LOCKOUT - now).total_seconds()) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Too many wrong PINs. Try again in {max(1, retry_after // 60)} minute(s).",
                headers={"Retry-After": str(retry_after)},
            )


def record_failure(user_id: int) -> int:
    """Record a wrong PIN; returns attempts left before the lockout."""
    now = datetime.now(timezone.utc)
    with _lock:
        recent = _recent_failures(user_id, now)
        recent.append(now)
        return max(0, MAX_PIN_FAILURES - len(recent))


def reset_failures(user_id: int) -> None:
    with _lock:
        _failures.pop(user_id, None)
