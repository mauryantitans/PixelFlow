"""Session lifecycle: sliding expiry, throttled writes, ownership, cleanup,
and per-image ownership on the processing endpoints."""

import io
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image

from app.models.db_models import Session as DBSession
from app.models.db_models import UploadedImage, User
from app.utils.auth import create_access_token, get_password_hash
from app.utils.cleanup_service import CleanupService
from app.utils.session_db import (
    SessionOwnershipError,
    create_or_update_session,
    touch_session,
)


def _user(db, n):
    u = User(
        email=f"s{n}@example.com", username=f"s{n}", hashed_password=get_password_hash("Passw0rd!x")
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.id)})}"}


def _png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# --- sliding expiry / throttling -------------------------------------------------


def test_activity_extends_expiry(db):
    s = create_or_update_session(db, "sess-slide")
    old = datetime.now(timezone.utc) - timedelta(minutes=5)
    s.last_active = old
    s.expires_at = datetime.now(timezone.utc) + timedelta(minutes=1)  # about to expire
    db.commit()

    s = touch_session(db, "sess-slide")
    assert _aware(s.last_active) > old
    # guest lifetime default is 24h: expiry moved well into the future
    assert _aware(s.expires_at) > datetime.now(timezone.utc) + timedelta(hours=23)


def test_activity_writes_are_throttled(db):
    s = create_or_update_session(db, "sess-throttle")
    first = _aware(s.last_active)
    s = touch_session(db, "sess-throttle")
    assert _aware(s.last_active) == first  # within 60s: no write


def test_touch_never_creates_a_session(db):
    assert touch_session(db, "does-not-exist") is None
    assert db.query(DBSession).filter_by(id="does-not-exist").first() is None


# --- ownership -------------------------------------------------------------------


def test_user_session_cannot_be_used_by_someone_else(db):
    alice, bob = _user(db, 1), _user(db, 2)
    create_or_update_session(db, "sess-alice", alice.id)
    with pytest.raises(SessionOwnershipError):
        create_or_update_session(db, "sess-alice", bob.id)
    with pytest.raises(SessionOwnershipError):
        create_or_update_session(db, "sess-alice", None)  # signed-out visitor


def test_guest_session_and_images_are_linked_on_sign_in(db):
    create_or_update_session(db, "sess-guest")
    db.add(
        UploadedImage(
            id="img-guest",
            session_id="sess-guest",
            user_id=None,
            filename="a.png",
            image_data=b"x",
            width=1,
            height=1,
            format="PNG",
            size_bytes=1,
            mime_type="image/png",
        )
    )
    db.commit()
    carol = _user(db, 3)
    s = create_or_update_session(db, "sess-guest", carol.id)
    assert s.user_id == carol.id
    assert db.query(UploadedImage).filter_by(id="img-guest").one().user_id == carol.id


def test_upload_into_another_users_session_is_rejected(client, db):
    alice, bob = _user(db, 4), _user(db, 5)
    files = {"file": ("a.png", _png_bytes(), "image/png")}
    r = client.post(
        "/api/images/upload", files=files, data={"session_id": "sess-x"}, headers=_auth(alice)
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/api/images/upload", files=files, data={"session_id": "sess-x"}, headers=_auth(bob)
    )
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "session_owned_by_another_user"


def test_heartbeat_does_not_create_sessions(client, db):
    r = client.post("/api/images/heartbeat", json={"session_id": "sess-hb"})
    assert r.status_code == 200
    assert r.json()["exists"] is False
    assert db.query(DBSession).filter_by(id="sess-hb").first() is None


def test_cleanup_session_requires_the_owner(client, db):
    alice = _user(db, 6)
    create_or_update_session(db, "sess-owned", alice.id)
    r = client.post("/api/images/cleanup-session", json={"session_id": "sess-owned"})
    assert r.status_code == 401  # signed out: "sign-in expired", not "forbidden"
    assert db.query(DBSession).filter_by(id="sess-owned").first() is not None


# --- processing respects image ownership ---------------------------------------


def test_processing_someone_elses_image_is_forbidden(client, db):
    alice, bob = _user(db, 7), _user(db, 8)
    files = {"file": ("a.png", _png_bytes(), "image/png")}
    r = client.post(
        "/api/images/upload", files=files, data={"session_id": "sess-a"}, headers=_auth(alice)
    )
    image_id = r.json()["image"]["id"]
    body = {"image_id": image_id, "pipeline": [], "session_id": "sess-b"}
    # An empty pipeline returns the original image, so this used to leak it.
    assert client.post("/api/processing/process-live", json=body).status_code == 401
    assert (
        client.post("/api/processing/process-live", json=body, headers=_auth(bob)).status_code
        == 403
    )
    assert (
        client.post("/api/processing/process-live", json=body, headers=_auth(alice)).status_code
        == 200
    )
    batch = {
        "image_ids": [image_id],
        "pipeline": [{"name": "Grayscale", "params": {}}],
        "session_id": "sess-b",
    }
    assert client.post("/api/processing/process", json=batch, headers=_auth(bob)).status_code == 403


# --- automatic cleanup -----------------------------------------------------------


def test_full_cleanup_removes_expired_sessions_but_keeps_active_ones(db):
    now = datetime.now(timezone.utc)
    create_or_update_session(db, "sess-active")
    old = create_or_update_session(db, "sess-old")
    old.expires_at = now - timedelta(days=2)  # beyond the 2h grace period
    db.commit()

    result = CleanupService.run_full_cleanup(db)
    assert result["sessions"]["sessions_deleted"] == 1
    assert db.query(DBSession).filter_by(id="sess-old").first() is None
    assert db.query(DBSession).filter_by(id="sess-active").first() is not None


# --- admin settings validation ------------------------------------------------


@pytest.mark.parametrize(
    "field,value",
    [
        ("guest_session_lifetime_hours", None),  # an emptied input arrives as null
        ("free_user_upload_retention_days", 0),
        ("max_images_per_upload", -3),
        ("warn_at_percentage", 150),
        ("guest_storage_quota_mb", "50"),
        ("free_user_max_pipelines", 2.5),
        ("enable_auto_cleanup", "yes"),
    ],
)
def test_invalid_settings_are_rejected(db, field, value):
    from app.utils.settings_manager import get_settings, update_settings

    before = getattr(get_settings(db, use_cache=False), field)
    with pytest.raises(ValueError):
        update_settings(db, {field: value}, user_id=1)
    assert getattr(get_settings(db, use_cache=False), field) == before


def test_valid_settings_are_saved(db):
    from app.utils.settings_manager import get_settings, update_settings

    update_settings(
        db,
        {
            "user_session_lifetime_days": 14,
            "enable_auto_cleanup": False,
            "warn_at_percentage": 90.0,
        },
        1,
    )
    s = get_settings(db, use_cache=False)
    assert (s.user_session_lifetime_days, s.enable_auto_cleanup, s.warn_at_percentage) == (
        14,
        False,
        90,
    )


def test_signed_out_owner_gets_401_not_409(client, db):
    """After the 30-min access cookie lapses the owner's requests arrive without
    auth; they must get 401 (refresh and retry), not 'session owned by another
    user' (which made the frontend throw the user's own session away)."""
    dave = _user(db, 9)
    files = {"file": ("a.png", _png_bytes(), "image/png")}
    assert (
        client.post(
            "/api/images/upload", files=files, data={"session_id": "sess-d"}, headers=_auth(dave)
        ).status_code
        == 200
    )
    r = client.post("/api/images/upload", files=files, data={"session_id": "sess-d"})
    assert r.status_code == 401
    assert r.json()["detail"]["error"] == "sign_in_required"
    assert client.get("/api/images/session/sess-d/images").status_code == 401


def test_listing_another_users_session_is_403_not_500(client, db):
    erin, frank = _user(db, 10), _user(db, 11)
    create_or_update_session(db, "sess-e", erin.id)
    assert client.get("/api/images/session/sess-e/images", headers=_auth(frank)).status_code == 403
