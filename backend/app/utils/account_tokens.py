"""Signed, single-use tokens for password reset and email verification.

No table: a token is a JWT (``SECRET_KEY``/``ALGORITHM``) carrying the
``purpose``, the user id (``sub``), a random ``jti`` and a *fingerprint* of the
account state it is about:

* ``password_reset`` (1 hour): an HMAC of the user's current password hash.
  Setting a new password changes the hash, so the link stops working once used
  (and any older reset link dies with it).
* ``verify_email`` (48 hours): an HMAC of the email address, so a link sent to
  an old address can't verify a changed one.

The ``type`` claim equals the purpose, never ``access``/``refresh``, so these
tokens can't be used to authenticate and access/refresh tokens can't be used
here. The fingerprint is keyed with ``SECRET_KEY`` so it reveals nothing about
the password hash even though JWT payloads are readable.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from jose import ExpiredSignatureError, JWTError, jwt
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.db_models import User

PASSWORD_RESET = "password_reset"
VERIFY_EMAIL = "verify_email"

TOKEN_LIFETIMES: dict[str, timedelta] = {
    PASSWORD_RESET: timedelta(hours=1),
    VERIFY_EMAIL: timedelta(hours=48),
}


class AccountTokenError(Exception):
    """A reset/verify token that can't be used. ``reason`` is 'expired' or 'invalid'."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _fingerprint(purpose: str, value: str) -> str:
    mac = hmac.new(settings.SECRET_KEY.encode(), f"{purpose}:{value}".encode(), hashlib.sha256)
    return mac.hexdigest()[:24]


def _state(user: User, purpose: str) -> str:
    if purpose == PASSWORD_RESET:
        return str(user.hashed_password or "")
    return str(user.email or "").strip().lower()


def create_account_token(user: User, purpose: str) -> str:
    if purpose not in TOKEN_LIFETIMES:
        raise ValueError(f"unknown token purpose: {purpose}")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "type": purpose,
        "purpose": purpose,
        "fp": _fingerprint(purpose, _state(user, purpose)),
        "iat": now,
        "exp": now + TOKEN_LIFETIMES[purpose],
        "jti": secrets.token_urlsafe(12),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def resolve_account_token(db: Session, token: str, purpose: str) -> User:
    """The user a valid token is for. Raises AccountTokenError otherwise."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except ExpiredSignatureError:
        raise AccountTokenError("expired") from None
    except JWTError:
        raise AccountTokenError("invalid") from None

    if payload.get("purpose") != purpose or payload.get("type") != purpose:
        raise AccountTokenError("invalid")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise AccountTokenError("invalid") from None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise AccountTokenError("invalid")
    if purpose == PASSWORD_RESET and not user.hashed_password:
        raise AccountTokenError("invalid")
    expected = _fingerprint(purpose, _state(user, purpose))
    if not hmac.compare_digest(str(payload.get("fp", "")), expected):
        raise AccountTokenError("invalid")
    return user


def lifetime_minutes(purpose: str) -> int:
    return int(TOKEN_LIFETIMES[purpose].total_seconds() // 60)
