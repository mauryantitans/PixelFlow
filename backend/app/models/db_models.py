from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, JSON, Float, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import false, func
from datetime import datetime
from ..core.database import Base


class RefreshToken(Base):
    """Persisted refresh tokens — enables server-side revocation on logout."""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Store a SHA-256 hash, not the raw token, so a DB breach can't reuse tokens.
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")

class User(Base):
    """User account model"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # Nullable for OAuth users
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    
    # OAuth fields
    oauth_provider = Column(String, nullable=True)  # 'google', 'github', etc.
    oauth_id = Column(String, nullable=True, index=True)  # OAuth provider's user ID
    profile_picture = Column(String, nullable=True)  # URL to profile picture

    # Email verification (see utils/account_tokens.py). Google sign-ins are verified.
    email_verified = Column(Boolean, nullable=False, default=False, server_default=false())
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    # Appearance and other UI preferences, e.g. {"ui_theme": "verdant", "mode": "dark"}
    preferences = Column(JSON, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    saved_pipelines = relationship("SavedPipeline", back_populates="user", cascade="all, delete-orphan")
    processing_history = relationship("ProcessingHistory", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")


class LoginAttempt(Base):
    """Track failed login attempts for security"""
    __tablename__ = "login_attempts"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    success = Column(Boolean, default=False)
    attempt_time = Column(DateTime(timezone=True), server_default=func.now())
    failure_reason = Column(String, nullable=True)


class SavedPipeline(Base):
    """Saved image processing pipeline"""
    __tablename__ = "saved_pipelines"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    pipeline_data = Column(JSON, nullable=False)  # Stores the pipeline steps as JSON
    is_public = Column(Boolean, default=False)
    is_template = Column(Boolean, default=False)
    category = Column(String, nullable=True)  # For organizing pipelines
    tags = Column(JSON, nullable=True)  # Array of tags
    thumbnail_data = Column(Text, nullable=True)  # Base64 thumbnail
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="saved_pipelines")
    processing_history = relationship("ProcessingHistory", back_populates="pipeline")
    # Share links die with the pipeline.
    shares = relationship("SharedPipeline", cascade="all, delete-orphan")


class ProcessingHistory(Base):
    """History of image processing operations"""
    __tablename__ = "processing_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pipeline_id = Column(Integer, ForeignKey("saved_pipelines.id"), nullable=True)
    
    # Processing details
    image_count = Column(Integer, nullable=False)
    pipeline_data = Column(JSON, nullable=False)  # Snapshot of pipeline used
    
    # Performance metrics
    total_processing_time = Column(Float, nullable=False)
    average_time_per_image = Column(Float, nullable=False)
    step_timings = Column(JSON, nullable=True)  # Detailed timing for each step
    
    # Result information
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    
    # Metadata
    session_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="processing_history")
    pipeline = relationship("SavedPipeline", back_populates="processing_history")


class APIKey(Base):
    """API keys for external access"""
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    key_name = Column(String, nullable=False)
    key_hash = Column(String, unique=True, nullable=False)
    key_prefix = Column(String, nullable=False)  # First 8 chars for identification
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="api_keys")


class SharedPipeline(Base):
    """Shared pipelines between users"""
    __tablename__ = "shared_pipelines"
    
    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("saved_pipelines.id"), nullable=False)
    share_token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Session(Base):
    """Track user sessions across devices/tabs"""
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True, index=True)  # Session ID from frontend
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Optional for guest users
    
    # Session metadata
    device_info = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_active = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    
    # Relationships
    uploaded_images = relationship("UploadedImage", back_populates="session", cascade="all, delete-orphan")


class UploadedImage(Base):
    """Store uploaded images in database"""
    __tablename__ = "uploaded_images"
    
    id = Column(String, primary_key=True, index=True)  # UUID from frontend
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Optional for guest users
    
    # Image data
    filename = Column(String, nullable=False)
    # Original image bytes: in image_data (STORAGE_BACKEND=database) or in object
    # storage under storage_key (STORAGE_BACKEND=s3). Read/write them only via
    # app.storage.images (read_image_bytes / save_image_bytes).
    image_data = Column(LargeBinary, nullable=True)
    storage_key = Column(String, nullable=True)
    thumbnail_data = Column(LargeBinary, nullable=True)  # Thumbnail bytes (always in the DB)
    
    # Metadata
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    format = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    mime_type = Column(String, nullable=False)
    
    # Timestamps
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    last_accessed = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    session = relationship("Session", back_populates="uploaded_images")
    processed_images = relationship("ProcessedImage", back_populates="original_image", cascade="all, delete-orphan")


class ProcessedImage(Base):
    """Store processed images in database"""
    __tablename__ = "processed_images"
    
    id = Column(String, primary_key=True, index=True)  # UUID
    session_id = Column(String, index=True, nullable=False)
    original_image_id = Column(String, ForeignKey("uploaded_images.id"), nullable=False)
    
    # Processed data (image_data or an object under storage_key; see UploadedImage)
    image_data = Column(LargeBinary, nullable=True)
    storage_key = Column(String, nullable=True)
    
    # Processing details
    pipeline_data = Column(JSON, nullable=False)
    step_index = Column(Integer, nullable=True)  # Which step this is from (-1 for final)
    is_final = Column(Boolean, default=False)
    
    # Timestamps
    processed_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    original_image = relationship("UploadedImage", back_populates="processed_images")


class SystemSettings(Base):
    """Store system-wide configurable settings"""
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True)
    
    # Admin Security
    admin_pin_hash = Column(String, nullable=True)  # Hashed PIN for sensitive data access
    
    # User Limits
    free_user_max_pipelines = Column(Integer, default=3)
    guest_storage_quota_mb = Column(Integer, default=50)
    free_user_storage_quota_mb = Column(Integer, default=500)
    guest_max_images_per_session = Column(Integer, default=50)
    free_user_max_images_per_session = Column(Integer, default=100)
    max_images_per_upload = Column(Integer, default=20)
    
    # Image Retention (in hours)
    guest_upload_retention_hours = Column(Integer, default=24)
    free_user_upload_retention_days = Column(Integer, default=7)
    guest_processed_retention_hours = Column(Integer, default=1)
    free_user_processed_retention_hours = Column(Integer, default=24)
    
    # Session Policy (in hours)
    guest_session_lifetime_hours = Column(Integer, default=24)
    user_session_lifetime_days = Column(Integer, default=7)
    session_grace_period_hours = Column(Integer, default=2)
    
    # Cleanup Triggers
    enable_auto_cleanup = Column(Boolean, default=True)
    cleanup_on_logout = Column(Boolean, default=True)
    cleanup_on_tab_close = Column(Boolean, default=True)
    delete_oldest_on_quota = Column(Boolean, default=False)
    warn_at_percentage = Column(Integer, default=80)
    
    # Timestamps
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)


# Deleting image rows (also by cascade) removes their stored objects after commit.
import app.storage.images  # noqa: E402,F401
