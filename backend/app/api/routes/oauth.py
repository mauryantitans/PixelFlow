"""
Google OAuth Authentication Routes for PixelFlow

Handles Google Sign-In flow:
1. User clicks "Sign in with Google"
2. Redirect to Google login
3. Google redirects back with authorization code
4. Exchange code for user info
5. Create or login user
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import logging

from ...core.database import get_db
from ...core.config import settings
from ...models.db_models import User
from ...utils.auth import (
    create_access_token, create_refresh_token, store_refresh_token, set_auth_cookies,
)
from ...utils.security import log_login_attempt
from ...utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


def generate_username_from_email(email: str, db: Session) -> str:
    """Generate a unique username from email"""
    base_username = email.split('@')[0].lower()
    username = base_username
    counter = 1
    
    # Keep trying until we find a unique username
    while db.query(User).filter(User.username == username).first():
        username = f"{base_username}{counter}"
        counter += 1
    
    return username


@router.get("/google/login")
async def google_login():
    """Initiate Google OAuth flow"""
    
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth not configured. Please set GOOGLE_CLIENT_ID in environment."
        )
    
    # Google OAuth authorization URL
    google_auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={settings.GOOGLE_REDIRECT_URI}&"
        "response_type=code&"
        "scope=openid email profile&"
        "access_type=offline&"
        "prompt=consent"
    )
    
    logger.info("Redirecting to Google OAuth")
    return RedirectResponse(url=google_auth_url)


@router.post("/google/callback")
async def google_callback(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """Handle Google OAuth callback"""
    
    try:
        # Get the request body
        body = await request.json()
        credential = body.get("credential")
        
        if not credential:
            raise HTTPException(status_code=400, detail="No credential provided")
        
        # Verify the Google token
        try:
            idinfo = id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                settings.GOOGLE_CLIENT_ID
            )
            
            # Verify token is for our app
            if idinfo['aud'] != settings.GOOGLE_CLIENT_ID:
                raise ValueError('Invalid audience')
            
            # Extract user info from Google
            google_id = idinfo['sub']
            email = idinfo.get('email')
            email_verified = idinfo.get('email_verified', False)
            name = idinfo.get('name', '')
            picture = idinfo.get('picture', '')
            
            if not email or not email_verified:
                raise HTTPException(
                    status_code=400,
                    detail="Email not verified by Google"
                )
            
            logger.info(f"Google OAuth successful for: {email}")
            
        except ValueError as e:
            logger.error(f"Invalid Google token: {e}")
            raise HTTPException(status_code=400, detail="Invalid Google token")
        
        # Get client IP for logging
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        # Check if user exists by OAuth ID
        user = db.query(User).filter(
            User.oauth_provider == "google",
            User.oauth_id == google_id
        ).first()
        
        # If not found by OAuth ID, check by email
        if not user:
            user = db.query(User).filter(User.email == email).first()
            
            if user:
                # Existing user - link Google account
                logger.info(f"Linking Google account to existing user: {email}")
                user.oauth_provider = "google"
                user.oauth_id = google_id
                user.profile_picture = picture
            else:
                # New user - create account
                logger.info(f"Creating new user from Google: {email}")
                username = generate_username_from_email(email, db)
                
                user = User(
                    email=email,
                    username=username,
                    full_name=name,
                    oauth_provider="google",
                    oauth_id=google_id,
                    profile_picture=picture,
                    is_active=True,
                    hashed_password=None  # OAuth users don't have passwords
                )
                db.add(user)
        
        # Google has verified the address (checked above).
        if not user.email_verified:
            user.email_verified = True
            user.email_verified_at = utcnow()

        # Save changes
        db.commit()
        db.refresh(user)
        
        # Log successful login
        log_login_attempt(db, user.email, True, ip_address, user_agent)
        
        # Create tokens, persist the refresh token (so it can be rotated/revoked
        # like password logins), and deliver them as httpOnly cookies.
        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        store_refresh_token(db, user.id, refresh_token)
        set_auth_cookies(response, access_token, refresh_token)

        logger.info(f"OAuth login successful: {user.email}")

        return {
            "success": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": user.full_name,
                "profile_picture": user.profile_picture,
                "is_admin": user.is_admin,
                "is_active": user.is_active,
                "email_verified": bool(user.email_verified),
                "created_at": user.created_at.isoformat() if user.created_at else None,
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Authentication failed: {str(e)}"
        )


@router.get("/google/status")
async def google_oauth_status():
    """Check if Google OAuth is configured"""
    return {
        "configured": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
        "client_id_set": bool(settings.GOOGLE_CLIENT_ID),
        "client_secret_set": bool(settings.GOOGLE_CLIENT_SECRET),
        "redirect_uri": settings.GOOGLE_REDIRECT_URI
    }
