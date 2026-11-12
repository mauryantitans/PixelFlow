"""
Auto-create first admin user if none exists

This runs on application startup and creates a default admin
if no admin users exist in the database.
"""

import os
import logging
from sqlalchemy.orm import Session
from app.models.db_models import User
from app.utils.auth import get_password_hash
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

def create_first_admin_if_needed(db: Session) -> bool:
    """
    Create first admin user if no admins exist.
    Uses environment variables for credentials.
    
    Set these environment variables in Render:
    - ADMIN_EMAIL (required)
    - ADMIN_PASSWORD (required)
    - ADMIN_USERNAME (optional, defaults to 'admin')
    - ADMIN_FULL_NAME (optional, defaults to 'Admin User')
    
    Returns True if admin was created, False otherwise.
    """
    try:
        # Check if any admin users exist
        admin_count = db.query(User).filter(User.is_admin == True).count()
        
        if admin_count > 0:
            logger.info(f"Admin users already exist ({admin_count} found)")
            return False
        
        # Get admin credentials from environment
        admin_email = os.environ.get("ADMIN_EMAIL")
        admin_password = os.environ.get("ADMIN_PASSWORD")
        admin_username = os.environ.get("ADMIN_USERNAME", "admin")
        admin_full_name = os.environ.get("ADMIN_FULL_NAME", "Admin User")
        
        # Check if credentials are provided
        if not admin_email or not admin_password:
            logger.warning(
                "No admin users exist, but ADMIN_EMAIL or ADMIN_PASSWORD not set. "
                "Set these environment variables to auto-create the first admin."
            )
            return False
        
        # Check if user with this email/username already exists
        existing = db.query(User).filter(
            (User.email == admin_email) | (User.username == admin_username)
        ).first()
        
        if existing:
            logger.warning(
                f"Cannot create admin: User with email '{admin_email}' "
                f"or username '{admin_username}' already exists"
            )
            return False
        
        # Create admin user
        logger.info(f"Creating first admin user: {admin_email}")
        
        admin_user = User(
            email=admin_email,
            username=admin_username,
            full_name=admin_full_name,
            hashed_password=get_password_hash(admin_password),
            is_active=True,
            is_admin=True,
            oauth_provider=None,
            # The address comes from the deployer's own ADMIN_EMAIL setting.
            email_verified=True,
            email_verified_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc)
        )
        
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        logger.info(
            f"✅ First admin user created successfully!\n"
            f"   Email: {admin_user.email}\n"
            f"   Username: {admin_user.username}\n"
            f"   ID: {admin_user.id}\n"
            f"   You can now login at your frontend URL"
        )
        
        return True
        
    except Exception as e:
        logger.error(f"Error creating first admin user: {e}")
        db.rollback()
        return False
