"""Outgoing email: password reset, email verification and account notices.

Two backends, picked by ``EMAIL_BACKEND``:

* ``console`` (default) writes the message, link included, to the log at INFO,
  so local development works without an email provider.
* ``smtp`` sends through ``SMTP_HOST``/``SMTP_PORT`` (STARTTLS unless
  ``SMTP_STARTTLS=False``; port 465 uses implicit TLS) with optional
  ``SMTP_USERNAME``/``SMTP_PASSWORD``, from ``EMAIL_FROM``.

Sending never raises: a failure is logged and ``send_email`` returns False, so a
broken mail server can't turn a sign-up or a password-reset request into a 500.
Routes call these helpers through FastAPI ``BackgroundTasks`` so the response
doesn't wait on (or reveal anything through the timing of) the mail server.
"""

from __future__ import annotations

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid
from urllib.parse import quote

from ..core.config import settings

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 15


def frontend_link(path: str, token: str) -> str:
    """An absolute frontend URL like ``{FRONTEND_URL}/reset-password?token=...``."""
    return f"{settings.FRONTEND_URL}{path}?token={quote(token, safe='')}"


def send_email(to: str, subject: str, text: str, html_body: str | None = None) -> bool:
    """Send one message with the configured backend. Returns True on success."""
    try:
        if settings.EMAIL_BACKEND == "smtp":
            _send_smtp(to, subject, text, html_body)
        else:
            logger.info(
                "[email:console] To: %s\nSubject: %s\n\n%s",
                to,
                subject,
                text,
            )
        return True
    except Exception as e:  # never let mail problems break the request
        logger.error("Failed to send email %r to %s: %s", subject, to, e)
        return False


def _send_smtp(to: str, subject: str, text: str, html_body: str | None) -> None:
    if not settings.SMTP_HOST:
        raise RuntimeError("EMAIL_BACKEND=smtp but SMTP_HOST is not set")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=_from_domain())
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    if settings.SMTP_PORT == 465:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.SMTP_HOST, settings.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS, context=context
        )
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS)
    with server:
        if settings.SMTP_PORT != 465 and settings.SMTP_STARTTLS:
            server.starttls(context=context)
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)
    logger.info("Sent email %r to %s", subject, to)


def _from_domain() -> str:
    addr = settings.EMAIL_FROM.rsplit("<", 1)[-1].rstrip(">")
    return addr.rsplit("@", 1)[-1] or "localhost"


# ---------------------------------------------------------------------------
# Message templates (plain text + a simple HTML alternative)
# ---------------------------------------------------------------------------


def _html(greeting: str, paragraphs: list[str], link: str | None = None, cta: str = "") -> str:
    """A minimal, inline-styled HTML body. All text is escaped."""
    parts = [f"<p>{html.escape(greeting)}</p>"]
    for p in paragraphs:
        parts.append(f"<p>{html.escape(p)}</p>")
    if link:
        safe = html.escape(link, quote=True)
        parts.insert(
            2,
            f'<p><a href="{safe}" style="display:inline-block;padding:10px 18px;'
            "background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;"
            f'font-weight:600">{html.escape(cta)}</a></p>'
            f'<p style="font-size:13px;color:#475569">Or paste this link into your browser:<br>'
            f'<a href="{safe}" style="color:#1d4ed8;word-break:break-all">{safe}</a></p>',
        )
    body = "\n".join(parts)
    return (
        '<!doctype html><html lang="en"><body style="font-family:system-ui,-apple-system,'
        'Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">'
        f"{body}<p>— PixelFlow</p></body></html>"
    )


def display_name(user) -> str:
    """How to greet a user. Resolve it before queuing a background send: the
    ORM object may be detached once the request's DB session closes."""
    return user.full_name or user.username or "there"


def send_password_reset_email(to: str, name: str, token: str, expires_minutes: int) -> bool:
    link = frontend_link("/reset-password", token)
    greeting = f"Hi {name},"
    intro = "Someone (hopefully you) asked to reset the password for your PixelFlow account."
    expiry = (
        f"The link works once and expires in {expires_minutes} minutes. If you didn't ask "
        "for this, you can ignore this email: your password stays the same."
    )
    text = (
        f"{greeting}\n\n{intro}\n\nChoose a new password here:\n{link}\n\n{expiry}\n\n— PixelFlow\n"
    )
    return send_email(
        to,
        "Reset your PixelFlow password",
        text,
        _html(greeting, [intro, expiry], link, "Choose a new password"),
    )


def send_oauth_only_reset_email(to: str, name: str) -> bool:
    """For accounts that sign in with Google and have no password to reset."""
    greeting = f"Hi {name},"
    body = (
        "Someone asked to reset the password for your PixelFlow account. Your account "
        "signs in with Google and has no PixelFlow password, so there is nothing to "
        'reset: use "Sign in with Google" on the sign-in page instead.'
    )
    signin = f"{settings.FRONTEND_URL}/auth"
    text = f"{greeting}\n\n{body}\n\nSign in: {signin}\n\nIf this wasn't you, you can ignore this email.\n\n— PixelFlow\n"
    return send_email(
        to,
        "Signing in to PixelFlow",
        text,
        _html(
            greeting,
            [body, "If this wasn't you, you can ignore this email."],
            signin,
            "Go to sign in",
        ),
    )


def send_password_changed_email(to: str, name: str) -> bool:
    greeting = f"Hi {name},"
    body = (
        "The password for your PixelFlow account was just changed, and every device "
        "signed in to it was signed out. If you didn't do this, reset your password "
        "now from the sign-in page."
    )
    text = f"{greeting}\n\n{body}\n\n{settings.FRONTEND_URL}/forgot-password\n\n— PixelFlow\n"
    return send_email(
        to,
        "Your PixelFlow password was changed",
        text,
        _html(greeting, [body], f"{settings.FRONTEND_URL}/forgot-password", "Reset password"),
    )


def send_verification_email(to: str, name: str, token: str, expires_hours: int) -> bool:
    link = frontend_link("/verify-email", token)
    greeting = f"Hi {name},"
    intro = f"Please confirm that {to} is your email address."
    expiry = (
        f"The link expires in {expires_hours} hours. If you didn't create a PixelFlow "
        "account, you can ignore this email."
    )
    text = f"{greeting}\n\n{intro}\n\nVerify your email here:\n{link}\n\n{expiry}\n\n— PixelFlow\n"
    return send_email(
        to,
        "Verify your email for PixelFlow",
        text,
        _html(greeting, [intro, expiry], link, "Verify email"),
    )
