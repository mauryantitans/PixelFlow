"""
System Settings Manager for PixelFlow

Manages editable system settings stored in the database.
Admin can change these from the admin panel UI.
"""

from sqlalchemy.orm import Session
from app.models.db_models import SystemSettings
from datetime import timedelta
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Cache for settings to avoid database query on every request
_settings_cache: Optional[SystemSettings] = None
_cache_timestamp = 0


def get_settings(db: Session, use_cache: bool = True) -> SystemSettings:
    """
    Get system settings from database
    Creates default settings if none exist
    """
    # Don't use cache - always get fresh from DB to avoid session issues
    settings = db.query(SystemSettings).first()
    
    if not settings:
        # Create default settings
        settings = SystemSettings(
            id=1,  # Only one settings record
            free_user_max_pipelines=3,
            guest_storage_quota_mb=50,
            free_user_storage_quota_mb=500,
            guest_max_images_per_session=50,
            free_user_max_images_per_session=100,
            max_images_per_upload=20,
            guest_upload_retention_hours=24,
            free_user_upload_retention_days=7,
            guest_processed_retention_hours=1,
            free_user_processed_retention_hours=24,
            guest_session_lifetime_hours=24,
            user_session_lifetime_days=7,
            session_grace_period_hours=2,
            enable_auto_cleanup=True,
            cleanup_on_logout=True,
            cleanup_on_tab_close=True,
            delete_oldest_on_quota=False,
            warn_at_percentage=80
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
        logger.info("Created default system settings")
    
    return settings


# Validation rules for admin-editable settings: (kind, minimum, maximum).
# Every number is a whole number; 0 is only allowed where it means "none".
SETTING_RULES = {
    'free_user_max_pipelines': ('int', 1, 1000),
    'guest_storage_quota_mb': ('int', 1, 100_000),
    'free_user_storage_quota_mb': ('int', 1, 100_000),
    'guest_max_images_per_session': ('int', 1, 10_000),
    'free_user_max_images_per_session': ('int', 1, 10_000),
    'max_images_per_upload': ('int', 1, 100),
    'guest_upload_retention_hours': ('int', 1, 24 * 365),
    'free_user_upload_retention_days': ('int', 1, 3650),
    'guest_processed_retention_hours': ('int', 1, 24 * 365),
    'free_user_processed_retention_hours': ('int', 1, 24 * 365),
    'guest_session_lifetime_hours': ('int', 1, 24 * 365),
    'user_session_lifetime_days': ('int', 1, 3650),
    'session_grace_period_hours': ('int', 0, 24 * 30),
    'warn_at_percentage': ('int', 1, 100),
    'enable_auto_cleanup': ('bool', None, None),
    'cleanup_on_logout': ('bool', None, None),
    'cleanup_on_tab_close': ('bool', None, None),
    'delete_oldest_on_quota': ('bool', None, None),
}


def validate_setting(field: str, value):
    """Return the normalised value or raise ValueError with a readable message.

    Stops bad values (e.g. an emptied input that arrives as null/NaN, negative
    numbers, strings) from being stored and later crashing cleanup or quota
    checks.
    """
    kind, lo, hi = SETTING_RULES[field]
    if kind == 'bool':
        if not isinstance(value, bool):
            raise ValueError(f"{field} must be true or false")
        return value
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{field} must be a whole number")
    if isinstance(value, float):
        if value != value or not value.is_integer():  # NaN or fractional
            raise ValueError(f"{field} must be a whole number")
        value = int(value)
    if not isinstance(value, int):
        raise ValueError(f"{field} must be a whole number")
    if not lo <= value <= hi:
        raise ValueError(f"{field} must be between {lo} and {hi}")
    return value


def update_settings(db: Session, updates: dict, user_id: int) -> SystemSettings:
    """
    Update system settings
    Only admin users should be able to call this
    """
    global _settings_cache
    
    settings = get_settings(db, use_cache=False)
    
    # Update allowed fields
    allowed_fields = {
        'free_user_max_pipelines',
        'guest_storage_quota_mb',
        'free_user_storage_quota_mb',
        'guest_max_images_per_session',
        'free_user_max_images_per_session',
        'max_images_per_upload',
        'guest_upload_retention_hours',
        'free_user_upload_retention_days',
        'guest_processed_retention_hours',
        'free_user_processed_retention_hours',
        'guest_session_lifetime_hours',
        'user_session_lifetime_days',
        'session_grace_period_hours',
        'enable_auto_cleanup',
        'cleanup_on_logout',
        'cleanup_on_tab_close',
        'delete_oldest_on_quota',
        'warn_at_percentage'
    }
    
    # Validate everything first so a bad value doesn't leave a half-applied update.
    clean = {}
    for field, value in updates.items():
        if field in allowed_fields and hasattr(settings, field):
            clean[field] = validate_setting(field, value)

    for field, value in clean.items():
        setattr(settings, field, value)
        logger.info(f"Setting updated: {field} = {value} by user {user_id}")
    
    settings.updated_by = user_id
    
    db.commit()
    db.refresh(settings)
    
    # Invalidate cache
    _settings_cache = None
    
    logger.info(f"System settings updated by user {user_id}")
    
    return settings


def invalidate_cache():
    """Invalidate settings cache (call after updates)"""
    global _settings_cache
    _settings_cache = None


def get_retention_policy(db: Session) -> dict:
    """
    Derive retention / session-lifetime timedeltas from the editable DB settings.

    This is the single source of truth for these values — enforcement code
    (cleanup service, session creation) must read here rather than from the
    hardcoded defaults in app/core/business_rules.py, otherwise admin-panel
    changes silently have no effect.
    """
    s = get_settings(db)
    return {
        "guest_upload": timedelta(hours=s.guest_upload_retention_hours),
        "user_upload": timedelta(days=s.free_user_upload_retention_days),
        "guest_processed": timedelta(hours=s.guest_processed_retention_hours),
        "user_processed": timedelta(hours=s.free_user_processed_retention_hours),
        "session_grace": timedelta(hours=s.session_grace_period_hours),
        "guest_session_lifetime": timedelta(hours=s.guest_session_lifetime_hours),
        "user_session_lifetime": timedelta(days=s.user_session_lifetime_days),
    }
