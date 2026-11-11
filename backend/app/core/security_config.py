"""
Centralized Security Configuration for PixelFlow

All security-related settings in one place for easy management.
Modify these values to adjust security behavior across the entire application.
"""

from datetime import timedelta
from typing import List, Optional

# =============================================================================
# LOGIN SECURITY SETTINGS
# =============================================================================

class LoginSecurity:
    """Settings for login attempt tracking and account lockout"""
    
    # Maximum failed login attempts before account lockout
    MAX_ATTEMPTS: int = 5
    
    # How long to lock out accounts after max failed attempts
    LOCKOUT_DURATION: timedelta = timedelta(minutes=15)
    
    # Whether to track IP addresses for login attempts
    TRACK_IP_ADDRESSES: bool = True
    
    # Whether to track user agents for login attempts
    TRACK_USER_AGENTS: bool = True
    
    # Clear failed attempts after successful login
    CLEAR_ON_SUCCESS: bool = True


# =============================================================================
# RATE LIMITING SETTINGS
# =============================================================================

class RateLimiting:
    """Settings for API rate limiting to prevent abuse"""
    
    # Enable/disable rate limiting globally
    ENABLED: bool = True
    
    # Default rate limits (requests per time window)
    DEFAULT_REQUESTS: int = 100
    DEFAULT_WINDOW: timedelta = timedelta(minutes=1)  # 100 requests per minute
    
    # Rate limit for authentication endpoints (stricter)
    AUTH_REQUESTS: int = 10
    AUTH_WINDOW: timedelta = timedelta(minutes=1)  # 10 requests per minute
    
    # Rate limit for image upload endpoints
    UPLOAD_REQUESTS: int = 30
    UPLOAD_WINDOW: timedelta = timedelta(minutes=1)  # 30 uploads per minute
    
    # Rate limit for processing endpoints
    PROCESS_REQUESTS: int = 50
    PROCESS_WINDOW: timedelta = timedelta(minutes=1)  # 50 processing requests per minute
    
    # Rate limit for admin endpoints (most restrictive)
    ADMIN_REQUESTS: int = 30
    ADMIN_WINDOW: timedelta = timedelta(minutes=1)  # 30 requests per minute
    
    # Paths that are never rate limited. The frontend's connection indicator
    # polls the health check; behind Render's proxy every visitor shares one
    # client IP, so counting it would put all users in the same bucket.
    EXEMPTED_PATHS: List[str] = ["/health", "/api/health"]

    # Exempted IPs (won't be rate limited)
    EXEMPTED_IPS: List[str] = [
        "127.0.0.1",
        "localhost"
    ]
    
    # Response when rate limit is exceeded
    RATE_LIMIT_MESSAGE: str = "Too many requests. Please slow down and try again later."


# =============================================================================
# SECURITY HEADERS
# =============================================================================

class SecurityHeaders:
    """Settings for HTTP security headers"""
    
    # Enable/disable security headers
    ENABLED: bool = True
    
    # Content Security Policy - Controls which resources can be loaded
    # Modify this carefully as it can break your frontend if too strict
    CONTENT_SECURITY_POLICY: str = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' http://localhost:* https://*;"
    )
    
    # Strict-Transport-Security - Force HTTPS (only enable in production with HTTPS)
    # Set to None to disable, or use: "max-age=31536000; includeSubDomains"
    HSTS: Optional[str] = None  # Enable this only when you have HTTPS configured
    
    # X-Content-Type-Options - Prevent MIME type sniffing
    X_CONTENT_TYPE_OPTIONS: str = "nosniff"
    
    # X-Frame-Options - Prevent clickjacking attacks
    X_FRAME_OPTIONS: str = "DENY"  # Options: DENY, SAMEORIGIN, or ALLOW-FROM uri
    
    # X-XSS-Protection - Enable browser XSS protection
    X_XSS_PROTECTION: str = "1; mode=block"
    
    # Referrer-Policy - Control referrer information
    REFERRER_POLICY: str = "strict-origin-when-cross-origin"
    
    # Permissions-Policy - Control browser features
    PERMISSIONS_POLICY: str = (
        "geolocation=(), "
        "microphone=(), "
        "camera=(), "
        "payment=(), "
        "usb=(), "
        "magnetometer=(), "
        "gyroscope=(), "
        "accelerometer=()"
    )


# =============================================================================
# CORS SETTINGS
# =============================================================================

class CORSSettings:
    """Settings for Cross-Origin Resource Sharing"""
    
    # Development origins (always allowed)
    DEV_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite default
        "http://127.0.0.1:5173"
    ]
    
    # Production origins (add your production domains here)
    PROD_ORIGINS: List[str] = [
        # "https://pixelflow.yourdomain.com",
        # "https://www.pixelflow.yourdomain.com"
    ]
    
    # Whether to allow credentials (cookies, authorization headers)
    ALLOW_CREDENTIALS: bool = True
    
    # Allowed HTTP methods
    ALLOW_METHODS: List[str] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    
    # Allowed headers
    ALLOW_HEADERS: List[str] = ["*"]
    
    # Headers exposed to the browser
    EXPOSE_HEADERS: List[str] = ["Content-Range", "X-Total-Count"]


# =============================================================================
# PASSWORD POLICY
# =============================================================================

class PasswordPolicy:
    """Settings for password requirements"""
    
    # Minimum password length
    MIN_LENGTH: int = 8
    
    # Maximum password length
    MAX_LENGTH: int = 128
    
    # Require at least one uppercase letter
    REQUIRE_UPPERCASE: bool = False
    
    # Require at least one lowercase letter
    REQUIRE_LOWERCASE: bool = False
    
    # Require at least one digit
    REQUIRE_DIGIT: bool = False
    
    # Require at least one special character
    REQUIRE_SPECIAL: bool = False
    
    # Special characters to check for (if REQUIRE_SPECIAL is True)
    SPECIAL_CHARACTERS: str = "!@#$%^&*()_+-=[]{}|;:,.<>?"


# =============================================================================
# SESSION SETTINGS
# =============================================================================

class SessionSecurity:
    """Settings for session management"""
    
    # Access token expiration (in minutes)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Refresh token expiration (in days)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # API key expiration (in days, None for no expiration)
    API_KEY_EXPIRE_DAYS: int = 365
    
    # Automatically log out inactive users (in minutes, None to disable)
    AUTO_LOGOUT_INACTIVE_MINUTES: Optional[int] = None


# =============================================================================
# LOGGING & MONITORING
# =============================================================================

class SecurityLogging:
    """Settings for security-related logging"""
    
    # Log all authentication attempts
    LOG_AUTH_ATTEMPTS: bool = True
    
    # Log all failed authentication attempts
    LOG_FAILED_AUTH: bool = True
    
    # Log IP addresses
    LOG_IP_ADDRESSES: bool = True
    
    # Log user agents
    LOG_USER_AGENTS: bool = True
    
    # Log rate limit violations
    LOG_RATE_LIMIT_VIOLATIONS: bool = True
    
    # Log admin actions
    LOG_ADMIN_ACTIONS: bool = True


# =============================================================================
# FILE UPLOAD SECURITY
# =============================================================================

class FileUploadSecurity:
    """Settings for file upload security"""
    
    # Maximum file size (in bytes)
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50 MB
    
    # Allowed file extensions (lowercase)
    ALLOWED_EXTENSIONS: set = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
    
    # Allowed MIME types
    ALLOWED_MIME_TYPES: set = {
        "image/jpeg",
        "image/png",
        "image/bmp",
        "image/tiff",
        "image/webp"
    }
    
    # Scan uploaded files for malware (requires additional setup)
    SCAN_UPLOADS: bool = False
    
    # Validate image integrity
    VALIDATE_IMAGE_INTEGRITY: bool = True


# =============================================================================
# ADMIN SECURITY
# =============================================================================

class AdminSecurity:
    """Settings specific to admin functionality"""
    
    # Require 2FA for admin accounts (not yet implemented)
    REQUIRE_2FA: bool = False
    
    # Log all admin actions
    LOG_ADMIN_ACTIONS: bool = True
    
    # Notify on admin login (not yet implemented)
    NOTIFY_ADMIN_LOGIN: bool = False
    
    # Admin session timeout (minutes, None for same as regular users)
    ADMIN_SESSION_TIMEOUT: Optional[int] = None


# =============================================================================
# QUICK PRESET CONFIGURATIONS
# =============================================================================

class SecurityPresets:
    """Pre-configured security levels for quick setup"""
    
    @staticmethod
    def apply_development() -> None:
        """Relaxed settings for development"""
        RateLimiting.ENABLED = False
        SecurityHeaders.ENABLED = False
        LoginSecurity.MAX_ATTEMPTS = 10
        LoginSecurity.LOCKOUT_DURATION = timedelta(minutes=5)
        
    @staticmethod
    def apply_production() -> None:
        """Strict settings for production"""
        RateLimiting.ENABLED = True
        SecurityHeaders.ENABLED = True
        SecurityHeaders.HSTS = "max-age=31536000; includeSubDomains"
        LoginSecurity.MAX_ATTEMPTS = 5
        LoginSecurity.LOCKOUT_DURATION = timedelta(minutes=15)
        PasswordPolicy.REQUIRE_UPPERCASE = True
        PasswordPolicy.REQUIRE_LOWERCASE = True
        PasswordPolicy.REQUIRE_DIGIT = True
        PasswordPolicy.MIN_LENGTH = 12
        
    @staticmethod
    def apply_high_security() -> None:
        """Very strict settings for high security environments"""
        RateLimiting.ENABLED = True
        RateLimiting.DEFAULT_REQUESTS = 50
        RateLimiting.AUTH_REQUESTS = 5
        SecurityHeaders.ENABLED = True
        SecurityHeaders.HSTS = "max-age=31536000; includeSubDomains; preload"
        SecurityHeaders.X_FRAME_OPTIONS = "DENY"
        LoginSecurity.MAX_ATTEMPTS = 3
        LoginSecurity.LOCKOUT_DURATION = timedelta(minutes=30)
        PasswordPolicy.REQUIRE_UPPERCASE = True
        PasswordPolicy.REQUIRE_LOWERCASE = True
        PasswordPolicy.REQUIRE_DIGIT = True
        PasswordPolicy.REQUIRE_SPECIAL = True
        PasswordPolicy.MIN_LENGTH = 16
        SessionSecurity.ACCESS_TOKEN_EXPIRE_MINUTES = 15
        SessionSecurity.AUTO_LOGOUT_INACTIVE_MINUTES = 15


# =============================================================================
# APPLY PRESET (UNCOMMENT TO USE)
# =============================================================================

# Uncomment ONE of these to apply a preset configuration:
# SecurityPresets.apply_development()  # For local development
# SecurityPresets.apply_production()   # For production deployment
# SecurityPresets.apply_high_security()  # For high security requirements

# Or keep the default settings defined above
