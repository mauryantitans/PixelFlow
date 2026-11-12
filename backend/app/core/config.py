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

STORAGE_BACKENDS = ("database", "s3")


def _normalize_prefix(prefix: str) -> str:
    """Object-key prefix without a leading slash and with one trailing slash ('' allowed)."""
    prefix = prefix.strip().lstrip("/")
    return f"{prefix.rstrip('/')}/" if prefix else ""


def storage_config_errors(
    backend: str,
    bucket: str = "",
    access_key_id: str = "",
    secret_access_key: str = "",
    endpoint_url: str = "",
) -> list[str]:
    """Problems with the image-storage settings (empty when they are usable)."""
    if backend not in STORAGE_BACKENDS:
        return [f"STORAGE_BACKEND must be one of {', '.join(STORAGE_BACKENDS)} (got {backend!r})."]
    if backend != "s3":
        return []
    errors: list[str] = []
    if not bucket:
        errors.append("S3_BUCKET is required when STORAGE_BACKEND=s3.")
    if bool(access_key_id) != bool(secret_access_key):
        errors.append(
            "Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY (or neither, to use the "
            "AWS default credential chain)."
        )
    if endpoint_url and not endpoint_url.startswith(("http://", "https://")):
        errors.append("S3_ENDPOINT_URL must start with https:// (or http:// for local MinIO).")
    return errors


class Settings:
    # App settings
    APP_NAME: str = os.environ.get("APP_NAME", "PixelFlow")
    VERSION: str = os.environ.get("VERSION", "1.3.0")
    DEBUG: bool = os.environ.get("DEBUG", "False").lower() == "true"

    # File storage settings
    # NOTE: image bytes live in the database or in object storage (STORAGE_BACKEND
    # below); UPLOAD_DIR/PROCESSED_DIR remain for the session_manager's local
    # scratch dirs only.
    BASE_DIR: Path = Path(__file__).parent.parent.parent
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    PROCESSED_DIR: Path = BASE_DIR / "processed"
    
    # Image storage. "database" (default) keeps image bytes in the database rows;
    # "s3" puts them in a private S3-compatible bucket (AWS S3, Cloudflare R2,
    # MinIO) and keeps only the object key (and the small thumbnail) in the row.
    STORAGE_BACKEND: str = os.environ.get("STORAGE_BACKEND", "database").strip().lower() or "database"
    S3_BUCKET: str = os.environ.get("S3_BUCKET", "").strip()
    S3_REGION: str = os.environ.get("S3_REGION", "").strip()  # "auto" for Cloudflare R2
    S3_ENDPOINT_URL: str = os.environ.get("S3_ENDPOINT_URL", "").strip()  # R2 / MinIO
    S3_ACCESS_KEY_ID: str = os.environ.get("S3_ACCESS_KEY_ID", "").strip()
    S3_SECRET_ACCESS_KEY: str = os.environ.get("S3_SECRET_ACCESS_KEY", "").strip()
    S3_PREFIX: str = _normalize_prefix(os.environ.get("S3_PREFIX", "pixelflow/"))

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

        storage_errors = storage_config_errors(
            self.STORAGE_BACKEND,
            self.S3_BUCKET,
            self.S3_ACCESS_KEY_ID,
            self.S3_SECRET_ACCESS_KEY,
            self.S3_ENDPOINT_URL,
        )
        if storage_errors:
            _logger.critical(
                "FATAL: image storage is misconfigured: %s "
                "See deployment/ENVIRONMENT_VARIABLES.md (STORAGE_BACKEND, S3_*).",
                " ".join(storage_errors),
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
