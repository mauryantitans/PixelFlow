from pathlib import Path
import os
import sys
import logging
from typing import Optional
from dotenv import load_dotenv
from .security_config import SessionSecurity, CORSSettings, FileUploadSecurity

# Load environment variables from .env file
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

_DEFAULT_SECRET = "your-secret-key-change-in-production"

class Settings:
    # App settings
    APP_NAME: str = os.environ.get("APP_NAME", "PixelFlow")
    VERSION: str = os.environ.get("VERSION", "1.3.0")
    DEBUG: bool = os.environ.get("DEBUG", "False").lower() == "true"

    # File storage settings
    # NOTE: images are always stored in the database; UPLOAD_DIR/PROCESSED_DIR remain
    # for the session_manager's local scratch dirs only.
    BASE_DIR: Path = Path(__file__).parent.parent.parent
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    PROCESSED_DIR: Path = BASE_DIR / "processed"
    
    # Session settings
    SESSION_TIMEOUT: int = 30 * 60  # 30 minutes in seconds
    CLEANUP_INTERVAL: int = 5 * 60  # 5 minutes in seconds
    
    # Image processing settings
    MAX_FILE_SIZE: int = FileUploadSecurity.MAX_FILE_SIZE
    ALLOWED_EXTENSIONS: set = FileUploadSecurity.ALLOWED_EXTENSIONS
    THUMBNAIL_SIZE: tuple = (150, 150)
    
    # Server settings
    HOST: str = os.environ.get("HOST", "0.0.0.0")
    _port_env = os.environ.get("PORT", "8000").strip()
    PORT: int = int(_port_env) if _port_env else 8000
    
    # CORS Origins - read from environment variable or use defaults
    _env_origins = os.environ.get("ALLOWED_ORIGINS", "")
    CORS_ORIGINS: list = (
        [origin.strip() for origin in _env_origins.split(",") if origin.strip()]
        if _env_origins
        else CORSSettings.DEV_ORIGINS + CORSSettings.PROD_ORIGINS
    )
    
    # CORS Regex Pattern - for dynamic domains like Vercel preview deployments
    CORS_ORIGIN_REGEX: str = os.environ.get("ALLOWED_ORIGINS_REGEX", "")
    
    # SQLite fallback for development
    USE_SQLITE: bool = os.environ.get("USE_SQLITE", "False").lower() == "true"
    
    # Database settings
    if USE_SQLITE:
        SQLITE_PATH = BASE_DIR / "pixelflow.db"
        DATABASE_URL: str = f"sqlite:///{SQLITE_PATH}"
    else:
        DATABASE_URL: str = os.environ.get(
            "DATABASE_URL",
            "postgresql://postgres:postgres@localhost:5432/pixelflow"
        )
        # Fix for Render/Heroku postgres:// URLs
        if DATABASE_URL.startswith("postgres://"):
            DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    
    # Authentication settings
    SECRET_KEY: str = os.environ.get("SECRET_KEY", _DEFAULT_SECRET)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = SessionSecurity.ACCESS_TOKEN_EXPIRE_MINUTES
    REFRESH_TOKEN_EXPIRE_DAYS: int = SessionSecurity.REFRESH_TOKEN_EXPIRE_DAYS

    # Auth cookie settings (httpOnly cookie-based auth).
    # In production the frontend should be served same-origin with the API (e.g. a
    # Vercel rewrite proxying /api -> the backend) so cookies are first-party and
    # SameSite=Lax works in every browser. COOKIE_SAMESITE may be "lax", "strict",
    # or "none" (none requires Secure=True and a cross-site, third-party-cookie setup).
    # Secure defaults to on in production (DEBUG=False) and off in local dev.
    COOKIE_SECURE: bool = os.environ.get(
        "COOKIE_SECURE", "False" if DEBUG else "True"
    ).lower() == "true"
    COOKIE_SAMESITE: str = os.environ.get("COOKIE_SAMESITE", "lax").lower()
    COOKIE_DOMAIN: Optional[str] = os.environ.get("COOKIE_DOMAIN") or None

    # Google OAuth settings
    GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:3000/auth/google/callback")

    def __init__(self):
        # Create directories if they don't exist
        self.UPLOAD_DIR.mkdir(exist_ok=True)
        self.PROCESSED_DIR.mkdir(exist_ok=True)

        # ------------------------------------------------------------------
        # Startup validation — fail fast rather than run insecurely
        # ------------------------------------------------------------------
        _logger = logging.getLogger(__name__)
        is_production = not self.DEBUG

        if is_production and self.SECRET_KEY == _DEFAULT_SECRET:
            _logger.critical(
                "FATAL: SECRET_KEY is still the default insecure value. "
                "Set SECRET_KEY environment variable before running in production."
            )
            sys.exit(1)

        if is_production and not os.environ.get("ALLOWED_ORIGINS"):
            _logger.warning(
                "ALLOWED_ORIGINS is not set. CORS will allow all localhost origins. "
                "Set ALLOWED_ORIGINS to your production frontend URL."
            )

        if self.DATABASE_URL == "postgresql://postgres:postgres@localhost:5432/pixelflow" and is_production:
            _logger.warning(
                "DATABASE_URL appears to be the default local value. "
                "Make sure DATABASE_URL is correctly set for production."
            )

# Global settings instance
settings = Settings()
