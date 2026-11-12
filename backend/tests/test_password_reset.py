"""Password reset and email verification (POST /api/auth/forgot-password,
/reset-password, /verify-email, /resend-verification).

Mail goes through the console backend; ``send_email`` is monkeypatched to
capture each message so the test can pull the link out of it, as a user would.
Background tasks run before TestClient returns, so the outbox is ready.
"""

import re
from datetime import timedelta
from urllib.parse import unquote

import pytest

from app.api.routes import auth as auth_routes
from app.middleware import rate_limit
from app.models.db_models import LoginAttempt, RefreshToken, User
from app.utils import account_tokens
from app.utils import email as email_utils

USER = {
    "email": "reset.user@example.com",
    "username": "resetuser",
    "full_name": "Reset User",
    "password": "OriginalPassw0rd!",
}
NEW_PASSWORD = "BrandNewPassw0rd!"


@pytest.fixture(autouse=True)
def _fresh_limits():
    """Every test starts (and leaves) with empty rate-limit and email-cooldown state."""
    rate_limit.request_history.clear()
    auth_routes._email_last_sent.clear()
    yield
    rate_limit.request_history.clear()
    auth_routes._email_last_sent.clear()


@pytest.fixture()
def outbox(monkeypatch):
    sent = []

    def fake_send(to, subject, text, html_body=None):
        sent.append({"to": to, "subject": subject, "text": text, "html": html_body})
        return True

    monkeypatch.setattr(email_utils, "send_email", fake_send)
    return sent


def _token_from(message) -> str:
    m = re.search(r"token=([^\s]+)", message["text"])
    assert m, message["text"]
    return unquote(m.group(1))


def _register(client):
    r = client.post("/api/auth/register", json=USER)
    assert r.status_code == 201, r.text
    return r.json()


def _login(client, password=USER["password"]):
    return client.post("/api/auth/login", json={"email": USER["email"], "password": password})


def _reset_token(client, outbox) -> str:
    before = len(outbox)
    r = client.post("/api/auth/forgot-password", json={"email": USER["email"]})
    assert r.status_code == 200, r.text
    assert len(outbox) == before + 1
    msg = outbox[-1]
    assert msg["to"] == USER["email"]
    assert "reset-password?token=" in msg["text"]
    return _token_from(msg)


# ---------------------------------------------------------------------------
# Forgot password: no account enumeration
# ---------------------------------------------------------------------------


def test_forgot_password_response_is_identical_for_unknown_and_known(client, db, outbox):
    _register(client)
    outbox.clear()
    known = client.post("/api/auth/forgot-password", json={"email": USER["email"]})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    # Only the real account got mail.
    assert [m["to"] for m in outbox] == [USER["email"]]


def test_forgot_password_for_oauth_only_account_suggests_google(client, db, outbox):
    db.add(
        User(
            email="google.only@example.com",
            username="googleonly",
            oauth_provider="google",
            oauth_id="g-123",
            hashed_password=None,
            email_verified=True,
        )
    )
    db.commit()
    r = client.post("/api/auth/forgot-password", json={"email": "google.only@example.com"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 200 and r.json() == unknown.json()  # not revealed in the response
    assert len(outbox) == 1
    assert "Google" in outbox[0]["text"]
    assert "token=" not in outbox[0]["text"]


def test_forgot_password_does_not_flood_an_inbox(client, outbox):
    _register(client)
    outbox.clear()
    for _ in range(3):
        assert (
            client.post("/api/auth/forgot-password", json={"email": USER["email"]}).status_code
            == 200
        )
    assert len(outbox) == 1


# ---------------------------------------------------------------------------
# Reset password
# ---------------------------------------------------------------------------


def test_reset_password_happy_path(client, db, outbox):
    _register(client)
    token = _reset_token(client, outbox)

    r = client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True
    # A "your password was changed" notice goes out.
    assert "changed" in outbox[-1]["subject"].lower()

    client.cookies.clear()
    assert _login(client).status_code == 401
    assert _login(client, NEW_PASSWORD).status_code == 200


def test_reset_token_cannot_be_reused(client, outbox):
    _register(client)
    token = _reset_token(client, outbox)
    ok = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
    )
    assert ok.status_code == 200
    again = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "AnotherPassw0rd!"}
    )
    assert again.status_code == 400
    assert again.json()["detail"]["code"] == "token_invalid"
    client.cookies.clear()
    assert _login(client, NEW_PASSWORD).status_code == 200


def test_expired_reset_token_is_rejected(client, outbox, monkeypatch):
    _register(client)
    monkeypatch.setitem(
        account_tokens.TOKEN_LIFETIMES, account_tokens.PASSWORD_RESET, timedelta(seconds=-5)
    )
    token = _reset_token(client, outbox)
    r = client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "token_expired"


def test_wrong_purpose_tokens_are_rejected(client, db, outbox):
    user = _register(client)
    verify_token = _token_from(outbox[-1])  # the verification email from sign-up
    r = client.post(
        "/api/auth/reset-password", json={"token": verify_token, "new_password": NEW_PASSWORD}
    )
    assert r.status_code == 400 and r.json()["detail"]["code"] == "token_invalid"

    reset_token = _reset_token(client, outbox)
    r = client.post("/api/auth/verify-email", json={"token": reset_token})
    assert r.status_code == 400

    # An access token is not a reset token either, and a reset token can't authenticate.
    from app.utils.auth import create_access_token

    access = create_access_token({"sub": str(user["id"])})
    r = client.post(
        "/api/auth/reset-password", json={"token": access, "new_password": NEW_PASSWORD}
    )
    assert r.status_code == 400
    client.cookies.clear()
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {reset_token}"})
    assert r.status_code == 401


def test_garbage_token_is_rejected(client):
    r = client.post(
        "/api/auth/reset-password", json={"token": "not-a-jwt", "new_password": NEW_PASSWORD}
    )
    assert r.status_code == 400 and r.json()["detail"]["code"] == "token_invalid"


def test_reset_enforces_password_policy(client, outbox):
    _register(client)
    token = _reset_token(client, outbox)
    r = client.post("/api/auth/reset-password", json={"token": token, "new_password": "short"})
    assert r.status_code == 422
    assert "at least 8" in r.text
    # The token is still usable after a rejected password.
    r = client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 200


def test_reset_revokes_refresh_tokens_and_clears_lockout(client, db, outbox):
    user = _register(client)
    assert _login(client).status_code == 200
    assert db.query(RefreshToken).filter(RefreshToken.user_id == user["id"]).count() == 1
    old_refresh = client.cookies.get("pf_refresh")
    # Fail a few sign-ins so there are lockout records.
    for _ in range(3):
        _login(client, "WrongPassw0rd!")
    assert (
        db.query(LoginAttempt)
        .filter(LoginAttempt.email == USER["email"], LoginAttempt.success.is_(False))
        .count()
        == 3
    )

    token = _reset_token(client, outbox)
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}
        ).status_code
        == 200
    )

    assert db.query(RefreshToken).filter(RefreshToken.user_id == user["id"]).count() == 0
    assert (
        db.query(LoginAttempt)
        .filter(LoginAttempt.email == USER["email"], LoginAttempt.success.is_(False))
        .count()
        == 0
    )
    # The old refresh cookie no longer works.
    client.cookies.clear()
    client.cookies.set("pf_refresh", old_refresh)
    client.cookies.set("pf_csrf", "c")
    r = client.post("/api/auth/refresh", headers={"X-CSRF-Token": "c"})
    assert r.status_code == 401, r.text


def test_reset_works_with_a_signed_in_browser_without_csrf_header(client, outbox):
    """The link may be opened in a browser that is signed in: CSRF-exempt."""
    _register(client)
    assert _login(client).status_code == 200
    token = _reset_token(client, outbox)
    r = client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD})
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Email verification
# ---------------------------------------------------------------------------


def test_register_sends_verification_and_verify_marks_user(client, db, outbox):
    user = _register(client)
    assert user["email_verified"] is False
    assert len(outbox) == 1 and "verify-email?token=" in outbox[0]["text"]
    assert outbox[0]["html"] and "verify-email?token=" in outbox[0]["html"]

    r = client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])})
    assert r.status_code == 200, r.text
    assert r.json()["already_verified"] is False
    row = db.query(User).filter(User.id == user["id"]).one()
    assert row.email_verified is True and row.email_verified_at is not None

    # Opening the link again is harmless.
    r = client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])})
    assert r.status_code == 200 and r.json()["already_verified"] is True

    assert _login(client).json()["email_verified"] is True


def test_verify_token_is_bound_to_the_email(client, db, outbox):
    user = _register(client)
    token = _token_from(outbox[0])
    row = db.query(User).filter(User.id == user["id"]).one()
    row.email = "changed@example.com"
    db.commit()
    r = client.post("/api/auth/verify-email", json={"token": token})
    assert r.status_code == 400


def test_expired_verify_token_is_rejected(client, outbox, monkeypatch):
    monkeypatch.setitem(
        account_tokens.TOKEN_LIFETIMES, account_tokens.VERIFY_EMAIL, timedelta(seconds=-5)
    )
    _register(client)
    r = client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "token_expired"


def test_resend_verification(client, outbox):
    _register(client)
    auth_routes._email_last_sent.clear()  # past the sign-up email's cooldown
    outbox.clear()

    # Signed out: refused.
    assert client.post("/api/auth/resend-verification").status_code == 401

    assert _login(client).status_code == 200
    csrf = {"X-CSRF-Token": client.cookies.get("pf_csrf")}
    # A normal authenticated call: CSRF applies.
    assert client.post("/api/auth/resend-verification").status_code == 403

    r = client.post("/api/auth/resend-verification", headers=csrf)
    assert r.status_code == 200, r.text
    assert len(outbox) == 1 and outbox[0]["to"] == USER["email"]

    # Straight away again: throttled.
    r = client.post("/api/auth/resend-verification", headers=csrf)
    assert r.status_code == 429 and len(outbox) == 1

    # Verify with the resent link, then resending is refused.
    assert (
        client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])}).status_code
        == 200
    )
    auth_routes._email_last_sent.clear()
    r = client.post("/api/auth/resend-verification", headers=csrf)
    assert r.status_code == 400 and r.json()["detail"]["code"] == "already_verified"


def test_changing_email_requires_verifying_again(client, db, outbox):
    user = _register(client)
    client.post("/api/auth/verify-email", json={"token": _token_from(outbox[0])})
    assert _login(client).status_code == 200
    csrf = {"X-CSRF-Token": client.cookies.get("pf_csrf")}
    r = client.put("/api/auth/me", json={"email": "new.address@example.com"}, headers=csrf)
    assert r.status_code == 200, r.text
    assert r.json()["email_verified"] is False
    assert outbox[-1]["to"] == "new.address@example.com"
    row = db.query(User).filter(User.id == user["id"]).one()
    assert row.email_verified is False


def test_google_sign_in_marks_email_verified(client, db, monkeypatch):
    from app.api.routes import oauth
    from app.core.config import settings

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(
        oauth.id_token,
        "verify_oauth2_token",
        lambda credential, request, client_id: {
            "aud": "test-client-id",
            "sub": "google-sub-1",
            "email": "oauth.person@example.com",
            "email_verified": True,
            "name": "OAuth Person",
        },
    )
    r = client.post("/api/auth/google/callback", json={"credential": "fake"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email_verified"] is True
    row = db.query(User).filter(User.email == "oauth.person@example.com").one()
    assert row.email_verified is True and row.email_verified_at is not None


# ---------------------------------------------------------------------------
# Wiring: rate limiting and the email backend
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
        "/api/auth/verify-email",
        "/api/auth/resend-verification",
    ],
)
def test_new_endpoints_use_the_auth_rate_limit(path):
    from app.core.security_config import RateLimiting

    limiter = rate_limit.RateLimitMiddleware(app=None)
    assert limiter._get_rate_limit(path) == (RateLimiting.AUTH_REQUESTS, RateLimiting.AUTH_WINDOW)


def test_console_backend_logs_the_link(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="app.utils.email"):
        assert email_utils.send_verification_email("a@example.com", "A", "tok123", 48) is True
    assert "verify-email?token=tok123" in caplog.text


def test_smtp_failure_never_raises(monkeypatch, caplog):
    from app.core.config import settings

    monkeypatch.setattr(settings, "EMAIL_BACKEND", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "")  # misconfigured
    assert email_utils.send_email("a@example.com", "Subject", "Body") is False
    assert "Failed to send email" in caplog.text


def test_smtp_backend_sends_multipart_message(monkeypatch):
    from app.core.config import settings

    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            sent["host"], sent["port"] = host, port

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self, context=None):
            sent["starttls"] = True

        def login(self, user, password):
            sent["login"] = user

        def send_message(self, msg):
            sent["msg"] = msg

    monkeypatch.setattr(settings, "EMAIL_BACKEND", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_USERNAME", "mailer")
    monkeypatch.setattr(email_utils.smtplib, "SMTP", FakeSMTP)
    assert email_utils.send_password_reset_email("a@example.com", "A", "tok", 60) is True
    assert sent["host"] == "smtp.example.com" and sent["starttls"] and sent["login"] == "mailer"
    msg = sent["msg"]
    assert msg["To"] == "a@example.com"
    assert msg.is_multipart()
    types = {part.get_content_type() for part in msg.iter_parts()}
    assert types == {"text/plain", "text/html"}
