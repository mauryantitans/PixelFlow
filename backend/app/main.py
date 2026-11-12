import logging
import uvicorn
import re
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import settings
from .core.database import init_db
from .core.security_config import CORSSettings
from .api import api_router
from .utils.cleanup_scheduler import start_cleanup_scheduler, stop_cleanup_scheduler
from .utils.job_worker import start_job_worker, stop_job_worker
from .utils.monitoring import init_monitoring

# Optional Sentry (only when SENTRY_DSN is set); before the app is built so the
# FastAPI integration instruments it.
init_monitoring()
from .middleware import RateLimitMiddleware, SecurityHeadersMiddleware, CSRFMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown"""
    # Startup
    logger.info("Starting PixelFlow backend...")
    
    # Initialize database
    try:
        init_db()
        logger.info("Database initialized successfully")
        
        # Create first admin if needed
        from .core.database import SessionLocal
        from .utils.init_admin import create_first_admin_if_needed
        db = SessionLocal()
        try:
            create_first_admin_if_needed(db)
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
    
    # Start the periodic database cleanup (expired sessions, retention,
    # orphans, expired refresh tokens; honours the admin auto-cleanup switch)
    start_cleanup_scheduler()
    start_job_worker()
    
    logger.info("PixelFlow backend started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down PixelFlow backend...")
    
    # Stop background tasks
    await stop_cleanup_scheduler()
    stop_job_worker()
    
    logger.info("PixelFlow backend shutdown complete")

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="PixelFlow - Visual Image Processing Pipeline Builder",
    lifespan=lifespan
)

# Add CORS middleware
logger.info(f"Configuring CORS with {len(settings.CORS_ORIGINS)} allowed origins:")
for origin in settings.CORS_ORIGINS:
    logger.info(f"  ✓ {origin}")

if settings.CORS_ORIGIN_REGEX:
    logger.info(f"  ✓ Using regex pattern: {settings.CORS_ORIGIN_REGEX}")

# Add security middlewares
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CSRFMiddleware)

# CORS is added LAST so it is the outermost middleware (Starlette runs the
# most recently added first). That way early 403 (CSRF) and 429 (rate limit)
# responses still carry Access-Control-Allow-* headers; before, the browser
# hid them and the frontend only saw a generic network error.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS else None,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX if settings.CORS_ORIGIN_REGEX else None,
    allow_credentials=CORSSettings.ALLOW_CREDENTIALS,
    allow_methods=CORSSettings.ALLOW_METHODS,
    allow_headers=CORSSettings.ALLOW_HEADERS,
    expose_headers=CORSSettings.EXPOSE_HEADERS,
)

# Include API routes
app.include_router(api_router, prefix="/api")

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "message": str(exc) if settings.DEBUG else "An unexpected error occurred"
        }
    )

# Root endpoint
@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "message": "PixelFlow Backend API",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint with security status"""
    from .middleware.rate_limit import RateLimitMiddleware
    from .core.security_config import RateLimiting, LoginSecurity
    
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "security": {
            "rate_limiting": {
                "enabled": RateLimiting.ENABLED,
            },
            "login_security": {
                "max_attempts": LoginSecurity.MAX_ATTEMPTS,
                "lockout_minutes": int(LoginSecurity.LOCKOUT_DURATION.total_seconds() / 60)
            }
        }
    }

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )