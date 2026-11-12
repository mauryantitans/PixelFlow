from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Request, Response, Form
from sqlalchemy.orm import Session
from typing import Optional
import logging
import threading
import time

logger = logging.getLogger(__name__)

from ...core.database import get_db
from ...core.config import settings
from ...models.db_models import User
from ...models.schemas import (
    UserCreate, UserResponse, UserUpdate,
    LoginRequest,
    ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest,
)
from ...utils.auth import (
    get_password_hash, authenticate_user,
    create_access_token, create_refresh_token,
    get_current_user, get_current_active_admin,
    store_refresh_token, verify_and_rotate_refresh_token,
    revoke_user_refresh_tokens,
    set_auth_cookies, clear_auth_cookies, REFRESH_COOKIE,
)
from ...utils.security import (
    check_login_attempts, log_login_attempt, clear_login_attempts
)
from ...utils import email as email_utils
from ...utils.account_tokens import (
    PASSWORD_RESET, VERIFY_EMAIL, AccountTokenError,
    create_account_token, resolve_account_token, lifetime_minutes,
)
from ...utils.datetime_utils import utcnow

router = APIRouter()


# ---------------------------------------------------------------------------
# Email helpers (password reset / verification)
# ---------------------------------------------------------------------------

# One email of each kind per address per cooldown, so the endpoints can't be
# used to flood someone's inbox (the per-IP auth rate limit still applies on
# top). In memory, like the rate limiter.
EMAIL_COOLDOWN_SECONDS = 60
_email_last_sent: dict[tuple[str, str], float] = {}
_email_lock = threading.Lock()


def _email_allowed(kind: str, address: str) -> bool:
    """True (and records the send) unless this kind of email went to this
    address within the cooldown."""
    key = (kind, address.strip().lower())
    now = time.monotonic()
    with _email_lock:
        last = _email_last_sent.get(key)
        if last is not None and now - last < EMAIL_COOLDOWN_SECONDS:
            return False
        _email_last_sent[key] = now
        # Keep the dict small.
        if len(_email_last_sent) > 10_000:
            cutoff = now - EMAIL_COOLDOWN_SECONDS
            for k in [k for k, t in _email_last_sent.items() if t < cutoff]:
                del _email_last_sent[k]
    return True


def _queue_verification_email(background_tasks: BackgroundTasks, user: User) -> None:
    token = create_account_token(user, VERIFY_EMAIL)
    background_tasks.add_task(
        email_utils.send_verification_email,
        user.email,
        email_utils.display_name(user),
        token,
        lifetime_minutes(VERIFY_EMAIL) // 60,
    )


def _token_error(e: AccountTokenError, what: str) -> HTTPException:
    if e.reason == "expired":
        detail = f"This {what} link has expired. Request a new one."
        code = "token_expired"
    else:
        detail = f"This {what} link is invalid or has already been used. Request a new one."
        code = "token_invalid"
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"message": detail, "code": code},
    )


FORGOT_PASSWORD_MESSAGE = (
    "If an account exists for that email address, we've sent it a message with "
    "instructions to reset the password. Check your inbox (and spam folder)."
)

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Register a new user"""
    # Check if user already exists
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        hashed_password=hashed_password
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Ask the new user to confirm their address (doesn't block anything).
    _email_allowed(VERIFY_EMAIL, db_user.email)
    _queue_verification_email(background_tasks, db_user)

    return db_user

@router.post("/login", response_model=UserResponse)
async def login(
    request: Request,
    login_data: LoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """Login: set httpOnly auth cookies and return the user (with security tracking).

    Tokens are delivered as httpOnly cookies (never in the response body / JS), so
    they can't be read by client-side script (mitigates XSS token theft)."""

    # Get client IP and user agent
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Check if user is locked out
    lockout_status = check_login_attempts(db, login_data.email, ip_address)
    
    if not lockout_status['allowed']:
        log_login_attempt(
            db, 
            login_data.email, 
            False,
            ip_address,
            user_agent,
            "Account locked due to too many failed attempts"
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Account locked until {lockout_status['locked_until'].strftime('%Y-%m-%d %H:%M:%S UTC')}"
        )
    
    # Authenticate user
    user = authenticate_user(db, login_data.email, login_data.password)
    
    if not user:
        log_login_attempt(
            db,
            login_data.email,
            False,
            ip_address,
            user_agent,
            "Invalid credentials"
        )
        
        remaining = lockout_status['attempts_remaining'] - 1
        if remaining > 0:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid credentials. {remaining} attempt(s) remaining before account lockout.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials. Account will be locked for 15 minutes after this attempt.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    if not user.is_active:
        log_login_attempt(
            db,
            login_data.email,
            False,
            ip_address,
            user_agent,
            "Account inactive"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Successful login - clear failed attempts
    clear_login_attempts(db, login_data.email)
    log_login_attempt(db, user.email, True, ip_address, user_agent)
    
    # Create tokens and persist the refresh token so it can be revoked later
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    store_refresh_token(db, user.id, refresh_token)

    # Deliver tokens as httpOnly cookies; the body carries only the user record.
    set_auth_cookies(response, access_token, refresh_token)
    return user

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user information"""
    # Check if email is being changed and is already taken
    email_changed = False
    if user_update.email and user_update.email != current_user.email:
        existing_user = db.query(User).filter(User.email == user_update.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        current_user.email = user_update.email
        # A new address has to be verified again.
        current_user.email_verified = False
        current_user.email_verified_at = None
        email_changed = True
    
    # Check if username is being changed and is already taken
    if user_update.username and user_update.username != current_user.username:
        existing_user = db.query(User).filter(User.username == user_update.username).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.username = user_update.username
    
    # Update other fields
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    
    if user_update.password:
        current_user.hashed_password = get_password_hash(user_update.password)
    
    db.commit()
    db.refresh(current_user)

    if email_changed:
        _email_allowed(VERIFY_EMAIL, current_user.email)
        _queue_verification_email(background_tasks, current_user)

    return current_user

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete current user account"""
    db.delete(current_user)
    db.commit()
    return None


@router.post("/refresh")
async def refresh_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Exchange the httpOnly refresh-token cookie for a fresh access + refresh pair.

    The old refresh token is deleted on success (token rotation), so each
    refresh token can only be used once.  Stolen tokens are therefore
    automatically invalidated the next time the legitimate client refreshes.
    New tokens are set as httpOnly cookies; the body carries no tokens.
    """
    refresh_token = request.cookies.get(REFRESH_COOKIE)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user, new_access, new_refresh = verify_and_rotate_refresh_token(db, refresh_token)
    set_auth_cookies(response, new_access, new_refresh)
    return {"success": True}


@router.post("/logout")
async def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    session_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Logout: clear auth cookies, revoke refresh tokens, and cleanup user data
    (except saved pipelines)."""
    from ...models.db_models import Session as DBSession, UploadedImage, ProcessedImage
    from ...utils.settings_manager import get_settings

    logger.info(f"User logout: {current_user.email}")

    # Clear the httpOnly auth cookies on the client.
    clear_auth_cookies(response)

    # Revoke all persisted refresh tokens so stolen tokens can no longer be used
    revoked = revoke_user_refresh_tokens(db, current_user.id)
    logger.info(f"Revoked {revoked} refresh token(s) for {current_user.email}")

    # Cleanup policy is driven by the editable admin setting `cleanup_on_logout`.
    # When enabled we discard regenerable processed results but keep the user's
    # uploads, session, and saved pipelines; when disabled we keep everything.
    cleanup_on_logout = get_settings(db).cleanup_on_logout
    policy = {
        "delete_session": False,
        "delete_uploads": False,
        "delete_processed": bool(cleanup_on_logout),
        "keep_pipelines": True,
    }
    
    items_deleted = {
        "sessions": 0,
        "uploads": 0,
        "processed": 0
    }
    
    # Delete session if configured
    if policy.get('delete_session'):
        session = db.query(DBSession).filter(DBSession.id == session_id).first()
        if session:
            db.delete(session)  # Cascades to images
            items_deleted["sessions"] = 1
            logger.info(f"Deleted session: {session_id}")
    
    # Delete uploads if configured (and session not deleted, to avoid cascade conflict)
    if policy.get('delete_uploads') and not policy.get('delete_session'):
        uploads = db.query(UploadedImage).filter(
            UploadedImage.session_id == session_id
        ).all()
        for upload in uploads:
            db.delete(upload)
            items_deleted["uploads"] += 1
    
    # Delete processed images if configured (and session not deleted)
    if policy.get('delete_processed') and not policy.get('delete_session'):
        processed = db.query(ProcessedImage).filter(
            ProcessedImage.session_id == session_id
        ).all()
        for proc in processed:
            db.delete(proc)
            items_deleted["processed"] += 1
    
    db.commit()
    
    logger.info(
        f"Logout cleanup complete for {current_user.email}: "
        f"Sessions: {items_deleted['sessions']}, "
        f"Uploads: {items_deleted['uploads']}, "
        f"Processed: {items_deleted['processed']}"
    )
    
    return {
        "success": True,
        "message": "Logged out successfully",
        "cleaned_up": items_deleted,
        "pipelines_kept": True
    }

# ---------------------------------------------------------------------------
# Password reset and email verification
# ---------------------------------------------------------------------------


@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Email a password-reset link. The response is the same whether or not the
    account exists (no account enumeration); accounts that only sign in with
    Google get an email pointing them at Google sign-in instead."""
    email = data.email.strip()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        logger.info("Password reset requested for an unknown or inactive account")
    elif not _email_allowed(PASSWORD_RESET, user.email):
        logger.info("Password reset email for user %s throttled", user.id)
    elif not user.hashed_password:
        background_tasks.add_task(
            email_utils.send_oauth_only_reset_email,
            user.email,
            email_utils.display_name(user),
        )
    else:
        token = create_account_token(user, PASSWORD_RESET)
        background_tasks.add_task(
            email_utils.send_password_reset_email,
            user.email,
            email_utils.display_name(user),
            token,
            lifetime_minutes(PASSWORD_RESET),
        )
    return {"success": True, "message": FORGOT_PASSWORD_MESSAGE}


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Set a new password from a reset link. Signs the account out everywhere
    (all refresh tokens are revoked) and lifts any login lockout; the user then
    signs in with the new password."""
    try:
        user = resolve_account_token(db, data.token, PASSWORD_RESET)
    except AccountTokenError as e:
        raise _token_error(e, "password reset") from None

    user.hashed_password = get_password_hash(data.new_password)
    # The reset link arrived by email, which proves the address.
    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = utcnow()
    db.commit()

    revoked = revoke_user_refresh_tokens(db, user.id)
    clear_login_attempts(db, user.email)
    logger.info("Password reset for user %s; revoked %s refresh token(s)", user.id, revoked)

    background_tasks.add_task(
        email_utils.send_password_changed_email,
        user.email,
        email_utils.display_name(user),
    )
    return {
        "success": True,
        "message": "Your password has been reset. Sign in with your new password.",
    }


@router.post("/verify-email")
async def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Mark the address in a verification link as verified."""
    try:
        user = resolve_account_token(db, data.token, VERIFY_EMAIL)
    except AccountTokenError as e:
        raise _token_error(e, "verification") from None

    already = bool(user.email_verified)
    if not already:
        user.email_verified = True
        user.email_verified_at = utcnow()
        db.commit()
    return {
        "success": True,
        "already_verified": already,
        "email": user.email,
        "message": "Your email address was already verified."
        if already
        else "Your email address is verified.",
    }


@router.post("/resend-verification")
async def resend_verification(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Send the signed-in user a fresh verification link."""
    if current_user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Your email address is already verified.", "code": "already_verified"},
        )
    if not _email_allowed(VERIFY_EMAIL, current_user.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": "A verification email was sent less than a minute ago. "
                "Check your inbox, or try again in a minute.",
                "code": "email_throttled",
            },
        )
    _queue_verification_email(background_tasks, current_user)
    return {"success": True, "message": f"Verification email sent to {current_user.email}."}


# Debug endpoints have been intentionally removed for production security.
