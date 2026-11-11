from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import logging

from ..core.config import settings
from ..core.database import get_db
from ..models.db_models import User, RefreshToken

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer for token authentication. auto_error=False so requests authenticated
# via httpOnly cookie (no Authorization header) are not rejected before we get a
# chance to read the cookie. Bearer is still accepted for non-browser API clients.
security = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Auth cookies (httpOnly cookie-based auth)
# ---------------------------------------------------------------------------
# Access token: short-lived, httpOnly, sent on every API call (Path=/).
# Refresh token: long-lived, httpOnly, scoped to the refresh endpoint path so it
#   is only ever sent there (Path=/api/auth).
# CSRF token: NOT httpOnly so the SPA can read it and echo it back in the
#   X-CSRF-Token header (double-submit-cookie CSRF protection).
ACCESS_COOKIE = "pf_access"
REFRESH_COOKIE = "pf_refresh"
CSRF_COOKIE = "pf_csrf"
REFRESH_COOKIE_PATH = "/api/auth"


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Attach access/refresh/CSRF cookies to the response."""
    samesite = settings.COOKIE_SAMESITE if settings.COOKIE_SAMESITE in ("lax", "strict", "none") else "lax"
    secure = settings.COOKIE_SECURE or samesite == "none"  # SameSite=None requires Secure
    domain = settings.COOKIE_DOMAIN
    access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_max_age = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60

    response.set_cookie(
        ACCESS_COOKIE, access_token, max_age=access_max_age, path="/",
        httponly=True, secure=secure, samesite=samesite, domain=domain,
    )
    response.set_cookie(
        REFRESH_COOKIE, refresh_token, max_age=refresh_max_age, path=REFRESH_COOKIE_PATH,
        httponly=True, secure=secure, samesite=samesite, domain=domain,
    )
    response.set_cookie(
        CSRF_COOKIE, secrets.token_urlsafe(32), max_age=refresh_max_age, path="/",
        httponly=False, secure=secure, samesite=samesite, domain=domain,
    )


def clear_auth_cookies(response: Response) -> None:
    """Remove the auth cookies (on logout). Path must match the set path."""
    domain = settings.COOKIE_DOMAIN
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=domain)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, domain=domain)
    response.delete_cookie(CSRF_COOKIE, path="/", domain=domain)
    # Admin PIN grant (see utils/admin_pin.py) ends with the login session too.
    response.delete_cookie("pf_admin_pin", path="/api/admin", domain=domain)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    # jti makes every token unique even when issued in the same second (the exp
    # claim is whole-second), so distinct tokens never collide.
    to_encode.update({"exp": expire, "type": "access", "jti": secrets.token_urlsafe(8)})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    logger.debug(f"Created access token for data: {data}")
    return encoded_jwt

def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh", "jti": secrets.token_urlsafe(8)})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        logger.debug(f"Token decoded successfully. Payload: {payload}")
        return payload
    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def _token_from_request(
    request: Request, credentials: Optional[HTTPAuthorizationCredentials]
) -> Optional[str]:
    """Resolve the access token from the Authorization header or the access cookie."""
    if credentials:
        return credentials.credentials
    return request.cookies.get(ACCESS_COOKIE)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get the current authenticated user (from bearer header or httpOnly cookie)"""
    token = _token_from_request(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    logger.debug(f"Getting current user with token: {token[:20]}...")

    try:
        payload = decode_token(token)
        user_id_str = payload.get("sub")
        token_type = payload.get("type")
        
        # Convert user_id from string to int
        try:
            user_id = int(user_id_str) if user_id_str else None
        except (ValueError, TypeError):
            user_id = None
        
        logger.debug(f"Token payload - user_id: {user_id}, type: {token_type}")
        
        if user_id is None or token_type != "access":
            logger.error(f"Invalid token payload - user_id: {user_id}, type: {token_type}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except HTTPException:
        # Re-raise HTTP exceptions from decode_token
        raise
    except Exception as e:
        logger.error(f"Unexpected error validating token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        logger.error(f"User not found for id: {user_id}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        logger.error(f"User {user_id} is inactive")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    logger.debug(f"Successfully authenticated user: {user.email}")
    return user

async def get_current_active_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get the current user and verify they are an admin"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user

def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate a user by email and password"""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    # OAuth-only users have no password hash — reject password login attempts
    if not user.hashed_password:
        logger.warning(f"Password login attempt for OAuth-only account: {email}")
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def _hash_token(token: str) -> str:
    """SHA-256 hash a token string for safe DB storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def store_refresh_token(db: Session, user_id: int, token: str) -> None:
    """Persist a hashed refresh token so it can be revoked later."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(token),
        expires_at=expire,
    ))
    db.commit()


def verify_and_rotate_refresh_token(
    db: Session, raw_token: str
) -> tuple[User, str, str]:
    """
    Validate a refresh token against the DB, then rotate it.

    Returns (user, new_access_token, new_refresh_token).
    Raises HTTP 401 on any failure so the caller can propagate it directly.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Decode the JWT (validates signature + expiry)
    try:
        payload = jwt.decode(raw_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id_str = payload.get("sub")
        token_type = payload.get("type")
        if not user_id_str or token_type != "refresh":
            raise credentials_error
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_error

    # 2. Check the hash exists in DB (not revoked / not rotated away)
    token_hash = _hash_token(raw_token)
    db_token = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.user_id == user_id,
    ).first()
    if not db_token:
        raise credentials_error

    # 3. Look up the user
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise credentials_error

    # 4. Rotate — delete old token, issue new pair
    db.delete(db_token)
    new_access = create_access_token(data={"sub": str(user_id)})
    new_refresh = create_refresh_token(data={"sub": str(user_id)})
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(new_refresh),
        expires_at=expire,
    ))
    db.commit()

    return user, new_access, new_refresh


def revoke_user_refresh_tokens(db: Session, user_id: int) -> int:
    """Delete all stored refresh tokens for a user (called on logout)."""
    deleted = db.query(RefreshToken).filter(RefreshToken.user_id == user_id).delete()
    db.commit()
    return deleted


async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user if authenticated, None if guest (bearer header or cookie)"""
    token = _token_from_request(request, credentials)
    if not token:
        return None

    try:
        payload = decode_token(token)
        user_id_str = payload.get("sub")
        token_type = payload.get("type")
        
        if not user_id_str or token_type != "access":
            return None
        
        user_id = int(user_id_str)
        user = db.query(User).filter(User.id == user_id).first()
        
        if user and user.is_active:
            return user
        return None
    except Exception as e:
        logger.debug(f"Optional auth failed (guest user): {e}")
        return None
