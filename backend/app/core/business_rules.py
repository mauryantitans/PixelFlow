"""
Centralized Business Rules Configuration for PixelFlow

Control all limits, quotas, retention policies, and business logic from one place.
Modify these values to adjust application behavior.
"""

from datetime import timedelta
from typing import Optional

# =============================================================================
# USER LIMITS & QUOTAS
# =============================================================================

class UserLimits:
    """Limits and quotas per user type"""
    
    # -------------------------------------------------------------------------
    # SAVED PIPELINES LIMITS
    # -------------------------------------------------------------------------
    
    # Maximum saved pipelines per user type
    GUEST_MAX_PIPELINES = 0  # Guests can't save pipelines
    FREE_USER_MAX_PIPELINES = 3  # Free users limited to 3 pipelines
    PREMIUM_USER_MAX_PIPELINES = 100  # Premium users (future feature)
    ADMIN_MAX_PIPELINES = None  # Admins have unlimited (None = no limit)
    
    # -------------------------------------------------------------------------
    # STORAGE QUOTAS (in MB)
    # -------------------------------------------------------------------------
    
    # Maximum total storage per user type
    GUEST_STORAGE_QUOTA_MB = 50  # 50MB for guest users
    FREE_USER_STORAGE_QUOTA_MB = 500  # 500MB for registered users
    PREMIUM_USER_STORAGE_QUOTA_MB = 5000  # 5GB for premium users (future)
    ADMIN_STORAGE_QUOTA_MB = None  # Unlimited for admins
    
    # Maximum single image size (applies to all)
    MAX_IMAGE_SIZE_MB = 50  # 50MB per image
    
    # -------------------------------------------------------------------------
    # UPLOAD LIMITS
    # -------------------------------------------------------------------------
    
    # Maximum images uploaded at once
    MAX_IMAGES_PER_UPLOAD = 20
    
    # Maximum images per session
    GUEST_MAX_IMAGES_PER_SESSION = 50
    FREE_USER_MAX_IMAGES_PER_SESSION = 100
    PREMIUM_USER_MAX_IMAGES_PER_SESSION = 500


# =============================================================================
# IMAGE RETENTION POLICIES
# =============================================================================

class ImageRetention:
    """How long to keep different types of images - Real-world approach"""
    
    # -------------------------------------------------------------------------
    # UPLOADED IMAGES - Keep until quota exceeded or manual deletion
    # -------------------------------------------------------------------------
    
    # Keep indefinitely (cleanup only removes orphaned after 7 days)
    GUEST_UPLOAD_RETENTION = timedelta(days=30)    # Keep guest images 30 days
    FREE_USER_UPLOAD_RETENTION = timedelta(days=90)  # Keep user images 90 days
    PREMIUM_USER_UPLOAD_RETENTION = timedelta(days=365)  # Keep premium 1 year
    
    # Delete uploads immediately when user manually deletes them
    DELETE_ON_USER_REQUEST = True
    
    # -------------------------------------------------------------------------
    # PROCESSED IMAGES - Can regenerate, so delete more aggressively  
    # -------------------------------------------------------------------------
    
    # Processed results can be regenerated, so shorter retention
    GUEST_PROCESSED_RETENTION = timedelta(days=7)   # 7 days for guests
    FREE_USER_PROCESSED_RETENTION = timedelta(days=30)  # 30 days for users
    PREMIUM_USER_PROCESSED_RETENTION = timedelta(days=90)  # 90 days for premium
    
    # Delete processed images when user clears results
    DELETE_PROCESSED_ON_CLEAR = True
    
    # Delete processed images when original is deleted
    DELETE_PROCESSED_WITH_ORIGINAL = True
    
    # -------------------------------------------------------------------------
    # INTERMEDIATE IMAGES
    # -------------------------------------------------------------------------
    
    # Intermediate pipeline steps (usually temporary)
    KEEP_INTERMEDIATE_STEPS = True  # Whether to save intermediate results
    INTERMEDIATE_RETENTION = timedelta(hours=24)  # Clean up after 24 hours


# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

class SessionPolicy:
    """Session lifetime and cleanup rules"""
    
    # How long sessions remain active
    GUEST_SESSION_LIFETIME = timedelta(days=30)   # Keep for 30 days
    USER_SESSION_LIFETIME = timedelta(days=30)    # Keep for 30 days
    
    # Active session definition (for admin panel display)
    # Active = any recorded activity (upload, opening the workspace, processing)
    # in this window. There is no heartbeat any more, so it is wider than 5 min.
    ACTIVE_SESSION_WINDOW = timedelta(minutes=15)
    
    # How often to run cleanup job
    CLEANUP_INTERVAL = timedelta(hours=24)  # Run daily
    
    # Delete session immediately on user logout
    DELETE_SESSION_ON_LOGOUT = False  # Keep for history/analytics
    
    # Grace period after session expiry (before deletion)
    SESSION_GRACE_PERIOD = timedelta(hours=2)
    
    # Delete sessions older than X days (background job)
    DELETE_SESSIONS_OLDER_THAN_DAYS = 30
    
    # Maximum concurrent sessions per user
    MAX_SESSIONS_PER_USER = 10  # Allow multiple devices


# =============================================================================
# CLEANUP TRIGGERS
# =============================================================================

class CleanupTriggers:
    """When to trigger different types of cleanup"""
    
    # -------------------------------------------------------------------------
    # AUTOMATIC CLEANUP (Background Jobs)
    # -------------------------------------------------------------------------
    
    # Run automatic cleanup tasks
    ENABLE_AUTO_CLEANUP = True
    
    # What to clean automatically
    CLEAN_EXPIRED_SESSIONS = True
    CLEAN_OLD_UPLOADS = True
    CLEAN_OLD_PROCESSED = True
    CLEAN_ORPHANED_IMAGES = True  # Images with no session
    
    # -------------------------------------------------------------------------
    # MANUAL CLEANUP (User Actions)
    # -------------------------------------------------------------------------
    
    # When user clicks "Clear/Reset" button
    ON_CLEAR_BUTTON = {
        'delete_processed': True,  # Delete processed results
        'delete_uploads': False,  # Keep original uploads
        'delete_intermediates': True  # Delete intermediate steps
    }
    
    # When user deletes an image
    ON_IMAGE_DELETE = {
        'delete_processed': True,  # Delete all processed versions
        'delete_intermediates': True  # Delete intermediate steps
    }
    
    # When user logs out - KEEP EVERYTHING for user to resume later
    ON_LOGOUT = {
        'delete_session': False,      # Keep session for history/analytics
        'delete_processed': True,     # Delete processed (can regenerate)
        'delete_uploads': False,      # Keep uploads (user's data)
        'keep_pipelines': True        # Keep saved pipelines
    }
    
    # When tab/browser closes - DON'T DELETE (unreliable detection)
    ON_TAB_CLOSE = {
        'delete_all_images': False,  # Keep images (real-world approach)
        'delete_session': False,     # Keep session
        'keep_pipelines': True
    }
    
    # When session expires - Background job handles this
    ON_SESSION_EXPIRY = {
        'delete_all_images': False,   # Keep images until quota issues
        'grace_period_hours': 2
    }


# =============================================================================
# PROCESSING LIMITS
# =============================================================================

class ProcessingLimits:
    """Limits on image processing"""
    
    # Maximum pipeline steps per user type
    GUEST_MAX_PIPELINE_STEPS = 10
    FREE_USER_MAX_PIPELINE_STEPS = 20
    PREMIUM_USER_MAX_PIPELINE_STEPS = 50
    
    # Processing timeout (seconds)
    PROCESSING_TIMEOUT = 300  # 5 minutes max per image
    
    # Batch processing limits
    MAX_BATCH_SIZE = 20  # Maximum images in one batch
    
    # Rate limiting for processing
    GUEST_PROCESSING_PER_HOUR = 50  # 50 processing requests per hour
    FREE_USER_PROCESSING_PER_HOUR = 200
    PREMIUM_USER_PROCESSING_PER_HOUR = None  # Unlimited


# =============================================================================
# STORAGE OPTIMIZATION
# =============================================================================

class StorageOptimization:
    """Image storage and optimization settings"""
    
    # Storage quota behavior
    DELETE_OLDEST_ON_QUOTA = False  # Don't auto-delete, throw error instead
    WARN_AT_PERCENTAGE = 80  # Warn when 80% of quota used
    
    # Compress images before storing
    COMPRESS_UPLOADS = True
    UPLOAD_COMPRESSION_QUALITY = 95  # JPEG quality (1-100)
    
    # Compress processed images
    COMPRESS_PROCESSED = True
    PROCESSED_COMPRESSION_QUALITY = 90
    
    # Thumbnail settings
    THUMBNAIL_SIZE = (150, 150)
    THUMBNAIL_QUALITY = 85
    
    # Convert all images to JPEG for consistency
    FORCE_JPEG_FORMAT = True


# =============================================================================
# NOTIFICATION SETTINGS
# =============================================================================

class UserNotifications:
    """When to notify users about cleanup"""
    
    # Warn users before deletion
    WARN_BEFORE_DELETION = True
    WARNING_DAYS_BEFORE = 1  # Warn 1 day before deletion
    
    # Email notifications (future feature)
    EMAIL_ON_DELETION = False
    EMAIL_ON_QUOTA_WARNING = False


# =============================================================================
# ADMIN CONTROLS
# =============================================================================

class AdminControls:
    """Admin-level controls"""
    
    # Global storage limit (entire database)
    GLOBAL_STORAGE_LIMIT_GB = 100  # 100GB total
    
    # Action when global limit reached
    PAUSE_UPLOADS_ON_LIMIT = True
    
    # Manual cleanup controls
    ALLOW_ADMIN_FORCE_CLEANUP = True
    
    # View all users' images (privacy consideration)
    ADMIN_CAN_VIEW_ALL_IMAGES = False  # For privacy


# =============================================================================
# QUICK PRESETS
# =============================================================================

class CleanupPresets:
    """Pre-configured cleanup strategies"""
    
    @staticmethod
    def apply_aggressive_cleanup():
        """Aggressive cleanup - save storage, delete quickly"""
        ImageRetention.GUEST_UPLOAD_RETENTION = timedelta(hours=12)
        ImageRetention.FREE_USER_UPLOAD_RETENTION = timedelta(days=3)
        ImageRetention.GUEST_PROCESSED_RETENTION = timedelta(minutes=30)
        ImageRetention.FREE_USER_PROCESSED_RETENTION = timedelta(hours=12)
        SessionPolicy.GUEST_SESSION_LIFETIME = timedelta(hours=12)
        
    @staticmethod
    def apply_generous_retention():
        """Keep images longer - better UX, more storage"""
        ImageRetention.GUEST_UPLOAD_RETENTION = timedelta(days=3)
        ImageRetention.FREE_USER_UPLOAD_RETENTION = timedelta(days=14)
        ImageRetention.GUEST_PROCESSED_RETENTION = timedelta(hours=24)
        ImageRetention.FREE_USER_PROCESSED_RETENTION = timedelta(days=3)
        SessionPolicy.GUEST_SESSION_LIFETIME = timedelta(days=2)
        
    @staticmethod
    def apply_balanced():
        """Balanced approach - default settings"""
        # Current defaults are balanced
        pass


# =============================================================================
# FEATURE FLAGS
# =============================================================================

class FeatureFlags:
    """Enable/disable features globally"""
    
    # Image storage
    ENABLE_IMAGE_PERSISTENCE = True  # Store images in database
    ENABLE_PROCESSED_IMAGE_STORAGE = True  # Store processed results
    
    # Cleanup features
    ENABLE_AUTOMATIC_CLEANUP = True
    ENABLE_MANUAL_CLEANUP = True
    
    # User features
    ENABLE_PIPELINE_SAVING = True
    ENABLE_PIPELINE_SHARING = True
    ENABLE_PUBLIC_PIPELINES = True
    
    # OAuth
    ENABLE_GOOGLE_SIGNIN = True
    ENABLE_GITHUB_SIGNIN = False  # Future
    
    # Premium features (future)
    ENABLE_PREMIUM_TIER = False


# =============================================================================
# APPLY PRESET (UNCOMMENT TO USE)
# =============================================================================

# Uncomment ONE of these to apply a preset configuration:
# CleanupPresets.apply_aggressive_cleanup()  # Save storage
# CleanupPresets.apply_generous_retention()  # Better UX
# CleanupPresets.apply_balanced()  # Current defaults

# Or customize individual settings above
