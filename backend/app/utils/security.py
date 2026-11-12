from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.db_models import LoginAttempt
from app.core.security_config import LoginSecurity, PasswordPolicy, SecurityLogging
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Import settings from centralized security config
MAX_LOGIN_ATTEMPTS = LoginSecurity.MAX_ATTEMPTS
LOCKOUT_DURATION = LoginSecurity.LOCKOUT_DURATION


def check_login_attempts(db: Session, email: str, ip_address: Optional[str] = None) -> dict:
    """
    Check if user is locked out due to too many failed attempts
    
    Returns:
        dict with keys: 'allowed' (bool), 'attempts_remaining' (int), 'locked_until' (datetime or None)
    """
    cutoff_time = datetime.now(timezone.utc) - LOCKOUT_DURATION
    
    # Count recent failed attempts
    recent_attempts = db.query(LoginAttempt).filter(
        LoginAttempt.email == email,
        LoginAttempt.success == False,
        LoginAttempt.attempt_time > cutoff_time
    ).count()
    
    if recent_attempts >= MAX_LOGIN_ATTEMPTS:
        # User is locked out
        last_attempt = db.query(LoginAttempt).filter(
            LoginAttempt.email == email,
            LoginAttempt.success == False
        ).order_by(LoginAttempt.attempt_time.desc()).first()
        
        locked_until = last_attempt.attempt_time + LOCKOUT_DURATION
        
        logger.warning(f"Login blocked for {email} - too many failed attempts from IP: {ip_address}")
        
        return {
            'allowed': False,
            'attempts_remaining': 0,
            'locked_until': locked_until
        }
    
    return {
        'allowed': True,
        'attempts_remaining': MAX_LOGIN_ATTEMPTS - recent_attempts,
        'locked_until': None
    }


def log_login_attempt(
    db: Session, 
    email: str, 
    success: bool,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    failure_reason: Optional[str] = None
):
    """Log a login attempt for security tracking"""
    # Only log if enabled in config
    if not SecurityLogging.LOG_AUTH_ATTEMPTS and success:
        return
    if not SecurityLogging.LOG_FAILED_AUTH and not success:
        return
    
    # Respect privacy settings from config
    log_ip = ip_address if SecurityLogging.LOG_IP_ADDRESSES else None
    log_ua = user_agent if SecurityLogging.LOG_USER_AGENTS else None
    
    attempt = LoginAttempt(
        email=email,
        ip_address=log_ip,
        user_agent=log_ua,
        success=success,
        failure_reason=failure_reason
    )
    
    db.add(attempt)
    db.commit()
    
    if not success:
        logger.warning(f"Failed login attempt for {email} from IP: {log_ip}. Reason: {failure_reason}")
    else:
        logger.info(f"Successful login for {email} from IP: {log_ip}")


def clear_login_attempts(db: Session, email: str):
    """Clear failed login attempts after successful login"""
    db.query(LoginAttempt).filter(
        LoginAttempt.email == email,
        LoginAttempt.success == False
    ).delete()
    db.commit()


def password_policy_error(password: str) -> Optional[str]:
    """Why ``password`` breaks the password policy (security_config.PasswordPolicy),
    or None if it is acceptable. Used where a password is set from a reset link."""
    if len(password) < PasswordPolicy.MIN_LENGTH:
        return f"Password must be at least {PasswordPolicy.MIN_LENGTH} characters long"
    if len(password) > PasswordPolicy.MAX_LENGTH:
        return f"Password must be at most {PasswordPolicy.MAX_LENGTH} characters long"
    if PasswordPolicy.REQUIRE_UPPERCASE and not any(c.isupper() for c in password):
        return "Password must contain an uppercase letter"
    if PasswordPolicy.REQUIRE_LOWERCASE and not any(c.islower() for c in password):
        return "Password must contain a lowercase letter"
    if PasswordPolicy.REQUIRE_DIGIT and not any(c.isdigit() for c in password):
        return "Password must contain a digit"
    if PasswordPolicy.REQUIRE_SPECIAL and not any(
        c in PasswordPolicy.SPECIAL_CHARACTERS for c in password
    ):
        return "Password must contain a special character"
    return None
