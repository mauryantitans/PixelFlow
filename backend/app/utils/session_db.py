"""
Database Session Management for PixelFlow

Manages user sessions, image storage, and automatic cleanup.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.db_models import Session as DBSession
from app.models.db_models import UploadedImage

logger = logging.getLogger(__name__)

# Session settings
SESSION_EXPIRY_HOURS = 24  # Sessions expire after 24 hours
CLEANUP_INTERVAL_HOURS = 1  # How often to cleanup expired sessions


class SessionOwnershipError(Exception):
    """The session id belongs to a different user than the one making the request."""


# Write last_active/expires_at at most this often per session, so frequent
# activity (live preview, image listing) doesn't turn into a DB write each time.
ACTIVITY_WRITE_INTERVAL = timedelta(seconds=60)


def _lifetime(db: Session, user_id: int | None) -> timedelta:
    from app.utils.settings_manager import get_retention_policy

    policy = get_retention_policy(db)
    lifetime = policy["user_session_lifetime"] if user_id is not None else policy["guest_session_lifetime"]
    return lifetime or timedelta(hours=SESSION_EXPIRY_HOURS)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)  # SQLite returns naive datetimes
    return dt


def create_or_update_session(
    db: Session,
    session_id: str,
    user_id: int | None = None,
    device_info: str | None = None,
    ip_address: str | None = None,
    *,
    create: bool = True,
) -> DBSession | None:
    """
    Record real activity on a session.

    - Sliding expiry: every recorded activity pushes ``expires_at`` forward by
      the session lifetime (guest vs. registered user, from the DB settings),
      so a session that is in use never expires underneath its user.
    - Writes are throttled to one per ACTIVITY_WRITE_INTERVAL.
    - Ownership: a session that belongs to a user can only be used by that
      user (raises SessionOwnershipError otherwise). A guest session is linked
      to the user who first uses it while signed in, together with its images.
    - ``create=False`` only touches an existing session (returns None if absent),
      for read paths that must not create rows.
    """
    current_time = datetime.now(timezone.utc)
    session = db.query(DBSession).filter(DBSession.id == session_id).first()

    if session is None:
        if not create:
            return None
        session = DBSession(
            id=session_id,
            user_id=user_id,
            device_info=device_info,
            ip_address=ip_address,
            last_active=current_time,
            expires_at=current_time + _lifetime(db, user_id),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        logger.info(f"Created new session: {session_id} (user_id: {user_id})")
        return session

    if session.user_id is not None and session.user_id != user_id:
        raise SessionOwnershipError(session_id)

    changed = False
    if user_id is not None and session.user_id is None:
        # A guest signed in: the session and the images uploaded in it become theirs.
        session.user_id = user_id
        db.query(UploadedImage).filter(
            UploadedImage.session_id == session_id, UploadedImage.user_id.is_(None)
        ).update({UploadedImage.user_id: user_id}, synchronize_session=False)
        changed = True
        logger.info(f"Linked session {session_id} (and its images) to user {user_id}")

    last_active = _aware(session.last_active)
    if changed or last_active is None or current_time - last_active >= ACTIVITY_WRITE_INTERVAL:
        session.last_active = current_time
        new_expiry = current_time + _lifetime(db, session.user_id)
        expires_at = _aware(session.expires_at)
        if expires_at is None or new_expiry > expires_at:
            session.expires_at = new_expiry
        changed = True

    if changed:
        db.commit()
        db.refresh(session)
    return session


def touch_session(db: Session, session_id: str | None, user_id: int | None = None) -> DBSession | None:
    """Record activity on an existing session without creating one."""
    if not session_id:
        return None
    return create_or_update_session(db, session_id, user_id, create=False)


def get_session(db: Session, session_id: str) -> DBSession | None:
    """Get session by ID"""
    return db.query(DBSession).filter(DBSession.id == session_id).first()


def cleanup_expired_sessions(db: Session) -> int:
    """
    Delete expired sessions and all their associated images
    Returns number of sessions cleaned up
    """
    current_time = datetime.now(timezone.utc)

    # Find expired sessions
    expired_sessions = db.query(DBSession).filter(
        DBSession.expires_at < current_time
    ).all()

    count = len(expired_sessions)

    if count > 0:
        logger.info(f"Cleaning up {count} expired sessions")

        for session in expired_sessions:
            logger.info(f"Deleting expired session: {session.id} (expired: {session.expires_at})")
            db.delete(session)

        db.commit()
        logger.info(f"Cleanup complete: {count} sessions removed")

    return count


def get_session_images(db: Session, session_id: str) -> list[UploadedImage]:
    """Get all images for a session"""
    return db.query(UploadedImage).filter(
        UploadedImage.session_id == session_id
    ).order_by(UploadedImage.uploaded_at).all()


def get_session_stats(db: Session, session_id: str) -> dict:
    """Get statistics for a session"""
    session = get_session(db, session_id)

    if not session:
        return {
            "exists": False,
            "image_count": 0,
            "total_size_mb": 0
        }

    images = get_session_images(db, session_id)
    total_size = sum(img.size_bytes for img in images)

    return {
        "exists": True,
        "session_id": session_id,
        "user_id": session.user_id,
        "created_at": session.created_at,
        "last_active": session.last_active,
        "expires_at": session.expires_at,
        "image_count": len(images),
        "total_size_mb": round(total_size / (1024 * 1024), 2)
    }


def delete_session(db: Session, session_id: str) -> bool:
    """Delete a session and all its images"""
    session = get_session(db, session_id)

    if session:
        logger.info(f"Deleting session: {session_id}")
        db.delete(session)
        db.commit()
        return True

    return False
